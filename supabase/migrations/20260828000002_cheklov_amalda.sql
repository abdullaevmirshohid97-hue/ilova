-- =============================================================
--  QOLDIQ CHEKLOVI SOZLAMASI AMALDA
--
--  Cheklov o'chirilganda qoldiq FAQAT MA'LUMOT bo'lib qoladi: soni
--  ko'rinaveradi, lekin savatga qo'shishni ham, buyurtmani ham
--  to'xtatmaydi va taqsimotni cheklamaydi.
--
--  Amalga oshirish nayrangi: cheklov o'chiq bo'lsa qoldiq NULL
--  ("noma'lum") deb o'qiladi. Butun tizim allaqachon NULL ni
--  "cheklov yo'q" deb tushunadi, ya'ni har bir joyda alohida shart
--  yozish shart emas - bitta joydan boshqariladi.
-- =============================================================

-- ---------- 1. Savatga qo'shish ----------
create or replace function public.dori_bot_cart_add(
  p_chat_id    bigint,
  p_product_id uuid,
  p_qty        numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom    text;
  v_narx   numeric(16,2);
  v_qoldiq numeric(16,3);
  v_bor    numeric(16,3);
  v_yangi  numeric(16,3);
  v_chek   boolean := dori_cheklov_yoqilganmi();
begin
  if coalesce(p_qty, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'MIQDOR_NOTOGRI');
  end if;

  select name, price, case when v_chek then stock else null end
    into v_nom, v_narx, v_qoldiq
  from dori_products where id = p_product_id and is_active;

  if v_nom is null then
    return jsonb_build_object('ok', false, 'error', 'DORI_TOPILMADI');
  end if;

  if v_qoldiq is not null and v_qoldiq <= 0 then
    return jsonb_build_object('ok', false, 'error', 'QOLMADI', 'name', v_nom);
  end if;

  select coalesce(qty, 0) into v_bor
  from dori_cart where chat_id = p_chat_id and product_id = p_product_id;

  v_yangi := coalesce(v_bor, 0) + p_qty;

  if v_qoldiq is not null and v_yangi > v_qoldiq then
    v_yangi := v_qoldiq;
  end if;

  insert into dori_cart (chat_id, product_id, qty)
  values (p_chat_id, p_product_id, v_yangi)
  on conflict (chat_id, product_id) do update set qty = excluded.qty;

  return jsonb_build_object(
    'ok', true, 'name', v_nom, 'price', v_narx, 'qty', v_yangi, 'qoldiq', v_qoldiq,
    'cheklandi', v_qoldiq is not null and (coalesce(v_bor, 0) + p_qty) > v_qoldiq
  );
end $$;

revoke all on function public.dori_bot_cart_add(bigint, uuid, numeric) from public, anon, authenticated;
grant execute on function public.dori_bot_cart_add(bigint, uuid, numeric) to service_role;

-- ---------- 2. Miqdorni tahrirlash ----------
create or replace function public.dori_bot_cart_set(
  p_chat_id    bigint,
  p_product_id uuid,
  p_qty        numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qoldiq    numeric(16,3);
  v_bor       boolean;
  v_qty       numeric(16,3) := coalesce(p_qty, 0);
  v_cheklandi boolean := false;
  v_chek      boolean := dori_cheklov_yoqilganmi();
begin
  select true, case when v_chek then stock else null end
    into v_bor, v_qoldiq
  from dori_products where id = p_product_id and is_active;

  if not coalesce(v_bor, false) then
    return jsonb_build_object('ok', false, 'error', 'DORI_TOPILMADI');
  end if;

  if v_qty > 100000 then
    return jsonb_build_object('ok', false, 'error', 'MIQDOR_JUDA_KATTA');
  end if;

  if v_qty > 0 and v_qoldiq is not null and v_qoldiq <= 0 then
    delete from dori_cart where chat_id = p_chat_id and product_id = p_product_id;
    return jsonb_build_object('ok', false, 'error', 'QOLMADI',
                              'savat', public.dori_bot_cart(p_chat_id));
  end if;

  if v_qoldiq is not null and v_qty > v_qoldiq then
    v_qty := v_qoldiq;
    v_cheklandi := true;
  end if;

  if v_qty <= 0 then
    delete from dori_cart where chat_id = p_chat_id and product_id = p_product_id;
  else
    insert into dori_cart (chat_id, product_id, qty)
    values (p_chat_id, p_product_id, v_qty)
    on conflict (chat_id, product_id) do update set qty = excluded.qty;
  end if;

  return jsonb_build_object(
    'ok', true, 'qty', v_qty, 'qoldiq', v_qoldiq, 'cheklandi', v_cheklandi,
    'savat', public.dori_bot_cart(p_chat_id)
  );
end $$;

revoke all on function public.dori_bot_cart_set(bigint, uuid, numeric) from public, anon, authenticated;
grant execute on function public.dori_bot_cart_set(bigint, uuid, numeric) to service_role;

-- ---------- 3. Buyurtma ----------
create or replace function public.dori_bot_order_create(p_chat_id bigint, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         uuid;
  v_no         bigint;
  v_jami       numeric(16,2);
  v_mijoz      record;
  v_cheklangan jsonb := '[]'::jsonb;
  v_tushdi     jsonb := '[]'::jsonb;
  v_chek       boolean := dori_cheklov_yoqilganmi();
begin
  select * into v_mijoz from dori_customers where chat_id = p_chat_id;
  if v_mijoz.chat_id is null or v_mijoz.phone is null then
    return jsonb_build_object('ok', false, 'error', 'TANISHTIRILMAGAN');
  end if;
  if v_mijoz.is_blocked then
    return jsonb_build_object('ok', false, 'error', 'BLOKLANGAN');
  end if;

  if not exists (select 1 from dori_cart where chat_id = p_chat_id) then
    return jsonb_build_object('ok', false, 'error', 'SAVAT_BOSH');
  end if;

  -- Cheklov o'chiq bo'lsa savatga umuman tegilmaydi
  if v_chek then
    select coalesce(jsonb_agg(jsonb_build_object('name', p.name)), '[]'::jsonb)
      into v_tushdi
    from dori_cart c join dori_products p on p.id = c.product_id
    where c.chat_id = p_chat_id and p.stock is not null and p.stock <= 0;

    select coalesce(jsonb_agg(jsonb_build_object(
             'name', p.name, 'soralgan', c.qty, 'berildi', p.stock)), '[]'::jsonb)
      into v_cheklangan
    from dori_cart c join dori_products p on p.id = c.product_id
    where c.chat_id = p_chat_id and p.stock is not null and p.stock > 0 and c.qty > p.stock;

    delete from dori_cart c
     using dori_products p
     where p.id = c.product_id and c.chat_id = p_chat_id
       and p.stock is not null and p.stock <= 0;

    update dori_cart c
       set qty = p.stock
      from dori_products p
     where p.id = c.product_id and c.chat_id = p_chat_id
       and p.stock is not null and c.qty > p.stock;

    if not exists (select 1 from dori_cart where chat_id = p_chat_id) then
      return jsonb_build_object('ok', false, 'error', 'QOLMADI', 'tushdi', v_tushdi);
    end if;
  end if;

  insert into dori_orders (chat_id, name, phone, pharmacy, comment)
  values (p_chat_id, v_mijoz.name, v_mijoz.phone, v_mijoz.pharmacy, nullif(trim(p_comment), ''))
  returning id, order_no into v_id, v_no;

  insert into dori_order_items (order_id, product_id, name, price, qty, sum)
  select v_id, p.id, p.name, coalesce(p.price, 0), c.qty, coalesce(p.price, 0) * c.qty
  from dori_cart c
  join dori_products p on p.id = c.product_id
  where c.chat_id = p_chat_id;

  select coalesce(sum(sum), 0) into v_jami from dori_order_items where order_id = v_id;
  update dori_orders set total = v_jami where id = v_id;

  delete from dori_cart where chat_id = p_chat_id;

  return jsonb_build_object(
    'ok', true, 'order_id', v_id, 'order_no', v_no, 'total', v_jami,
    'cheklangan', v_cheklangan, 'tushdi', v_tushdi
  );
end $$;

revoke all on function public.dori_bot_order_create(bigint, text) from public, anon, authenticated;
grant execute on function public.dori_bot_order_create(bigint, text) to service_role;

-- ---------- 4. Katalog ----------
-- Mijoz ekrani "Qolmadi" yozuvini KO'RSATISH-ko'rsatmaslikni shu
-- bayroqdan biladi. Qoldiq soni baribir yuboriladi: cheklov o'chiq
-- bo'lsa ham "omborda 40 ta" degan ma'lumot foydali.
create or replace function public.dori_catalog_page(
  p_group  text default null,
  p_offset int  default 0,
  p_limit  int  default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
  v_lim int := least(coalesce(p_limit, 40), 60);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_grp text := nullif(trim(coalesce(p_group, '')), '');
  v_chek boolean := dori_cheklov_yoqilganmi();
begin
  select jsonb_build_object(
    'cheklov', v_chek,
    'jami', (
      select count(*) from dori_products p
      where p.is_active and p.price is not null
        and (v_grp is null or p.grp = v_grp)
    ),
    'items', coalesce((
      select jsonb_agg(t) from (
        select p.id, p.name, p.manufacturer, p.price, p.unit, p.grp,
               p.stock,
               (select min(b.expiry) from dori_batches b
                 where b.product_id = p.id and b.expiry >= current_date) as eng_yaqin_muddat
        from dori_products p
        where p.is_active
          and (v_grp is null or p.grp = v_grp)
          and p.price is not null
        order by (not v_chek or p.stock is null or p.stock > 0) desc, p.name
        offset v_off limit v_lim
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_catalog_page(text, int, int) from public, anon;
grant execute on function public.dori_catalog_page(text, int, int) to authenticated, service_role;

-- ---------- 5. Taqsimot ----------
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
  v_chek  boolean := dori_cheklov_yoqilganmi();
begin
  if not exists (select 1 from dori_orders where id = p_order_id) then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  drop table if exists _taqsim;
  create temp table _taqsim (
    warehouse_id uuid, product_id uuid, order_item_id bigint,
    name text, qty numeric(16,3), base_price numeric(16,2), price numeric(16,2)
  ) on commit drop;

  drop table if exists _yetishmadi;
  create temp table _yetishmadi (
    order_item_id bigint, name text, qty numeric(16,3)
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

    -- Doim ARZONIDAN to'ldiriladi. Cheklov o'chiq bo'lsa qoldiq
    -- hisobga olinmaydi: birinchi (eng arzon) sklad hammasini oladi.
    for r_off in
      select o.warehouse_id, o.base_price,
             case when v_chek then o.stock else null end as stock
      from dori_offers o
      join dori_warehouses w on w.id = o.warehouse_id
      where o.product_id = r_item.product_id
        and w.is_active
        and o.price is not null and o.price > 0
        and (not v_chek or o.stock is null or o.stock > 0)
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
    'ok', true, 'buyurtma', p_order_id, 'qollandi', p_apply,
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
