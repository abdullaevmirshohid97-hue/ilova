-- =============================================================
-- YUKCHIBOLLA — menejer uchun mijozga alohida narx
--
-- Menejer endi ikki xil narx qo'ya oladi:
--   1) Umumiy narx (manager_prices) — barcha mijozlariga bir xil
--   2) Mijozga xos narx (manager_customer_prices) — faqat o'sha
--      bitta mijozga, umumiy narxdan ustun turadi
-- Narx ustuvorligi: mijozga xos > menejerning umumiy narxi > baza narx.
-- manager_customer_prices ham manager_prices kabi FAQAT egasi (shu
-- menejer) uchun RLS orqali ochiq — admin/direktor uchun policy yo'q.
-- =============================================================

create table public.manager_customer_prices (
  id          uuid primary key default gen_random_uuid(),
  manager_id  uuid not null references public.managers(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  price       numeric(14,0) not null check (price >= 0),
  updated_at  timestamptz not null default now(),
  unique (manager_id, customer_id, variant_id)
);
create index manager_customer_prices_lookup_idx
  on public.manager_customer_prices(manager_id, customer_id);

alter table public.manager_customer_prices enable row level security;

create policy "manager_customer_prices: own all" on public.manager_customer_prices
  for all to authenticated
  using (
    manager_id = public.current_manager_id()
    and customer_id in (select id from public.customers where manager_id = public.current_manager_id())
  )
  with check (
    manager_id = public.current_manager_id()
    and customer_id in (select id from public.customers where manager_id = public.current_manager_id())
  );

create trigger trg_manager_customer_prices_updated_at
  before update on public.manager_customer_prices
  for each row execute function public.tg_set_updated_at();

-- Menejer o'ziga biriktirilgan mijozlar ro'yxatini ko'ra olishi kerak
-- (mijozni tanlab, unga alohida narx qo'yish uchun)
create policy "customers: own manager read" on public.customers
  for select to authenticated
  using (manager_id = public.current_manager_id());

-- ---------- create_order — mijozga xos narx eng ustuvor ----------
create or replace function public.create_order(p_items jsonb, p_comment text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_group_id    uuid;
  v_org_id      uuid;
  v_manager_id  uuid;
  v_order_id    uuid;
  v_total       numeric(14,0) := 0;
  v_base_total  numeric(14,0) := 0;
  v_item        record;
  v_base_price  numeric(14,0);
  v_mgr_price   numeric(14,0);
  v_cust_price  numeric(14,0);
  v_price       numeric(14,0);
  v_available   bigint;
  v_item_org    uuid;
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

    v_cust_price := null;
    v_mgr_price := null;
    if v_manager_id is not null then
      select mcp.price into v_cust_price
      from manager_customer_prices mcp
      where mcp.manager_id = v_manager_id
        and mcp.customer_id = v_customer_id
        and mcp.variant_id = v_item.variant_id;

      select mp.price into v_mgr_price
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;
    v_price := coalesce(v_cust_price, v_mgr_price, v_base_price);

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

-- ---------- admin_create_order — mijozga xos narx eng ustuvor ----------
create or replace function public.admin_create_order(
  p_customer_id uuid,
  p_items       jsonb,
  p_comment     text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_group_id   uuid;
  v_org_id     uuid;
  v_manager_id uuid;
  v_order_id   uuid;
  v_total      numeric(14,0) := 0;
  v_base_total numeric(14,0) := 0;
  v_item       record;
  v_base_price numeric(14,0);
  v_mgr_price  numeric(14,0);
  v_cust_price numeric(14,0);
  v_price      numeric(14,0);
  v_available  bigint;
  v_item_org   uuid;
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

    v_cust_price := null;
    v_mgr_price := null;
    if v_manager_id is not null then
      select mcp.price into v_cust_price
      from manager_customer_prices mcp
      where mcp.manager_id = v_manager_id
        and mcp.customer_id = p_customer_id
        and mcp.variant_id = v_item.variant_id;

      select mp.price into v_mgr_price
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;
    v_price := coalesce(v_cust_price, v_mgr_price, v_base_price);

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
