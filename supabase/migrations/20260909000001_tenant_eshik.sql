-- =============================================================
--  TENANT KARTOCHKASI VA FAVQULODDA KIRISH («ESHIKLAR»)
--
--  Muammo: obunachi qo'ng'iroq qiladi — «parolni unutdim», «bu yer
--  nega ishlamayapti». Super admin uning ekranini KO'RA OLMAYDI.
--  Telefonda tushuntirish uzoq va ko'pincha noto'g'ri tashxis bilan
--  tugaydi.
--
--  Yechim: tenantning har bir hisobi ESHIK bo'ladi. Super admin
--  eshikni tanlaydi, SABABINI yozadi va ichkariga kiradi.
--
--  Uch qoida — buzilsa bu funksiya xavfga aylanadi:
--
--   1. SABAB MAJBURIY va kamida 10 belgi. Bu ekrandagi tekshiruv
--      emas, BAZADAGI cheklov: panel chetlab o'tilsa ham izsiz
--      kirib bo'lmaydi.
--
--   2. Har kirish YOZILADI va o'chirilmaydi. Jadvalda select
--      siyosati bor, update/delete siyosati YO'Q — ya'ni panel
--      orqali (hatto super admin ham) izni tozalay olmaydi.
--
--   3. Iz odam nomlarini SAQLAB qoladi. Hisob keyin o'chirilsa
--      ham «kim kimning nomidan kirgan» degan savol javobsiz
--      qolmasin.
--
--  Parol bu yerda umuman ishlatilmaydi: Supabase uni bcrypt hash
--  qilib saqlaydi, ochib bo'lmaydi. Kirish bir martalik havola
--  bilan bo'ladi (chekka funksiya `super-admin-kirish`).
-- =============================================================


-- ---------- 1. Owner: tenantning egasi ----------
-- `contact_name`/`contact_phone` allaqachon bor — ular EGANING ismi va
-- raqami. Yetishmayotgani: uning HISOBI qaysi biri. Alohida rol
-- qo'shmaymiz (RLS'ning o'nlab joyiga tegardi) — shunchaki ko'rsatkich.
alter table public.organizations
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists owner_email   text;

comment on column public.organizations.owner_user_id is
  'Tenant egasining hisobi. Rol emas — kartochkada birinchi turishi uchun belgi.';


