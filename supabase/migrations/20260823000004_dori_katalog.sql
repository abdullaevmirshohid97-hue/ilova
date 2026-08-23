-- =============================================================
--  DORI KATALOGI — Exceldan bazaga (1-bosqich)
--
--  Manba: postavshchikning narxlar ro'yxati (9000+ qator). U vaqti-vaqti
--  bilan yangilanadi, shuning uchun import IDEMPOTENT bo'lishi shart:
--  ikki marta yuklansa ikki barobar dori paydo bo'lmasin.
--
--  TANISH KALITI — SHTRIX-KOD, nom emas. Nom fayldan faylga o'zgarib
--  turadi ("таб.№30" / "таб. №30" — bu ikki xil satr), shtrix-kod esa
--  o'zgarmaydi. Shtrix-kodi yo'q qator uchun zaxira kalit: nom +
--  ishlab chiqaruvchi (normalizatsiya qilingan holda).
--
--  RO'YXATDAN CHIQQAN DORI O'CHIRILMAYDI — `is_active = false` bo'ladi.
--  Sababi: uning eski buyurtmalari tarixda qoladi va o'chirilsa tarix
--  buziladi.
--
--  NARX TARIXI: har o'zgarish alohida yozuv. "Bu dori qachon qancha edi"
--  degan savol savdo tahlilida doim chiqadi, keyin qayta tiklab bo'lmaydi.
-- =============================================================

-- ---------- 1. Katalog ----------
create table if not exists public.dori_products (
  id           uuid primary key default gen_random_uuid(),
  barcode      text,
  name         text not null,
  name_norm    text not null,          -- solishtirish uchun tozalangan nom
  manufacturer text,
  grp          text,                   -- guruh/kategoriya (group — SQL kalit so'zi)
  unit         text,
  price        numeric(16,2),
  stock        numeric(16,3),
  is_active    boolean not null default true,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Shtrix-kod bor bo'lsa — u yagona kalit
create unique index if not exists dori_products_barcode_key
  on public.dori_products (barcode) where barcode is not null;

-- Shtrix-kodsizlar uchun zaxira kalit
create unique index if not exists dori_products_name_key
  on public.dori_products (name_norm, coalesce(manufacturer, '')) where barcode is null;

-- Tez qidiruv: 9000+ nom ichidan xato yozilgan so'zni ham topish uchun
create index if not exists dori_products_trgm_idx
  on public.dori_products using gin (name gin_trgm_ops);

create index if not exists dori_products_active_idx on public.dori_products (is_active, name);

alter table public.dori_products enable row level security;

drop policy if exists "dori_products: super_admin" on public.dori_products;
create policy "dori_products: super_admin"
  on public.dori_products for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 2. Partiyalar (seriya + muddat) ----------
-- Bitta dorining bir necha partiyasi bo'ladi, har biri o'z muddati bilan.
-- Faylda ham bir xil nom bir necha marta, har xil muddat bilan uchraydi.
create table if not exists public.dori_batches (
  id         bigserial primary key,
  product_id uuid not null references public.dori_products(id) on delete cascade,
  series     text,
  expiry     date,
  qty        numeric(16,3),
  price      numeric(16,2),
  last_seen  timestamptz not null default now()
);

-- UNIQUE cheklovi ichida ifoda ishlatib bo'lmaydi (faqat ustun nomlari),
-- shuning uchun yagonalik indeks orqali: seriya yoki muddat bo'sh bo'lsa ham
-- bitta partiya ikki marta yozilmasin
create unique index if not exists dori_batches_key
  on public.dori_batches (product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'));

create index if not exists dori_batches_expiry_idx on public.dori_batches (expiry);

alter table public.dori_batches enable row level security;

drop policy if exists "dori_batches: super_admin" on public.dori_batches;
create policy "dori_batches: super_admin"
  on public.dori_batches for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 3. Narx tarixi ----------
create table if not exists public.dori_price_history (
  id         bigserial primary key,
  product_id uuid not null references public.dori_products(id) on delete cascade,
  old_price  numeric(16,2),
  new_price  numeric(16,2),
  at         timestamptz not null default now(),
  source     text
);

create index if not exists dori_price_history_idx on public.dori_price_history (product_id, at desc);

alter table public.dori_price_history enable row level security;

drop policy if exists "dori_price_history: super_admin" on public.dori_price_history;
create policy "dori_price_history: super_admin"
  on public.dori_price_history for select to authenticated
  using (is_super_admin());

-- ---------- 4. Nomni normallashtirish ----------
-- "L-Цет таб.5мг№100" va "L-Цет таб. 5мг №100" — bir xil dori
create or replace function public.dori_norm(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_text, '')), '[^a-zа-яё0-9]+', '', 'g');
$$;

-- ---------- 5. Farqni ko'rsatish (yozmasdan) ----------
-- Tasdiqlashdan oldin: nechta yangi, nechta narx o'zgardi, nechtasi
-- ro'yxatdan chiqdi. Bazaga hech narsa yozilmaydi.
create or replace function public.dori_catalog_diff(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  with kirish as (
    select nullif(trim(e ->> 'barcode'), '')      as barcode,
           nullif(trim(e ->> 'name'), '')          as name,
           dori_norm(e ->> 'name')                 as name_norm,
           nullif(trim(e ->> 'manufacturer'), '')  as manufacturer,
           nullif(e ->> 'price', '')::numeric      as price
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where nullif(trim(e ->> 'name'), '') is not null
  ),
  -- Bir faylda bitta dori bir necha partiya bilan takrorlanadi:
  -- katalog uchun bittaga keltiramiz
  yagona as (
    select distinct on (coalesce(barcode, name_norm || coalesce(manufacturer, '')))
           barcode, name, name_norm, manufacturer, price
    from kirish
    order by coalesce(barcode, name_norm || coalesce(manufacturer, '')), price nulls last
  ),
  moslash as (
    select y.*, p.id as mavjud_id, p.price as eski_narx
    from yagona y
    left join dori_products p
      on (y.barcode is not null and p.barcode = y.barcode)
      or (y.barcode is null and p.barcode is null
          and p.name_norm = y.name_norm
          and coalesce(p.manufacturer, '') = coalesce(y.manufacturer, ''))
  )
  select jsonb_build_object(
    'jami',        (select count(*) from yagona),
    'yangi',       (select count(*) from moslash where mavjud_id is null),
    'narx_ozgardi',(select count(*) from moslash
                    where mavjud_id is not null and price is distinct from eski_narx),
    'ozgarmagan',  (select count(*) from moslash
                    where mavjud_id is not null and price is not distinct from eski_narx),
    'royxatdan_chiqdi', (
      select count(*) from dori_products p
      where p.is_active
        and not exists (
          select 1 from moslash m where m.mavjud_id = p.id
        )
    ),
    'narx_namuna', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select name, eski_narx, price as yangi_narx
        from moslash
        where mavjud_id is not null and price is distinct from eski_narx
        limit 10
      ) t
    ),
    'yangi_namuna', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select name, price from moslash where mavjud_id is null limit 10
      ) t
    )
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_catalog_diff(jsonb) from public, anon;
grant execute on function public.dori_catalog_diff(jsonb) to authenticated;

