-- =============================================================
--  SKLADLAR — 4-bosqich: buyurtmani skladlarga taqsimlash
--
--  Misol (talab shundan kelgan): mijoz analgin 100 ta so'radi.
--  1-skladda 45, 2-da 25, 3-da 30. Uchala skladga ham so'rov ketishi
--  kerak, chunki mijozning talabi qondirilishi shart.
--
--  QOIDALAR:
--   1. Bitta skladda TO'LIQ bo'lsa - butun pozitsiya o'sha skladga
--      ketadi. Buyurtmani bekorga bo'lakka bo'lish sklad uchun ham,
--      yetkazish uchun ham qimmat.
--   2. Bo'lmasa - ARZONIDAN to'ldirib boriladi. Narx teng bo'lsa
--      skladning ustuvorligi (priority) hal qiladi.
--   3. Yetmagan miqdor "yetishmadi" bo'lib qoladi va ko'rinadi -
--      jimgina kamaytirib yuborilmaydi.
--   4. Bitta skladga tushgan HAMMA pozitsiya bitta so'rovga yig'iladi:
--      sklad uchta alohida xabar olmasin.
--
--  IKKI XIL SUMMA saqlanadi: skladga to'lanadigan (tannarx) va mijoz
--  ko'radigan (ustama qo'yilgan). Ular bir joyda turmasa, foyda qancha
--  degan savolga javob yo'qoladi.
--
--  DIQQAT: qoldiq BAND QILINMAYDI. Qoldiq prays faylidan keladi, ya'ni
--  u taxminiy. Haqiqiy bandlik skladning tasdig'i bilan bo'ladi -
--  shuning uchun taqsimot qayta hisoblanishi mumkin.
-- =============================================================

-- ---------- 1. Jadvallar ----------
create table if not exists public.dori_order_splits (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.dori_orders(id) on delete cascade,
  warehouse_id uuid references public.dori_warehouses(id) on delete set null,
  status       text not null default 'new'
               check (status in ('new', 'sent', 'accepted', 'rejected', 'done', 'cancelled')),
  base_total   numeric(16,2) not null default 0,   -- skladga to'lanadigan
  sell_total   numeric(16,2) not null default 0,   -- mijoz ko'radigan
  note         text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (order_id, warehouse_id)
);

create index if not exists dori_order_splits_wh_idx
  on public.dori_order_splits (warehouse_id, status, created_at desc);

alter table public.dori_order_splits enable row level security;

drop policy if exists "dori_order_splits: super_admin" on public.dori_order_splits;
create policy "dori_order_splits: super_admin"
  on public.dori_order_splits for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create table if not exists public.dori_split_items (
  id            bigserial primary key,
  split_id      uuid not null references public.dori_order_splits(id) on delete cascade,
  order_item_id bigint references public.dori_order_items(id) on delete set null,
  product_id    uuid references public.dori_products(id) on delete set null,
  name          text not null,
  qty           numeric(16,3) not null,
  base_price    numeric(16,2),
  price         numeric(16,2),
  base_sum      numeric(16,2),
  sell_sum      numeric(16,2)
);

create index if not exists dori_split_items_idx on public.dori_split_items (split_id);

alter table public.dori_split_items enable row level security;

drop policy if exists "dori_split_items: super_admin" on public.dori_split_items;
create policy "dori_split_items: super_admin"
  on public.dori_split_items for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- Yetishmagan miqdor buyurtma pozitsiyasining o'zida ko'rinsin
alter table public.dori_order_items
  add column if not exists yetishmadi numeric(16,3);

-- ---------- 2. Taqsimlash ----------
create or replace function public.dori_order_split(
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
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
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

revoke all on function public.dori_order_split(uuid, boolean) from public, anon;
grant execute on function public.dori_order_split(uuid, boolean) to authenticated, service_role;

-- ---------- 3. Taqsimotni o'qish ----------
create or replace function public.dori_order_taqsimot(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.sklad), '[]'::jsonb) into v
  from (
    select s.id, s.warehouse_id, w.name as sklad, w.phone, s.status,
           s.base_total, s.sell_total, s.sent_at, s.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name, 'qty', i.qty,
                      'base_price', i.base_price, 'price', i.price,
                      'base_sum', i.base_sum, 'sell_sum', i.sell_sum
                    ) order by i.name)
             from dori_split_items i where i.split_id = s.id
           ), '[]'::jsonb) as pozitsiyalar
    from dori_order_splits s
    left join dori_warehouses w on w.id = s.warehouse_id
    where s.order_id = p_order_id
  ) t;

  return v;
end $$;

revoke all on function public.dori_order_taqsimot(uuid) from public, anon;
grant execute on function public.dori_order_taqsimot(uuid) to authenticated, service_role;

-- ---------- 4. Holatni o'zgartirish ----------
create or replace function public.dori_split_holat(p_split_id uuid, p_status text, p_note text default null)
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
     set status  = p_status,
         note    = coalesce(nullif(trim(coalesce(p_note, '')), ''), note),
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         updated_at = now()
   where id = p_split_id;

  if not found then
    raise exception 'TAQSIMOT_TOPILMADI';
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_split_holat(uuid, text, text) from public, anon;
grant execute on function public.dori_split_holat(uuid, text, text) to authenticated;
