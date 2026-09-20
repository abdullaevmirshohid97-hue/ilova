-- =============================================================
--  CLARY — BIR NECHTA VALYUTA
--
--  Do'kondor asosiy valyutasini tanlaydi (O'zbekistonda UZS) va
--  yoniga bir-ikkitasini qo'shadi: dollar, rubl, tenge. Har
--  biriga kurs kiritadi — «1 dollar 11 850 so'm».
--
--  KURS YOZUVDA MUZLATILADI. `kassa_yozuvlar.kurs`,
--  `kassa_bitimlar.kurs` va `kassa_bitim_tolovlar.kurs` allaqachon
--  bor va ular yozuv paytidagi kursni saqlaydi. Bu jadval esa
--  BUGUNGI kursni beradi — yangi yozuv o'shandan oladi.
--
--  Ikkisi ATAYLAB alohida: kurs ertaga o'zgarsa, kechagi bitim
--  o'zgarmasligi kerak. Kecha 11 850 ga kelishilgan qarz bugun
--  12 000 bo'lib qolsa, daftar yolg'on bo'lardi va hamkor buni
--  darrov sezardi.
--
--  ASOSIY VALYUTA — bitta. Uni `asosiy = true` belgilaydi va
--  unikal indeks bittadan ko'p bo'lishiga yo'l qo'ymaydi.
-- =============================================================


-- ---------- 1. Valyuta ro'yxati kengayadi ----------
--
-- Ilovadagi `VALYUTALAR` ro'yxati bilan AYNAN bir xil bo'lishi
-- shart: ilova yozmoqchi bo'lgan valyutani server rad etsa,
-- sabab ekranda «cheklov buzildi» bo'lib chiqardi.
do $$
declare
  v_jadval text;
  v_cheklov text;
begin
  foreach v_jadval in array array[
    'kassa_hisoblar', 'kassa_yozuvlar', 'kassa_klientlar',
    'kassa_bitimlar', 'kassa_bitim_tolovlar'
  ] loop
    -- Har jadvalda cheklov nomi boshqacha bo'lishi mumkin,
    -- shuning uchun `valyuta` ustuniga tegishlisini topamiz.
    for v_cheklov in
      select c.conname
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
       where c.conrelid = ('public.' || v_jadval)::regclass
         and c.contype = 'c'
         and a.attname = 'valyuta'
    loop
      execute format('alter table public.%I drop constraint %I', v_jadval, v_cheklov);
    end loop;

    execute format(
      'alter table public.%I add constraint %I check (valyuta in (''UZS'',''USD'',''EUR'',''RUB'',''KZT'',''KGS'',''TRY'',''AZN'',''TJS''))',
      v_jadval, v_jadval || '_valyuta_chk'
    );
  end loop;
end $$;


-- ---------- 2. Valyuta va kurs jadvali ----------
create table if not exists public.kassa_valyutalar (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade
               default public.current_org_id(),
  valyuta    text not null
               check (valyuta in ('UZS','USD','EUR','RUB','KZT','KGS','TRY','AZN','TJS')),
  -- 1 birlik necha ASOSIY valyuta birligiga teng.
  -- Asosiy valyutaning o'zida 1 bo'ladi.
  kurs       numeric(18,6) not null default 1 check (kurs > 0),
  asosiy     boolean not null default false,
  faol       boolean not null default true,
  versiya    int not null default 1,
  o_raqam    bigint,
  qurilma_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, valyuta)
);

-- Asosiy valyuta BITTA bo'ladi. Ikkitasi bo'lsa jami raqam
-- qaysi biriga o'girilganini hech kim bilmasdi.
create unique index if not exists kassa_valyutalar_asosiy_uniq
  on public.kassa_valyutalar (org_id) where asosiy;

create index if not exists kassa_valyutalar_oqim_idx
  on public.kassa_valyutalar (o_raqam);

alter table public.kassa_valyutalar enable row level security;

drop policy if exists "kassa_valyutalar: oz tashkiloti" on public.kassa_valyutalar;
create policy "kassa_valyutalar: oz tashkiloti" on public.kassa_valyutalar
  for all to authenticated
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

drop trigger if exists trg_kassa_valyutalar_oqim on public.kassa_valyutalar;
create trigger trg_kassa_valyutalar_oqim
  before insert or update on public.kassa_valyutalar
  for each row execute function public.tg_kassa_oqim();


-- ---------- 3. Mavjud tashkilotlarga asosiy valyuta ----------
--
-- Birinchi hisobning valyutasi olinadi: odam ro'yxatdan
-- o'tganda unga UZS li ikkita hisob yaratilgan, ya'ni bu
-- amalda uning asosiy valyutasi.
insert into public.kassa_valyutalar (org_id, valyuta, kurs, asosiy)
select o.id,
       coalesce(
         (select h.valyuta from public.kassa_hisoblar h
           where h.org_id = o.id order by h.tartib limit 1),
         'UZS'
       ),
       1,
       true
  from public.organizations o
 where o.yonalishlar @> array['kassa']
on conflict (org_id, valyuta) do nothing;


-- ---------- 4. Sinxronizatsiyaga qo'shiladi ----------
--
-- Funksiya tanasi 20260920000001 dan ko'chirilib, bitta blok
-- qo'shildi. `kurs` MATN bo'lib chiqadi: `to_jsonb` numeric ni
-- JSON float ga aylantirib, 11850.500000 ni yo'qotardi.
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
  v_h jsonb; v_t jsonb; v_k jsonb; v_y jsonb; v_b jsonb; v_tl jsonb; v_v jsonb;
  v_n int; v_max bigint;
begin
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

  with q as (
    select * from public.kassa_turkumlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.o_raqam), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_t, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  with q as (
    select * from public.kassa_klientlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.o_raqam), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_k, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

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

  -- ---------- Valyutalar ----------
  with q as (
    select * from public.kassa_valyutalar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(
           jsonb_agg(
             to_jsonb(q) || jsonb_build_object('kurs', q.kurs::text)
             order by q.o_raqam
           ),
           '[]'::jsonb
         ),
         count(*), max(o_raqam)
    into v_v, v_n, v_max from q;
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
    'tolovlar',  v_tl,
    'valyutalar', v_v
  );
end $$;

revoke all on function public.kassa_ozgarishlar(bigint, int) from public, anon;
grant execute on function public.kassa_ozgarishlar(bigint, int) to authenticated;
