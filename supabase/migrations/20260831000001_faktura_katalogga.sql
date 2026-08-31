-- =============================================================
--  SAQLANGAN FAKTURANI KATALOGGA O'TKAZISH
--
--  Robot faylni "faktura" deb tanib qolsa (masalan ustun nomlari
--  tanilmagani uchun), qatorlar dori_invoice_items ga tushadi va
--  katalogga umuman yetib bormaydi. Qayta yuklashning hojati yo'q -
--  qatorlar allaqachon o'qilgan, faqat to'g'ri ustunni ko'rsatish kerak.
--
--  Tanilmagan ustunlar `qoshimcha` jsonb ichida O'Z SARLAVHASI bilan
--  saqlanadi, shuning uchun narx/ishlab chiqaruvchi/qoldiq kalitini
--  parametr sifatida berish kifoya.
--
--  Yozish AYNAN dori_import_apply orqali ketadi: sinovdan o'tgan bitta
--  yo'l bo'lsin, ikkinchi "yashirin" yo'l paydo bo'lmasin.
-- =============================================================

create or replace function public.dori_faktura_katalogga(
  p_invoice_id   uuid,
  p_warehouse_id uuid,
  p_narx_kalit   text,
  p_ich_kalit    text default null,
  p_qoldiq_kalit text default null
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
           'name',         i.name,
           'manufacturer', nullif(trim(coalesce(i.manufacturer, i.qoshimcha ->> p_ich_kalit, '')), ''),
           'price',        nullif(trim(coalesce(i.price::text, i.qoshimcha ->> p_narx_kalit, '')), ''),
           'stock',        nullif(trim(coalesce(i.qty::text, i.qoshimcha ->> p_qoldiq_kalit, '')), ''),
           'series',       i.series,
           'expiry',       i.expiry
         )) order by i.line_no), '[]'::jsonb)
    into v_items
  from dori_invoice_items i
  where i.invoice_id = p_invoice_id
    and nullif(trim(coalesce(i.name, '')), '') is not null;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'QATOR_YOQ';
  end if;

  return dori_import_apply(p_warehouse_id, v_items, v_nom, null, true, v_nom);
end $$;

revoke all on function public.dori_faktura_katalogga(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.dori_faktura_katalogga(uuid, uuid, text, text, text) to authenticated;
