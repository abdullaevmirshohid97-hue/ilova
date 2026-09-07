-- =============================================================
--  DONAGA SOTUV VA SOTILGAN FAKTURANI TAHRIRLASH
--
--  1) DONA. Prays narxi PACHKA uchun: «Виусид пор.4.5г.№90» —
--     2 605 172 so'm, ya'ni to'qson dona uchun. Mijoz o'ntasini
--     so'rasa, hozir buni faqat qo'lda hisoblab bo'lardi.
--
--     Dona narxi YUQORIGA yaxlitlanadi (ceil). Pastga yaxlitlansa
--     har donada bir necha tiyin yo'qolardi va katta pachkada bu
--     sezilarli summa bo'lardi. Yuqoriga yaxlitlashda sotuvchi
--     hech qachon yutqazmaydi.
--
--     Qoldiq PACHKADA yuritiladi, shuning uchun donaga sotilganda
--     ulushi kamayadi: 10 dona / 90 = 0.111 pachka. Ochilgan quti
--     haqiqatda ham shunday turadi.
--
--  2) TAHRIR. Yakunlangan sotuvning fakturasini tuzatish kerak
--     bo'ladi: miqdor xato yozilgan, dori almashgan, mijoz noto'g'ri
--     tanlangan.
--
--     Har tahrir IZ QOLDIRADI: kim, qachon, nima sababdan va
--     oldingi holat qanday edi. Buni yozib qo'ymaslik — sotilgan
--     hujjatni jimgina o'zgartirish imkoni degani.
--
--     Qoldiq ikki qadamda to'g'rilanadi: avval eski miqdor
--     qaytariladi, keyin yangisi yechiladi.
-- =============================================================

-- ---------- 1. Sotuv qatorida birlik ----------
alter table dori_sale_items
  add column if not exists birlik text not null default 'pachka',
  add column if not exists pachka int;

alter table dori_sale_items drop constraint if exists dori_sale_items_birlik_chk;
alter table dori_sale_items
  add constraint dori_sale_items_birlik_chk check (birlik in ('pachka', 'dona'));

comment on column dori_sale_items.birlik is
  'pachka yoki dona. dona bo''lsa qty dona sonini, price esa bitta dona narxini bildiradi.';
comment on column dori_sale_items.pachka is
  'Sotuv paytidagi pachka hajmi. Muzlatiladi: nom keyin o''zgarsa faktura o''zgarmasin.';


-- ---------- 2. Tahrir izi ----------
create table if not exists public.dori_sale_edits (
  id         bigserial primary key,
  sale_id    uuid not null references public.dori_sales(id) on delete cascade,
  edited_by  uuid references public.profiles(id) on delete set null,
  edited_at  timestamptz not null default now(),
  sabab      text not null,
  oldingi    jsonb not null,
  yangi      jsonb not null
);

create index if not exists dori_sale_edits_sale on public.dori_sale_edits (sale_id, edited_at desc);

alter table public.dori_sale_edits enable row level security;

-- O'qish super adminda. YOZISH siyosati YO'Q: qatorni faqat
-- security definer funksiya qo'shadi, ya'ni izni panel orqali
-- tahrirlab yoki o'chirib bo'lmaydi.
drop policy if exists "dori_sale_edits: super admin oqiydi" on public.dori_sale_edits;
create policy "dori_sale_edits: super admin oqiydi"
  on public.dori_sale_edits for select to authenticated
  using (is_super_admin());


-- ---------- 3. Yordamchi: bitta qator hisobi ----------
-- Pachka va dona hisobini bitta joyda saqlaymiz: sotuv yaratishda ham,
-- tahrirlashda ham bir xil bo'lishi shart. Ikki joyda yozilsa, biri
-- o'zgarganda faktura tahrirdan keyin boshqacha chiqib qolardi.
-- Qoldiqdan yechiladigan PACHKA miqdori. Narxga bog'liq emas, shuning
-- uchun alohida: tahrirda eski qatorning ulushi kerak bo'ladi va u
-- yerda saqlangan narx allaqachon DONA narxi — uni yana bo'lish
-- xato bo'lardi.
create or replace function public.dori_pachka_ulush(
  p_birlik text,
  p_qty    numeric,
  p_pachka int
)
returns numeric
language sql
immutable
as $$
  select case when p_birlik = 'dona'
              then round(p_qty / greatest(coalesce(p_pachka, 1), 1), 4)
              else p_qty end
