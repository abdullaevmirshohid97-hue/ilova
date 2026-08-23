-- =============================================================
--  IMPORT ENDI TANNARXNI YOZADI
--
--  Muhim nuqta: import fayldan kelgan narxni `price` ga yozsa, har
--  yuklashda ustama YO'QOLADI — mijoz tannarxda ko'rib qoladi va biz
--  buni sezmasdan zararga sotamiz.
--
--  Endi fayldagi narx `base_price` ga tushadi, `price` esa qoidalar
--  bo'yicha qayta hisoblanadi (import oxirida, bir marta).
-- =============================================================

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
declare
  v_yangi      int := 0;
  v_yangilandi int := 0;
  v_partiya    int := 0;
  v_ochirildi  int := 0;
  v_narx       int := 0;
  v_import     text := coalesce(nullif(p_import_id, ''), gen_random_uuid()::text);
  r record;
  v_id    uuid;
  v_eski  numeric(16,2);
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  perform set_config('statement_timeout', '120s', true);

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
    -- Solishtirish TANNARX bo'yicha: narx tarixi ham tannarx tarixi
    select p.id, p.base_price into v_id, v_eski
    from dori_products p
    where (r.barcode is not null and p.barcode = r.barcode)
       or (r.barcode is null and p.barcode is null
           and p.name_norm = r.name_norm
           and coalesce(p.manufacturer, '') = coalesce(r.manufacturer, ''))
    limit 1;

    if v_id is null then
      insert into dori_products (barcode, name, name_norm, manufacturer, grp, unit,
                                 base_price, price, stock, made_at, last_import)
      values (r.barcode, r.name, r.name_norm, r.manufacturer, r.grp, r.unit,
              r.price, r.price, r.stock, r.made_at, v_import)
      returning id into v_id;
      v_yangi := v_yangi + 1;
    else
      update dori_products
         set name = r.name, name_norm = r.name_norm,
             manufacturer = coalesce(r.manufacturer, manufacturer),
             grp        = coalesce(r.grp, grp),
             unit       = coalesce(r.unit, unit),
             base_price = coalesce(r.price, base_price),
             stock      = r.stock,
             made_at    = coalesce(r.made_at, made_at),
             is_active   = true,
             last_import = v_import,
             last_seen   = now(),
             updated_at  = now()
       where id = v_id;

      if r.price is not null and r.price is distinct from v_eski then
        insert into dori_price_history (product_id, old_price, new_price, source)
        values (v_id, v_eski, r.price, p_source);
        v_yangilandi := v_yangilandi + 1;
      end if;
    end if;
  end loop;

  insert into dori_batches (product_id, series, expiry, made_at, qty, price, last_seen)
  select x.product_id, x.series, x.expiry, max(x.made_at), sum(x.qty), max(x.price), now()
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
  on conflict (product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'))
  do update set qty     = excluded.qty,
                price   = excluded.price,
                made_at = coalesce(excluded.made_at, dori_batches.made_at),
                last_seen = now();

  get diagnostics v_partiya = row_count;

  if p_finalize then
    update dori_products
       set is_active = false, updated_at = now()
     where is_active
       and (last_import is distinct from v_import);
    get diagnostics v_ochirildi = row_count;

    -- Sotuv narxlari qoidalar bo'yicha qayta hisoblanadi
    v_narx := dori_narx_hisobla(null);
  end if;

  return jsonb_build_object(
    'import_id', v_import,
    'yangi', v_yangi,
    'narx_yangilandi', v_yangilandi,
    'partiya', v_partiya,
    'sotuvdan_olindi', v_ochirildi,
    'sotuv_narxi_qayta', v_narx,
    'katalog_jami', (select count(*) from dori_products where is_active)
  );
end $$;

revoke all on function public.dori_catalog_apply(jsonb, text, text, boolean) from public, anon;
grant execute on function public.dori_catalog_apply(jsonb, text, text, boolean) to authenticated;
