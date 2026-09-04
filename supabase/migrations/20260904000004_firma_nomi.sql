-- =============================================================
--  PRAYS SARLAVHASIDAGI FIRMA NOMI
--
--  Eksport qilinadigan prays mijozga ketadi va uning boshida firma
--  nomi turadi. Uni kodga qotirib qo'yish noto'g'ri: nom o'zgarsa
--  yoki xato yozilsa - deploy kutish kerak bo'lardi.
--
--  dori_settings bitta qatorli sozlama jadvali (id boolean primary
--  key), shuning uchun yangi ustun shu yerga.
-- =============================================================

alter table dori_settings
  add column if not exists firma_nomi text not null default 'IDAA FARM';

comment on column dori_settings.firma_nomi is
  'Eksport qilinadigan prays sarlavhasida chiqadigan nom.';
