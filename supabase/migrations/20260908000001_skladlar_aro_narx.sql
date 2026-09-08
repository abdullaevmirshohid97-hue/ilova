-- =============================================================
--  SKLADLAR ARO NARX
--
--  Ikki joyda bir xil savol bor edi, javobi esa yo'q edi:
--
--   1. DORI KATALOGI — "shu dori qaysi skladda arzon?". Katalog har
--      skladni ALOHIDA QATOR qilib ko'rsatadi: bir xil nom uch joyda
--      uch qatorda, orasida yuzlab boshqa dori. Solishtirish uchun
--      ko'z bilan qidirish kerak edi.
--
--      Solishtirish TANNARXDA (base_price) bo'ladi: ustama har skladda
--      har xil, ya'ni sotuv narxi skladning ARZONLIGINI emas, bizning
--      ustamamizni ko'rsatadi. Ta'minotchini tanlashda esa aynan
--      tannarx kerak.
--
--   2. SOTUV — mijoz "aspirin bormi?" deb so'raydi. Operator faqat
--      TANLANGAN skladni ko'radi; qo'shni skladda turgani ko'rinmaydi
--      va sotuv qo'ldan ketadi. Endi qidiruv hamma skladni beradi.
--
--  Nom bo'yicha guruhlash `name_norm` bilan: bir dori ikki skladda
--  har xil ishlab chiqaruvchi bilan kelishi mumkin (ya'ni
--  dori_products da IKKI qator), lekin odam uchun bu bir xil dori.
--  Aynan shuni solishtirmoqchi.
-- =============================================================


-- ---------- 1. Katalog: ustunlarda sklad, qatorlarda nom ----------
create or replace function public.dori_narx_solishtir(
  p_q            text    default null,
  p_faqat_umumiy boolean default true,   -- faqat bir nechta skladda bori
  p_saralash     text    default 'nom',  -- nom | farq | skladlar
  p_offset       int     default 0,
  p_limit        int     default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_lim  int  := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_off  int  := greatest(coalesce(p_offset, 0), 0);
  v_q    text := nullif(trim(coalesce(p_q, '')), '');
  v_lat  text;
  -- «faqat nomi bir xillari» — ya'ni solishtirish mumkin bo'lganlari.
  -- Sklad bitta bo'lsa solishtiradigan narsa yo'q, shuning uchun
  -- cheklov ham qo'yilmaydi: aks holda ekran bo'sh chiqardi.
  v_kam  int;
  v_sara text := lower(coalesce(p_saralash, 'nom'));
  v      jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  v_lat := case when v_q is null then null else dori_lat(v_q) end;

  select case when count(*) > 1 and coalesce(p_faqat_umumiy, true) then 2 else 1 end
    into v_kam
  from dori_warehouses;

  with mos as (
    -- Qidiruv NOM GURUHINI tanlaydi, alohida taklifni emas: ishlab
    -- chiqaruvchi bo'yicha qidirilganda ham qator to'liq chiqsin,
    -- aks holda solishtirish yarim ustun bilan ko'rsatilardi.
    select distinct p.name_norm
    from dori_products p
    where v_q is null
       or p.name ilike '%' || v_q || '%'
       or dori_lat(p.name) like '%' || v_lat || '%'
       or coalesce(p.manufacturer, '') ilike '%' || v_q || '%'
  ),
  hujayra as (
    select p.name_norm,
           o.warehouse_id,
           min(p.name)               as nom,
           min(o.base_price)         as narx,
           count(*)::int             as soni,
           sum(coalesce(o.stock, 0)) as qoldiq,
           -- Eng arzon taklifning ishlab chiqaruvchisi: narx farqi
           -- ko'pincha shundan kelib chiqadi
           (array_agg(p.manufacturer order by o.base_price, p.name))[1] as ic
    from dori_offers o
    join dori_products p on p.id = o.product_id
    join mos m           on m.name_norm = p.name_norm
    -- Narxsiz taklif solishtirishga kirmaydi: nol "arzon" bo'lib
    -- ko'rinib, butun jadvalni yolg'on qilardi
    where o.base_price is not null and o.base_price > 0
    group by p.name_norm, o.warehouse_id
  ),
  guruh as (
    select h.name_norm,
           min(h.nom)    as nom,
           count(*)::int as skladlar_soni,
           min(h.narx)   as min_narx,
           max(h.narx)   as max_narx,
           jsonb_object_agg(
             h.warehouse_id::text,
             jsonb_build_object('narx', h.narx, 'soni', h.soni,
                                'qoldiq', h.qoldiq, 'ic', h.ic)
           ) as hujayralar
    from hujayra h
    group by h.name_norm
    having count(*) >= v_kam
  ),
  sahifa as (
    select g.*,
           (g.max_narx - g.min_narx) / g.min_narx as ulush,
           count(*) over ()                       as jami
    from guruh g
    order by
      case when v_sara = 'farq'     then (g.max_narx - g.min_narx) / g.min_narx end desc nulls last,
      case when v_sara = 'skladlar' then g.skladlar_soni end desc nulls last,
      g.nom
    offset v_off limit v_lim
  )
  select jsonb_build_object(
    'skladlar', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name)
                       order by w.priority, w.name)
      from dori_warehouses w
    ), '[]'::jsonb),
    'jami',  coalesce((select max(jami) from sahifa), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom',           s.nom,
               'nom_norm',      s.name_norm,
               'skladlar_soni', s.skladlar_soni,
               'min_narx',      s.min_narx,
               'max_narx',      s.max_narx,
               'farq',          s.max_narx - s.min_narx,
               'farq_foiz',     round(s.ulush * 100, 1),
               'hujayralar',    s.hujayralar
             ) order by
               case when v_sara = 'farq'     then s.ulush end desc nulls last,
               case when v_sara = 'skladlar' then s.skladlar_soni end desc nulls last,
               s.nom)
      from sahifa s
    ), '[]'::jsonb)
  ) into v;

  return v;
