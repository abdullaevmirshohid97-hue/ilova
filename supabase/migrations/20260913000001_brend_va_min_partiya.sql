-- =============================================================
-- YUKCHIBOLLA — brend va minimal partiya
--
-- Ulgurji katalogning B2C dan ikki asosiy farqi shu:
--   «Brend: ChunSe»   — xaridor ishlab chiqaruvchini biladi
--   «Min. 50 dona»    — bittalab sotilmaydi
--
-- Ikkalasi ham mahsulot darajasida:
--   products.brand           — matn, ixtiyoriy
--   products.min_order_qty   — 1 dan kichik bo'lmaydi, standart 1
--                              (ya'ni eski xulq o'zgarmaydi)
--
-- MUHIM: minimal partiya faqat ekranda to'sib qo'yilsa — himoya emas.
-- So'rovni qo'lda yasash mumkin, shuning uchun tekshiruv create_order
-- ning ICHIGA qo'yildi (quyida). Admin va menejer yo'llariga tegilmadi:
-- ular kelishuv bo'yicha kamroq ham sotishi mumkin.
--
-- create_order matni JONLI BAZADAN olindi (pg_get_functiondef) va
-- unga faqat ikki o'zgarish kiritildi — eski migratsiya faylidan
-- tiklansa, oradagi tuzatishlar yo'qolardi.
-- =============================================================

alter table public.products add column if not exists brand text;

alter table public.products
  add column if not exists min_order_qty integer not null default 1;

do $mig$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_min_order_qty_check'
  ) then
    alter table public.products
      add constraint products_min_order_qty_check check (min_order_qty >= 1);
  end if;
end $mig$;

comment on column public.products.brand is 'Ishlab chiqaruvchi/brend nomi — katalogda va mahsulot sahifasida ko''rinadi.';
comment on column public.products.min_order_qty is 'Minimal partiya (dona). create_order buni tekshiradi; admin/menejer yo''llari bundan mustasno.';

-- ---------- create_order: minimal partiya tekshiruvi ----------

CREATE OR REPLACE FUNCTION public.create_order(p_items jsonb, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_min_qty       int;
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

    select pd.org_id, pd.min_order_qty into v_item_org, v_min_qty
    from product_variants v join products pd on pd.id = v.product_id
    where v.id = v_item.variant_id;
    if v_item_org is null or v_item_org <> v_org_id then
      raise exception 'RUXSAT_YOQ';
    end if;

    -- Minimal partiya SERVERDA tekshiriladi. Ilovada ham tugma
    -- to'siladi, lekin ilova hakam emas: so'rovni qo'lda yasash mumkin.
    -- Tekshiruv QATOR bo'yicha (variant), mahsulot bo'yicha emas —
    -- ekranda ham miqdor aynan variantga tanlanadi.
    if v_item.qty < coalesce(v_min_qty, 1) then
      raise exception 'MIN_MIQDOR: variant %, kamida % dona', v_item.variant_id, v_min_qty;
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
end $function$
;
