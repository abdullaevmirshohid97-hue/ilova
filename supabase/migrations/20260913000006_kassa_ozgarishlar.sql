-- =============================================================
-- CREDIT DEBIT — OFFLINE SINXRONIZATSIYA: o'zgarishlarni olish
--
-- Mijoz (telefon/brauzer) mahalliy nusxa saqlaydi va vaqti-vaqti
-- bilan "shu raqamdan keyin nima o'zgardi?" deb so'raydi. Javob
-- to'rtala jadvaldan bir marta keladi — to'rt alohida so'rov sekin
-- internetda sezilarli kechikish berardi.
--
-- NEGA `o_raqam`, NEGA `updated_at` EMAS
-- Vaqt bo'yicha so'ralsa yozuv YO'QOLADI:
--   · bir millisekundda ikki qator yangilansa, ikkinchisi tushib
--     qoladi (`>` qat'iy, `>=` esa cheksiz takror beradi);
--   · telefon soati serverdan farq qiladi.
-- `o_raqam` — serverdagi yagona ketma-ketlik (trigger qo'yadi),
-- ya'ni tartib bitta va u faqat oldinga yuradi.
--
-- CHEGARA VA XAVFSIZ KURSOR
-- Bir so'rovda ko'pi bilan `p_chegara` qator keladi. Agar birorta
-- jadval chegaraga TO'LIB kelsa, qaytariladigan kursor o'sha
-- jadvalning oxirgi qatoriga qo'yiladi — boshqa jadvallarning undan
-- keyingi qatorlari KEYINGI so'rovda qayta keladi. Bir qator ikki
-- marta kelishi zararsiz (mijoz uni id bo'yicha ustiga yozadi),
-- tushib qolishi esa — balansni yolg'on qiladi.
--
-- SECURITY DEFINER EMAS (ataylab): RLS ishlasin va org filtri
-- qo'lda yozilmasin. Bu loyihada definer funksiyaga org tekshiruvi
-- qo'shishni unutish ikki marta tenant chegarasini teshgan.
--
-- O'CHIRISH: `kassa_*` jadvallarida qator o'chirilmaydi (hisob va
-- turkum `faol=false`, yozuv `bekor_at` bilan yopiladi), shuning
-- uchun "tombstone" ro'yxati kerak emas. Butun tashkilot o'chsa —
-- mijozning hisobi ham o'chadi va ilova kirish ekraniga qaytadi.
-- =============================================================

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
  v_tosiq   bigint := null;   -- chegaraga to'lgan jadvalning oxirgi raqami
  v_h jsonb; v_t jsonb; v_k jsonb; v_y jsonb;
  v_n int; v_max bigint;
begin
  -- ---------- Hisoblar ----------
  with q as (
    select * from public.kassa_hisoblar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by (to_jsonb(q)->>'o_raqam')::bigint), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_h, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Turkumlar ----------
  with q as (
    select * from public.kassa_turkumlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by (to_jsonb(q)->>'o_raqam')::bigint), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_t, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Klientlar ----------
  with q as (
    select * from public.kassa_klientlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by (to_jsonb(q)->>'o_raqam')::bigint), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_k, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  -- ---------- Yozuvlar ----------
  with q as (
    select * from public.kassa_yozuvlar
    where o_raqam > v_kursor order by o_raqam limit v_chegara
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by (to_jsonb(q)->>'o_raqam')::bigint), '[]'::jsonb),
         count(*), max(o_raqam)
    into v_y, v_n, v_max from q;
  v_yangi := greatest(v_yangi, coalesce(v_max, 0));
  if v_n >= v_chegara then v_tosiq := least(coalesce(v_tosiq, v_max), v_max); end if;

  if v_tosiq is not null then
    v_yangi := v_tosiq;
  end if;

  return jsonb_build_object(
    'kursor',    v_yangi,
    -- «yana bor» bo'lsa mijoz darhol keyingi paketni so'raydi
    'yana',      v_tosiq is not null,
    'hisoblar',  v_h,
    'turkumlar', v_t,
    'klientlar', v_k,
    'yozuvlar',  v_y
  );
end $$;

revoke all on function public.kassa_ozgarishlar(bigint, int) from public, anon;
grant execute on function public.kassa_ozgarishlar(bigint, int) to authenticated;

comment on function public.kassa_ozgarishlar(bigint, int) is
  'Offline mijoz uchun: `o_raqam` kursoridan keyingi o''zgarishlar. RLS ishlaydi (definer emas).';


-- =============================================================
-- Qurilma kursorini eslab qolish
--
-- Mijoz kursorni o'zida saqlaydi, lekin ilova o'chirilib qayta
-- o'rnatilsa u yo'qoladi va BUTUN tarix qaytadan yuklanardi.
-- Shuning uchun oxirgi kursor serverda ham turadi.
--
-- Jadval SHU YERDA yaratiladi. Reja hujjatida u 3-migratsiyada
-- ko'rsatilgan edi, lekin o'sha yerga tushmay qolgan — baza buni
-- "relation does not exist" bilan ushladi.
-- =============================================================

create table if not exists public.kassa_qurilmalar (
  -- Mijoz o'zi yaratadi (uuid) va qayta o'rnatilgunicha saqlaydi
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  nom           text,
  platforma     text,
  oxirgi_kursor bigint not null default 0,
  oxirgi_sinx   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists kassa_qurilmalar_org_idx
  on public.kassa_qurilmalar (org_id, user_id);


create or replace function public.kassa_qurilma_kursor(
  p_qurilma text,
  p_kursor  bigint,
  p_nom     text default null,
  p_platforma text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_uid uuid := auth.uid();
begin
  if v_org is null or v_uid is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  if coalesce(btrim(p_qurilma), '') = '' then
    raise exception 'QURILMA_YOQ';
  end if;

  insert into public.kassa_qurilmalar (id, org_id, user_id, nom, platforma, oxirgi_kursor, oxirgi_sinx)
  values (
    -- Qurilma id'si mijozda yaratiladi (uuid). Noto'g'ri kelsa —
    -- yangi qator ochiladi, bu zararsiz.
    coalesce(nullif(p_qurilma, '')::uuid, gen_random_uuid()),
    v_org, v_uid, p_nom, p_platforma, p_kursor, now()
  )
  on conflict (id) do update
    set oxirgi_kursor = greatest(public.kassa_qurilmalar.oxirgi_kursor, excluded.oxirgi_kursor),
        oxirgi_sinx   = now(),
        nom           = coalesce(excluded.nom, public.kassa_qurilmalar.nom),
        platforma     = coalesce(excluded.platforma, public.kassa_qurilmalar.platforma)
    where public.kassa_qurilmalar.org_id = v_org;
end $$;

revoke all on function public.kassa_qurilma_kursor(text, bigint, text, text) from public, anon;
grant execute on function public.kassa_qurilma_kursor(text, bigint, text, text) to authenticated;

-- RLS: qurilma ro'yxati ham tenant ichida qoladi.
alter table public.kassa_qurilmalar enable row level security;

drop policy if exists "kassa_qurilmalar: oz qurilmalari" on public.kassa_qurilmalar;
create policy "kassa_qurilmalar: oz qurilmalari" on public.kassa_qurilmalar
  for all to authenticated
  using (org_id = current_org_id() and user_id = auth.uid())
  with check (org_id = current_org_id() and user_id = auth.uid());
