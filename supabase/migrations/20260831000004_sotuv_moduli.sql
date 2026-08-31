-- =============================================================
--  SOTUV MODULI
--
--  Bot orqali kelgan buyurtmadan FARQLI: bu yerda operator o'zi
--  skladni tanlaydi, dorini qidiradi, donada miqdor yozadi, mijozni
--  tanlaydi va sotadi. Faktura shu zahoti shakllanadi.
--
--  NEGA ALOHIDA JADVAL: dori_orders bot buyurtmasi uchun - unda
--  chat_id majburiy va taqsimot mantig'i osilgan (buyurtma skladlarga
--  bo'linadi). Sotuvda esa sklad ALLAQACHON tanlangan, bo'lish yo'q.
--  Ikkalasini bitta jadvalga tiqish har ikkalasining ham mantig'ini
--  chalkashtirardi.
--
--  NARX MIJOZDAN OLINMAYDI: operator faqat miqdorni beradi, narx
--  tanlangan skladning taklifidan olinadi va sotuvda MUZLATILADI.
--  Aks holda ekranda bir narx, hujjatda boshqasi chiqib qolardi.
--
--  QOLDIQ: ma'lum bo'lsa kamayadi. Noma'lum (prays faylida ustun yo'q)
--  bo'lsa - tegilmaydi, yolg'on aniqlik yaratmaymiz.
-- =============================================================

