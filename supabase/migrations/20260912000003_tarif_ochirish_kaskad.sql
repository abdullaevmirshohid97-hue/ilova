-- =============================================================
-- YUKCHIBOLLA — tashkilot o'chirilganda tarifi ham ketsin
--
-- 20260912000001 har yangi tashkilotga 'Standart' tarif qo'shadigan
-- trigger kiritdi. Buning kutilmagan oqibati bor edi:
--
--   ilgari YANGI, BO'SH tashkilotda birorta ham qator yo'q edi, shuning
--   uchun `delete from organizations` bemalol ishlardi. Endi unda tarif
--   turadi va `price_groups_org_id_fkey` (NO ACTION) o'chirishni to'sadi:
--
--     ERROR: update or delete on table "organizations" violates foreign
--            key constraint "price_groups_org_id_fkey"
--
-- Bu ikki joyni sindirardi:
--   1. super-admin-create-org — admin login'i yaratilmasa, u endigina
--      ochgan tenantni O'CHIRIB tashlaydi. Ya'ni xato ustiga xato:
--      yarim ochilgan tenant bazada osilib qolardi.
--   2. tests/favqulodda-kirish.mjs — sinov tashkilotini tozalay olmadi
--      (aynan shu sinov buni topdi)
--
-- Tarif tashkilotga tegishli, undan tashqarida ma'nosi yo'q — demak
-- CASCADE to'g'ri. Qolgan NO ACTION cheklovlari (customers, products,
-- managers...) ATAYLAB joyida qoladi: ichida haqiqiy ma'lumoti bor
-- tenantni tasodifan o'chirib bo'lmasin.
-- =============================================================

alter table public.price_groups
  drop constraint price_groups_org_id_fkey;

alter table public.price_groups
  add constraint price_groups_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;
