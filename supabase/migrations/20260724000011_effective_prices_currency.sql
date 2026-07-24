-- =============================================================
-- YUKCHIBOLLA — my_effective_prices() endi valyuta/asl summani ham
-- qaytaradi. Avval faqat so'mdagi yakuniy narxni qaytarardi — mijoz
-- display_currency='USD' bo'lsa ham, katalog buni dollarda ko'rsata
-- olmasdi, chunki qaysi valyutada ekanini bilmasdi.
-- =============================================================

drop function if exists public.my_effective_prices();

create or replace function public.my_effective_prices()
returns table(variant_id uuid, price numeric(14,0), currency text, orig_price numeric(14,2))
language plpgsql stable security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_group_id    uuid;
  v_manager_id  uuid;
  v_usd_rate    numeric(14,2);
begin
  select p.customer_id, c.price_group_id, c.manager_id
    into v_customer_id, v_group_id, v_manager_id
  from profiles p
  join customers c on c.id = p.customer_id and c.is_active
  where p.id = auth.uid();

  if v_customer_id is null then
    return;
  end if;

  if v_manager_id is not null then
    select usd_rate into v_usd_rate from managers where id = v_manager_id;
  end if;

  return query
  select
    pr.variant_id,
    (coalesce(
      case when mcp.currency = 'USD' then round(mcp.price * v_usd_rate) else mcp.price end,
      case when mp.currency = 'USD' then round(mp.price * v_usd_rate) else mp.price end,
      pr.price
    ))::numeric(14,0) as price,
    coalesce(mcp.currency, mp.currency, 'UZS') as currency,
    case
      when coalesce(mcp.currency, mp.currency, 'UZS') = 'USD'
      then coalesce(mcp.price, mp.price)
      else null
    end as orig_price
  from prices pr
  left join manager_customer_prices mcp
    on v_manager_id is not null
   and mcp.manager_id = v_manager_id
   and mcp.customer_id = v_customer_id
   and mcp.variant_id = pr.variant_id
  left join manager_prices mp
    on v_manager_id is not null
   and mp.manager_id = v_manager_id
   and mp.variant_id = pr.variant_id
  where pr.price_group_id = v_group_id;
end $$;
