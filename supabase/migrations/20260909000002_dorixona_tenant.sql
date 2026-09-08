-- =============================================================
--  DORIXONA — SUPER ADMIN KONSOLIDAN TENANTGA KO'CHIRISH
--
--  Dorixona super admin konsolining ichida turardi. Bu noto'g'ri
--  joy: u alohida biznes, boshqa tenantlar bilan bir qatorda
--  turishi kerak. Super admin esa faqat o'z ishini qilsin —
--  tenantlar, obuna, nazorat.
--
--  ---------------------------------------------------------------
--  NEGA `org_id` 27 JADVALGA QO'SHILMADI
--
--  Dorixona hozir BITTA. 16 804 dori, 8 332 taklif, 3 sklad —
--  hammasi bir biznesniki. 27 jadvalga org_id qo'shib, 25 mingdan
--  ortiq qatorni ko'chirish va har jadvalning RLS'ini qayta yozish
--  — katta ish va jonli ma'lumotga chuqur tegadi. Bu loyihada
--  tenantlararo sizish AYNAN shunday joylardan chiqqan.
--
--  Shuning uchun kalit bitta joyda: `dori_settings.org_id`. Kim
--  kirishini `dori_ruxsat()` hal qiladi.
--
--  IKKINCHI DORIXONA QO'SHILSA NIMA BO'LADI: u HECH NARSA
--  ko'rmaydi. Boshqa tenantning dorilarini emas — umuman hech
--  narsa. Ya'ni xato yo'li YOPIQ, sizuvchi emas. Ko'p dorixona
--  kerak bo'lganda org_id ishi alohida qilinadi.
--
--  ---------------------------------------------------------------
--  NEGA ALMASHTIRISH AVTOMATIK
--
--  71 ta funksiya va 26 ta siyosatda `is_super_admin()` bor. Ularni
--  qo'lda ko'chirib yozish — 71 ta xato imkoniyati. Shuning uchun
--  almashtirish `pg_get_functiondef` va `pg_policies` ustidan
--  dasturiy ravishda bajariladi.
--
--  ALMASHTIRISH FAQAT KENGAYTIRADI: `dori_ruxsat()` ichida
--  `is_super_admin()` bor, ya'ni avval o'tgan har bir chaqiruv
--  keyin ham o'tadi. Telegram botlari va cron (ular `auth.uid()`
--  null bilan keladi) shu sababdan sinmaydi.
--
--  DIQQAT: eski migratsiya qayta qo'llansa, u funksiyani
--  `is_super_admin()` bilan qaytarib yozadi. Shunda SHU
--  migratsiyani ham qayta qo'llang — u idempotent.
-- =============================================================


-- ---------- 1. Dorixona qaysi tenantniki ----------
alter table public.dori_settings
  add column if not exists org_id uuid references public.organizations(id);

comment on column public.dori_settings.org_id is
  'Dorixona moduli qaysi tenantga tegishli. dori_ruxsat() shu ustunga qaraydi.';


-- ---------- 2. Kim dorixonaga kira oladi ----------
--
-- Super admin — har doim (u platformani boshqaradi).
-- Tenant admini — faqat dorixona AYNAN uning tenantiniki bo'lsa.
--
-- `security definer`: profiles va dori_settings ni o'qish kerak,
-- chaqiruvchining RLS'i esa ularni yopib qo'yishi mumkin.
create or replace function public.dori_ruxsat()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select is_super_admin()
      or exists (
           select 1
           from public.profiles p
           join public.dori_settings s on s.org_id = p.org_id
           where p.id = auth.uid()
             and p.role = 'admin'
             and s.org_id is not null
         );
$fn$;

revoke all on function public.dori_ruxsat() from public, anon;
grant execute on function public.dori_ruxsat() to authenticated;


-- Chekka funksiyalar uchun: ular service_role kaliti bilan ishlaydi,
-- ya'ni `auth.uid()` null bo'ladi va yuqoridagi funksiya ular uchun
-- javob bera olmaydi. Foydalanuvchini token'dan aniqlab, uni shu
-- yerga uzatadilar.
--
-- `authenticated` ga BERILMAYDI: aks holda har bir kirgan odam
-- istalgan uid ni sinab, kim dorixona admini ekanini bilib olardi.
create or replace function public.dori_ruxsat_uid(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
           select 1 from public.profiles p
           where p.id = p_uid and p.role = 'super_admin'
         )
      or exists (
           select 1
           from public.profiles p
           join public.dori_settings s on s.org_id = p.org_id
           where p.id = p_uid and p.role = 'admin' and s.org_id is not null
         );
$fn$;

revoke all on function public.dori_ruxsat_uid(uuid) from public, anon, authenticated;
grant execute on function public.dori_ruxsat_uid(uuid) to service_role;


-- ---------- 3. Funksiyalarni almashtirish ----------
do $blok$
declare
  r     record;
  yangi text;
  n     int := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname like 'dori%'
      -- `dori_ruxsat` ning o'zi chetda qoladi: ichidagi
      -- `is_super_admin()` almashtirilsa cheksiz rekursiya bo'lardi
      and p.proname <> 'dori_ruxsat'
      and pg_get_functiondef(p.oid) like '%is_super_admin()%'
  loop
    yangi := replace(r.def, 'is_super_admin()', 'dori_ruxsat()');
    execute yangi;
    n := n + 1;
  end loop;
  raise notice 'funksiya almashtirildi: %', n;
end $blok$;


-- ---------- 4. RLS siyosatlarini almashtirish ----------
do $blok$
declare
  r    record;
  u    text;
  w    text;
  amal text;
  n    int := 0;
begin
  for r in
    select tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename like 'dori%'
      and (coalesce(qual, '') like '%is_super_admin%'
        or coalesce(with_check, '') like '%is_super_admin%')
  loop
    amal := lower(r.cmd);
    u := replace(coalesce(r.qual, ''), 'is_super_admin()', 'dori_ruxsat()');
    w := replace(coalesce(r.with_check, ''), 'is_super_admin()', 'dori_ruxsat()');

    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I for %s to %s %s %s',
      r.policyname, r.tablename, amal,
      array_to_string(r.roles, ', '),
      case when r.qual       is not null then 'using (' || u || ')' else '' end,
      case when r.with_check is not null then 'with check (' || w || ')' else '' end
    );
    n := n + 1;
  end loop;
  raise notice 'siyosat almashtirildi: %', n;
end $blok$;
