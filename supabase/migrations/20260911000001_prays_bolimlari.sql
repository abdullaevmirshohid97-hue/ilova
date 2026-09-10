-- =============================================================
-- YUKCHIBOLLA — praysning bo'limlari: qo'shimchalar va aksiya
--
-- Ta'minotchining prays fayli bitta jadval emas. Pastida ikkita
-- alohida jadval turadi va ularning USTUNLARI BOSHQACHA:
--
--   ҚЎШИМЧАЛАР          № | Nomi | Цена СПЕЦ | Цена Реал | Орг.упк | ...
--   Внимание! Акции!!!  № | Nomi | Акция | Цена без акции | Цена после | ...
--
-- Robot butun varaqqa BITTA moslashtirish qo'llardi. Oqibati jonli
-- bazada shunday bo'lgan: aksiya blokida 3-ustun narx emas, "Акция"
-- ("5+1") edi va songa("5+1") = 51. 63 800 so'mlik Алдобел skladda
-- 51 so'm bo'lib qolgan — 56 ta pozitsiya shunday buzilgan.
--
-- Endi robot har blokni o'z moslashtirishi bilan o'qiydi va bo'limni
-- ham beradi. Baza uni saqlaydi, eksport esa aynan shu tartibda
-- uchta jadval qilib chiqaradi.
--
-- AKSIYA — BO'LIM EMAS, BELGI. Bir dori ham asosiy ro'yxatda, ham
-- aksiya jadvalida turishi mumkin (ta'minotchining faylida shunday).
-- Shuning uchun aksiya `bolim` da emas, alohida maydonlarda:
-- aksiya to'ldirilgan bo'lsa — dori ikkala joyda ko'rinadi.
-- =============================================================

alter table public.dori_offers
  add column bolim text not null default 'asosiy'
    check (bolim in ('asosiy', 'qoshimcha', 'aksiya')),
  -- "5+1" — SON EMAS, shart matni
  add column aksiya      text,
  add column aksiya_narx numeric(16,2),
  add column narx_real   numeric(16,2),
  add column org_upk     numeric(16,2);

comment on column public.dori_offers.bolim is
  'Prays faylida qaysi jadvaldan kelgani: asosiy / qoshimcha / aksiya.';
comment on column public.dori_offers.aksiya is
  'Aksiya sharti ("5+1"). To''ldirilgan bo''lsa dori aksiya jadvalida ham ko''rinadi.';

-- ---------- Import: bo'lim va aksiya maydonlari ----------
create or replace function public.dori_import_apply(
  p_warehouse_id uuid,
  p_items        jsonb,
  p_source       text default null,
  p_import_id    text default null,
  p_finalize     boolean default true,
  p_file_name    text default null
)
returns jsonb
language plpgsql security definer set search_path = public
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
  if not dori_ruxsat() then
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
         nullif(e ->> 'made_at', '')::date      as made_at,
         coalesce(nullif(trim(e ->> 'bolim'), ''), 'asosiy') as bolim,
         nullif(trim(e ->> 'aksiya'), '')       as aksiya,
         nullif(e ->> 'aksiya_narx', '')::numeric as aksiya_narx,
         nullif(e ->> 'narx_real', '')::numeric   as narx_real,
         nullif(e ->> 'org_upk', '')::numeric     as org_upk
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where nullif(trim(e ->> 'name'), '') is not null;

  -- Bitta dori ikki blokda ham bo'lishi mumkin (asosiy ro'yxatda va
  -- aksiya jadvalida). Avval "distinct on" bittasini tashlab yuborardi
  -- va shunda yo narx, yo aksiya sharti yo'qolardi. Endi ular BIRLASHADI.
  drop table if exists _yigma;
  create temp table _yigma on commit drop as
  select coalesce(barcode, name_norm || coalesce(manufacturer, '')) as kalit,
         (array_agg(barcode)      filter (where barcode is not null))[1]      as barcode,
         (array_agg(name order by (bolim <> 'aksiya') desc))[1]                as name,
         (array_agg(name_norm order by (bolim <> 'aksiya') desc))[1]           as name_norm,
         (array_agg(manufacturer) filter (where manufacturer is not null))[1] as manufacturer,
         (array_agg(grp)          filter (where grp is not null))[1]          as grp,
         (array_agg(unit)         filter (where unit is not null))[1]         as unit,
         -- Narx AVVAL aksiya bo'lmagan blokdan: aksiya jadvalidagi
         -- "Цена без акции" ham narx, lekin asosiy ro'yxat ustunroq
         coalesce(
           min(price) filter (where bolim <> 'aksiya' and price is not null),
           min(price) filter (where price is not null)
         ) as price,
         max(stock)   as stock,
         (array_agg(series)  filter (where series is not null))[1]  as series,
         min(expiry)  as expiry,
         max(made_at) as made_at,
         -- Bo'lim: qo'shimcha > asosiy > aksiya
         case
           when bool_or(bolim = 'qoshimcha') then 'qoshimcha'
           when bool_or(bolim = 'asosiy')    then 'asosiy'
           else 'aksiya'
         end as bolim,
         (array_agg(aksiya)      filter (where aksiya is not null))[1]      as aksiya,
         (array_agg(aksiya_narx) filter (where aksiya_narx is not null))[1] as aksiya_narx,
         (array_agg(narx_real)   filter (where narx_real is not null))[1]   as narx_real,
         (array_agg(org_upk)     filter (where org_upk is not null))[1]     as org_upk
  from _kirish
  group by coalesce(barcode, name_norm || coalesce(manufacturer, ''));

  for r in select * from _yigma
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

    -- 4) Nom + ishlab chiqaruvchi (aynan)
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

    insert into dori_offers (warehouse_id, product_id, base_price, stock, last_import, updated_at,
                             bolim, aksiya, aksiya_narx, narx_real, org_upk)
    values (v_wh, v_id, r.price, r.stock, v_import, now(),
            r.bolim, r.aksiya, r.aksiya_narx, r.narx_real, r.org_upk)
    on conflict (warehouse_id, product_id) do update
      set base_price  = coalesce(excluded.base_price, dori_offers.base_price),
          stock       = excluded.stock,
          last_import = excluded.last_import,
          updated_at  = now(),
          -- Bo'lim va aksiya HAR importda qaytadan yoziladi: aksiya
          -- tugagan bo'lsa maydon bo'shashi kerak, aks holda o'tgan
          -- oyning "5+1" i abadiy osilib qolardi
          bolim       = excluded.bolim,
          aksiya      = excluded.aksiya,
          aksiya_narx = excluded.aksiya_narx,
          narx_real   = excluded.narx_real,
          org_upk     = excluded.org_upk;

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
    'qoshimcha', (select count(*) from dori_offers where warehouse_id = v_wh and bolim = 'qoshimcha'),
    'aksiya', (select count(*) from dori_offers where warehouse_id = v_wh and aksiya is not null),
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

