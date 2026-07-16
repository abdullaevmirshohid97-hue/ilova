-- =============================================================
-- ILOVA B2B — Row Level Security
-- KRITIK: narx maxfiyligi va ma'lumot izolyatsiyasi BAZA darajasida.
-- Frontend yoki API xatosi ham boshqa mijoz narxini ochib berolmaydi.
-- =============================================================

-- -------------------------------------------------------------
-- Yordamchi funksiyalar (security definer — RLS rekursiyasiz)
-- -------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_customer_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select customer_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_price_group_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.price_group_id
  from public.profiles p
  join public.customers c on c.id = p.customer_id
  where p.id = auth.uid();
$$;

-- -------------------------------------------------------------
-- RLS ni yoqish — istisnosiz barcha jadvallarda
-- -------------------------------------------------------------
alter table public.price_groups     enable row level security;
alter table public.customers        enable row level security;
alter table public.profiles         enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images   enable row level security;
alter table public.prices           enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.stock_levels     enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payments         enable row level security;
alter table public.ledger_entries   enable row level security;

-- -------------------------------------------------------------
-- PROFILES: har kim faqat o'z profilini ko'radi; admin hammani
-- -------------------------------------------------------------
create policy "profiles: own read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: admin write" on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- KATALOG: hamma autentifikatsiyalangan foydalanuvchi o'qiydi
-- (mijoz faqat faol pozitsiyalarni), faqat admin yozadi
-- -------------------------------------------------------------
create policy "categories: read" on public.categories
  for select to authenticated using (true);
create policy "categories: admin write" on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "products: read" on public.products
  for select to authenticated
  using (is_active or public.is_admin());
create policy "products: admin write" on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "variants: read" on public.product_variants
  for select to authenticated
  using (is_active or public.is_admin());
create policy "variants: admin write" on public.product_variants
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "images: read" on public.product_images
  for select to authenticated using (true);
create policy "images: admin write" on public.product_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- NARXLAR — ENG MUHIM QOIDA:
-- mijoz FAQAT o'z narx-guruhidagi qatorlarni ko'radi.
-- Mijoz A 2900 ni, Mijoz B 3100 ni ko'radi — bir-birinikini HECH QACHON.
-- -------------------------------------------------------------
create policy "prices: own group only" on public.prices
  for select to authenticated
  using (
    public.is_admin()
    or price_group_id = public.current_price_group_id()
  );

create policy "prices: admin write" on public.prices
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "price_groups: read own" on public.price_groups
  for select to authenticated
  using (public.is_admin() or id = public.current_price_group_id());
create policy "price_groups: admin write" on public.price_groups
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- MIJOZLAR: mijoz faqat o'z kartochkasini ko'radi
-- -------------------------------------------------------------
create policy "customers: own read" on public.customers
  for select to authenticated
  using (public.is_admin() or id = public.current_customer_id());
create policy "customers: admin write" on public.customers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------
-- OMBOR: qoldiqni hamma ko'radi (jonli), jurnal — faqat admin.
-- Yozish TO'G'RIDAN-TO'G'RI TAQIQLANGAN — faqat RPC funksiyalar orqali.
-- -------------------------------------------------------------
create policy "stock_levels: read" on public.stock_levels
  for select to authenticated using (true);

create policy "stock_movements: admin read" on public.stock_movements
  for select to authenticated using (public.is_admin());
-- INSERT policy YO'Q: harakatlar faqat security definer RPC orqali yoziladi

-- -------------------------------------------------------------
-- BUYURTMALAR: mijoz o'zinikini ko'radi, admin hammasini.
-- Yaratish/tasdiqlash faqat RPC orqali (narxni mijoz o'zi qo'yolmaydi).
-- -------------------------------------------------------------
create policy "orders: own read" on public.orders
  for select to authenticated
  using (public.is_admin() or customer_id = public.current_customer_id());

create policy "order_items: own read" on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or order_id in (
      select id from public.orders
      where customer_id = public.current_customer_id()
    )
  );

-- -------------------------------------------------------------
-- MOLIYA: mijoz faqat o'z balans tarixini ko'radi
-- -------------------------------------------------------------
create policy "ledger: own read" on public.ledger_entries
  for select to authenticated
  using (public.is_admin() or customer_id = public.current_customer_id());

create policy "payments: own read" on public.payments
  for select to authenticated
  using (public.is_admin() or customer_id = public.current_customer_id());

-- -------------------------------------------------------------
-- STORAGE: rasmlarni hamma ko'radi, faqat admin yuklaydi
-- -------------------------------------------------------------
create policy "product images: public read" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "product images: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product images: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

create policy "product images: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
