-- =============================================================
-- CREDIT DEBIT — AI CHEGARASI VA SARF HISOBI
--
-- IKKI XIL AI BOR VA ULARNING PULI IKKI XIL JOYDAN CHIQADI.
-- Buni aralashtirmaslik kerak, aks holda narx noto'g'ri hisoblanadi:
--
--  1. MCP (tashqi agent) — model MIJOZNING O'ZIDA ishlaydi
--     (uning Claude/ChatGPT obunasi). Biz faqat ma'lumot beramiz,
--     ya'ni token uchun TO'LAMAYMIZ. Bizning xarajat — chekka
--     funksiya chaqiruvi va baza o'qishi, ya'ni deyarli nol.
--     Bu yerdagi chegara — suiiste'molga qarshi, xarajatga qarshi emas.
--
--  2. ILOVA ICHIDAGI ROBOT (keyingi bosqich) — modelni BIZ
--     chaqiramiz va har token uchun to'laymiz. Uning puli mijozdan
--     qaytishi kerak, shuning uchun sarf TENANT bo'yicha yoziladi
--     va tarifga bog'lanadi.
--
-- Shuning uchun: kunlik chegara — har tenantda alohida sozlanadi
-- (super admin tarifga qarab qo'yadi), sarf esa alohida jadvalda
-- token va dollar bilan saqlanadi.
-- =============================================================

-- ---------- 1. Tenantga sozlanadigan chegara ----------
alter table public.organizations
  add column if not exists kassa_ai_kunlik int not null default 100;

comment on column public.organizations.kassa_ai_kunlik is
  'MCP (tashqi AI agent) uchun kunlik so''rov chegarasi. Model mijozning o''zida ishlaydi — bu chegara xarajat uchun emas, suiiste''molga qarshi.';

alter table public.organizations
  add column if not exists kassa_robot_oylik int not null default 0;

comment on column public.organizations.kassa_robot_oylik is
  'Ilova ichidagi robot uchun OYLIK so''rov chegarasi. 0 — robot yoqilmagan. Bu so''rovlar puli bizdan ketadi, shuning uchun tarifga bog''lanadi.';


-- ---------- 2. Sarf hisobi (ilova roboti uchun) ----------
-- Har chaqiruvda nechta token ketdi va qancha turdi — shu yerda.
-- Narx SO'ROV PAYTIDA hisoblanadi va saqlanadi: model narxi
-- keyin o'zgarsa, eski oyning hisoboti o'zgarmasin.
create table if not exists public.kassa_ai_sarf (
  id            bigserial primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  model         text not null,
  -- Keshdan o'qilgan tokenlar alohida: ular ~10 barobar arzon
  kirish_token  int not null default 0,
  kesh_token    int not null default 0,
  chiqish_token int not null default 0,
  -- AQSH dollarida, oltita kasr bilan: bitta so'rov sentning
  -- yuzdan biriga tushadi, yaxlitlansa hisob yo'qoladi
  narx_usd      numeric(12,6) not null default 0,
  manba         text not null default 'robot' check (manba in ('robot', 'mcp', 'ovoz')),
  created_at    timestamptz not null default now()
);

create index if not exists kassa_ai_sarf_org_idx
  on public.kassa_ai_sarf (org_id, created_at desc);

alter table public.kassa_ai_sarf enable row level security;

-- Tenant o'z sarfini KO'RADI (qancha ishlatganini bilsin), lekin
-- yoza olmaydi: yozuvni faqat server qo'yadi.
drop policy if exists "kassa_ai_sarf: org oqiydi" on public.kassa_ai_sarf;
create policy "kassa_ai_sarf: org oqiydi" on public.kassa_ai_sarf
  for select to authenticated
  using (org_id = current_org_id());


-- ---------- 3. Chegarani tekshirish ----------
-- Eski `kassa_mcp_hisob` faqat sonni (int) qaytarardi; endi chegara
-- ham kerak, chunki u tenantga qarab o'zgaradi. Qaytish turi
-- o'zgargani uchun funksiya avval tushiriladi — `create or replace`
-- bunday holatda 42P13 bilan yiqiladi.
drop function if exists public.kassa_mcp_hisob(uuid);

create or replace function public.kassa_mcp_hisob(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'bugun',   (select count(*) from public.kassa_mcp_jurnal
                 where org_id = p_org and created_at > now() - interval '1 day'),
    'chegara', (select kassa_ai_kunlik from public.organizations where id = p_org)
  );
$$;

revoke all on function public.kassa_mcp_hisob(uuid) from public, anon, authenticated;
grant execute on function public.kassa_mcp_hisob(uuid) to service_role;


-- ---------- 4. Tenant o'z sarfini ko'radi ----------
create or replace function public.kassa_ai_holat()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'kunlik_chegara', o.kassa_ai_kunlik,
    'bugun_soralgan', (select count(*) from public.kassa_mcp_jurnal j
                        where j.org_id = o.id and j.created_at > now() - interval '1 day'),
    'robot_oylik_chegara', o.kassa_robot_oylik,
    'oy_soralgan',   (select count(*) from public.kassa_ai_sarf s
                       where s.org_id = o.id and s.created_at >= date_trunc('month', now())),
    'oy_narx_usd',   coalesce((select sum(s.narx_usd) from public.kassa_ai_sarf s
                       where s.org_id = o.id and s.created_at >= date_trunc('month', now())), 0)
  )
  from public.organizations o
  where o.id = current_org_id();
$$;

revoke all on function public.kassa_ai_holat() from public, anon;
grant execute on function public.kassa_ai_holat() to authenticated;

comment on function public.kassa_ai_holat() is
  'Tenant o''z AI sarfini ko''radi: kunlik so''rov, oylik so''rov va oylik narx.';


-- ---------- 5. Super admin chegarani qo'yadi ----------
create or replace function public.kassa_ai_chegara_qoy(
  p_org    uuid,
  p_kunlik int,
  p_robot  int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  update public.organizations
     set kassa_ai_kunlik   = greatest(0, least(coalesce(p_kunlik, kassa_ai_kunlik), 10000)),
         kassa_robot_oylik = coalesce(greatest(0, least(p_robot, 100000)), kassa_robot_oylik)
   where id = p_org;
end $$;

revoke all on function public.kassa_ai_chegara_qoy(uuid, int, int) from public, anon;
grant execute on function public.kassa_ai_chegara_qoy(uuid, int, int) to authenticated;
