-- =============================================================
-- YUKCHIBOLLA — MUHIM XAVFSIZLIK TUZATISHI: design_orders'da tenant
-- (org) izolyatsiyasi teshigi.
--
-- 20260723000002 migratsiyasida "design_orders: own read" siyosati
-- `is_admin() or customer_id = current_customer_id()` deb yozilgan edi —
-- org_id tekshiruvi YO'Q edi. Postgres bir nechta permissive SELECT
-- siyosatini OR bilan birlashtiradi, shuning uchun bu siyosat "admin all"
-- siyosatidagi org_id cheklovini butunlay chetlab o'tar edi: HAR QANDAY
-- tenant (zavod) administratori BOSHQA tenant'ning dizayn buyurtmalarini
-- ham ko'ra olar edi. Foydalanuvchi buni ikkita tenant yaratib sinaganda
-- aniqladi.
-- =============================================================

drop policy "design_orders: own read" on public.design_orders;
create policy "design_orders: own read" on public.design_orders
  for select to authenticated
  using (
    (is_admin() and org_id = current_org_id())
    or customer_id = current_customer_id()
  );