$$;

create or replace function public.dori_qator_hisob(
  p_narx    numeric,
  p_tannarx numeric,
  p_pachka  int,
  p_birlik  text,
  p_qty     numeric
)
returns table (narx numeric, tannarx numeric, summa numeric, tan_summa numeric, pachka_ulush numeric)
language sql
immutable
as $$
  select
    case when p_birlik = 'dona' then ceil(p_narx / greatest(coalesce(p_pachka, 1), 1))
         else p_narx end,
    case when p_birlik = 'dona' then ceil(coalesce(p_tannarx, 0) / greatest(coalesce(p_pachka, 1), 1))
         else coalesce(p_tannarx, 0) end,
    round(case when p_birlik = 'dona' then ceil(p_narx / greatest(coalesce(p_pachka, 1), 1))
               else p_narx end * p_qty, 2),
    round(case when p_birlik = 'dona' then ceil(coalesce(p_tannarx, 0) / greatest(coalesce(p_pachka, 1), 1))
               else coalesce(p_tannarx, 0) end * p_qty, 2),
    dori_pachka_ulush(p_birlik, p_qty, p_pachka)
$$;


-- ---------- 4. Sotuv yaratish — birlik bilan ----------
create or replace function public.dori_sotuv_yarat(
  p_warehouse_id uuid,
  p_customer_id  uuid,
  p_items        jsonb,
  p_comment      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_no     bigint;
  v_mijoz  record;
  v_jami   numeric(16,2);
  v_tan    numeric(16,2);
  v_kam    jsonb := '[]'::jsonb;
  v_chek   boolean := dori_cheklov_yoqilganmi();
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_warehouse_id is null then
    raise exception 'SKLAD_KERAK';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'POZITSIYA_YOQ';
  end if;

  select * into v_mijoz from dori_customers where id = p_customer_id;
  if v_mijoz.id is null then
    raise exception 'MIJOZ_TOPILMADI';
  end if;

  drop table if exists _sotuv;
  create temp table _sotuv on commit drop as
  select (e ->> 'product_id')::uuid as product_id,
         nullif(e ->> 'qty', '')::numeric as qty,
         case when coalesce(e ->> 'birlik', 'pachka') = 'dona' then 'dona' else 'pachka' end as birlik
  from jsonb_array_elements(p_items) e
  where nullif(e ->> 'product_id', '') is not null
    and coalesce(nullif(e ->> 'qty', '')::numeric, 0) > 0;

  if not exists (select 1 from _sotuv) then
    raise exception 'POZITSIYA_YOQ';
  end if;

  -- Qoldiqdan ortiq sotib bo'lmasin. Donaga sotilganda taqqoslash
  -- PACHKA ulushida: 100 dona 90 talik pachkadan 1.11 pachka.
  if v_chek then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', p.name, 'soralgan', s.qty, 'bor', o.stock, 'birlik', s.birlik)), '[]'::jsonb)
      into v_kam
    from _sotuv s
    join dori_offers o on o.warehouse_id = p_warehouse_id and o.product_id = s.product_id
    join dori_products p on p.id = s.product_id
    cross join lateral dori_qator_hisob(o.price, o.base_price, p.pachka, s.birlik, s.qty) h
    where o.stock is not null and h.pachka_ulush > o.stock;

    if jsonb_array_length(v_kam) > 0 then
      return jsonb_build_object('ok', false, 'error', 'QOLDIQ_YETMAYDI', 'kam', v_kam);
    end if;
  end if;

  insert into dori_sales (warehouse_id, customer_id, customer_name, customer_phone,
                          pharmacy, comment, created_by)
  values (p_warehouse_id, v_mijoz.id, v_mijoz.name, v_mijoz.phone,
          v_mijoz.pharmacy, nullif(trim(coalesce(p_comment, '')), ''), auth.uid())
  returning id, sale_no into v_id, v_no;

  -- Narx AYNAN tanlangan skladning taklifidan olinadi va muzlatiladi
  insert into dori_sale_items (sale_id, product_id, name, manufacturer, series, expiry,
                               qty, price, base_price, sum, base_sum, birlik, pachka)
  select v_id, p.id, p.name, p.manufacturer,
         (select b.series from dori_batches b
           where b.product_id = p.id and b.warehouse_id = p_warehouse_id and b.series is not null
           order by (b.expiry is null), b.expiry limit 1),
         (select min(b.expiry) from dori_batches b
           where b.product_id = p.id and b.warehouse_id = p_warehouse_id
             and b.expiry >= current_date),
         s.qty, h.narx, h.tannarx, h.summa, h.tan_summa,
         s.birlik, greatest(coalesce(p.pachka, 1), 1)
  from _sotuv s
  join dori_offers o on o.warehouse_id = p_warehouse_id and o.product_id = s.product_id
  join dori_products p on p.id = s.product_id
  cross join lateral dori_qator_hisob(o.price, o.base_price, p.pachka, s.birlik, s.qty) h;

  if not exists (select 1 from dori_sale_items where sale_id = v_id) then
    delete from dori_sales where id = v_id;
    raise exception 'TAKLIF_TOPILMADI';
  end if;

  select coalesce(sum(sum), 0), coalesce(sum(base_sum), 0)
    into v_jami, v_tan
  from dori_sale_items where sale_id = v_id;

  update dori_sales set total = v_jami, base_total = v_tan where id = v_id;

  -- Qoldiq MA'LUM bo'lsa kamayadi; noma'lum bo'lsa tegilmaydi.
  -- Bir dori savatda ikki qatorda bo'lishi mumkin (bir qismi pachkada,
  -- bir qismi donada), shuning uchun avval yig'iladi.
  update dori_offers o
     set stock = greatest(o.stock - x.ulush, 0), updated_at = now()
    from (
      select s.product_id, sum(h.pachka_ulush) as ulush
      from _sotuv s
      join dori_offers oo on oo.warehouse_id = p_warehouse_id and oo.product_id = s.product_id
      join dori_products p on p.id = s.product_id
      cross join lateral dori_qator_hisob(oo.price, oo.base_price, p.pachka, s.birlik, s.qty) h
      group by s.product_id
    ) x
   where o.warehouse_id = p_warehouse_id
     and o.product_id = x.product_id
     and o.stock is not null;

  perform dori_katalog_yigish(array(select product_id from _sotuv));

  return jsonb_build_object(
    'ok', true, 'sale_id', v_id, 'sale_no', v_no,
    'total', v_jami, 'base_total', v_tan, 'foyda', v_jami - v_tan
  );
