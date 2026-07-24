-- =============================================================
-- YUKCHIBOLLA — menejer o'ziga mijoz yaratadi (admin bilmasin,
-- faqat ismi va menejerini ko'radi), buyurtma va dizayn buyurtma
-- yaratadi (dizayn buyurtma adminga to'liq ko'rinadi — bu ishlab
-- chiqarish uchun kerak, moliyaviy maxfiylik emas).
--
-- customers_masked — admin uchun telefon YASHIRILGAN ko'rinish, FAQAT
-- menejerga biriktirilgan mijozlarda (o'z menejeri buyurtma olib
-- boradi, admin mijozga to'g'ridan-to'g'ri chiqib ketmasin). Email
-- ATAYLAB yashirilmaydi — CustomerDetail'dagi umumiy "Saqlash" tugmasi
-- butun customer obyektini qayta yozadi, agar email ham yashirilsa
-- admin narsaga tegmasdan saqlasa ham haqiqiy email NULL bo'lib
-- o'chib ketardi (telefon esa alohida change_phone amali orqali
-- o'zgaradi, shu sabab bu xavf faqat email'da bor edi).
-- Menejerning o'zi (is_admin()=false) shu view orqali o'z mijozini
-- TO'LIQ (yashirmasdan) ko'radi — CASE shartidagi is_admin() faqat
-- admin kontekstida ishlaydi.
-- =============================================================

create view public.customers_masked as
select
  id, org_id, name,
  case when manager_id is not null and is_admin() then null else phone end as phone,
  email,
  address, region, price_group_id, manager_id, display_currency, photo_path, is_active, notes, created_at
from public.customers;

-- ---------- design_orders — menejer o'z mijozi uchun yarata oladi ----------
-- (admin ko'rish/yozish siyosati o'zgarmaydi — org ichidagi HAMMA dizayn
-- buyurtmani ko'radi, menejer yaratganini ham, chunki ishlab chiqarish
-- buni bilishi shart)
create policy "design_orders: manager write" on public.design_orders
  for all to authenticated
  using (is_manager() and customer_id in (select id from public.customers where manager_id = current_manager_id()))
  with check (is_manager() and customer_id in (select id from public.customers where manager_id = current_manager_id()));

-- ---------- admin_create_order — endi menejer ham (o'z mijozi uchun) chaqira oladi ----------
create or replace function public.admin_create_order(
  p_customer_id uuid,
  p_items       jsonb,
  p_comment     text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_group_id      uuid;
  v_org_id        uuid;
  v_manager_id    uuid;
  v_usd_rate      numeric(14,2);
  v_order_id      uuid;
  v_total         numeric(14,0) := 0;
  v_base_total    numeric(14,0) := 0;
  v_item          record;
  v_base_price    numeric(14,0);
  v_mgr_price     numeric(14,0);
  v_mgr_currency  text;
  v_cust_price    numeric(14,0);
  v_cust_currency text;
  v_price         numeric(14,0);
  v_currency      text;
  v_orig_price    numeric(14,0);
  v_available     bigint;
  v_item_org      uuid;
begin
  select price_group_id, org_id, manager_id into v_group_id, v_org_id, v_manager_id
  from customers
  where id = p_customer_id and is_active;

  if v_group_id is null then
    raise exception 'MIJOZ_TOPILMADI';
  end if;

  if is_admin() then
    if v_org_id is null or v_org_id <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  elsif is_manager() then
    if v_manager_id is null or v_manager_id <> current_manager_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    raise exception 'RUXSAT_YOQ';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'BOSH_BUYURTMA';
  end if;

  if v_manager_id is not null then
    select usd_rate into v_usd_rate from managers where id = v_manager_id;
  end if;

  insert into orders (customer_id, comment, created_by)
  values (p_customer_id, p_comment, auth.uid())
  returning id into v_order_id;

  for v_item in
    select (e->>'variant_id')::uuid as variant_id,
           (e->>'qty')::int as qty,
           coalesce((e->>'discount')::numeric(14,0), 0) as discount
    from jsonb_array_elements(p_items) e
    order by 1
  loop
    if v_item.variant_id is null or v_item.qty is null or v_item.qty <= 0 then
      raise exception 'NOTOGRI_MIQDOR';
    end if;
    if v_item.discount < 0 then
      raise exception 'NOTOGRI_SKIDKA';
    end if;

    select pd.org_id into v_item_org
    from product_variants v join products pd on pd.id = v.product_id
    where v.id = v_item.variant_id;
    if v_item_org is null or v_item_org <> v_org_id then
      raise exception 'RUXSAT_YOQ';
    end if;

    select pr.price into v_base_price
    from prices pr
    join product_variants v on v.id = pr.variant_id and v.is_active
    join products pd on pd.id = v.product_id and pd.is_active
    where pr.variant_id = v_item.variant_id
      and pr.price_group_id = v_group_id;

    if v_base_price is null then
      raise exception 'NARX_TOPILMADI: variant %', v_item.variant_id;
    end if;

    v_cust_price := null; v_cust_currency := null;
    v_mgr_price := null; v_mgr_currency := null;
    if v_manager_id is not null then
      select mcp.price, mcp.currency into v_cust_price, v_cust_currency
      from manager_customer_prices mcp
      where mcp.manager_id = v_manager_id
        and mcp.customer_id = p_customer_id
        and mcp.variant_id = v_item.variant_id;

      select mp.price, mp.currency into v_mgr_price, v_mgr_currency
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;

    if v_cust_price is not null then
      v_currency := v_cust_currency;
      v_orig_price := case when v_cust_currency = 'USD' then v_cust_price else null end;
      v_price := case when v_cust_currency = 'USD' then round(v_cust_price * v_usd_rate) else v_cust_price end;
    elsif v_mgr_price is not null then
      v_currency := v_mgr_currency;
      v_orig_price := case when v_mgr_currency = 'USD' then v_mgr_price else null end;
      v_price := case when v_mgr_currency = 'USD' then round(v_mgr_price * v_usd_rate) else v_mgr_price end;
    else
      v_currency := 'UZS';
      v_orig_price := null;
      v_price := v_base_price;
    end if;

    if v_item.discount > v_price then
      raise exception 'SKIDKA_NARXDAN_KATTA: variant %', v_item.variant_id;
    end if;

    select qty - reserved into v_available
    from stock_levels
    where variant_id = v_item.variant_id
    for update;

    if v_available is null or v_available < v_item.qty then
      raise exception 'QOLDIQ_YETARLI_EMAS: variant %, mavjud: %',
        v_item.variant_id, coalesce(v_available, 0);
    end if;

    update stock_levels
       set reserved = reserved + v_item.qty,
           updated_at = now()
     where variant_id = v_item.variant_id;

    insert into order_items (order_id, variant_id, qty, unit_price, base_price, discount, currency, orig_price)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price, v_item.discount, v_currency, v_orig_price);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
  end loop;

  update orders set total = v_total, base_total = v_base_total where id = v_order_id;
  return v_order_id;
end $$;
