-- Bot uchun faktura: buyurtma AYNAN shu Telegram chatining mijoziga
-- tegishli bo'lsagina qaytariladi.
--
-- Nega alohida funksiya kerak: order_invoice() ruxsatni auth.uid() orqali
-- tekshiradi, bot esa service_role bilan ishlaydi va unda auth.uid() null —
-- ya'ni order_invoice bot uchun hech qachon ma'lumot qaytarmaydi. Bu yerda
-- ruxsat o'rniga chat_id bog'lanishi tekshiriladi: mijoz botga /start bosib
-- telefonini tasdiqlagan bo'lsa, uning chat_id'si kartochkasida turadi.
--
-- Faqat service_role chaqira oladi — authenticated'ga grant BERILMAYDI,
-- aks holda istalgan foydalanuvchi chat_id taxmin qilib begona fakturani
-- so'rab olishi mumkin bo'lardi.

create or replace function public.order_invoice_for_chat(
  p_order_id uuid,
  p_chat_id  bigint
)
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
  from orders o
  join customers c            on c.id = o.customer_id
  left join organizations org on org.id = c.org_id
  where o.id = p_order_id
    and c.telegram_chat_id = p_chat_id;
$$;

revoke all on function public.order_invoice_for_chat(uuid, bigint) from public;
revoke all on function public.order_invoice_for_chat(uuid, bigint) from authenticated;
grant execute on function public.order_invoice_for_chat(uuid, bigint) to service_role;
