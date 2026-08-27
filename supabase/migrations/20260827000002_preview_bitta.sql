-- =============================================================
--  OLDINDAN KO'RISH: BITTA FUNKSIYA QOLSIN
--
--  Yangi 6 argumentli variant qo'shilganda eski 4 argumentlisi ham
--  qoldirilgan edi. Oxirgi ikki argument DEFAULT bo'lgani uchun
--  4 ta argument bilan chaqiruv ikkalasiga ham to'g'ri keladi va
--  Postgres "function is not unique" deb rad etadi.
--
--  Eskisi olib tashlanadi: yangisining o'zi 4 argument bilan ham
--  chaqirilaveradi.
-- =============================================================

drop function if exists public.dori_price_preview(text, text, numeric, numeric);
