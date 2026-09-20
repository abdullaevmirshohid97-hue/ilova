-- =============================================================
-- CLARY — OLDI-BERDI: BITIM VA TO'LOV
--
-- Mahsulotning o'zagi o'zgaradi: markazda hisob emas, HAMKOR turadi.
-- Har bitim biznes hamkorning ismiga bog'lanadi — hamkorsiz bitim
-- YO'Q (shuning uchun `klient_id` not null).
--
-- NEGA ALOHIDA JADVAL (`kassa_yozuvlar` kengaytirilmadi):
--
--  · Bitimning HAYOTI bor: yaratildi -> tasdiqlandi -> qisman
--    to'landi -> yopildi. Daftar yozuvining hayoti yo'q, u bo'lib
--    o'tgan fakt va O'ZGARMAYDI (append-only qoidasi).
--  · Bitta bitimdan bir NECHTA yozuv chiqadi: tovar berildi, keyin
--    uch marta qisman to'lov. Bir qatorga sig'maydi.
--
-- Demak: bitim — sabab, yozuv — oqibat. Qoldiq hech qayerda
-- saqlanmaydi, har doim hisoblanadi.
--
-- ============ ISHORA QOIDASI (butun fayl bo'yicha bitta) ============
--
-- `yonalish` ikki qiymat oladi va MA'NOSI ikkala jadvalda BIR XIL:
--
--   'berdim' -> men berdim  -> hamkor menga qarzdor bo'ladi  -> +summa
--   'oldim'  -> men oldim   -> men hamkorga qarzdor bo'laman -> -summa
--
-- Hamkor qoldig'i = bitimlar yig'indisi + to'lovlar yig'indisi,
-- ikkalasi ham shu bitta ishora qoidasi bilan.
--
-- Misol: Tonirokdan 1 200 dona karobka oldim, donasi $0.10, jami $120.
--   bitim: oldim, -120  -> qoldiq -120 (men qarzdorman)
--   keyin $120 to'ladim:
--   to'lov: berdim, +120 -> qoldiq 0   -> bitim yopildi
--
-- ============ TASDIQ QOLDIQQA TA'SIR QILMAYDI ============
--
-- Telegram orqali tasdiqlash — DALIL, shart emas. Tasdiqlanmagan
-- bitim ham qoldiqqa kiradi. Aks holda daftar boshqa odamning
-- tugma bosishiga bog'liq bo'lib qolardi va uni ishlatib bo'lmasdi.
-- Qoldiqdan faqat `bekor` holati chiqariladi.
-- =============================================================


-- ---------- 1. Hamkor profili kengayadi ----------
-- Telegram tasdiqlash uchun `telegram_id` kerak: birinchi tasdiqda
-- bog'lanadi va keyingi safar havola yubormasdan ishlaydi.
alter table public.kassa_klientlar
  add column if not exists telegram_id  bigint,
  add column if not exists telegram_nom text,
  add column if not exists kompaniya    text,
  add column if not exists stir         text,
  add column if not exists manzil       text,
  add column if not exists valyuta      text not null default 'UZS';

-- Valyuta ro'yxati boshqa jadvallardagi bilan bir xil bo'lsin
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kassa_klientlar_valyuta_chk'
      and conrelid = 'public.kassa_klientlar'::regclass
  ) then
    alter table public.kassa_klientlar
      add constraint kassa_klientlar_valyuta_chk
      check (valyuta in ('UZS','USD','EUR','RUB'));
  end if;
end $$;

-- `turi` ga uchinchi qiymat: konsepsiyadagi "Business Partner" —
-- ham sotadi, ham sotib oladi.
alter table public.kassa_klientlar drop constraint if exists kassa_klientlar_turi_check;
alter table public.kassa_klientlar
  add constraint kassa_klientlar_turi_check
  check (turi in ('mijoz','taminotchi','hamkor'));

-- Telegram id bo'yicha qidiruv: bot har xabarda shu bo'yicha topadi
create index if not exists kassa_klientlar_tg_idx
  on public.kassa_klientlar (telegram_id) where telegram_id is not null;


