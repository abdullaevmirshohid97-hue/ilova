-- Faktura qatorlariga mahsulot rasmi qo'shiladi.
--
-- order_invoice() endi har bir qator uchun asosiy rasmning storage yo'lini
-- ham qaytaradi, shunda Telegram'ga yuboriladigan PDF'da ham rasm chiqadi
-- (admin paneldagi HTML faktura rasmni allaqachon ko'rsatadi).
--
-- Rasm tanlash tartibi mahsulot ro'yxatlaridagi bilan bir xil:
-- avval is_primary, keyin sort_order.

create or replace function public.order_invoice(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'total',        o.total,
    'base_total',   o.base_total,
    'comment',      o.comment,
    'org_name',     org.name,
    'customer', jsonb_build_object(
      'name',  c.name,
      'phone', c.phone,
      'telegram_chat_id', c.telegram_chat_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       p.name,
               'sku',        pv.sku,
               'size',       pv.size,
               'color',      pv.color,
               'qty',        oi.qty,
               'unit_price', oi.unit_price,
               'discount',   oi.discount,
               'currency',   oi.currency,
               'orig_price', oi.orig_price,
               'line_total', (oi.unit_price - coalesce(oi.discount, 0)) * oi.qty,
               'image_path', (
                 select coalesce(pi.thumb_path, pi.storage_path)
                 from product_images pi
                 where pi.product_id = p.id
                 order by pi.is_primary desc, pi.sort_order
                 limit 1
               )
             ) order by p.name)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join products p          on p.id  = pv.product_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  -- orders'da org_id ustuni yo'q — tenant mijoz orqali aniqlanadi
  from orders o
  join customers c            on c.id = o.customer_id
  left join organizations org on org.id = c.org_id
  where o.id = p_order_id
    and (
      is_super_admin()
      or (is_admin() and c.org_id = current_org_id())
      or (is_manager() and c.manager_id = current_manager_id())
      or c.id = current_customer_id()
    );
$$;

revoke all on function public.order_invoice(uuid) from public;
grant execute on function public.order_invoice(uuid) to authenticated;
