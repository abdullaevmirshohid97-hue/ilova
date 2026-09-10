-- =============================================================
-- YUKCHIBOLLA — ichki funksiyalar `authenticated` uchun ochiq (TESHIK)
--
-- O'tgan migratsiyada PUBLIC va anon dan revoke qilindi. Lekin bu
-- yetarli emas edi: loyihada ALTER DEFAULT PRIVILEGES turibdi —
--
--   postgres yaratgan HAR BIR funksiya avtomatik ravishda
--   `authenticated` va `service_role` ga EXECUTE bilan beriladi
--
-- Ya'ni funksiya yozgan odam hech narsa qilmasa ham, u kirgan
-- HAR QANDAY foydalanuvchi uchun ochiq bo'ladi. anon yopilgani
-- bilan ish tugamaydi: mijoz ham, sklad xodimi ham `authenticated`.
--
-- Xavfli uchtasi (yozadi, ichida kim chaqirayotgani tekshirilmaydi):
--
--   menejer_xaridori(uuid)          — customers ga qator qo'shadi
--   menejer_hisobini_moslash(uuid)  — ledger_entries ga yozadi/o'chiradi
--   qarz_agent_ulash(text, bigint)  — chat_id ni agentga bog'laydi,
--                                     ya'ni "men shu agentman" deyish
--
-- qarz_bot_* funksiyalari ichida RUXSAT_YOQ bor, lekin ular faqat
-- CHAT_ID ga tayanadi. Chat_id maxfiy emas — uni bilgan foydalanuvchi
-- o'sha agent nomidan yozib yuborardi. Ular ham faqat service_role
-- (bot) uchun qoladi.
-- =============================================================

do $$
declare
  r record;
  v_ichki text[] := array[
    -- Faqat boshqa security definer funksiyalar va triggerlar ichidan
    'korinish_narxi', 'korinish_valyutasi', 'hisob_mijozi',
    'menejer_xaridori', 'menejer_hisobini_moslash',
    'qarz_tel_norm', 'qarz_tel9',
    -- Faqat bot (service_role) chaqiradi
    'qarz_agent_ulash', 'qarz_agent_men',
    'qarz_bot_klientlar', 'qarz_bot_klient_qosh', 'qarz_bot_yozuv',
    'qarz_bot_bekor', 'qarz_bot_oxirgi', 'qarz_bot_sverka', 'qarz_bot_hisobot'
  ];
begin
  for r in
    select p.oid::regprocedure as imzo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(v_ichki)
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.imzo);
  end loop;
end $$;

-- Bot chekka funksiyasi service_role bilan ishlaydi — unga
-- default privilege orqali allaqachon berilgan, qo'shimcha grant
-- kerak emas.

comment on function public.qarz_agent_ulash(text, bigint, text, text) is
  'FAQAT bot (service_role). authenticated ga berilmasin: chat_id ni istalgan agentga bog''lab olish mumkin bo''lardi.';
