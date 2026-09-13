-- =============================================================
-- YUKCHIBOLLA — KASSA (hisob-kitob) yo'nalishi: poydevor
--
-- Ettinchi biznes tizimi. Mantiq "Cash Book" ilovalaridagidek sodda:
--
--   Hisob (Naqd/Bank/Karta) -> Kirim (+) / Chiqim (-) -> Qoldiq
--
-- QOLDIQ JADVALDA SAQLANMAYDI. U har safar yozuvlardan hisoblanadi:
--   qoldiq = boshlangich + sum(kirim) - sum(chiqim)
-- Bu loyihada `ledger_entries` va `qarz_transactions` ayni shunday
-- ishlaydi. Sabab ikkita: (1) saqlansa ikki raqam ajralib ketadi va
-- qaysi biri to'g'riligi bilinmaydi; (2) ilova OFFLINE ishlaydi —
-- ikki qurilma bir vaqtda "qoldiq" ustuniga yozsa, biri ikkinchisini
-- bosib ketardi. Yig'indi esa qaysi tartibda kelishidan qat'i nazar
-- bir xil chiqadi.
--
-- O'CHIRISH YO'Q. Noto'g'ri yozuv bekor qilinadi (`bekor_at` + sabab),
-- o'zi joyida qoladi va hisobdan chiqadi.
--
-- SINXRONIZATSIYA (2-bosqich) uchun bu yerda ikki narsa tayyorlanadi:
--   · `o_raqam` — server navbat raqami. Mijoz "shu raqamdan keyingi
--     o'zgarishlarni ber" deydi. `updated_at` bo'yicha so'rash XATO:
--     bir millisekundda ikki qator yangilansa biri tushib qoladi, va
--     telefon soati serverdan farq qiladi.
--   · `versiya` — bir yozuv ikki qurilmada tahrirlanganini ushlash
--     uchun. Trigger uni har yangilanishda oshiradi; sinx RPC'si
--     `versiya = p_versiya` sharti bilan yozadi, mos kelmasa RAD
--     etadi. Pulda jimgina "oxirgi yozgan yutadi" qilinmaydi.
--
-- TENANT: `id` qurilmada yaratiladi (uuid), shuning uchun begona org
-- id'si yuborilishi mumkin edi. Buni oldini olish uchun FK'lar
-- KOMPOZIT: (hisob_id, org_id) -> (id, org_id). Ya'ni boshqa
-- tenantning hisobiga yozuv bog'lab bo'lmaydi — RLS'dan tashqari
-- ikkinchi qulf, chunki RLS bu loyihada uch marta teshilgan.
-- =============================================================

-- ---------- 1. Yo'nalish ro'yxatiga qo'shamiz ----------
-- Panel ro'yxati (`apps/admin/src/lib/yonalishlar.ts`) bilan birga
-- o'zgaradi — `tests/yonalishlar.mjs` ikkalasini solishtiradi.
alter table public.organizations drop constraint if exists organizations_yonalishlar_chk;
alter table public.organizations
  add constraint organizations_yonalishlar_chk
  check (yonalishlar <@ array['dorixona','sklad','ishlab_chiqarish','b2b','marketplace','qarzdorlik','kassa']::text[]);


-- ---------- 2. Sinxronizatsiya navbati ----------
create sequence if not exists public.kassa_oqim_seq;

-- Trigger SECURITY DEFINER: aks holda `authenticated` ga ketma-ketlik
-- uchun alohida `usage` huquqi berish kerak bo'lardi — ya'ni mijozga
-- kerak bo'lmagan obyekt ochilardi.
create or replace function public.tg_kassa_oqim()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.o_raqam    := nextval('public.kassa_oqim_seq');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.versiya := old.versiya + 1;
    -- `created_at` va `org_id` tahrirda o'zgarmaydi: yozuv boshqa
    -- tenantga "ko'chib" ketmasin.
    new.created_at := old.created_at;
    new.org_id     := old.org_id;
  end if;
  return new;
end $$;

revoke all on function public.tg_kassa_oqim() from public, anon, authenticated;