end $$;

revoke all on function public.dori_sotuv_yarat(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.dori_sotuv_yarat(uuid, uuid, jsonb, text) to authenticated;


-- ---------- 5. Sotuvni tahrirlash uchun ochish ----------
create or replace function public.dori_sotuv_ochish(p_sale_id uuid)
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
    'id', s.id, 'sale_no', s.sale_no, 'status', s.status,
    'warehouse_id', s.warehouse_id, 'sklad', w.name,
    'customer_id', s.customer_id, 'mijoz', s.customer_name,
    'pharmacy', s.pharmacy, 'phone', s.customer_phone,
    'comment', s.comment, 'total', s.total, 'created_at', s.created_at,
    'tahrirlar', (select count(*) from dori_sale_edits e where e.sale_id = s.id),
    'qatorlar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', i.product_id,
               'name', i.name,
               'manufacturer', i.manufacturer,
               'qty', i.qty,
               'birlik', i.birlik,
               'pachka', coalesce(i.pachka, 1),
               'price', i.price,
               'base_price', i.base_price,
               -- Skladdagi HOZIRGI pachka narxi: tahrirda miqdor
               -- o'zgarsa summa shundan qayta hisoblanadi
               'sklad_narx', o.price,
               'sklad_tannarx', o.base_price,
               'stock', o.stock,
               'bor', (o.price is not null and o.price > 0)
             ) order by i.id)
      from dori_sale_items i
      left join dori_offers o
             on o.product_id = i.product_id and o.warehouse_id = s.warehouse_id
      where i.sale_id = s.id
    ), '[]'::jsonb)
  ) into v
  from dori_sales s
  left join dori_warehouses w on w.id = s.warehouse_id
  where s.id = p_sale_id;

  return v;
end $$;

