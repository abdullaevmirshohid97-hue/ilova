-- =============================================================
--  3-BOSQICH — menejerning kundalik ish quroli botda
--
--  Uchta o'qish funksiyasi: mijozlarim, qarzdorlar, narx so'rash.
--  Yangi biznes mantiq yozilmaydi — narx tanlash tartibi mavjud
--  my_effective_prices() bilan bir xil: mijozga qo'yilgan narx >
--  menejerning umumiy narxi > kompaniya baza narxi.
--
--  XAVFSIZLIK: uchalasi ham chat_id bo'yicha xodimni aniqlaydi va
--  faqat o'shanga tegishli ma'lumotni qaytaradi; hammasi service_role
--  uchun. Narx so'rash ATAYLAB faqat menejerga ochiq — admin uchun
--  menejer narxi ko'rinmasligi kerak (diler modeli sharti).
-- =============================================================

-- ---------- 1. Mijozlarim ----------
create or replace function public.staff_customers_for_chat(
  p_chat_id bigint,
  p_search  text default null,
  p_limit   int  default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_q       text := nullif(trim(coalesce(p_search, '')), '');
  v_res     jsonb;
begin
  select p.role, p.org_id, p.manager_id
    into v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_role is null then return null; end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select c.id,
           c.name,
           c.phone,
           coalesce(b.balance, 0) as balance,
           (select max(o.created_at) from orders o where o.customer_id = c.id) as last_order_at
    from customers c
    left join customer_balances b on b.customer_id = c.id
    where c.is_active
      and (
        v_role = 'super_admin'
        or (v_role = 'admin'   and c.org_id     = v_org)
        or (v_role = 'manager' and c.manager_id = v_manager)
      )
      and (v_q is null or c.name ilike '%' || v_q || '%' or c.phone ilike '%' || v_q || '%')
    order by c.name
    limit least(coalesce(p_limit, 10), 20)
  ) t;

  return v_res;
end $$;

-- ---------- 2. Qarzdorlar ----------
create or replace function public.staff_debtors_for_chat(
  p_chat_id bigint,
  p_limit   int default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_res     jsonb;
begin
  select p.role, p.org_id, p.manager_id
    into v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_role is null then return null; end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select c.id, c.name, c.phone, b.balance
    from customers c
    join customer_balances b on b.customer_id = c.id
    where c.is_active
      and b.balance > 0
      and (
        v_role = 'super_admin'
        or (v_role = 'admin'   and c.org_id     = v_org)
        or (v_role = 'manager' and c.manager_id = v_manager)
      )
    order by b.balance desc
    limit least(coalesce(p_limit, 10), 20)
  ) t;

  return v_res;
end $$;

-- ---------- 3. Narx so'rash (faqat menejer) ----------
create or replace function public.staff_price_lookup_for_chat(
  p_chat_id     bigint,
  p_query       text,
  p_customer_id uuid default null,
  p_limit       int  default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role     text;
  v_manager  uuid;
  v_org      uuid;
  v_usd_rate numeric(14,2);
  v_q        text := nullif(trim(coalesce(p_query, '')), '');
  v_res      jsonb;
begin
  select p.role, p.manager_id, p.org_id
    into v_role, v_manager, v_org
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_role is null then return null; end if;

  -- Menejer narxi admin uchun ko'rinmaydi — bu shart butun modelning asosi
  if v_role <> 'manager' or v_manager is null then
    return jsonb_build_object('error', 'FAQAT_MENEJER_UCHUN');
  end if;
  if v_q is null then
    return jsonb_build_object('error', 'QIDIRUV_BOSH');
  end if;

  -- Mijoz berilgan bo'lsa, u SHU menejerniki bo'lishi shart
  if p_customer_id is not null
     and not exists (select 1 from customers c
                     where c.id = p_customer_id and c.manager_id = v_manager) then
    return jsonb_build_object('error', 'MIJOZ_SIZNIKI_EMAS');
  end if;

  select usd_rate into v_usd_rate from managers where id = v_manager;

  select jsonb_build_object('items', coalesce(jsonb_agg(t), '[]'::jsonb))
  into v_res
  from (
    select pd.name,
           pv.sku,
           pv.size,
           pv.color,
           coalesce(mcp.currency, mp.currency, 'UZS') as currency,
           -- So'mdagi qiymat: USD narx menejerning kursi bo'yicha o'giriladi
           (coalesce(
              case when mcp.currency = 'USD' then round(mcp.price * v_usd_rate) else mcp.price end,
              case when mp.currency  = 'USD' then round(mp.price  * v_usd_rate) else mp.price  end,
              pr.price
            ))::numeric(14,0) as price,
           case when coalesce(mcp.currency, mp.currency, 'UZS') = 'USD'
                then coalesce(mcp.price, mp.price) end as orig_price,
           (mcp.price is not null) as customer_price,
           coalesce(sl.qty - sl.reserved, 0) as available
    from product_variants pv
    join products pd on pd.id = pv.product_id and pd.is_active and pd.org_id = v_org
    left join prices pr
      on pr.variant_id = pv.id
     and pr.price_group_id = (
       select coalesce(
         (select c.price_group_id from customers c where c.id = p_customer_id),
         (select pg.id from price_groups pg where pg.org_id = v_org order by pg.name limit 1)
       )
     )
    left join manager_customer_prices mcp
      on p_customer_id is not null
     and mcp.manager_id = v_manager
     and mcp.customer_id = p_customer_id
     and mcp.variant_id = pv.id
    left join manager_prices mp
      on mp.manager_id = v_manager and mp.variant_id = pv.id
    left join stock_levels sl on sl.variant_id = pv.id
    where pv.is_active
      and (pd.name ilike '%' || v_q || '%' or pv.sku ilike '%' || v_q || '%')
    order by pd.name, pv.sku
    limit least(coalesce(p_limit, 8), 15)
  ) t;

  return v_res;
end $$;

revoke all on function public.staff_customers_for_chat(bigint, text, int) from anon, authenticated, public;
grant execute on function public.staff_customers_for_chat(bigint, text, int) to service_role;

revoke all on function public.staff_debtors_for_chat(bigint, int) from anon, authenticated, public;
grant execute on function public.staff_debtors_for_chat(bigint, int) to service_role;

revoke all on function public.staff_price_lookup_for_chat(bigint, text, uuid, int) from anon, authenticated, public;
grant execute on function public.staff_price_lookup_for_chat(bigint, text, uuid, int) to service_role;
