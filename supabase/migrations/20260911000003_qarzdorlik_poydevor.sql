-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK yo'nalishi (poydevor)
--
-- Uchinchi biznes tizimi, b2b va dorixona yonida. Mantiq sodda:
--
--   Klient -> Chiqim (+qarz) -> Kirim (-qarz) -> Qoldiq -> SVERKA
--
-- QOLDIQ JADVALDA SAQLANMAYDI. U har safar yozuvlardan hisoblanadi:
--   qarz = sum(chiqim) - sum(kirim)
-- Saqlansa ikki raqam ajralib ketardi va qaysi biri to'g'riligi
-- bilinmasdi. Bu loyihada ledger_entries ayni shunday ishlaydi.
--
-- O'CHIRISH YO'Q. Noto'g'ri yozuv bekor qilinadi: sabab yoziladi,
-- yozuvning o'zi joyida qoladi va hisobdan chiqadi. Audit jurnali
-- kim, qachon, nima uchun bekor qilganini saqlaydi.
--
-- AGENTLARDA AUTH HISOBI YO'Q. Ular faqat Telegram orqali ishlaydi:
-- kontakt ulashadi, telefon bo'yicha topiladi. Shuning uchun bot
-- chaqiradigan funksiyalar service_role bilan ishlaydi va ularda
-- auth.uid() NULL bo'ladi — RLS emas, funksiya ichidagi tekshiruv
-- qo'riqlaydi.
-- =============================================================

-- ---------- 1. Yo'nalish ro'yxatiga qo'shamiz ----------
alter table public.organizations drop constraint if exists organizations_yonalishlar_chk;
alter table public.organizations
  add constraint organizations_yonalishlar_chk
  check (yonalishlar <@ array['dorixona','sklad','ishlab_chiqarish','b2b','marketplace','qarzdorlik']::text[]);

-- ---------- 2. Telefonni bir xil ko'rinishga keltirish ----------
-- Telegram "+998901234567" yuboradi, admin esa "+998 90 123 45 67"
-- yozadi. Solishtirish uchun ikkalasi ham faqat raqamga aylanadi.
-- Busiz agent kontakt ulashganda "raqam topilmadi" chiqardi.
create or replace function public.qarz_tel_norm(p_tel text)
returns text
language sql immutable
as $$
  select nullif(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), '');
$$;

-- ---------- 3. Jadvallar ----------

create table public.qarz_agents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  ism          text not null,
  rayon        text,
  telefon      text not null,
  telefon_norm text generated always as (public.qarz_tel_norm(telefon)) stored,
  -- Telegram ulanishi
  chat_id      bigint unique,
  username     text,
  first_name   text,
  linked_at    timestamptz,
  faol         boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Telefon GLOBAL unikal. Bot agentni FAQAT telefon bo'yicha topadi:
-- bir raqam ikki tenantda bo'lsa, kontakt kelganda qaysi korxona
-- ekanini aniqlab bo'lmasdi.
create unique index qarz_agents_tel_uniq on public.qarz_agents(telefon_norm);
create index qarz_agents_org_idx on public.qarz_agents(org_id);

create table public.qarz_clients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  -- Agent o'chirilsa klient YO'QOLMAYDI: qarzi bor bo'lishi mumkin.
  -- Boshqa agentga biriktiriladi.
  agent_id   uuid references public.qarz_agents(id) on delete set null,
  ism        text not null,
  familiya   text,
  apteka     text,
  telefon    text,
  izoh       text,
  faol       boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index qarz_clients_org_idx on public.qarz_clients(org_id);
create index qarz_clients_agent_idx on public.qarz_clients(agent_id);

