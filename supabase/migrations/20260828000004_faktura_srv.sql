-- =============================================================
--  SKLAD FAKTURASI: XIZMAT VARIANTI
--
--  Edge funksiya service_role kaliti bilan ishlaydi, ya'ni uning
--  ichida auth.uid() yo'q va is_super_admin() hamisha false qaytaradi.
--  Chaqiruvchining super admin ekanini funksiyaning O'ZI allaqachon
--  tekshirgan (JWT bo'yicha), shuning uchun bazadagi tekshiruvni
--  ikkinchi marta o'tkazish shart emas - u faqat to'sib qo'yardi.
--
--  Naqsh taqsimlashdagi bilan bir xil: ichki mantiq bitta joyda,
--  ustida ikkita qobiq - panel uchun (super admin) va xizmat uchun.
-- =============================================================

create or replace function public.dori_sklad_faktura_srv(p_split_id uuid)
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
    'sarlavha',   'KIRIM FAKTURA',
    'taraf_nom',  'Sklad:',
    'order_no',   o.order_no,
    'faktura_no', s.faktura_no,
    'created_at', coalesce(s.qabul_at, s.created_at),
    'status',     s.status,
    'total',      s.base_total,
    'comment',    o.comment,
    'customer', jsonb_build_object(
      'name',     w.name,
      'phone',    coalesce(w.phone, '—'),
      'pharmacy', coalesce(w.address, w.contact_name)
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', t.n, 'name', t.name, 'manufacturer', t.manufacturer,
               'series', t.series, 'made_at', t.made_at, 'expiry', t.expiry,
               'qty', t.qty, 'price', t.base_price, 'sum', t.base_sum
             ) order by t.n)
      from (
        select row_number() over (order by i.name) as n,
               i.name, i.qty, i.base_price, i.base_sum,
               p.manufacturer, b.series, b.expiry, b.made_at
        from dori_split_items i
        left join dori_products p on p.id = i.product_id
        left join lateral (
          select b.series, b.expiry, b.made_at
          from dori_batches b
          where b.product_id = i.product_id and b.warehouse_id = s.warehouse_id
          order by (b.expiry is null), (b.expiry < current_date), b.expiry
          limit 1
        ) b on true
        where i.split_id = s.id
      ) t
    ), '[]'::jsonb)
  ) into v_res
  from dori_order_splits s
  join dori_orders o on o.id = s.order_id
  left join dori_warehouses w on w.id = s.warehouse_id
  where s.id = p_split_id;

  return v_res;
end $$;

revoke all on function public.dori_sklad_faktura_srv(uuid) from public, anon, authenticated;
grant execute on function public.dori_sklad_faktura_srv(uuid) to service_role;
