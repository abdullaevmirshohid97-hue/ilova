-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: agentlar va Telegram bot qatlami
--
-- Agentda auth hisobi YO'Q. U faqat Telegram orqali ishlaydi:
-- kontakt ulashadi, telefoni bo'yicha topiladi. Shuning uchun bot
-- chaqiradigan funksiyalar service_role bilan ishlaydi (auth.uid()
-- NULL) va agentni CHAT_ID bo'yicha o'zi topadi.
--
-- HAR BIR bot funksiyasi chat_id -> agent -> org zanjirini qaytadan
-- quradi va "faqat o'z klienti" shartini o'zi tekshiradi. Bitta
-- joyda ishonib qo'yilsa, boshqa agentning klientiga yozib yuborish
-- mumkin bo'lardi.
--
-- TELEFON OXIRGI 9 RAQAM bo'yicha solishtiriladi. Telegram
-- "+998901234567" yuboradi, admin "998 90 123 45 67" yoki
-- "90 123 45 67" yozishi mumkin — mamlakat kodi bor-yo'qligi
-- taqqoslashni buzmasligi kerak (staff_telegram_link_phone ayni
-- shunday ishlaydi).
-- =============================================================

-- ---------- 1. Bot suhbat holati ----------
create table public.qarz_bot_state (
  chat_id    bigint primary key,
  state      text not null default 'idle',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Siyosatsiz RLS = hamma uchun yopiq. Faqat service_role (bot)
-- kiradi, foydalanuvchilarga bu jadval umuman kerak emas.
alter table public.qarz_bot_state enable row level security;

create or replace function public.qarz_tel9(p_tel text)
returns text
language sql immutable
as $$
  select right(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), 9);
$$;

