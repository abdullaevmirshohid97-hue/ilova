-- =============================================================
--  AUDIT NATIJALARI BO'YICHA TUZATISH
--
--  Loyihaning to'liq tekshiruvida uch turdagi kamchilik topildi.
--
--  A) XAVFSIZLIK: beshta funksiya har qanday tizimga kirgan
--     foydalanuvchiga ochiq edi. Ular ma'lumot o'g'irlamaydi, lekin
--     narxlarni QAYTA HISOBLAYDI - ya'ni oddiy mijoz hisobidan
--     minglab qatorni qayta yozuvchi og'ir so'rovni cheksiz marta
--     ishga tushirish mumkin edi (katalogni sekinlashtirish).
--     Tekshirildi: mijoz hisobi bilan HTTP 200 qaytardi.
--
--  B) PUL: yaxlitlash narxni TANNARXDAN PAST ga tushirar edi.
--     418.20 + 5% = 439.11, yaxlitlash 100 so'mgacha -> 400.
--     Ya'ni har sotuvda 18 so'm zarar. Jonli bazada 8 ta pozitsiya
--     shu holatda edi - hammasi arzon tovarlar (shprits, sistema).
--
--  C) Yordamchi funksiyalar (dori_asosiy_sklad, dori_cheklov_yoqilganmi)
--     ham keraksiz ochiq edi.
--
--  YECHIM: ular ichki chaqiruvlar uchun kerak, tashqi chaqiruv uchun
--  emas. SECURITY DEFINER funksiyalar bir-birini postgres nomidan
--  chaqiradi, ya'ni grant olib tashlansa ham ichki oqim ishlayveradi.
-- =============================================================

-- ---------- A. Narx hisoblagichlarini yopish ----------
-- Ichkarida dori_import_apply, dori_sotuv_yarat, dori_sklad_saqla va
-- boshqalar chaqiradi - ular definer, shuning uchun grantga bog'liq emas.
revoke execute on function public.dori_offer_narx(uuid, uuid[]) from authenticated;
revoke execute on function public.dori_katalog_yigish(uuid[]) from authenticated;
revoke execute on function public.dori_import_narx_yakun() from authenticated;
revoke execute on function public.dori_asosiy_sklad() from authenticated;
revoke execute on function public.dori_cheklov_yoqilganmi() from authenticated;

