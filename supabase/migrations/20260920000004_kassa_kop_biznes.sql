-- =============================================================
--  CLARY — BIR ODAMDA BIR NECHTA BIZNES
--
--  Muammo. `kassa_royxatdan_ot` ataylab bitta biznesga cheklangan:
--  profil bo'lsa `HISOB_BOR` deb rad etadi. Lekin do'kondorda
--  ko'pincha ikki-uch nuqta bo'ladi va ularning daftari ALOHIDA
--  yuritilishi kerak — bir kassaga qo'shib yuborilsa, qaysi
--  do'kon foyda qilayotgani ko'rinmay qoladi.
--
--  Asos allaqachon bor (20260912000002): `uzvliklar` jadvali,
--  `uzvliklarim()` va `tashkilotni_tanla()`. Lekin oxirgisi
--  ATAYLAB faqat menejerga ochilgan:
--
--    "Qamrov ataylab tor: HOZIRCHA FAQAT MENEJER almasha oladi.
--     Admin huquqi keng va favqulodda kirish oqimlari bilan
--     chirmashgan — u alohida, sinovi bilan ochiladi."
--
--  Shu ogohlantirishga amal qilamiz: `tashkilotni_tanla` GA
--  TEGILMAYDI. O'rniga shu yerda TOR doiradagi kassa funksiyalari
--  ochiladi va ular ikki qorovul bilan cheklangan:
--
--    1. a'zolik `uzvliklar` da bo'lishi shart (rol = admin);
--    2. tashkilot KASSA tashkiloti bo'lishi shart
--       (`yonalishlar @> array['kassa']`).
--
--  Ikkinchisi muhim: odamning B2B tashkilotida ham admin a'zoligi
--  bo'lishi mumkin. Usiz Clary orqali o'sha tashkilotga kirib
--  olardi — bu ilova umuman ko'rsatmasligi kerak bo'lgan joy.
--
--  ILOVA TOMONI. Biznes almashganda mahalliy ombor TOZALANISHI
--  shart (`ombor().tozala()`): u kursorni ham nolga tushiradi.
--  Aks holda ekranda avvalgi biznesning yozuvlari turib qolardi —
--  baza tomonda hech qanday sizish bo'lmasa ham, odam buni
--  sizish deb ko'rardi.
-- =============================================================


-- ---------- 1. Eski foydalanuvchilarga a'zolik ----------
--
-- `kassa_royxatdan_ot` uzvliklar qatorini keyinroq qo'sha
-- boshlagan. Undan oldin ro'yxatdan o'tganlarda a'zolik yo'q va
-- ular o'z biznesini ham ro'yxatda ko'rmasdi.
--
-- Bu backfill hech qanday YANGI huquq bermaydi: u faqat
-- `profiles` da allaqachon turgan bog'lanishni ko'chiradi.
insert into public.uzvliklar (user_id, org_id, role)
select p.id, p.org_id, p.role
  from public.profiles p
  join public.organizations o on o.id = p.org_id
 where p.org_id is not null
   and p.role = 'admin'
   and o.yonalishlar @> array['kassa']
on conflict (user_id, org_id) do nothing;


-- ---------- 2. Mening bizneslarim ----------
create or replace function public.kassa_bizneslarim()
returns table (org_id uuid, nom text, rol text, joriymi boolean, obuna text)
language sql stable security definer set search_path = public
as $$
  select u.org_id,
         o.name,
         u.role,
         u.org_id = (select p.org_id from public.profiles p where p.id = auth.uid()),
         o.subscription_status
    from public.uzvliklar u
    join public.organizations o on o.id = u.org_id
   where u.user_id = auth.uid()
     and o.yonalishlar @> array['kassa']
   order by o.name;
$$;

revoke all on function public.kassa_bizneslarim() from public, anon;
grant execute on function public.kassa_bizneslarim() to authenticated;


