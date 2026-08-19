-- Telegram bot integratsiyasi.
--
-- Mijoz botga /start bosganda uning telegram chat_id'si shu yerda
-- telefon raqami orqali mavjud mijoz kartochkasiga bog'lanadi. Bog'lanish
-- BIR MARTA bo'ladi — keyin buyurtma tasdiqlanganda bot shu chat_id'ga
-- faktura yuboradi.

-- 1) Mijozning telegram identifikatori
alter table public.customers
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_username text;

create unique index if not exists customers_telegram_chat_id_key
  on public.customers (telegram_chat_id)
  where telegram_chat_id is not null;

-- 2) Bot orqali kelgan, hali mijozga bog'lanmagan sessiyalar.
--    Telefon raqam so'ralgach shu yerdan customers'ga ko'chiriladi.
create table if not exists public.telegram_sessions (
  chat_id     bigint primary key,
  username    text,
  first_name  text,
  phone       text,
  customer_id uuid references public.customers(id) on delete set null,
  state       text not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.telegram_sessions enable row level security;

-- Bu jadval bilan faqat edge function (service_role) ishlaydi; hech bir
-- oddiy foydalanuvchi ko'rmasligi kerak, shuning uchun ataylab
-- authenticated uchun policy YO'Q.
drop policy if exists "telegram_sessions: super_admin read" on public.telegram_sessions;
create policy "telegram_sessions: super_admin read"
  on public.telegram_sessions for select
  using (is_super_admin());

-- 3) Buyurtma bo'yicha yuborilgan xabarlar tarixi — bir buyurtma uchun
--    faktura ikki marta yuborilib ketmasin.
create table if not exists public.telegram_notifications (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  chat_id    bigint not null,
  kind       text   not null,
  sent_at    timestamptz not null default now(),
  ok         boolean not null default true,
  error      text
);

create index if not exists telegram_notifications_order_idx
  on public.telegram_notifications (order_id, kind);

alter table public.telegram_notifications enable row level security;

drop policy if exists "telegram_notifications: admin read" on public.telegram_notifications;
create policy "telegram_notifications: admin read"
  on public.telegram_notifications for select
  using (is_admin() or is_super_admin());

-- 4) Faktura uchun buyurtmani to'liq qaytaradigan funksiya.
--    Bot (service_role) ham, admin panel ham shundan foydalanadi, ya'ni
--    faktura mazmuni bitta joyda aniqlanadi.
create or replace function public.order_invoice(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'total',        o.total,
    'base_total',   o.base_total,
    'comment',      o.comment,
    'org_name',     org.name,
    'customer', jsonb_build_object(
      'name',  c.name,
      'phone', c.phone,
      'telegram_chat_id', c.telegram_chat_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       p.name,
               'sku',        pv.sku,
               'size',       pv.size,
               'color',      pv.color,
               'qty',        oi.qty,
               'unit_price', oi.unit_price,
               'discount',   oi.discount,
               'currency',   oi.currency,
               'orig_price', oi.orig_price,
               'line_total', (oi.unit_price - coalesce(oi.discount, 0)) * oi.qty
             ) order by p.name)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join products p          on p.id  = pv.product_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  -- orders'da org_id ustuni yo'q — tenant mijoz orqali aniqlanadi
  from orders o
  join customers c            on c.id = o.customer_id
  left join organizations org on org.id = c.org_id
  where o.id = p_order_id
    and (
      is_super_admin()
      or (is_admin() and c.org_id = current_org_id())
      or (is_manager() and c.manager_id = current_manager_id())
      or c.id = current_customer_id()
    );
$$;

revoke all on function public.order_invoice(uuid) from public;
grant execute on function public.order_invoice(uuid) to authenticated;
