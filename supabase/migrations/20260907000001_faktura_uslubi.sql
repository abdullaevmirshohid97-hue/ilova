-- =============================================================
--  FAKTURA KO'RINISHI — 1C va Oracle uslublari
--
--  Muammo: mijozga ketadigan faktura landshaft A4 da, jadvali
--  varaq o'rtasiga surilgan, sarlavhasi kodga qotirilgan
--  "IDAA FARM" va firmaning rekvizitlari umuman yo'q edi.
--  Hisob-fakturada bank, STIR va imzo bo'lmasa u rasmiy hujjat
--  emas — buxgalteriya qabul qilmaydi.
--
--  Shu sababli ikki narsa qo'shiladi:
--    1. uslub tanlovi ('1c' | 'oracle')
--    2. rekvizitlar — hujjatga chiqadigan haqiqiy ma'lumot
--
--  Rekvizit KODDA emas, sozlamada: bank yoki hisob raqami
--  o'zgarsa deploy kutish kerak bo'lmasin.
-- =============================================================

alter table dori_settings
  add column if not exists faktura_uslubi text not null default '1c',
  add column if not exists manzil        text,
  add column if not exists telefon       text,
  add column if not exists stir          text,
  add column if not exists bank_nomi     text,
  add column if not exists hisob_raqam   text,
  add column if not exists mfo           text,
  add column if not exists rahbar        text,
  add column if not exists hisobchi      text,
  add column if not exists qqs_foiz      numeric(5,2) not null default 0;

-- Faqat ikki qiymat: chekloq bo'lmasa yozuv xatosi ("1С" kirillcha
-- С bilan) jimgina eski ko'rinishga qaytarib qo'yardi.
alter table dori_settings drop constraint if exists dori_settings_faktura_uslubi_chk;
alter table dori_settings
  add constraint dori_settings_faktura_uslubi_chk
  check (faktura_uslubi in ('1c', 'oracle'));

-- QQS narxga KIRGAN deb hisoblanadi (O'zbekistonda ulgurji narx
-- shunday e'lon qilinadi), shuning uchun 0..100 oralig'i.
alter table dori_settings drop constraint if exists dori_settings_qqs_chk;
alter table dori_settings
  add constraint dori_settings_qqs_chk check (qqs_foiz >= 0 and qqs_foiz <= 100);

comment on column dori_settings.faktura_uslubi is
  '1c yoki oracle — mijozga ketadigan faktura ko''rinishi.';
comment on column dori_settings.qqs_foiz is
  'Narxga KIRGAN QQS foizi. 0 = QQS solinmaydi.';


-- ---------- Rekvizitlarni faktura uchun berish ----------
-- Alohida funksiya: mavjud beshta faktura RPC'siga tegmaymiz.
-- Ularning har biriga rekvizit qo'shish besh joyda bir xil kodni
-- takrorlash bo'lardi va bittasi unutilsa faktura rekvizitsiz
-- chiqib ketardi.
create or replace function public.dori_faktura_firma_srv()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'uslub',       coalesce(s.faktura_uslubi, '1c'),
    'nom',         coalesce(nullif(btrim(s.firma_nomi), ''), 'IDAA FARM'),
    'manzil',      nullif(btrim(coalesce(s.manzil, '')), ''),
    'telefon',     nullif(btrim(coalesce(s.telefon, '')), ''),
    'stir',        nullif(btrim(coalesce(s.stir, '')), ''),
    'bank_nomi',   nullif(btrim(coalesce(s.bank_nomi, '')), ''),
    'hisob_raqam', nullif(btrim(coalesce(s.hisob_raqam, '')), ''),
    'mfo',         nullif(btrim(coalesce(s.mfo, '')), ''),
    'rahbar',      nullif(btrim(coalesce(s.rahbar, '')), ''),
    'hisobchi',    nullif(btrim(coalesce(s.hisobchi, '')), ''),
    'qqs_foiz',    coalesce(s.qqs_foiz, 0),
    'logo_path',   s.logo_path
  )
  from dori_settings s
  where s.id;
$$;

-- Chekka funksiya service_role bilan chaqiradi. Panelga kerak emas:
-- u dori_settings jadvalini to'g'ridan-to'g'ri o'qiydi (RLS super
-- admin bilan cheklangan).
revoke all on function public.dori_faktura_firma_srv() from public, anon, authenticated;
grant execute on function public.dori_faktura_firma_srv() to service_role;