revoke all on function public.dori_sotuv_ochish(uuid) from public, anon;
grant execute on function public.dori_sotuv_ochish(uuid) to authenticated;


-- ---------- 6. Tahrirlash ----------
-- p_qollash = false: nima o'zgarishini ko'rsatadi, hech narsa yozmaydi.
create or replace function public.dori_sotuv_tahrir(
  p_sale_id     uuid,
  p_items       jsonb,
  p_customer_id uuid default null,
  p_comment     text default null,
  p_sabab       text default null,
  p_qollash     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s       record;
  -- Alohida o'zgaruvchilar, record emas: mijoz almashtirilmasa record
  -- TAYINLANMAGAN bo'lib qoladi va uning maydoniga murojaat qilish
  -- "record is not assigned yet" xatosini beradi.
  v_m_id    uuid;
  v_m_nom   text;
  v_m_tel   text;
  v_m_apt   text;
  v_sabab   text := nullif(trim(coalesce(p_sabab, '')), '');
  v_eski    jsonb;
  v_yangi   jsonb;
  v_kam     jsonb := '[]'::jsonb;
  v_jami    numeric(16,2);
  v_tan     numeric(16,2);
  v_chek    boolean := dori_cheklov_yoqilganmi();
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_s from dori_sales where id = p_sale_id;
  if v_s.id is null then
    raise exception 'SOTUV_TOPILMADI';
  end if;
  -- Bekor qilingan sotuv tarixda qoladi va o'zgarmaydi: uning qoldig'i
  -- allaqachon qaytarilgan, tahrir uni ikki marta qaytarardi.
  if v_s.status <> 'done' then
    raise exception 'FAQAT_YOPILGAN_SOTUV';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'POZITSIYA_YOQ';
  end if;
  -- Sabab MAJBURIY: izsiz tahrir hujjatni jimgina o'zgartirish demak
  if p_qollash and v_sabab is null then
    raise exception 'SABAB_KERAK';
  end if;

  if p_customer_id is not null then
    select id, name, phone, pharmacy into v_m_id, v_m_nom, v_m_tel, v_m_apt
    from dori_customers where id = p_customer_id;
    if v_m_id is null then
      raise exception 'MIJOZ_TOPILMADI';
    end if;
  end if;

  -- Oldingi holat — izga yoziladi
  select jsonb_build_object(
           'total', v_s.total, 'base_total', v_s.base_total,
           'customer_id', v_s.customer_id, 'customer_name', v_s.customer_name,
           'comment', v_s.comment,
           'qatorlar', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'product_id', i.product_id, 'name', i.name, 'qty', i.qty,
                      'birlik', i.birlik, 'price', i.price, 'sum', i.sum) order by i.id)
             from dori_sale_items i where i.sale_id = p_sale_id), '[]'::jsonb))
    into v_eski;

  drop table if exists _tahrir;
  create temp table _tahrir on commit drop as
  select (e ->> 'product_id')::uuid as product_id,
         nullif(e ->> 'qty', '')::numeric as qty,
         case when coalesce(e ->> 'birlik', 'pachka') = 'dona' then 'dona' else 'pachka' end as birlik
  from jsonb_array_elements(p_items) e
  where nullif(e ->> 'product_id', '') is not null
    and coalesce(nullif(e ->> 'qty', '')::numeric, 0) > 0;

  if not exists (select 1 from _tahrir) then
    raise exception 'POZITSIYA_YOQ';
  end if;

  -- Qoldiq o'zgarishi: eski miqdor qaytadi, yangisi yechiladi.
  -- Ikkalasi ham PACHKA ulushida.
  drop table if exists _farq;
  create temp table _farq on commit drop as
  with eski as (
    -- Eski qatorning ulushi SAQLANGAN narx va pachka bilan hisoblanadi:
    -- sotuvdan keyin sklad narxi o'zgargan bo'lsa ham, qaytariladigan
    -- qoldiq o'sha paytdagidek bo'lsin
    select i.product_id,
           sum(dori_pachka_ulush(i.birlik, i.qty, coalesce(i.pachka, 1))) as ulush
    from dori_sale_items i
    where i.sale_id = p_sale_id
    group by i.product_id
  ),
  yangi as (
    select t.product_id,
           sum(h.pachka_ulush) as ulush
    from _tahrir t
    join dori_offers o on o.warehouse_id = v_s.warehouse_id and o.product_id = t.product_id
    join dori_products p on p.id = t.product_id
    cross join lateral dori_qator_hisob(o.price, o.base_price, p.pachka, t.birlik, t.qty) h
    group by t.product_id
  )
  select coalesce(e.product_id, y.product_id) as product_id,
         coalesce(e.ulush, 0) as eski_ulush,
         coalesce(y.ulush, 0) as yangi_ulush,
         coalesce(y.ulush, 0) - coalesce(e.ulush, 0) as farq
  from eski e
  full join yangi y on y.product_id = e.product_id;

  -- Qoldiq yetadimi? Eski miqdor qaytgandan KEYINGI holat bilan
  -- taqqoslanadi, aks holda o'sha sotuvning o'z tovarini yetmaydi
  -- deb hisoblab qo'yardi.
  if v_chek then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', p.name, 'kerak', f.farq, 'bor', o.stock)), '[]'::jsonb)
      into v_kam
    from _farq f
    join dori_offers o on o.warehouse_id = v_s.warehouse_id and o.product_id = f.product_id
    join dori_products p on p.id = f.product_id
    where o.stock is not null and f.farq > 0 and f.farq > o.stock;

    if jsonb_array_length(v_kam) > 0 then
      return jsonb_build_object('ok', false, 'error', 'QOLDIQ_YETMAYDI', 'kam', v_kam);
    end if;
  end if;

  -- Yangi qatorlar (hali yozilmaydi — avval ko'rsatamiz)
  drop table if exists _yangi_qator;
  create temp table _yangi_qator on commit drop as
  select p.id as product_id, p.name, p.manufacturer,
         (select b.series from dori_batches b
           where b.product_id = p.id and b.warehouse_id = v_s.warehouse_id and b.series is not null
           order by (b.expiry is null), b.expiry limit 1) as series,
         (select min(b.expiry) from dori_batches b
           where b.product_id = p.id and b.warehouse_id = v_s.warehouse_id
             and b.expiry >= current_date) as expiry,
         t.qty, t.birlik, greatest(coalesce(p.pachka, 1), 1) as pachka,
         h.narx, h.tannarx, h.summa, h.tan_summa
  from _tahrir t
  join dori_offers o on o.warehouse_id = v_s.warehouse_id and o.product_id = t.product_id
  join dori_products p on p.id = t.product_id
  cross join lateral dori_qator_hisob(o.price, o.base_price, p.pachka, t.birlik, t.qty) h;

  if not exists (select 1 from _yangi_qator) then
    raise exception 'TAKLIF_TOPILMADI';
  end if;

  select coalesce(sum(summa), 0), coalesce(sum(tan_summa), 0)
    into v_jami, v_tan from _yangi_qator;

  select jsonb_build_object(
           'total', v_jami, 'base_total', v_tan,
           'customer_id', coalesce(p_customer_id, v_s.customer_id),
           'customer_name', coalesce(v_m_nom, v_s.customer_name),
           'comment', coalesce(nullif(trim(coalesce(p_comment, '')), ''), v_s.comment),
           'qatorlar', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'product_id', product_id, 'name', name, 'qty', qty,
                      'birlik', birlik, 'price', narx, 'sum', summa) order by name)
             from _yangi_qator), '[]'::jsonb))
    into v_yangi;

  if not p_qollash then
    return jsonb_build_object(
      'ok', true, 'qollandi', false,
      'sale_no', v_s.sale_no,
      'eski', v_eski, 'yangi', v_yangi,
      'qoldiq_ozgarishi', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', p.name, 'eski', f.eski_ulush, 'yangi', f.yangi_ulush, 'farq', f.farq))
        from _farq f join dori_products p on p.id = f.product_id
        where f.farq <> 0), '[]'::jsonb)
    );
  end if;

  -- ---------- yozamiz ----------
  update dori_offers o
     set stock = greatest(o.stock - f.farq, 0), updated_at = now()
    from _farq f
   where o.warehouse_id = v_s.warehouse_id
     and o.product_id = f.product_id
     and o.stock is not null
     and f.farq <> 0;

  delete from dori_sale_items where sale_id = p_sale_id;

  insert into dori_sale_items (sale_id, product_id, name, manufacturer, series, expiry,
                               qty, price, base_price, sum, base_sum, birlik, pachka)
  select p_sale_id, product_id, name, manufacturer, series, expiry,
         qty, narx, tannarx, summa, tan_summa, birlik, pachka
  from _yangi_qator;

  update dori_sales
     set total = v_jami,
         base_total = v_tan,
         comment = coalesce(nullif(trim(coalesce(p_comment, '')), ''), comment),
         customer_id   = coalesce(p_customer_id, customer_id),
         customer_name = coalesce(v_m_nom, customer_name),
         customer_phone = coalesce(v_m_tel, customer_phone),
         pharmacy      = coalesce(v_m_apt, pharmacy)
   where id = p_sale_id;

  insert into dori_sale_edits (sale_id, edited_by, sabab, oldingi, yangi)
  values (p_sale_id, auth.uid(), v_sabab, v_eski, v_yangi);

  perform dori_katalog_yigish(array(select product_id from _farq));

  return jsonb_build_object(
    'ok', true, 'qollandi', true,
    'sale_no', v_s.sale_no, 'total', v_jami, 'foyda', v_jami - v_tan,
    'eski', v_eski, 'yangi', v_yangi
  );
