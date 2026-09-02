-- =============================================================
--  HUJJAT VA CHOP ETISH SOZLAMASI
--
--  Har tenant o'z hujjatlarini o'zi sozlaydi: logo, rekvizit, qog'oz,
--  chekka, shrift, ustunlar. Hozir bularning hech biri saqlanmaydi -
--  to'rtta chop etish shabloni to'rt xil qattiq yozilgan qiymat bilan
--  ishlaydi va logo umuman yo'q.
--
--  XAVFSIZLIK - BU JADVAL ALOHIDA E'TIBOR TALAB QILADI:
--  ichida biznesning rekvizitlari turadi (manzil, STIR, bank hisobi).
--  Sizib ketsa mijoz ro'yxatidan kam zarar emas. Shuning uchun:
--    - org_id majburiy va birlamchi kalit
--    - RLS birinchi kundan
--    - VIEW orqali o'qilmaydi (bugungi sizish aynan view'dan chiqqan edi)
--    - logo bucket'i OCHIQ EMAS
--    - jadval darhol tests/tenant-ajratish.mjs ga qo'shiladi
-- =============================================================

create table if not exists org_hujjat_sozlama (
  org_id uuid primary key references organizations(id) on delete cascade,

  -- Bosh qism
  logo_path     text,
  manzil        text,
  telefon       text,
  stir          text,          -- soliq to'lovchi identifikatsiya raqami
  bank          text,
  hisob_raqam   text,

  -- Qog'oz. Chekka millimetrda - printer drayveri shu birlikda ishlaydi.
  qogoz         text    not null default 'A4' check (qogoz in ('A4', 'A5')),
  chekka_tepa   int     not null default 14 check (chekka_tepa between 0 and 50),
  chekka_past   int     not null default 14 check (chekka_past between 0 and 50),
  chekka_chap   int     not null default 14 check (chekka_chap between 0 and 50),
  chekka_ong    int     not null default 14 check (chekka_ong between 0 and 50),

  -- Shrift. O'lchamlar punktda (pt) - chop etishda shu birlik ishlatiladi.
  shrift        text    not null default 'sans-serif',
  olcham_matn   int     not null default 11 check (olcham_matn between 6 and 20),
  olcham_sarlavha int   not null default 20 check (olcham_sarlavha between 10 and 40),
  olcham_jadval int     not null default 10 check (olcham_jadval between 6 and 18),

  -- Ko'rinish
  rang          text    not null default '#7000FF'
                        check (rang ~ '^#[0-9A-Fa-f]{6}$'),

  -- Jadval ustunlari: keraksizini o'chirish siyoh va joy tejaydi
  ustun_rasm    boolean not null default true,
  ustun_sku     boolean not null default true,
  ustun_razmer  boolean not null default true,

  -- Pastki qism
  imzo_topshirdi text   not null default 'Topshirdi',
  imzo_qabul     text   not null default 'Qabul qildi',
  altbilgi       text,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

alter table org_hujjat_sozlama enable row level security;

-- Tenant faqat o'zinikini ko'radi va yozadi. super_admin hammasini
-- ko'radi (qo'llab-quvvatlash uchun) - is_admin() ichida u ham bor,
-- shuning uchun alohida shart kerak emas... lekin uning org_id'si
-- bitta tenantga bog'langan bo'lishi mumkin, shuning uchun aniq yozamiz.
drop policy if exists "hujjat sozlama: o'z tenanti" on org_hujjat_sozlama;
create policy "hujjat sozlama: o'z tenanti"
  on org_hujjat_sozlama for all
  to authenticated
  using (is_super_admin() or (is_admin() and org_id = current_org_id()))
  with check (is_super_admin() or (is_admin() and org_id = current_org_id()));

-- Menejer va mijoz o'qiy olishi kerak emas: hujjat ular uchun tayyor
-- holda (chop etish oynasida) keladi, sozlama esa admin ishi.

comment on table org_hujjat_sozlama is
  'Har tenantning hujjat ko''rinishi. Ichida rekvizit bor - RLS majburiy, '
  'view orqali ochilmasin.';


-- ---------- O'qish ----------
-- Qator yo'q bo'lsa standart qiymatlar qaytadi: panel "hali sozlanmagan"
-- holatini alohida ishlashi shart emas, hujjat esa birinchi kundan
-- to'g'ri chiqadi.
create or replace function public.hujjat_sozlama()
returns org_hujjat_sozlama
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_row org_hujjat_sozlama;
begin
  if v_org is null then
    raise exception 'TENANT_YOQ';
  end if;

  select * into v_row from org_hujjat_sozlama where org_id = v_org;
  if found then
    return v_row;
  end if;

  -- Standart qiymatlar bilan (bazaga yozmasdan)
  v_row.org_id := v_org;
  v_row.qogoz := 'A4';
  v_row.chekka_tepa := 14; v_row.chekka_past := 14;
  v_row.chekka_chap := 14; v_row.chekka_ong := 14;
  v_row.shrift := 'sans-serif';
  v_row.olcham_matn := 11; v_row.olcham_sarlavha := 20; v_row.olcham_jadval := 10;
  v_row.rang := '#7000FF';
  v_row.ustun_rasm := true; v_row.ustun_sku := true; v_row.ustun_razmer := true;
  v_row.imzo_topshirdi := 'Topshirdi'; v_row.imzo_qabul := 'Qabul qildi';
  return v_row;
