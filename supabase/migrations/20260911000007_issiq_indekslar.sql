-- =============================================================
-- YUKCHIBOLLA — issiq yo'llardagi indekslar
--
-- Auditda 70 ta indekssiz tashqi kalit topildi. Ko'pi `created_by`
-- kabi ustunlar — ular bo'yicha hech qachon qidirilmaydi, indeks
-- faqat yozishni sekinlashtirardi.
--
-- Lekin bir nechtasi HAR SO'ROVDA ishlatiladi:
--
--   customers.org_id     — RLS siyosati har o'qishda tekshiradi
--   products.org_id      — ayni shunday
--   categories.org_id
--   order_items.variant_id       — buyurtma qatorlari joini
--   dori_batches.product_id      — partiyalar joini (3 600 dori)
--   qarz_transactions.agent_id   — bot har so'rovda agent bo'yicha filtr
--
-- Baza kichik ekan farq sezilmaydi. 3 600 dori va o'sib borayotgan
-- buyurtmada esa RLS ichidagi har bir "in (select ...)" to'liq
-- jadvalni skanerlaydi.
--
-- CONCURRENTLY ISHLATILMAYDI: u tranzaksiya ichida ishlamaydi,
-- migratsiya esa bitta tranzaksiyada ketadi. Jadvallar kichik
-- (eng kattasi 17 000 qator), qulf bir necha millisekund.
-- =============================================================

create index if not exists customers_org_idx           on public.customers(org_id);
create index if not exists products_org_idx            on public.products(org_id);
create index if not exists categories_org_idx          on public.categories(org_id);
create index if not exists order_items_variant_idx     on public.order_items(variant_id);
create index if not exists dori_batches_product_idx    on public.dori_batches(product_id);
create index if not exists qarz_tx_agent_idx           on public.qarz_transactions(agent_id);

-- Qo'shimcha ikkita: ular ham joinda tez-tez uchraydi
create index if not exists customers_price_group_idx   on public.customers(price_group_id);
create index if not exists dori_sale_items_product_idx on public.dori_sale_items(product_id);
