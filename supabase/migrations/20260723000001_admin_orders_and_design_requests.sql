-- =============================================================
-- YUKCHIBOLLA — Admin mijoz nomidan buyurtma + shaxsiy dizayn so'rovlari
--
-- 1) admin_create_order: create_order bilan bir xil mantiq, lekin
--    mijozni auth.uid()'dan emas, admin bergan p_customer_id'dan oladi
--    (admin qo'ng'iroq/vatsap orqali kelgan buyurtmani mijoz nomidan
--    kiritishi uchun).
-- 2) design_orders: katalogdagi mahsulotlarga aloqasi yo'q, individual
--    logoli qadoqlash (karopka+sumka) buyurtmalarini kuzatish uchun
--    alohida jadval — o'lcham, materiallar, bosma turi, narx, to'lov.
-- =============================================================

create or replace function public.admin_create_order(
  p_customer_id uuid,
  p_items       jsonb,
  p_comment     text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_group_id  uuid;
  v_org_id    uuid;
  v_order_id  uuid;
  v_total     numeric(14,0) := 0;
  v_item      record;
  v_price     numeric(14,0);
  v_available bigint;
  v_item_org  uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select price_group_id, org_id into v_group_id, v_org_id
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

  -- variantlar DOIM bir xil tartibda qulflanadi (deadlock oldini olish)
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

    select pr.price into v_price
    from prices pr
    join product_variants v on v.id = pr.variant_id and v.is_active
    join products pd on pd.id = v.product_id and pd.is_active
    where pr.variant_id = v_item.variant_id
      and pr.price_group_id = v_group_id;

    if v_price is null then
      raise exception 'NARX_TOPILMADI: variant %', v_item.variant_id;
    end if;

    -- qulflab, mavjudni tekshirib, BAND qilamiz
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

    insert into order_items (order_id, variant_id, qty, unit_price)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price);

    v_total := v_total + v_price * v_item.qty;
  end loop;

  update orders set total = v_total where id = v_order_id;
  return v_order_id;
end $$;

-- -------------------------------------------------------------
-- design_orders — shaxsiy logoli qadoqlash (karopka/sumka) so'rovlari
-- -------------------------------------------------------------
create table public.design_orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default current_org_id() references public.organizations(id),
  customer_id       uuid not null references public.customers(id),
  size              text,                    -- o'lcham
  bottom_material   text,                    -- karopka tag qismi (masalan "Gofra 300gr")
  top_material      text,                    -- karopka ustki qismi (masalan "Karton 300/350gr")
  bag_material      text,                    -- sumka qog'ozi turi
  rope_color        text,                    -- sumka ipi (dastagi) rangi
  print_type        text check (print_type in ('tesneniya', 'oddiy')),
  qty               integer not null default 1 check (qty > 0),
  unit_price        numeric(14,0) not null default 0 check (unit_price >= 0),
  advance_amount    numeric(14,0) not null default 0 check (advance_amount >= 0),
  is_fully_paid     boolean not null default false,
  payment_due_date  date,                    -- qolgan pul uchun sana
  ready_date        date,                    -- tayyor bo'lish sanasi
  notes             text,
  status            text not null default 'new'
                     check (status in ('new','in_production','ready','delivered','cancelled')),
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index design_orders_org_idx on public.design_orders(org_id);
create index design_orders_customer_idx on public.design_orders(customer_id);

alter table public.design_orders enable row level security;

create policy "design_orders: admin all" on public.design_orders
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

create trigger trg_design_orders_updated_at
  before update on public.design_orders
  for each row execute function public.tg_set_updated_at();