end $$;

revoke all on function public.dori_sotuv_tahrir(uuid, jsonb, uuid, text, text, boolean) from public, anon;
grant execute on function public.dori_sotuv_tahrir(uuid, jsonb, uuid, text, text, boolean) to authenticated;


-- ---------- 7. Tahrir tarixi ----------
create or replace function public.dori_sotuv_tahrirlari(p_sale_id uuid)
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'vaqt', e.edited_at,
           -- profiles da email yo'q, u auth.users da. Ism to'ldirilmagan
           -- bo'lsa hech bo'lmasa pochtasi ko'rinsin: "kim tahrirladi"
           -- degan savol izning butun ma'nosi.
           'kim', coalesce(nullif(pr.full_name, ''), u.email, '—'),
           'sabab', e.sabab, 'oldingi', e.oldingi, 'yangi', e.yangi
         ) order by e.edited_at desc), '[]'::jsonb) into v
  from dori_sale_edits e
  left join profiles pr on pr.id = e.edited_by
  left join auth.users u on u.id = e.edited_by
  where e.sale_id = p_sale_id;

  return v;
end $$;

revoke all on function public.dori_sotuv_tahrirlari(uuid) from public, anon;
grant execute on function public.dori_sotuv_tahrirlari(uuid) to authenticated;


