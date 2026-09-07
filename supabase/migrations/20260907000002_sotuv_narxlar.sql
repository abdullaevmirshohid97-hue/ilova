-- =============================================================
--  SAVATNI BOSHQA SKLAD NARXIGA O'TKAZISH
--
--  Sotuv ekranida savat to'lgandan keyin sklad almashtirilsa, ekranda
--  ESKI skladning narxi turib qolardi. Sotuv esa YANGI skladdan
--  yaratiladi (dori_sotuv_yarat narxni o'zi oladi) — ya'ni ekranda bir
--  narx, hujjatda boshqasi chiqardi.
--
--  Savatni tashlab yuborish ham yechim emas: operator terib qo'ygan
--  o'nlab pozitsiya yo'qoladi. Shuning uchun aynan shu dorilar yangi
--  skladda qanchaligini so'raydigan funksiya kerak.
--
--  Yangi skladda BO'LMAGAN dori ham qaytadi (bor = false): uni jimgina
--  o'chirib yuborsak, operator nima kamayganini bilmay qoladi. Ekranda
--  qizil bo'lib turadi va operator o'zi hal qiladi.
-- =============================================================

create or replace function public.dori_sotuv_narxlar(
  p_warehouse_id uuid,
  p_ids          uuid[]
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
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_warehouse_id is null or p_ids is null or array_length(p_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  -- left join: taklifi yo'q dori ham qatorda qoladi, bor = false bilan.
  -- Ustunlar dori_sotuv_qidir bilan bir xil — ekran ikkalasidan kelgan
  -- qatorni bir xil ishlatadi.
  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.manufacturer, p.unit,
           o.price, o.base_price, o.stock,
           (o.price is not null and o.price > 0) as bor,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.expiry >= current_date) as expiry,
           (select b.series from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.series is not null
             order by (b.expiry is null), b.expiry limit 1) as series
    from dori_products p
    left join dori_offers o
           on o.product_id = p.id and o.warehouse_id = p_warehouse_id
    where p.id = any(p_ids)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_sotuv_narxlar(uuid, uuid[]) from public, anon;
grant execute on function public.dori_sotuv_narxlar(uuid, uuid[]) to authenticated;

comment on function public.dori_sotuv_narxlar(uuid, uuid[]) is
  'Savatdagi dorilarning tanlangan skladdagi narxi va qoldig''i. '
  'Skladda yo''q dori ham qaytadi: bor = false.';
