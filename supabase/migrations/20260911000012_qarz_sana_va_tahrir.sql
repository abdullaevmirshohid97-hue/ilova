-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: o'tgan kunga yozish va yozuvni tahrirlash
--
-- Ikki narsa yetishmasdi:
--
-- 1. SANA. qarz_yozuv_qosh p_sana ni allaqachon qabul qilardi, lekin
--    panel ham, bot ham doim null yuborardi — ya'ni har yozuv "hozir"
--    bo'lib tushardi. Agent kechagi chiqimni bugun kiritsa, u kechagi
--    kunga emas, bugunga yozilardi va kunlar kesimidagi hisob buzilardi.
--
-- 2. TAHRIR. Summani to'g'rilashning yagona yo'li "bekor qilib, qayta
--    yozish" edi. Bu ishlaydi-yu, sverkada bitta xato o'rniga uchta
--    qator qoladi va mijozga ko'rsatib bo'lmaydi.
--
-- TAHRIR O'CHIRISH EMAS. Eski qiymat audit jurnaliga to'liq yoziladi
-- va sabab MAJBURIY — bekor qilishdagi kabi. Jurnalsiz tahrir bu
-- yo'nalishning butun nazoratini yo'q qilardi.
-- =============================================================

-- ---------- 1. Bot ham sana yubora olsin ----------
-- Eski imzoni tashlaymiz: yangi p_sana qo'shilsa, 6 argumentli
-- chaqiruv ikki funksiyaga ham tushib, "ambiguous" xatosi berardi.
drop function if exists public.qarz_bot_yozuv(bigint, uuid, text, numeric, text, text);