create table public.qarz_transactions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  client_id   uuid not null references public.qarz_clients(id) on delete restrict,
  tur         text not null check (tur in ('chiqim', 'kirim')),
  -- Summa DOIM musbat. Yo'nalishni `tur` beradi: manfiy summa
  -- kiritilsa chiqim kirimga aylanib qolardi.
  summa       numeric(16,2) not null check (summa > 0),
  sana        timestamptz not null default now(),
  izoh        text,
  manba       text not null default 'panel' check (manba in ('panel', 'telegram')),
  agent_id    uuid references public.qarz_agents(id) on delete set null,
  created_by  uuid references auth.users(id),
  -- Bekor qilingan yozuv O'CHMAYDI, hisobdan chiqadi
  bekor_at    timestamptz,
  bekor_sabab text,
  bekor_agent uuid references public.qarz_agents(id) on delete set null,
  bekor_by    uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index qarz_tx_org_idx on public.qarz_transactions(org_id);
create index qarz_tx_client_idx on public.qarz_transactions(client_id, sana desc);
-- Hisobotlar deyarli doim bekor qilinmaganlarni so'raydi
create index qarz_tx_faol_idx on public.qarz_transactions(org_id, sana)
  where bekor_at is null;

create table public.qarz_audit (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  amal       text not null,
  jadval     text not null,
  yozuv_id   uuid,
  agent_id   uuid references public.qarz_agents(id) on delete set null,
  user_id    uuid references auth.users(id),
  eski       jsonb,
  yangi      jsonb,
  sabab      text,
  created_at timestamptz not null default now()
);
create index qarz_audit_org_idx on public.qarz_audit(org_id, created_at desc);

create trigger trg_qarz_agents_updated before update on public.qarz_agents
  for each row execute function public.tg_set_updated_at();
create trigger trg_qarz_clients_updated before update on public.qarz_clients
  for each row execute function public.tg_set_updated_at();

-- ---------- 4. RLS ----------
-- Panel uchun. Agentlar auth hisobisiz, ular bot orqali (service_role)
-- ishlaydi va RLS'ga tushmaydi — ularni funksiya ichidagi tekshiruv
-- qo'riqlaydi.
alter table public.qarz_agents       enable row level security;
alter table public.qarz_clients      enable row level security;
alter table public.qarz_transactions enable row level security;
alter table public.qarz_audit        enable row level security;

-- is_admin() YOLG'IZ YETARLI EMAS: u har tenant adminiga ochiq.
-- org_id bilan juftlanadi.
create policy "qarz_agents: admin all" on public.qarz_agents
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

create policy "qarz_clients: admin all" on public.qarz_clients
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

create policy "qarz_tx: admin all" on public.qarz_transactions
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

create policy "qarz_audit: admin read" on public.qarz_audit
  for select to authenticated
  using (is_admin() and org_id = current_org_id());

-- Direktor kuzatuvchi: ko'radi, yozmaydi
create policy "qarz_agents: direktor read" on public.qarz_agents
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());
create policy "qarz_clients: direktor read" on public.qarz_clients
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());
create policy "qarz_tx: direktor read" on public.qarz_transactions
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());
create policy "qarz_audit: direktor read" on public.qarz_audit
  for select to authenticated
  using (is_direktor() and org_id = current_org_id());

-- ---------- 5. Qoldiq ----------
create or replace function public.qarz_balans(p_client_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(case when tur = 'chiqim' then summa else -summa end), 0)
  from qarz_transactions
  where client_id = p_client_id
    and bekor_at is null;
$$;

