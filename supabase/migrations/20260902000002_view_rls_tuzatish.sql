-- =============================================================
--  KRITIK: TENANTLAR ORASIDA MIJOZ MA'LUMOTI SIZGAN
--
--  Belgisi: Mary Collection admini o'z panelida clary tenantining
--  mijozlarini ko'rgan. Jonli tekshiruvda tasdiqlandi - o'sha admin
--  hisobi bilan customers_masked'dan 7 qator keldi, ulardan 6 tasi
--  BOSHQA tenantniki.
--
--  SABAB: customers_masked - VIEW. Postgres'da view standart holatda
--  o'z EGASI (postgres) nomidan bajariladi, ya'ni asosidagi jadvalning
--  RLS siyosatlari UMUMAN ishlamaydi. Siyosatlarning o'zi to'g'ri edi
--  (is_admin() and org_id = current_org_id()) - ular shunchaki
--  chaqirilmagan.
--
--  Buni ko'rish qiyin: `customers` jadvalidan o'qilsa hammasi to'g'ri
--  ishlaydi, faqat view orqali o'qilganda ochilib ketadi. Panel esa
--  aynan view'dan o'qiydi (telefon raqamini menejerdan yashirish uchun).
--
--  YECHIM: security_invoker - view CHAQIRUVCHI nomidan bajariladi,
--  ya'ni uning RLS'i qo'llanadi. customer_balances view'ida bu
--  allaqachon yoqilgan edi, customers_masked'da esa unutilgan.
--
--  Service_role (edge funksiyalar, botlar) baribir RLS'dan ustun
--  turadi, shuning uchun ular ishlashda davom etadi.
-- =============================================================

alter view public.customers_masked set (security_invoker = on);

-- Kelajakda yangi view qo'shilganda ham unutilmasin: bu jadval
-- tenantlar ma'lumotiga tegadigan har bir view uchun majburiy.
comment on view public.customers_masked is
  'Mijozlar - menejerga biriktirilgan mijozning telefoni yashiriladi. '
  'security_invoker=on MAJBURIY: usiz view postgres nomidan ishlab, '
  'RLS ni chetlab o''tadi va tenantlar ma''lumoti aralashib ketadi.';