create or replace function public.qarz_bot_yozuv(
  p_chat_id   bigint,
  p_client_id uuid,
  p_tur       text,
  p_summa     numeric,
  p_izoh      text default null,
  p_usul      text default null,
  p_sana      timestamptz default null
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

  -- Chegara va sana tekshiruvi qarz_yozuv_qosh ICHIDA
  v_id := qarz_yozuv_qosh(p_client_id, p_tur, p_summa, p_izoh, p_sana, v_agent, p_usul);

  return jsonb_build_object(
    'ok', true, 'id', v_id,
    'klient', coalesce(v_c.apteka, v_c.ism),
    'oldingi', v_oldin,
    'summa', p_summa,
    'usul', p_usul,
    'sana', (select sana from qarz_transactions where id = v_id),
    'qoldiq', qarz_balans(p_client_id)
  );
end $$;

revoke all on function public.qarz_bot_yozuv(bigint, uuid, text, numeric, text, text, timestamptz)
  from public, anon, authenticated;

-- ---------- 2. Yozuvni tahrirlash ----------
create or replace function public.qarz_yozuv_tahrir(
  p_id       uuid,
  p_summa    numeric default null,
  p_sana     timestamptz default null,
  p_usul     text default null,
  p_izoh     text default null,
  p_sabab    text default null,
  p_agent_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tx     record;
  v_cagent uuid;
  v_summa  numeric;
  v_sana   timestamptz;
  v_usul   text;
  v_izoh   text;
begin
  if p_sabab is null or length(btrim(p_sabab)) < 3 then
    raise exception 'SABAB_MAJBURIY';
  end if;

  select * into v_tx from qarz_transactions where id = p_id;
  if v_tx.id is null then
    raise exception 'YOZUV_TOPILMADI';
  end if;
  -- Bekor qilingan yozuv hisobdan chiqqan: uni tahrirlash "o'lik
  -- qatorni tiriltirish" bo'lardi va qoldiq jimgina siljirdi
  if v_tx.bekor_at is not null then
    raise exception 'ALLAQACHON_BEKOR';
  end if;

  select agent_id into v_cagent from qarz_clients where id = v_tx.client_id;

  if p_agent_id is not null then
    -- Bot yo'li: agent FAQAT o'z klientining yozuvini tahrirlaydi
    if not exists (
      select 1 from qarz_agents
      where id = p_agent_id and org_id = v_tx.org_id and faol
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
    if v_cagent is distinct from p_agent_id then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    if not is_admin() or v_tx.org_id <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  -- Berilmagan maydon o'z holicha qoladi
  v_summa := coalesce(p_summa, v_tx.summa);
  v_sana  := coalesce(p_sana, v_tx.sana);
  v_izoh  := coalesce(nullif(btrim(coalesce(p_izoh, '')), ''), v_tx.izoh);

  if v_summa <= 0 then
    raise exception 'NOTOGRI_SUMMA';
  end if;
  if v_sana > now() + interval '1 minute' then
    raise exception 'SANA_KELAJAKDA';
  end if;

  if v_tx.tur = 'kirim' then
    v_usul := coalesce(nullif(btrim(coalesce(p_usul, '')), ''), v_tx.usul);
    if v_usul is null then
      raise exception 'USUL_MAJBURIY';
    end if;
    if v_usul not in ('naqd', 'plastik', 'klik') then
      raise exception 'NOTOGRI_USUL';
    end if;
  else
    -- Chiqimda usul bo'lmaydi: bo'lsa hisobot yolg'on gapirardi
    v_usul := null;
  end if;

  -- TUR O'ZGARMAYDI. Chiqimni kirimga aylantirish qoldiqni ikki
  -- barobar siljitadi va buni tahrir deb atash chalg'itardi —
  -- bunday holda eskisi bekor qilinib, yangisi yoziladi.
  update qarz_transactions
     set summa = v_summa,
         sana  = v_sana,
         usul  = v_usul,
         izoh  = v_izoh
   where id = p_id;

  insert into qarz_audit (org_id, amal, jadval, yozuv_id, agent_id, user_id, eski, yangi, sabab)
  values (
    v_tx.org_id, 'tahrir', 'qarz_transactions', p_id, p_agent_id, auth.uid(),
    jsonb_build_object('tur', v_tx.tur, 'summa', v_tx.summa, 'sana', v_tx.sana,
                       'usul', v_tx.usul, 'izoh', v_tx.izoh, 'client_id', v_tx.client_id),
    jsonb_build_object('tur', v_tx.tur, 'summa', v_summa, 'sana', v_sana,
                       'usul', v_usul, 'izoh', v_izoh, 'client_id', v_tx.client_id),
    btrim(p_sabab)
  );

  return jsonb_build_object(
    'ok', true,
    'id', p_id,
    'eski_summa', v_tx.summa,
    'summa', v_summa,
    'sana', v_sana,
    'usul', v_usul,
    'qoldiq', qarz_balans(v_tx.client_id)
  );
end $$;

revoke all on function public.qarz_yozuv_tahrir(uuid, numeric, timestamptz, text, text, text, uuid)
  from public, anon;
grant execute on function public.qarz_yozuv_tahrir(uuid, numeric, timestamptz, text, text, text, uuid)
  to authenticated;

-- ---------- 3. Bot: tahrir ----------
create or replace function public.qarz_bot_tahrir(
  p_chat_id bigint,
  p_id      uuid,
  p_summa   numeric default null,
  p_sana    timestamptz default null,
  p_usul    text default null,
  p_sabab   text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_agent uuid;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  return qarz_yozuv_tahrir(p_id, p_summa, p_sana, p_usul, null, p_sabab, v_agent);
end $$;

revoke all on function public.qarz_bot_tahrir(bigint, uuid, numeric, timestamptz, text, text)
  from public, anon, authenticated;

-- ---------- 4. Bot: klientning oxirgi yozuvlari ----------
-- Tahrir va bekor uchun agentga "qaysi yozuv" degan ro'yxat kerak.
-- Mavjud qarz_bot_oxirgi faqat ENG oxirgisini berardi.
create or replace function public.qarz_bot_yozuvlar(
  p_chat_id   bigint,
  p_client_id uuid,
  p_limit     int default 10
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
  if not exists (
    select 1 from qarz_clients where id = p_client_id and agent_id = v_agent
  ) then
    raise exception 'RUXSAT_YOQ';
  end if;

  return coalesce((
    select jsonb_agg(x)
    from (
      select jsonb_build_object(
               'id', t.id, 'tur', t.tur, 'summa', t.summa,
               'usul', t.usul, 'sana', t.sana,
               'bekor', t.bekor_at is not null
             ) as x
      from qarz_transactions t
      where t.client_id = p_client_id
        and t.bekor_at is null
      order by t.sana desc, t.id desc
      limit greatest(1, least(coalesce(p_limit, 10), 30))
    ) q
  ), '[]'::jsonb);
end $$;

revoke all on function public.qarz_bot_yozuvlar(bigint, uuid, int)
  from public, anon, authenticated;
