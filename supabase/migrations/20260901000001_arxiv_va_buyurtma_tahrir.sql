-- =============================================================
--  ESKI ARXIVNI O'CHIRISH, BUYURTMANI TAHRIRLASH, YIG'ISH FAKTURASI
--
--  Uch talab:
--
--  1) DORI modulidagi eski prays/faktura arxivini o'chirish. Bu FAQAT
--     saqlangan hujjat: katalogga, takliflarga va narxlarga tegmaydi.
--     Bir marta katalogga yozilgan prays o'sha yerda qoladi.
--
--  2) Buyurtmani tahrirlash va o'chirish. Tahrirlashda miqdor
--     o'zgaradi yoki pozitsiya olib tashlanadi; summa qayta hisoblanadi
--     va taqsimot QAYTA quriladi - aks holda skladlarga eski miqdor
--     ketib qolardi.
--
--  3) Yig'ish fakturasi: omborchi uchun hujjat. Unda narx YO'Q (sklad
--     bizning ustamamizni ko'rmasligi kerak), lekin yig'ish uchun kerak
--     bo'lgan hamma narsa bor: nom, ishlab chiqaruvchi, seriya, ishlab
--     chiqarilgan sana, yaroqlilik muddati, dona va QAYSI SKLAD.
-- =============================================================

-- ---------- 1. Arxivdagi hujjatni o'chirish ----------
create or replace function public.dori_invoice_ochir(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', true, 'ochirildi', 0);
  end if;

  -- Qatorlar cascade bilan ketadi. Katalog va takliflarga TEGILMAYDI:
  -- bu shunchaki o'qilgan faylning nusxasi.
  delete from dori_invoices where id = any (p_ids);
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'ochirildi', v_n);
end $$;

revoke all on function public.dori_invoice_ochir(uuid[]) from public, anon;
grant execute on function public.dori_invoice_ochir(uuid[]) to authenticated;

-- ---------- 2. Buyurtmani o'chirish ----------
create or replace function public.dori_buyurtma_ochir(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no bigint;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select order_no into v_no from dori_orders where id = p_order_id;
  if v_no is null then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  -- Pozitsiyalar va skladlarga ketgan so'rovlar cascade bilan o'chadi
  delete from dori_orders where id = p_order_id;

  return jsonb_build_object('ok', true, 'order_no', v_no);
end $$;

revoke all on function public.dori_buyurtma_ochir(uuid) from public, anon;
grant execute on function public.dori_buyurtma_ochir(uuid) to authenticated;

-- ---------- 3. Pozitsiyani tahrirlash ----------
-- Miqdor 0 bo'lsa pozitsiya o'chadi. Har o'zgarishdan keyin summa
-- qayta hisoblanadi va taqsimot QAYTA quriladi.
create or replace function public.dori_buyurtma_qator(p_item_id bigint, p_qty numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid;
  v_jami  numeric(16,2);
  v_qoldi int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select order_id into v_order from dori_order_items where id = p_item_id;
  if v_order is null then
    raise exception 'POZITSIYA_TOPILMADI';
  end if;

  if coalesce(p_qty, 0) <= 0 then
    delete from dori_order_items where id = p_item_id;
  else
    update dori_order_items
       set qty = p_qty,
           sum = round(price * p_qty, 2)
     where id = p_item_id;
  end if;

  select count(*), coalesce(sum(sum), 0) into v_qoldi, v_jami
  from dori_order_items where order_id = v_order;

  update dori_orders set total = v_jami, updated_at = now() where id = v_order;

  -- Taqsimot eskirdi: yangi miqdorga qarab qayta quriladi.
  -- Skladga ALLAQACHON yuborilgan so'rov saqlanadi (uni bekor qilish
  -- alohida qaror), faqat "yangi" holatdagilari qayta hisoblanadi.
  if v_qoldi > 0 then
    perform dori_order_split_ichki(v_order, true);
  else
    delete from dori_order_splits where order_id = v_order and status in ('new', 'cancelled');
  end if;

  return jsonb_build_object('ok', true, 'jami', v_jami, 'pozitsiya', v_qoldi);
end $$;

revoke all on function public.dori_buyurtma_qator(bigint, numeric) from public, anon;
grant execute on function public.dori_buyurtma_qator(bigint, numeric) to authenticated;

-- ---------- 4. Pozitsiya qaysi skladlarda bor ----------
-- Mijoz tanlagan dori qaysi skladlarda, qancha va qanday narxda -
-- operator buni buyurtmani ochganda ko'rib tursin.
create or replace function public.dori_buyurtma_skladlar(p_order_id uuid)
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

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v
  from (
    select i.id as item_id, i.name, i.qty,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sklad', w.name,
                      'price', o.price,
                      'base_price', o.base_price,
                      'stock', o.stock
                    ) order by o.price)
             from dori_offers o
             join dori_warehouses w on w.id = o.warehouse_id and w.is_active
             where o.product_id = i.product_id
               and o.price is not null and o.price > 0
           ), '[]'::jsonb) as skladlar
    from dori_order_items i
    where i.order_id = p_order_id
  ) t;

  return v;
