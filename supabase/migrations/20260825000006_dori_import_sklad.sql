-- =============================================================
--  SKLADLAR — 2-bosqich: yuklash va narx
--
--  IKKI TALAB SHU YERDA HAL BO'LADI.
--
--  1) "Kechagi praysni yuklasam ustiga yozilib ketmasin - eskisi
--     o'chib yangisi yozilsin."
--     Hozir yuklash faqat QO'SHIB borardi: fayldan chiqib ketgan
--     pozitsiya eski qoldiq va eski muddat bilan turaverardi.
--     Endi har yuklash o'z belgisini (import_key) qoldiradi va yakunda
--     SHU SKLADNING o'sha belgisiz qatorlari o'chiriladi. Boshqa
--     skladlarga tegilmaydi.
--
--  2) "Sklad narxi 100 000, ustiga 5% - mijozga 105 000 ko'rinsin."
--     Narx endi har sklad uchun alohida hisoblanadi. Ustama/chegirma
--     to'rt darajada, kuchi shu tartibda:
--         alohida dori  >  guruh  >  SKLAD  >  umumiy
--     Har darajada foizda ham, summada ham qo'yish mumkin.
--
--  MUHIM QOIDA: ustama va chegirma BITTA darajadan olinadi. Foizni
--  bir joydan, summani boshqasidan olsak, natijani hech kim oldindan
--  ayta olmasdi. Eng aniq daraja nimani aytsa - o'shasi ishlaydi.
-- =============================================================

-- ---------- 1. Yuklash belgisi ----------
alter table public.dori_imports
  add column if not exists import_key text;

create unique index if not exists dori_imports_key_uniq
  on public.dori_imports (import_key) where import_key is not null;

-- ---------- 2. Summali ustama/chegirma ----------
alter table public.dori_price_rules
  add column if not exists markup_sum   numeric(16,2),
  add column if not exists discount_sum numeric(16,2);

-- Narx tarixi endi sklad bilan: bir dori har skladda o'z narxida
alter table public.dori_price_history
  add column if not exists warehouse_id uuid references public.dori_warehouses(id) on delete set null;