end $$;

revoke all on function public.hujjat_sozlama() from public, anon;
grant execute on function public.hujjat_sozlama() to authenticated;


-- ---------- Yozish ----------
-- org_id ATAYLAB parametr emas: u current_org_id() dan olinadi.
-- Aks holda admin boshqa tenantning id'sini yuborib ko'rishi mumkin
-- bo'lardi va butun himoya bitta parametrga bog'lanib qolardi.
create or replace function public.hujjat_sozlama_saqla(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
begin
  if not is_admin() or v_org is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into org_hujjat_sozlama as s (
    org_id, logo_path, manzil, telefon, stir, bank, hisob_raqam,
    qogoz, chekka_tepa, chekka_past, chekka_chap, chekka_ong,
    shrift, olcham_matn, olcham_sarlavha, olcham_jadval, rang,
    ustun_rasm, ustun_sku, ustun_razmer,
    imzo_topshirdi, imzo_qabul, altbilgi, updated_at, updated_by
  )
  values (
    v_org,
    nullif(btrim(coalesce(p->>'logo_path', '')), ''),
    nullif(btrim(coalesce(p->>'manzil', '')), ''),
    nullif(btrim(coalesce(p->>'telefon', '')), ''),
    nullif(btrim(coalesce(p->>'stir', '')), ''),
    nullif(btrim(coalesce(p->>'bank', '')), ''),
    nullif(btrim(coalesce(p->>'hisob_raqam', '')), ''),
    coalesce(p->>'qogoz', 'A4'),
    coalesce((p->>'chekka_tepa')::int, 14),
    coalesce((p->>'chekka_past')::int, 14),
    coalesce((p->>'chekka_chap')::int, 14),
    coalesce((p->>'chekka_ong')::int, 14),
    coalesce(nullif(btrim(coalesce(p->>'shrift', '')), ''), 'sans-serif'),
    coalesce((p->>'olcham_matn')::int, 11),
    coalesce((p->>'olcham_sarlavha')::int, 20),
    coalesce((p->>'olcham_jadval')::int, 10),
    upper(coalesce(p->>'rang', '#7000FF')),
    coalesce((p->>'ustun_rasm')::boolean, true),
    coalesce((p->>'ustun_sku')::boolean, true),
    coalesce((p->>'ustun_razmer')::boolean, true),
    coalesce(nullif(btrim(coalesce(p->>'imzo_topshirdi', '')), ''), 'Topshirdi'),
    coalesce(nullif(btrim(coalesce(p->>'imzo_qabul', '')), ''), 'Qabul qildi'),
    nullif(btrim(coalesce(p->>'altbilgi', '')), ''),
    now(), auth.uid()
  )
  on conflict (org_id) do update set
    logo_path = excluded.logo_path,
    manzil = excluded.manzil,
    telefon = excluded.telefon,
    stir = excluded.stir,
    bank = excluded.bank,
    hisob_raqam = excluded.hisob_raqam,
    qogoz = excluded.qogoz,
    chekka_tepa = excluded.chekka_tepa,
    chekka_past = excluded.chekka_past,
    chekka_chap = excluded.chekka_chap,
    chekka_ong = excluded.chekka_ong,
    shrift = excluded.shrift,
    olcham_matn = excluded.olcham_matn,
    olcham_sarlavha = excluded.olcham_sarlavha,
    olcham_jadval = excluded.olcham_jadval,
    rang = excluded.rang,
    ustun_rasm = excluded.ustun_rasm,
    ustun_sku = excluded.ustun_sku,
    ustun_razmer = excluded.ustun_razmer,
    imzo_topshirdi = excluded.imzo_topshirdi,
    imzo_qabul = excluded.imzo_qabul,
    altbilgi = excluded.altbilgi,
    updated_at = now(),
    updated_by = auth.uid();
end $$;

revoke all on function public.hujjat_sozlama_saqla(jsonb) from public, anon;
grant execute on function public.hujjat_sozlama_saqla(jsonb) to authenticated;


-- ---------- Logo uchun bucket ----------
-- OCHIQ EMAS. Mahsulot rasmlaridan farqli o'laroq logo mijoz ilovasida
-- ko'rsatilmaydi - u faqat hujjatga tushadi, hujjatni esa o'z odamlaring
-- ochadi. Ochiq qilishga sabab yo'q, sizishga esa sabab bo'lardi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', false, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];

-- Yo'l TENANT ID BILAN boshlanadi: '<org_id>/logo.png'. Shu qoida
-- tufayli siyosat yo'lning o'zidan tenantni biladi va boshqa jadvalga
-- qaramaydi - avatarlardagi muammo bu yerda takrorlanmaydi.
drop policy if exists "org logos: o'z tenanti" on storage.objects;
create policy "org logos: o'z tenanti"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'org-logos'
    and is_admin()
    and split_part(name, '/', 1) = public.current_org_id()::text
  )
  with check (
    bucket_id = 'org-logos'
    and is_admin()
    and split_part(name, '/', 1) = public.current_org_id()::text
  );