end $$;

revoke all on function public.dori_buyurtma_skladlar(uuid) from public, anon;
grant execute on function public.dori_buyurtma_skladlar(uuid) to authenticated;

-- ---------- 5. Buyurtma fakturasi (mijoz narxida) ----------
create or replace function public.dori_buyurtma_faktura_srv(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'sarlavha',   'BUYURTMA FAKTURASI',
    'taraf_nom',  'Mijoz:',
    'order_no',   o.order_no,
    'created_at', o.created_at,
    'status',     o.status,
    'total',      o.total,
    'comment',    o.comment,
    'customer', jsonb_build_object(
      'name', coalesce(o.name, '—'), 'phone', coalesce(o.phone, '—'), 'pharmacy', o.pharmacy
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', t.n, 'name', t.name, 'manufacturer', t.manufacturer,
               'series', t.series, 'made_at', t.made_at, 'expiry', t.expiry,
               'qty', t.qty, 'price', t.price, 'sum', t.sum
             ) order by t.n)
      from (
        select row_number() over (order by i.id) as n,
               i.name, i.qty, i.price, i.sum,
               coalesce(i.manufacturer, p.manufacturer) as manufacturer,
               coalesce(i.series, b.series)             as series,
               coalesce(i.expiry, b.expiry)             as expiry,
               coalesce(i.made_at, b.made_at, p.made_at) as made_at
        from dori_order_items i
        left join dori_products p on p.id = i.product_id
        left join lateral (
          select b.series, b.expiry, b.made_at
          from dori_batches b
          where b.product_id = i.product_id
          order by (b.expiry is null), (b.expiry < current_date), b.expiry
          limit 1
        ) b on true
        where i.order_id = o.id
      ) t
    ), '[]'::jsonb)
  ) into v
  from dori_orders o
  where o.id = p_order_id;

  return v;
end $$;

revoke all on function public.dori_buyurtma_faktura_srv(uuid) from public, anon, authenticated;
grant execute on function public.dori_buyurtma_faktura_srv(uuid) to service_role;

-- ---------- 6. YIG'ISH FAKTURASI ----------
-- Omborchi uchun: nima, qancha va QAYSI SKLADDAN olinadi.
-- Narx YO'Q - sklad bizning ustamamizni ko'rmasligi kerak, omborchiga
-- esa u umuman kerak emas.
--
-- Manba: taqsimot (dori_split_items). Taqsimlanmagan pozitsiyalar ham
-- ko'rinadi - "sklad topilmadi" deb, chunki ularni ham yig'ish kerak
-- yoki mijozga aytish kerak.
create or replace function public.dori_yigish_faktura_srv(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'sarlavha',   'YIG''ISH VARAQASI',
    'taraf_nom',  'Mijoz:',
    'ustunlar',   'yigish',
    'order_no',   o.order_no,
    'created_at', o.created_at,
    'status',     o.status,
    'total',      null,
    'comment',    o.comment,
    'customer', jsonb_build_object(
      'name', coalesce(o.name, '—'), 'phone', coalesce(o.phone, '—'), 'pharmacy', o.pharmacy
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no', t.n, 'name', t.name, 'manufacturer', t.manufacturer,
               'series', t.series, 'made_at', t.made_at, 'expiry', t.expiry,
               'qty', t.qty, 'sklad', t.sklad
             ) order by t.n)
      from (
        select row_number() over (order by w.name nulls last, si.name) as n,
               si.name, si.qty,
               coalesce(w.name, 'sklad topilmadi') as sklad,
               p.manufacturer,
               b.series, b.expiry, b.made_at
        from dori_order_splits s
        join dori_split_items si on si.split_id = s.id
        left join dori_warehouses w on w.id = s.warehouse_id
        left join dori_products p on p.id = si.product_id
        left join lateral (
          select b.series, b.expiry, b.made_at
          from dori_batches b
          where b.product_id = si.product_id
            and b.warehouse_id = s.warehouse_id
          order by (b.expiry is null), (b.expiry < current_date), b.expiry
          limit 1
        ) b on true
        where s.order_id = o.id and s.status <> 'cancelled'

        union all

        -- Taqsimotga tushmagan pozitsiyalar (yetishmagan yoki
        -- taqsimlanmagan) ham varaqada ko'rinsin
        select 999 as n, i.name, coalesce(i.yetishmadi, i.qty) as qty,
               'TAQSIMLANMAGAN' as sklad,
               coalesce(i.manufacturer, p2.manufacturer) as manufacturer,
               null::text as series, null::date as expiry, null::date as made_at
        from dori_order_items i
        left join dori_products p2 on p2.id = i.product_id
        where i.order_id = o.id
          and (i.yetishmadi is not null and i.yetishmadi > 0)
      ) t
    ), '[]'::jsonb)
  ) into v
  from dori_orders o
  where o.id = p_order_id;

  return v;
end $$;

revoke all on function public.dori_yigish_faktura_srv(uuid) from public, anon, authenticated;
grant execute on function public.dori_yigish_faktura_srv(uuid) to service_role;
