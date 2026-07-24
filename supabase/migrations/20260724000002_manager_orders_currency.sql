-- =============================================================
-- YUKCHIBOLLA — menejer: baza narxni ko'rish, valyutada narx qo'yish,
-- o'z mijozlarining buyurtmalarini ko'rish/boshqarish + admin/menejer
-- uchun mavjud buyurtmani tahrirlash (faqat "yangi" holatda).
-- =============================================================

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

-- ---------- 1. Menejer baza narxni (Standart/mijozning tarifi) ko'ra oladi ----------
-- Qo'shimcha (additiv) siyosat — mavjud "prices: own group only" /
-- "price_groups: read own" siyosatlarini o'zgartirmaydi, faqat menejer
-- uchun yana bir ruxsat yo'lini qo'shadi (Postgres bir nechta permissive
-- siyosatni OR bilan birlashtiradi).
create policy "prices: manager read" on public.prices
  for select to authenticated
  using (is_manager() and price_group_id in (select id from public.price_groups where org_id = current_org_id()));

create policy "price_groups: manager read" on public.price_groups
  for select to authenticated
  using (is_manager() and org_id = current_org_id());

-- ---------- 2. Valyuta: menejerning o'z kursi + narxlarga valyuta belgisi ----------
alter table public.managers
  add column usd_rate numeric(14,2) not null default 12700 check (usd_rate > 0);

alter table public.manager_prices
  add column currency text not null default 'UZS' check (currency in ('UZS', 'USD'));

alter table public.manager_customer_prices
  add column currency text not null default 'UZS' check (currency in ('UZS', 'USD'));

-- ---------- 3. Menejer o'z mijozlarining buyurtmalarini ko'ra oladi ----------
create policy "orders: manager read" on public.orders
  for select to authenticated
  using (customer_id in (select id from public.customers where manager_id = public.current_manager_id()));

create policy "order_items: manager read" on public.order_items
  for select to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.manager_id = public.current_manager_id()
    )
  );

-- ---------- 4. create_order — valyuta konversiyasi bilan ----------
create or replace function public.create_order(p_items jsonb, p_comment text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_customer_id   uuid;
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
  v_available     bigint;
  v_item_org      uuid;
begin
  select p.customer_id, c.price_group_id, c.org_id, c.manager_id
    into v_customer_id, v_group_id, v_org_id, v_manager_id
  from profiles p
  join customers c on c.id = p.customer_id and c.is_active
  where p.id = auth.uid();

  if v_customer_id is null then
    raise exception 'FAOL_MIJOZ_EMAS';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'BOSH_BUYURTMA';
  end if;

  if v_manager_id is not null then
    select usd_rate into v_usd_rate from managers where id = v_manager_id;
  end if;

  insert into orders (customer_id, comment, created_by)
  values (v_customer_id, p_comment, auth.uid())
  returning id into v_order_id;

  for v_item in
    select (e->>'variant_id')::uuid as variant_id, (e->>'qty')::int as qty
    from jsonb_array_elements(p_items) e
    order by 1
  loop
    if v_item.variant_id is null or v_item.qty is null or v_item.qty <= 0 then
      raise exception 'NOTOGRI_MIQDOR';
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
        and mcp.customer_id = v_customer_id
        and mcp.variant_id = v_item.variant_id;

      select mp.price, mp.currency into v_mgr_price, v_mgr_currency
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;

    if v_cust_price is not null then
      v_price := case when v_cust_currency = 'USD' then round(v_cust_price * v_usd_rate) else v_cust_price end;
    elsif v_mgr_price is not null then
      v_price := case when v_mgr_currency = 'USD' then round(v_mgr_price * v_usd_rate) else v_mgr_price end;
    else
      v_price := v_base_price;
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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price);

    v_total := v_total + v_price * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
  end loop;

  update orders set total = v_total, base_total = v_base_total where id = v_order_id;
  return v_order_id;
end $$;

-- ---------- 5. admin_create_order — valyuta konversiyasi bilan ----------
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
  v_available     bigint;
  v_item_org      uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select price_group_id, org_id, manager_id into v_group_id, v_org_id, v_manager_id
  from customers
  where id = p_customer_id and is_active;

  if v_group_id is null then
    raise exception 'MIJOZ_TOPILMADI';
  end if;
  if v_org_id is null or v_org_id <> current_org_id() then
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
      v_price := case when v_cust_currency = 'USD' then round(v_cust_price * v_usd_rate) else v_cust_price end;
    elsif v_mgr_price is not null then
      v_price := case when v_mgr_currency = 'USD' then round(v_mgr_price * v_usd_rate) else v_mgr_price end;
    else
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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price, discount)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price, v_item.discount);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
  end loop;

  update orders set total = v_total, base_total = v_base_total where id = v_order_id;
  return v_order_id;
end $$;

