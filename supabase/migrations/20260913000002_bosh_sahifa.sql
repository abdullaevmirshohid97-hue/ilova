-- =============================================================
-- YUKCHIBOLLA — mijoz ilovasining bosh sahifasi
--
-- Ilova hozirgacha to'g'ridan katalogdan ochilardi. Ulgurji mijoz esa
-- har hafta keladi va unga birinchi navbatda uchta narsa kerak:
--   · qarzi qancha
--   · oxirgi buyurtmasini takrorlash
--   · korxona nimani ko'p sotadi / nima yangi kelgan
--
-- Shu uchta narsa uchun bu yerda ikkita qism bor:
--   1. bannerlar   — admin qo'yadigan kampaniya kartochkasi
--   2. eng_kop_sotilgan() — mijoz BOSHQALARNING buyurtmasini ko'ra
--      olmaydi (RLS), shuning uchun yig'indi security definer
--      funksiyada hisoblanadi va FAQAT mahsulot id'larini qaytaradi
--
-- Banner rasmi alohida bucket ochmasdan `product-images` ichida
-- turadi (u allaqachon ochiq va mijozga ko'rinadi), yo'l:
--     bannerlar/<org_id>/<fayl>
-- Shunga mos storage siyosatlari ham quyida — `is_admin()` YOLG'IZ
-- yetarli emas, org ham tekshiriladi.
-- =============================================================

-- ---------- 1. Bannerlar ----------

create table if not exists public.bannerlar (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade
                default public.current_org_id(),
  sarlavha    text not null,
  matn        text,
  tugma_matni text,
  -- product-images bucket ichidagi yo'l. Bo'sh bo'lsa banner faqat
  -- matndan iborat bo'ladi — rasm shart emas.
  rasm_path   text,
  tartib      int  not null default 0,
  faol        boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists bannerlar_org_idx on public.bannerlar (org_id, tartib);

alter table public.bannerlar enable row level security;

-- Mijoz o'z tenantining bannerini ko'radi
drop policy if exists "bannerlar: org oqiydi" on public.bannerlar;
create policy "bannerlar: org oqiydi" on public.bannerlar
  for select to authenticated
  using (org_id = public.current_org_id());

-- Yozish faqat adminga va faqat O'Z tenantiga
drop policy if exists "bannerlar: admin yozadi" on public.bannerlar;
create policy "bannerlar: admin yozadi" on public.bannerlar
  for all to authenticated
  using (public.is_admin() and org_id = public.current_org_id())
  with check (public.is_admin() and org_id = public.current_org_id());

-- ---------- 2. Banner rasmi uchun storage siyosatlari ----------
--
-- Mavjud `product images: *` siyosatlari yo'lning birinchi bo'lagini
-- MAHSULOT id'si deb biladi, shuning uchun bannerlar/... yo'liga
-- o'chirish/ro'yxat ishlamasdi: admin qo'ygan rasmini olib tashlay
-- olmasdi. Insert allaqachon ochiq (is_admin), qolgan uchtasi shu yerda.

drop policy if exists "bannerlar rasm: org admini korad" on storage.objects;
create policy "bannerlar rasm: org admini korad" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-images'
    and split_part(name, '/', 1) = 'bannerlar'
    and public.is_admin()
    and split_part(name, '/', 2) = public.current_org_id()::text
  );

drop policy if exists "bannerlar rasm: org admini yangilaydi" on storage.objects;
create policy "bannerlar rasm: org admini yangilaydi" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and split_part(name, '/', 1) = 'bannerlar'
    and public.is_admin()
    and split_part(name, '/', 2) = public.current_org_id()::text
  );

drop policy if exists "bannerlar rasm: org admini ochiradi" on storage.objects;
create policy "bannerlar rasm: org admini ochiradi" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and split_part(name, '/', 1) = 'bannerlar'
    and public.is_admin()
    and split_part(name, '/', 2) = public.current_org_id()::text
  );

-- ---------- 3. Eng ko'p sotilgan mahsulotlar ----------
--
-- Mijoz boshqalarning buyurtmasini KO'RMAYDI — shuning uchun yig'indi
-- security definer funksiyada. Tashqariga faqat mahsulot id'lari
-- chiqadi: kim qancha olgani, qanday narxda olgani sirligicha qoladi.
-- Bekor qilingan buyurtma hisobga olinmaydi.

create or replace function public.eng_kop_sotilgan(p_limit int default 8)
returns table (product_id uuid)
language sql stable security definer set search_path = public
as $$
  with men as (
    select c.org_id
    from profiles p
    join customers c on c.id = p.customer_id
    where p.id = auth.uid()
  )
  select v.product_id
  from order_items oi
  join orders o           on o.id = oi.order_id and o.status <> 'cancelled'
  join customers oc       on oc.id = o.customer_id
  join product_variants v on v.id = oi.variant_id and v.is_active
  join products pd        on pd.id = v.product_id and pd.is_active
  where oc.org_id = (select org_id from men)
    and pd.org_id = (select org_id from men)
  group by v.product_id
  order by sum(oi.qty) desc
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on function public.eng_kop_sotilgan(int) from public, anon;
grant execute on function public.eng_kop_sotilgan(int) to authenticated;

comment on function public.eng_kop_sotilgan(int) is
  'Tenantning eng ko''p sotilgan mahsulot id''lari. Mijoz o''zganing buyurtmasini ko''rmaydi, shuning uchun yig''indi shu yerda hisoblanadi va faqat id qaytadi.';