-- ---------- 2. Panel: agentlarni boshqarish ----------
create or replace function public.qarz_agentlar(p_q text default null)
returns table(
  id       uuid,
  ism      text,
  rayon    text,
  telefon  text,
  faol     boolean,
  ulangan  boolean,
  klientlar int,
  qarz     numeric
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.ism, a.rayon, a.telefon, a.faol,
         a.chat_id is not null,
         (select count(*)::int from qarz_clients c where c.agent_id = a.id),
         coalesce((
           select sum(case when t.tur = 'chiqim' then t.summa else -t.summa end)
           from qarz_transactions t
           join qarz_clients c on c.id = t.client_id
           where c.agent_id = a.id and t.bekor_at is null
         ), 0)
  from qarz_agents a
  where a.org_id = current_org_id()
    and (is_admin() or is_direktor())
    and (
      p_q is null or btrim(p_q) = ''
      or a.ism ilike '%' || btrim(p_q) || '%'
      or coalesce(a.rayon, '') ilike '%' || btrim(p_q) || '%'
      or a.telefon ilike '%' || btrim(p_q) || '%'
    )
  order by a.ism, a.id;
$$;

create or replace function public.qarz_agent_saqla(
  p_id      uuid default null,
  p_ism     text default null,
  p_rayon   text default null,
  p_telefon text default null,
  p_faol    boolean default true
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_id  uuid;
  v_t9  text := qarz_tel9(p_telefon);
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_ism is null or btrim(p_ism) = '' then
    raise exception 'ISM_MAJBURIY';
  end if;
  if length(v_t9) < 9 then
    raise exception 'TELEFON_NOTOGRI';
  end if;

  -- Telefon GLOBAL unikal: bot agentni faqat telefon bo'yicha topadi.
  -- Bir raqam ikki tenantda bo'lsa, kontakt kelganda qaysi korxona
  -- ekanini aniqlab bo'lmasdi.
  if exists (
    select 1 from qarz_agents
    where qarz_tel9(telefon) = v_t9 and (p_id is null or id <> p_id)
  ) then
    raise exception 'TELEFON_BAND';
  end if;

  if p_id is null then
    insert into qarz_agents (org_id, ism, rayon, telefon, faol, created_by)
    values (v_org, btrim(p_ism), nullif(btrim(coalesce(p_rayon, '')), ''),
            btrim(p_telefon), coalesce(p_faol, true), auth.uid())
    returning id into v_id;

    insert into qarz_audit (org_id, amal, jadval, yozuv_id, user_id, yangi)
    values (v_org, 'qoshildi', 'qarz_agents', v_id, auth.uid(),
            jsonb_build_object('ism', btrim(p_ism), 'telefon', btrim(p_telefon)));
  else
    -- Boshqa tenantning agentini tahrirlab bo'lmasin
    if not exists (select 1 from qarz_agents where id = p_id and org_id = v_org) then
      raise exception 'RUXSAT_YOQ';
    end if;
    update qarz_agents
       set ism     = btrim(p_ism),
           rayon   = nullif(btrim(coalesce(p_rayon, '')), ''),
           telefon = btrim(p_telefon),
           faol    = coalesce(p_faol, faol)
     where id = p_id
    returning id into v_id;

    insert into qarz_audit (org_id, amal, jadval, yozuv_id, user_id, yangi)
    values (v_org, 'tahrir', 'qarz_agents', v_id, auth.uid(),
            jsonb_build_object('ism', btrim(p_ism), 'telefon', btrim(p_telefon), 'faol', p_faol));
  end if;

  return v_id;
end $$;

-- Telegram ulanishini uzish (telefon almashsa yoki agent ketsa)
create or replace function public.qarz_agent_uzish(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if not exists (select 1 from qarz_agents where id = p_id and org_id = current_org_id()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  update qarz_agents
     set chat_id = null, username = null, first_name = null, linked_at = null
   where id = p_id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, user_id)
  values (current_org_id(), 'telegram_uzildi', 'qarz_agents', p_id, auth.uid());
end $$;

-- ---------- 3. Bot: ulanish va tanish ----------
create or replace function public.qarz_agent_ulash(
  p_phone      text,
  p_chat_id    bigint,
  p_username   text default null,
  p_first_name text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_t9  text := qarz_tel9(p_phone);
  v_a   record;
begin
  if length(v_t9) < 9 then
    return jsonb_build_object('ok', false, 'error', 'TELEFON_NOTOGRI');
  end if;

  select a.*, o.name as org_nom into v_a
  from qarz_agents a
  join organizations o on o.id = a.org_id
  where qarz_tel9(a.telefon) = v_t9
  limit 1;

  if v_a.id is null then
    return jsonb_build_object('ok', false, 'error', 'AGENT_TOPILMADI');
  end if;
  if not v_a.faol then
    return jsonb_build_object('ok', false, 'error', 'AGENT_BLOKLANGAN');
  end if;

  -- Bitta chat bitta agentga. Odam boshqa raqam bilan qayta ulansa
  -- eski bog'lanish qolib ketmasin.
  update qarz_agents set chat_id = null where chat_id = p_chat_id and id <> v_a.id;

  update qarz_agents
     set chat_id = p_chat_id, username = p_username,
         first_name = p_first_name, linked_at = now()
   where id = v_a.id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, agent_id)
  values (v_a.org_id, 'telegram_ulandi', 'qarz_agents', v_a.id, v_a.id);

  return jsonb_build_object(
    'ok', true, 'agent_id', v_a.id, 'ism', v_a.ism,
    'rayon', coalesce(v_a.rayon, ''), 'org', v_a.org_nom
  );
end $$;

-- Har xabarda chaqiriladi: shu chat kimga tegishli
create or replace function public.qarz_agent_men(p_chat_id bigint)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when a.id is null then null else jsonb_build_object(
    'agent_id', a.id, 'ism', a.ism, 'rayon', coalesce(a.rayon, ''),
    'org_id', a.org_id, 'org', o.name, 'faol', a.faol
  ) end
  from qarz_agents a
  join organizations o on o.id = a.org_id
  where a.chat_id = p_chat_id
  limit 1;
$$;

-- ---------- 4. Bot: klientlar ----------
create or replace function public.qarz_bot_klientlar(
  p_chat_id bigint,
  p_q       text default null,
  p_limit   int default 30
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_agent uuid;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  return coalesce((
    select jsonb_agg(x order by x->>'ism')
    from (
      select jsonb_build_object(
               'id', c.id, 'ism', c.ism, 'familiya', coalesce(c.familiya, ''),
               'apteka', coalesce(c.apteka, ''), 'telefon', coalesce(c.telefon, ''),
               'qarz', qarz_balans(c.id)
             ) as x
      from qarz_clients c
      where c.agent_id = v_agent and c.faol
        and (
          p_q is null or btrim(p_q) = ''
          or c.ism ilike '%' || btrim(p_q) || '%'
          or coalesce(c.familiya, '') ilike '%' || btrim(p_q) || '%'
          or coalesce(c.apteka, '') ilike '%' || btrim(p_q) || '%'
          or coalesce(c.telefon, '') ilike '%' || btrim(p_q) || '%'
        )
      order by c.ism
      limit greatest(1, least(coalesce(p_limit, 30), 100))
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.qarz_bot_klient_qosh(
  p_chat_id  bigint,
  p_ism      text,
  p_familiya text default null,
  p_apteka   text default null,
  p_telefon  text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_agent uuid;
  v_org   uuid;
  v_id    uuid;
begin
  select id, org_id into v_agent, v_org
  from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_ism is null or btrim(p_ism) = '' then
    raise exception 'ISM_MAJBURIY';
  end if;

  insert into qarz_clients (org_id, agent_id, ism, familiya, apteka, telefon)
  values (v_org, v_agent, btrim(p_ism),
          nullif(btrim(coalesce(p_familiya, '')), ''),
          nullif(btrim(coalesce(p_apteka, '')), ''),
          nullif(btrim(coalesce(p_telefon, '')), ''))
  returning id into v_id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, agent_id, yangi)
  values (v_org, 'qoshildi', 'qarz_clients', v_id, v_agent,
          jsonb_build_object('ism', btrim(p_ism), 'apteka', p_apteka));

  return jsonb_build_object('ok', true, 'id', v_id, 'ism', btrim(p_ism));
end $$;

-- ---------- 5. Bot: chiqim / kirim ----------
create or replace function public.qarz_bot_yozuv(
  p_chat_id   bigint,
  p_client_id uuid,
  p_tur       text,
  p_summa     numeric,
  p_izoh      text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_agent uuid;
  v_oldin numeric;
  v_id    uuid;
  v_c     record;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select ism, familiya, apteka into v_c from qarz_clients where id = p_client_id;
  v_oldin := qarz_balans(p_client_id);

  -- Chegara tekshiruvi qarz_yozuv_qosh ICHIDA: agent faqat o'z
  -- klientiga yoza oladi. Bu yerda takrorlanmaydi — ikki joyda
  -- saqlansa biri o'zgarganda ikkinchisi eskirardi.
  v_id := qarz_yozuv_qosh(p_client_id, p_tur, p_summa, p_izoh, null, v_agent);

  return jsonb_build_object(
    'ok', true, 'id', v_id,
    'klient', coalesce(v_c.apteka, v_c.ism),
    'oldingi', v_oldin,
    'summa', p_summa,
    'qoldiq', qarz_balans(p_client_id)
  );
end $$;

create or replace function public.qarz_bot_bekor(
  p_chat_id bigint,
  p_tx_id   uuid,
  p_sabab   text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_agent uuid;
  v_cid   uuid;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select client_id into v_cid from qarz_transactions where id = p_tx_id;
  perform qarz_yozuv_bekor(p_tx_id, p_sabab, v_agent);

  return jsonb_build_object('ok', true, 'qoldiq', qarz_balans(v_cid));
end $$;

-- Oxirgi yozuvlar — botda "bekor qilish" ro'yxati uchun
create or replace function public.qarz_bot_oxirgi(
  p_chat_id bigint,
  p_limit   int default 10
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_agent uuid;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  return coalesce((
    select jsonb_agg(x order by (x->>'sana') desc)
    from (
      select jsonb_build_object(
               'id', t.id, 'tur', t.tur, 'summa', t.summa, 'sana', t.sana,
               'klient', coalesce(c.apteka, c.ism),
               'bekor', t.bekor_at is not null
             ) as x
      from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent
      order by t.sana desc, t.created_at desc
      limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) s
  ), '[]'::jsonb);
end $$;

-- ---------- 6. Bot: sverka va hisobot ----------
create or replace function public.qarz_bot_sverka(
  p_chat_id   bigint,
  p_client_id uuid,
  p_dan       timestamptz default null,
  p_gacha     timestamptz default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_agent uuid;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  return qarz_sverka(p_client_id, p_dan, p_gacha, v_agent);
end $$;

create or replace function public.qarz_bot_hisobot(
  p_chat_id bigint,
  p_dan     timestamptz default null,
  p_gacha   timestamptz default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_agent uuid;
  v_dan   timestamptz := coalesce(p_dan, '-infinity'::timestamptz);
  v_gacha timestamptz := coalesce(p_gacha, 'infinity'::timestamptz);
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  return jsonb_build_object(
    'chiqim', coalesce((
      select sum(t.summa) from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null
        and t.tur = 'chiqim' and t.sana between v_dan and v_gacha
    ), 0),
    'kirim', coalesce((
      select sum(t.summa) from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null
        and t.tur = 'kirim' and t.sana between v_dan and v_gacha
    ), 0),
    -- Jami qarz DAVRGA BOG'LIQ EMAS: u bugungi holat. Davr bilan
    -- cheklansa "qarz" o'sha oyning farqi bo'lib qolardi va agent
    -- klientning haqiqiy qarzini bilmasdi.
    'qarz', coalesce((
      select sum(case when t.tur = 'chiqim' then t.summa else -t.summa end)
      from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null
    ), 0),
    'klientlar', (select count(*)::int from qarz_clients c where c.agent_id = v_agent and c.faol)
  );
end $$;

-- ---------- 7. Huquqlar ----------
-- Bot funksiyalari FAQAT service_role bilan chaqiriladi (chekka
-- funksiya ichidan). Ularga authenticated ham, anon ham kerak emas:
-- chat_id ni bilgan har kim boshqa agent nomidan yozib yuborardi.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as imzo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'qarz_%'
  loop
    execute format('revoke all on function %s from public, anon', r.imzo);
  end loop;
end $$;

-- Panel chaqiradigan funksiyalar (oldingi migratsiyadagilar ham
-- qayta beriladi: yuqoridagi tsikl hammasidan olib tashladi)
grant execute on function public.qarz_balans(uuid)                                  to authenticated;
grant execute on function public.qarz_klientlar(uuid, text)                         to authenticated;
grant execute on function public.qarz_yozuv_qosh(uuid, text, numeric, text, timestamptz, uuid) to authenticated;
grant execute on function public.qarz_yozuv_bekor(uuid, text, uuid)                 to authenticated;
grant execute on function public.qarz_sverka(uuid, timestamptz, timestamptz, uuid)  to authenticated;
grant execute on function public.qarz_agentlar(text)                                to authenticated;
grant execute on function public.qarz_agent_saqla(uuid, text, text, text, boolean)  to authenticated;
grant execute on function public.qarz_agent_uzish(uuid)                             to authenticated;