-- ---------- 2. Kirish izlari ----------
create table if not exists public.admin_kirish_sessiyalari (
  id             uuid primary key default gen_random_uuid(),

  -- Hisoblar o'chirilsa iz QOLADI: shuning uchun havolalar `set null`
  -- va yonida nom nusxasi turadi
  super_admin_id uuid references auth.users(id) on delete set null,
  super_admin_nom text,

  org_id         uuid references public.organizations(id) on delete set null,
  org_nom        text,

  -- Qaysi hisob ustiga bosilgan (eshik) va aslida kimning huquqi bilan
  -- kirilgan. Ular har doim ham bir xil emas: mijoz hisobi ustiga bosib
  -- «tenant admini sifatida» kirish mumkin.
  eshik_user_id  uuid references auth.users(id) on delete set null,
  eshik_nom      text,
  eshik_rol      text,
  kirgan_user_id uuid references auth.users(id) on delete set null,
  kirgan_nom     text,
  kirgan_rol     text,

  -- 'ozi'   — eshik egasining o'zi sifatida (u ko'rgan ekranni ko'rish)
  -- 'admin' — tenant admini sifatida (to'liq huquq)
  rejim          text not null check (rejim in ('ozi', 'admin')),

  -- Sabab BAZADA tekshiriladi: ekrandagi tekshiruvni chetlab o'tish
  -- mumkin, bunisini yo'q
  sabab          text not null check (char_length(btrim(sabab)) >= 10),

  at             timestamptz not null default now()
);

create index if not exists admin_kirish_at_idx  on public.admin_kirish_sessiyalari (at desc);
create index if not exists admin_kirish_org_idx on public.admin_kirish_sessiyalari (org_id, at desc);

alter table public.admin_kirish_sessiyalari enable row level security;

-- FAQAT o'qish siyosati. update/delete siyosati ataylab yozilmagan:
-- siyosatsiz amal RLS ostida hech kimga ochiq emas, ya'ni izni panel
-- orqali tozalab bo'lmaydi.
drop policy if exists "kirish izlari: super admin o'qiydi" on public.admin_kirish_sessiyalari;
create policy "kirish izlari: super admin o'qiydi"
  on public.admin_kirish_sessiyalari for select to authenticated
  using (is_super_admin());


-- ---------- 3. Tenant kartochkasi: ma'lumot, sanoq va eshiklar ----------
--
-- Bitta chaqiruvda hammasi: uchta alohida so'rov qilinsa, kartochka
-- bo'lak-bo'lak to'lib, «ma'lumot yo'q» bo'lib ko'rinardi.
--
-- Email `auth.users` da, ism va rol `profiles` da, lavozim esa
-- `xodimlar` da — uchovini shu funksiya birlashtiradi. `security
-- definer` shuning uchun kerak: `auth.users` ga oddiy foydalanuvchi
-- kira olmaydi.
create or replace function public.tenant_kartochka(p_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_org_id is null then
    raise exception 'TENANT_KORSATILMAGAN';
  end if;

  select jsonb_build_object(
    'org', (
      select jsonb_build_object(
               'id', o.id, 'name', o.name,
               'contact_name', o.contact_name, 'contact_phone', o.contact_phone,
               'owner_user_id', o.owner_user_id, 'owner_email', o.owner_email,
               'subscription_status', o.subscription_status, 'plan', o.plan,
               'yonalishlar', o.yonalishlar, 'created_at', o.created_at)
      from organizations o where o.id = p_org_id
    ),
    -- `orders` da org_id YO'Q: buyurtma tenantga mijoz orqali tegishli
    -- (customers.org_id). To'g'ridan-to'g'ri sanasak «ustun yo'q» xatosi
    -- chiqadi — bir marta shunday bo'ldi.
    'sanoq', jsonb_build_object(
      'mijozlar',  (select count(*) from customers where org_id = p_org_id),
      'mahsulot',  (select count(*) from products  where org_id = p_org_id),
      'buyurtma',  (select count(*) from orders o
                     join customers c on c.id = o.customer_id
                    where c.org_id = p_org_id),
      'menejer',   (select count(*) from managers  where org_id = p_org_id),
      'xodim',     (select count(*) from xodimlar  where org_id = p_org_id),
      'oxirgi_buyurtma', (select max(o.created_at) from orders o
                           join customers c on c.id = o.customer_id
                          where c.org_id = p_org_id)
    ),
    -- ESHIKLAR. Tartib: avval egasi, keyin admin, menejer, mijoz —
    -- super admin odatda yuqoridagisini tanlaydi.
    'eshiklar', coalesce((
      select jsonb_agg(t order by t.tartib, t.full_name nulls last)
      from (
        select p.id,
               p.role,
               coalesce(nullif(btrim(p.full_name), ''), u.email, '(nomsiz)') as full_name,
               u.email,
               u.last_sign_in_at,
               p.created_at,
               coalesce(o.owner_user_id = p.id, false) as egasi,
               (select x.lavozim from xodimlar x where x.profile_id = p.id limit 1) as lavozim,
               (select m.name from managers m where m.id = p.manager_id) as menejer_nom,
               -- Mijoz roli admin panelga KIRA OLMAYDI (App.tsx uni
               -- darhol chiqarib yuboradi) — u faqat «tenant admini
               -- sifatida» kirish uchun eshik bo'la oladi
               (p.role in ('admin', 'manager')) as panelga_kiradi,
               case when coalesce(o.owner_user_id = p.id, false) then 0
                    when p.role = 'admin'   then 1
                    when p.role = 'manager' then 2
                    else 3 end as tartib
        from profiles p
        join organizations o on o.id = p.org_id
        left join auth.users u on u.id = p.id
        where p.org_id = p_org_id
          -- Super admin o'zi eshik emas: u allaqachon ichkarida
          and p.role <> 'super_admin'
      ) t
    ), '[]'::jsonb),
    -- Shu tenantga oxirgi kirishlar — kartochkaning o'zida ko'rinsin
    'kirishlar', coalesce((
      select jsonb_agg(k order by k.at desc)
      from (
        select s.at, s.super_admin_nom, s.eshik_nom, s.kirgan_nom,
               s.kirgan_rol, s.rejim, s.sabab
        from admin_kirish_sessiyalari s
        where s.org_id = p_org_id
        order by s.at desc limit 10
      ) k
    ), '[]'::jsonb)
  ) into v;

  return v;
end $fn$;

revoke all on function public.tenant_kartochka(uuid) from public, anon;
grant execute on function public.tenant_kartochka(uuid) to authenticated;


-- ---------- 4. Kirishlar jurnali (NAZORAT markazi uchun) ----------
create or replace function public.admin_kirishlar(
  p_days  int default 90,
  p_limit int default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.at desc), '[]'::jsonb) into v
  from (
    select s.id, s.at, s.super_admin_nom, s.org_nom,
           s.eshik_nom, s.eshik_rol, s.kirgan_nom, s.kirgan_rol,
           s.rejim, s.sabab
    from admin_kirish_sessiyalari s
    where s.at >= now() - make_interval(days => greatest(coalesce(p_days, 90), 1))
    order by s.at desc
    limit least(coalesce(p_limit, 100), 500)
  ) t;

  return v;
end $fn$;

revoke all on function public.admin_kirishlar(int, int) from public, anon;
grant execute on function public.admin_kirishlar(int, int) to authenticated;
