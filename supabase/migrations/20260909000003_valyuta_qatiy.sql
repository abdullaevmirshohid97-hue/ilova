-- =============================================================
-- YUKCHIBOLLA — mijoz KO'RADIGAN valyuta qat'iy bo'ldi
--
-- MUAMMO (jonli bazadan o'lchangan):
--   Menejer "mirshohid" narxlarini dollarda kiritgan (manager_prices
--   14 ta — hammasi USD), mijozlarining 7 tasidan 6 tasi
--   display_currency='USD'. Shunga qaramay katalogda narxlar so'mda
--   ko'rinardi.
--
--   Sabab: katalog dollarni faqat "SHU variant dollarda narxlangan"
--   bo'lsagina ko'rsatardi. Faol 22 variantdan 8 tasida menejer narxi
--   yo'q — ular baza narxidan keladi va currency='UZS' bo'ladi.
--   Natijada bitta katalogda narx aralash chiqardi.
--
-- YECHIM:
--   Mijozning customers.display_currency qiymati — YAGONA qaror.
--   Hamma narx o'sha valyutaga o'giriladi, manba qaysi valyutada
--   kiritilganidan qat'i nazar.
--
-- PUL O'ZGARMAYDI:
--   unit_price, total, base_total, ledger_entries — avvalgidek
--   so'mda. disp_* ustunlari FAQAT ko'rsatish uchun. Ular buyurtma
--   berilgan paytda muzlatiladi: aks holda kurs o'zgarganda eski
--   buyurtma boshqa summa bilan ko'rinardi.
-- =============================================================

-- ---------- 1. Yagona o'girish qoidasi ----------
-- Ikkala funksiya ham bir xil shartga tayanadi. Ular ajralib qolsa
-- summa dollarda, yozuvi so'mda chiqib qolardi.

create or replace function public.korinish_valyutasi(
  p_korinish text,      -- mijoz tanlagan valyuta
  p_kurs     numeric    -- menejerning dollar kursi
)
returns text
language sql immutable
as $$
  -- Kurs yo'q yoki nol bo'lsa dollarga o'gira olmaymiz — so'mda
  -- qoldiramiz. Aks holda nolga bo'lish yoki Infinity chiqardi.
  select case
    when p_korinish = 'USD' and p_kurs is not null and p_kurs > 0 then 'USD'
    else 'UZS'
  end;
$$;

create or replace function public.korinish_narxi(
  p_price       numeric,   -- so'mdagi yakuniy narx
  p_src_valyuta text,      -- narx qaysi valyutada kiritilgan
  p_orig        numeric,   -- USD da kiritilgan bo'lsa asl dollar summasi
  p_korinish    text,      -- mijoz tanlagan valyuta
  p_kurs        numeric    -- menejerning dollar kursi
)
returns numeric
language sql immutable
as $$
  select case
    when public.korinish_valyutasi(p_korinish, p_kurs) <> 'USD'
      then round(p_price)
    -- Dollarda kiritilgan narx: asl summani ko'rsatamiz. So'mga
    -- o'girib, keyin qaytarib bo'lish yaxlitlash farqini berardi.
    when p_src_valyuta = 'USD' and p_orig is not null
      then round(p_orig, 2)
    else round(p_price / p_kurs, 2)
  end;
$$;

comment on function public.korinish_narxi(numeric, text, numeric, text, numeric) is
  'Mijoz ko''radigan narx. Pul hisobi so''mda qoladi — bu faqat ko''rsatish uchun.';

-- ---------- 2. Mijozning amaldagi valyutasi ----------
-- Mobil ilovaga kerak: sarlavha, savat yig'indisi, bo'sh katalogda ham
-- qaysi valyuta ekani ma'lum bo'lsin. customers.display_currency ni
-- to'g'ridan-to'g'ri o'qish yetarli emas — kurs nol bo'lsa amalda
-- so'm ko'rinadi.
create or replace function public.mijoz_valyuta()
returns table(valyuta text, kurs numeric)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_korinish text;
  v_manager  uuid;
  v_kurs     numeric(14,2);
begin
  select c.display_currency, c.manager_id
    into v_korinish, v_manager
  from profiles p
  join customers c on c.id = p.customer_id and c.is_active
  where p.id = auth.uid();

  if v_korinish is null then
    return;
  end if;

  if v_manager is not null then
    select m.usd_rate into v_kurs from managers m where m.id = v_manager;
  end if;

  return query select korinish_valyutasi(v_korinish, v_kurs), v_kurs;
end $$;

grant execute on function public.mijoz_valyuta() to authenticated;

-- ---------- 3. Ko'rsatish ustunlari ----------
-- numeric(14,2) — dollar tiyinlari uchun. numeric(14,0) qolsa
-- $12.50 → $13 bo'lib qirqilardi.
alter table public.order_items
  add column disp_price    numeric(14,2),
  add column disp_discount numeric(14,2) not null default 0,
  add column disp_currency text not null default 'UZS'
    check (disp_currency in ('UZS', 'USD'));

alter table public.orders
  add column disp_total    numeric(14,2),
  add column disp_currency text not null default 'UZS'
    check (disp_currency in ('UZS', 'USD'));

-- ---------- 4. create_order — mijoz o'zi buyurtma berganda ----------
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
  v_available     bigint;
  v_item_org      uuid;
begin
  select p.customer_id, c.price_group_id, c.org_id, c.manager_id, c.display_currency
    into v_customer_id, v_group_id, v_org_id, v_manager_id, v_korinish
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
  v_disp_val := korinish_valyutasi(v_korinish, v_usd_rate);

  insert into orders (customer_id, comment, created_by, disp_currency)
  values (v_customer_id, p_comment, auth.uid(), v_disp_val)
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

    v_disp_price := korinish_narxi(v_price, v_currency, v_orig_price, v_korinish, v_usd_rate);

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

    insert into order_items (order_id, variant_id, qty, unit_price, base_price,
                             currency, orig_price, disp_price, disp_currency)
    values (v_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price,
            v_currency, v_orig_price, v_disp_price, v_disp_val);

    v_total := v_total + v_price * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
    v_disp_total := v_disp_total + v_disp_price * v_item.qty;
  end loop;

  update orders
     set total = v_total, base_total = v_base_total, disp_total = v_disp_total
   where id = v_order_id;
  return v_order_id;
end $$;

-- ---------- 5. admin_create_order — admin yoki menejer yaratganda ----------
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
    -- Chegirma so'mda kiritiladi — ko'rsatishda u ham o'giriladi,
    -- aks holda dollardagi qatorda so'mdagi chegirma ayirilardi.
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

-- ---------- 6. edit_order_items — buyurtmani tahrirlash ----------
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
  v_korinish      text;
  v_disp_val      text;
  v_authorized    boolean := false;
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
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;
  if v_order.status <> 'new' then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  select org_id, price_group_id, manager_id, display_currency
    into v_org, v_group_id, v_manager_id, v_korinish
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
  v_disp_val := korinish_valyutasi(v_korinish, v_usd_rate);

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
    values (p_order_id, v_item.variant_id, v_item.qty, v_price, v_base_price, v_item.discount,
            v_currency, v_orig_price, v_disp_price, v_disp_chegirma, v_disp_val);

    v_total := v_total + (v_price - v_item.discount) * v_item.qty;
    v_base_total := v_base_total + v_base_price * v_item.qty;
    v_disp_total := v_disp_total + (v_disp_price - v_disp_chegirma) * v_item.qty;
  end loop;

  update orders
     set total = v_total, base_total = v_base_total,
         disp_total = v_disp_total, disp_currency = v_disp_val
   where id = p_order_id;
end $$;

-- ---------- 7. my_effective_prices — katalog narxlari ----------
-- Endi disp_price/disp_currency ham qaytadi: katalog "bu variant
-- qaysi valyutada narxlangan" degan savolni umuman bermaydi.
-- Eski price/currency/orig_price ustunlari joyida qoladi — ular
-- boshqa joyda ishlatilyapti va olib tashlash keraksiz xavf.
drop function if exists public.my_effective_prices();

create or replace function public.my_effective_prices()
returns table(
  variant_id    uuid,
  price         numeric(14,0),
  currency      text,
  orig_price    numeric(14,2),
  disp_price    numeric(14,2),
  disp_currency text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_group_id    uuid;
  v_manager_id  uuid;
  v_korinish    text;
  v_usd_rate    numeric(14,2);
  v_disp_val    text;
begin
  select p.customer_id, c.price_group_id, c.manager_id, c.display_currency
    into v_customer_id, v_group_id, v_manager_id, v_korinish
  from profiles p
  join customers c on c.id = p.customer_id and c.is_active
  where p.id = auth.uid();

  if v_customer_id is null then
    return;
  end if;

  if v_manager_id is not null then
    select usd_rate into v_usd_rate from managers where id = v_manager_id;
  end if;
  v_disp_val := korinish_valyutasi(v_korinish, v_usd_rate);

  return query
  with hisob as (
    select
      pr.variant_id as vid,
      (coalesce(
        case when mcp.currency = 'USD' then round(mcp.price * v_usd_rate) else mcp.price end,
        case when mp.currency  = 'USD' then round(mp.price  * v_usd_rate) else mp.price  end,
        pr.price
      ))::numeric(14,0) as som_narx,
      coalesce(mcp.currency, mp.currency, 'UZS') as manba_val,
      case
        when coalesce(mcp.currency, mp.currency, 'UZS') = 'USD'
        then coalesce(mcp.price, mp.price)
        else null
      end::numeric(14,2) as asl_narx
    from prices pr
    left join manager_customer_prices mcp
      on v_manager_id is not null
     and mcp.manager_id = v_manager_id
     and mcp.customer_id = v_customer_id
     and mcp.variant_id = pr.variant_id
    left join manager_prices mp
      on v_manager_id is not null
     and mp.manager_id = v_manager_id
     and mp.variant_id = pr.variant_id
    where pr.price_group_id = v_group_id
  )
  select
    h.vid,
    h.som_narx,
    h.manba_val,
    h.asl_narx,
    korinish_narxi(h.som_narx, h.manba_val, h.asl_narx, v_korinish, v_usd_rate)::numeric(14,2),
    v_disp_val
  from hisob h;
end $$;

grant execute on function public.my_effective_prices() to authenticated;

-- ---------- 8. Mavjud buyurtmalarni to'ldirish ----------
-- Bo'sh maydonni to'ldirish — qaytarib bo'ladigan amal, pulga tegmaydi.
-- Mijozning BUGUNGI valyutasi va menejerning BUGUNGI kursi bo'yicha
-- hisoblanadi: eski qatorlarda "o'sha paytda nima ko'rsatilgan" degan
-- ma'lumot yo'q (aynan shu buzilgan edi — aralash ko'rinardi).
update public.order_items oi
   set disp_price    = public.korinish_narxi(
                         oi.unit_price, oi.currency, oi.orig_price,
                         c.display_currency, m.usd_rate),
       disp_discount = public.korinish_narxi(
                         oi.discount, 'UZS', null,
                         c.display_currency, m.usd_rate),
       disp_currency = public.korinish_valyutasi(c.display_currency, m.usd_rate)
  from public.orders o
  join public.customers c on c.id = o.customer_id
  left join public.managers m on m.id = c.manager_id
 where oi.order_id = o.id;

update public.orders o
   set disp_currency = public.korinish_valyutasi(c.display_currency, m.usd_rate),
       disp_total    = coalesce((
         select sum((oi.disp_price - oi.disp_discount) * oi.qty)
         from public.order_items oi
         where oi.order_id = o.id
       ), 0)
  from public.customers c
  left join public.managers m on m.id = c.manager_id
 where c.id = o.customer_id;
