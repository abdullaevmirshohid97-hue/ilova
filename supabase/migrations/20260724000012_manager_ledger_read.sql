-- =============================================================
-- YUKCHIBOLLA — menejer o'z mijozlarining qarzdorligini (customer_balances
-- view, security_invoker=true — ledger_entries RLS'iga bog'liq) ko'ra olishi
-- uchun ledger_entries'ga o'qish siyosati qo'shiladi.
-- =============================================================

create policy "ledger_entries: manager read" on public.ledger_entries
  for select to authenticated
  using (customer_id in (select id from public.customers where manager_id = current_manager_id()));