-- ---------- 3. Yangi biznes qo'shish ----------
--
-- `kassa_royxatdan_ot` dan farqi: u BIRINCHI biznes uchun (profil
-- yo'q paytda), bu esa KEYINGILARI uchun. Ikkalasi bir funksiyaga
-- birlashtirilmadi: birinchisida profil yaratiladi, bu yerda esa
-- ko'chiriladi — shartlari boshqa, xatolari ham boshqa.
create or replace function public.kassa_biznes_qosh(
  p_nom text,
  p_ism text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
  v_soni int;
begin
  if v_uid is null then
    raise exception 'KIRISH_YOQ: avval tizimga kiring';
  end if;

  -- Profil yo'q = hali birinchi biznes ham yaratilmagan. U holda
  -- `kassa_royxatdan_ot` ishlatiladi, bu emas.
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'HISOB_YOQ: avval birinchi biznesni oching';
  end if;

  if v_nom is null or length(v_nom) < 2 then
    raise exception 'NOM_QISQA: biznes nomi kamida 2 ta belgi';
  end if;
  if length(v_nom) > 80 then
    v_nom := left(v_nom, 80);
  end if;

  -- Chegara: bir odamda 10 tadan ko'p biznes bo'lishi amalda
  -- uchramaydi, lekin cheksiz qoldirilsa RPC ni sikl bilan
  -- chaqirib baza to'ldirib yuborardi.
  select count(*) into v_soni
    from public.uzvliklar u
    join public.organizations o on o.id = u.org_id
   where u.user_id = v_uid and o.yonalishlar @> array['kassa'];
  if v_soni >= 10 then
    raise exception 'KOP_BIZNES: bir hisobda 10 tadan ko''p biznes bo''lmaydi';
  end if;

  -- Bir xil nomli ikkita biznes chalkashtiradi: ro'yxatda ikkalasi
  -- bir xil ko'rinadi va odam qay biriga kirganini bilmaydi.
  if exists (
    select 1 from public.uzvliklar u
      join public.organizations o on o.id = u.org_id
     where u.user_id = v_uid and lower(o.name) = lower(v_nom)
  ) then
    raise exception 'NOM_BAND: bunday nomli biznesingiz bor';
  end if;

  insert into public.organizations (name, subscription_status, yonalishlar, contact_name)
  values (v_nom, 'trial', array['kassa'], nullif(btrim(coalesce(p_ism, '')), ''))
  returning id into v_org;

  insert into public.uzvliklar (user_id, org_id, role)
  values (v_uid, v_org, 'admin')
  on conflict (user_id, org_id) do nothing;

  -- Bo'sh ilova — qo'rqinchli ilova. Birinchi biznesdagi kabi
  -- ikkita hisob va odatiy turkumlar tayyor turadi.
  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, tartib)
  values (v_org, 'Naqd', 'naqd', 'UZS', 0),
         (v_org, 'Karta', 'karta', 'UZS', 1);

  insert into public.kassa_turkumlar (org_id, nom, turi, tartib)
  values (v_org, 'Sotuv',        'kirim',  0),
         (v_org, 'Qarz qaytdi',  'kirim',  1),
         (v_org, 'Boshqa kirim', 'kirim',  2),
         (v_org, 'Tovar',        'chiqim', 0),
         (v_org, 'Ish haqi',     'chiqim', 1),
         (v_org, 'Ijara',        'chiqim', 2),
         (v_org, 'Transport',    'chiqim', 3),
         (v_org, 'Kommunal',     'chiqim', 4),
         (v_org, 'Soliq',        'chiqim', 5),
         (v_org, 'Boshqa chiqim','chiqim', 6);

  -- Yangi biznes DARHOL ochiladi: odam uni yaratib, keyin alohida
  -- tanlashi kerak bo'lsa, ikkinchi qadamni unutardi.
  update public.profiles
     set org_id = v_org, role = 'admin', manager_id = null
   where id = v_uid;

  return v_org;
end $$;

revoke all on function public.kassa_biznes_qosh(text, text) from public, anon;
grant execute on function public.kassa_biznes_qosh(text, text) to authenticated;


-- ---------- 4. Biznesni almashtirish ----------
create or replace function public.kassa_biznes_tanla(p_org_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_uzv public.uzvliklar;
  v_nom text;
begin
  -- auth.uid() null = service_role yoki bot. Bu funksiya ODAM
  -- uchun: tokensiz chaqiruv istalgan profilni ko'chira olmasin.
  if v_uid is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_uzv from public.uzvliklar
   where user_id = v_uid and org_id = p_org_id;
  if not found then
    raise exception 'AZOLIK_YOQ';
  end if;

  if v_uzv.role <> 'admin' then
    raise exception 'RUXSAT_YOQ: bu biznesda admin emassiz';
  end if;

  -- KASSA tashkilotimi. Odamning B2B tashkilotida ham admin
  -- a'zoligi bo'lishi mumkin — Clary u yerga kirmasligi kerak.
  select o.name into v_nom
    from public.organizations o
   where o.id = p_org_id and o.yonalishlar @> array['kassa'];
  if not found then
    raise exception 'KASSA_EMAS: bu biznes Clary uchun emas';
  end if;

  update public.profiles
     set org_id = p_org_id, role = 'admin', manager_id = null
   where id = v_uid;

  return v_nom;
end $$;

revoke all on function public.kassa_biznes_tanla(uuid) from public, anon;
grant execute on function public.kassa_biznes_tanla(uuid) to authenticated;

comment on function public.kassa_biznes_tanla(uuid) is
  'Clary foydalanuvchisining faol biznesini almashtiradi. profiles.org_id ni ko`chiradi — current_org_id() va butun RLS shundan keyin yangi biznesni ko`radi. Ilova mahalliy omborni TOZALASHI shart.';


-- ---------- 5. Nomini o'zgartirish ----------
create or replace function public.kassa_biznes_nomi(p_org_id uuid, p_nom text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
begin
  if v_uid is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  if v_nom is null or length(v_nom) < 2 then
    raise exception 'NOM_QISQA: biznes nomi kamida 2 ta belgi';
  end if;
  if length(v_nom) > 80 then
    v_nom := left(v_nom, 80);
  end if;

  if not exists (
    select 1 from public.uzvliklar u
      join public.organizations o on o.id = u.org_id
     where u.user_id = v_uid and u.org_id = p_org_id
       and u.role = 'admin' and o.yonalishlar @> array['kassa']
  ) then
    raise exception 'RUXSAT_YOQ';
  end if;

  update public.organizations set name = v_nom where id = p_org_id;
  return v_nom;
end $$;

revoke all on function public.kassa_biznes_nomi(uuid, text) from public, anon;
grant execute on function public.kassa_biznes_nomi(uuid, text) to authenticated;


-- ---------- 6. Eski bir argumentli nusxa ----------
--
-- `kassa_biznes_nomi(text)` 20260913000005 da yaratilgan va ilova
-- uni hali ham chaqiradi (sozlamalar ekrani). Endi ikki argumentli
-- nusxa ham bor — ya'ni bitta nom ostida IKKI XIL tekshiruv
-- turibdi: biri `is_admin()`, ikkinchisi `uzvliklar`.
--
-- Ikkisi vaqt o'tib bir-biridan uzoqlashardi va qaysi biri
-- ishlayotganini faqat xato chiqqanda bilinardi. Shuning uchun
-- eskisi endi yangisini CHAQIRADI, o'z tekshiruvi yo'q.
create or replace function public.kassa_biznes_nomi(p_nom text)
returns text
language sql security definer set search_path = public
as $$
  select public.kassa_biznes_nomi(public.current_org_id(), p_nom);
$$;

revoke all on function public.kassa_biznes_nomi(text) from public, anon;
grant execute on function public.kassa_biznes_nomi(text) to authenticated;
