-- =============================================================
-- CREDIT DEBIT — o'zi ro'yxatdan o'tish (Play Market yo'li)
--
-- Platformada bugungacha hisobni HAR DOIM kimdir bergan: super admin
-- tenant ochadi, tenant admini mijoz/menejer yaratadi. Play Market
-- boshqacha ishlaydi — odam ilovani o'rnatadi va o'zi ro'yxatdan
-- o'tadi. Ya'ni bu migratsiya yangi eshik ochadi va shuning uchun
-- eng ehtiyot bo'ladigan joy.
--
-- MUAMMO: `handle_new_user` triggeri har yangi auth foydalanuvchisi
-- uchun `profiles` qatori yozadi. Metama'lumotsiz kelgan odamda
-- org_id NULL bo'ladi va qator
--     profiles_org_required_unless_super_admin
-- cheklovida yiqiladi. Ya'ni oddiy `signUp` "Database error saving
-- new user" bilan tugaydi — ilova ochilmaydi.
--
-- YECHIM: `dori_mijoz` va `sklad_user` da bo'lgani kabi, metama'lumotda
-- `kassa = 'true'` kelsa trigger chetlab o'tadi. Tenant esa ilova
-- `kassa_royxatdan_ot()` ni chaqirganda tug'iladi — biznes nomi bilan.
--
-- IKKI QADAM BO'LGANI UCHUN: odam ro'yxatdan o'tib, ikkinchi qadamga
-- yetmasligi mumkin (ilova yopildi, internet uzildi). Shunda u
-- "profilsiz" qoladi — ilova buni ko'radi va kirgandan keyin biznes
-- nomini yana so'raydi. Hech narsa yo'qolmaydi.
--
-- CHEKLOV: bitta foydalanuvchi — bitta tashkilot. Busiz bir odam
-- minglab bo'sh tenant ochib bazani to'ldirardi.
-- =============================================================

-- ---------- 1. Trigger: kassa foydalanuvchisini chetlab o'tsin ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $function$
declare
  v_customer_id uuid := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  v_manager_id  uuid := nullif(new.raw_user_meta_data->>'manager_id', '')::uuid;
  v_org_id      uuid := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  v_role        text := coalesce(new.raw_user_meta_data->>'role', 'customer');
begin
  if coalesce(new.raw_user_meta_data->>'dori_mijoz', 'false') = 'true' then
    return new;
  end if;

  -- Sklad xodimi: bog'lanish dori_warehouse_users da
  if coalesce(new.raw_user_meta_data->>'sklad_user', 'false') = 'true' then
    return new;
  end if;

  -- Credit Debit: tenant hali yo'q. Uni `kassa_royxatdan_ot()`
  -- yaratadi — u yerda biznes nomi ham, standart hisob-turkumlar ham
  -- bir vaqtda ochiladi.
  if coalesce(new.raw_user_meta_data->>'kassa', 'false') = 'true' then
    return new;
  end if;

  if v_customer_id is not null then
    select org_id into v_org_id from public.customers where id = v_customer_id;
  end if;
  if v_manager_id is not null then
    select org_id into v_org_id from public.managers where id = v_manager_id;
  end if;

  insert into public.profiles (id, full_name, customer_id, manager_id, org_id, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''),
          v_customer_id, v_manager_id, v_org_id, v_role);

  -- Birinchi a'zolik. Keyingilari admin-create-manager orqali qo'shiladi.
  -- super_admin bundan tashqarida — u tenant a'zosi emas.
  if v_org_id is not null and v_role <> 'super_admin' then
    insert into public.uzvliklar (user_id, org_id, manager_id, role)
    values (new.id, v_org_id, v_manager_id, v_role)
    on conflict (user_id, org_id) do nothing;
  end if;

  return new;
end $function$;


-- ---------- 2. Ro'yxatdan o'tish ----------
create or replace function public.kassa_royxatdan_ot(
  p_biznes text,
  p_ism    text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_nom  text := nullif(btrim(coalesce(p_biznes, '')), '');
  v_bor  int;
begin
  if v_uid is null then
    raise exception 'KIRISH_YOQ: avval tizimga kiring';
  end if;

  -- Bitta foydalanuvchi — bitta tashkilot. Bu tekshiruv ilovada emas,
  -- SHU YERDA turishi kerak: RPC'ni to'g'ridan-to'g'ri chaqirish mumkin.
  select count(*) into v_bor from public.profiles where id = v_uid;
  if v_bor > 0 then
    raise exception 'HISOB_BOR: bu foydalanuvchining tashkiloti allaqachon bor';
  end if;

  if v_nom is null or length(v_nom) < 2 then
    raise exception 'NOM_QISQA: biznes nomi kamida 2 ta belgi';
  end if;
  if length(v_nom) > 80 then
    v_nom := left(v_nom, 80);
  end if;

  insert into public.organizations (name, subscription_status, yonalishlar, contact_name)
  values (v_nom, 'trial', array['kassa'], nullif(btrim(coalesce(p_ism, '')), ''))
  returning id into v_org;

  insert into public.profiles (id, full_name, org_id, role)
  values (v_uid, coalesce(nullif(btrim(coalesce(p_ism, '')), ''), v_nom), v_org, 'admin');

  insert into public.uzvliklar (user_id, org_id, role)
  values (v_uid, v_org, 'admin')
  on conflict (user_id, org_id) do nothing;

  -- Bo'sh ilova — qo'rqinchli ilova. Odam birinchi yozuvni darhol
  -- kirita olishi uchun ikkita hisob va odatiy turkumlar tayyor turadi.
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

  return v_org;
end $$;

-- Loyihada ALTER DEFAULT PRIVILEGES turibdi — yangi funksiya o'zidan
-- o'zi `authenticated` ga ochiladi. Bu yerda aynan shu kerak (kirgan,
-- lekin hali tashkiloti yo'q odam chaqiradi), lekin `anon` yopiq
-- bo'lishi shart: aks holda kalitsiz ham tenant ochib bo'lardi.
revoke all on function public.kassa_royxatdan_ot(text, text) from public, anon;
grant execute on function public.kassa_royxatdan_ot(text, text) to authenticated;

comment on function public.kassa_royxatdan_ot(text, text) is
  'Play Market yo''li: kirgan foydalanuvchiga tashkilot + admin profil + standart hisob/turkum ochadi. Bitta foydalanuvchi — bitta tashkilot.';


-- ---------- 3. "Men kimman" ----------
-- Ilova ochilganda bitta so'rov bilan: profil bormi, tashkiloti qaysi,
-- yo'nalishi nima. Busiz uchta alohida so'rov ketardi va ularning
-- birortasi RLS'ga urilib, ilova sababsiz bo'sh ochilardi.
create or replace function public.kassa_men()
returns table (org_id uuid, biznes text, rol text, yonalishlar text[], obuna text)
language sql stable security definer set search_path = public
as $$
  select o.id, o.name, p.role, o.yonalishlar, o.subscription_status
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid();
$$;

revoke all on function public.kassa_men() from public, anon;
grant execute on function public.kassa_men() to authenticated;
