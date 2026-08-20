-- =============================================================
--  TUZATISH: bot uchun mo'ljallangan RPC'lar `anon` roliga ochiq qolgan edi
--
--  Muammo: Supabase'da public sxemadagi yangi funksiyalarga EXECUTE
--  huquqi DEFAULT PRIVILEGES orqali anon/authenticated/service_role'ga
--  avtomatik beriladi. "revoke ... from public" bu grant'ni OLIB
--  TASHLAMAYDI — chunki u `public` psevdo-roliga emas, aynan `anon`
--  roliga yozilgan bo'ladi.
--
--  Oqibati: anon kalit (u client bundle'da, ya'ni ochiq) bilan
--    - staff_chats_for_order(order_id) -> xodimlar chat_id'lari,
--    - order_invoice_for_staff_chat(order_id, chat_id) -> BAZA narxli
--      faktura (admin ko'radigan rasmiy narx!),
--    - order_invoice_for_chat(order_id, chat_id) -> mijoz fakturasi
--  chaqirib olsa bo'lardi. Ya'ni menejer ustamasi ochilib qolishi
--  mumkin edi — bu esa butun diler modelining asosiy sharti.
--
--  Yechim: bu funksiyalarni FAQAT service_role chaqira olsin. Ular
--  auth.uid()ga emas, chat_id'ga tayanadi, shuning uchun ularni
--  brauzerdan chaqirish umuman kerak emas: panel `order_invoice`ni
--  ishlatadi (u auth.uid() bo'yicha tekshiradi va ruxsati bor).
-- =============================================================

revoke all on function public.order_invoice_for_chat(uuid, bigint)          from anon, authenticated, public;
revoke all on function public.order_invoice_for_staff_chat(uuid, bigint)    from anon, authenticated, public;
revoke all on function public.staff_orders_for_chat(bigint, text, int)      from anon, authenticated, public;
revoke all on function public.staff_chats_for_order(uuid)                   from anon, authenticated, public;
revoke all on function public.staff_telegram_link(text, bigint, text, text) from anon, authenticated, public;
revoke all on function public.staff_telegram_link_phone(text, bigint, text, text) from anon, authenticated, public;

grant execute on function public.order_invoice_for_chat(uuid, bigint)          to service_role;
grant execute on function public.order_invoice_for_staff_chat(uuid, bigint)    to service_role;
grant execute on function public.staff_orders_for_chat(bigint, text, int)      to service_role;
grant execute on function public.staff_chats_for_order(uuid)                   to service_role;
grant execute on function public.staff_telegram_link(text, bigint, text, text) to service_role;
grant execute on function public.staff_telegram_link_phone(text, bigint, text, text) to service_role;

-- Panel funksiyalari o'z egasi (auth.uid()) bo'yicha ishlaydi, ular
-- authenticated'da qolishi kerak — lekin anon'ga baribir keraksiz.
revoke all on function public.staff_telegram_code()   from anon, public;
revoke all on function public.staff_telegram_unlink() from anon, public;
grant execute on function public.staff_telegram_code()   to authenticated;
grant execute on function public.staff_telegram_unlink() to authenticated;
