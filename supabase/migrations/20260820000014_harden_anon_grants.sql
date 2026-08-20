-- =============================================================
--  XAVFSIZLIKNI MUSTAHKAMLASH — "orqa eshik qolmasin"
--
--  Muammoning ildizi: Supabase'da public sxemada yaratilgan HAR QANDAY
--  funksiyaga EXECUTE huquqi default privileges orqali `anon` roliga
--  avtomatik beriladi. `anon` kaliti esa client bundle'da — ya'ni ochiq.
--  Bu safar funksiyalarning o'zida ruxsat tekshiruvi bor edi (tekshirib
--  chiqildi: add_stock, admin_create_order, edit_order_items,
--  record_payment, update_org_profile, set_my_* — hammasi anon uchun
--  RUXSAT_YOQ qaytardi), lekin himoya BITTA qatorga tayanib qolgan edi:
--  yangi funksiyada tekshiruv unutilsa, u darhol ochiq bo'lib qolardi.
--
--  Shu sabab ikki qatlam qo'shiladi:
--    1) mavjud funksiyalardan anon EXECUTE olib tashlanadi;
--    2) BUNDAN KEYIN yaratiladigan funksiyalarga ham anon avtomatik
--       huquq olmaydi (alter default privileges).
--
--  Ilovalar buni sezmaydi: admin panel ham, mobil ilova ham RPC'larni
--  faqat login qilgandan keyin (authenticated bo'lib) chaqiradi —
--  tekshirildi, anon holatida chaqiriladigan RPC yo'q.
--
--  Agar kelajakda ROSTDAN anon uchun funksiya kerak bo'lsa (masalan
--  ochiq katalog), unga huquq ATAYLAB berilishi kerak:
--      grant execute on function public.xxx() to anon;
-- =============================================================

-- ---------- 1. Mavjud funksiyalar ----------
-- Kengaytma (pg_trgm va h.k.) funksiyalariga TEGILMAYDI: ular
-- qidiruv operatorlari bilan bog'liq va ularni cheklash izlanishni
-- buzishi mumkin.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'   -- kengaytmaga tegishli
      )
  loop
    execute format('revoke execute on function %s from anon', r.f);
  end loop;
end $$;

-- ---------- 2. Kelajakdagi funksiyalar ----------
alter default privileges in schema public revoke execute on functions from anon;

-- ---------- 3. Faqat ichki jadvallar: anon/authenticated umuman tegmasin ----------
-- Bularda policy ataylab yo'q (faqat service_role va security-definer
-- funksiyalar ishlaydi). Grant ham bo'lmasa, kelajakda kimdir xato bilan
-- policy qo'shib yuborsa ham ma'lumot ochilmaydi.
revoke all on table public.app_secrets          from anon, authenticated;
revoke all on table public.staff_telegram_codes from anon, authenticated;
revoke all on table public.staff_bot_state      from anon, authenticated;
revoke all on table public.staff_order_notified from anon, authenticated;

-- Bularda authenticated uchun policy bor (panel o'qiydi), anon uchun yo'q
revoke all on table public.staff_telegram        from anon;
revoke all on table public.staff_bot_actions     from anon;
revoke all on table public.telegram_sessions     from anon;
revoke all on table public.telegram_notifications from anon;

-- ---------- 4. Trigger/cron funksiyalari ----------
-- Bularni hech kim to'g'ridan-to'g'ri chaqirmasligi kerak
revoke all on function public.staff_notify_new_order()  from anon, authenticated, public;
revoke all on function public.staff_send_daily_digest() from anon, authenticated, public;