create table if not exists public.dori_sales (
  id            uuid primary key default gen_random_uuid(),
  sale_no       bigserial,
  warehouse_id  uuid references public.dori_warehouses(id) on delete set null,
  customer_id   uuid references public.dori_customers(id) on delete set null,
  -- Mijoz ma'lumoti NUSXA bilan: mijoz keyin o'zgarsa ham hujjat
  -- o'sha kungi holatini saqlab qolsin
  customer_name text,
  customer_phone text,
  pharmacy      text,
  total         numeric(16,2) not null default 0,   -- mijoz to'laydigan
  base_total    numeric(16,2) not null default 0,   -- skladga tegishli (tannarx)
  comment       text,
  status        text not null default 'done' check (status in ('done', 'cancelled')),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists dori_sales_at_idx on public.dori_sales (created_at desc);
create index if not exists dori_sales_wh_idx on public.dori_sales (warehouse_id, created_at desc);

alter table public.dori_sales enable row level security;

drop policy if exists "dori_sales: super_admin" on public.dori_sales;
create policy "dori_sales: super_admin"
  on public.dori_sales for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create table if not exists public.dori_sale_items (
  id           bigserial primary key,
  sale_id      uuid not null references public.dori_sales(id) on delete cascade,
  product_id   uuid references public.dori_products(id) on delete set null,
  name         text not null,
  manufacturer text,
  series       text,
  expiry       date,
  qty          numeric(16,3) not null check (qty > 0),
  price        numeric(16,2) not null,
  base_price   numeric(16,2),
  sum          numeric(16,2) not null,
  base_sum     numeric(16,2)
);

create index if not exists dori_sale_items_idx on public.dori_sale_items (sale_id);

alter table public.dori_sale_items enable row level security;

drop policy if exists "dori_sale_items: super_admin" on public.dori_sale_items;
create policy "dori_sale_items: super_admin"
  on public.dori_sale_items for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 1. Skladdan dori qidirish ----------
-- Mijoz qidiruvidan farqli: AYNAN tanlangan skladning taklifi bo'yicha,
-- tannarx va qoldiq bilan.
create or replace function public.dori_sotuv_qidir(
  p_warehouse_id uuid,
  p_q            text,
  p_limit        int default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.manufacturer, p.unit,
           o.price, o.base_price, o.stock,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.expiry >= current_date) as expiry,
           (select b.series from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.series is not null
             order by (b.expiry is null), b.expiry limit 1) as series
    from dori_offers o
    join dori_products p on p.id = o.product_id
    where o.warehouse_id = p_warehouse_id
      and o.price is not null and o.price > 0
      -- Kirill ham, lotin ham ishlaydi: mijoz botidagi bilan bir xil
      and (p.name ilike '%' || v_q || '%' or dori_lat(p.name) like '%' || v_lat || '%')
    limit least(coalesce(p_limit, 20), 50)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_sotuv_qidir(uuid, text, int) from public, anon;
grant execute on function public.dori_sotuv_qidir(uuid, text, int) to authenticated;

-- ---------- 2. Mijoz qidirish ----------
create or replace function public.dori_sotuv_mijozlar(p_q text default null, p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v   jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v
  from (
    select c.id, c.name, c.phone, c.pharmacy
    from dori_customers c
    where not c.is_blocked
      and (v_q is null
           or c.name ilike '%' || v_q || '%'
           or c.pharmacy ilike '%' || v_q || '%'
           or c.phone_norm like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%')
    limit least(coalesce(p_limit, 20), 50)
  ) t;

  return v;
end $$;

revoke all on function public.dori_sotuv_mijozlar(text, int) from public, anon;
grant execute on function public.dori_sotuv_mijozlar(text, int) to authenticated;

-- ---------- 3. Sotuvni yakunlash ----------
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
  r        record;
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
         nullif(e ->> 'qty', '')::numeric as qty
  from jsonb_array_elements(p_items) e
  where nullif(e ->> 'product_id', '') is not null
    and coalesce(nullif(e ->> 'qty', '')::numeric, 0) > 0;

  if not exists (select 1 from _sotuv) then
    raise exception 'POZITSIYA_YOQ';
  end if;

  -- Qoldiqdan ortiq sotib bo'lmasin (cheklov yoqilgan bo'lsa)
  if v_chek then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', p.name, 'soralgan', s.qty, 'bor', o.stock)), '[]'::jsonb)
      into v_kam
    from _sotuv s
    join dori_offers o on o.warehouse_id = p_warehouse_id and o.product_id = s.product_id
    join dori_products p on p.id = s.product_id
    where o.stock is not null and s.qty > o.stock;

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
                               qty, price, base_price, sum, base_sum)
  select v_id, p.id, p.name, p.manufacturer,
         (select b.series from dori_batches b
           where b.product_id = p.id and b.warehouse_id = p_warehouse_id and b.series is not null
           order by (b.expiry is null), b.expiry limit 1),
         (select min(b.expiry) from dori_batches b
           where b.product_id = p.id and b.warehouse_id = p_warehouse_id
             and b.expiry >= current_date),
         s.qty, o.price, o.base_price,
         round(o.price * s.qty, 2), round(coalesce(o.base_price, 0) * s.qty, 2)
  from _sotuv s
  join dori_offers o on o.warehouse_id = p_warehouse_id and o.product_id = s.product_id
  join dori_products p on p.id = s.product_id;

  if not exists (select 1 from dori_sale_items where sale_id = v_id) then
    delete from dori_sales where id = v_id;
    raise exception 'TAKLIF_TOPILMADI';
  end if;

  select coalesce(sum(sum), 0), coalesce(sum(base_sum), 0)
    into v_jami, v_tan
  from dori_sale_items where sale_id = v_id;

  update dori_sales set total = v_jami, base_total = v_tan where id = v_id;

  -- Qoldiq MA'LUM bo'lsa kamayadi; noma'lum bo'lsa tegilmaydi
  update dori_offers o
     set stock = greatest(o.stock - s.qty, 0), updated_at = now()
    from _sotuv s
   where o.warehouse_id = p_warehouse_id
     and o.product_id = s.product_id
     and o.stock is not null;

  perform dori_katalog_yigish(array(select product_id from _sotuv));

  return jsonb_build_object(
    'ok', true, 'sale_id', v_id, 'sale_no', v_no,
    'total', v_jami, 'base_total', v_tan, 'foyda', v_jami - v_tan
  );
end $$;

revoke all on function public.dori_sotuv_yarat(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.dori_sotuv_yarat(uuid, uuid, jsonb, text) to authenticated;

-- ---------- 4. Sotuvlar ro'yxati ----------
create or replace function public.dori_sotuvlar(p_limit int default 30)
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

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v
  from (
    select s.id, s.sale_no, s.created_at, s.status, s.total, s.base_total,
           (s.total - s.base_total) as foyda,
           s.customer_name, s.customer_phone, s.pharmacy,
           w.name as sklad,
           (select count(*) from dori_sale_items i where i.sale_id = s.id) as pozitsiya
    from dori_sales s
    left join dori_warehouses w on w.id = s.warehouse_id
    order by s.created_at desc
    limit least(coalesce(p_limit, 30), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_sotuvlar(int) from public, anon;
grant execute on function public.dori_sotuvlar(int) to authenticated;

-- ---------- 5. Faktura ----------
-- Tuzilishi mijoz fakturasi bilan bir xil: bitta PDF/Excel yasovchi
-- ikkalasiga ham xizmat qiladi.
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
    'customer', jsonb_build_object(
      'name',     coalesce(s.customer_name, '—'),
      'phone',    coalesce(s.customer_phone, '—'),
      'pharmacy', s.pharmacy
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', t.n, 'name', t.name, 'manufacturer', t.manufacturer,
               'series', t.series, 'made_at', null, 'expiry', t.expiry,
               'qty', t.qty, 'price', t.price, 'sum', t.sum
             ) order by t.n)
      from (
        select row_number() over (order by i.id) as n,
               i.name, i.manufacturer, i.series, i.expiry, i.qty, i.price, i.sum
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

-- ---------- 6. Sotuvni bekor qilish ----------
-- Qoldiq qaytariladi (ma'lum bo'lsa). Hujjat o'chirilmaydi - bekor
-- qilingan sotuv ham tarixda qolishi kerak.
create or replace function public.dori_sotuv_bekor(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select warehouse_id into v_wh from dori_sales where id = p_sale_id and status = 'done';
  if v_wh is null then
    raise exception 'SOTUV_TOPILMADI';
  end if;

  update dori_offers o
     set stock = o.stock + i.qty, updated_at = now()
    from dori_sale_items i
   where i.sale_id = p_sale_id
     and o.warehouse_id = v_wh
     and o.product_id = i.product_id
     and o.stock is not null;

  update dori_sales set status = 'cancelled' where id = p_sale_id;

  perform dori_katalog_yigish(array(
    select product_id from dori_sale_items where sale_id = p_sale_id and product_id is not null
  ));

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_sotuv_bekor(uuid) from public, anon;
grant execute on function public.dori_sotuv_bekor(uuid) to authenticated;
