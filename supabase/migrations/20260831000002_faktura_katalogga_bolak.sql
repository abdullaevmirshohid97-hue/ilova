-- =============================================================
--  FAKTURANI KATALOGGA: BO'LAKLAB
--
--  3000+ qatorli prays bitta so'rovda o'tmaydi - HTTP darvozasi
--  javobni kutmay uzadi va butun tranzaksiya bekor bo'ladi (jonli
--  bazada shunday bo'ldi: 524, natijada 0 ta taklif).
--
--  Panel katalog yuklashni allaqachon bo'laklab yuboradi; shu naqsh
--  bu yerda ham: har bo'lak bir xil import_id bilan ketadi, oxirgisi
--  finalize qiladi (eskisini o'chirish va narxni qayta hisoblash
--  aynan o'shanda bo'ladi).
-- =============================================================

create or replace function public.dori_faktura_katalogga(
  p_invoice_id   uuid,
  p_warehouse_id uuid,
  p_narx_kalit   text,
  p_ich_kalit    text default null,
  p_qoldiq_kalit text default null,
  p_offset       int default 0,
  p_limit        int default 400,
  p_import_id    text default null,
  p_finalize     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
  v_nom   text;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select file_name into v_nom from dori_invoices where id = p_invoice_id;
  if v_nom is null then
    raise exception 'FAKTURA_TOPILMADI';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'name',         t.name,
           'manufacturer', nullif(trim(coalesce(t.manufacturer, t.qoshimcha ->> p_ich_kalit, '')), ''),
           'price',        nullif(trim(coalesce(t.price::text, t.qoshimcha ->> p_narx_kalit, '')), ''),
           'stock',        nullif(trim(coalesce(t.qty::text, t.qoshimcha ->> p_qoldiq_kalit, '')), ''),
           'series',       t.series,
           'expiry',       t.expiry
         )) order by t.line_no), '[]'::jsonb)
    into v_items
  from (
    select i.*
    from dori_invoice_items i
    where i.invoice_id = p_invoice_id
      and nullif(trim(coalesce(i.name, '')), '') is not null
    order by i.line_no
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(coalesce(p_limit, 400), 1000)
  ) t;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', true, 'bolak_bosh', true);
  end if;

  return dori_import_apply(p_warehouse_id, v_items, v_nom, p_import_id, p_finalize, v_nom);
end $$;

revoke all on function public.dori_faktura_katalogga(uuid, uuid, text, text, text, int, int, text, boolean)
  from public, anon;
grant execute on function public.dori_faktura_katalogga(uuid, uuid, text, text, text, int, int, text, boolean)
  to authenticated;

drop function if exists public.dori_faktura_katalogga(uuid, uuid, text, text, text);
