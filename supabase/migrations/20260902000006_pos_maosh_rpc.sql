-- =============================================================
--  POS VA MAOSH MANTIQI
--
--  Bu yerda uchta og'ir amal bor va uchalasi ham bazada bajariladi,
--  panelda emas:
--
--   1. SOTUV - qoldiq tekshiruvi va kamaytirish bir tranzaksiyada
--      bo'lishi SHART. Panel tomonda qilinsa, ikki kassir bir vaqtda
--      oxirgi dona tovarni sotib yuborishi mumkin edi.
--
--   2. KPI - "oylik reja bo'yicha bosqichli foiz". Formula bitta
--      joyda tursin: panelda ham, hisobotda ham, chekda ham bir xil
--      son chiqishi kerak.
--
--   3. MAOSH QOLDIG'I - hisoblangan va to'langan pulning farqi.
--      Bu pul hisobi, ya'ni ikki joyda alohida yozilsa ertami-kechmi
--      ikki xil javob beradi.
-- =============================================================

-- ---------- Tarif bo'yicha tovar qidirish ----------
-- POS ekranida: nom yoki SKU bo'yicha qidiriladi, narx MIJOZNING
-- tarifidan olinadi, qoldiq esa haqiqiy (band qilingani chegirilgan).
create or replace function public.pos_tovarlar(
  p_q             text default null,
  p_price_group   uuid default null,
  p_limit         int  default 40
)
returns table (
  variant_id uuid,
  product_id uuid,
  nom        text,
  sku        text,
  razmer     text,
  rang       text,
  narx       numeric,
  qoldiq     bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, p.id, p.name, v.sku, v.size, v.color,
         pr.price,
         coalesce(sl.qty, 0) - coalesce(sl.reserved, 0)
  from product_variants v
  join products p on p.id = v.product_id and p.is_active
  left join stock_levels sl on sl.variant_id = v.id
  left join prices pr on pr.variant_id = v.id and pr.price_group_id = p_price_group
  where v.is_active
    and is_admin()
    and p.org_id = current_org_id()
    and (
      p_q is null or btrim(p_q) = ''
      or p.name ilike '%' || btrim(p_q) || '%'
      or v.sku  ilike '%' || btrim(p_q) || '%'
      or v.barcode = btrim(p_q)
    )
  order by p.name, v.sku
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.pos_tovarlar(text, uuid, int) from public, anon;
grant execute on function public.pos_tovarlar(text, uuid, int) to authenticated;


-- ---------- Sotuv ----------
create or replace function public.pos_sotuv_yarat(
  p_customer uuid,
  p_xodim    uuid,
  p_qatorlar jsonb,
  p_tolov    text default 'naqd',
  p_chegirma numeric default 0,
  p_izoh     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid := current_org_id();
  v_sotuv    uuid;
  v_raqam    bigint;
  v_guruh    uuid;
  v_qator    record;
  v_qoldiq   bigint;
  v_jami     numeric(14,0) := 0;
  v_org_tek  uuid;
begin
  if not is_admin() or v_org is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_qatorlar is null or jsonb_array_length(p_qatorlar) = 0 then
    raise exception 'BOSH_SOTUV';
  end if;

  -- Mijoz shu tenantniki bo'lishi shart va uning tarifi olinadi
  if p_customer is not null then
    select c.price_group_id into v_guruh
    from customers c where c.id = p_customer and c.org_id = v_org;
    if not found then
      raise exception 'MIJOZ_TOPILMADI';
    end if;
  end if;

  -- Xodim ham shu tenantniki
  if p_xodim is not null then
    perform 1 from xodimlar x where x.id = p_xodim and x.org_id = v_org;
    if not found then
      raise exception 'XODIM_TOPILMADI';
    end if;
  end if;

  -- Raqam tenant ichida ketma-ket. Bir vaqtda ikki sotuv bo'lsa
  -- ikkinchisi kutadi - unique(org_id, raqam) buni kafolatlaydi.
  select coalesce(max(raqam), 0) + 1 into v_raqam
  from pos_sotuvlar where org_id = v_org;

  insert into pos_sotuvlar (org_id, raqam, customer_id, xodim_id, price_group_id,
                            chegirma, tolov, izoh, created_by)
  values (v_org, v_raqam, p_customer, p_xodim, v_guruh,
          greatest(coalesce(p_chegirma, 0), 0), coalesce(p_tolov, 'naqd'),
          nullif(btrim(coalesce(p_izoh, '')), ''), auth.uid())
  returning id into v_sotuv;

  for v_qator in
    select (e->>'variant_id')::uuid as variant_id,
           (e->>'miqdor')::int      as miqdor,
           (e->>'narx')::numeric    as narx
    from jsonb_array_elements(p_qatorlar) e
    order by 1
  loop
    if v_qator.variant_id is null or coalesce(v_qator.miqdor, 0) <= 0 then
      raise exception 'NOTOGRI_MIQDOR';
    end if;

    -- Tovar shu tenantniki ekanini tekshiramiz. Bu bo'lmasa POS orqali
    -- boshqa tenantning omborini kamaytirish mumkin bo'lardi.
    select p.org_id into v_org_tek
    from product_variants v join products p on p.id = v.product_id
    where v.id = v_qator.variant_id;
    if v_org_tek is null or v_org_tek <> v_org then
      raise exception 'RUXSAT_YOQ';
    end if;

    -- Qoldiq qatorni band qilib tekshiriladi: ikki kassir bir vaqtda
    -- oxirgi donani sotib yubormasin
    select coalesce(qty, 0) - coalesce(reserved, 0) into v_qoldiq
    from stock_levels where variant_id = v_qator.variant_id for update;

    if coalesce(v_qoldiq, 0) < v_qator.miqdor then
      raise exception 'QOLDIQ_YETARLI_EMAS: % dona bor', coalesce(v_qoldiq, 0);
    end if;

    insert into pos_qatorlar (sotuv_id, variant_id, miqdor, narx, summa)
    values (v_sotuv, v_qator.variant_id, v_qator.miqdor,
            coalesce(v_qator.narx, 0),
            coalesce(v_qator.narx, 0) * v_qator.miqdor);

    v_jami := v_jami + coalesce(v_qator.narx, 0) * v_qator.miqdor;

    -- Ombor jurnaliga manfiy yozuv - trigger qoldiqni o'zi kamaytiradi
    insert into stock_movements (variant_id, qty, reason, note, created_by)
    values (v_qator.variant_id, -v_qator.miqdor, 'pos_out',
            'POS sotuv №' || v_raqam, auth.uid());
  end loop;

  update pos_sotuvlar
     set jami = greatest(v_jami - greatest(coalesce(p_chegirma, 0), 0), 0)
   where id = v_sotuv;

  return v_sotuv;
end $$;

revoke all on function public.pos_sotuv_yarat(uuid, uuid, jsonb, text, numeric, text) from public, anon;
grant execute on function public.pos_sotuv_yarat(uuid, uuid, jsonb, text, numeric, text) to authenticated;


-- ---------- KPI ----------
-- Oylik reja bo'yicha bosqichli foiz. Formula BITTA joyda tursin:
-- panel, hisobot va chek bir xil son ko'rsatishi kerak.
--
--   bajarilish = sotuv / (reja * oylar soni)
--     < 80%      -> kpi_past
--     80..100%   -> kpi_orta
--     > 100%     -> kpi_yuqori
--   KPI = sotuv * stavka / 100
--
-- Reja qo'yilmagan bo'lsa (0) - o'rta stavka ishlatiladi, chunki
-- "reja yo'q" degani "bajarilmagan" degani emas.
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
  v_oylar  numeric;
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

  -- Davr necha oy: to'liq bo'lmagan oy ham hisobga olinsin, aks holda
  -- 15 kunlik davrda reja butun oyga qarab o'lchanardi
  v_oylar := greatest((p_oxir - p_bosh + 1)::numeric / 30.0, 0.1);
  v_reja  := coalesce(v_x.kpi_reja, 0) * v_oylar;

  if v_reja > 0 then
    v_baj := round(v_sotuv * 100 / v_reja, 1);
  else
    v_baj := null; -- reja qo'yilmagan
  end if;

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


-- ---------- Xodimlar ro'yxati va qoldig'i ----------
create or replace function public.xodimlar_royxat(p_faol boolean default null)
returns table (
  id uuid, ism text, lavozim text, telefon text,
  oylik_stavka numeric, kpi_reja numeric, faol boolean,
  ishga_kirgan date,
  hisoblangan numeric,   -- bonus + kpi
  tolangan numeric,      -- maosh + avans
  jarima numeric,
  qoldiq numeric,        -- hisoblangan - tolangan - jarima
  oxirgi_amal timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.ism, x.lavozim, x.telefon,
         x.oylik_stavka, x.kpi_reja, x.faol, x.ishga_kirgan,
         coalesce(sum(m.summa) filter (where m.tur in ('bonus', 'kpi')), 0),
         coalesce(sum(m.summa) filter (where m.tur in ('maosh', 'avans')), 0),
         coalesce(sum(m.summa) filter (where m.tur = 'jarima'), 0),
         coalesce(sum(m.summa) filter (where m.tur in ('bonus', 'kpi')), 0)
           - coalesce(sum(m.summa) filter (where m.tur in ('maosh', 'avans')), 0)
           - coalesce(sum(m.summa) filter (where m.tur = 'jarima'), 0),
         max(m.created_at)
  from xodimlar x
  left join maosh_amallari m on m.xodim_id = x.id
  where is_admin()
    and x.org_id = current_org_id()
    and (p_faol is null or x.faol = p_faol)
  group by x.id
  order by x.faol desc, x.ism;
$$;

revoke all on function public.xodimlar_royxat(boolean) from public, anon;
grant execute on function public.xodimlar_royxat(boolean) to authenticated;


-- ---------- Bitta xodimning davriy hisoboti ----------
create or replace function public.xodim_hisobot(
  p_xodim uuid,
  p_bosh  date,
  p_oxir  date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org   uuid := current_org_id();
  v_x     xodimlar;
  v_kpi   record;
  v_natija jsonb;
begin
  if not is_admin() or v_org is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_x from xodimlar where id = p_xodim and org_id = v_org;
  if not found then
    raise exception 'XODIM_TOPILMADI';
  end if;

  select * into v_kpi from xodim_kpi(p_xodim, p_bosh, p_oxir);

  select jsonb_build_object(
    'xodim', to_jsonb(v_x),
    'kpi', to_jsonb(v_kpi),
    'amallar', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (
        select m.id, m.tur, m.summa, m.davr, m.izoh, m.created_at
        from maosh_amallari m
        where m.xodim_id = p_xodim
          and m.created_at >= p_bosh
          and m.created_at < (p_oxir + 1)
      ) t
    ), '[]'::jsonb),
    'jami', (
      select jsonb_build_object(
        'bonus',  coalesce(sum(summa) filter (where tur = 'bonus'), 0),
        'kpi',    coalesce(sum(summa) filter (where tur = 'kpi'), 0),
        'maosh',  coalesce(sum(summa) filter (where tur = 'maosh'), 0),
        'avans',  coalesce(sum(summa) filter (where tur = 'avans'), 0),
        'jarima', coalesce(sum(summa) filter (where tur = 'jarima'), 0)
      )
      from maosh_amallari
      where xodim_id = p_xodim and created_at >= p_bosh and created_at < (p_oxir + 1)
    ),
    -- Umumiy qoldiq DAVRGA BOG'LIQ EMAS: xodim bilan hisob-kitob
    -- boshidan beri yuritiladi, davr esa faqat ko'rsatish uchun.
    'umumiy_qoldiq', (
      select coalesce(sum(summa) filter (where tur in ('bonus', 'kpi')), 0)
           - coalesce(sum(summa) filter (where tur in ('maosh', 'avans')), 0)
           - coalesce(sum(summa) filter (where tur = 'jarima'), 0)
      from maosh_amallari where xodim_id = p_xodim
    )
  ) into v_natija;

  return v_natija;
end $$;

revoke all on function public.xodim_hisobot(uuid, date, date) from public, anon;
grant execute on function public.xodim_hisobot(uuid, date, date) to authenticated;


-- ---------- Maosh amali ----------
create or replace function public.maosh_amal(
  p_xodim uuid,
  p_tur   text,
  p_summa numeric,
  p_davr  date default null,
  p_izoh  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_id  uuid;
begin
  if not is_admin() or v_org is null then
    raise exception 'RUXSAT_YOQ';
  end if;
  if coalesce(p_summa, 0) <= 0 then
    raise exception 'SUMMA_NOTOGRI';
  end if;

  -- Xodim shu tenantniki bo'lishi shart
  perform 1 from xodimlar where id = p_xodim and org_id = v_org;
  if not found then
    raise exception 'XODIM_TOPILMADI';
  end if;

  insert into maosh_amallari (org_id, xodim_id, tur, summa, davr, izoh, created_by)
  values (v_org, p_xodim, p_tur, round(p_summa),
          coalesce(p_davr, date_trunc('month', now())::date),
          nullif(btrim(coalesce(p_izoh, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.maosh_amal(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.maosh_amal(uuid, text, numeric, date, text) to authenticated;


-- ---------- Sotuv cheki uchun ma'lumot ----------
create or replace function public.pos_sotuv(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'sotuv', to_jsonb(s),
    'mijoz', (select c.name from customers c where c.id = s.customer_id),
    'telefon', (select c.phone from customers c where c.id = s.customer_id),
    'xodim', (select x.ism from xodimlar x where x.id = s.xodim_id),
    'tarif', (select g.name from price_groups g where g.id = s.price_group_id),
    'qatorlar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nom', p.name, 'sku', v.sku, 'razmer', v.size, 'rang', v.color,
        'miqdor', q.miqdor, 'narx', q.narx, 'summa', q.summa
      ) order by p.name)
      from pos_qatorlar q
      join product_variants v on v.id = q.variant_id
      join products p on p.id = v.product_id
      where q.sotuv_id = s.id
    ), '[]'::jsonb)
  )
  from pos_sotuvlar s
  where s.id = p_id and is_admin() and s.org_id = current_org_id();
$$;

revoke all on function public.pos_sotuv(uuid) from public, anon;
grant execute on function public.pos_sotuv(uuid) to authenticated;


-- ---------- Sotuvlar ro'yxati ----------
create or replace function public.pos_sotuvlar_royxat(
  p_bosh date default null,
  p_oxir date default null,
  p_limit int default 100
)
returns table (
  id uuid, raqam bigint, sana timestamptz, mijoz text, xodim text,
  jami numeric, chegirma numeric, tolov text, qator_soni bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.raqam, s.created_at,
         (select c.name from customers c where c.id = s.customer_id),
         (select x.ism  from xodimlar  x where x.id = s.xodim_id),
         s.jami, s.chegirma, s.tolov,
         (select count(*) from pos_qatorlar q where q.sotuv_id = s.id)
  from pos_sotuvlar s
  where is_admin()
    and s.org_id = current_org_id()
    and (p_bosh is null or s.created_at >= p_bosh)
    and (p_oxir is null or s.created_at < (p_oxir + 1))
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public.pos_sotuvlar_royxat(date, date, int) from public, anon;
grant execute on function public.pos_sotuvlar_royxat(date, date, int) to authenticated;
