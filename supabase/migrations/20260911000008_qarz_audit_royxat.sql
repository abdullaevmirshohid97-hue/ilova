-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: audit jurnalini o'qish
--
-- qarz_audit yozilib turardi, lekin panelda KO'RINMASDI. Ya'ni
-- "kim qachon nimani bekor qildi" degan savolga javob bazada bor
-- edi-yu, unga hech kim yeta olmasdi.
--
-- Bu yo'nalishda bu savol ayniqsa muhim: agent o'z klientining
-- yozuvini ISTAGAN VAQT bekor qila oladi (foydalanuvchi shunday
-- tanladi), ya'ni yopilgan oyning raqami ham o'zgarishi mumkin.
-- Yagona nazorat — shu jurnal.
-- =============================================================

create or replace function public.qarz_audit_royxat(
  p_dan      timestamptz default null,
  p_gacha    timestamptz default null,
  p_amal     text default null,
  p_agent_id uuid default null,
  p_limit    int default 200,
  p_offset   int default 0
)
returns table(
  id         bigint,
  amal       text,
  jadval     text,
  yozuv_id   uuid,
  agent      text,
  foydalanuvchi text,
  klient     text,
  eski       jsonb,
  yangi      jsonb,
  sabab      text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.amal, a.jadval, a.yozuv_id,
         ag.ism,
         coalesce(nullif(p.full_name, ''), u.email),
         -- Yozuv qaysi klientga tegishli: jurnalda faqat id turadi,
         -- odam esa ismni qidiradi
         (select coalesce(c.apteka, c.ism) from qarz_clients c
           where c.id = coalesce(
             (a.yangi ->> 'client_id')::uuid,
             (a.eski  ->> 'client_id')::uuid,
             case when a.jadval = 'qarz_clients' then a.yozuv_id end
           )),
         a.eski, a.yangi, a.sabab, a.created_at
  from qarz_audit a
  left join qarz_agents ag on ag.id = a.agent_id
  left join profiles p     on p.id = a.user_id
  left join auth.users u   on u.id = a.user_id
  where a.org_id = current_org_id()
    and (is_admin() or is_direktor())
    and (p_dan is null   or a.created_at >= p_dan)
    and (p_gacha is null or a.created_at <= p_gacha)
    and (p_amal is null  or a.amal = p_amal)
    and (p_agent_id is null or a.agent_id = p_agent_id)
  -- Tartib BARQAROR: id unikal, aks holda bo'lak chegarasida qator
  -- ikki marta tushib qolardi
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 200), 500))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.qarz_audit_royxat(timestamptz, timestamptz, text, uuid, int, int)
  from public, anon;
grant execute on function public.qarz_audit_royxat(timestamptz, timestamptz, text, uuid, int, int)
  to authenticated;
