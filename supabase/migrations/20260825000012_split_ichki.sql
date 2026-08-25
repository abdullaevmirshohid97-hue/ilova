-- =============================================================
--  TAQSIMLASH: BOT UCHUN HAM OCHIQ BO'LDI
--
--  dori_order_split() ichida is_super_admin() bor edi. Mijoz botda
--  buyurtma bergani zahoti taqsimlash kerak, botni esa service_role
--  bilan edge funksiya chaqiradi - u super admin emas.
--
--  Shuning uchun mantiq ICHKI funksiyaga ko'chirildi va ustiga ikkita
--  qobiq qo'yildi:
--      dori_order_split      -> super admin (panel)
--      dori_order_split_srv  -> service_role (bot va edge funksiya)
--  Ichki funksiyaning o'zi hech kimga ochiq emas: unga faqat shu ikki
--  qobiq (SECURITY DEFINER, ya'ni postgres nomidan) kira oladi.
-- =============================================================

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

    -- 1-qoida: bitta skladda to'liq bormi? Bo'lsa - bo'lmaymiz.
    select o.warehouse_id, o.base_price
      into r_off
    from dori_offers o
    join dori_warehouses w on w.id = o.warehouse_id
    where o.product_id = r_item.product_id
      and w.is_active
      and coalesce(o.stock, 0) >= v_qoldi
    order by o.price nulls last, w.priority, w.name
    limit 1;

    if found then
      insert into _taqsim
      values (r_off.warehouse_id, r_item.product_id, r_item.id, r_item.name,
              v_qoldi, r_off.base_price, r_item.price);
      v_qoldi := 0;
    else
      -- 2-qoida: arzonidan to'ldirib boramiz
      for r_off in
        select o.warehouse_id, o.base_price, coalesce(o.stock, 0) as stock
        from dori_offers o
        join dori_warehouses w on w.id = o.warehouse_id
        where o.product_id = r_item.product_id
          and w.is_active
          and coalesce(o.stock, 0) > 0
        order by o.price nulls last, w.priority, w.name
      loop
        exit when v_qoldi <= 0;
        v_ol := least(r_off.stock, v_qoldi);
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
    -- Qayta hisoblash: eski taqsimot o'chadi. Skladga ALLAQACHON
    -- yuborilgani saqlanib qolsin - uni bekor qilish alohida qaror.
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


-- Ichki funksiya HECH KIMGA ochilmaydi: unga faqat quyidagi qobiqlar
-- (SECURITY DEFINER) orqali kiriladi
revoke all on function public.dori_order_split_ichki(uuid, boolean) from public, anon, authenticated, service_role;

-- ---------- Panel uchun ----------
create or replace function public.dori_order_split(
  p_order_id uuid,
  p_apply    boolean default true
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
  return dori_order_split_ichki(p_order_id, p_apply);
end $$;

revoke all on function public.dori_order_split(uuid, boolean) from public, anon;
grant execute on function public.dori_order_split(uuid, boolean) to authenticated;

-- ---------- Bot va edge funksiya uchun ----------
create or replace function public.dori_order_split_srv(
  p_order_id uuid,
  p_apply    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return dori_order_split_ichki(p_order_id, p_apply);
end $$;

revoke all on function public.dori_order_split_srv(uuid, boolean) from public, anon, authenticated;
grant execute on function public.dori_order_split_srv(uuid, boolean) to service_role;
