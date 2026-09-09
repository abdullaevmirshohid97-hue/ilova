-- =============================================================
-- YUKCHIBOLLA — yashirin mijozga admin pul yoza olardi (TESHIK)
--
-- tests/menejer-hisob.mjs topdi: menejer mijozlarini yashirgan
-- bo'lsa ham, admin record_payment() bilan o'sha mijozga to'lov
-- yozib yubora olardi.
--
-- SABAB — qo'llanmadagi eski tuzoqning yangi ko'rinishi:
-- SECURITY DEFINER funksiya RLS'ni chetlab o'tadi, ya'ni HAR BIR
-- filtr qo'lda yozilishi kerak. Bu yerda org filtri bor edi:
--
--     select org_id into v_org from customers where id = p_customer_id;
--     if v_org <> current_org_id() then raise 'RUXSAT_YOQ'; end if;
--
-- lekin KO'RINISH filtri yo'q edi. Yashirin mijoz o'sha org'da
-- turadi, demak tekshiruvdan o'tib ketardi.
--
-- Oqibati: admin ekranida ko'rinmaydigan mijozga pul yozilardi.
-- Summa menejerning daftariga tushib, korxonada izsiz qolardi va
-- buni faqat oy oxirida hisob to'g'ri kelmaganda sezilardi.
--
-- Buyurtma holatiga tegadigan funksiyalar (confirm_order,
-- cancel_order, set_order_status) ATAYLAB ochiq qoladi: tovarni
-- korxona jo'natadi, ya'ni buyurtmani u tasdiqlashi SHART.
-- =============================================================

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
  v_mijoz      record;
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

  select org_id, manager_id into v_mijoz from customers where id = p_customer_id;
  if v_mijoz.org_id is null or v_mijoz.org_id <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;
  -- Yashirin mijoz korxona uchun mavjud emas: u bilan hisob-kitobni
  -- menejer yuritadi (menejer_tolov)
  if not mijoz_korinadimi(v_mijoz.manager_id) then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into payments (customer_id, amount, method, note, created_by, created_at)
  values (p_customer_id, p_amount, p_method, p_note, auth.uid(), v_when)
  returning id into v_payment_id;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by, created_at)
  values (p_customer_id, -p_amount, 'payment', v_payment_id, p_note, auth.uid(), v_when);

  return v_payment_id;
end $$;

create or replace function public.reverse_payment(p_payment_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payment record;
  v_already numeric;
  v_mijoz   record;
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

  select org_id, manager_id into v_mijoz from customers where id = v_payment.customer_id;
  if v_mijoz.org_id is null or v_mijoz.org_id <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if not mijoz_korinadimi(v_mijoz.manager_id) then
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

-- admin_create_order — admin ko'rmaydigan mijozga buyurtma
-- yarata olmasin. Menejer shoxi tegilmaydi: u o'z mijoziga
-- buyurtma yaratadi va bu yashirin holatda ham to'g'ri.
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
  v_korinish      text;
  v_disp_val      text;
  v_order_id      uuid;
  v_total         numeric(14,0) := 0;
  v_base_total    numeric(14,0) := 0;
  v_disp_total    numeric(14,2) := 0;
  v_item          record;
  v_base_price    numeric(14,0);
  v_mgr_price     numeric(14,2);
  v_mgr_currency  text;
  v_cust_price    numeric(14,2);
  v_cust_currency text;
  v_price         numeric(14,0);
  v_currency      text;
  v_orig_price    numeric(14,2);
  v_disp_price    numeric(14,2);
  v_disp_chegirma numeric(14,2);
  v_available     bigint;
  v_item_org      uuid;
begin
  select price_group_id, org_id, manager_id, display_currency
    into v_group_id, v_org_id, v_manager_id, v_korinish
  from customers
  where id = p_customer_id and is_active;

  if v_group_id is null then
    raise exception 'MIJOZ_TOPILMADI';
  end if;

  if is_admin() then
    if v_org_id is null or v_org_id <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
    -- Admin ko'rmaydigan mijozga buyurtma yarata olmaydi
    if not mijoz_korinadimi(v_manager_id) then
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
  v_disp_val := korinish_valyutasi(v_korinish, v_usd_rate);

  insert into orders (customer_id, comment, created_by, disp_currency)
  values (p_customer_id, p_comment, auth.uid(), v_disp_val)
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

    v_disp_price := korinish_narxi(v_price, v_currency, v_orig_price, v_korinish, v_usd_rate);
    v_disp_chegirma := korinish_narxi(v_item.discount, 'UZS', null, v_korinish, v_usd_rate);

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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price, discount,
                             currency, orig_price, disp_price, disp_discount, disp_currency)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price, v_item.discount,
            v_currency, v_orig_price, v_disp_price, v_disp_chegirma, v_disp_val);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
    v_disp_total := v_disp_total + (v_disp_price - v_disp_chegirma) * v_item.qty;
  end loop;

  update orders
     set total = v_total, base_total = v_base_total, disp_total = v_disp_total
   where id = v_order_id;
  return v_order_id;
end $$;
