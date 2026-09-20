-- =============================================================
--  CLARY — MIJOZ KARTOCHKASI VA BIZNESNI O'CHIRISH
--
--  Ikki mustaqil ish, bitta migratsiyada:
--    1. `kassa_klientlar` kengayadi (rasm, familya, manzil,
--       joylashuv, kategoriya, balans cheklovi)
--    2. `kassa_biznes_ochir` — biznesni o'chirish
--
--  PUL USTUNI HAQIDA. `cheklov` ataylab `bigint` va TIYINDA
--  saqlanadi, `numeric` emas. Sabab: `kassa_ozgarishlar` klient
--  qatorini `to_jsonb(q)` bilan beradi va numeric u yerda JSON
--  FLOAT ga aylanadi — loyihada shu sababli hamma pul matn bo'lib
--  uzatiladi. Butun son esa 2^53 gacha aniq, ya'ni bigint hech
--  narsa yo'qotmaydi va sinx funksiyasiga tegish kerak emas.
--
--  JOYLASHUV `double precision`: koordinata aslida shunday son va
--  u JSON da aniq aylanadi. Uni matn qilish faqat ishni
--  murakkablashtirardi.
-- =============================================================


-- ---------- 1. Mijoz kartochkasi ----------
alter table public.kassa_klientlar
  add column if not exists familya    text,
  -- Storage'dagi YO'L, to'liq URL emas: bucket nomi o'zgarsa yoki
  -- loyiha ko'chsa, bazadagi yuzlab URL eskirib qolardi.
  add column if not exists rasm       text,
  add column if not exists manzil     text,
  add column if not exists lat        double precision,
  add column if not exists lng        double precision,
  add column if not exists kategoriya text,
  -- Qarz chegarasi TIYINDA. null = cheklov yo'q.
  -- Ilova buni QAT'IY to'smaydi, ogohlantiradi va tasdiqlatadi
  -- (qaror 20.09): savdo o'rtasida ilova to'sib qo'ysa, odam
  -- yozuvni umuman yozmay qo'yardi va daftar yolg'on bo'lardi.
  add column if not exists cheklov    bigint;

alter table public.kassa_klientlar
  drop constraint if exists kassa_klientlar_cheklov_musbat;
alter table public.kassa_klientlar
  add constraint kassa_klientlar_cheklov_musbat
  check (cheklov is null or cheklov > 0);

-- Koordinata juft bo'lishi kerak: bittasi bo'lsa xarita nuqtani
-- ekvatorga qo'yib yuborardi va buni hech kim sezmasdi.
alter table public.kassa_klientlar
  drop constraint if exists kassa_klientlar_joylashuv_juft;
alter table public.kassa_klientlar
  add constraint kassa_klientlar_joylashuv_juft
  check ((lat is null) = (lng is null));

alter table public.kassa_klientlar
  drop constraint if exists kassa_klientlar_joylashuv_chegara;
alter table public.kassa_klientlar
  add constraint kassa_klientlar_joylashuv_chegara
  check (lat is null or (lat between -90 and 90 and lng between -180 and 180));


-- ---------- 2. Rasmlar ombori ----------
--
-- Yo'l: `<org_id>/<klient_id>.jpg`. Birinchi bo'lak org_id
-- bo'lgani uchun siyosat uni to'g'ridan-to'g'ri tekshira oladi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kassa-rasm', 'kassa-rasm', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ombor OCHIQ EMAS: mijoz rasmi shaxsiy ma'lumot. Ilova uni
-- imzolangan havola bilan oladi.
drop policy if exists "kassa-rasm: oz tashkiloti" on storage.objects;
create policy "kassa-rasm: oz tashkiloti" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'kassa-rasm'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  )
  with check (
    bucket_id = 'kassa-rasm'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );


-- ---------- 3. Biznesni o'chirish ----------
--
-- QURUQ SINOV bilan: `p_qollash = false` (standart) nima
-- o'chishini SANAB beradi, hech narsaga tegmaydi. Ilova avval
-- shuni ko'rsatadi, odam tasdiqlagandan keyin `true` bilan
-- qayta chaqiradi. Bu loyihaning 1-qoidasi.
--
-- OXIRGI BIZNESNI O'CHIRIB BO'LMAYDI: `profiles.org_id` bo'sh
-- qolsa `current_org_id()` null qaytaradi va ilova butunlay
-- ishlamay qoladi. Hisobni butunlay o'chirish uchun alohida
-- oqim bor (`kassa-hisob-ochir` chekka funksiyasi).
create or replace function public.kassa_biznes_ochir(
  p_org_id  uuid,
  p_qollash boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_nom    text;
  v_jami   int;
  v_yozuv  int;
  v_bitim  int;
  v_klient int;
  v_boshqa uuid;
begin
  if v_uid is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- A'zolik + kassa tashkiloti: `kassa_biznes_tanla` dagi ikki
  -- qorovulning o'zi.
  select o.name into v_nom
    from public.uzvliklar u
    join public.organizations o on o.id = u.org_id
   where u.user_id = v_uid and u.org_id = p_org_id
     and u.role = 'admin' and o.yonalishlar @> array['kassa'];
  if not found then
    raise exception 'RUXSAT_YOQ';
  end if;

  select count(*) into v_jami
    from public.uzvliklar u
    join public.organizations o on o.id = u.org_id
   where u.user_id = v_uid and o.yonalishlar @> array['kassa'];
  if v_jami <= 1 then
    raise exception 'OXIRGI_BIZNES: oxirgi biznesni o''chirib bo''lmaydi';
  end if;

  select count(*) into v_yozuv  from public.kassa_yozuvlar   where org_id = p_org_id;
  select count(*) into v_bitim  from public.kassa_bitimlar   where org_id = p_org_id;
  select count(*) into v_klient from public.kassa_klientlar  where org_id = p_org_id;

  if not coalesce(p_qollash, false) then
    return jsonb_build_object(
      'quruq',   true,
      'nom',     v_nom,
      'yozuvlar', v_yozuv,
      'bitimlar', v_bitim,
      'klientlar', v_klient
    );
  end if;

  -- O'chirilayotgani JORIY biznes bo'lsa, avval boshqasiga
  -- o'tamiz: aks holda `profiles.org_id` o'chgan tashkilotga
  -- ishora qilib qolardi.
  if (select org_id from public.profiles where id = v_uid) = p_org_id then
    select u.org_id into v_boshqa
      from public.uzvliklar u
      join public.organizations o on o.id = u.org_id
     where u.user_id = v_uid and u.org_id <> p_org_id
       and o.yonalishlar @> array['kassa']
     order by o.name
     limit 1;
    update public.profiles set org_id = v_boshqa where id = v_uid;
  end if;

  -- `organizations` dagi cascade hamma kassa jadvalini olib
  -- ketadi (har birida `references organizations(id) on delete
  -- cascade` turibdi).
  delete from public.organizations where id = p_org_id;

  return jsonb_build_object(
    'quruq',     false,
    'nom',       v_nom,
    'yozuvlar',  v_yozuv,
    'bitimlar',  v_bitim,
    'klientlar', v_klient,
    'joriy',     (select org_id from public.profiles where id = v_uid)
  );
end $$;

revoke all on function public.kassa_biznes_ochir(uuid, boolean) from public, anon;
grant execute on function public.kassa_biznes_ochir(uuid, boolean) to authenticated;

comment on function public.kassa_biznes_ochir(uuid, boolean) is
  'Biznesni o`chiradi. p_qollash=false (standart) — QURUQ SINOV: nima o`chishini sanab beradi, tegmaydi.';
