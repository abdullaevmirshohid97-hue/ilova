-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: pul kirimida to'lov usuli
--
-- Kirim uch xil bo'ladi: naqd, plastik (karta), Click. Bu shunchaki
-- yorliq emas — oy oxirida "kassada qancha naqd bo'lishi kerak"
-- degan savolga javob shu ustundan chiqadi.
--
-- CHIQIMDA usul YO'Q: tovar chiqimi to'lov emas, qarz yozuvi.
-- Shuning uchun cheklov turga bog'langan — chiqimga usul yozib
-- qo'yilsa hisobot yolg'on gapirardi.
--
-- Funksiya DROP + CREATE qilinadi, "create or replace" emas: yangi
-- parametr qo'shilsa u ALMASHTIRMAYDI, yonига ikkinchi funksiya
-- yasaydi va chaqiruv ikki xil imzoga tushib chalkashardi.
-- Drop grantlarni ham o'chiradi — pastda qaytadan beriladi.
-- =============================================================

alter table public.qarz_transactions
  add column usul text check (usul in ('naqd', 'plastik', 'klik'));

-- Usul FAQAT kirimda bo'ladi
alter table public.qarz_transactions
  add constraint qarz_tx_usul_chk
  check (tur = 'kirim' or usul is null);

comment on column public.qarz_transactions.usul is
  'Pul kirimi usuli: naqd / plastik / klik. Chiqimda doim NULL.';

create index qarz_tx_usul_idx on public.qarz_transactions(org_id, usul)
  where bekor_at is null and usul is not null;

-- ---------- Yozuv qo'shish ----------
drop function if exists public.qarz_yozuv_qosh(uuid, text, numeric, text, timestamptz, uuid);

create or replace function public.qarz_yozuv_qosh(
  p_client_id uuid,
  p_tur       text,
  p_summa     numeric,
  p_izoh      text default null,
  p_sana      timestamptz default null,
  p_agent_id  uuid default null,
  p_usul      text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org   uuid;
  v_agent uuid;
  v_id    uuid;
  v_sana  timestamptz := coalesce(p_sana, now());
  v_usul  text := nullif(btrim(coalesce(p_usul, '')), '');
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

  if p_tur = 'kirim' then
    if v_usul is null then
      raise exception 'USUL_MAJBURIY';
    end if;
    if v_usul not in ('naqd', 'plastik', 'klik') then
      raise exception 'NOTOGRI_USUL';
    end if;
  else
    -- Chiqimga usul yozilsa hisobot yolg'on gapirardi
    v_usul := null;
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
                                 manba, agent_id, created_by, usul)
  values (v_org, p_client_id, p_tur, p_summa, v_sana, p_izoh,
          case when p_agent_id is null then 'panel' else 'telegram' end,
          coalesce(p_agent_id, v_agent), auth.uid(), v_usul)
  returning id into v_id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, agent_id, user_id, yangi)
  values (v_org, 'qoshildi', 'qarz_transactions', v_id, p_agent_id, auth.uid(),
          jsonb_build_object('tur', p_tur, 'summa', p_summa,
                             'client_id', p_client_id, 'usul', v_usul));

  return v_id;
end $$;

-- ---------- Bot: kirimda usul ----------
drop function if exists public.qarz_bot_yozuv(bigint, uuid, text, numeric, text);

create or replace function public.qarz_bot_yozuv(
  p_chat_id   bigint,
  p_client_id uuid,
  p_tur       text,
  p_summa     numeric,
  p_izoh      text default null,
  p_usul      text default null
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

  -- Chegara tekshiruvi qarz_yozuv_qosh ICHIDA
  v_id := qarz_yozuv_qosh(p_client_id, p_tur, p_summa, p_izoh, null, v_agent, p_usul);

  return jsonb_build_object(
    'ok', true, 'id', v_id,
    'klient', coalesce(v_c.apteka, v_c.ism),
    'oldingi', v_oldin,
    'summa', p_summa,
    'usul', p_usul,
    'qoldiq', qarz_balans(p_client_id)
  );
end $$;

-- ---------- Sverka: usul ham ko'rinsin ----------
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
    'usullar', (
      select jsonb_object_agg(u, s) from (
        select coalesce(usul, 'naqd') as u, sum(summa) as s
        from qarz_transactions
        where client_id = p_client_id and bekor_at is null
          and tur = 'kirim' and sana between v_dan and v_gacha
        group by 1
      ) x
    ),
    'qoldiq', qarz_balans(p_client_id),
    'amallar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'tur', t.tur, 'summa', t.summa, 'sana', t.sana,
               'izoh', t.izoh, 'manba', t.manba, 'usul', t.usul,
               'bekor', t.bekor_at is not null, 'bekor_sabab', t.bekor_sabab
             ) order by t.sana, t.created_at)
      from qarz_transactions t
      where t.client_id = p_client_id and t.sana between v_dan and v_gacha
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