-- ---------- 3. Sotuv narxini hisoblash ----------
-- Har bir taklif (sklad x dori) uchun tannarxdan sotuv narxi.
create or replace function public.dori_offer_narx(
  p_warehouse uuid default null,
  p_ids       uuid[] default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_n     int;
begin
  select rounding into v_round from dori_settings where id;
  v_round := coalesce(v_round, 0);

  with baza as (
    select o.warehouse_id, o.product_id, p.grp,
           coalesce(o.base_price, 0) as tannarx
    from dori_offers o
    join dori_products p on p.id = o.product_id
    where (p_warehouse is null or o.warehouse_id = p_warehouse)
      and (p_ids is null or o.product_id = any (p_ids))
  ),
  -- Ustama: eng aniq daraja qaysi bo'lsa, foiz va summa O'SHANDAN
  ustama as (
    select b.warehouse_id, b.product_id, b.tannarx,
           coalesce(m.pct, 0) as pct, coalesce(m.summa, 0) as summa
    from baza b
    left join lateral (
      select r.markup_pct as pct, r.markup_sum as summa
      from dori_price_rules r
      where r.is_active
        and (r.markup_pct is not null or r.markup_sum is not null)
        and ((r.scope = 'product' and r.target_key = b.product_id::text)
          or (r.scope = 'group'   and r.target_key = b.grp)
          or (r.scope = 'global'))
      order by case r.scope when 'product' then 1 when 'group' then 2 else 4 end
      limit 1
    ) rr on true
    -- Sklad darajasi qoidalar jadvalida emas, skladning O'ZIDA yashaydi:
    -- foydalanuvchi uni sklad kartochkasida kiritadi, ikki joyda
    -- saqlansa ular albatta bir-biridan uzilib ketardi
    left join lateral (
      select coalesce(rr.pct, w.markup_pct) as pct,
             coalesce(rr.summa, w.markup_sum) as summa
      from dori_warehouses w where w.id = b.warehouse_id
    ) m on true
  ),
  chegirma as (
    select u.*,
           coalesce(d.pct, 0) as dpct, coalesce(d.summa, 0) as dsumma
    from ustama u
    left join lateral (
      select r.discount_pct as pct, r.discount_sum as summa
      from dori_price_rules r
      where r.is_active
        and (r.discount_pct is not null or r.discount_sum is not null)
        and ((r.scope = 'product' and r.target_key = u.product_id::text)
          or (r.scope = 'global'))
      order by case r.scope when 'product' then 1 else 4 end
      limit 1
    ) rd on true
    left join lateral (
      select coalesce(rd.pct, w.discount_pct) as pct,
             coalesce(rd.summa, w.discount_sum) as summa
      from dori_warehouses w where w.id = u.warehouse_id
    ) d on true
  ),
  hisob as (
    select warehouse_id, product_id,
           greatest(
             case
               when v_round > 0 then
                 round(((tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma) / v_round) * v_round
               else
                 round((tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma)
             end,
             0
           ) as yangi
    from chegirma
  )
  update dori_offers o
     set price = h.yangi, updated_at = now()
    from hisob h
   where o.warehouse_id = h.warehouse_id
     and o.product_id   = h.product_id
     and o.price is distinct from h.yangi;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.dori_offer_narx(uuid, uuid[]) from public, anon;
grant execute on function public.dori_offer_narx(uuid, uuid[]) to authenticated, service_role;

-- ---------- 4. Katalogni takliflardan yig'ish ----------
-- dori_products.price - eng ARZON sklad narxi, stock - jami qoldiq.
-- Bot, Mini App, savat va faktura shu ustunlarni o'qiydi.
create or replace function public.dori_katalog_yigish(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with yig as (
    select p.id,
           (select min(o.price) from dori_offers o
             where o.product_id = p.id and o.price is not null
               and exists (select 1 from dori_warehouses w
                            where w.id = o.warehouse_id and w.is_active)) as narx,
           (select sum(coalesce(o.stock, 0)) from dori_offers o
             where o.product_id = p.id
               and exists (select 1 from dori_warehouses w
                            where w.id = o.warehouse_id and w.is_active)) as qoldiq,
           (select min(o.base_price) from dori_offers o
             where o.product_id = p.id and o.base_price is not null) as tannarx,
           exists (select 1 from dori_offers o where o.product_id = p.id) as taklif_bor
    from dori_products p
    where p_ids is null or p.id = any (p_ids)
  )
  update dori_products p
     set price      = y.narx,
         base_price = y.tannarx,
         stock      = y.qoldiq,
         -- Hech bir skladda qolmagan dori sotuvdan chiqadi, lekin
         -- o'chirilmaydi: eski buyurtmalar va fakturalar unga bog'langan
         is_active  = y.taklif_bor,
         updated_at = now()
    from yig y
   where p.id = y.id
     and (p.price      is distinct from y.narx
       or p.base_price is distinct from y.tannarx
       or p.stock      is distinct from y.qoldiq
       or p.is_active  is distinct from y.taklif_bor);

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.dori_katalog_yigish(uuid[]) from public, anon;
grant execute on function public.dori_katalog_yigish(uuid[]) to authenticated, service_role;

-- ---------- 5. Eski nomdagi chaqiruv ----------
-- NarxlarPaneli va qoida qo'yish RPC'lari shu nomni chaqiradi: avval
-- takliflar, keyin katalog qayta hisoblanadi.
create or replace function public.dori_narx_hisobla(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  v_n := dori_offer_narx(null, p_ids);
  perform dori_katalog_yigish(p_ids);
  return v_n;
end $$;

revoke all on function public.dori_narx_hisobla(uuid[]) from public, anon;
grant execute on function public.dori_narx_hisobla(uuid[]) to authenticated;

-- ---------- 6. Yuklash ----------
create or replace function public.dori_import_apply(
  p_warehouse_id uuid,
  p_items        jsonb,
  p_source       text default null,
  p_import_id    text default null,
  p_finalize     boolean default true,
  p_file_name    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yangi      int := 0;
  v_yangilandi int := 0;
  v_partiya    int := 0;
  v_ochirildi  int := 0;
  v_batch_och  int := 0;
  v_narx       int := 0;
  v_wh         uuid := coalesce(p_warehouse_id, dori_asosiy_sklad());
  v_import     text := coalesce(nullif(p_import_id, ''), gen_random_uuid()::text);
  v_natija     jsonb;
  r record;
  v_id    uuid;
  v_eski  numeric(16,2);
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  if v_wh is null then
    raise exception 'SKLAD_KORSATILMAGAN';
  end if;
  if not exists (select 1 from dori_warehouses where id = v_wh) then
    raise exception 'SKLAD_TOPILMADI';
  end if;

  perform set_config('statement_timeout', '120s', true);

  -- Yuklash yozuvi: bo'laklab yuborilganda birinchi bo'lakda ochiladi
  insert into dori_imports (warehouse_id, import_key, file_name, source, created_by)
  values (v_wh, v_import, p_file_name, p_source, auth.uid())
  on conflict (import_key) do nothing;

  drop table if exists _kirish;

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
         nullif(e ->> 'expiry', '')::date       as expiry,
         nullif(e ->> 'made_at', '')::date      as made_at
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(trim(e ->> 'name'), '') is not null;

  for r in
    select distinct on (coalesce(barcode, name_norm || coalesce(manufacturer, '')))
           * from _kirish
    order by coalesce(barcode, name_norm || coalesce(manufacturer, '')), price nulls last
  loop
    -- Dori kartochkasi GLOBAL: nom, ishlab chiqaruvchi, guruh.
    -- Narx va qoldiq bu yerda emas - ular skladga tegishli.
    select p.id into v_id
    from dori_products p
    where (r.barcode is not null and p.barcode = r.barcode)
       or (r.barcode is null and p.barcode is null
           and p.name_norm = r.name_norm
           and coalesce(p.manufacturer, '') = coalesce(r.manufacturer, ''))
    limit 1;

    if v_id is null then
      insert into dori_products (barcode, name, name_norm, manufacturer, grp, unit,
                                 made_at, last_import, is_active)
      values (r.barcode, r.name, r.name_norm, r.manufacturer, r.grp, r.unit,
              r.made_at, v_import, true)
      returning id into v_id;
      v_yangi := v_yangi + 1;
    else
      update dori_products
         set name = r.name, name_norm = r.name_norm,
             manufacturer = coalesce(r.manufacturer, manufacturer),
             grp        = coalesce(r.grp, grp),
             unit       = coalesce(r.unit, unit),
             made_at    = coalesce(r.made_at, made_at),
             is_active   = true,
             last_import = v_import,
             last_seen   = now(),
             updated_at  = now()
       where id = v_id;
    end if;

    -- Skladdagi taklif
    select o.base_price into v_eski
    from dori_offers o where o.warehouse_id = v_wh and o.product_id = v_id;

    insert into dori_offers (warehouse_id, product_id, base_price, stock, last_import, updated_at)
    values (v_wh, v_id, r.price, r.stock, v_import, now())
    on conflict (warehouse_id, product_id) do update
      set base_price  = coalesce(excluded.base_price, dori_offers.base_price),
          stock       = excluded.stock,
          last_import = excluded.last_import,
          updated_at  = now();

    if r.price is not null and r.price is distinct from v_eski then
      insert into dori_price_history (product_id, warehouse_id, old_price, new_price, source)
      values (v_id, v_wh, v_eski, r.price, p_source);
      v_yangilandi := v_yangilandi + 1;
    end if;
  end loop;

  insert into dori_batches (warehouse_id, product_id, series, expiry, made_at, qty, price,
                            last_import, last_seen)
  select v_wh, x.product_id, x.series, x.expiry, max(x.made_at), sum(x.qty), max(x.price),
         v_import, now()
  from (
    select p.id as product_id, k.series, k.expiry, k.made_at, k.stock as qty, k.price
    from _kirish k
    join dori_products p
      on (k.barcode is not null and p.barcode = k.barcode)
      or (k.barcode is null and p.barcode is null
          and p.name_norm = k.name_norm
          and coalesce(p.manufacturer, '') = coalesce(k.manufacturer, ''))
    where k.series is not null or k.expiry is not null or k.made_at is not null
  ) x
  group by x.product_id, x.series, x.expiry
  on conflict (warehouse_id, product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'))
  do update set qty         = excluded.qty,
                price       = excluded.price,
                made_at     = coalesce(excluded.made_at, dori_batches.made_at),
                last_import = excluded.last_import,
                last_seen   = now();

  get diagnostics v_partiya = row_count;

  if p_finalize then
    -- ESKISI O'CHADI: shu yuklashda kelmagan qatorlar - fayldan chiqib
    -- ketgan pozitsiyalar. Boshqa skladlarga tegilmaydi.
    delete from dori_offers
     where warehouse_id = v_wh
       and last_import is distinct from v_import;
    get diagnostics v_ochirildi = row_count;

    delete from dori_batches
     where warehouse_id = v_wh
       and last_import is distinct from v_import;
    get diagnostics v_batch_och = row_count;

    v_narx := dori_offer_narx(v_wh, null);
    perform dori_katalog_yigish(null);
  end if;

  v_natija := jsonb_build_object(
    'import_id', v_import,
    'sklad', v_wh,
    'yangi', v_yangi,
    'narx_yangilandi', v_yangilandi,
    'partiya', v_partiya,
    'sotuvdan_olindi', v_ochirildi,
    'partiya_ochirildi', v_batch_och,
    'sotuv_narxi_qayta', v_narx,
    'sklad_jami', (select count(*) from dori_offers where warehouse_id = v_wh),
    'katalog_jami', (select count(*) from dori_products where is_active)
  );

  if p_finalize then
    update dori_imports
       set status = 'done', finished_at = now(), natija = v_natija,
           rows_total = coalesce(rows_total, 0) + (select count(*) from _kirish)
     where import_key = v_import;
  else
    update dori_imports
       set rows_total = coalesce(rows_total, 0) + (select count(*) from _kirish)
     where import_key = v_import;
  end if;

  return v_natija;
end $$;

revoke all on function public.dori_import_apply(uuid, jsonb, text, text, boolean, text) from public, anon;
grant execute on function public.dori_import_apply(uuid, jsonb, text, text, boolean, text) to authenticated;

-- ---------- 7. Eski chaqiruv ----------
-- DoriModuli hozircha skladsiz chaqiradi - asosiy skladga tushadi.
create or replace function public.dori_catalog_apply(
  p_items     jsonb,
  p_source    text default null,
  p_import_id text default null,
  p_finalize  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
  begin
    return dori_import_apply(dori_asosiy_sklad(), p_items, p_source, p_import_id, p_finalize, p_source);
  end $$;

revoke all on function public.dori_catalog_apply(jsonb, text, text, boolean) from public, anon;
grant execute on function public.dori_catalog_apply(jsonb, text, text, boolean) to authenticated;