-- ---------- 6. Qo'llash ----------
create or replace function public.dori_catalog_apply(p_items jsonb, p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yangi    int := 0;
  v_yangilandi int := 0;
  v_partiya  int := 0;
  v_ochirildi int := 0;
  r record;
  v_id uuid;
  v_eski numeric(16,2);
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Bitta tranzaksiyada ikki marta chaqirilsa ham ishlasin
  drop table if exists _kirish;
  drop table if exists _tegilgan;

  create temp table _kirish on commit drop as
  select nullif(trim(e ->> 'barcode'), '')     as barcode,
         nullif(trim(e ->> 'name'), '')         as name,
         dori_norm(e ->> 'name')                as name_norm,
         nullif(trim(e ->> 'manufacturer'), '') as manufacturer,
         nullif(trim(e ->> 'group'), '')        as grp,
         nullif(trim(e ->> 'unit'), '')         as unit,
         nullif(e ->> 'price', '')::numeric     as price,
         nullif(e ->> 'stock', '')::numeric     as stock,
         nullif(trim(e ->> 'series'), '')       as series,
         nullif(e ->> 'expiry', '')::date       as expiry
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(trim(e ->> 'name'), '') is not null;

  create temp table _tegilgan (id uuid primary key) on commit drop;

  for r in
    select distinct on (coalesce(barcode, name_norm || coalesce(manufacturer, '')))
           * from _kirish
    order by coalesce(barcode, name_norm || coalesce(manufacturer, '')), price nulls last
  loop
    select p.id, p.price into v_id, v_eski
    from dori_products p
    where (r.barcode is not null and p.barcode = r.barcode)
       or (r.barcode is null and p.barcode is null
           and p.name_norm = r.name_norm
           and coalesce(p.manufacturer, '') = coalesce(r.manufacturer, ''))
    limit 1;

    if v_id is null then
      insert into dori_products (barcode, name, name_norm, manufacturer, grp, unit, price, stock)
      values (r.barcode, r.name, r.name_norm, r.manufacturer, r.grp, r.unit, r.price, r.stock)
      returning id into v_id;
      v_yangi := v_yangi + 1;
    else
      update dori_products
         set name = r.name, name_norm = r.name_norm,
             manufacturer = coalesce(r.manufacturer, manufacturer),
             grp = coalesce(r.grp, grp),
             unit = coalesce(r.unit, unit),
             price = coalesce(r.price, price),
             stock = r.stock,
             is_active = true,
             last_seen = now(),
             updated_at = now()
       where id = v_id;

      if r.price is not null and r.price is distinct from v_eski then
        insert into dori_price_history (product_id, old_price, new_price, source)
        values (v_id, v_eski, r.price, p_source);
        v_yangilandi := v_yangilandi + 1;
      end if;
    end if;

    insert into _tegilgan (id) values (v_id) on conflict do nothing;
  end loop;

  -- Partiyalar: bir dorining har bir seriya/muddati alohida yozuv
  insert into dori_batches (product_id, series, expiry, qty, price, last_seen)
  select p.id, k.series, k.expiry, k.stock, k.price, now()
  from _kirish k
  join dori_products p
    on (k.barcode is not null and p.barcode = k.barcode)
    or (k.barcode is null and p.barcode is null
        and p.name_norm = k.name_norm
        and coalesce(p.manufacturer, '') = coalesce(k.manufacturer, ''))
  where k.series is not null or k.expiry is not null
  on conflict (product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'))
  do update set qty = excluded.qty, price = excluded.price, last_seen = now();

  get diagnostics v_partiya = row_count;

  -- Ro'yxatdan chiqqanlar: o'chirilmaydi, sotuvdan olinadi
  update dori_products
     set is_active = false, updated_at = now()
   where is_active
     and id not in (select id from _tegilgan);
  get diagnostics v_ochirildi = row_count;

  return jsonb_build_object(
    'yangi', v_yangi,
    'narx_yangilandi', v_yangilandi,
    'partiya', v_partiya,
    'sotuvdan_olindi', v_ochirildi,
    'katalog_jami', (select count(*) from dori_products where is_active)
  );
end $$;

revoke all on function public.dori_catalog_apply(jsonb, text) from public, anon;
grant execute on function public.dori_catalog_apply(jsonb, text) to authenticated;

-- ---------- 7. Qidiruv ----------
-- Botda ham, Mini App'da ham shu ishlatiladi. Avval "boshlanadi",
-- keyin "ichida bor", oxirida o'xshashlik (xato yozilgan nom uchun).
create or replace function public.dori_search(p_q text, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_res jsonb;
begin
  if v_q is null or length(v_q) < 2 then
    return '[]'::jsonb;
  end if;

  -- MUHIM: similarity() emas, word_similarity(). similarity() butun satrni
  -- solishtiradi — "аспирн" so'rovi "Аспирин Кардио №20" kabi uzun nom bilan
  -- solishtirilganda ball juda past chiqadi va hech narsa topilmaydi.
  -- word_similarity() so'rovni nomning ENG MOS BO'LAGI bilan solishtiradi.
  perform set_config('pg_trgm.word_similarity_threshold', '0.45', true);

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.manufacturer, p.price, p.unit, p.grp,
           coalesce(p.stock, 0) as stock,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.expiry >= current_date) as eng_yaqin_muddat
    from dori_products p
    where p.is_active
      and (
        p.name ilike v_q || '%'
        or p.name ilike '%' || v_q || '%'
        -- tinish belgilari va bo'shliqlarsiz: "таб.№30" / "таб. №30"
        or p.name_norm like '%' || dori_norm(v_q) || '%'
        -- xato yozilgan nom
        or v_q <% p.name
      )
    order by
      (p.name ilike v_q || '%') desc,
      word_similarity(v_q, p.name) desc,
      p.name
    limit least(coalesce(p_limit, 20), 50)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_search(text, int) from public, anon;
grant execute on function public.dori_search(text, int) to authenticated, service_role;
