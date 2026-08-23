-- =============================================================
--  KATALOG IMPORTI — bo'laklab yuborish
--
--  Muammo: 9734 qatorni bitta chaqiruvda yozish `authenticated` roli
--  uchun belgilangan so'rov vaqti chegarasidan oshadi va import yarim
--  yo'lda uzilib qoladi. Bunday paytda ma'lumot qisman yozilib, qaysi
--  qism yozilganini bilib bo'lmay qoladi — eng yomon holat.
--
--  Yechim: mijoz tomoni ro'yxatni 500 qatorlik bo'laklarga bo'lib
--  yuboradi. Har bo'lak o'z tranzaksiyasida yoziladi va foydalanuvchi
--  jarayonni ko'rib turadi.
--
--  Shunda "ro'yxatdan chiqqanlarni sotuvdan olish" qadami muammoga
--  aylanadi: har bo'lakdan keyin bajarilsa, hali yuborilmagan qatorlar
--  "yo'q" deb hisoblanib, butun katalog o'chib ketardi. Shuning uchun
--  har import o'z belgisiga (`p_import_id`) ega: qaysi dorilar shu
--  importda uchraganini shu belgi ko'rsatadi va sotuvdan olish faqat
--  ENG OXIRIDA (`p_finalize = true`) bajariladi.
-- =============================================================

alter table public.dori_products
  add column if not exists last_import text;

create index if not exists dori_products_last_import_idx
  on public.dori_products (last_import);

drop function if exists public.dori_catalog_apply(jsonb, text);

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
  v_import     text := coalesce(nullif(p_import_id, ''), gen_random_uuid()::text);
  r record;
  v_id    uuid;
  v_eski  numeric(16,2);
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Bo'lak katta bo'lsa ham yetib borsin (bo'lak ~500 qator)
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
         nullif(e ->> 'expiry', '')::date       as expiry
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(trim(e ->> 'name'), '') is not null;

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
      insert into dori_products (barcode, name, name_norm, manufacturer, grp, unit,
                                 price, stock, last_import)
      values (r.barcode, r.name, r.name_norm, r.manufacturer, r.grp, r.unit,
              r.price, r.stock, v_import)
      returning id into v_id;
      v_yangi := v_yangi + 1;
    else
      update dori_products
         set name = r.name, name_norm = r.name_norm,
             manufacturer = coalesce(r.manufacturer, manufacturer),
             grp   = coalesce(r.grp, grp),
             unit  = coalesce(r.unit, unit),
             price = coalesce(r.price, price),
             stock = r.stock,
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

  -- Faqat oxirgi bo'lakdan keyin: shu importda uchramagan dorilar
  -- sotuvdan olinadi (o'chirilmaydi — eski buyurtmalar tarixi qoladi)
  if p_finalize then
    update dori_products
       set is_active = false, updated_at = now()
     where is_active
       and (last_import is distinct from v_import);
    get diagnostics v_ochirildi = row_count;
  end if;

  return jsonb_build_object(
    'import_id', v_import,
    'yangi', v_yangi,
    'narx_yangilandi', v_yangilandi,
    'partiya', v_partiya,
    'sotuvdan_olindi', v_ochirildi,
    'katalog_jami', (select count(*) from dori_products where is_active)
  );
end $$;

revoke all on function public.dori_catalog_apply(jsonb, text, text, boolean) from public, anon;
grant execute on function public.dori_catalog_apply(jsonb, text, text, boolean) to authenticated;
