-- =============================================================
--  YUKLASH YOZUVI: ON CONFLICT qisman indeks bilan
--
--  dori_imports.import_key indeksi QISMAN (where import_key is not
--  null). Postgres bunday indeksni ON CONFLICT uchun tanlashi uchun
--  shartning o'zi ham ko'rsatilishi shart, aks holda
--  "no unique or exclusion constraint matching" xatosi chiqadi.
-- =============================================================

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
  on conflict (import_key) where import_key is not null do nothing;

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
