-- =============================================================
--  YUKLASH ENDI DORINI TANIYDI
--
--  Ilgari moslashtirish sharti shunday edi:
--      shtrix-kod bo'yicha, YOKI (nom + ishlab chiqaruvchi) - lekin
--      faqat IKKALASIDA HAM shtrix-kod bo'lmaganda.
--
--  Amalda: Asosiy sklad praysida hamma dorining shtrix-kodi bor,
--  sadaf fayz praysida bittasida ham yo'q. Shuning uchun ikkinchi
--  shart hech qachon bajarilmasdi va 2279 ta yangi dori yaratildi.
--
--  Endi tartib (ishonchdan boshlab):
--     1. shtrix-kod                       - eng ishonchli
--     2. tasdiqlangan bog'lanish (alias)  - odam bir marta hal qilgan
--     3. kalit + ishlab chiqaruvchi       - avtomatik ishonch
--     4. nom + ishlab chiqaruvchi (aynan) - eski usul, shtrix-kodsiz ham
--     5. topilmasa - yangi dori + NAVBATGA nomzod
--
--  4-band endi shtrix-kod bor-yo'qligiga qaramaydi: shtrix-kodsiz qator
--  shtrix-kodli doriga ulanaveradi.
--
--  5-band muhim: robot o'zi birlashtirmaydi, faqat "shu ikkisi bir
--  xilmi?" deb so'raydi. Pul bilan bog'liq qarorni odam qabul qiladi.
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
  v_navbat     int := 0;
  v_wh         uuid := coalesce(p_warehouse_id, dori_asosiy_sklad());
  v_import     text := coalesce(nullif(p_import_id, ''), gen_random_uuid()::text);
  v_natija     jsonb;
  r record;
  v_id     uuid;
  v_eski   numeric(16,2);
  v_kalit  text;
  v_ich    text;
  v_nomzod uuid;
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

  perform set_config('statement_timeout', '180s', true);

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
    v_id     := null;
    v_nomzod := null;
    v_kalit  := dori_kalit(r.name);
    v_ich    := dori_ich_kalit(r.manufacturer);

    -- 1) Shtrix-kod
    if r.barcode is not null then
      select p.id into v_id from dori_products p where p.barcode = r.barcode limit 1;
    end if;

    -- 2) Tasdiqlangan bog'lanish
    if v_id is null then
      select a.product_id into v_id
      from dori_aliases a
      where a.kalit = v_kalit
        and (a.manufacturer_key = v_ich or a.manufacturer_key is null)
      order by (a.manufacturer_key is not null) desc
      limit 1;
      -- Bog'lanish eskirgan bo'lishi mumkin (dori o'chirilgan)
      if v_id is not null and not exists (select 1 from dori_products where id = v_id) then
        v_id := null;
      end if;
    end if;

    -- 3) Kalit + ishlab chiqaruvchi
    if v_id is null and v_ich <> '' then
      select p.id into v_id
      from dori_products p
      where dori_kalit(p.name) = v_kalit
        and dori_ich_kalit(p.manufacturer) = v_ich
      limit 1;
    end if;

    -- 4) Nom + ishlab chiqaruvchi (aynan). Shtrix-kod sharti YO'Q.
    if v_id is null then
      select p.id into v_id
      from dori_products p
      where p.name_norm = r.name_norm
        and coalesce(p.manufacturer, '') = coalesce(r.manufacturer, '')
      limit 1;
    end if;

    -- 5) Topilmadi: kalit bo'yicha nomzod bormi?
    if v_id is null and v_kalit is not null and v_kalit <> '||' then
      select p.id into v_nomzod
      from dori_products p
      where dori_kalit(p.name) = v_kalit and p.is_active
      limit 1;
    end if;

    if v_id is null then
      insert into dori_products (barcode, name, name_norm, manufacturer, grp, unit,
                                 made_at, last_import, is_active)
      values (r.barcode, r.name, r.name_norm, r.manufacturer, r.grp, r.unit,
              r.made_at, v_import, true)
      returning id into v_id;
      v_yangi := v_yangi + 1;

      -- Nomzod topilgan bo'lsa - odam hal qilsin
      if v_nomzod is not null then
        insert into dori_moslik_navbat (product_id, nomzod_id, kalit, oxshashlik)
        values (v_id, v_nomzod, v_kalit, 0.900)
        on conflict do nothing;
        v_navbat := v_navbat + 1;
      end if;
    else
      update dori_products
         set name = case when barcode is null and r.barcode is not null then r.name else name end,
             barcode      = coalesce(barcode, r.barcode),
             manufacturer = coalesce(manufacturer, r.manufacturer),
             grp          = coalesce(r.grp, grp),
             unit         = coalesce(r.unit, unit),
             made_at      = coalesce(r.made_at, made_at),
             is_active    = true,
             last_import  = v_import,
             last_seen    = now(),
             updated_at   = now()
       where id = v_id;
    end if;

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
  select v_wh, o.product_id, x.series, x.expiry, max(x.made_at), sum(x.qty), max(x.price),
         v_import, now()
  from (
    select k.name_norm, k.barcode, k.manufacturer, k.series, k.expiry, k.made_at,
           k.stock as qty, k.price
    from _kirish k
    where k.series is not null or k.expiry is not null or k.made_at is not null
  ) x
  join lateral (
    select o2.product_id
    from dori_offers o2
    join dori_products p on p.id = o2.product_id
    where o2.warehouse_id = v_wh and o2.last_import = v_import
      and (p.name_norm = x.name_norm
        or (x.barcode is not null and p.barcode = x.barcode))
    limit 1
  ) o on true
  group by o.product_id, x.series, x.expiry
  on conflict (warehouse_id, product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'))
  do update set qty         = excluded.qty,
                price       = excluded.price,
                made_at     = coalesce(excluded.made_at, dori_batches.made_at),
                last_import = excluded.last_import,
                last_seen   = now();

  get diagnostics v_partiya = row_count;

  if p_finalize then
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
    'tasdiq_kutmoqda', v_navbat,
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
