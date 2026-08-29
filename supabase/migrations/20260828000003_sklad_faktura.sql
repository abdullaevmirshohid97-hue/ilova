-- =============================================================
--  SKLAD NOMIDAN FAKTURA: QABUL QILISH VA CHOP ETISH
--
--  Sklad tovarni yuborganda super admin uni QABUL QILADI va hujjatni
--  chop etadi. Bu mijozga ketadigan fakturadan boshqa hujjat:
--   * taraf - SKLAD (yetkazib beruvchi), mijoz emas
--   * narx - TANNARX, ya'ni biz skladga to'laydigan summa
--   * mijozga qo'yilgan ustama bu hujjatda umuman qatnashmaydi
--
--  Hujjat tuzilishi mijoz fakturasi bilan bir xil (dori_invoice_for_chat
--  qaytaradigan shakl), shuning uchun bitta PDF/Excel yasovchi ikkalasiga
--  ham xizmat qiladi.
-- =============================================================

alter table public.dori_order_splits
  add column if not exists qabul_at   timestamptz,
  add column if not exists qabul_by   uuid references public.profiles(id) on delete set null,
  add column if not exists faktura_no text;

-- ---------- Hujjat ----------
create or replace function public.dori_sklad_faktura(p_split_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

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
               'line_no',      t.n,
               'name',         t.name,
               'manufacturer', t.manufacturer,
               'series',       t.series,
               'made_at',      t.made_at,
               'expiry',       t.expiry,
               'qty',          t.qty,
               'price',        t.base_price,
               'sum',          t.base_sum
             ) order by t.n)
      from (
        select row_number() over (order by i.name) as n,
               i.name, i.qty, i.base_price, i.base_sum,
               p.manufacturer,
               -- Seriya va muddat AYNAN shu skladning partiyasidan
               b.series, b.expiry, b.made_at
        from dori_split_items i
        left join dori_products p on p.id = i.product_id
        left join lateral (
          select b.series, b.expiry, b.made_at
          from dori_batches b
          where b.product_id = i.product_id
            and b.warehouse_id = s.warehouse_id
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

  if v_res is null then
    raise exception 'TAQSIMOT_TOPILMADI';
  end if;

  return v_res;
end $$;

revoke all on function public.dori_sklad_faktura(uuid) from public, anon;
grant execute on function public.dori_sklad_faktura(uuid) to authenticated, service_role;

-- ---------- Qabul qilish ----------
-- Super admin sklad nomidan tovarni qabul qiladi: so'rov yopiladi va
-- skladning o'z faktura raqami yozib qo'yiladi.
create or replace function public.dori_sklad_qabul(
  p_split_id   uuid,
  p_faktura_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  update dori_order_splits
     set status     = 'done',
         qabul_at   = now(),
         qabul_by   = auth.uid(),
         faktura_no = coalesce(nullif(trim(coalesce(p_faktura_no, '')), ''), faktura_no),
         updated_at = now()
   where id = p_split_id;

  if not found then
    raise exception 'TAQSIMOT_TOPILMADI';
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_sklad_qabul(uuid, text) from public, anon;
grant execute on function public.dori_sklad_qabul(uuid, text) to authenticated;
