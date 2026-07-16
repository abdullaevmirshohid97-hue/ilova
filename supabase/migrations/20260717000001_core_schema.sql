-- =============================================================
-- ILOVA B2B — Yadro sxemasi
-- Katalog + Ombor (ledger) + Buyurtma + Moliya (ledger)
-- =============================================================

create extension if not exists pg_trgm;

-- -------------------------------------------------------------
-- 1. NARX GURUHLARI va MIJOZLAR
-- -------------------------------------------------------------
create table public.price_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  phone          text not null unique,
  address        text,
  region         text,
  price_group_id uuid not null references public.price_groups(id),
  credit_limit   numeric(14,0) not null default 0,
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now()
);

-- auth.users <-> rol va mijoz bog'lanishi
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'customer' check (role in ('admin','customer')),
  customer_id uuid references public.customers(id) on delete set null,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Yangi auth user paydo bo'lganda profil avtomatik yaratiladi
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, customer_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'customer_id', '')::uuid
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- 2. KATALOG
-- -------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references public.categories(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  model       text,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  material    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Variant: har bir razmer x rang alohida qoldiq va narxga ega
create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku        text not null unique,
  size       text,
  color      text,
  barcode    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  sort_order   int not null default 0,
  is_primary   boolean not null default false
);

-- Narx: variant x narx_guruhi. Mijoz faqat o'z guruhini ko'radi (RLS).
create table public.prices (
  id             uuid primary key default gen_random_uuid(),
  variant_id     uuid not null references public.product_variants(id) on delete cascade,
  price_group_id uuid not null references public.price_groups(id) on delete cascade,
  price          numeric(14,0) not null check (price >= 0),
  unique (variant_id, price_group_id)
);

-- -------------------------------------------------------------
-- 3. OMBOR — LEDGER USULI
-- Qoldiq hech qachon qo'lda o'zgartirilmaydi: faqat harakat yoziladi,
-- stock_levels trigger orqali avtomatik yangilanadi.
-- -------------------------------------------------------------
create table public.stock_movements (
  id         bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants(id),
  qty        int not null check (qty <> 0), -- + kirim, - chiqim
  reason     text not null check (reason in
               ('production_in','order_out','order_cancel_return','adjustment','return_in')),
  order_id   uuid, -- FK quyida, orders yaratilgach
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.stock_levels (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  qty        bigint not null default 0 check (qty >= 0), -- manfiy qoldiq IMKONSIZ
  updated_at timestamptz not null default now()
);

-- Har bir harakat qoldiqni avtomatik yangilaydi
create or replace function public.tg_apply_stock_movement()
returns trigger language plpgsql as $$
begin
  insert into public.stock_levels (variant_id, qty, updated_at)
  values (new.variant_id, new.qty, now())
  on conflict (variant_id) do update
    set qty = public.stock_levels.qty + excluded.qty,
        updated_at = now();
  return new;
end $$;

create trigger trg_stock_movement
  after insert on public.stock_movements
  for each row execute function public.tg_apply_stock_movement();

-- Variant yaratilganda qoldiq qatori (0) darhol paydo bo'ladi
create or replace function public.tg_init_stock_level()
returns trigger language plpgsql as $$
begin
  insert into public.stock_levels (variant_id, qty) values (new.id, 0)
  on conflict do nothing;
  return new;
end $$;

create trigger trg_variant_created
  after insert on public.product_variants
  for each row execute function public.tg_init_stock_level();

-- -------------------------------------------------------------
-- 4. BUYURTMALAR
-- -------------------------------------------------------------
create table public.orders (
  id           uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id  uuid not null references public.customers(id),
  status       text not null default 'new'
               check (status in ('new','confirmed','picking','done','cancelled')),
  total        numeric(14,0) not null default 0,
  comment      text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now()
);

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  qty        int not null check (qty > 0),
  unit_price numeric(14,0) not null, -- buyurtma paytida MUZLATILGAN narx
  unique (order_id, variant_id)
);

alter table public.stock_movements
  add constraint fk_stock_movements_order
  foreign key (order_id) references public.orders(id);

-- -------------------------------------------------------------
-- 5. MOLIYA — LEDGER USULI
-- Balans = yozuvlar yig'indisi. + qarz, - to'lov/chegirma.
-- -------------------------------------------------------------
create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  amount      numeric(14,0) not null check (amount > 0),
  method      text not null check (method in ('cash','card','transfer')),
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table public.ledger_entries (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id),
  amount      numeric(14,0) not null, -- + qarz, - to'lov
  kind        text not null check (kind in
                ('order_debt','payment','discount','adjustment','cancel_reversal')),
  order_id    uuid references public.orders(id),
  payment_id  uuid references public.payments(id),
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- Mijoz balansi (security_invoker: RLS ishlaydi — mijoz faqat o'zinikini ko'radi)
create view public.customer_balances
with (security_invoker = true) as
select customer_id, coalesce(sum(amount), 0)::numeric(14,0) as balance
from public.ledger_entries
group by customer_id;

-- -------------------------------------------------------------
-- 6. updated_at avtomatik yangilanishi
-- -------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_products_updated before update on public.products
  for each row execute function public.tg_set_updated_at();
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.tg_set_updated_at();

-- -------------------------------------------------------------
-- 7. QIDIRUV va TEZLIK INDEKSLARI (100 000+ mahsulot uchun)
-- -------------------------------------------------------------
create index idx_products_name_trgm  on public.products using gin (name gin_trgm_ops);
create index idx_products_model_trgm on public.products using gin (model gin_trgm_ops);
create index idx_variants_sku_trgm   on public.product_variants using gin (sku gin_trgm_ops);
create index idx_products_category   on public.products (category_id) where is_active;
create index idx_variants_product    on public.product_variants (product_id);
create index idx_images_product      on public.product_images (product_id, sort_order);
create index idx_prices_group        on public.prices (price_group_id, variant_id);
create index idx_orders_customer     on public.orders (customer_id, created_at desc);
create index idx_orders_status       on public.orders (status) where status = 'new';
create index idx_order_items_order   on public.order_items (order_id);
create index idx_movements_variant   on public.stock_movements (variant_id, created_at desc);
create index idx_ledger_customer     on public.ledger_entries (customer_id, created_at desc);
create index idx_payments_customer   on public.payments (customer_id, created_at desc);

-- -------------------------------------------------------------
-- 8. REAL-TIME: qoldiq va buyurtmalar jonli efirda
-- -------------------------------------------------------------
alter publication supabase_realtime add table public.stock_levels;
alter publication supabase_realtime add table public.orders;

-- -------------------------------------------------------------
-- 9. RASMLAR UCHUN STORAGE BUCKET
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
