-- =============================================================
--  PANELGA FAKTURA RAQAMI VA QABUL SANASI
--
--  dori_buyurtmalar taqsimot ichida faktura_no va qabul_at ni ham
--  qaytarsin: panel qaysi so''rov qabul qilinganini ko''rsatadi.
-- =============================================================

create or replace function public.dori_buyurtmalar(p_limit int default 30, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_super_admin() then raise exception 'RUXSAT_YOQ'; end if;
  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v
  from (
    select o.id, o.order_no, o.name, o.phone, o.pharmacy, o.status,
           o.total, o.comment, o.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price', i.price,
                      'sum', i.sum, 'yetishmadi', i.yetishmadi) order by i.name)
             from dori_order_items i where i.order_id = o.id), '[]'::jsonb) as pozitsiyalar,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'split_id', s.id, 'sklad', w.name, 'status', s.status,
                      'base_total', s.base_total, 'sell_total', s.sell_total,
                      'sent_at', s.sent_at, 'faktura_no', s.faktura_no, 'qabul_at', s.qabul_at,
                      'ulangan', exists (select 1 from dori_warehouse_telegram tg
                                          where tg.warehouse_id = s.warehouse_id and tg.is_active),
                      'pozitsiyalar', coalesce((
                        select jsonb_agg(jsonb_build_object('name', si.name, 'qty', si.qty) order by si.name)
                        from dori_split_items si where si.split_id = s.id), '[]'::jsonb)
                    ) order by w.name)
             from dori_order_splits s
             left join dori_warehouses w on w.id = s.warehouse_id
             where s.order_id = o.id), '[]'::jsonb) as taqsimot
    from dori_orders o
    where p_status is null or o.status = p_status
    order by o.created_at desc
    limit least(coalesce(p_limit, 30), 100)
  ) t;
  return v;
end $$;

revoke all on function public.dori_buyurtmalar(int, text) from public, anon;
grant execute on function public.dori_buyurtmalar(int, text) to authenticated;
