-- =============================================================
-- YUKCHIBOLLA — menejer narxi endi kasr (sent) qo'llab-quvvatlaydi.
-- Sabab: menejer bazani dollarga o'girib, ustiga ustama qo'shganda
-- (masalan 3000 so'm =~ $0.24 + $0.5 ustama = $0.74) natija butun
-- son bo'lmaydi — numeric(14,0) buni 0 ga yaxlitlab yuborardi.
-- =============================================================

alter table public.manager_prices alter column price type numeric(14,2);
alter table public.manager_customer_prices alter column price type numeric(14,2);
alter table public.order_items alter column orig_price type numeric(14,2);