end $fn$;

revoke all on function public.dori_narx_solishtir(text, boolean, text, int, int) from public, anon;
grant execute on function public.dori_narx_solishtir(text, boolean, text, int, int) to authenticated;


-- ---------- 2. Sotuv: qidiruv hamma skladdan ----------
--
--  `dori_sotuv_qidir` (bitta sklad) O'CHIRILMAYDI — sotuvni tahrirlash
--  oynasi undan foydalanadi va u yerda sklad ALLAQACHON qat'iy:
--  sotilgan hujjat boshqa skladga ko'chmaydi.
--
--  Bu yerda esa natija NOM bo'yicha guruhlanadi va har guruhda hamma
--  sklad turadi. Joriy skladdagi taklif birinchi bo'ladi: operator
--  odatda shundan sotadi, boshqasi mijozga aytish uchun.
create or replace function public.dori_sotuv_qidir_skladlar(
  p_warehouse_id uuid,
  p_q            text,
  p_limit        int default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_lat text;
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if v_q is null then
    return '[]'::jsonb;
  end if;

  v_lat := dori_lat(v_q);

  with tak as (
    select p.name_norm, p.id, p.name, p.manufacturer, p.unit,
           greatest(coalesce(p.pachka, 1), 1) as pachka,
           o.warehouse_id, w.name as sklad, w.priority,
           o.price, o.base_price, o.stock,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.warehouse_id = o.warehouse_id
               and b.expiry >= current_date) as expiry,
           (select b.series from dori_batches b
             where b.product_id = p.id and b.warehouse_id = o.warehouse_id
               and b.series is not null
             order by (b.expiry is null), b.expiry limit 1) as series
    from dori_offers o
    join dori_products p   on p.id = o.product_id
    join dori_warehouses w on w.id = o.warehouse_id
    where o.price is not null and o.price > 0
      -- Kirill ham, lotin ham: mijoz botidagi bilan bir xil
      and (p.name ilike '%' || v_q || '%' or dori_lat(p.name) like '%' || v_lat || '%')
  ),
  guruh as (
    select t.name_norm,
           min(t.name)                              as nom,
           bool_or(t.warehouse_id = p_warehouse_id) as joriyda,
           jsonb_agg(jsonb_build_object(
             'warehouse_id', t.warehouse_id,
             'sklad',        t.sklad,
             'id',           t.id,
             'name',         t.name,
             'manufacturer', t.manufacturer,
             'unit',         t.unit,
             'pachka',       t.pachka,
             'price',        t.price,
             'base_price',   t.base_price,
             'stock',        t.stock,
             'expiry',       t.expiry,
             'series',       t.series
           ) order by (t.warehouse_id = p_warehouse_id) desc, t.price, t.priority, t.sklad)
             as takliflar
    from tak t
    group by t.name_norm
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'nom',       g.nom,
           'nom_norm',  g.name_norm,
           'joriyda',   g.joriyda,
           'takliflar', g.takliflar
         ) order by g.joriyda desc, g.nom), '[]'::jsonb)
    into v_res
  from (
    select * from guruh
    -- Cheklov NOM ga qo'yiladi, taklifga emas: aks holda bitta dorining
    -- uchta skladi ro'yxatning yarmini egallardi
    order by joriyda desc, nom
    limit least(coalesce(p_limit, 20), 50)
  ) g;

  return v_res;
end $fn$;

revoke all on function public.dori_sotuv_qidir_skladlar(uuid, text, int) from public, anon;
grant execute on function public.dori_sotuv_qidir_skladlar(uuid, text, int) to authenticated;
