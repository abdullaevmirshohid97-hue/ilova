-- =============================================================
--  POS SOTUV · XODIMLAR · MAOSH
--
--  Uch narsa bir-biriga bog'langan va shu tartibda quriladi:
--    sotuv -> KPI -> maosh
--  Teskarisi mumkin emas: maosh moduli hisoblaydigan KPI hali
--  mavjud bo'lmaydi.
--
--  OMBOR: qoldiq bu yerda jurnal yig'indisi (stock_movements ->
--  trigger -> stock_levels). POS sotuvi shu qoidani buzmaydi,
--  faqat yangi sabab qo'shadi: 'pos_out'. Ya'ni qoldiq qo'lda
--  o'zgartirilmaydi va har kamayishning izi qoladi.
--
--  TENANT AJRATILISHI: uchala jadvalda ham org_id majburiy, RLS
--  birinchi kundan, view orqali o'qilmaydi. Ular darhol
--  tests/tenant-ajratish.mjs ga qo'shiladi.
-- =============================================================

-- POS sotuvi uchun yangi sabab. Mavjud qiymatlar saqlanadi.
alter table stock_movements drop constraint if exists stock_movements_reason_check;
alter table stock_movements add constraint stock_movements_reason_check
  check (reason in ('production_in', 'order_out', 'order_cancel_return',
                    'adjustment', 'return_in', 'pos_out', 'pos_return'));


-- ---------- XODIMLAR ----------
-- Tizimga kirmaydigan odamlar ham (omborchi, haydovchi, tikuvchi)
-- maosh oladi, shuning uchun bu jadval profiles/managers'dan alohida.
-- Menejer bo'lsa - manager_id orqali bog'lanadi va KPI o'sha
-- menejerning sotuvlaridan hisoblanadi.
create table if not exists xodimlar (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  ism           text not null,
  lavozim       text,
  telefon       text,
  oylik_stavka  numeric(14,0) not null default 0 check (oylik_stavka >= 0),

  -- KPI: oylik reja va bajarilishga qarab bosqichli stavka.
  -- Chegaralar 80% va 100% - bu ikkisi standart va o'zgarmaydi,
  -- shuning uchun ustun qilinmadi: har tenant uchun bir xil.
  kpi_reja      numeric(14,0) not null default 0 check (kpi_reja >= 0),
  kpi_past      numeric(5,2)  not null default 0 check (kpi_past between 0 and 100),
  kpi_orta      numeric(5,2)  not null default 0 check (kpi_orta between 0 and 100),
  kpi_yuqori    numeric(5,2)  not null default 0 check (kpi_yuqori between 0 and 100),

  ishga_kirgan  date,
  faol          boolean not null default true,

  -- Ixtiyoriy bog'lanishlar: shu xodim tizimda ham bormi
  manager_id    uuid references managers(id) on delete set null,
  profile_id    uuid references profiles(id) on delete set null,

  izoh          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists xodimlar_org_idx on xodimlar (org_id) where faol;

alter table xodimlar enable row level security;
drop policy if exists "xodimlar: o'z tenanti" on xodimlar;
create policy "xodimlar: o'z tenanti"
  on xodimlar for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());


-- ---------- POS SOTUV ----------
create table if not exists pos_sotuvlar (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  raqam          bigint not null,
  customer_id    uuid references customers(id) on delete set null,
  xodim_id       uuid references xodimlar(id) on delete set null,
  price_group_id uuid references price_groups(id) on delete set null,
  jami           numeric(14,0) not null default 0,
  chegirma       numeric(14,0) not null default 0 check (chegirma >= 0),
  tolov          text not null default 'naqd'
                 check (tolov in ('naqd', 'karta', 'otkazma', 'qarz')),
  izoh           text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  unique (org_id, raqam)
);

create index if not exists pos_sotuvlar_org_sana on pos_sotuvlar (org_id, created_at desc);
create index if not exists pos_sotuvlar_xodim on pos_sotuvlar (xodim_id, created_at);

create table if not exists pos_qatorlar (
  id         uuid primary key default gen_random_uuid(),
  sotuv_id   uuid not null references pos_sotuvlar(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  miqdor     int not null check (miqdor > 0),
  narx       numeric(14,0) not null check (narx >= 0),
  summa      numeric(14,0) not null
);

create index if not exists pos_qatorlar_sotuv on pos_qatorlar (sotuv_id);

alter table pos_sotuvlar enable row level security;
alter table pos_qatorlar enable row level security;

drop policy if exists "pos sotuv: o'z tenanti" on pos_sotuvlar;
create policy "pos sotuv: o'z tenanti"
  on pos_sotuvlar for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- Qatorda org_id yo'q: u sotuv orqali bog'lanadi. Bog'lanish uzun
-- bo'lgani uchun aynan shu yerda filtr unutiladi - shuning uchun
-- sinovda ham tekshiriladi.
drop policy if exists "pos qator: o'z tenanti" on pos_qatorlar;
create policy "pos qator: o'z tenanti"
  on pos_qatorlar for all to authenticated
  using (exists (
    select 1 from pos_sotuvlar s
    where s.id = pos_qatorlar.sotuv_id
      and is_admin() and s.org_id = current_org_id()
  ))
  with check (exists (
    select 1 from pos_sotuvlar s
    where s.id = pos_qatorlar.sotuv_id
      and is_admin() and s.org_id = current_org_id()
  ));


-- ---------- MAOSH AMALLARI ----------
-- Ishora qoidasi (izohda emas, kodda bir joyda):
--   bonus, kpi   -> xodimga QO'SHILADI  (qarz ortadi)
--   maosh, avans -> xodimga TO'LANADI   (qarz kamayadi)
--   jarima       -> USHLAB QOLINADI     (qarz kamayadi)
-- Summa doim musbat saqlanadi, ishora turdan kelib chiqadi -
-- aks holda "manfiy bonus" kabi ma'nosiz yozuvlar paydo bo'lardi.
create table if not exists maosh_amallari (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  xodim_id   uuid not null references xodimlar(id) on delete cascade,
  tur        text not null check (tur in ('maosh', 'avans', 'bonus', 'jarima', 'kpi')),
  summa      numeric(14,0) not null check (summa > 0),
  davr       date not null,
  izoh       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists maosh_xodim_sana on maosh_amallari (xodim_id, created_at desc);
create index if not exists maosh_org_davr on maosh_amallari (org_id, davr);

alter table maosh_amallari enable row level security;
drop policy if exists "maosh: o'z tenanti" on maosh_amallari;
create policy "maosh: o'z tenanti"
  on maosh_amallari for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());
