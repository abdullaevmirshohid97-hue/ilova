-- =============================================================
-- ILOVA B2B — SaaS: organizations + org_id (ko'p-tenant asosi)
--
-- Model: "shared schema + org_id + RLS" (PLAN.md 12-bo'lim). Har tenant
-- (zavod/do'kon) — bitta organizations qatori. Mavjud yakka-tenant ma'lumot
-- "Birinchi tenant" nomi bilan avtomatik ko'chiriladi — hech narsa yo'qolmaydi.
--
-- MUHIM: bu migratsiya faqat sxema + backfill. RLS siyosatlari va RPC'lar
-- keyingi ikki migratsiyada (000012, 000013) org bo'yicha yopiladi — bu
-- migratsiyadan keyin, ular qo'llanmaguncha, izolyatsiya HALI TO'LIQ EMAS.
-- =============================================================

create table public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  contact_name          text,
  contact_phone         text,
  subscription_status   text not null default 'trial' check (subscription_status in ('trial','active','suspended')),
  plan                  text not null default 'basic',
  created_at            timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- org_id ustunlari — hozircha NULLABLE, backfill'dan keyin NOT NULL bo'ladi
alter table public.profiles     add column org_id uuid references public.organizations(id);
alter table public.customers    add column org_id uuid references public.organizations(id);
alter table public.categories   add column org_id uuid references public.organizations(id);
alter table public.products     add column org_id uuid references public.organizations(id);
alter table public.price_groups add column org_id uuid references public.organizations(id);

-- Backfill: mavjud hamma narsa "Birinchi tenant"ga bog'lanadi
do $$
declare
  v_org_id uuid;
begin
  insert into public.organizations (name, subscription_status)
  values ('Birinchi tenant', 'active')
  returning id into v_org_id;

  update public.profiles     set org_id = v_org_id where role in ('admin', 'customer');
  update public.customers    set org_id = v_org_id;
  update public.categories   set org_id = v_org_id;
  update public.products     set org_id = v_org_id;
  update public.price_groups set org_id = v_org_id;
end $$;

-- NOT NULL (profiles.org_id NULL bo'lishi mumkin — faqat super_admin uchun)
alter table public.customers    alter column org_id set not null;
alter table public.categories   alter column org_id set not null;
alter table public.products     alter column org_id set not null;
alter table public.price_groups alter column org_id set not null;

alter table public.profiles
  add constraint profiles_org_required_unless_super_admin
  check (role = 'super_admin' or org_id is not null);

-- price_groups nomi endi FAQAT org ichida yagona (ikki tenant ham "Standart"
-- deb nomlashi mumkin bo'lishi kerak)
alter table public.price_groups drop constraint price_groups_name_key;
alter table public.price_groups add constraint price_groups_org_name_key unique (org_id, name);

-- Yordamchi funksiyalar (is_admin(), current_customer_id() naqshiga o'xshab)
create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

-- Yangi mahsulot/kategoriya/tarif yaratishda org_id avtomatik to'ldiriladi —
-- admin panel kodi (Products.tsx, Settings.tsx) o'zgarishsiz ishlayveradi
alter table public.products     alter column org_id set default current_org_id();
alter table public.categories   alter column org_id set default current_org_id();
alter table public.price_groups alter column org_id set default current_org_id();

-- handle_new_user: endi org_id'ni (va kerak bo'lsa rolni to'g'ridan-to'g'ri,
-- follow-up UPDATE'siz) ham o'rnatadi:
--   - mijoz uchun: customer_id orqali customers.org_id'dan olinadi
--   - admin/xodim/yangi tenant admin uchun: auth metadata'dagi org_id+role'dan
--   - super_admin uchun: org_id=null, role='super_admin' — ikkalasi ham metadata'dan,
--     shu bilan profiles_org_required_unless_super_admin cheklovi INSERT
--     vaqtidayoq bajariladi (keyingi UPDATE'ga bog'liq bo'lib qolmaydi)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_customer_id uuid := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  v_org_id      uuid := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  v_role        text := coalesce(new.raw_user_meta_data->>'role', 'customer');
begin
  if v_customer_id is not null then
    select org_id into v_org_id from public.customers where id = v_customer_id;
  end if;

  insert into public.profiles (id, full_name, customer_id, org_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_customer_id,
    v_org_id,
    v_role
  );
  return new;
end $$;
