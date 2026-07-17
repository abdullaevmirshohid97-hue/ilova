-- =============================================================
-- REZERVATSIYA MODELI (WB/Ozon/Uzum uslubi)
--
-- Muammo: qoldiq faqat admin tasdiqlaganda kamayardi. Mijoz
-- "Buyurtma berish" bosganda boshqalar hali ham eski qoldiqni
-- ko'rar edi — ikki mijoz bir tovarni "olishi" mumkin edi.
--
-- Yechim: uch xil son.
--   qty      — FIZIK qoldiq (omborda nechta yotibdi)
--   reserved — BAND qilingan (buyurtma berilgan, admin hali tasdiqlamagan)
--   mavjud   = qty - reserved  (mijozlar ko'radigan son)
--
-- Buyurtma berilganda:  reserved += n   -> hamma darhol kam ko'radi
-- Admin tasdiqlaganda:  reserved -= n, qty -= n (fizik chiqim + qarz)
-- Bekor qilinganda:     'new' bo'lsa reserved -= n (band yechiladi)
--                       tasdiqlangan bo'lsa qty += n (omborga qaytadi)
-- =============================================================

alter table public.stock_levels
  add column reserved bigint not null default 0,
  add constraint stock_levels_reserved_check check (reserved >= 0),
  add constraint stock_levels_available_check check (qty - reserved >= 0);

-- SaaS tayyorgarligi: super_admin roli (keyingi bosqichda to'liq multi-tenant)
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('super_admin','admin','customer'));

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  );
$$;

-- -------------------------------------------------------------
-- BUYURTMA YARATISH — endi darhol REZERV qiladi (atomik, qulf bilan)
-- -------------------------------------------------------------
create or replace function public.create_order(p_items jsonb, p_comment text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_group_id    uuid;
  v_order_id    uuid;
  v_total       numeric(14,0) := 0;
  v_item        record;
  v_price       numeric(14,0);
  v_available   bigint;
begin
  select p.customer_id, c.price_group_id
    into v_customer_id, v_group_id
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
-- TASDIQLASH — rezervni fizik chiqimga aylantiradi + qarz yozadi
-- -------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item  record;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;
  if v_order.status <> 'new' then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  -- qulflab rezervni tekshiramiz
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

  -- band yechiladi...
  update stock_levels sl
     set reserved = sl.reserved - oi.qty,
         updated_at = now()
    from order_items oi
   where oi.order_id = p_order_id
     and sl.variant_id = oi.variant_id;

  -- ...va fizik chiqim yoziladi (trigger qty ni kamaytiradi)
  insert into stock_movements (variant_id, qty, reason, order_id, created_by)
  select variant_id, -qty, 'order_out', p_order_id, auth.uid()
  from order_items where order_id = p_order_id;

  -- mijozga qarz
  insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
  values (v_order.customer_id, v_order.total, 'order_debt', p_order_id, auth.uid());

  update orders set status = 'confirmed', confirmed_at = now()
  where id = p_order_id;
end $$;

-- -------------------------------------------------------------
-- BEKOR QILISH — 'new' bo'lsa band yechiladi, tasdiqlangan bo'lsa qaytadi
-- -------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if not is_admin() then
    if v_order.customer_id is distinct from current_customer_id()
       or v_order.status <> 'new' then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  if v_order.status in ('cancelled', 'done') then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  if v_order.status = 'new' then
    -- bandni bo'shatamiz (0005 dan oldingi eski buyurtmalar uchun greatest)
    update stock_levels sl
       set reserved = greatest(sl.reserved - oi.qty, 0),
           updated_at = now()
      from order_items oi
     where oi.order_id = p_order_id
       and sl.variant_id = oi.variant_id;
  else
    -- tasdiqlangan edi: tovar omborga qaytadi, qarz bekor bo'ladi
    insert into stock_movements (variant_id, qty, reason, order_id, created_by)
    select variant_id, qty, 'order_cancel_return', p_order_id, auth.uid()
    from order_items where order_id = p_order_id;

    insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
    values (v_order.customer_id, -v_order.total, 'cancel_reversal', p_order_id, auth.uid());
  end if;

  update orders set status = 'cancelled' where id = p_order_id;
end $$;
