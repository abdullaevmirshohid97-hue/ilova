-- =============================================================
-- YUKCHIBOLLA — faktura ham mijoz ko'rgan valyutada
--
-- Telegram fakturasi va bot xabarlari order_invoice_payload() dan
-- oziqlanadi, u esa order_usd_total() ga tayanardi:
--
--   sum(oi.qty * oi.orig_price)
--
-- Bunda ikkita xato bor edi:
--   1. orig_price NULL bo'lgan qator (menejer narx qo'ymagan, baza
--      narxidan kelgan) yig'indidan JIMGINA tushib qolardi — faktura
--      summasi haqiqiydan KAM chiqardi, hech qanday xato bermasdan.
--   2. chegirma umuman hisobga olinmasdi.
--
-- Endi ikkalasi ham orders.disp_total / order_items.disp_price dan
-- olinadi — mobil ilova, menejer paneli va faktura bitta raqamni
-- ko'rsatadi.
--
-- Baza (rasmiy) narx doim so'mda qoladi — u admin uchun va unda
-- valyuta tanlash yo'q.
-- =============================================================

create or replace function public.order_usd_total(p_order_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  -- Shartnoma o'zgarmadi: dollarli buyurtmada summa, aks holda null.
  -- Endi qatorlarni qayta yig'maydi — buyurtma yaratilganda muzlatilgan
  -- disp_total ni oladi.
  select case when o.disp_currency = 'USD' then o.disp_total end
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id
    and (
      auth.uid() is null          -- ichki chaqiruv: bot, hisobot, edge
      or is_super_admin()
      or c.org_id = current_org_id()
    );
$$;

create or replace function public.order_invoice_payload(p_order_id uuid, p_baza boolean)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_usd_total numeric;
  v_usd boolean;
  v_res jsonb;
begin
  if not exists (select 1 from orders where id = p_order_id) then
    return null;
  end if;

  -- Baza (rasmiy) narx doim so'mda: unda valyuta tanlash yo'q
  v_usd_total := case when p_baza then null else order_usd_total(p_order_id) end;
  v_usd := v_usd_total is not null;

  select jsonb_build_object(
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'comment',      o.comment,
    'org_name',     org.name,
    'currency',     case when v_usd then 'USD' else 'UZS' end,
    'price_kind',   case when p_baza then 'base' else 'real' end,
    'total', case
               when v_usd  then v_usd_total
               when p_baza then o.base_total
               else o.total
             end,
    -- Dollarli fakturada ham so'm summasi kerak: qarz/ledger shu bo'yicha
    -- yuritiladi, mijoz bilan hisob-kitobda ikkalasi ko'rinib tursin
    'total_uzs',  case when v_usd then o.total else null end,
    'base_total', o.base_total,
    'customer', jsonb_build_object(
      'name',  c.name,
      'phone', c.phone,
      'telegram_chat_id', c.telegram_chat_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       pr.name,
               'sku',        pv.sku,
               'size',       pv.size,
               'color',      pv.color,
               'qty',        oi.qty,
               'currency',   oi.currency,
               'orig_price', oi.orig_price,
               'discount',   oi.discount,
               -- Dollarli fakturada disp_price ishlatiladi: u menejer
               -- narx qo'ymagan (baza narxidan kelgan) qator uchun ham
               -- to'ldirilgan. Avvalgi orig_price bunday qatorda NULL
               -- edi va qator fakturada bo'sh chiqardi.
               'unit_price', case
                               when v_usd   then oi.disp_price - coalesce(oi.disp_discount, 0)
                               when p_baza  then oi.base_price
                               else oi.unit_price - coalesce(oi.discount, 0)
                             end,
               'line_total', case
                               when v_usd   then (oi.disp_price - coalesce(oi.disp_discount, 0)) * oi.qty
                               when p_baza  then oi.base_price * oi.qty
                               else (oi.unit_price - coalesce(oi.discount, 0)) * oi.qty
                             end,
               'image_path', (
                 select coalesce(pi.thumb_path, pi.storage_path)
                 from product_images pi
                 where pi.product_id = pr.id
                 order by pi.is_primary desc, pi.sort_order
                 limit 1
               )
             ) order by pr.name)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join products pr         on pr.id = pv.product_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_res
  from orders o
  join customers c            on c.id  = o.customer_id
  left join organizations org on org.id = c.org_id
  where o.id = p_order_id;

  return v_res;
end $$;
