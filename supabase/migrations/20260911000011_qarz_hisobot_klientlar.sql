-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: hisobotda har bir klient qatori
--
-- Hisobotda klientning faqat QOLDIG'I turardi. "Shu oyda bu
-- aptekaga qancha tovar chiqdi va undan qancha pul tushdi" degan
-- savolga javob yo'q edi — qoldiq esa butun tarixning natijasi,
-- davrni ko'rsatmaydi.
--
-- Endi har qatorda: apteka, davrdagi chiqim, davrdagi kirim,
-- to'lov turlari va BUGUNGI qarzdorlik.
--
-- QARZ USTUNI DAVRGA BOG'LIQ EMAS — bu ataylab. Qarz "shu oyning
-- farqi" emas, bugungi holat: klient qancha qarzdor. Davr bilan
-- cheklansa raqam mutlaqo boshqa ma'no berardi va buni faqat hisob
-- to'g'ri kelmaganda sezilardi. Sarlavhada ham shunday yozilgan.
-- =============================================================

-- ---------- Panel (admin / direktor) ----------
create or replace function public.qarz_hisobot_klientlar(
  p_dan      timestamptz default null,
  p_gacha    timestamptz default null,
  p_agent_id uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_org uuid := current_org_id();
begin
  if not (is_admin() or is_direktor()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  return coalesce((
    select jsonb_agg(x order by (x->>'qarz')::numeric desc)
    from (
      select jsonb_build_object(
               'id', c.id,
               'ism', c.ism,
               'familiya', coalesce(c.familiya, ''),
               'apteka', coalesce(c.apteka, ''),
               'telefon', coalesce(c.telefon, ''),
               'agent', coalesce(a.ism, ''),
               'chiqim', coalesce(d.chiqim, 0),
               'kirim', coalesce(d.kirim, 0),
               'naqd', coalesce(d.naqd, 0),
               'plastik', coalesce(d.plastik, 0),
               'klik', coalesce(d.klik, 0),
               -- Qoldiq BUTUN tarixdan, davrsiz
               'qarz', qarz_balans(c.id)
             ) as x
      from qarz_clients c
      left join qarz_agents a on a.id = c.agent_id
      left join lateral (
        select
          sum(t.summa) filter (where t.tur = 'chiqim')  as chiqim,
          sum(t.summa) filter (where t.tur = 'kirim')   as kirim,
          sum(t.summa) filter (where t.usul = 'naqd')    as naqd,
          sum(t.summa) filter (where t.usul = 'plastik') as plastik,
          sum(t.summa) filter (where t.usul = 'klik')    as klik
        from qarz_transactions t
        where t.client_id = c.id
          -- Bekor qilinganlar hisobga KIRMAYDI: ular hisobdan chiqqan
          and t.bekor_at is null
          and (p_dan is null   or t.sana >= p_dan)
          and (p_gacha is null or t.sana <= p_gacha)
      ) d on true
      where c.org_id = v_org
        and (p_agent_id is null or c.agent_id = p_agent_id)
        -- Faol emas, harakati ham yo'q, qarzi ham yo'q klient
        -- hisobotni uzaytirardi va hech narsa qo'shmasdi
        and (
          c.faol
          or qarz_balans(c.id) <> 0
          or coalesce(d.chiqim, 0) <> 0
          or coalesce(d.kirim, 0) <> 0
        )
    ) t
  ), '[]'::jsonb);
end $$;

revoke all on function public.qarz_hisobot_klientlar(timestamptz, timestamptz, uuid)
  from public, anon;
grant execute on function public.qarz_hisobot_klientlar(timestamptz, timestamptz, uuid)
  to authenticated;

-- ---------- Bot (agent o'z klientlari) ----------
create or replace function public.qarz_bot_hisobot_klientlar(
  p_chat_id bigint,
  p_dan     timestamptz default null,
  p_gacha   timestamptz default null
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
    select jsonb_agg(x order by (x->>'qarz')::numeric desc)
    from (
      select jsonb_build_object(
               'id', c.id,
               'ism', c.ism,
               'familiya', coalesce(c.familiya, ''),
               'apteka', coalesce(c.apteka, ''),
               'telefon', coalesce(c.telefon, ''),
               'chiqim', coalesce(d.chiqim, 0),
               'kirim', coalesce(d.kirim, 0),
               'naqd', coalesce(d.naqd, 0),
               'plastik', coalesce(d.plastik, 0),
               'klik', coalesce(d.klik, 0),
               'qarz', qarz_balans(c.id)
             ) as x
      from qarz_clients c
      left join lateral (
        select
          sum(t.summa) filter (where t.tur = 'chiqim')  as chiqim,
          sum(t.summa) filter (where t.tur = 'kirim')   as kirim,
          sum(t.summa) filter (where t.usul = 'naqd')    as naqd,
          sum(t.summa) filter (where t.usul = 'plastik') as plastik,
          sum(t.summa) filter (where t.usul = 'klik')    as klik
        from qarz_transactions t
        where t.client_id = c.id
          and t.bekor_at is null
          and (p_dan is null   or t.sana >= p_dan)
          and (p_gacha is null or t.sana <= p_gacha)
      ) d on true
      -- Agent FAQAT o'z klientini ko'radi
      where c.agent_id = v_agent
        and (
          c.faol
          or qarz_balans(c.id) <> 0
          or coalesce(d.chiqim, 0) <> 0
          or coalesce(d.kirim, 0) <> 0
        )
    ) t
  ), '[]'::jsonb);
end $$;

-- Bot service_role bilan ishlaydi. authenticated ga BERILMAYDI:
-- chat_id maxfiy emas, uni bilgan odam boshqa agentning ro'yxatini
-- o'qib olardi.
revoke all on function public.qarz_bot_hisobot_klientlar(bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