-- Klientlar qoldiq bilan. View emas, funksiya: view'da security_invoker
-- unutilsa RLS chetlab o'tilardi (bu loyihada bir marta shunday bo'lgan).
create or replace function public.qarz_klientlar(
  p_agent_id uuid default null,
  p_q        text default null
)
returns table(
  id       uuid,
  ism      text,
  familiya text,
  apteka   text,
  telefon  text,
  agent_id uuid,
  agent    text,
  faol     boolean,
  qarz     numeric
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.ism, c.familiya, c.apteka, c.telefon, c.agent_id, a.ism, c.faol,
         qarz_balans(c.id)
  from qarz_clients c
  left join qarz_agents a on a.id = c.agent_id
  where c.org_id = current_org_id()
    and (is_admin() or is_direktor())
    and (p_agent_id is null or c.agent_id = p_agent_id)
    and (
      p_q is null or btrim(p_q) = ''
      or c.ism ilike '%' || btrim(p_q) || '%'
      or coalesce(c.familiya, '') ilike '%' || btrim(p_q) || '%'
      or coalesce(c.apteka, '') ilike '%' || btrim(p_q) || '%'
      or coalesce(c.telefon, '') ilike '%' || btrim(p_q) || '%'
    )
  order by c.ism, c.id;
$$;

-- ---------- 6. Yozuv qo'shish va bekor qilish ----------
--
-- p_agent_id berilsa — bot chaqirgan (agent nomidan), aks holda
-- panel (admin nomidan). Ikkala yo'l ham SHU funksiyadan o'tadi:
-- ikki joyda takrorlansa biri o'zgarganda ikkinchisi eskirardi.
create or replace function public.qarz_yozuv_qosh(
  p_client_id uuid,
  p_tur       text,
  p_summa     numeric,
  p_izoh      text default null,
  p_sana      timestamptz default null,
  p_agent_id  uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org   uuid;
  v_agent uuid;
  v_id    uuid;
  v_sana  timestamptz := coalesce(p_sana, now());
begin
  if p_tur not in ('chiqim', 'kirim') then
    raise exception 'NOTOGRI_TUR';
  end if;
  if p_summa is null or p_summa <= 0 then
    raise exception 'NOTOGRI_SUMMA';
  end if;
  if v_sana > now() + interval '1 minute' then
    raise exception 'SANA_KELAJAKDA';
  end if;

  select org_id, agent_id into v_org, v_agent
  from qarz_clients where id = p_client_id and faol;
  if v_org is null then
    raise exception 'KLIENT_TOPILMADI';
  end if;

  if p_agent_id is not null then
    -- Bot yo'li: agent FAQAT o'z klientiga yoza oladi
    if not exists (
      select 1 from qarz_agents
      where id = p_agent_id and org_id = v_org and faol
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
    if v_agent is distinct from p_agent_id then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    -- Panel yo'li: admin va faqat o'z tenantida
    if not is_admin() or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  insert into qarz_transactions (org_id, client_id, tur, summa, sana, izoh,
                                 manba, agent_id, created_by)
  values (v_org, p_client_id, p_tur, p_summa, v_sana, p_izoh,
          case when p_agent_id is null then 'panel' else 'telegram' end,
          coalesce(p_agent_id, v_agent), auth.uid())
  returning id into v_id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, agent_id, user_id, yangi)
  values (v_org, 'qoshildi', 'qarz_transactions', v_id, p_agent_id, auth.uid(),
          jsonb_build_object('tur', p_tur, 'summa', p_summa, 'client_id', p_client_id));

  return v_id;
end $$;

create or replace function public.qarz_yozuv_bekor(
  p_id       uuid,
  p_sabab    text,
  p_agent_id uuid default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tx     record;
  v_cagent uuid;
begin
  if p_sabab is null or length(btrim(p_sabab)) < 3 then
    raise exception 'SABAB_MAJBURIY';
  end if;

  select * into v_tx from qarz_transactions where id = p_id;
  if not found then
    raise exception 'YOZUV_TOPILMADI';
  end if;
  -- Ikki marta bekor qilinsa hisob ikki barobar o'zgarardi
  if v_tx.bekor_at is not null then
    raise exception 'ALLAQACHON_BEKOR';
  end if;

  select agent_id into v_cagent from qarz_clients where id = v_tx.client_id;

  if p_agent_id is not null then
    if not exists (
      select 1 from qarz_agents where id = p_agent_id and org_id = v_tx.org_id and faol
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
    -- Agent o'z klientining yozuvini bekor qiladi (vaqt cheklovi yo'q —
    -- foydalanuvchi shunday tanladi). Har bekor audit jurnalida qoladi.
    if v_cagent is distinct from p_agent_id then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    if not is_admin() or v_tx.org_id <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  update qarz_transactions
     set bekor_at = now(), bekor_sabab = btrim(p_sabab),
         bekor_agent = p_agent_id, bekor_by = auth.uid()
   where id = p_id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, agent_id, user_id, eski, sabab)
  values (v_tx.org_id, 'bekor', 'qarz_transactions', p_id, p_agent_id, auth.uid(),
          jsonb_build_object('tur', v_tx.tur, 'summa', v_tx.summa,
                             'client_id', v_tx.client_id, 'sana', v_tx.sana),
          btrim(p_sabab));
end $$;

-- ---------- 7. SVERKA ----------
create or replace function public.qarz_sverka(
  p_client_id uuid,
  p_dan       timestamptz default null,
  p_gacha     timestamptz default null,
  p_agent_id  uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_c      record;
  v_dan    timestamptz := coalesce(p_dan, '-infinity'::timestamptz);
  v_gacha  timestamptz := coalesce(p_gacha, 'infinity'::timestamptz);
  v_res    jsonb;
begin
  select c.*, a.ism as agent_ism into v_c
  from qarz_clients c
  left join qarz_agents a on a.id = c.agent_id
  where c.id = p_client_id;
  if not found then
    raise exception 'KLIENT_TOPILMADI';
  end if;

  if p_agent_id is not null then
    if v_c.agent_id is distinct from p_agent_id then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    if not (is_admin() or is_direktor()) or v_c.org_id <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  select jsonb_build_object(
    'klient', jsonb_build_object(
      'id', v_c.id, 'ism', v_c.ism, 'familiya', v_c.familiya,
      'apteka', v_c.apteka, 'telefon', v_c.telefon, 'agent', v_c.agent_ism
    ),
    -- Davrdan OLDINGI qoldiq: busiz "qoldiq" faqat shu davrniki bo'lib,
    -- klientning haqiqiy qarzidan farq qilardi
    'boshlangich', coalesce((
      select sum(case when tur = 'chiqim' then summa else -summa end)
      from qarz_transactions
      where client_id = p_client_id and bekor_at is null and sana < v_dan
    ), 0),
    'chiqim', coalesce((
      select sum(summa) from qarz_transactions
      where client_id = p_client_id and bekor_at is null
        and tur = 'chiqim' and sana between v_dan and v_gacha
    ), 0),
    'kirim', coalesce((
      select sum(summa) from qarz_transactions
      where client_id = p_client_id and bekor_at is null
        and tur = 'kirim' and sana between v_dan and v_gacha
    ), 0),
    'qoldiq', qarz_balans(p_client_id),
    'amallar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'tur', t.tur, 'summa', t.summa, 'sana', t.sana,
               'izoh', t.izoh, 'manba', t.manba,
               'bekor', t.bekor_at is not null, 'bekor_sabab', t.bekor_sabab
             ) order by t.sana, t.created_at)
      from qarz_transactions t
      where t.client_id = p_client_id and t.sana between v_dan and v_gacha
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

-- ---------- 8. Huquqlar ----------
-- Postgres YANGI funksiyaga EXECUTE ni PUBLIC ga STANDART beradi.
-- Shu sessiyada 16 ta funksiya shu sababdan anon uchun ochiq qolgan
-- va ikkitasi yozardi. Shuning uchun har biridan darhol REVOKE.
revoke all on function public.qarz_tel_norm(text)                                   from public, anon;
revoke all on function public.qarz_balans(uuid)                                     from public, anon;
revoke all on function public.qarz_klientlar(uuid, text)                            from public, anon;
revoke all on function public.qarz_yozuv_qosh(uuid, text, numeric, text, timestamptz, uuid) from public, anon;
revoke all on function public.qarz_yozuv_bekor(uuid, text, uuid)                    from public, anon;
revoke all on function public.qarz_sverka(uuid, timestamptz, timestamptz, uuid)     from public, anon;

-- Panel chaqiradi (admin/direktor). Bot service_role bilan ishlaydi —
-- unga grant kerak emas.
grant execute on function public.qarz_balans(uuid)                                  to authenticated;
grant execute on function public.qarz_klientlar(uuid, text)                         to authenticated;
grant execute on function public.qarz_yozuv_qosh(uuid, text, numeric, text, timestamptz, uuid) to authenticated;
grant execute on function public.qarz_yozuv_bekor(uuid, text, uuid)                 to authenticated;
grant execute on function public.qarz_sverka(uuid, timestamptz, timestamptz, uuid)  to authenticated;