-- ---------- 2. Bitimlar ----------
create table if not exists public.kassa_bitimlar (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade
               default public.current_org_id(),

  -- HAMKORSIZ BITIM YO'Q. Butun mahsulot shu qoidaga qurilgan:
  -- daftar hamkor ismi bo'yicha yuritiladi.
  klient_id  uuid not null,

  yonalish   text not null check (yonalish in ('oldim','berdim')),
  -- 'tovar' — kassaga tegmaydi, faqat qarz paydo bo'ladi;
  -- 'qarz'  — pul ham harakat qiladi (daftarga yozuv tushadi).
  nima       text not null check (nima in ('tovar','qarz')),

  -- Tovar bo'lsa to'ldiriladi
  tovar_nom  text,
  birlik     text,
  miqdor     numeric(18,3) check (miqdor is null or miqdor > 0),
  narx       numeric(18,2) check (narx is null or narx >= 0),

  -- Jami. HAR DOIM MUSBAT — yo'nalishni `yonalish` beradi.
  -- (Sababi `kassa_yozuvlar.summa` izohida: manfiy summa ruxsat
  -- etilsa, bitta amal ikki xil ko'rinishda yozilib, yig'indi ikki
  -- joyda ikki xil chiqardi.)
  summa      numeric(18,2) not null check (summa > 0),
  valyuta    text not null default 'UZS' check (valyuta in ('UZS','USD','EUR','RUB')),
  kurs       numeric(18,6) not null default 1 check (kurs > 0),

  -- Qachongacha. Muddati o'tgani ro'yxatda ajralib turadi.
  muddat     date,
  izoh       text,
  sana       timestamptz not null default now(),

  -- 'kutilmoqda' — yaratildi, hamkor hali tasdiqlamadi
  -- 'tasdiqlangan' — hamkor Telegramda tasdiqladi
  -- 'rad' — hamkor rozi emas (qoldiqda QOLAVERADI, nizo belgisi)
  -- 'yopilgan' — to'liq to'landi
  -- 'bekor' — xato yozuv, qoldiqdan chiqariladi
  holat      text not null default 'kutilmoqda'
               check (holat in ('kutilmoqda','tasdiqlangan','rad','yopilgan','bekor')),
  tasdiq_at  timestamptz,
  -- Kim tasdiqladi: Telegram foydalanuvchisi id si
  tasdiq_kim bigint,
  bekor_sabab text,

  versiya    int not null default 1,
  o_raqam    bigint,
  qurilma_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, org_id),

  -- Bekor qilish sababsiz bo'lmaydi (daftardagi qoida bilan bir xil)
  constraint kassa_bitim_bekor_sabab
    check (holat <> 'bekor' or bekor_sabab is not null),

  -- Tovar bo'lsa nomi bo'lsin: nomsiz tovar bir oydan keyin
  -- «nima olgan edim?» degan savolga aylanadi
  constraint kassa_bitim_tovar_nom
    check (nima <> 'tovar' or (tovar_nom is not null and length(btrim(tovar_nom)) > 0)),

  -- Hamkor SHU tenantniki bo'lishi shart
  foreign key (klient_id, org_id) references public.kassa_klientlar (id, org_id) on delete restrict
);

-- Hamkor kartochkasi — eng ko'p ochiladigan ekran
create index if not exists kassa_bitimlar_klient_idx
  on public.kassa_bitimlar (org_id, klient_id, sana desc);
-- Ro'yxat va filtr
create index if not exists kassa_bitimlar_org_sana_idx
  on public.kassa_bitimlar (org_id, sana desc);
-- Muddati o'tganlar
create index if not exists kassa_bitimlar_muddat_idx
  on public.kassa_bitimlar (org_id, muddat) where muddat is not null and holat <> 'yopilgan';
-- Sinxronizatsiya kursori
create index if not exists kassa_bitimlar_oqim_idx on public.kassa_bitimlar (o_raqam);