-- ---------- 6. confirm_order/cancel_order/set_order_status — menejer o'z mijozi uchun ----------
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item  record;
  v_org   uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if is_admin() then
    select org_id into v_org from customers where id = v_order.customer_id;
    if v_org is null or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  elsif is_manager() then
    if not exists (
      select 1 from customers where id = v_order.customer_id and manager_id = current_manager_id()
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    raise exception 'RUXSAT_YOQ';
  end if;

  if v_order.status <> 'new' then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  for v_item in
    select oi.variant_id, oi.qty, sl.reserved
    from order_items oi
    join stock_levels sl on sl.variant_id = oi.variant_id
    where oi.order_id = p_order_id
    order by oi.variant_id
    for update of sl
  loop
    if v_item.reserved < v_item.qty then
      raise exception 'REZERV_XATO: variant %', v_item.variant_id;
    end if;
  end loop;

  update stock_levels sl
     set reserved = sl.reserved - oi.qty,
         updated_at = now()
    from order_items oi
   where oi.order_id = p_order_id
     and sl.variant_id = oi.variant_id;

  insert into stock_movements (variant_id, qty, reason, order_id, created_by)
  select variant_id, -qty, 'order_out', p_order_id, auth.uid()
  from order_items where order_id = p_order_id;

  insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
  values (v_order.customer_id, v_order.total, 'order_debt', p_order_id, auth.uid());

  update orders set status = 'confirmed', confirmed_at = now()
  where id = p_order_id;
end $$;

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_org   uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if is_admin() then
    select org_id into v_org from customers where id = v_order.customer_id;
    if v_org is null or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  elsif is_manager() then
    if not exists (
      select 1 from customers where id = v_order.customer_id and manager_id = current_manager_id()
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    if v_order.customer_id is distinct from current_customer_id()
       or v_order.status <> 'new' then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  if v_order.status in ('cancelled', 'done') then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  if v_order.status = 'new' then
    update stock_levels sl
       set reserved = greatest(sl.reserved - oi.qty, 0),
           updated_at = now()
      from order_items oi
     where oi.order_id = p_order_id
       and sl.variant_id = oi.variant_id;
  else
    insert into stock_movements (variant_id, qty, reason, order_id, created_by)
    select variant_id, qty, 'order_cancel_return', p_order_id, auth.uid()
    from order_items where order_id = p_order_id;

    insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
    values (v_order.customer_id, -v_order.total, 'cancel_reversal', p_order_id, auth.uid());
  end if;

  update orders set status = 'cancelled' where id = p_order_id;
end $$;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current text;
  v_cust_id uuid;
  v_org     uuid;
begin
  if p_status not in ('picking', 'done') then
    raise exception 'NOTOGRI_HOLAT: %', p_status;
  end if;

  select status, customer_id into v_current, v_cust_id from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if is_admin() then
    select org_id into v_org from customers where id = v_cust_id;
    if v_org is null or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  elsif is_manager() then
    if not exists (
      select 1 from customers where id = v_cust_id and manager_id = current_manager_id()
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    raise exception 'RUXSAT_YOQ';
  end if;

  if (p_status = 'picking' and v_current <> 'confirmed')
     or (p_status = 'done' and v_current not in ('confirmed', 'picking')) then
    raise exception 'HOLAT_NOTOGRI: % -> %', v_current, p_status;
  end if;

  update orders set status = p_status where id = p_order_id;
end $$;

-- ---------- 7. edit_order_items — admin yoki menejer, faqat "yangi" buyurtmani ----------
-- Eski bandlar bo'shatiladi, qatorlar butunlay almashtiriladi, narx/band
-- qaytadan hisoblanadi (create_order bilan bir xil narx ustuvorligi va
-- valyuta konversiyasi). Faqat status='new' bo'lganda ishlaydi — tasdiqlangan
-- buyurtmaga tegilmaydi (fizik chiqim/qarz allaqachon yozilgan bo'ladi).
create or replace function public.edit_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order         record;
  v_org           uuid;
  v_manager_id    uuid;
  v_group_id      uuid;
  v_usd_rate      numeric(14,2);
  v_authorized    boolean := false;
  v_total         numeric(14,0) := 0;
  v_base_total    numeric(14,0) := 0;
  v_item          record;
  v_base_price    numeric(14,0);
  v_mgr_price     numeric(14,0);
  v_mgr_currency  text;
  v_cust_price    numeric(14,0);
  v_cust_currency text;
  v_price         numeric(14,0);
  v_available     bigint;
  v_item_org      uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;
  if v_order.status <> 'new' then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  select org_id, price_group_id, manager_id into v_org, v_group_id, v_manager_id
  from customers where id = v_order.customer_id;

  if is_admin() then
    if v_org is null or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
    v_authorized := true;
  elsif is_manager() then
    if v_manager_id is not null and v_manager_id = current_manager_id() then
      v_authorized := true;
    end if;
  end if;
  if not v_authorized then
    raise exception 'RUXSAT_YOQ';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'BOSH_BUYURTMA';
  end if;

  if v_manager_id is not null then
    select usd_rate into v_usd_rate from managers where id = v_manager_id;
  end if;

  -- eski bandlar bo'shatiladi, qatorlar o'chiriladi (bitta tranzaksiyada
  -- qaytadan to'liq quriladi — qisman "diff" hisoblashdan qochish uchun)
  update stock_levels sl
     set reserved = greatest(sl.reserved - oi.qty, 0),
         updated_at = now()
    from order_items oi
   where oi.order_id = p_order_id
     and sl.variant_id = oi.variant_id;

  delete from order_items where order_id = p_order_id;

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
    if v_item_org is null or v_item_org <> v_org then
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
        and mcp.customer_id = v_order.customer_id
        and mcp.variant_id = v_item.variant_id;

      select mp.price, mp.currency into v_mgr_price, v_mgr_currency
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;

    if v_cust_price is not null then
      v_price := case when v_cust_currency = 'USD' then round(v_cust_price * v_usd_rate) else v_cust_price end;
    elsif v_mgr_price is not null then
      v_price := case when v_mgr_currency = 'USD' then round(v_mgr_price * v_usd_rate) else v_mgr_price end;
    else
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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price, discount)
    values (p_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price, v_item.discount);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
  end loop;

  update orders set total = v_total, base_total = v_base_total where id = p_order_id;
end $$;
