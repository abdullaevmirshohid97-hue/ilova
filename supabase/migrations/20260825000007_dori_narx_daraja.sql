-- =============================================================
--  NARX DARAJALARI ANIQ TARTIBGA SOLINDI
--
--  Kerakli tartib:
--      alohida dori  >  guruh  >  SKLAD  >  umumiy
--
--  Oldingi yozuvda "umumiy" qoida skladdan oldin tekshirilardi, ya'ni
--  umumiy 5% qo'yilgan bo'lsa, skladning o'z ustamasi hech qachon
--  ishlamasdi.
--
--  Ikkinchi qoida: ustamaning FOIZI va SUMMASI bitta darajadan olinadi.
--  Foizni bir joydan, summani boshqasidan olsak, natijani hech kim
--  oldindan ayta olmasdi. Daraja "gapirdimi" - hammasi o'shanikidir.
--  Masalan sklad "+2000 so'm" desa, umumiy 5% unga qo'shilmaydi.
-- =============================================================

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
           -- 1-2 daraja: dori yoki guruh qoidasi
           su.pct as su_pct, su.summa as su_summa,
           sd.pct as sd_pct, sd.summa as sd_summa,
           -- 3 daraja: skladning o'zi
           w.markup_pct as w_pct, w.markup_sum as w_summa,
           w.discount_pct as wd_pct, w.discount_sum as wd_summa,
           -- 4 daraja: umumiy
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
  hisob as (
    select warehouse_id, product_id,
           greatest(
             case
               when v_round > 0 then
                 round(((tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma) / v_round) * v_round
               else
                 round((tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma)
             end,
             0
           ) as yangi
    from tanlov
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

revoke all on function public.dori_offer_narx(uuid, uuid[]) from public, anon;
grant execute on function public.dori_offer_narx(uuid, uuid[]) to authenticated, service_role;
