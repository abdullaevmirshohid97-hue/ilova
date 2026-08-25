-- =============================================================
--  SKLADLAR — 1-bosqich: baza
--
--  Bugungi holat: dori bitta joyda yashaydi — narxi ham, qoldig'i ham
--  dori_products ichida. Ya'ni tizim bitta sklad borligiga qurilgan.
--
--  Endi bir necha sklad bo'ladi va bir xil dori har birida boshqa narx,
--  boshqa qoldiq bilan turadi. Shuning uchun:
--
--    dori_products  — GLOBAL nomlar katalogi (nom, ishlab chiqaruvchi,
--                     shtrix-kod, guruh). Narx/qoldiq endi bu yerda
--                     "hosila": eng arzon sklad narxi.
--    dori_offers    — sklad x dori: tannarx, sotuv narxi, qoldiq.
--                     Haqiqat shu yerda.
--
--  NEGA dori_products.price QOLDIRILDI: bot, Mini App, savat, buyurtma
--  va faktura shu ustunni o'qiydi. Uni birdaniga olib tashlasak, hamma
--  yo'lni bir kunda qayta yozish kerak bo'lardi va bittasi unutilsa
--  mijozga narxsiz dori chiqardi. Endi u har importdan keyin
--  offers'dan qayta hisoblanadi — o'qiydigan joylar ishlab turaveradi,
--  sklad tafsiloti esa ustiga bosqichma-bosqich qo'shiladi.
--
--  MAVJUD MA'LUMOT: hozirgi 6900+ dori "Asosiy sklad" ga ko'chiriladi,
--  ya'ni bugungi katalog o'z-o'zidan buzilmaydi.
-- =============================================================

-- ---------- 1. Skladlar ----------
create table if not exists public.dori_warehouses (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text,                       -- qisqa belgi: MSK-1, TOSH
  phone        text,
  address      text,
  contact_name text,                       -- mas'ul shaxs
  note         text,

  -- Ustama va chegirma: FOIZDA ham, SUMMADA ham. Ba'zi skladlar bilan
  -- "har quticha ustiga 2000 so'm" deb kelishiladi, foiz bilan emas.
  markup_pct   numeric(6,2),
  markup_sum   numeric(16,2),
  discount_pct numeric(6,2),
  discount_sum numeric(16,2),

  -- Narx teng bo'lganda qaysi sklad avval tanlansin (kichik = ustuvor)
  priority     int not null default 100,

  is_default   boolean not null default false,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  check (coalesce(markup_pct, 0) between -100 and 1000),
  check (coalesce(discount_pct, 0) between 0 and 100),
  check (coalesce(markup_sum, 0) >= 0),
  check (coalesce(discount_sum, 0) >= 0)
);

-- Bir xil nomli ikki sklad chalkashtiradi
create unique index if not exists dori_warehouses_name_key
  on public.dori_warehouses (lower(trim(name)));

-- Asosiy sklad bitta bo'lsin (eski kod qaysi skladga yozishni bilishi uchun)
create unique index if not exists dori_warehouses_default_key
  on public.dori_warehouses (is_default) where is_default;

alter table public.dori_warehouses enable row level security;

drop policy if exists "dori_warehouses: super_admin" on public.dori_warehouses;
create policy "dori_warehouses: super_admin"
  on public.dori_warehouses for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 2. Sklad takliflari ----------
create table if not exists public.dori_offers (
  warehouse_id uuid not null references public.dori_warehouses(id) on delete cascade,
  product_id   uuid not null references public.dori_products(id) on delete cascade,
  base_price   numeric(16,2),              -- skladning narxi (TANNARX, mijozga ko'rinmaydi)
  price        numeric(16,2),              -- ustama qo'yilgan SOTUV narxi
  stock        numeric(16,3),
  last_import  text,                       -- qaysi yuklashda kelgan
  updated_at   timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

-- "Bu dori qaysi skladlarda bor, qaysi biri arzon" — buyurtmani
-- taqsimlashda har bir pozitsiya uchun shu so'rov ketadi
create index if not exists dori_offers_product_idx
  on public.dori_offers (product_id, price);

create index if not exists dori_offers_wh_idx
  on public.dori_offers (warehouse_id);

alter table public.dori_offers enable row level security;

drop policy if exists "dori_offers: super_admin" on public.dori_offers;
create policy "dori_offers: super_admin"
  on public.dori_offers for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 3. Yuklash tarixi ----------
-- "Qaysi skladga, qachon, qaysi fayl yuklangan" - prays ustiga yozilib
-- ketmasin degan talab shu yerdan boshqariladi: har yuklash o'z id'sini
-- oladi va yakunda o'sha id'siz qolgan qatorlar o'chiriladi.
create table if not exists public.dori_imports (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.dori_warehouses(id) on delete set null,
  file_name    text,
  source       text,
  rows_total   int not null default 0,
  status       text not null default 'running' check (status in ('running', 'done', 'failed')),
  natija       jsonb,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create index if not exists dori_imports_wh_idx
  on public.dori_imports (warehouse_id, created_at desc);

alter table public.dori_imports enable row level security;

drop policy if exists "dori_imports: super_admin" on public.dori_imports;
create policy "dori_imports: super_admin"
  on public.dori_imports for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 4. Partiyalar endi sklad bo'yicha ----------
alter table public.dori_batches
  add column if not exists warehouse_id uuid references public.dori_warehouses(id) on delete cascade;

alter table public.dori_batches
  add column if not exists last_import text;

-- ---------- 5. Mavjud ma'lumotni ko'chirish ----------
do $$
declare
  v_wh uuid;
begin
  select id into v_wh from dori_warehouses where is_default;

  if v_wh is null then
    insert into dori_warehouses (name, code, note, is_default, priority)
    values ('Asosiy sklad', 'ASOS',
            'Sklad tizimidan oldin yuklangan katalog shu yerga ko''chirildi', true, 10)
    returning id into v_wh;
  end if;

  -- Har bir dori uchun taklif: narx va qoldiq o'sha-o'sha qoladi
  insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import, updated_at)
  select v_wh, p.id, coalesce(p.base_price, p.price), p.price, p.stock, p.last_import, now()
  from dori_products p
  where p.price is not null or p.stock is not null
  on conflict (warehouse_id, product_id) do nothing;

  update dori_batches set warehouse_id = v_wh where warehouse_id is null;
end $$;

-- Ko'chirib bo'lingach — sklad majburiy
alter table public.dori_batches
  alter column warehouse_id set not null;

-- Eski yagonalik kaliti sklad bilan hisoblashmasdi: ikki skladda bir xil
-- seriya bo'lsa, ikkinchisi birinchisining ustiga yozilardi
drop index if exists dori_batches_key;
create unique index if not exists dori_batches_key
  on public.dori_batches
     (warehouse_id, product_id, coalesce(series, ''), coalesce(expiry, '1900-01-01'));

-- ---------- 6. Asosiy sklad ----------
-- Sklad ko'rsatilmagan eski chaqiruvlar qayerga yozishini bilsin
create or replace function public.dori_asosiy_sklad()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from dori_warehouses where is_default limit 1;
$$;

revoke all on function public.dori_asosiy_sklad() from public, anon;
grant execute on function public.dori_asosiy_sklad() to authenticated, service_role;
