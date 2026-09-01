-- =============================================================
--  KABINET SO'ROVIDA YIG'ISH UCHUN KERAK BO'LGAN HAMMA NARSA
--
--  Sklad xodimi so'rovni ochganda faqat nom va miqdorni ko'rardi.
--  Yig'ish uchun bu yetmaydi: qaysi seriya, qaysi muddat, qaysi
--  ishlab chiqaruvchi - omborda shu belgilar bo'yicha topiladi.
--
--  Narx SAQLANADI (tannarx): sklad o'ziga to'lanadigan summani
--  bilishi kerak. Mijoz narxi bu yerda ham yo'q.
-- =============================================================

create or replace function public.dori_kabinet_sorovlar(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v    jsonb;
begin
  select warehouse_id into v_wh
  from dori_warehouse_users
  where user_id = auth.uid() and is_active;

  if v_wh is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v
  from (
    select s.id, s.status, s.base_total, s.created_at, s.sent_at, s.note,
           o.order_no, o.pharmacy, o.comment,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name,
                      'qty', i.qty,
                      'base_price', i.base_price,
                      'base_sum', i.base_sum,
                      'manufacturer', p.manufacturer,
                      'series', b.series,
                      'expiry', b.expiry,
                      'made_at', b.made_at
                    ) order by i.name)
             from dori_split_items i
             left join dori_products p on p.id = i.product_id
             left join lateral (
               select b.series, b.expiry, b.made_at
               from dori_batches b
               where b.product_id = i.product_id and b.warehouse_id = v_wh
               order by (b.expiry is null), (b.expiry < current_date), b.expiry
               limit 1
             ) b on true
             where i.split_id = s.id
           ), '[]'::jsonb) as pozitsiyalar
    from dori_order_splits s
    join dori_orders o on o.id = s.order_id
    where s.warehouse_id = v_wh and s.status <> 'cancelled'
    order by s.created_at desc
    limit least(coalesce(p_limit, 20), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_kabinet_sorovlar(int) from public, anon;
grant execute on function public.dori_kabinet_sorovlar(int) to authenticated;
