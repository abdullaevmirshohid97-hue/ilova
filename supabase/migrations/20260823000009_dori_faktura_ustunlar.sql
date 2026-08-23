-- =============================================================
--  FAKTURAGA QO'SHIMCHA USTUNLAR: seriya, muddat, ishlab chiqaruvchi
--
--  Buyurtma qatorida hozir faqat nom, soni va narx bor edi. Fakturada
--  esa dorining seriyasi, yaroqlilik muddati va ishlab chiqaruvchisi
--  ham bo'lishi shart (dorixona hisobotining talabi).
--
--  MUZLATIB SAQLANADI: bu qiymatlar buyurtma paytida yozib qo'yiladi.
--  Katalogdagi narx yoki partiya keyin o'zgarsa ham, eski faktura
--  o'zgarmaydi — chunki u yuborilgan hujjat.
--
--  PARTIYA TANLASH (FEFO): bir dorining bir necha partiyasi bo'lsa,
--  muddati eng yaqini olinadi — dorixonada tovar shu tartibda sotiladi.
--
--  ISHLAB CHIQARILGAN SANA: postavshchik faylida bunday ustun YO'Q
--  (faqat "Срок годности" bor). Ustun qo'shildi va faktura uni
--  ko'rsatadi, lekin manba paydo bo'lmaguncha bo'sh turadi — mavjud
--  bo'lmagan sanani o'ylab topib yozib qo'yish mumkin emas.
-- =============================================================

alter table public.dori_order_items
  add column if not exists manufacturer text,
  add column if not exists series       text,
  add column if not exists expiry       date,
  add column if not exists made_at      date;

alter table public.dori_products
  add column if not exists made_at date;

alter table public.dori_batches
  add column if not exists made_at date;

-- ---------- Buyurtma yaratish: qiymatlarni muzlatib yozadi ----------
create or replace function public.dori_bot_order_create(p_chat_id bigint, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_no    bigint;
  v_jami  numeric(16,2);
  v_mijoz record;
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

  insert into dori_orders (chat_id, name, phone, pharmacy, comment)
  values (p_chat_id, v_mijoz.name, v_mijoz.phone, v_mijoz.pharmacy, nullif(trim(p_comment), ''))
  returning id, order_no into v_id, v_no;

  insert into dori_order_items (
    order_id, product_id, name, price, qty, sum,
    manufacturer, series, expiry, made_at
  )
  select v_id, p.id, p.name, coalesce(p.price, 0), c.qty, coalesce(p.price, 0) * c.qty,
         p.manufacturer, b.series, b.expiry, coalesce(b.made_at, p.made_at)
  from dori_cart c
  join dori_products p on p.id = c.product_id
  -- FEFO: muddati eng yaqin partiya (o'tib ketganlari oxirida)
  left join lateral (
    select b.series, b.expiry, b.made_at
    from dori_batches b
    where b.product_id = p.id
    order by (b.expiry is null),
             (b.expiry < current_date),
             b.expiry
    limit 1
  ) b on true
  where c.chat_id = p_chat_id;

  select coalesce(sum(sum), 0) into v_jami from dori_order_items where order_id = v_id;
  update dori_orders set total = v_jami where id = v_id;

  delete from dori_cart where chat_id = p_chat_id;

  return jsonb_build_object('ok', true, 'order_id', v_id, 'order_no', v_no, 'total', v_jami);
end $$;

revoke all on function public.dori_bot_order_create(bigint, text) from public, anon, authenticated;
grant execute on function public.dori_bot_order_create(bigint, text) to service_role;

-- ---------- Faktura: yangi ustunlar bilan ----------
create or replace function public.dori_invoice_for_chat(
  p_order_id uuid,
  p_chat_id  bigint
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
  select jsonb_build_object(
    'order_no',   o.order_no,
    'created_at', o.created_at,
    'status',     o.status,
    'total',      o.total,
    'comment',    o.comment,
    'customer', jsonb_build_object(
      'name',     o.name,
      'phone',    o.phone,
      'pharmacy', o.pharmacy
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'line_no',      t.n,
               'name',         t.name,
               'manufacturer', t.manufacturer,
               'series',       t.series,
               'made_at',      t.made_at,
               'expiry',       t.expiry,
               'qty',          t.qty,
               'price',        t.price,
               'sum',          t.sum
             ) order by t.n)
      from (
        select row_number() over (order by i.id) as n,
               i.name, i.qty, i.price, i.sum,
               -- Eski buyurtmalarda bu ustunlar bo'sh: o'shanda katalogdan
               -- to'ldiramiz, shunda eski fakturalar ham to'liq chiqadi
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
  )
  into v_res
  from dori_orders o
  where o.id = p_order_id
    and o.chat_id = p_chat_id;

  return v_res;
end $$;

revoke all on function public.dori_invoice_for_chat(uuid, bigint) from public, anon, authenticated;
grant execute on function public.dori_invoice_for_chat(uuid, bigint) to service_role;
