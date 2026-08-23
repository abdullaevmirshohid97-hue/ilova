-- =============================================================
--  DORI BOTI (@Idaa_dori_bot) — qidiruv, savat, buyurtma
--
--  Mijoz botga telefon raqamini yuborib tanishtiradi, keyin dori nomini
--  yozadi — topilganlar narxi bilan chiqadi, miqdorini kiritib savatga
--  qo'shadi va buyurtma beradi.
--
--  XAVFSIZLIK:
--   * Bu RPC'lar CHAT_ID bo'yicha ishlaydi va faqat service_role'ga
--     beriladi — brauzerdan chaqirib bo'lmaydi.
--   * Kontakt kelganda `contact.user_id = from.id` tekshiruvi bot
--     tomonida (boshqa odamning kontaktini yuborib bo'lmasin).
--   * Narx faqat katalogdan olinadi — mijoz yuborgan narx qabul
--     qilinmaydi, aks holda buyurtmaga o'z narxini yozib yuborardi.
-- =============================================================

-- ---------- 1. Bot mijozlari ----------
create table if not exists public.dori_customers (
  chat_id     bigint primary key,
  phone       text,
  name        text,
  pharmacy    text,
  username    text,
  is_blocked  boolean not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

alter table public.dori_customers enable row level security;

drop policy if exists "dori_customers: super_admin" on public.dori_customers;
create policy "dori_customers: super_admin"
  on public.dori_customers for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 2. Savat ----------
create table if not exists public.dori_cart (
  chat_id    bigint not null,
  product_id uuid not null references public.dori_products(id) on delete cascade,
  qty        numeric(16,3) not null check (qty > 0),
  added_at   timestamptz not null default now(),
  primary key (chat_id, product_id)
);

alter table public.dori_cart enable row level security;

-- ---------- 3. Buyurtmalar ----------
create table if not exists public.dori_orders (
  id           uuid primary key default gen_random_uuid(),
  order_no     bigserial,
  chat_id      bigint not null,
  name         text,
  phone        text,
  pharmacy     text,
  status       text not null default 'new' check (status in ('new','confirmed','done','cancelled')),
  total        numeric(16,2) not null default 0,
  comment      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists dori_orders_at_idx on public.dori_orders (created_at desc);

alter table public.dori_orders enable row level security;

drop policy if exists "dori_orders: super_admin" on public.dori_orders;
create policy "dori_orders: super_admin"
  on public.dori_orders for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create table if not exists public.dori_order_items (
  id         bigserial primary key,
  order_id   uuid not null references public.dori_orders(id) on delete cascade,
  product_id uuid references public.dori_products(id) on delete set null,
  name       text not null,
  price      numeric(16,2) not null,
  qty        numeric(16,3) not null,
  sum        numeric(16,2) not null
);

create index if not exists dori_order_items_idx on public.dori_order_items (order_id);

alter table public.dori_order_items enable row level security;

drop policy if exists "dori_order_items: super_admin" on public.dori_order_items;
create policy "dori_order_items: super_admin"
  on public.dori_order_items for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

revoke all on table public.dori_cart from anon, authenticated;

-- ---------- 4. Mijozni tanishtirish ----------
create or replace function public.dori_bot_link(
  p_chat_id  bigint,
  p_phone    text,
  p_name     text default null,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dori_customers (chat_id, phone, name, username)
  values (p_chat_id, nullif(trim(p_phone), ''), nullif(trim(p_name), ''), p_username)
  on conflict (chat_id) do update
    set phone     = coalesce(excluded.phone, dori_customers.phone),
        name      = coalesce(excluded.name, dori_customers.name),
        username  = excluded.username,
        last_seen = now();

  return jsonb_build_object('ok', true);
end $$;

-- ---------- 5. Savat amallari ----------
create or replace function public.dori_bot_cart_add(
  p_chat_id    bigint,
  p_product_id uuid,
  p_qty        numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom  text;
  v_narx numeric(16,2);
begin
  if coalesce(p_qty, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'MIQDOR_NOTOGRI');
  end if;

  select name, price into v_nom, v_narx
  from dori_products where id = p_product_id and is_active;

  if v_nom is null then
    return jsonb_build_object('ok', false, 'error', 'DORI_TOPILMADI');
  end if;

  insert into dori_cart (chat_id, product_id, qty)
  values (p_chat_id, p_product_id, p_qty)
  on conflict (chat_id, product_id) do update set qty = dori_cart.qty + excluded.qty;

  return jsonb_build_object('ok', true, 'name', v_nom, 'price', v_narx);
end $$;

create or replace function public.dori_bot_cart(p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', c.product_id,
               'name', p.name,
               'price', p.price,
               'qty', c.qty,
               'sum', coalesce(p.price, 0) * c.qty
             ) order by p.name)
      from dori_cart c join dori_products p on p.id = c.product_id
      where c.chat_id = p_chat_id
    ), '[]'::jsonb),
    'total', coalesce((
      select sum(coalesce(p.price, 0) * c.qty)
      from dori_cart c join dori_products p on p.id = c.product_id
      where c.chat_id = p_chat_id
    ), 0)
  ) into v_res;

  return v_res;
end $$;

create or replace function public.dori_bot_cart_clear(p_chat_id bigint, p_product_id uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.dori_cart
  where chat_id = p_chat_id
    and (p_product_id is null or product_id = p_product_id);
$$;

-- ---------- 6. Buyurtma yaratish ----------
-- Narx MIJOZDAN olinmaydi — katalogdan olinadi va buyurtmada muzlatiladi.
create or replace function public.dori_bot_order_create(p_chat_id bigint, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_no    bigint;
  v_jami  numeric(16,2);
  v_mijoz record;
begin
  select * into v_mijoz from dori_customers where chat_id = p_chat_id;
  if v_mijoz.chat_id is null or v_mijoz.phone is null then
    return jsonb_build_object('ok', false, 'error', 'TANISHTIRILMAGAN');
  end if;
  if v_mijoz.is_blocked then
    return jsonb_build_object('ok', false, 'error', 'BLOKLANGAN');
  end if;

  if not exists (select 1 from dori_cart where chat_id = p_chat_id) then
    return jsonb_build_object('ok', false, 'error', 'SAVAT_BOSH');
  end if;

  insert into dori_orders (chat_id, name, phone, pharmacy, comment)
  values (p_chat_id, v_mijoz.name, v_mijoz.phone, v_mijoz.pharmacy, nullif(trim(p_comment), ''))
  returning id, order_no into v_id, v_no;

  insert into dori_order_items (order_id, product_id, name, price, qty, sum)
  select v_id, p.id, p.name, coalesce(p.price, 0), c.qty, coalesce(p.price, 0) * c.qty
  from dori_cart c
  join dori_products p on p.id = c.product_id
  where c.chat_id = p_chat_id;

  select coalesce(sum(sum), 0) into v_jami from dori_order_items where order_id = v_id;
  update dori_orders set total = v_jami where id = v_id;

  delete from dori_cart where chat_id = p_chat_id;

  return jsonb_build_object('ok', true, 'order_id', v_id, 'order_no', v_no, 'total', v_jami);
end $$;

-- ---------- 7. Mijozning buyurtmalari ----------
create or replace function public.dori_bot_orders(p_chat_id bigint, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select o.id, o.order_no, o.status, o.total, o.created_at,
           (select count(*) from dori_order_items i where i.order_id = o.id) as items_count
    from dori_orders o
    where o.chat_id = p_chat_id
    order by o.created_at desc
    limit least(coalesce(p_limit, 10), 30)
  ) t;

  return v_res;
end $$;

-- ---------- Huquqlar: hammasi faqat service_role uchun ----------
revoke all on function public.dori_bot_link(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.dori_bot_link(bigint, text, text, text) to service_role;

revoke all on function public.dori_bot_cart_add(bigint, uuid, numeric) from public, anon, authenticated;
grant execute on function public.dori_bot_cart_add(bigint, uuid, numeric) to service_role;

revoke all on function public.dori_bot_cart(bigint) from public, anon, authenticated;
grant execute on function public.dori_bot_cart(bigint) to service_role;

revoke all on function public.dori_bot_cart_clear(bigint, uuid) from public, anon, authenticated;
grant execute on function public.dori_bot_cart_clear(bigint, uuid) to service_role;

revoke all on function public.dori_bot_order_create(bigint, text) from public, anon, authenticated;
grant execute on function public.dori_bot_order_create(bigint, text) to service_role;

revoke all on function public.dori_bot_orders(bigint, int) from public, anon, authenticated;
grant execute on function public.dori_bot_orders(bigint, int) to service_role;
