-- =============================================================
--  IKKI XATO: TAQSIMOT ISHLAMAYDI VA FOIZ "QO'SHILMAYDI"
--
--  ---------------------------------------------------------------
--  1) BUYURTMANI SKLADGA YUBORIB BO'LMAYAPTI
--
--  Sabab: taqsimlagich qoldiqni `coalesce(o.stock, 0)` deb o'qiydi.
--  Prays fayllarida qoldiq ustuni yo'q, ya'ni HAMMA taklifda stock
--  NULL. NULL -> 0 bo'lgach, hech bir sklad hech narsani bera olmaydi:
--  har bir pozitsiya "yetishmadi" bo'lib qoladi va bitta ham so'rov
--  yaratilmaydi. Tekshirildi: oxirgi 6 buyurtmada taqsimot 0 ta.
--
--  Savat cheklovida bu allaqachon to'g'rilangan edi (NULL = noma'lum),
--  taqsimlagichda esa e'tibordan chetda qolgan.
--
--  Endi uch holat:
--      stock IS NULL -> NOMA'LUM: sklad butun pozitsiyani ola oladi
--      stock = 0     -> TUGAGAN:  bu skladdan olinmaydi
--      stock > 0     -> shuncha ola oladi
--
--  ---------------------------------------------------------------
--  2) FOIZ QO'SHSAM QO'SHILMAYAPTI
--
--  Sabab ikki qismli:
--
--  a) Kuch tartibi: dori > guruh > SKLAD > umumiy. Ikkala skladda ham
--     o'z ustamasi (5%) turibdi, shuning uchun "hamma doriga" qo'yilgan
--     umumiy foiz ularga TEGMAYDI. Bu ataylab shunday, lekin panelda
--     hech qayerda ko'rinmasdi.
--
--  b) Oldindan ko'rish YOLG'ON gapirardi: dori_price_preview skladni
--     umuman bilmaydi - u tannarxga kiritilgan foizni qo'shib
--     "shuncha o'zgaradi" derdi. Amalda esa sklad ustamasi ustun
--     kelib, narx o'zgarmasdi. Ya'ni ekran bir narsa, natija boshqa.
--
--  Endi oldindan ko'rish AYNAN hisoblagich mantig'i bilan ishlaydi va
--  qaysi skladlar o'z ustamasi bilan chetda qolishini aytadi.
--
--  ---------------------------------------------------------------
--  3) YO'L-YO'LAKAY: NOL NARX
--
--  Asosiy skladda 12 ta taklifning narxi 0. Katalog narxi
--  min(o.price) bo'lgani uchun bunday dori mijozga 0 so'm bo'lib
--  ko'rinardi. Nol narx - bu "narx yo'q" degani, sotuv narxi emas.
-- =============================================================

