-- =============================================================
-- YUKCHIBOLLA — Menejerlar moduli ("erkin diler" modeli)
--
-- Menejer kompaniyaning bazaviy narxidan (price_groups/prices)
-- mustaqil ravishda o'zining narxini qo'yadi va shu narx bo'yicha
-- o'ziga biriktirilgan mijozlarga sotadi — ustama (menejer narxi -
-- baza narxi) menejerning o'z daromadi. manager_prices jadvaliga
-- FAQAT egasi (shu menejer) kira oladi — admin/super_admin uchun
-- ham policy yo'q (RLS orqali yopiq), faqat security-definer
-- RPC'lar ichkarida narxni hisoblab, mijozga to'g'ri narxni beradi.
--
-- order_items/orders'da endi ikkita summa bor:
--   unit_price / total       — HAQIQIY (mijoz to'laydigan, qarz/
--                               ledger shu bo'yicha yuritiladi)
--   base_price / base_total  — RASMIY (admin panelida ko'rsatiladi,
--                               har doim price_group narxi)
-- Menejer biriktirilmagan mijozlarda ikkalasi bir xil bo'ladi.
-- =============================================================

-- ---------- 1. managers jadvali ----------
create table public.managers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null,
  phone      text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);
create index managers_org_idx on public.managers(org_id);

alter table public.managers enable row level security;

create policy "managers: admin all" on public.managers
  for all to authenticated
  using (is_admin() and org_id = current_org_id())
  with check (is_admin() and org_id = current_org_id());

-- ---------- 2. profiles: manager_id + rol kengaytirildi ----------
alter table public.profiles
  add column manager_id uuid references public.managers(id) on delete set null;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('super_admin','admin','customer','manager'));

create or replace function public.current_manager_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select manager_id from public.profiles where id = auth.uid();
$$;

create policy "managers: self read" on public.managers
  for select to authenticated
  using (id = public.current_manager_id());

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_customer_id uuid := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  v_manager_id  uuid := nullif(new.raw_user_meta_data->>'manager_id', '')::uuid;
  v_org_id      uuid := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  v_role        text := coalesce(new.raw_user_meta_data->>'role', 'customer');
begin
  if v_customer_id is not null then
    select org_id into v_org_id from public.customers where id = v_customer_id;
  end if;
  if v_manager_id is not null then
    select org_id into v_org_id from public.managers where id = v_manager_id;
  end if;

  insert into public.profiles (id, full_name, customer_id, manager_id, org_id, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), v_customer_id, v_manager_id, v_org_id, v_role);
  return new;
end $$;

-- ---------- 3. customers: manager_id (mijoz yaratilganda biriktiriladi) ----------
alter table public.customers
  add column manager_id uuid references public.managers(id) on delete set null;

-- ---------- 4. manager_prices — menejerning o'z narxlari (mahsulot bo'yicha, mijozdan qat'i nazar) ----------
create table public.manager_prices (
  id         uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.managers(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  price      numeric(14,0) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  unique (manager_id, variant_id)
);

alter table public.manager_prices enable row level security;

-- Faqat menejerning o'zi — admin/direktor uchun ATAYLAB policy yo'q
create policy "manager_prices: own all" on public.manager_prices
  for all to authenticated
  using (manager_id = public.current_manager_id())
  with check (manager_id = public.current_manager_id());

create trigger trg_manager_prices_updated_at
  before update on public.manager_prices
  for each row execute function public.tg_set_updated_at();

-- ---------- 5. order_items / orders: rasmiy (base) va haqiqiy summa ajratiladi ----------
alter table public.order_items add column base_price numeric(14,0);
update public.order_items set base_price = unit_price where base_price is null;
alter table public.order_items alter column base_price set not null;
alter table public.order_items add constraint order_items_base_price_check check (base_price >= 0);

alter table public.orders add column base_total numeric(14,0) not null default 0;
update public.orders set base_total = total where base_total = 0;

-- ---------- 6. create_order — mijoz o'zi (mobil ilova) buyurtma berganda ----------
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

    select pr.price into v_base_price
    from prices pr
    join product_variants v on v.id = pr.variant_id and v.is_active
    join products pd on pd.id = v.product_id and pd.is_active
    where pr.variant_id = v_item.variant_id
      and pr.price_group_id = v_group_id;

    if v_base_price is null then
      raise exception 'NARX_TOPILMADI: variant %', v_item.variant_id;
    end if;

    -- menejerga biriktirilgan mijoz bo'lsa — menejer narxi ustunlik qiladi
    v_mgr_price := null;
    if v_manager_id is not null then
      select mp.price into v_mgr_price
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;
    v_price := coalesce(v_mgr_price, v_base_price);

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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price);

    v_total := v_total + v_price * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
  end loop;

  update orders set total = v_total, base_total = v_base_total where id = v_order_id;
  return v_order_id;
end $$;

-- ---------- 7. admin_create_order — admin mijoz nomidan (+ skidka, + menejer narxi) ----------
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

    v_mgr_price := null;
    if v_manager_id is not null then
      select mp.price into v_mgr_price
      from manager_prices mp
      where mp.manager_id = v_manager_id and mp.variant_id = v_item.variant_id;
    end if;
    v_price := coalesce(v_mgr_price, v_base_price);

    if v_item.discount > v_price then
      raise exception 'SKIDKA_NARXDAN_KATTA: variant %', v_item.variant_id;
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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price, discount)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price, v_item.discount);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
  end loop;

  update orders set total = v_total, base_total = v_base_total where id = v_order_id;
  return v_order_id;
end $$;
