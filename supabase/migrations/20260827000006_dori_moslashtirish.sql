-- =============================================================
--  DORILARNI SKLADLAR ORASIDA MOSLASHTIRISH
--
--  Hozirgi holat: 9190 dori, ularning 0 tasi ikkala skladda ham bor.
--  Ya'ni narx solishtirilmaydi va buyurtma hech qachon bo'linmaydi -
--  sklad tizimining butun ma'nosi yo'qoladi.
--
--  O'lchandi (dori_kalit bo'yicha):
--      598 ta - kaliti VA ishlab chiqaruvchisi mos  -> xavfsiz
--      236 ta - faqat kaliti mos                    -> odam hal qiladi
--     1445 ta - mos kelmadi                         -> haqiqatan yangi
--
--  QOIDA: pul bilan bog'liq qarorni robot yolg'iz qabul qilmaydi.
--   * ishlab chiqaruvchisi ham mos bo'lsa - avtomatik bog'lanadi
--   * faqat nomi mos bo'lsa - NAVBATGA tushadi, panelda tasdiqlanadi
--   * bir marta tasdiqlangan juftlik dori_aliases ga yoziladi va
--     keyingi yuklashlarda o'zi ishlaydi
--
--  Birlashtirish QAYTMAS amal, shuning uchun: avval nomzod, keyin
--  tasdiq, hammasi jurnalda.
-- =============================================================

-- ---------- 1. Ishlab chiqaruvchi kaliti ----------
-- "Ирбитский ХФЗ/Россия" va "\"Ирбит\" Россия/Узбекистан" - matn sifatida
-- boshqacha. Mamlakatdan oldingi qismi olinadi va lotinga o'tkaziladi.
create or replace function public.dori_ich_kalit(p_text text)
returns text
language sql
immutable
as $$
  select public.dori_lat(split_part(coalesce(p_text, ''), '/', 1));
$$;

