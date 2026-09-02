-- =============================================================
--  KPI: qisqa davrda reja haddan tashqari katta bo'lib qolardi
--
--  Sinovda ko'rindi: 2 kunlik davr uchun reja oylik rejaning 10%
--  qilib olindi, holbuki 2 kun oyning 6.7% i. Ya'ni xodimning
--  bajarilishi past ko'rsatilib, u pastroq KPI bosqichiga tushardi.
--
--  Sabab: bo'linishdan himoya uchun qo'yilgan 0.1 chegara. U aslida
--  keraksiz - davr eng kamida bir kun bo'ladi, ya'ni 1/30 > 0.
-- =============================================================

create or replace function public.xodim_kpi(
  p_xodim uuid,
  p_bosh  date,
  p_oxir  date
)
returns table (
  sotuv_summa numeric,
  reja        numeric,
  bajarilish  numeric,
  stavka      numeric,
  kpi         numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org    uuid := current_org_id();
  v_x      xodimlar;
  v_sotuv  numeric := 0;
  v_kunlar numeric;
  v_reja   numeric;
  v_baj    numeric;
  v_stavka numeric;
begin
  if not is_admin() or v_org is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_x from xodimlar where id = p_xodim and org_id = v_org;
  if not found then
    raise exception 'XODIM_TOPILMADI';
  end if;

  select coalesce(sum(s.jami), 0) into v_sotuv
  from pos_sotuvlar s
  where s.org_id = v_org
    and s.xodim_id = p_xodim
    and s.created_at >= p_bosh
    and s.created_at < (p_oxir + 1);

  -- Reja davrga proporsional. Kunlar soni eng kamida 1, ya'ni
  -- nolga bo'linish bo'lmaydi va sun'iy chegara ham kerak emas.
  v_kunlar := greatest((p_oxir - p_bosh + 1)::numeric, 1);
  v_reja   := round(coalesce(v_x.kpi_reja, 0) * v_kunlar / 30.0);

  if v_reja > 0 then
    v_baj := round(v_sotuv * 100 / v_reja, 1);
  else
    v_baj := null; -- reja qo'yilmagan
  end if;

  -- Reja yo'q bo'lsa o'rta stavka: "reja yo'q" degani
  -- "bajarilmagan" degani emas.
  v_stavka := case
    when v_reja <= 0 then coalesce(v_x.kpi_orta, 0)
    when v_baj < 80 then coalesce(v_x.kpi_past, 0)
    when v_baj <= 100 then coalesce(v_x.kpi_orta, 0)
    else coalesce(v_x.kpi_yuqori, 0)
  end;

  return query select
    v_sotuv,
    v_reja,
    v_baj,
    v_stavka,
    round(v_sotuv * v_stavka / 100);
end $$;

revoke all on function public.xodim_kpi(uuid, date, date) from public, anon;
grant execute on function public.xodim_kpi(uuid, date, date) to authenticated;