-- ---------- Eksport: uchta bo'lim ----------
-- Bir dori ikki marta chiqishi MUMKIN va kerak: asosiy ro'yxatda oddiy
-- narxi bilan, pastdagi aksiya jadvalida esa sharti va ikkala narxi
-- bilan — xuddi ta'minotchining faylidagidek.
drop function if exists public.dori_prays_eksport(text, integer, integer);

create or replace function public.dori_prays_eksport(
  p_q      text default null,
  p_limit  integer default 1000,
  p_offset integer default 0
)
returns table(
  bolim              text,
  nomi               text,
  narx               numeric,
  seriya             text,
  yaroqlilik         date,
  ishlab_chiqaruvchi text,
  aksiya             text,
  aksiya_narx        numeric,
  narx_real          numeric,
  org_upk            numeric
)
language sql stable security definer set search_path = public
as $$
  with taklif as (
    select p.id, p.name, p.price, p.manufacturer,
           -- Bir dori bir necha skladda bo'lishi mumkin: bo'lim va
           -- aksiya eng oxirgi yangilangan taklifdan olinadi
           (array_agg(o.bolim      order by o.updated_at desc))[1] as bolim,
           (array_agg(o.aksiya     order by o.updated_at desc))[1] as aksiya,
           (array_agg(o.aksiya_narx order by o.updated_at desc))[1] as aksiya_narx,
           (array_agg(o.narx_real  order by o.updated_at desc))[1] as narx_real,
           (array_agg(o.org_upk    order by o.updated_at desc))[1] as org_upk
    from dori_products p
    left join dori_offers o on o.product_id = p.id
    where p.is_active
      and p.price is not null
      and (
        p_q is null or btrim(p_q) = ''
        or p.name ilike '%' || btrim(p_q) || '%'
        or p.manufacturer ilike '%' || btrim(p_q) || '%'
      )
    group by p.id, p.name, p.price, p.manufacturer
  ),
  partiya as (
    select b.product_id, b.series, b.expiry
    from (
      select distinct on (bb.product_id) bb.product_id, bb.series, bb.expiry
      from dori_batches bb
      join dori_warehouses w on w.id = bb.warehouse_id and w.is_active
      order by bb.product_id, bb.expiry asc nulls last, bb.last_seen desc
    ) b
  ),
  hammasi as (
    -- 1-bo'lim: asosiy ro'yxat (aksiyadagi dori ham shu yerda turadi)
    select 'asosiy'::text as bolim, t.name, t.price, pb.series, pb.expiry, t.manufacturer,
           null::text as aksiya, null::numeric as aksiya_narx,
           null::numeric as narx_real, null::numeric as org_upk, 1 as tartib
    from taklif t left join partiya pb on pb.product_id = t.id
    where coalesce(t.bolim, 'asosiy') <> 'qoshimcha'

    union all
    -- 2-bo'lim: qo'shimchalar (o'z ustunlari bilan)
    select 'qoshimcha', t.name, t.price, pb.series, pb.expiry, t.manufacturer,
           null, null, t.narx_real, t.org_upk, 2
    from taklif t left join partiya pb on pb.product_id = t.id
    where t.bolim = 'qoshimcha'

    union all
    -- 3-bo'lim: aksiya (aksiya sharti bor har bir dori)
    select 'aksiya', t.name, t.price, pb.series, pb.expiry, t.manufacturer,
           t.aksiya, t.aksiya_narx, null, null, 3
    from taklif t left join partiya pb on pb.product_id = t.id
    where t.aksiya is not null
  )
  select bolim, name, price, series, expiry, manufacturer,
         aksiya, aksiya_narx, narx_real, org_upk
  from hammasi
  where dori_ruxsat()
  -- Tartib BARQAROR: bo'lak-bo'lak so'ralganda qator ikki marta tushib
  -- yoki umuman tushmay qolmasin
  order by tartib, name, price
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.dori_prays_eksport(text, integer, integer) to authenticated;
