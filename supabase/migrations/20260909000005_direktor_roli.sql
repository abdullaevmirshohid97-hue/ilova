-- =============================================================
-- YUKCHIBOLLA — DIREKTOR roli (faqat kuzatuvchi)
--
-- Direktor korxonaning ishini ko'radi: buyurtmalar, sotuv, moliya,
-- tahlil va hisobotlar. Hech narsani o'zgartira olmaydi — faqat o'z
-- parolini almashtira oladi.
--
-- MUHIM: is_admin() ga TEGILMAYDI. U role in ('admin','super_admin')
-- bo'lib qoladi, ya'ni direktor mavjud 140 ta yozish siyosati va
-- 29 ta funksiya tekshiruvidan avtomatik ravishda o'tolmaydi.
-- Direktorga faqat YANGI "for select" siyosatlar qo'shiladi —
-- Postgres siyosatlarni OR bilan birlashtiradi, shuning uchun bu
-- qo'shimcha va mavjud xatti-harakatni o'zgartirmaydi.
--
-- Nima uchun is_admin() ga direktorni qo'shmadik: u "for all"
-- siyosatlarda ham turibdi, ya'ni bir belgi bilan direktor butun
-- katalogni o'chira oladigan bo'lardi.
-- =============================================================

-- ---------- 1. Rol ----------
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'customer', 'manager', 'director'));

create or replace function public.is_direktor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'director'
  );
$$;

comment on function public.is_direktor() is
  'Kuzatuvchi rol. Hech qanday yozish siyosatida ISHLATILMASIN.';

-- ---------- 2. Ko'rish siyosatlari ----------
-- categories, organizations, product_images, stock_levels allaqachon
-- butun org uchun ochiq (current_org_id() bilan) — ular direktorga ham
-- ishlaydi, qayta yozish shart emas.

create policy "orders: direktor read" on public.orders
  for select to authenticated
  using (
    is_direktor()
    and customer_id in (select id from public.customers where org_id = current_org_id())
  );

create policy "order_items: direktor read" on public.order_items
  for select to authenticated
  using (
    is_direktor()
    and order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.org_id = current_org_id()
    )
  );

create policy "customers: direktor read" on public.customers
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());

-- Mahsulot/variantda "is_active or is_admin()" sharti bor: direktor
-- hisobotda o'chirilgan mahsulotni ham ko'rishi kerak, aks holda eski
-- buyurtmadagi tovar nomi "—" bo'lib chiqardi.
create policy "products: direktor read" on public.products
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());

create policy "variants: direktor read" on public.product_variants
  for select to authenticated
  using (
    is_direktor()
    and product_id in (select id from public.products where org_id = current_org_id())
  );

create policy "prices: direktor read" on public.prices
  for select to authenticated
  using (
    is_direktor()
    and price_group_id in (select id from public.price_groups where org_id = current_org_id())
  );

create policy "price_groups: direktor read" on public.price_groups
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());

create policy "stock_movements: direktor read" on public.stock_movements
  for select to authenticated
  using (
    is_direktor()
    and variant_id in (
      select v.id from public.product_variants v
      join public.products pd on pd.id = v.product_id
      where pd.org_id = current_org_id()
    )
  );

-- Moliya: qarzlar va to'lovlar
create policy "ledger_entries: direktor read" on public.ledger_entries
  for select to authenticated
  using (
    is_direktor()
    and customer_id in (select id from public.customers where org_id = current_org_id())
  );

create policy "payments: direktor read" on public.payments
  for select to authenticated
  using (
    is_direktor()
    and customer_id in (select id from public.customers where org_id = current_org_id())
  );

create policy "design_orders: direktor read" on public.design_orders
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());

-- ---------- 3. Menejer mijozining telefoni direktorga ham yashirin ----------
-- Xato bo'lardi: niqob sharti "is_admin()" edi. Direktor uchun
-- is_admin() FALSE qaytaradi — ya'ni yangi rol qo'shilishi bilan
-- menejer mijozining telefoni ochilib qolardi, hech qanday xato
-- bermasdan. Endi shart teskari yozilgan: telefonni faqat EGASI
-- (o'sha menejer) va mijozning O'ZI ko'radi.
create or replace view public.customers_masked as
select
  id, org_id, name,
  case
    when manager_id is not null
     and manager_id is distinct from public.current_manager_id()
     and id is distinct from public.current_customer_id()
    then null
    else phone
  end as phone,
  email,
  address, region, price_group_id, manager_id, display_currency,
  photo_path, is_active, notes, created_at
from public.customers;

alter view public.customers_masked set (security_invoker = on);

comment on view public.customers_masked is
  'Menejer mijozining telefoni korxona xodimlaridan (admin, direktor) yashirin. security_invoker MAJBURIY — busiz view RLS ni chetlab o''tadi.';
