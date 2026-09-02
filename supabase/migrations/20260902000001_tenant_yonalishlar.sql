-- =============================================================
--  TENANT YO'NALISHLARI
--
--  Har tenant qaysi biznes tizimida ishlashi shu yerda belgilanadi.
--  Super admin tenant yaratganda tanlaydi, tenant admin esa faqat
--  o'ziga berilgan tizimni ko'radi.
--
--  NEGA ARRAY, BITTA MATN EMAS: bitta biznes bir vaqtda ham ulgurji
--  savdo, ham ishlab chiqarish bilan shug'ullanishi mumkin. Bitta
--  ustunga sig'dirilsa keyin ko'chirish kerak bo'lardi.
--
--  MAVJUD TENANTLAR: hozir hammasi ulgurji savdo panelida ishlayapti,
--  shuning uchun standart qiymat 'b2b' - hech kim panelidan ayrilmaydi.
-- =============================================================

alter table organizations
  add column if not exists yonalishlar text[] not null default array['b2b'];

-- Noto'g'ri kalit yozilib qolmasin: panel bunday yo'nalishni tanimaydi va
-- tenant paneli bo'sh ochilardi (sababi ko'rinmaydigan xato).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_yonalishlar_chk'
  ) then
    alter table organizations
      add constraint organizations_yonalishlar_chk
      check (yonalishlar <@ array['dorixona','sklad','ishlab_chiqarish','b2b','marketplace']::text[]);
  end if;
end $$;

comment on column organizations.yonalishlar is
  'Tenantga berilgan biznes tizimlari. Panel shu ro''yxatga qarab bo''lim ko''rsatadi.';


-- ---------- Tenant o'z yo'nalishlarini o'qiydi ----------
-- Panel kirish paytida chaqiradi. organizations jadvalini to'g'ridan-to'g'ri
-- o'qitmaymiz: unda boshqa tenantlarning qatorlari ham bor.
create or replace function public.org_yonalishlarim()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select o.yonalishlar
  from organizations o
  where o.id = current_org_id();
$$;

revoke all on function public.org_yonalishlarim() from public, anon;
grant execute on function public.org_yonalishlarim() to authenticated;


-- ---------- Super admin yo'nalishni o'zgartiradi ----------
create or replace function public.org_yonalish_qoy(p_org_id uuid, p_yonalishlar text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Faqat super admin: bu tenantga qaysi tizim ochilishini belgilaydi,
  -- ya'ni tenant admin o'ziga qo'shimcha tizim qo'sha olmasligi kerak.
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  if p_yonalishlar is null or cardinality(p_yonalishlar) = 0 then
    raise exception 'Kamida bitta yo''nalish tanlanishi kerak';
  end if;

  update organizations
     set yonalishlar = p_yonalishlar
   where id = p_org_id;

  if not found then
    raise exception 'Tenant topilmadi';
  end if;
end $$;

revoke all on function public.org_yonalish_qoy(uuid, text[]) from public, anon;
grant execute on function public.org_yonalish_qoy(uuid, text[]) to authenticated;


-- ---------- Eslatma: tenant ro'yxati ----------
-- super_admin_org_stats() ATAYLAB tegilmadi. Panel tenantlarni
-- `from('organizations').select('*')` bilan o'qiydi va statistikani shu
-- funksiyadan org_id bo'yicha ulaydi - ya'ni yangi ustun o'zi qo'shiladi.
-- Funksiya imzosini o'zgartirish esa panelni sindirardi.
