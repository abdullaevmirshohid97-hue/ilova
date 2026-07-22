-- =============================================================
-- ILOVA B2B — SaaS: RLS'ni org bo'yicha yopish
--
-- Har bir siyosat bu yerda 20260717000002_rls_policies.sql'dagi asl
-- versiyasi bilan solishtirib, org tekshiruvi QO'SHILGAN holda qayta
-- yaratiladi. Root jadvallar (organizations, profiles, customers,
-- categories, products, price_groups) — to'g'ridan-to'g'ri org_id.
-- Bola jadvallar (product_variants, prices, stock_levels, stock_movements,
-- orders, order_items, payments, ledger_entries) — ota jadvalga EXISTS/IN
-- subquery orqali.
--
-- super_admin uchun org_id = null, shuning uchun "org_id = current_org_id()"
-- unga har doim FALSE beradi — u avtomatik tenant biznes-ma'lumotini
-- ko'rmaydi (faqat organizations jadvaliga alohida siyosat orqali kiradi).
-- =============================================================

-- -------------------------------------------------------------
-- ORGANIZATIONS (yangi jadval — 0011'da RLS yoqilgan, siyosat yo'q edi)
-- -------------------------------------------------------------
create policy "organizations: super_admin all" on public.organizations
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy "organizations: admin read own" on public.organizations
  for select to authenticated
  using (id = current_org_id());

-- -------------------------------------------------------------
-- PROFILES
-- -------------------------------------------------------------
drop policy "profiles: own read" on public.profiles;
create policy "profiles: own read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or (is_admin() and org_id = current_org_id()));

drop policy "profiles: admin write" on public.profiles;
create policy "profiles: admin write" on public.profiles
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- -------------------------------------------------------------
-- KATEGORIYALAR
-- -------------------------------------------------------------
drop policy "categories: read" on public.categories;
create policy "categories: read" on public.categories
  for select to authenticated
  using (org_id = current_org_id());

drop policy "categories: admin write" on public.categories;
create policy "categories: admin write" on public.categories
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- -------------------------------------------------------------
-- MAHSULOTLAR
-- -------------------------------------------------------------
drop policy "products: read" on public.products;
create policy "products: read" on public.products
  for select to authenticated
  using ((is_active or is_admin()) and org_id = current_org_id());

