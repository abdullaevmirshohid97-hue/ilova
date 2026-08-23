-- =============================================================
--  DORI FAKTURASI — mijoz o'z buyurtmasini PDF/Excel qilib oladi
--
--  Bot buyurtmalar ro'yxatini sana bo'yicha ko'rsatadi; mijoz birini
--  tanlaganda faktura tayyorlanadi.
--
--  XAVFSIZLIK: faktura AYNAN shu chatning buyurtmasi bo'lsagina
--  qaytariladi. Funksiya faqat service_role'ga berilgan — ya'ni
--  brauzerdan chaqirib, boshqa odamning buyurtma raqamini kiritib
--  fakturasini olib bo'lmaydi.
-- =============================================================

create or replace function public.dori_invoice_for_chat(
  p_order_id uuid,
  p_chat_id  bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select jsonb_build_object(
    'order_no',   o.order_no,
    'created_at', o.created_at,
    'status',     o.status,
    'total',      o.total,
    'comment',    o.comment,
    'customer', jsonb_build_object(
      'name',     o.name,
      'phone',    o.phone,
      'pharmacy', o.pharmacy
    ),
    -- row_number() oyna funksiyasi — uni jsonb_agg ICHIGA qo'yib bo'lmaydi
    -- ("aggregate function calls cannot contain window function calls"),
    -- shuning uchun avval ichki so'rovda hisoblanadi
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', t.n,
               'name',    t.name,
               'qty',     t.qty,
               'price',   t.price,
               'sum',     t.sum
             ) order by t.n)
      from (
        select row_number() over (order by i.id) as n, i.name, i.qty, i.price, i.sum
        from dori_order_items i
        where i.order_id = o.id
      ) t
    ), '[]'::jsonb)
  )
  into v_res
  from dori_orders o
  where o.id = p_order_id
    and o.chat_id = p_chat_id;   -- boshqa odamning buyurtmasi qaytmaydi

  return v_res;
end $$;

revoke all on function public.dori_invoice_for_chat(uuid, bigint) from public, anon, authenticated;
grant execute on function public.dori_invoice_for_chat(uuid, bigint) to service_role;
