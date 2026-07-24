-- =============================================================
-- YUKCHIBOLLA — menejer o'z mijozini tahrirlay va bloklay olsin.
--
-- "using" — menejer FAQAT allaqachon o'ziga tegishli qatorni tanlay
-- oladi; "with check" — yangilangandan keyin ham manager_id o'zi bo'lib
-- qolishi shart (boshqa menejerga "berib yubora olmaydi" yoki boshqa
-- menejerning mijozini "o'ziga ola olmaydi").
-- =============================================================

create policy "customers: own manager write" on public.customers
  for update to authenticated
  using (manager_id = current_manager_id())
  with check (manager_id = current_manager_id());