-- ---------- 3. Hisoblar (Accounts) ----------
create table if not exists public.kassa_hisoblar (
  -- Qurilmada yaratiladi: internet yo'q paytda ham yozuv shu hisobga
  -- bog'lanadi, keyin o'sha id bilan serverga chiqadi.
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade
                 default public.current_org_id(),
  nom          text not null,
  turi         text not null default 'naqd' check (turi in ('naqd','bank','karta','boshqa')),
  valyuta      text not null default 'UZS' check (valyuta in ('UZS','USD','EUR','RUB')),
  -- "Opening Balance": hisob ochilgan paytdagi qoldiq. Busiz birinchi
  -- kun noto'g'ri chiqadi — odam daftarni bo'sh joydan boshlamaydi.
  boshlangich  numeric(18,2) not null default 0,
  rang         text,
  belgi        text,
  tartib       int not null default 0,
  faol         boolean not null default true,
  versiya      int not null default 1,
  o_raqam      bigint,
  qurilma_id   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Kompozit FK uchun (pastda)
  unique (id, org_id)
);

create index if not exists kassa_hisoblar_org_idx on public.kassa_hisoblar (org_id, tartib);
create index if not exists kassa_hisoblar_oqim_idx on public.kassa_hisoblar (o_raqam);

drop trigger if exists trg_kassa_hisoblar_oqim on public.kassa_hisoblar;
create trigger trg_kassa_hisoblar_oqim
  before insert or update on public.kassa_hisoblar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 4. Turkumlar (Categories) ----------
create table if not exists public.kassa_turkumlar (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade
               default public.current_org_id(),
  nom        text not null,
  turi       text not null check (turi in ('kirim','chiqim')),
  ota_id     uuid,
  rang       text,
  belgi      text,
  tartib     int not null default 0,
  faol       boolean not null default true,
  versiya    int not null default 1,
  o_raqam    bigint,
  qurilma_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  -- Ota turkum ham SHU tenantniki bo'lishi shart
  foreign key (ota_id, org_id) references public.kassa_turkumlar (id, org_id) on delete restrict
);

create index if not exists kassa_turkumlar_org_idx on public.kassa_turkumlar (org_id, turi, tartib);
create index if not exists kassa_turkumlar_oqim_idx on public.kassa_turkumlar (o_raqam);

drop trigger if exists trg_kassa_turkumlar_oqim on public.kassa_turkumlar;
create trigger trg_kassa_turkumlar_oqim
  before insert or update on public.kassa_turkumlar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 5. Klientlar (Customer / Supplier) ----------