-- ---------- Bot hisoboti: usul bo'yicha ----------
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
    'naqd', coalesce((
      select sum(t.summa) from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null and t.usul = 'naqd'
        and t.sana between v_dan and v_gacha
    ), 0),
    'plastik', coalesce((
      select sum(t.summa) from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null and t.usul = 'plastik'
        and t.sana between v_dan and v_gacha
    ), 0),
    'klik', coalesce((
      select sum(t.summa) from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null and t.usul = 'klik'
        and t.sana between v_dan and v_gacha
    ), 0),
    -- Jami qarz DAVRGA BOG'LIQ EMAS: u bugungi holat
    'qarz', coalesce((
      select sum(case when t.tur = 'chiqim' then t.summa else -t.summa end)
      from qarz_transactions t
      join qarz_clients c on c.id = t.client_id
      where c.agent_id = v_agent and t.bekor_at is null
    ), 0),
    'klientlar', (select count(*)::int from qarz_clients c where c.agent_id = v_agent and c.faol)
  );
end $$;

-- ---------- Panel: umumiy hisobot ----------
create or replace function public.qarz_hisobot(
  p_dan      timestamptz default null,
  p_gacha    timestamptz default null,
  p_agent_id uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_org   uuid := current_org_id();
  v_dan   timestamptz := coalesce(p_dan, '-infinity'::timestamptz);
  v_gacha timestamptz := coalesce(p_gacha, 'infinity'::timestamptz);
begin
  if not (is_admin() or is_direktor()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  return (
    with t as (
      select tr.* from qarz_transactions tr
      join qarz_clients c on c.id = tr.client_id
      where tr.org_id = v_org and tr.bekor_at is null
        and (p_agent_id is null or c.agent_id = p_agent_id)
    ),
    davr as (select * from t where sana between v_dan and v_gacha)
    select jsonb_build_object(
      'chiqim',  coalesce((select sum(summa) from davr where tur = 'chiqim'), 0),
      'kirim',   coalesce((select sum(summa) from davr where tur = 'kirim'), 0),
      'naqd',    coalesce((select sum(summa) from davr where usul = 'naqd'), 0),
      'plastik', coalesce((select sum(summa) from davr where usul = 'plastik'), 0),
      'klik',    coalesce((select sum(summa) from davr where usul = 'klik'), 0),
      -- Qarz bugungi holat, davrga bog'liq emas
      'qarz', coalesce((
        select sum(case when tur = 'chiqim' then summa else -summa end) from t
      ), 0),
      'klientlar', (
        select count(*)::int from qarz_clients c
        where c.org_id = v_org and c.faol
          and (p_agent_id is null or c.agent_id = p_agent_id)
      ),
      'agentlar', (select count(*)::int from qarz_agents a where a.org_id = v_org and a.faol)
    )
  );
end $$;

-- ---------- Huquqlar ----------
-- drop + create grantlarni o'chirdi, qaytadan beriladi. Yangi funksiya
-- ALTER DEFAULT PRIVILEGES orqali `authenticated` ga o'z-o'zidan
-- berilishini ham hisobga olamiz: bot funksiyalari undan olib
-- tashlanadi (chat_id maxfiy emas).
revoke all on function public.qarz_yozuv_qosh(uuid, text, numeric, text, timestamptz, uuid, text)
  from public, anon;
grant execute on function public.qarz_yozuv_qosh(uuid, text, numeric, text, timestamptz, uuid, text)
  to authenticated;

revoke all on function public.qarz_bot_yozuv(bigint, uuid, text, numeric, text, text)
  from public, anon, authenticated;

revoke all on function public.qarz_bot_hisobot(bigint, timestamptz, timestamptz)
  from public, anon, authenticated;

revoke all on function public.qarz_sverka(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.qarz_sverka(uuid, timestamptz, timestamptz, uuid) to authenticated;

revoke all on function public.qarz_hisobot(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.qarz_hisobot(timestamptz, timestamptz, uuid) to authenticated;