-- ---------- 8. Faktura birlikni ko'rsatsin ----------
create or replace function public.dori_sotuv_faktura_srv(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'sarlavha',   'SOTUV FAKTURASI',
    'taraf_nom',  'Mijoz:',
    'order_no',   s.sale_no,
    'created_at', s.created_at,
    'status',     s.status,
    'total',      s.total,
    'comment',    s.comment,
    -- Tahrirlangan hujjat shundayligini BILDIRADI: mijozdagi nusxa
    -- bizdagidan farq qilishi mumkin
    'tahrirlar',  (select count(*) from dori_sale_edits e where e.sale_id = s.id),
    'customer', jsonb_build_object(
      'name',     coalesce(s.customer_name, '—'),
      'phone',    coalesce(s.customer_phone, '—'),
      'pharmacy', s.pharmacy
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', t.n, 'name', t.name, 'manufacturer', t.manufacturer,
               'series', t.series, 'made_at', null, 'expiry', t.expiry,
               'qty', t.qty, 'price', t.price, 'sum', t.sum,
               'birlik', t.birlik, 'pachka', t.pachka
             ) order by t.n)
      from (
        select row_number() over (order by i.id) as n,
               i.name, i.manufacturer, i.series, i.expiry, i.qty, i.price, i.sum,
               i.birlik, coalesce(i.pachka, 1) as pachka
        from dori_sale_items i where i.sale_id = s.id
      ) t
    ), '[]'::jsonb)
  ) into v
  from dori_sales s
  where s.id = p_sale_id;

  return v;
end $$;

revoke all on function public.dori_sotuv_faktura_srv(uuid) from public, anon, authenticated;
grant execute on function public.dori_sotuv_faktura_srv(uuid) to service_role;