drop policy "products: admin write" on public.products;
create policy "products: admin write" on public.products
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- -------------------------------------------------------------
-- VARIANTLAR (org_id yo'q — products.org_id orqali)
-- -------------------------------------------------------------
drop policy "variants: read" on public.product_variants;
create policy "variants: read" on public.product_variants
  for select to authenticated
  using (
    (is_active or is_admin())
    and product_id in (select id from public.products where org_id = current_org_id())
  );

drop policy "variants: admin write" on public.product_variants;
create policy "variants: admin write" on public.product_variants
  for all to authenticated
  using (is_admin() and product_id in (select id from public.products where org_id = current_org_id()))
  with check (is_admin() and product_id in (select id from public.products where org_id = current_org_id()));

-- -------------------------------------------------------------
-- RASMLAR (org_id yo'q — products.org_id orqali)
-- -------------------------------------------------------------
drop policy "images: read" on public.product_images;
create policy "images: read" on public.product_images
  for select to authenticated
  using (product_id in (select id from public.products where org_id = current_org_id()));

drop policy "images: admin write" on public.product_images;
create policy "images: admin write" on public.product_images
  for all to authenticated
  using (is_admin() and product_id in (select id from public.products where org_id = current_org_id()))
  with check (is_admin() and product_id in (select id from public.products where org_id = current_org_id()));

-- -------------------------------------------------------------
-- NARX GURUHLARI
-- -------------------------------------------------------------
drop policy "price_groups: read own" on public.price_groups;
create policy "price_groups: read own" on public.price_groups
  for select to authenticated
  using ((is_admin() and org_id = current_org_id()) or id = current_price_group_id());

drop policy "price_groups: admin write" on public.price_groups;
create policy "price_groups: admin write" on public.price_groups
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- -------------------------------------------------------------
-- NARXLAR (org_id yo'q — price_groups.org_id VA product_variants->products.org_id
-- orqali; ikkalasi ham tekshiriladi — aks holda org A o'z narxini org B
-- variantiga "bog'lab qo'yishi" mumkin bo'lib qolardi)
-- -------------------------------------------------------------
drop policy "prices: own group only" on public.prices;
create policy "prices: own group only" on public.prices
  for select to authenticated
  using (
    (is_admin() and price_group_id in (select id from public.price_groups where org_id = current_org_id()))
    or price_group_id = current_price_group_id()
  );

drop policy "prices: admin write" on public.prices;
create policy "prices: admin write" on public.prices
  for all to authenticated
  using (
    is_admin()
    and price_group_id in (select id from public.price_groups where org_id = current_org_id())
    and variant_id in (
      select v.id from public.product_variants v
      join public.products pd on pd.id = v.product_id
      where pd.org_id = current_org_id()
    )
  )
  with check (
    is_admin()
    and price_group_id in (select id from public.price_groups where org_id = current_org_id())
    and variant_id in (
      select v.id from public.product_variants v
      join public.products pd on pd.id = v.product_id
      where pd.org_id = current_org_id()
    )
  );

-- -------------------------------------------------------------
-- MIJOZLAR
-- -------------------------------------------------------------
drop policy "customers: own read" on public.customers;
create policy "customers: own read" on public.customers
  for select to authenticated
  using ((is_admin() and org_id = current_org_id()) or id = current_customer_id());

drop policy "customers: admin write" on public.customers;
create policy "customers: admin write" on public.customers
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- -------------------------------------------------------------
-- OMBOR (org_id yo'q — variant->product->org_id orqali)
-- -------------------------------------------------------------
drop policy "stock_levels: read" on public.stock_levels;
create policy "stock_levels: read" on public.stock_levels
  for select to authenticated
  using (
    variant_id in (
      select v.id from public.product_variants v
      join public.products pd on pd.id = v.product_id
      where pd.org_id = current_org_id()
    )
  );

drop policy "stock_movements: admin read" on public.stock_movements;
create policy "stock_movements: admin read" on public.stock_movements
  for select to authenticated
  using (
    is_admin()
    and variant_id in (
      select v.id from public.product_variants v
      join public.products pd on pd.id = v.product_id
      where pd.org_id = current_org_id()
    )
  );

-- -------------------------------------------------------------
-- BUYURTMALAR (org_id yo'q — customer_id->customers.org_id orqali)
-- -------------------------------------------------------------
drop policy "orders: own read" on public.orders;
create policy "orders: own read" on public.orders
  for select to authenticated
  using (
    (is_admin() and customer_id in (select id from public.customers where org_id = current_org_id()))
    or customer_id = current_customer_id()
  );

drop policy "order_items: own read" on public.order_items;
create policy "order_items: own read" on public.order_items
  for select to authenticated
  using (
    (is_admin() and order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.org_id = current_org_id()
    ))
    or order_id in (select id from public.orders where customer_id = current_customer_id())
  );

-- -------------------------------------------------------------
-- MOLIYA (org_id yo'q — customer_id->customers.org_id orqali)
-- -------------------------------------------------------------
drop policy "ledger: own read" on public.ledger_entries;
create policy "ledger: own read" on public.ledger_entries
  for select to authenticated
  using (
    (is_admin() and customer_id in (select id from public.customers where org_id = current_org_id()))
    or customer_id = current_customer_id()
  );

drop policy "payments: own read" on public.payments;
create policy "payments: own read" on public.payments
  for select to authenticated
  using (
    (is_admin() and customer_id in (select id from public.customers where org_id = current_org_id()))
    or customer_id = current_customer_id()
  );
