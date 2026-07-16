-- =============================================================
-- ILOVA B2B — Atomik biznes-funksiyalar (RPC)
-- Barcha yozish operatsiyalari FAQAT shu funksiyalar orqali.
-- Mijoz narxni o'zi qo'yolmaydi, qoldiq poyga holatida buzilmaydi.
-- =============================================================

-- -------------------------------------------------------------
-- 1. BUYURTMA YARATISH (mijoz chaqiradi)
-- Narx serverda, mijozning O'Z guruhidan olinadi va muzlatiladi.
-- p_items: [{"variant_id": "...", "qty": 500}, ...]
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
  v_stock       bigint;
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

  for v_item in
    select (e->>'variant_id')::uuid as variant_id, (e->>'qty')::int as qty
    from jsonb_array_elements(p_items) e
  loop
    if v_item.variant_id is null or v_item.qty is null or v_item.qty <= 0 then
      raise exception 'NOTOGRI_MIQDOR';
    end if;

    -- narx: faqat mijozning o'z guruhidan, faqat faol mahsulot
    select pr.price into v_price
    from prices pr
    join product_variants v on v.id = pr.variant_id and v.is_active
    join products pd on pd.id = v.product_id and pd.is_active
    where pr.variant_id = v_item.variant_id
      and pr.price_group_id = v_group_id;

    if v_price is null then
      raise exception 'NARX_TOPILMADI: variant %', v_item.variant_id;
    end if;

    select qty into v_stock from stock_levels where variant_id = v_item.variant_id;
    if coalesce(v_stock, 0) < v_item.qty then
      raise exception 'QOLDIQ_YETARLI_EMAS: variant %, bor: %',
        v_item.variant_id, coalesce(v_stock, 0);
    end if;

    insert into order_items (order_id, variant_id, qty, unit_price)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price);

    v_total := v_total + v_price * v_item.qty;
  end loop;

  update orders set total = v_total where id = v_order_id;
  return v_order_id;
end $$;

-- -------------------------------------------------------------
-- 2. BUYURTMANI TASDIQLASH (faqat admin) — ATOMIK
-- Qulf tartibi doim bir xil (variant_id bo'yicha) => deadlock imkonsiz.
-- Qoldiq yetmasa — butun tranzaksiya bekor, hech narsa o'zgarmaydi.
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

  -- qoldiq qatorlarini qulflab tekshiramiz (poyga holati yopiladi)
  for v_item in
    select oi.variant_id, oi.qty, sl.qty as stock
    from order_items oi
    join stock_levels sl on sl.variant_id = oi.variant_id
    where oi.order_id = p_order_id
    order by oi.variant_id
    for update of sl
  loop
    if v_item.stock < v_item.qty then
      raise exception 'QOLDIQ_YETARLI_EMAS: variant %, kerak: %, bor: %',
        v_item.variant_id, v_item.qty, v_item.stock;
    end if;
  end loop;

  -- ombordan chiqim (trigger stock_levels ni yangilaydi)
  insert into stock_movements (variant_id, qty, reason, order_id, created_by)
  select variant_id, -qty, 'order_out', p_order_id, auth.uid()
  from order_items where order_id = p_order_id;

  -- mijozga qarz yoziladi
  insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
  values (v_order.customer_id, v_order.total, 'order_debt', p_order_id, auth.uid());

  update orders set status = 'confirmed', confirmed_at = now()
  where id = p_order_id;
end $$;

-- -------------------------------------------------------------
-- 3. BUYURTMANI BEKOR QILISH
-- Mijoz: faqat o'zining 'new' buyurtmasini.
-- Admin: tasdiqlanganini ham — tovar omborga, qarz bekor qilinadi.
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

  if v_order.status in ('confirmed', 'picking') then
    insert into stock_movements (variant_id, qty, reason, order_id, created_by)
    select variant_id, qty, 'order_cancel_return', p_order_id, auth.uid()
    from order_items where order_id = p_order_id;

    insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
    values (v_order.customer_id, -v_order.total, 'cancel_reversal', p_order_id, auth.uid());
  end if;

  update orders set status = 'cancelled' where id = p_order_id;
end $$;

-- -------------------------------------------------------------
-- 4. BUYURTMA HOLATINI O'ZGARTIRISH (admin): yig'ilmoqda / yopildi
-- -------------------------------------------------------------
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_current text;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_status not in ('picking', 'done') then
    raise exception 'NOTOGRI_HOLAT: %', p_status;
  end if;

  select status into v_current from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if (p_status = 'picking' and v_current <> 'confirmed')
     or (p_status = 'done' and v_current not in ('confirmed', 'picking')) then
    raise exception 'HOLAT_NOTOGRI: % -> %', v_current, p_status;
  end if;

  update orders set status = p_status where id = p_order_id;
end $$;

-- -------------------------------------------------------------
-- 5. OMBORGA KIRIM (admin): ishlab chiqarishdan +30 000 dona
-- -------------------------------------------------------------
create or replace function public.add_stock(p_variant_id uuid, p_qty int, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'NOTOGRI_MIQDOR';
  end if;

  insert into stock_movements (variant_id, qty, reason, note, created_by)
  values (p_variant_id, p_qty, 'production_in', p_note, auth.uid());
end $$;

-- -------------------------------------------------------------
-- 6. OMBOR KORREKSIYASI (admin): inventarizatsiya farqi (+/-)
-- -------------------------------------------------------------
create or replace function public.adjust_stock(p_variant_id uuid, p_qty int, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
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

  insert into stock_movements (variant_id, qty, reason, note, created_by)
  values (p_variant_id, p_qty, 'adjustment', p_note, auth.uid());
end $$;

-- -------------------------------------------------------------
-- 7. TO'LOV QABUL QILISH (admin): qarz kamayadi
-- -------------------------------------------------------------
create or replace function public.record_payment(
  p_customer_id uuid,
  p_amount      numeric,
  p_method      text,
  p_note        text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'NOTOGRI_SUMMA';
  end if;

  insert into payments (customer_id, amount, method, note, created_by)
  values (p_customer_id, p_amount, p_method, p_note, auth.uid())
  returning id into v_payment_id;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by)
  values (p_customer_id, -p_amount, 'payment', v_payment_id, p_note, auth.uid());

  return v_payment_id;
end $$;

-- -------------------------------------------------------------
-- Ruxsatlar: anonim foydalanuvchi HECH NARSA chaqirolmaydi
-- -------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant execute on function public.create_order(jsonb, text)            to authenticated;
grant execute on function public.confirm_order(uuid)                  to authenticated;
grant execute on function public.cancel_order(uuid)                   to authenticated;
grant execute on function public.set_order_status(uuid, text)         to authenticated;
grant execute on function public.add_stock(uuid, int, text)           to authenticated;
grant execute on function public.adjust_stock(uuid, int, text)        to authenticated;
grant execute on function public.record_payment(uuid, numeric, text, text) to authenticated;
