-- =============================================================
-- YUKCHIBOLLA — QARZDORLIK: paneldan klient qo'shish va tahrirlash
--
-- Avval klientni FAQAT agent botdan qo'sha olardi. Agent kasal
-- bo'lsa, telefoni ishlamasa yoki hali ulanmagan bo'lsa — admin
-- tiqilib qolardi va yangi klientga tovar chiqara olmasdi.
--
-- Agent BIRIKTIRISH ham shu yerda: bot "faqat o'z klienti"
-- qoidasiga tayanadi, ya'ni agentsiz klient botda umuman
-- ko'rinmaydi. Admin klient yaratib, agentini ko'rsatmasa — agent
-- uni topa olmasdi va sabab ko'rinmasdi. Shuning uchun agent
-- maydonining izohi ekranda ochiq yozilgan.
-- =============================================================

create or replace function public.qarz_klient_saqla(
  p_id       uuid default null,
  p_ism      text default null,
  p_familiya text default null,
  p_apteka   text default null,
  p_telefon  text default null,
  p_agent_id uuid default null,
  p_izoh     text default null,
  p_faol     boolean default true
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_id  uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_ism is null or btrim(p_ism) = '' then
    raise exception 'ISM_MAJBURIY';
  end if;

  -- Agent boshqa tenantniki bo'lmasin
  if p_agent_id is not null and not exists (
    select 1 from qarz_agents where id = p_agent_id and org_id = v_org
  ) then
    raise exception 'AGENT_TOPILMADI';
  end if;

  if p_id is null then
    insert into qarz_clients (org_id, agent_id, ism, familiya, apteka, telefon, izoh, faol, created_by)
    values (v_org, p_agent_id, btrim(p_ism),
            nullif(btrim(coalesce(p_familiya, '')), ''),
            nullif(btrim(coalesce(p_apteka, '')), ''),
            nullif(btrim(coalesce(p_telefon, '')), ''),
            nullif(btrim(coalesce(p_izoh, '')), ''),
            coalesce(p_faol, true), auth.uid())
    returning id into v_id;

    insert into qarz_audit (org_id, amal, jadval, yozuv_id, user_id, yangi)
    values (v_org, 'qoshildi', 'qarz_clients', v_id, auth.uid(),
            jsonb_build_object('ism', btrim(p_ism), 'apteka', p_apteka));
  else
    if not exists (select 1 from qarz_clients where id = p_id and org_id = v_org) then
      raise exception 'RUXSAT_YOQ';
    end if;
    update qarz_clients
       set agent_id = p_agent_id,
           ism      = btrim(p_ism),
           familiya = nullif(btrim(coalesce(p_familiya, '')), ''),
           apteka   = nullif(btrim(coalesce(p_apteka, '')), ''),
           telefon  = nullif(btrim(coalesce(p_telefon, '')), ''),
           izoh     = nullif(btrim(coalesce(p_izoh, '')), ''),
           faol     = coalesce(p_faol, faol)
     where id = p_id
    returning id into v_id;

    insert into qarz_audit (org_id, amal, jadval, yozuv_id, user_id, yangi)
    values (v_org, 'tahrir', 'qarz_clients', v_id, auth.uid(),
            jsonb_build_object('ism', btrim(p_ism), 'apteka', p_apteka, 'faol', p_faol));
  end if;

  return v_id;
end $$;

revoke all on function public.qarz_klient_saqla(uuid, text, text, text, text, uuid, text, boolean)
  from public, anon;
grant execute on function public.qarz_klient_saqla(uuid, text, text, text, text, uuid, text, boolean)
  to authenticated;