drop trigger if exists trg_kassa_bitimlar_oqim on public.kassa_bitimlar;
create trigger trg_kassa_bitimlar_oqim
  before insert or update on public.kassa_bitimlar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 3. To'lovlar ----------
--
-- `bitim_id` ATAYLAB ixtiyoriy: bozorda «Tonirokka 500 ming berdim»
-- deyiladi, qaysi bitimga tegishli ekani aytilmaydi. Hamkor esa
-- har doim ma'lum — shuning uchun `klient_id` majburiy.
create table if not exists public.kassa_bitim_tolovlar (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade
               default public.current_org_id(),
  klient_id  uuid not null,
  bitim_id   uuid,

  yonalish   text not null check (yonalish in ('oldim','berdim')),
  summa      numeric(18,2) not null check (summa > 0),
  valyuta    text not null default 'UZS' check (valyuta in ('UZS','USD','EUR','RUB')),
  kurs       numeric(18,6) not null default 1 check (kurs > 0),
  usuli      text not null default 'naqd' check (usuli in ('naqd','karta','bank','tovar')),

  -- Daftardagi qaysi yozuvni yaratgani. Yozuv o'chirilmaydi,
  -- shuning uchun `on delete restrict`.
  yozuv_id   uuid,

  izoh       text,
  sana       timestamptz not null default now(),
  holat      text not null default 'kutilmoqda'
               check (holat in ('kutilmoqda','tasdiqlangan','rad','bekor')),
  tasdiq_at  timestamptz,
  tasdiq_kim bigint,
  bekor_sabab text,

  versiya    int not null default 1,
  o_raqam    bigint,
  qurilma_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, org_id),

  constraint kassa_tolov_bekor_sabab
    check (holat <> 'bekor' or bekor_sabab is not null),

  foreign key (klient_id, org_id) references public.kassa_klientlar (id, org_id) on delete restrict,
  foreign key (bitim_id, org_id)  references public.kassa_bitimlar  (id, org_id) on delete restrict,
  foreign key (yozuv_id, org_id)  references public.kassa_yozuvlar  (id, org_id) on delete restrict
);

create index if not exists kassa_tolovlar_klient_idx
  on public.kassa_bitim_tolovlar (org_id, klient_id, sana desc);
create index if not exists kassa_tolovlar_bitim_idx
  on public.kassa_bitim_tolovlar (org_id, bitim_id) where bitim_id is not null;
create index if not exists kassa_tolovlar_oqim_idx on public.kassa_bitim_tolovlar (o_raqam);

drop trigger if exists trg_kassa_tolovlar_oqim on public.kassa_bitim_tolovlar;
create trigger trg_kassa_tolovlar_oqim
  before insert or update on public.kassa_bitim_tolovlar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 4. Daftar bitimga bog'lanadi ----------
alter table public.kassa_yozuvlar
  add column if not exists bitim_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kassa_yozuvlar_bitim_fk'
      and conrelid = 'public.kassa_yozuvlar'::regclass
  ) then
    alter table public.kassa_yozuvlar
      add constraint kassa_yozuvlar_bitim_fk
      foreign key (bitim_id, org_id) references public.kassa_bitimlar (id, org_id) on delete restrict;
  end if;
end $$;

create index if not exists kassa_yozuvlar_bitim_idx
  on public.kassa_yozuvlar (org_id, bitim_id) where bitim_id is not null;


-- ---------- 5. RLS ----------
-- `is_admin()` YOLG'IZ yetarli emas: usiz har tenant admini
-- boshqasining bitimini ko'rardi. Org tekshiruvi har siyosatda bor.
alter table public.kassa_bitimlar       enable row level security;
alter table public.kassa_bitim_tolovlar enable row level security;

drop policy if exists "kassa_bitimlar: admin all" on public.kassa_bitimlar;
create policy "kassa_bitimlar: admin all" on public.kassa_bitimlar
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