-- 3-bosqichda ishlatiladi, lekin jadval hozir qo'shiladi: `kassa_yozuvlar`
-- unga havola qiladi va keyin ALTER bilan FK qo'shish — bir migratsiya
-- ortiqcha ish va bir muddat himoyasiz oraliq degani.
create table if not exists public.kassa_klientlar (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade
               default public.current_org_id(),
  ism        text not null,
  telefon    text,
  turi       text not null default 'mijoz' check (turi in ('mijoz','taminotchi')),
  rasm_path  text,
  izoh       text,
  faol       boolean not null default true,
  versiya    int not null default 1,
  o_raqam    bigint,
  qurilma_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create index if not exists kassa_klientlar_org_idx on public.kassa_klientlar (org_id, ism);
create index if not exists kassa_klientlar_oqim_idx on public.kassa_klientlar (o_raqam);

drop trigger if exists trg_kassa_klientlar_oqim on public.kassa_klientlar;
create trigger trg_kassa_klientlar_oqim
  before insert or update on public.kassa_klientlar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 6. Yozuvlar — ASOSIY JURNAL ----------
create table if not exists public.kassa_yozuvlar (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade
                default public.current_org_id(),
  hisob_id    uuid not null,
  -- Summa HAR DOIM musbat, yo'nalishni `turi` beradi. Manfiy summa
  -- ruxsat etilsa, bitta chiqim ikki xil ko'rinishda yozilib
  -- (turi='chiqim' summa=500 va turi='kirim' summa=-500) yig'indi
  -- ikki joyda ikki xil chiqardi.
  turi        text not null check (turi in ('kirim','chiqim')),
  summa       numeric(18,2) not null check (summa > 0),
  valyuta     text not null default 'UZS' check (valyuta in ('UZS','USD','EUR','RUB')),
  -- Yozuv paytidagi kurs (UZS ga). Muzlatiladi: ertaga kurs o'zgarsa
  -- kechagi yozuvning so'mdagi qiymati o'zgarmasligi kerak.
  kurs        numeric(18,6) not null default 1 check (kurs > 0),
  turkum_id   uuid,
  klient_id   uuid,
  izoh        text,
  -- FOYDALANUVCHI qo'ygan sana: kechagi xarajatni bugun kiritadi.
  -- `created_at` esa yozuv qachon yozilganini saqlaydi — ikkalasi ham kerak.
  sana        timestamptz not null default now(),
  tolov_usuli text not null default 'naqd' check (tolov_usuli in ('naqd','karta','otkazma')),
  -- Hisoblararo o'tkazma: ikki yozuv (bir chiqim + bir kirim) shu
  -- id bilan juftlashadi. O'tkazma daromad ham, xarajat ham emas —
  -- hisobotda shu ustun bo'yicha chiqarib tashlanadi.
  kochirma_id uuid,
  bekor_at    timestamptz,
  bekor_sabab text,
  versiya     int not null default 1,
  o_raqam     bigint,
  qurilma_id  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Bekor qilish sababsiz bo'lmaydi: bir oydan keyin "nega bekor
  -- qilingan" degan savolga javob qolsin.
  constraint kassa_yozuv_bekor_sabab check (bekor_at is null or bekor_sabab is not null),

  -- Havolalar FAQAT shu tenant ichida (izoh: fayl boshidagi tushuntirish)
  foreign key (hisob_id, org_id)  references public.kassa_hisoblar  (id, org_id) on delete restrict,
  foreign key (turkum_id, org_id) references public.kassa_turkumlar (id, org_id) on delete restrict,
  foreign key (klient_id, org_id) references public.kassa_klientlar (id, org_id) on delete restrict
);

-- Ro'yxat va kalendar: org + sana bo'yicha teskari tartibda
create index if not exists kassa_yozuvlar_org_sana_idx on public.kassa_yozuvlar (org_id, sana desc);
-- Hisob kartochkasi va qoldiq
create index if not exists kassa_yozuvlar_hisob_idx on public.kassa_yozuvlar (org_id, hisob_id, sana desc);
-- Sinxronizatsiya kursori — eng issiq so'rov
create index if not exists kassa_yozuvlar_oqim_idx on public.kassa_yozuvlar (o_raqam);
-- Klient kartochkasi (qarz qoldig'i)
create index if not exists kassa_yozuvlar_klient_idx on public.kassa_yozuvlar (org_id, klient_id)
  where klient_id is not null;
-- O'tkazma juftini topish
create index if not exists kassa_yozuvlar_kochirma_idx on public.kassa_yozuvlar (kochirma_id)
  where kochirma_id is not null;

drop trigger if exists trg_kassa_yozuvlar_oqim on public.kassa_yozuvlar;
create trigger trg_kassa_yozuvlar_oqim
  before insert or update on public.kassa_yozuvlar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 7. RLS ----------
-- `is_admin()` YOLG'IZ yetarli emas: usiz har tenant admini boshqasining
-- yozuvini ko'rardi. Org tekshiruvi har siyosatda bor.
alter table public.kassa_hisoblar  enable row level security;
alter table public.kassa_turkumlar enable row level security;
alter table public.kassa_klientlar enable row level security;
alter table public.kassa_yozuvlar  enable row level security;

drop policy if exists "kassa_hisoblar: admin all" on public.kassa_hisoblar;
create policy "kassa_hisoblar: admin all" on public.kassa_hisoblar
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

drop policy if exists "kassa_turkumlar: admin all" on public.kassa_turkumlar;
create policy "kassa_turkumlar: admin all" on public.kassa_turkumlar
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

drop policy if exists "kassa_klientlar: admin all" on public.kassa_klientlar;
create policy "kassa_klientlar: admin all" on public.kassa_klientlar
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

drop policy if exists "kassa_yozuvlar: admin all" on public.kassa_yozuvlar;
create policy "kassa_yozuvlar: admin all" on public.kassa_yozuvlar
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- Direktor — kuzatuvchi: ko'radi, yozmaydi (qarzdorlikdagi naqsh)
drop policy if exists "kassa_hisoblar: direktor read" on public.kassa_hisoblar;
create policy "kassa_hisoblar: direktor read" on public.kassa_hisoblar
  for select to authenticated using (is_direktor() and org_id = current_org_id());

drop policy if exists "kassa_turkumlar: direktor read" on public.kassa_turkumlar;
create policy "kassa_turkumlar: direktor read" on public.kassa_turkumlar
  for select to authenticated using (is_direktor() and org_id = current_org_id());

drop policy if exists "kassa_klientlar: direktor read" on public.kassa_klientlar;
create policy "kassa_klientlar: direktor read" on public.kassa_klientlar
  for select to authenticated using (is_direktor() and org_id = current_org_id());

drop policy if exists "kassa_yozuvlar: direktor read" on public.kassa_yozuvlar;
create policy "kassa_yozuvlar: direktor read" on public.kassa_yozuvlar
  for select to authenticated using (is_direktor() and org_id = current_org_id());


-- ---------- 8. Qoldiq funksiyalari ----------
-- SECURITY DEFINER EMAS (ataylab): shunda RLS ishlaydi va org filtri
-- qo'lda yozilmaydi. Bu loyihada definer funksiyalarga org tekshiruvi
-- qo'shishni unutish ikki marta tenant chegarasini teshgan.
create or replace function public.kassa_hisob_qoldiq(p_hisob_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(h.boshlangich, 0) + coalesce(sum(
    case when y.turi = 'kirim' then y.summa else -y.summa end
  ), 0)
  from public.kassa_hisoblar h
  left join public.kassa_yozuvlar y
    on y.hisob_id = h.id and y.bekor_at is null
  where h.id = p_hisob_id
  group by h.boshlangich;
$$;

-- Pastdagi yig'indi paneli uchun: har hisobning qoldig'i bir so'rovda.
-- Valyutalar QO'SHILMAYDI — ekran ularni alohida ko'rsatadi.
create or replace function public.kassa_qoldiqlar()
returns table (hisob_id uuid, nom text, valyuta text, turi text, faol boolean, qoldiq numeric)
language sql stable
set search_path = public
as $$
  select h.id, h.nom, h.valyuta, h.turi, h.faol,
         coalesce(h.boshlangich, 0) + coalesce(sum(
           case when y.turi = 'kirim' then y.summa else -y.summa end
         ), 0)
  from public.kassa_hisoblar h
  left join public.kassa_yozuvlar y
    on y.hisob_id = h.id and y.bekor_at is null
  group by h.id, h.nom, h.valyuta, h.turi, h.faol, h.boshlangich, h.tartib
  order by h.tartib, h.nom;
$$;

-- Loyihada ALTER DEFAULT PRIVILEGES turibdi: yangi funksiya avtomatik
-- `authenticated` ga ochiladi. Odat bo'yicha aniq yozamiz — `anon`
-- yopilishi kerak, `authenticated` esa RLS bilan cheklangan.
revoke all on function public.kassa_hisob_qoldiq(uuid) from public, anon;
revoke all on function public.kassa_qoldiqlar() from public, anon;
grant execute on function public.kassa_hisob_qoldiq(uuid) to authenticated;
grant execute on function public.kassa_qoldiqlar() to authenticated;


-- ---------- 9. Izohlar ----------
comment on table  public.kassa_yozuvlar is
  'Kassa jurnali. O''chirilmaydi — noto''g''ri yozuv bekor qilinadi (bekor_at + bekor_sabab).';
comment on column public.kassa_yozuvlar.o_raqam is
  'Server navbat raqami. Offline mijoz shu raqamdan keyingi o''zgarishlarni so''raydi (updated_at emas).';
comment on column public.kassa_yozuvlar.versiya is
  'Har yangilanishda oshadi. Sinx RPC''si mos kelmasa yozuvni RAD etadi — ikki qurilma bir-birini bosmaydi.';
comment on column public.kassa_yozuvlar.sana is
  'Foydalanuvchi qo''ygan sana (kechagi ham bo''lishi mumkin). Yozuv qachon yozilgani — created_at.';
comment on column public.kassa_hisoblar.boshlangich is
  'Opening Balance — hisob ochilgandagi qoldiq. Qoldiq shundan boshlab hisoblanadi.';