-- ---------- 1. Katalog yig'ish: nol narx hisobga olinmaydi ----------
create or replace function public.dori_katalog_yigish(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with arzon as (
    -- Eng arzon TAKLIF: narx ham, tannarx ham AYNAN shu takliddan
    -- olinadi. Ilgari min(price) va min(base_price) alohida hisoblanardi
    -- va ular boshqa-boshqa skladdan chiqib, panelda mos kelmasdi.
    select distinct on (o.product_id)
           o.product_id, o.price, o.base_price
    from dori_offers o
    join dori_warehouses w on w.id = o.warehouse_id and w.is_active
    where o.price is not null and o.price > 0
      and (p_ids is null or o.product_id = any (p_ids))
    order by o.product_id, o.price, w.priority, w.name
  ),
  yig as (
    select p.id,
           a.price      as narx,
           a.base_price as tannarx,
           (select sum(o.stock) from dori_offers o
             join dori_warehouses w on w.id = o.warehouse_id and w.is_active
             where o.product_id = p.id and o.stock is not null) as qoldiq,
           exists (select 1 from dori_offers o where o.product_id = p.id) as taklif_bor
    from dori_products p
    left join arzon a on a.product_id = p.id
    where p_ids is null or p.id = any (p_ids)
  )
  update dori_products p
     set price      = y.narx,
         base_price = y.tannarx,
         stock      = y.qoldiq,
         is_active  = y.taklif_bor,
         updated_at = now()
    from yig y
   where p.id = y.id
     and (p.price      is distinct from y.narx
       or p.base_price is distinct from y.tannarx
       or p.stock      is distinct from y.qoldiq
       or p.is_active  is distinct from y.taklif_bor);

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.dori_katalog_yigish(uuid[]) from public, anon;
grant execute on function public.dori_katalog_yigish(uuid[]) to authenticated, service_role;

-- ---------- 2. Taqsimlash: NULL qoldiq = noma'lum ----------
create or replace function public.dori_order_split_ichki(
  p_order_id uuid,
  p_apply    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_item  record;
  r_off   record;
  v_qoldi numeric;
  v_ol    numeric;
  v_split uuid;
  v_res   jsonb;
begin
  if not exists (select 1 from dori_orders where id = p_order_id) then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  drop table if exists _taqsim;
  create temp table _taqsim (
    warehouse_id  uuid,
    product_id    uuid,
    order_item_id bigint,
    name          text,
    qty           numeric(16,3),
    base_price    numeric(16,2),
    price         numeric(16,2)
  ) on commit drop;

  drop table if exists _yetishmadi;
  create temp table _yetishmadi (
    order_item_id bigint,
    name          text,
    qty           numeric(16,3)
  ) on commit drop;

  for r_item in
    select i.id, i.product_id, i.name, i.qty, i.price
    from dori_order_items i
    where i.order_id = p_order_id
    order by i.id
  loop
    v_qoldi := r_item.qty;

    if r_item.product_id is null then
      insert into _yetishmadi values (r_item.id, r_item.name, v_qoldi);
      continue;
    end if;

    -- 1-qoida: butun pozitsiyani BITTA sklad bera oladimi?
    -- Qoldiq noma'lum bo'lsa ham bera oladi deb hisoblanadi: aks holda
    -- qoldiq ustuni yo'q praysda hech qachon hech narsa taqsimlanmasdi.
    select o.warehouse_id, o.base_price
      into r_off
    from dori_offers o
    join dori_warehouses w on w.id = o.warehouse_id
    where o.product_id = r_item.product_id
      and w.is_active
      and o.price is not null and o.price > 0
      and (o.stock is null or o.stock >= v_qoldi)
    order by o.price, w.priority, w.name
    limit 1;

    if found then
      insert into _taqsim
      values (r_off.warehouse_id, r_item.product_id, r_item.id, r_item.name,
              v_qoldi, r_off.base_price, r_item.price);
      v_qoldi := 0;
    else
      -- 2-qoida: arzonidan to'ldirib boramiz. Qoldig'i noma'lum sklad
      -- qolgan hammasini olishi mumkin.
      for r_off in
        select o.warehouse_id, o.base_price, o.stock
        from dori_offers o
        join dori_warehouses w on w.id = o.warehouse_id
        where o.product_id = r_item.product_id
          and w.is_active
          and o.price is not null and o.price > 0
          and (o.stock is null or o.stock > 0)
        order by o.price, w.priority, w.name
      loop
        exit when v_qoldi <= 0;
        v_ol := case when r_off.stock is null then v_qoldi
                     else least(r_off.stock, v_qoldi) end;
        insert into _taqsim
        values (r_off.warehouse_id, r_item.product_id, r_item.id, r_item.name,
                v_ol, r_off.base_price, r_item.price);
        v_qoldi := v_qoldi - v_ol;
      end loop;
    end if;

    if v_qoldi > 0 then
      insert into _yetishmadi values (r_item.id, r_item.name, v_qoldi);
    end if;
  end loop;

  if p_apply then
    delete from dori_order_splits
     where order_id = p_order_id and status in ('new', 'cancelled');

    for r_off in select distinct warehouse_id from _taqsim loop
      insert into dori_order_splits (order_id, warehouse_id)
      values (p_order_id, r_off.warehouse_id)
      on conflict (order_id, warehouse_id) do update set updated_at = now()
      returning id into v_split;

      delete from dori_split_items where split_id = v_split;

      insert into dori_split_items (split_id, order_item_id, product_id, name, qty,
                                    base_price, price, base_sum, sell_sum)
      select v_split, t.order_item_id, t.product_id, t.name, t.qty,
             t.base_price, t.price,
             round(coalesce(t.base_price, 0) * t.qty, 2),
             round(coalesce(t.price, 0) * t.qty, 2)
      from _taqsim t
      where t.warehouse_id = r_off.warehouse_id;

      update dori_order_splits s
         set base_total = coalesce((select sum(base_sum) from dori_split_items i where i.split_id = s.id), 0),
             sell_total = coalesce((select sum(sell_sum) from dori_split_items i where i.split_id = s.id), 0),
             updated_at = now()
       where s.id = v_split;
    end loop;

    update dori_order_items i
       set yetishmadi = y.qty
      from _yetishmadi y
     where i.id = y.order_item_id;

    update dori_order_items i
       set yetishmadi = null
     where i.order_id = p_order_id
       and i.yetishmadi is not null
       and not exists (select 1 from _yetishmadi y where y.order_item_id = i.id);
  end if;

  select jsonb_build_object(
    'ok', true,
    'buyurtma', p_order_id,
    'qollandi', p_apply,
    'skladlar', coalesce((
      select jsonb_agg(x order by x.sklad) from (
        select w.name as sklad, t.warehouse_id,
               count(*) as pozitsiya,
               sum(round(coalesce(t.base_price, 0) * t.qty, 2)) as tannarx_jami,
               sum(round(coalesce(t.price, 0) * t.qty, 2)) as sotuv_jami,
               jsonb_agg(jsonb_build_object('name', t.name, 'qty', t.qty) order by t.name) as pozitsiyalar
        from _taqsim t
        left join dori_warehouses w on w.id = t.warehouse_id
        group by w.name, t.warehouse_id
      ) x
    ), '[]'::jsonb),
    'yetishmadi', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'qty', qty) order by name)
      from _yetishmadi
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_order_split_ichki(uuid, boolean)
  from public, anon, authenticated, service_role;

-- ---------- 3. Oldindan ko'rish endi HAQIQATNI aytadi ----------
-- Hisoblagich bilan bir xil mantiq: dori > guruh > SKLAD > umumiy.
-- Taklif qilingan qoida o'z darajasiga qo'yiladi va natija shu bo'yicha
-- hisoblanadi. Katalog narxi - eng arzon taklif narxi.
create or replace function public.dori_price_preview(
  p_scope        text,
  p_target_key   text default null,
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null,
  p_markup_sum   numeric default null,
  p_discount_sum numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_round int;
  v_rank  int := case p_scope when 'product' then 1 when 'group' then 2 else 4 end;
  v_res   jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(rounding, 0) into v_round from dori_settings where id;

  with baza as (
    select o.warehouse_id, o.product_id, p.name, p.grp,
           coalesce(o.base_price, 0) as tannarx,
           w.priority, w.name as sklad,
           w.markup_pct as w_mpct, w.markup_sum as w_msum,
           w.discount_pct as w_dpct, w.discount_sum as w_dsum
    from dori_offers o
    join dori_products p on p.id = o.product_id
    join dori_warehouses w on w.id = o.warehouse_id and w.is_active
    where p.is_active and o.base_price is not null
      and (
        p_scope = 'global'
        or (p_scope = 'group'   and p.grp = p_target_key)
        or (p_scope = 'product' and p.id::text = p_target_key)
      )
  ),
  qoidalar as (
    select b.*,
           -- Mavjud dori/guruh qoidasi
           sp.pct as sp_pct, sp.summa as sp_sum, sp.rank as sp_rank,
           sd.pct as sd_pct, sd.summa as sd_sum, sd.rank as sd_rank,
           gu.pct as gu_pct, gu.summa as gu_sum,
           gd.pct as gd_pct, gd.summa as gd_sum
    from baza b
    left join lateral (
      select r.markup_pct as pct, r.markup_sum as summa,
             case r.scope when 'product' then 1 else 2 end as rank
      from dori_price_rules r
      where r.is_active and (r.markup_pct is not null or r.markup_sum is not null)
        and ((r.scope = 'product' and r.target_key = b.product_id::text)
          or (r.scope = 'group'   and r.target_key = b.grp))
      order by case r.scope when 'product' then 1 else 2 end
      limit 1
    ) sp on true
    left join lateral (
      select r.discount_pct as pct, r.discount_sum as summa,
             case r.scope when 'product' then 1 else 2 end as rank
      from dori_price_rules r
      where r.is_active and (r.discount_pct is not null or r.discount_sum is not null)
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
  -- Taklif qilinayotgan qoida o'z darajasiga qo'yiladi
  taklif as (
    select q.*,
           case when v_rank <= 2 then p_markup_pct   else q.sp_pct end as t_sp_pct,
           case when v_rank <= 2 then p_markup_sum   else q.sp_sum end as t_sp_sum,
           case when v_rank <= 2 then p_discount_pct else q.sd_pct end as t_sd_pct,
           case when v_rank <= 2 then p_discount_sum else q.sd_sum end as t_sd_sum,
           case when v_rank = 4  then p_markup_pct   else q.gu_pct end as t_gu_pct,
           case when v_rank = 4  then p_markup_sum   else q.gu_sum end as t_gu_sum,
           case when v_rank = 4  then p_discount_pct else q.gd_pct end as t_gd_pct,
           case when v_rank = 4  then p_discount_sum else q.gd_sum end as t_gd_sum
    from qoidalar q
  ),
  tanlov as (
    select warehouse_id, product_id, name, sklad, priority, tannarx,
           w_mpct, w_msum,
           case
             when t_sp_pct is not null or t_sp_sum is not null then coalesce(t_sp_pct, 0)
             when w_mpct   is not null or w_msum   is not null then coalesce(w_mpct, 0)
             else coalesce(t_gu_pct, 0)
           end as pct,
           case
             when t_sp_pct is not null or t_sp_sum is not null then coalesce(t_sp_sum, 0)
             when w_mpct   is not null or w_msum   is not null then coalesce(w_msum, 0)
             else coalesce(t_gu_sum, 0)
           end as summa,
           case
             when t_sd_pct is not null or t_sd_sum is not null then coalesce(t_sd_pct, 0)
             when w_dpct   is not null or w_dsum   is not null then coalesce(w_dpct, 0)
             else coalesce(t_gd_pct, 0)
           end as dpct,
           case
             when t_sd_pct is not null or t_sd_sum is not null then coalesce(t_sd_sum, 0)
             when w_dpct   is not null or w_dsum   is not null then coalesce(w_dsum, 0)
             else coalesce(t_gd_sum, 0)
           end as dsumma,
           -- Shu daraja sklad ustamasidan kuchlimi?
           (t_sp_pct is not null or t_sp_sum is not null) as ustun
    from taklif
  ),
  hisob as (
    select product_id, name, sklad, priority, tannarx, ustun, w_mpct, w_msum,
           greatest(
             case when v_round > 0
               then round(((tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma) / v_round) * v_round
               else round((tannarx * (1 + pct / 100) + summa) * (1 - dpct / 100) - dsumma)
             end, 0) as yangi
    from tanlov
  ),
  arzon as (
    select distinct on (product_id) product_id, name, tannarx, yangi, sklad, ustun, w_mpct, w_msum
    from hisob
    order by product_id, yangi, priority, sklad
  ),
  solishtir as (
    select a.*, p.price as hozirgi
    from arzon a join dori_products p on p.id = a.product_id
  )
  select jsonb_build_object(
    'dorilar',  (select count(*) from solishtir),
    'ozgaradi', (select count(*) from solishtir where yangi is distinct from hozirgi),
    'namuna',   (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                   select name, tannarx, hozirgi, yangi from solishtir
                   where yangi is distinct from hozirgi
                   order by name limit 8
                 ) t),
    -- Umumiy foiz qo'yilganda o'z ustamasi bor skladlar chetda qoladi -
    -- buni aytmasak, foydalanuvchi "foiz qo'shilmadi" deb o'ylaydi
    'chetda_qolgan_skladlar', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'sklad', w.name, 'ustama_pct', w.markup_pct, 'ustama_sum', w.markup_sum)
               order by w.name), '[]'::jsonb)
      from dori_warehouses w
      where w.is_active
        and (w.markup_pct is not null or w.markup_sum is not null)
        and v_rank = 4
    )
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_price_preview(text, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.dori_price_preview(text, text, numeric, numeric, numeric, numeric) to authenticated;

-- Eski 4 argumentli chaqiruv ham ishlab tursin (panel yangilangunicha)
create or replace function public.dori_price_preview(
  p_scope        text,
  p_target_key   text default null,
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.dori_price_preview(p_scope, p_target_key, p_markup_pct, p_discount_pct, null, null);
$$;

revoke all on function public.dori_price_preview(text, text, numeric, numeric) from public, anon;
grant execute on function public.dori_price_preview(text, text, numeric, numeric) to authenticated;

-- ---------- 4. Narxlarni qayta hisoblab, katalogni tiklash ----------
select public.dori_offer_narx(null, null);
select public.dori_katalog_yigish(null);
