-- =============================================================
--  SAVAT QATORIDA QOLDIQ HAM KO'RINSIN
--
--  Mini App savatda "+" tugmasini chegarada to'xtatishi uchun qoldiqni
--  bilishi kerak. Bilmasa, mijoz bosaveradi, server esa jimgina
--  kesadi - tugma "ishlamayotgandek" tuyuladi.
-- =============================================================

create or replace function public.dori_bot_cart(p_chat_id bigint)
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
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', c.product_id,
               'name', p.name,
               'price', p.price,
               'qty', c.qty,
               'stock', coalesce(p.stock, 0),
               'sum', coalesce(p.price, 0) * c.qty
             ) order by p.name)
      from dori_cart c join dori_products p on p.id = c.product_id
      where c.chat_id = p_chat_id
    ), '[]'::jsonb),
    'total', coalesce((
      select sum(coalesce(p.price, 0) * c.qty)
      from dori_cart c join dori_products p on p.id = c.product_id
      where c.chat_id = p_chat_id
    ), 0)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_bot_cart(bigint) from public, anon, authenticated;
grant execute on function public.dori_bot_cart(bigint) to service_role;
