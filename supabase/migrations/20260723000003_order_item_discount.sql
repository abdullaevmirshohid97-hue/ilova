-- =============================================================
-- YUKCHIBOLLA — admin buyurtmasida donaga nisbatan skidka
--
-- order_items.discount — bitta donaga qo'llanilgan skidka summasi
-- (so'mda), muzlatilgan unit_price kabi buyurtma paytida yoziladi.
-- Qatordagi jami: (unit_price - discount) * qty.
-- admin_create_order p_items endi ixtiyoriy "discount" maydonini
-- qabul qiladi (bermasa 0). Faqat admin skidka bera oladi — oddiy
-- create_order (mijozning o'zi) o'zgarmadi, discount har doim 0.
-- =============================================================

alter table public.order_items
  add column discount numeric(14,0) not null default 0 check (discount >= 0);

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

    select pr.price into v_price
    from prices pr
    join product_variants v on v.id = pr.variant_id and v.is_active
    join products pd on pd.id = v.product_id and pd.is_active
    where pr.variant_id = v_item.variant_id
      and pr.price_group_id = v_group_id;

    if v_price is null then
      raise exception 'NARX_TOPILMADI: variant %', v_item.variant_id;
    end if;
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

    insert into order_items (order_id, variant_id, qty, unit_price, discount)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_item.discount);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
  end loop;

  update orders set total = v_total where id = v_order_id;
  return v_order_id;
end $$;