-- dori_narx_hisobla panelda ishlatiladi (yaxlitlash o'zgarganda),
-- shuning uchun grant qoladi - lekin endi ichida tekshiruv bor.
create or replace function public.dori_narx_hisobla(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  -- Bu og'ir amal: minglab qatorni qayta yozadi. Faqat super admin.
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  v_n := dori_offer_narx(null, p_ids);
  perform dori_katalog_yigish(p_ids);
  return v_n;
end $$;

revoke all on function public.dori_narx_hisobla(uuid[]) from public, anon;
grant execute on function public.dori_narx_hisobla(uuid[]) to authenticated;

-- ---------- B. Boshqa tenantning buyurtmasi ochilmasin ----------
-- order_usd_total SECURITY DEFINER edi va istalgan buyurtma id'sini
-- qabul qilardi: id topilsa boshqa tenantning summasi ko'rinardi.
create or replace function public.order_usd_total(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.display_currency = 'USD'
            and exists (select 1 from order_items oi where oi.order_id = o.id)
           then (select sum(oi.qty * oi.orig_price) from order_items oi where oi.order_id = o.id)
         end
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id
    -- Faqat O'Z tenantining buyurtmasi (super admin hammasini ko'radi)
    and (is_super_admin() or c.org_id = current_org_id());
$$;

revoke all on function public.order_usd_total(uuid) from public, anon;
grant execute on function public.order_usd_total(uuid) to authenticated, service_role;

-- ---------- C. Yaxlitlash tannarxdan past tushmasin ----------
-- Eng arzon tovarlarda foiz kichik, yaxlitlash esa uni pastga tortadi
-- va narx tannarxdan past bo'lib qoladi. Endi shunday hol yuz bersa
-- narx YUQORIGA yaxlitlanadi: hech qachon zarariga sotmaymiz.
create or replace function public.dori_offer_narx(
  p_warehouse uuid default null,
  p_ids       uuid[] default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_n     int;
begin
  select rounding into v_round from dori_settings where id;
  v_round := coalesce(v_round, 0);

  with baza as (
    select o.warehouse_id, o.product_id, p.grp,
           coalesce(o.base_price, 0) as tannarx
    from dori_offers o
    join dori_products p on p.id = o.product_id
    where (p_warehouse is null or o.warehouse_id = p_warehouse)
      and (p_ids is null or o.product_id = any (p_ids))
  ),
  daraja as (
    select b.warehouse_id, b.product_id, b.tannarx,
           su.pct as su_pct, su.summa as su_summa,
           sd.pct as sd_pct, sd.summa as sd_summa,
           w.markup_pct as w_pct, w.markup_sum as w_summa,
           w.discount_pct as wd_pct, w.discount_sum as wd_summa,
           gu.pct as gu_pct, gu.summa as gu_summa,
           gd.pct as gd_pct, gd.summa as gd_summa
    from baza b
    left join dori_warehouses w on w.id = b.warehouse_id
    left join lateral (
      select r.markup_pct as pct, r.markup_sum as summa
      from dori_price_rules r
      where r.is_active
        and (r.markup_pct is not null or r.markup_sum is not null)
        and ((r.scope = 'product' and r.target_key = b.product_id::text)
          or (r.scope = 'group'   and r.target_key = b.grp))
      order by case r.scope when 'product' then 1 else 2 end
      limit 1
    ) su on true
    left join lateral (
      select r.discount_pct as pct, r.discount_sum as summa
      from dori_price_rules r
      where r.is_active
        and (r.discount_pct is not null or r.discount_sum is not null)
        and ((r.scope = 'product' and r.target_key = b.product_id::text)
          or (r.scope = 'group'   and r.target_key = b.grp))
      order by case r.scope when 'product' then 1 else 2 end
      limit 1
    ) sd on true
    left join lateral (
      select r.markup_pct as pct, r.markup_sum as summa
      from dori_price_rules r
      where r.is_active and r.scope = 'global'
        and (r.markup_pct is not null or r.markup_sum is not null)
      limit 1
    ) gu on true
    left join lateral (
      select r.discount_pct as pct, r.discount_sum as summa
      from dori_price_rules r
      where r.is_active and r.scope = 'global'
        and (r.discount_pct is not null or r.discount_sum is not null)
      limit 1
    ) gd on true
  ),
  tanlov as (
    select warehouse_id, product_id, tannarx,
           case
             when su_pct is not null or su_summa is not null then coalesce(su_pct, 0)
             when w_pct  is not null or w_summa  is not null then coalesce(w_pct, 0)
             else coalesce(gu_pct, 0)
           end as pct,
           case
             when su_pct is not null or su_summa is not null then coalesce(su_summa, 0)
             when w_pct  is not null or w_summa  is not null then coalesce(w_summa, 0)
             else coalesce(gu_summa, 0)
           end as summa,
           case
             when sd_pct is not null or sd_summa is not null then coalesce(sd_pct, 0)
             when wd_pct is not null or wd_summa is not null then coalesce(wd_pct, 0)
             else coalesce(gd_pct, 0)
           end as dpct,
           case
             when sd_pct is not null or sd_summa is not null then coalesce(sd_summa, 0)
             when wd_pct is not null or wd_summa is not null then coalesce(wd_summa, 0)
             else coalesce(gd_summa, 0)
           end as dsumma
    from daraja
  ),
  xom as (
    select warehouse_id, product_id, tannarx,
           (tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma as narx,
           dpct, dsumma
    from tanlov
  ),
  hisob as (
    select warehouse_id, product_id,
           greatest(
             case
               when v_round > 0 then
                 case
                   -- Yaxlitlash tannarxdan PAST tushirsa - yuqoriga.
                   -- Chegirma ATAYLAB qo'yilgan bo'lsa aralashmaymiz:
                   -- zarariga sotish ham qaror bo'lishi mumkin.
                   when round(narx / v_round) * v_round < tannarx
                        and dpct = 0 and dsumma = 0
                     then ceil(narx / v_round) * v_round
                   else round(narx / v_round) * v_round
                 end
               else round(narx)
             end,
             0
           ) as yangi
    from xom
  )
  update dori_offers o
     set price = h.yangi, updated_at = now()
    from hisob h
   where o.warehouse_id = h.warehouse_id
     and o.product_id   = h.product_id
     and o.price is distinct from h.yangi;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.dori_offer_narx(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.dori_offer_narx(uuid, uuid[]) to service_role;
