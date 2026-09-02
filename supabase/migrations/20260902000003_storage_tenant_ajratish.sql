-- =============================================================
--  KRITIK: FAYLLAR HAMMAGA OCHIQ EDI
--
--  Tekshiruv (jonli bazada, hech qanday login'siz):
--    - avatars bucket ro'yxati ochiq edi -> mijoz suratining yo'li
--      bilinardi
--    - o'sha yo'l bilan surat YUKLAB OLINDI: 86 KB jpeg, clary
--      tenantining haqiqiy mijozi
--    - product-images ro'yxatida 28 ta mahsulot rasmi - boshqa
--      tenantning tovarlari, raqobatchiga ochiq
--
--  Yozish tomonida ham teshik bor edi: o'chirish va ustiga yozish
--  siyosati faqat is_admin() ni tekshirardi, org_id ni emas. Ya'ni
--  BIR TENANT ADMINI BOSHQA TENANTNING RASMLARINI O'CHIRIB
--  TASHLASHI mumkin edi.
--
--  YECHIM:
--   1. avatars - yopiq bucket. Mijoz surati shaxsiy ma'lumot, uni
--      internetga qo'yish mumkin emas. Panel imzolangan havola
--      (signed URL) bilan ko'rsatadi.
--   2. product-images - ochiq qoladi (mijoz ilovasi va faktura
--      rasmlari shunga tayanadi), lekin RO'YXAT yopiladi: bitta
--      rasmni ko'rish bilan butun katalogni ko'chirib olish
--      o'rtasida katta farq bor.
--   3. O'chirish/yozish siyosatlariga org tekshiruvi qo'shiladi.
-- =============================================================

-- ---------- 1. Avatarlar yopiq bucket ----------
update storage.buckets set public = false where id = 'avatars';

drop policy if exists "avatars: public read" on storage.objects;

-- Suratni faqat egasiga aloqador odam ko'radi. Yo'l customers.photo_path
-- da saqlangani uchun bog'lanish aynan shu orqali quriladi.
create policy "avatars: scoped read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from public.customers c
      where c.photo_path = storage.objects.name
        and (
          (public.is_admin() and c.org_id = public.current_org_id())
          or c.id = public.current_customer_id()
          or c.manager_id = public.current_manager_id()
        )
    )
  );

-- ---------- 2. Mahsulot rasmlari: ro'yxat yopiladi ----------
-- Bucket ochiq qoladi, ya'ni /object/public/... havolasi ishlayveradi
-- (mijoz ilovasi va fakturadagi rasmlar shunga bog'liq). Lekin
-- storage.objects ustidan SELECT olib tashlanadi - ro'yxat olish
-- aynan shu orqali ketadi.
drop policy if exists "product images: public read" on storage.objects;

-- Panelning o'ziga ro'yxat kerak bo'lsa - faqat o'z tenantiniki
create policy "product images: scoped list"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = split_part(storage.objects.name, '/', 1)
        and public.is_admin()
        and p.org_id = public.current_org_id()
    )
  );

-- ---------- 3. Yozish: o'z tenantidan tashqariga tegmasin ----------
drop policy if exists "product images: admin update" on storage.objects;
drop policy if exists "product images: admin delete" on storage.objects;

create policy "product images: own org update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = split_part(storage.objects.name, '/', 1)
        and public.is_admin()
        and p.org_id = public.current_org_id()
    )
  );

create policy "product images: own org delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = split_part(storage.objects.name, '/', 1)
        and public.is_admin()
        and p.org_id = public.current_org_id()
    )
  );

drop policy if exists "avatars: admin update" on storage.objects;
drop policy if exists "avatars: admin delete" on storage.objects;

-- Avatarda yo'lda org yo'q ('customers/fayl.jpg'), shuning uchun
-- bog'lanish customers jadvali orqali. Yangi surat qo'yish (insert)
-- eski siyosatda qoladi: fayl avval yuklanadi, mijoz qatori keyin
-- yoziladi - ya'ni insert paytida bog'lanish hali mavjud emas.
create policy "avatars: own org update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from public.customers c
      where c.photo_path = storage.objects.name
        and public.is_admin()
        and c.org_id = public.current_org_id()
    )
  );

create policy "avatars: own org delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from public.customers c
      where c.photo_path = storage.objects.name
        and public.is_admin()
        and c.org_id = public.current_org_id()
    )
  );
