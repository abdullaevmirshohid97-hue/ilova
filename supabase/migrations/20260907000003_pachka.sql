-- =============================================================
--  PACHKA VA DONA
--
--  Prays fayllarida narx PACHKA uchun beriladi: «Виусид пор.4.5г.№90»
--  — 2 605 172 so'm, ya'ni to'qson dona uchun. Mijoz esa ba'zan
--  o'ntasini so'raydi. Hozir buni faqat qo'lda hisoblab, alohida
--  yozib berish mumkin edi.
--
--  Dona soni NOMDA turibdi: №90, N90, #90. Faol 4 645 doridan
--  3 220 tasida shu belgi bor. Qolganlari malham, sprey, flakon —
--  ular tabiiy ravishda bir dona, ya'ni pachka = 1.
--
--  Nom o'zgarishi mumkin, shuning uchun qiymat ustunda saqlanadi va
--  ustunga QO'LDA yozilgan qiymat hech qachon ustidan yozilmaydi:
--  robot faqat bo'sh joyni to'ldiradi.
-- =============================================================

alter table dori_products
  add column if not exists pachka int;

alter table dori_products drop constraint if exists dori_products_pachka_chk;
alter table dori_products
  add constraint dori_products_pachka_chk check (pachka is null or pachka between 1 and 10000);

comment on column dori_products.pachka is
  'Bitta pachkadagi dona soni. null = noma''lum (bitta dona deb hisoblanadi).';


-- ---------- Nomdan dona sonini topish ----------
-- Ataylab qat'iy: faqat №, N yoki # dan keyin kelgan son olinadi.
--
-- «Момат рино спрей наз 60доз» dagi 60 — DOZA, pachka emas. Belgisiz
-- sonni olsak, shunga o'xshash o'nlab dori noto'g'ri bo'linib ketardi
-- va mijozga besh baravar arzon narx chiqib qolardi.
--
-- «№2х15» — ikkitadan o'n besh pachka, ya'ni o'ttiz dona. Bunday nom
-- ikkitagina, lekin ularni ham to'g'ri hisoblash arzon.
create or replace function public.dori_pachka_top(p_nom text)
returns int
language plpgsql
immutable
as $$
declare
  v_kop text[];
  v_bir text[];
  v_n   int;
begin
  if p_nom is null then
    return null;
  end if;

  -- Avval ko'paytma: №2х15 (kirill х ham, lotin x ham, * ham, × ham)
  v_kop := regexp_match(p_nom, '(?:№|#|\mN)\s*([0-9]{1,4})\s*[xх*×]\s*([0-9]{1,4})(?![0-9])');
  if v_kop is not null then
    v_n := v_kop[1]::int * v_kop[2]::int;
    return case when v_n between 1 and 10000 then v_n else null end;
  end if;

  -- Oddiy: №90. Sondan keyin raqam, vergul yoki nuqta kelmasin —
  -- «№10,5» kabi yozuv dona soni emas.
  --
  -- Sondan keyin O'LCHOV BIRLIGI kelsa ham dona soni emas:
  -- «Флуцинар N 15г» — o'n besh gramm malham, o'n besh dona emas.
  v_bir := regexp_match(
    p_nom,
    '(?:№|#|\mN)\s*([0-9]{1,4})(?![0-9,.])(?!\s*(?:г|мг|мкг|гр|мл|л|кг|доз|%))'
  );
  if v_bir is null then
    return null;
  end if;

  v_n := v_bir[1]::int;
  return case when v_n between 1 and 10000 then v_n else null end;
end $$;

comment on function public.dori_pachka_top(text) is
  'Dori nomidan pachkadagi dona sonini ajratadi: №90 -> 90, №2х15 -> 30.';


-- ---------- Yangi dori o'zi to'ldirilsin ----------
-- Prays har hafta yuklanadi va yangi nomlar qo'shiladi. Trigger
-- bo'lmasa ular pachkasiz qolib, faqat qo'lda tuzatilardi.
--
-- QO'LDAGI QIYMAT SAQLANADI: trigger faqat null joyni to'ldiradi.
-- Operator «№10» deb yozilgan, aslida 12 talik qutini tuzatgan bo'lsa,
-- keyingi import uni qaytarib buzmasin.
create or replace function public.dori_pachka_trigger()
returns trigger
language plpgsql
as $$
begin
  if new.pachka is null then
    new.pachka := dori_pachka_top(new.name);
  end if;
  return new;
end $$;

drop trigger if exists dori_products_pachka on public.dori_products;
create trigger dori_products_pachka
  before insert or update of name on public.dori_products
  for each row execute function public.dori_pachka_trigger();


-- ---------- Mavjud katalogni to'ldirish ----------
-- p_qollash = false: nima o'zgarishini KO'RSATADI, hech narsa yozmaydi.
-- 4 600 dorining bo'linish koeffitsientini ko'rmasdan o'zgartirish
-- juda oson bo'lardi — bitta xato bo'lish butun praysni buzadi.
create or replace function public.dori_pachka_toldir(p_qollash boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jami    int;
  v_toladi  int;
  v_namuna  jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select count(*)::int into v_jami from dori_products where pachka is null;

  select count(*)::int into v_toladi
  from dori_products
  where pachka is null and dori_pachka_top(name) is not null;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_namuna
  from (
    select p.name,
           dori_pachka_top(p.name) as pachka,
           p.price,
           case when coalesce(dori_pachka_top(p.name), 1) > 1
                then ceil(p.price / dori_pachka_top(p.name))
           end as dona_narx
    from dori_products p
    where p.pachka is null
      and dori_pachka_top(p.name) is not null
      and p.price is not null
    order by dori_pachka_top(p.name) desc
    limit 12
  ) t;

  if p_qollash then
    update dori_products
       set pachka = dori_pachka_top(name)
     where pachka is null and dori_pachka_top(name) is not null;
  end if;

  return jsonb_build_object(
    'qollandi',   p_qollash,
    'pachkasiz',  v_jami,
    'toladi',     v_toladi,
    'toldirilmadi', v_jami - v_toladi,
    'namuna',     v_namuna
  );
end $$;

revoke all on function public.dori_pachka_toldir(boolean) from public, anon;
grant execute on function public.dori_pachka_toldir(boolean) to authenticated;

comment on function public.dori_pachka_toldir(boolean) is
  'Nomdan pachka sonini to''ldiradi. p_qollash=false — quruq sinov.';
