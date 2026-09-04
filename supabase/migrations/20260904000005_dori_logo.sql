-- =============================================================
--  PRAYS SARLAVHASIDAGI LOGO
--
--  Eksport qilinadigan prays mijozga ketadi va u brendni ko'rsatishi
--  kerak. Logo rasmini kodga joylash mumkin emas: u o'zgaradi, katta
--  bo'ladi va har o'zgarishda deploy kutish kerak bo'lardi.
--
--  Shuning uchun: yopiq bucket + dori_settings.logo_path.
--
--  BUCKET YOPIQ: logo brend belgisi, uni internetga qo'yish shart
--  emas. Panel uni yuklab olib, hujjat ichiga joylaydi - ya'ni fayl
--  mijozga hujjat bilan birga boradi, havola bilan emas.
-- =============================================================

alter table dori_settings
  add column if not exists logo_path text;

comment on column dori_settings.logo_path is
  'Prays sarlavhasidagi logo. dori-logo bucket ichidagi yo''l.';


-- ---------- Bucket ----------
insert into storage.buckets (id, name, public)
values ('dori-logo', 'dori-logo', false)
on conflict (id) do update set public = false;

-- Faqat super admin: bu dorixona biznesining o'z brendi, tenantlarga
-- aloqasi yo'q.
drop policy if exists "dori logo: super admin oqiydi" on storage.objects;
create policy "dori logo: super admin oqiydi"
  on storage.objects for select to authenticated
  using (bucket_id = 'dori-logo' and is_super_admin());

drop policy if exists "dori logo: super admin yozadi" on storage.objects;
create policy "dori logo: super admin yozadi"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dori-logo' and is_super_admin());

drop policy if exists "dori logo: super admin almashtiradi" on storage.objects;
create policy "dori logo: super admin almashtiradi"
  on storage.objects for update to authenticated
  using (bucket_id = 'dori-logo' and is_super_admin());

drop policy if exists "dori logo: super admin ochiradi" on storage.objects;
create policy "dori logo: super admin ochiradi"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dori-logo' and is_super_admin());
