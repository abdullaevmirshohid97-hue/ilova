-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: yozuvlarning umumiy ro'yxati
--
-- Yozuvlarni ko'rishning yagona yo'li SVERKA edi, ya'ni bitta klient
-- kesimida. "Bugun jami qancha pul kirdi va kimlardan" degan savolga
-- javob berish uchun har bir klientni birma-bir ochish kerak bo'lardi.
--
-- Umumiy jami ham QAYTARILADI — sahifalangan qatorlarning yig'indisi
-- emas. Ekranda "jami" deb sahifadagi qatorlar qo'shib ko'rsatilsa,
-- ikkinchi sahifaga o'tganda raqam o'zgarib ketardi va qaysi biri
-- haqiqiy ekani bilinmasdi.
-- =============================================================

create or replace function public.qarz_yozuvlar(
  p_dan       timestamptz default null,
  p_gacha     timestamptz default null,
  p_tur       text default null,
  p_usul      text default null,
  p_agent_id  uuid default null,
  p_client_id uuid default null,
  p_bekor     boolean default null,   -- null = hammasi, true/false = faqat shunday
  p_q         text default null,
  p_limit     int default 100,
  p_offset    int default 0
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_qatorlar jsonb;
  v_jami jsonb;
begin
  if not (is_admin() or is_direktor()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  with tanlangan as (
    select t.*, c.ism, c.familiya, c.apteka, c.telefon, c.agent_id, a.ism as agent
    from qarz_transactions t
    join qarz_clients c on c.id = t.client_id
    left join qarz_agents a on a.id = c.agent_id
    where t.org_id = v_org
      and (p_dan is null       or t.sana >= p_dan)
      and (p_gacha is null     or t.sana <= p_gacha)
      and (p_tur is null       or t.tur = p_tur)
      and (p_usul is null      or t.usul = p_usul)
      and (p_agent_id is null  or c.agent_id = p_agent_id)
      and (p_client_id is null or t.client_id = p_client_id)
      and (p_bekor is null     or (t.bekor_at is not null) = p_bekor)
      and (
        p_q is null or btrim(p_q) = ''
        or c.ism ilike '%' || btrim(p_q) || '%'
        or coalesce(c.familiya, '') ilike '%' || btrim(p_q) || '%'
        or coalesce(c.apteka, '')   ilike '%' || btrim(p_q) || '%'
        or coalesce(c.telefon, '')  ilike '%' || btrim(p_q) || '%'
        or coalesce(t.izoh, '')     ilike '%' || btrim(p_q) || '%'
      )
  )
  select
    coalesce((
      select jsonb_agg(x)
      from (
        select jsonb_build_object(
                 'id', s.id,
                 'tur', s.tur,
                 'summa', s.summa,
                 'usul', s.usul,
                 'sana', s.sana,
                 'izoh', s.izoh,
                 'manba', s.manba,
                 'bekor', s.bekor_at is not null,
                 'bekor_sabab', s.bekor_sabab,
                 'client_id', s.client_id,
                 'klient', coalesce(nullif(s.apteka, ''), s.ism),
                 'telefon', s.telefon,
                 'agent', s.agent
               ) as x
        from tanlangan s
        -- Tartib BARQAROR: sana bir xil bo'lsa id ajratadi, aks holda
        -- sahifa chegarasida qator ikki marta tushib qolardi
        order by s.sana desc, s.id desc
        limit greatest(1, least(coalesce(p_limit, 100), 500))
        offset greatest(coalesce(p_offset, 0), 0)
      ) t
    ), '[]'::jsonb),
    jsonb_build_object(
      -- Bekor qilinganlar jamiga KIRMAYDI: ular hisobdan chiqqan
      'chiqim',  coalesce(sum(summa) filter (where tur = 'chiqim' and bekor_at is null), 0),
      'kirim',   coalesce(sum(summa) filter (where tur = 'kirim'  and bekor_at is null), 0),
      'naqd',    coalesce(sum(summa) filter (where usul = 'naqd'    and bekor_at is null), 0),
      'plastik', coalesce(sum(summa) filter (where usul = 'plastik' and bekor_at is null), 0),
      'klik',    coalesce(sum(summa) filter (where usul = 'klik'    and bekor_at is null), 0),
      'soni',    count(*)::int,
      'bekor',   count(*) filter (where bekor_at is not null)::int
    )
  into v_qatorlar, v_jami
  from tanlangan;

  return jsonb_build_object('qatorlar', v_qatorlar, 'jami', v_jami);
end $$;

revoke all on function public.qarz_yozuvlar(timestamptz, timestamptz, text, text, uuid, uuid, boolean, text, int, int)
  from public, anon;
grant execute on function public.qarz_yozuvlar(timestamptz, timestamptz, text, text, uuid, uuid, boolean, text, int, int)
  to authenticated;