-- ---------- 2. Tasdiqlangan bog'lanishlar ----------
create table if not exists public.dori_aliases (
  id               bigserial primary key,
  kalit            text not null,
  manufacturer_key text,                 -- null = ishlab chiqaruvchidan qat'i nazar
  product_id       uuid not null references public.dori_products(id) on delete cascade,
  source           text not null default 'qol' check (source in ('auto', 'qol')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create unique index if not exists dori_aliases_key
  on public.dori_aliases (kalit, coalesce(manufacturer_key, ''));

create index if not exists dori_aliases_product_idx
  on public.dori_aliases (product_id);

alter table public.dori_aliases enable row level security;

drop policy if exists "dori_aliases: super_admin" on public.dori_aliases;
create policy "dori_aliases: super_admin"
  on public.dori_aliases for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 3. Tasdiqlash navbati ----------
create table if not exists public.dori_moslik_navbat (
  id          bigserial primary key,
  product_id  uuid not null references public.dori_products(id) on delete cascade,
  nomzod_id   uuid not null references public.dori_products(id) on delete cascade,
  kalit       text,
  oxshashlik  numeric(4,3),
  holat       text not null default 'kutilmoqda'
              check (holat in ('kutilmoqda', 'tasdiqlandi', 'rad_etildi')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id) on delete set null,
  check (product_id <> nomzod_id)
);

create unique index if not exists dori_moslik_navbat_key
  on public.dori_moslik_navbat (product_id, nomzod_id);

create index if not exists dori_moslik_navbat_holat_idx
  on public.dori_moslik_navbat (holat, created_at);

alter table public.dori_moslik_navbat enable row level security;

drop policy if exists "dori_moslik: super_admin" on public.dori_moslik_navbat;
create policy "dori_moslik: super_admin"
  on public.dori_moslik_navbat for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 4. Birlashtirish ----------
-- Dublikat dori asosiysiga qo'shiladi: takliflar, partiyalar, savat va
-- tarix ko'chiriladi, so'ng dublikat o'chadi.
--
-- Buyurtma va faktura qatorlarida nom va narx O'Z NUSXASI bilan yozilgan
-- (muzlatilgan), shuning uchun ko'chirish eski hujjatlarni o'zgartirmaydi -
-- faqat bog'lanish tuzatiladi.
create or replace function public.dori_birlashtir(p_asosiy uuid, p_dublikat uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taklif  int := 0;
  v_partiya int := 0;
  v_nom     text;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_asosiy = p_dublikat then
    raise exception 'BIR_XIL_DORI';
  end if;
  if not exists (select 1 from dori_products where id = p_asosiy) then
    raise exception 'ASOSIY_TOPILMADI';
  end if;

  select name into v_nom from dori_products where id = p_dublikat;
  if v_nom is null then
    raise exception 'DUBLIKAT_TOPILMADI';
  end if;

  -- Takliflar: bir xil skladda ikkalasi ham bo'lsa ARZONI qoladi
  insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import, updated_at)
  select d.warehouse_id, p_asosiy, d.base_price, d.price, d.stock, d.last_import, now()
  from dori_offers d
  where d.product_id = p_dublikat
  on conflict (warehouse_id, product_id) do update
    set base_price = least(dori_offers.base_price, excluded.base_price),
        price      = least(dori_offers.price, excluded.price),
        -- Qoldiq: ikkalasi ham ma'lum bo'lsa qo'shiladi, biri noma'lum
        -- bo'lsa natija ham noma'lum bo'lib qoladi (yolg'on aniqlik
        -- yaratmaymiz)
        stock      = case
                       when dori_offers.stock is null or excluded.stock is null then null
                       else dori_offers.stock + excluded.stock
                     end,
        updated_at = now();
  get diagnostics v_taklif = row_count;

  insert into dori_batches (warehouse_id, product_id, series, expiry, made_at, qty, price, last_import, last_seen)
  select b.warehouse_id, p_asosiy, b.series, b.expiry, b.made_at, b.qty, b.price, b.last_import, now()
  from dori_batches b
  where b.product_id = p_dublikat
  on conflict (warehouse_id, product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'))
  do update set qty = coalesce(dori_batches.qty, 0) + coalesce(excluded.qty, 0),
                last_seen = now();
  get diagnostics v_partiya = row_count;

  -- Savat: ikkalasi ham bo'lsa miqdorlar qo'shiladi
  insert into dori_cart (chat_id, product_id, qty)
  select c.chat_id, p_asosiy, c.qty from dori_cart c where c.product_id = p_dublikat
  on conflict (chat_id, product_id) do update set qty = dori_cart.qty + excluded.qty;

  update dori_order_items set product_id = p_asosiy where product_id = p_dublikat;
  update dori_split_items set product_id = p_asosiy where product_id = p_dublikat;
  update dori_price_history set product_id = p_asosiy where product_id = p_dublikat;
  update dori_aliases     set product_id = p_asosiy where product_id = p_dublikat;

  -- Dublikatga qo'yilgan alohida narx qoidasi asosiysiga ko'chmaydi:
  -- u boshqa nomga qo'yilgan edi, ko'r-ko'rona ko'chirish narxni
  -- kutilmaganda o'zgartirardi
  delete from dori_price_rules where scope = 'product' and target_key = p_dublikat::text;

  delete from dori_moslik_navbat where product_id = p_dublikat or nomzod_id = p_dublikat;
  delete from dori_products where id = p_dublikat;

  perform dori_offer_narx(null, array[p_asosiy]);
  perform dori_katalog_yigish(array[p_asosiy]);

  return jsonb_build_object('ok', true, 'taklif', v_taklif, 'partiya', v_partiya, 'ochirildi', v_nom);
end $$;

revoke all on function public.dori_birlashtir(uuid, uuid) from public, anon;
grant execute on function public.dori_birlashtir(uuid, uuid) to authenticated;

-- ---------- 5. Nomzodlarni yig'ish ----------
-- Bir skladda turgan dorilar orasidan kaliti bir xillarini topadi.
create or replace function public.dori_nomzod_yig(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto int := 0;
  v_navbat int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  perform set_config('statement_timeout', '180s', true);

  create temp table _juft on commit drop as
  with dori as (
    select p.id, p.name, p.manufacturer,
           dori_kalit(p.name)          as kalit,
           dori_ich_kalit(p.manufacturer) as ich,
           (select min(o.warehouse_id::text) from dori_offers o where o.product_id = p.id) as sklad
    from dori_products p
    where p.is_active
  )
  select a.id as asosiy_id, b.id as dublikat_id, a.kalit,
         (a.ich = b.ich) as ich_mos
  from dori a
  join dori b
    on b.kalit = a.kalit
   and b.id <> a.id
   and b.sklad is distinct from a.sklad   -- boshqa skladdagilar
   and a.id < b.id                         -- har juftlik bir marta
  where a.kalit is not null and a.kalit <> '||'
    and not exists (
      select 1 from dori_moslik_navbat n
      where (n.product_id = a.id and n.nomzod_id = b.id)
         or (n.product_id = b.id and n.nomzod_id = a.id)
    )
  limit greatest(coalesce(p_limit, 500), 1);

  -- Ishlab chiqaruvchisi ham mos bo'lsa - to'g'ridan-to'g'ri birlashadi
  select count(*) into v_auto from _juft where ich_mos;

  -- Faqat nomi mos - navbatga
  insert into dori_moslik_navbat (product_id, nomzod_id, kalit, oxshashlik)
  select dublikat_id, asosiy_id, kalit, 0.900
  from _juft where not ich_mos
  on conflict do nothing;
  get diagnostics v_navbat = row_count;

  return jsonb_build_object(
    'ok', true,
    'avtomatik_nomzod', v_auto,
    'navbatga', v_navbat
  );
end $$;

revoke all on function public.dori_nomzod_yig(int) from public, anon;
grant execute on function public.dori_nomzod_yig(int) to authenticated;

-- ---------- 6. Navbatni o'qish ----------
create or replace function public.dori_moslik_royxat(p_limit int default 40, p_offset int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
    'jami', (select count(*) from dori_moslik_navbat where holat = 'kutilmoqda'),
    'items', coalesce((
      select jsonb_agg(t) from (
        select n.id, n.kalit, n.oxshashlik,
               jsonb_build_object(
                 'id', d.id, 'name', d.name, 'manufacturer', d.manufacturer,
                 'price', d.price, 'base_price', d.base_price,
                 'sklad', (select string_agg(w.name, ', ') from dori_offers o
                            join dori_warehouses w on w.id = o.warehouse_id
                            where o.product_id = d.id)
               ) as yangi,
               jsonb_build_object(
                 'id', a.id, 'name', a.name, 'manufacturer', a.manufacturer,
                 'price', a.price, 'base_price', a.base_price,
                 'sklad', (select string_agg(w.name, ', ') from dori_offers o
                            join dori_warehouses w on w.id = o.warehouse_id
                            where o.product_id = a.id)
               ) as mavjud
        from dori_moslik_navbat n
        join dori_products d on d.id = n.product_id
        join dori_products a on a.id = n.nomzod_id
        where n.holat = 'kutilmoqda'
        order by n.oxshashlik desc, d.name
        offset greatest(coalesce(p_offset, 0), 0)
        limit least(coalesce(p_limit, 40), 100)
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

revoke all on function public.dori_moslik_royxat(int, int) from public, anon;
grant execute on function public.dori_moslik_royxat(int, int) to authenticated;

-- ---------- 7. Qaror ----------
create or replace function public.dori_moslik_qaror(p_id bigint, p_tasdiq boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_res  jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into r from dori_moslik_navbat where id = p_id and holat = 'kutilmoqda';
  if r.id is null then
    raise exception 'NAVBAT_TOPILMADI';
  end if;

  if not p_tasdiq then
    update dori_moslik_navbat
       set holat = 'rad_etildi', decided_at = now(), decided_by = auth.uid()
     where id = p_id;
    return jsonb_build_object('ok', true, 'holat', 'rad_etildi');
  end if;

  -- Tasdiqlandi: kelgusi yuklashlar uchun bog'lanish yozib qo'yiladi,
  -- so'ng dublikat asosiysiga qo'shiladi
  insert into dori_aliases (kalit, manufacturer_key, product_id, source, created_by)
  select dori_kalit(d.name), dori_ich_kalit(d.manufacturer), r.nomzod_id, 'qol', auth.uid()
  from dori_products d where d.id = r.product_id
  on conflict (kalit, coalesce(manufacturer_key, '')) do update
    set product_id = excluded.product_id;

  v_res := dori_birlashtir(r.nomzod_id, r.product_id);

  -- Navbat qatori birlashtirishda o'chib ketadi (dublikat o'chgani uchun),
  -- shuning uchun natija shu yerda qaytariladi
  return jsonb_build_object('ok', true, 'holat', 'tasdiqlandi', 'natija', v_res);
end $$;

revoke all on function public.dori_moslik_qaror(bigint, boolean) from public, anon;
grant execute on function public.dori_moslik_qaror(bigint, boolean) to authenticated;
