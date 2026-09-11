-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: bitta yozuvni o'qish (bot)
--
-- Bot tahrir ekranini chizish uchun yozuvning turi, summasi va
-- sanasini bilishi kerak. Avval u buni "oxirgi 30 yozuv" ro'yxatidan
-- qidirardi. Sverkadan eski yozuv tanlansa, u o'sha 30 talikka
-- tushmay, bot "Yozuv topilmadi" derdi — holbuki yozuv bor edi.
--
-- Ruxsat shu yerda qaytadan tekshiriladi: agent FAQAT o'z klientining
-- yozuvini ko'radi. Bot hech qachon o'zi ruxsat hisoblamaydi.
-- =============================================================

create or replace function public.qarz_bot_yozuv_ol(
  p_chat_id bigint,
  p_id      uuid
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_agent uuid;
  v_j     jsonb;
begin
  select id into v_agent from qarz_agents where chat_id = p_chat_id and faol;
  if v_agent is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
           'id', t.id, 'tur', t.tur, 'summa', t.summa, 'usul', t.usul,
           'sana', t.sana, 'bekor', t.bekor_at is not null,
           'klient', coalesce(nullif(c.apteka, ''), c.ism)
         )
    into v_j
  from qarz_transactions t
  join qarz_clients c on c.id = t.client_id
  where t.id = p_id
    and c.agent_id = v_agent;

  if v_j is null then
    raise exception 'YOZUV_TOPILMADI';
  end if;
  return v_j;
end $$;

revoke all on function public.qarz_bot_yozuv_ol(bigint, uuid)
  from public, anon, authenticated;