drop policy if exists "kassa_bitimlar: direktor read" on public.kassa_bitimlar;
create policy "kassa_bitimlar: direktor read" on public.kassa_bitimlar
  for select to authenticated using (is_direktor() and org_id = current_org_id());

drop policy if exists "kassa_tolovlar: admin all" on public.kassa_bitim_tolovlar;
create policy "kassa_tolovlar: admin all" on public.kassa_bitim_tolovlar
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

drop policy if exists "kassa_tolovlar: direktor read" on public.kassa_bitim_tolovlar;
create policy "kassa_tolovlar: direktor read" on public.kassa_bitim_tolovlar
  for select to authenticated using (is_direktor() and org_id = current_org_id());


-- ---------- 6. Qoldiq funksiyalari ----------
--
-- SECURITY DEFINER EMAS (ataylab): shunda RLS ishlaydi va org filtri
-- qo'lda yozilmaydi. Bu loyihada definer funksiyaga org tekshiruvini
-- unutish ikki marta tenant chegarasini teshgan.

/** Bitta bitimning to'lanmagan qoldig'i */
create or replace function public.kassa_bitim_qoldiq(p_bitim_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select greatest(
    b.summa - coalesce((
      select sum(t.summa)
        from public.kassa_bitim_tolovlar t
       where t.bitim_id = b.id and t.holat <> 'bekor'
    ), 0),
    0
  )
  from public.kassa_bitimlar b
  where b.id = p_bitim_id and b.holat <> 'bekor';
$$;

/**
 * Hamkor qoldig'i: musbat — u menga qarzdor, manfiy — men unga.
 *
 * Bitim ham, to'lov ham BITTA ishora qoidasi bilan qo'shiladi
 * (fayl boshidagi izohga qarang). Bekor qilinganlar chiqariladi,
 * tasdiqlanmaganlar esa QOLADI — tasdiq dalil, shart emas.
 */
create or replace function public.kassa_hamkor_qoldiq(p_klient_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select
    coalesce((
      select sum(case when b.yonalish = 'berdim' then b.summa else -b.summa end)
        from public.kassa_bitimlar b
       where b.klient_id = p_klient_id and b.holat <> 'bekor'
    ), 0)
    +
    coalesce((
      select sum(case when t.yonalish = 'berdim' then t.summa else -t.summa end)
        from public.kassa_bitim_tolovlar t
       where t.klient_id = p_klient_id and t.holat <> 'bekor'
    ), 0);
$$;

revoke all on function public.kassa_bitim_qoldiq(uuid) from public, anon;
revoke all on function public.kassa_hamkor_qoldiq(uuid) from public, anon;
grant execute on function public.kassa_bitim_qoldiq(uuid) to authenticated;
grant execute on function public.kassa_hamkor_qoldiq(uuid) to authenticated;


-- ---------- 7. Bitim yaratish ----------
--
-- Bitim va (kerak bo'lsa) daftar yozuvi BITTA tranzaksiyada tushadi:
-- ikkisi alohida yozilsa, tarmoq uzilganda qarz paydo bo'lib, pul
-- harakati yozilmay qolardi.
create or replace function public.kassa_bitim_yarat(
  p_klient_id uuid,
  p_yonalish  text,
  p_nima      text,
  p_summa     numeric,
  p_tovar_nom text default null,
  p_birlik    text default null,
  p_miqdor    numeric default null,
  p_narx      numeric default null,
  p_valyuta   text default 'UZS',
  p_kurs      numeric default 1,
  p_muddat    date default null,
  p_izoh      text default null,
  p_sana      timestamptz default null,
  -- 'qarz' bo'lsa MAJBURIY: pul qaysi hisobdan chiqdi/kirdi
  p_hisob_id  uuid default null,
  p_id        uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bitim uuid;
  v_yozuv uuid;
  v_sana  timestamptz := coalesce(p_sana, now());
begin
  if p_nima = 'qarz' and p_hisob_id is null then
    raise exception 'HISOB_KERAK' using hint = 'Pul harakati bor bitimda hisob ko''rsatilishi shart';
  end if;

  insert into public.kassa_bitimlar (
    id, klient_id, yonalish, nima, tovar_nom, birlik, miqdor, narx,
    summa, valyuta, kurs, muddat, izoh, sana
  ) values (
    coalesce(p_id, gen_random_uuid()), p_klient_id, p_yonalish, p_nima,
    p_tovar_nom, p_birlik, p_miqdor, p_narx,
    p_summa, p_valyuta, p_kurs, p_muddat, p_izoh, v_sana
  )
  returning id into v_bitim;

  -- TOVAR — kassaga tegmaydi. Qarz paydo bo'ldi, pul qimirlamadi.
  -- (Eski ilovada «tovar berdim» chiqim bo'lib kassadan pul yechardi
  --  — aynan shu xato tuzatilyapti.)
  if p_nima = 'qarz' then
    insert into public.kassa_yozuvlar (
      hisob_id, turi, summa, valyuta, kurs, klient_id, izoh, sana, bitim_id
    ) values (
      p_hisob_id,
      case when p_yonalish = 'berdim' then 'chiqim' else 'kirim' end,
      p_summa, p_valyuta, p_kurs, p_klient_id,
      coalesce(p_izoh, 'Qarz'), v_sana, v_bitim
    )
    returning id into v_yozuv;
  end if;

  return v_bitim;
end $$;

revoke all on function public.kassa_bitim_yarat(uuid, text, text, numeric, text, text, numeric, numeric, text, numeric, date, text, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.kassa_bitim_yarat(uuid, text, text, numeric, text, text, numeric, numeric, text, numeric, date, text, timestamptz, uuid, uuid) to authenticated;


-- ---------- 8. To'lov qo'shish ----------
create or replace function public.kassa_tolov_qosh(
  p_klient_id uuid,
  p_yonalish  text,
  p_summa     numeric,
  p_hisob_id  uuid,
  p_bitim_id  uuid default null,
  p_usuli     text default 'naqd',
  p_valyuta   text default 'UZS',
  p_kurs      numeric default 1,
  p_izoh      text default null,
  p_sana      timestamptz default null,
  p_id        uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tolov uuid;
  v_yozuv uuid;
  v_sana  timestamptz := coalesce(p_sana, now());
  v_bitim record;
begin
  -- Bitimga bog'langan bo'lsa: yo'nalish TESKARI bo'lishi shart.
  -- «Men berdim» bitimi «men oldim» to'lovi bilan yopiladi. Bir xil
  -- yo'nalish qo'yilsa qarz kamaymay, ikki baravar oshib ketardi.
  if p_bitim_id is not null then
    select * into v_bitim from public.kassa_bitimlar where id = p_bitim_id;
    if not found then
      raise exception 'BITIM_YOQ';
    end if;
    if v_bitim.yonalish = p_yonalish then
      raise exception 'YONALISH_TESKARI_BOLSIN'
        using hint = 'Bitim ' || v_bitim.yonalish || ', to''lov esa qarama-qarshi bo''lishi kerak';
    end if;
    if v_bitim.klient_id <> p_klient_id then
      raise exception 'HAMKOR_MOS_EMAS';
    end if;
  end if;

  -- Pul har doim harakat qiladi — daftarga yozuv tushadi
  insert into public.kassa_yozuvlar (
    hisob_id, turi, summa, valyuta, kurs, klient_id, izoh, sana, bitim_id, tolov_usuli
  ) values (
    p_hisob_id,
    case when p_yonalish = 'berdim' then 'chiqim' else 'kirim' end,
    p_summa, p_valyuta, p_kurs, p_klient_id,
    coalesce(p_izoh, 'To''lov'), v_sana, p_bitim_id,
    case when p_usuli = 'bank' then 'otkazma' when p_usuli = 'tovar' then 'naqd' else p_usuli end
  )
  returning id into v_yozuv;

  insert into public.kassa_bitim_tolovlar (
    id, klient_id, bitim_id, yonalish, summa, valyuta, kurs, usuli,
    yozuv_id, izoh, sana
  ) values (
    coalesce(p_id, gen_random_uuid()), p_klient_id, p_bitim_id, p_yonalish,
    p_summa, p_valyuta, p_kurs, p_usuli, v_yozuv, p_izoh, v_sana
  )
  returning id into v_tolov;

  -- To'liq to'langan bo'lsa bitim yopiladi. Qoldiq SAQLANMAYDI —
  -- har safar qaytadan hisoblanadi, shuning uchun bu yerdagi
  -- `holat` faqat ko'rsatkich, hisobning manbai emas.
  if p_bitim_id is not null and public.kassa_bitim_qoldiq(p_bitim_id) <= 0 then
    update public.kassa_bitimlar
       set holat = 'yopilgan'
     where id = p_bitim_id and holat <> 'bekor';
  end if;

  return v_tolov;
end $$;

revoke all on function public.kassa_tolov_qosh(uuid, text, numeric, uuid, uuid, text, text, numeric, text, timestamptz, uuid) from public, anon;
grant execute on function public.kassa_tolov_qosh(uuid, text, numeric, uuid, uuid, text, text, numeric, text, timestamptz, uuid) to authenticated;


-- ---------- 9. Sinxronizatsiyaga ikki jadval qo'shiladi ----------
--
-- Pul ustunlari ATAYLAB matn bo'lib chiqadi (`::text`) — sababi
-- `20260913000007_kassa_sinx_matn.sql` da: `to_jsonb` numeric'ni
-- JSON float'iga aylantirib, kasr nollarini yo'qotardi.
create or replace function public.kassa_ozgarishlar(
  p_kursor  bigint default 0,
  p_chegara int default 500
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_kursor  bigint := greatest(coalesce(p_kursor, 0), 0);
  v_chegara int    := least(greatest(coalesce(p_chegara, 500), 1), 2000);
  v_yangi   bigint := v_kursor;
  v_tosiq   bigint := null;
  v_h jsonb; v_t jsonb; v_k jsonb; v_y jsonb; v_b jsonb; v_tl jsonb;
  v_n int; v_max bigint;
begin
  -- ---------- Hisoblar ----------
  with q as (
    select * from public.kassa_hisoblar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             to_jsonb(q) || jsonb_build_object('boshlangich', q.boshlangich::text)
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(o_raqam)
    into v_h, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Turkumlar ----------
  with q as (
    select * from public.kassa_turkumlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.o_raqam), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_t, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Klientlar ----------
  with q as (
    select * from public.kassa_klientlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.o_raqam), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_k, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Yozuvlar ----------
  with q as (
    select * from public.kassa_yozuvlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             to_jsonb(q) || jsonb_build_object('summa', q.summa::text, 'kurs', q.kurs::text)
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(o_raqam)
    into v_y, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Bitimlar ----------
  with q as (
    select * from public.kassa_bitimlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             to_jsonb(q) || jsonb_build_object(
               'summa',  q.summa::text,
               'kurs',   q.kurs::text,
               'miqdor', q.miqdor::text,
               'narx',   q.narx::text
             )
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(o_raqam)
    into v_b, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- To'lovlar ----------
  with q as (
    select * from public.kassa_bitim_tolovlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             to_jsonb(q) || jsonb_build_object('summa', q.summa::text, 'kurs', q.kurs::text)
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(o_raqam)
    into v_tl, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  if v_tosiq is not null then
    v_yangi := v_tosiq;
  end if;

  return jsonb_build_object(
    'kursor',    v_yangi,
    'yana',      v_tosiq is not null,
    'hisoblar',  v_h,
    'turkumlar', v_t,
    'klientlar', v_k,
    'yozuvlar',  v_y,
    'bitimlar',  v_b,
    'tolovlar',  v_tl
  );
end $$;

revoke all on function public.kassa_ozgarishlar(bigint, int) from public, anon;
grant execute on function public.kassa_ozgarishlar(bigint, int) to authenticated;
