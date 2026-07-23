-- =============================================================
-- design_orders — mijoz o'zining shaxsiy dizayn buyurtmalarini
-- mobil ilovada ko'ra olishi uchun RLS siyosati.
-- Oldingi migratsiyada faqat admin uchun "all" siyosati bor edi,
-- mijozlar uchun select siyosati yo'q edi (orders/ledger_entries'dagi
-- "own read" naqshiga mos qildik).
-- =============================================================

create policy "design_orders: own read" on public.design_orders
  for select to authenticated
  using (is_admin() or customer_id = public.current_customer_id());
