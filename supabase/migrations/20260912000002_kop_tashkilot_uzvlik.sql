-- =============================================================
-- YUKCHIBOLLA — bitta menejer, bir nechta tashkilot
--
-- Muammo: menejer erkin sotuvchi — u bir vaqtda ikki korxona bilan
-- ishlashi mumkin. Baza buni allaqachon ko'taradi (`managers` unikali
-- (org_id, phone)), lekin KIRISH ko'tarmasdi:
--
--   admin-create-manager telefondan `998...@menejer.ilova` yasaydi,
--   auth.users.email esa GLOBAL unikal -> ikkinchi tashkilot
--   "already been registered" oladi va yangi menejer qatorini o'chiradi.
--
-- Ikkinchi to'siq: `profiles` bitta tashkilotni biladi. Butun tizim
-- shunga tayanadi:
--   current_org_id()     = profiles.org_id
--   current_manager_id() = profiles.manager_id
--
-- Aynan shu — yaxshi xabar. HAR BIR RLS siyosati va security definer
-- funksiya shu ikki funksiya orqali o'tadi. Demak "tashkilotni
-- almashtirish" = profiles dagi ikki ustunni qayta yozish, xolos.
-- RLS ni qayta yozish, JWT ga da'vo qo'shish KERAK EMAS.
--
-- Shu sababli bu yerda faqat uch narsa bor:
--   1. uzvliklar — kim qaysi tashkilotda a'zo
--   2. uzvliklarim() — panel ro'yxat oladi
--   3. tashkilotni_tanla() — a'zolikni tekshirib, profiles ni ko'chiradi
--
-- Qamrov ataylab tor: HOZIRCHA FAQAT MENEJER almasha oladi. Admin
-- huquqi keng va favqulodda kirish oqimlari bilan chirmashgan —
-- u alohida, sinovi bilan ochiladi.
-- =============================================================

-- ---------- 1. A'zoliklar ----------

create table if not exists public.uzvliklar (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- Menejer uchun majburiy: profiles.manager_id shu yerdan ko'chiriladi.
  -- Admin a'zoligida bo'sh qoladi.
  manager_id      uuid references public.managers(id) on delete cascade,
  role            text not null check (role in ('admin', 'manager', 'director', 'customer')),
  -- Kim biriktirgani: boshqa tashkilot admini mavjud raqamni o'ziga
  -- ulab olishi mumkin, shuning uchun iz qoladi. Backfill'da bo'sh.
  qoshgan_user_id uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (user_id, org_id)
);

create index if not exists uzvliklar_user_idx on public.uzvliklar (user_id);
create index if not exists uzvliklar_org_idx  on public.uzvliklar (org_id);

alter table public.uzvliklar enable row level security;

-- O'z a'zoliklarini har kim ko'radi — tanlash ekrani shu bilan ishlaydi
drop policy if exists "uzvliklar: ozi" on public.uzvliklar;
create policy "uzvliklar: ozi" on public.uzvliklar
  for select to authenticated
  using (user_id = auth.uid());

-- Tashkilot admini O'Z tashkiloti a'zoliklarini ko'radi.
-- is_admin() YOLG'IZ yetarli emas: u har tenant adminiga ochib qo'yardi.
drop policy if exists "uzvliklar: org admini" on public.uzvliklar;
create policy "uzvliklar: org admini" on public.uzvliklar
  for select to authenticated
  using (public.is_admin() and org_id = public.current_org_id());

-- Yozish siyosati ataylab YO'Q: qatorni faqat service_role (chekka
-- funksiya) va security definer funksiyalar qo'shadi.

-- ---------- 2. Mavjud profillar uchun a'zolik ----------

-- super_admin TASHQARIDA: u tenantga tegishli emas (bitta super admin
-- profilida org_id turibdi, lekin u a'zolik emas — favqulodda kirish
-- boshqa yo'l bilan ishlaydi). Backfill'ga qo'shilsa role cheklovi ham
-- buzilardi.
insert into public.uzvliklar (user_id, org_id, manager_id, role)
select p.id, p.org_id, p.manager_id, p.role
from public.profiles p
where p.org_id is not null
  and p.role <> 'super_admin'
on conflict (user_id, org_id) do nothing;

-- ---------- 3. Yangi hisobga a'zolik ham yozilsin ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
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
end $$;

-- ---------- 4. Panel uchun ro'yxat ----------

create or replace function public.uzvliklarim()
returns table (org_id uuid, org_nom text, rol text, manager_id uuid, joriymi boolean)
language sql stable security definer set search_path = public
as $$
  select u.org_id,
         o.name,
         u.role,
         u.manager_id,
         u.org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
  from public.uzvliklar u
  join public.organizations o on o.id = u.org_id
  where u.user_id = auth.uid()
  order by o.name;
$$;

revoke all on function public.uzvliklarim() from public, anon;
grant execute on function public.uzvliklarim() to authenticated;

-- ---------- 5. Tashkilotni tanlash ----------

create or replace function public.tashkilotni_tanla(p_org_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_uzv  record;
  v_nom  text;
begin
  -- auth.uid() null = service_role yoki bot. Bu funksiya odam uchun:
  -- tokensiz chaqiruv istalgan profilni ko'chira olmasin.
  if v_user is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_uzv
  from public.uzvliklar
  where user_id = v_user and org_id = p_org_id;
  if not found then
    raise exception 'AZOLIK_YOQ';
  end if;

  -- Qamrov: hozircha faqat menejer. Admin/direktorni ochish alohida ish.
  if v_uzv.role <> 'manager' then
    raise exception 'RUXSAT_YOQ: hozircha faqat menejer tashkilot almashtira oladi';
  end if;

  update public.profiles
  set org_id = v_uzv.org_id, manager_id = v_uzv.manager_id, role = v_uzv.role
  where id = v_user;

  select name into v_nom from public.organizations where id = p_org_id;
  return v_nom;
end $$;

revoke all on function public.tashkilotni_tanla(uuid) from public, anon;
grant execute on function public.tashkilotni_tanla(uuid) to authenticated;

comment on function public.tashkilotni_tanla(uuid) is
  'Menejerning faol tashkilotini almashtiradi. profiles.org_id/manager_id ni ko`chiradi — current_org_id() va butun RLS shundan keyin yangi tashkilotni ko`radi.';

-- ---------- 6. Email bo'yicha hisob (FAQAT chekka funksiya uchun) ----------
--
-- admin-create-manager telefon hisobini OLDINDAN topishi kerak:
-- createUser xatosiga tayanib bo'lmaydi, chunki unga qadar menejer
-- qatori yaratilgan bo'ladi. auth jadvali PostgREST orqali ochiq emas,
-- shuning uchun shu tor funksiya.

create or replace function public.hisob_id_email(p_email text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Bu email -> user_id xaritasi. Kirgan foydalanuvchiga ham kerak emas:
-- service_role (chekka funksiya) default privilege orqali chaqiradi.
revoke all on function public.hisob_id_email(text) from public, anon, authenticated;
