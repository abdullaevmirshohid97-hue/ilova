-- =============================================================
--  QOLDIQ NOMA'LUM BO'LSA — CHEKLOV YO'Q
--
--  Tekshirganda ma'lum bo'ldi: hozirgi katalogda 6911 dorining
--  HAMMASIDA qoldiq bo'sh. Sababi - yuklanayotgan prays fayllarida
--  qoldiq ustuni umuman yo'q.
--
--  Agar bo'sh qoldiqni "nol" deb hisoblasak, butun katalog "Qolmadi"
--  bo'lib qolardi va hech kim hech narsa buyurtma qila olmasdi.
--
--  Shuning uchun uch holat farqlanadi:
--      stock IS NULL  -> NOMA'LUM: cheklov yo'q, "Qolmadi" yozilmaydi
--      stock = 0      -> TUGAGAN:  buyurtma berib bo'lmaydi
--      stock > 0      -> shuncha bor, undan ortiq berib bo'lmaydi
--
--  Ya'ni cheklov faqat qoldiq HAQIQATAN ma'lum bo'lganda ishlaydi.
--  Prays faylida qoldiq ustuni paydo bo'lgan kuni - o'zi ishlab ketadi,
--  kod o'zgartirish kerak emas.
-- =============================================================

-- ---------- 1. Katalog yig'ish: null'lar yig'indisi 0 emas ----------
create or replace function public.dori_katalog_yigish(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  with yig as (
    select p.id,
           (select min(o.price) from dori_offers o
             where o.product_id = p.id and o.price is not null
               and exists (select 1 from dori_warehouses w
                            where w.id = o.warehouse_id and w.is_active)) as narx,
           -- Hech bir skladda qoldiq ko'rsatilmagan bo'lsa - NULL qoladi
           -- (noma'lum), nol emas. sum() null'larni o'tkazib yuboradi va
           -- birortasi ham bo'lmasa null qaytaradi - bizga kerakli xatti-harakat.
           (select sum(o.stock) from dori_offers o
             where o.product_id = p.id and o.stock is not null
               and exists (select 1 from dori_warehouses w
                            where w.id = o.warehouse_id and w.is_active)) as qoldiq,
           (select min(o.base_price) from dori_offers o
             where o.product_id = p.id and o.base_price is not null) as tannarx,
           exists (select 1 from dori_offers o where o.product_id = p.id) as taklif_bor
    from dori_products p
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

-- ---------- 2. Savatga qo'shish ----------
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
  v_qoldiq numeric(16,3);   -- NULL = noma'lum
  v_bor    numeric(16,3);
  v_yangi  numeric(16,3);
begin
  if coalesce(p_qty, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'MIQDOR_NOTOGRI');
  end if;

  select name, price, stock into v_nom, v_narx, v_qoldiq
  from dori_products where id = p_product_id and is_active;

  if v_nom is null then
    return jsonb_build_object('ok', false, 'error', 'DORI_TOPILMADI');
  end if;

  -- Faqat ANIQ nol bo'lganda to'xtatamiz
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
    'ok', true,
    'name', v_nom,
    'price', v_narx,
    'qty', v_yangi,
    'qoldiq', v_qoldiq,
    'cheklandi', v_qoldiq is not null and (coalesce(v_bor, 0) + p_qty) > v_qoldiq
  );
end $$;

revoke all on function public.dori_bot_cart_add(bigint, uuid, numeric) from public, anon, authenticated;
grant execute on function public.dori_bot_cart_add(bigint, uuid, numeric) to service_role;

-- ---------- 3. Miqdorni tahrirlash ----------
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
begin
  select true, stock into v_bor, v_qoldiq
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

-- ---------- 4. Buyurtma ----------
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

  -- Qoldiq NOMA'LUM bo'lganlarga tegilmaydi
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
   where p.id = c.product_id
     and c.chat_id = p_chat_id
     and p.stock is not null and p.stock <= 0;

  update dori_cart c
     set qty = p.stock
    from dori_products p
   where p.id = c.product_id
     and c.chat_id = p_chat_id
     and p.stock is not null and c.qty > p.stock;

  if not exists (select 1 from dori_cart where chat_id = p_chat_id) then
    return jsonb_build_object('ok', false, 'error', 'QOLMADI', 'tushdi', v_tushdi);
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

-- ---------- 5. Katalog tartibi ----------
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
begin
  select jsonb_build_object(
    'jami', (
      select count(*) from dori_products p
      where p.is_active and p.price is not null
        and (v_grp is null or p.grp = v_grp)
    ),
    'items', coalesce((
      select jsonb_agg(t) from (
        select p.id, p.name, p.manufacturer, p.price, p.unit, p.grp,
               p.stock,          -- NULL bo'lishi mumkin: noma'lum
               (select min(b.expiry) from dori_batches b
                 where b.product_id = p.id and b.expiry >= current_date) as eng_yaqin_muddat
        from dori_products p
        where p.is_active
          and (v_grp is null or p.grp = v_grp)
          and p.price is not null
        -- Aniq tugaganlar oxirida; noma'lum qoldiq sotuvga xalaqit bermaydi
        order by (p.stock is null or p.stock > 0) desc, p.name
        offset v_off limit v_lim
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_catalog_page(text, int, int) from public, anon;
grant execute on function public.dori_catalog_page(text, int, int) to authenticated, service_role;

-- ---------- 6. Hozirgi katalogni tiklash ----------
-- Yuqoridagi 0 lar (aslida noma'lum) qaytadan null bo'lsin
select public.dori_katalog_yigish(null);
