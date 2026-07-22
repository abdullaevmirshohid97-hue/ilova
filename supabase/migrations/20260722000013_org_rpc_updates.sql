-- =============================================================
-- ILOVA B2B — SaaS: RPC'larga org tekshiruvi
--
-- Bu funksiyalarning barchasi SECURITY DEFINER — ya'ni RLS'ni chetlab
-- o'tadi. Shuning uchun Part 2'da yozilgan RLS siyosatlariga ishonib
-- bo'lmaydi: har birining ICHIGA qo'lda org tekshiruvi qo'shiladi.
-- Mos kelmasa — mavjud naqsh bilan bir xil xato: RUXSAT_YOQ.
-- =============================================================

-- -------------------------------------------------------------
-- create_order (mijoz chaqiradi) — variant boshqa org'nikimi tekshiradi
-- -------------------------------------------------------------
create or replace function public.create_order(p_items jsonb, p_comment text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_group_id    uuid;
  v_org_id      uuid;
  v_order_id    uuid;
  v_total       numeric(14,0) := 0;
  v_item        record;
  v_price       numeric(14,0);
  v_available   bigint;
  v_item_org    uuid;
begin
  select p.customer_id, c.price_group_id, c.org_id
    into v_customer_id, v_group_id, v_org_id
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
-- confirm_order (faqat admin) — buyurtma boshqa org'nikimi tekshiradi
-- -------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item  record;
  v_org   uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  select org_id into v_org from customers where id = v_order.customer_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
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
-- cancel_order — admin yo'lida ham endi org tekshiruvi bor
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- set_order_status (faqat admin) — org tekshiruvi qo'shildi
-- -------------------------------------------------------------
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current text;
  v_cust_id uuid;
  v_org     uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_status not in ('picking', 'done') then
    raise exception 'NOTOGRI_HOLAT: %', p_status;
  end if;

  select status, customer_id into v_current, v_cust_id from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  select org_id into v_org from customers where id = v_cust_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  if (p_status = 'picking' and v_current <> 'confirmed')
     or (p_status = 'done' and v_current not in ('confirmed', 'picking')) then
    raise exception 'HOLAT_NOTOGRI: % -> %', v_current, p_status;
  end if;

  update orders set status = p_status where id = p_order_id;
end $$;

-- -------------------------------------------------------------
-- add_stock (faqat admin) — variant boshqa org'nikimi tekshiradi
-- -------------------------------------------------------------
create or replace function public.add_stock(
  p_variant_id  uuid,
  p_qty         int,
  p_note        text default null,
  p_created_at  timestamptz default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_when timestamptz := coalesce(p_created_at, now());
  v_org  uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'NOTOGRI_MIQDOR';
  end if;
  if v_when > now() then
    raise exception 'SANA_KELAJAKDA';
  end if;

  select pd.org_id into v_org
  from product_variants v join products pd on pd.id = v.product_id
  where v.id = p_variant_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into stock_movements (variant_id, qty, reason, note, created_by, created_at)
  values (p_variant_id, p_qty, 'production_in', p_note, auth.uid(), v_when);
end $$;

-- -------------------------------------------------------------
-- adjust_stock (faqat admin) — variant boshqa org'nikimi tekshiradi
-- -------------------------------------------------------------
create or replace function public.adjust_stock(p_variant_id uuid, p_qty int, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_qty is null or p_qty = 0 then
    raise exception 'NOTOGRI_MIQDOR';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'IZOH_MAJBURIY'; -- korreksiya doim izoh bilan (audit)
  end if;

  select pd.org_id into v_org
  from product_variants v join products pd on pd.id = v.product_id
  where v.id = p_variant_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into stock_movements (variant_id, qty, reason, note, created_by)
  values (p_variant_id, p_qty, 'adjustment', p_note, auth.uid());
end $$;

-- -------------------------------------------------------------
-- record_payment (faqat admin) — mijoz boshqa org'nikimi tekshiradi
-- -------------------------------------------------------------
create or replace function public.record_payment(
  p_customer_id uuid,
  p_amount      numeric,
  p_method      text,
  p_note        text default null,
  p_paid_at     timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_id uuid;
  v_when       timestamptz := coalesce(p_paid_at, now());
  v_org        uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'NOTOGRI_SUMMA';
  end if;
  if v_when > now() then
    raise exception 'SANA_KELAJAKDA';
  end if;

  select org_id into v_org from customers where id = p_customer_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into payments (customer_id, amount, method, note, created_by, created_at)
  values (p_customer_id, p_amount, p_method, p_note, auth.uid(), v_when)
  returning id into v_payment_id;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by, created_at)
  values (p_customer_id, -p_amount, 'payment', v_payment_id, p_note, auth.uid(), v_when);

  return v_payment_id;
end $$;

-- -------------------------------------------------------------
-- reverse_payment (faqat admin) — to'lov boshqa org'nikimi tekshiradi
-- -------------------------------------------------------------
create or replace function public.reverse_payment(p_payment_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payment record;
  v_already numeric;
  v_org     uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'IZOH_MAJBURIY';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'TOLOV_TOPILMADI';
  end if;

  select org_id into v_org from customers where id = v_payment.customer_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(sum(amount), 0) into v_already
  from ledger_entries
  where payment_id = p_payment_id and kind = 'adjustment';
  if v_already <> 0 then
    raise exception 'ALLAQACHON_STORNO_QILINGAN';
  end if;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by)
  values (v_payment.customer_id, v_payment.amount, 'adjustment', p_payment_id,
          'Storno: ' || p_note, auth.uid());
end $$;
