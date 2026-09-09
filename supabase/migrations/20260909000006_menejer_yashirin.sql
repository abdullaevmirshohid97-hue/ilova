-- =============================================================
-- YUKCHIBOLLA — menejer mijozlari korxonaga ko'rinmasin (SXEMA)
--
-- Model: menejer erkin sotuvchi. Mijoz uniki, korxonaniki emas.
-- Menejer mijozlarini yashirsa, korxona uchun XARIDOR — menejerning
-- o'zi bo'ladi:
--
--   mijoz  --buyurtma-->  menejer  --sotib olish-->  korxona
--   (menejer narxi)                  (baza narxi)
--
-- Shuning uchun har menejerga bitta "menejer-xaridor kartochkasi"
-- ochiladi (customers.proxy_manager_id). Buyurtma esa ikki tomonga
-- ishora qiladi:
--   customer_id       — HAQIQIY mijoz (menejer va mijozning o'zi ko'radi)
--   bill_customer_id  — korxona hisobni kimga yozadi
--
-- BU MIGRATSIYA PULGA TEGMAYDI. U faqat sxema, mantiq va siyosatlarni
-- qo'yadi; mijoz_korinsin esa mavjud menejerlarda TRUE bo'lib qoladi,
-- ya'ni bugungi ko'rinish o'zgarmaydi. Eski qarzni ko'chirish va
-- yashirishni yoqish — keyingi migratsiyada, quruq sinovdan keyin.
-- =============================================================

-- ---------- 1. Ustunlar ----------

-- Yangi menejer standart holatda yashirin (model shunday). Mavjudlar
-- esa TRUE bo'lib qoladi — pastdagi update'ga qarang.
alter table public.managers
  add column mijoz_korinsin boolean not null default false;

-- Bugungi holatni saqlaymiz: bu migratsiya hech kimning ko'rinishini
-- o'zgartirmasligi kerak
update public.managers set mijoz_korinsin = true;

-- Menejer-xaridor kartochkasi. manager_id EMAS: u "bu mijoz shu
-- menejerniki" degani, bu esa "bu qator menejerning O'ZI" degani.
alter table public.customers
  add column proxy_manager_id uuid unique references public.managers(id) on delete cascade;

comment on column public.customers.proxy_manager_id is
  'Bo''sh bo''lmasa — bu mijoz emas, menejerning korxona oldidagi xaridor kartochkasi.';

alter table public.orders
  add column bill_customer_id uuid references public.customers(id);

comment on column public.orders.bill_customer_id is
  'Korxona hisobni kimga yozadi. Yashirin menejer mijozida — menejer-xaridor kartochkasi, aks holda mijozning o''zi.';

-- ---------- 2. Ko'rinish qoidasi ----------

create or replace function public.mijoz_korinadimi(p_manager_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  -- Menejeri yo'q mijoz doim ko'rinadi. Menejer topilmasa ham
  -- ko'rinadi: yo'qolgan yozuv tufayli mijoz g'oyib bo'lmasin.
  select p_manager_id is null
      or coalesce((select m.mijoz_korinsin from public.managers m
                   where m.id = p_manager_id), true);
$$;

create or replace function public.set_my_mijoz_korinish(p_korinsin boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_korinsin is null then
    raise exception 'QIYMAT_YOQ';
  end if;
  update managers set mijoz_korinsin = p_korinsin where id = current_manager_id();
end $$;

grant execute on function public.set_my_mijoz_korinish(boolean) to authenticated;

-- ---------- 3. Menejer-xaridor kartochkasi ----------

create or replace function public.menejer_xaridori(p_manager_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id      uuid;
  v_mgr     record;
  v_group   uuid;
  v_tel     text;
  v_urinish int := 0;
begin
  select id into v_id from customers where proxy_manager_id = p_manager_id;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_mgr from managers where id = p_manager_id;
  if not found then
    raise exception 'MENEJER_TOPILMADI';
  end if;

  -- price_group_id majburiy. Qaysi tarif bo'lishi ahamiyatsiz: korxona
  -- menejerga BAZA narxida sotadi, tarif narxi ishlatilmaydi. Lekin
  -- ustun bo'sh qololmaydi, shuning uchun org'ning birinchi tarifi.
  select id into v_group from price_groups
  where org_id = v_mgr.org_id order by name limit 1;
  if v_group is null then
    raise exception 'TARIF_TOPILMADI: org %', v_mgr.org_id;
  end if;

  -- customers.phone GLOBAL unikal. Menejerning telefoni allaqachon
  -- mijoz sifatida band bo'lishi mumkin — o'shanda qo'shimcha belgi
  -- qo'shamiz. Telefonni saqlaymiz: admin menejerga qo'ng'iroq
  -- qilishi kerak bo'ladi.
  v_tel := v_mgr.phone;
  while exists (select 1 from customers where phone = v_tel) loop
    v_urinish := v_urinish + 1;
    v_tel := v_mgr.phone || ' (menejer' || case when v_urinish > 1 then ' ' || v_urinish else '' end || ')';
    if v_urinish > 20 then
      raise exception 'TELEFON_BAND: %', v_mgr.phone;
    end if;
  end loop;

  insert into customers (org_id, name, phone, price_group_id, proxy_manager_id,
                         display_currency, notes)
  values (v_mgr.org_id,
          v_mgr.name || ' (menejer)',
          v_tel,
          v_group,
          p_manager_id,
          'UZS',
          'Menejerning xaridor kartochkasi — avtomatik yaratilgan. Yashirin mijozlardan kelgan buyurtmalar shu yerga yoziladi.')
  returning id into v_id;

  return v_id;
end $$;

-- Yangi menejer ochilganda kartochka o'zi paydo bo'lsin — aks holda
-- birinchi buyurtmada bill_customer_id bo'sh qolardi
create or replace function public.tg_menejer_xaridori()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.menejer_xaridori(new.id);
  return new;
end $$;

create trigger trg_menejer_xaridori
  after insert on public.managers
  for each row execute function public.tg_menejer_xaridori();

-- Mavjud menejerlarga kartochka
do $$
declare r record;
begin
  for r in select id from public.managers loop
    perform public.menejer_xaridori(r.id);
  end loop;
end $$;

-- ---------- 4. Hisob kimga yoziladi ----------

create or replace function public.hisob_mijozi(p_customer_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select case
    when c.manager_id is not null and not public.mijoz_korinadimi(c.manager_id)
      -- Kartochka topilmasa mijozning o'ziga qaytamiz: bill_customer_id
      -- bo'sh qolsa buyurtma admin ro'yxatidan butunlay yo'qolardi
      then coalesce((select px.id from public.customers px
                     where px.proxy_manager_id = c.manager_id), c.id)
    else c.id
  end
  from public.customers c
  where c.id = p_customer_id;
$$;

-- Mavjud buyurtmalar: hozir hamma menejer ko'rinadigan holatda,
-- shuning uchun bu mijozning o'zini qo'yadi (hech narsa o'zgarmaydi)
update public.orders o
   set bill_customer_id = public.hisob_mijozi(o.customer_id)
 where o.bill_customer_id is null;

alter table public.orders alter column bill_customer_id set not null;

create index orders_bill_customer_idx on public.orders(bill_customer_id);

-- ---------- 5. Buyurtma yaratishda to'ldiriladi ----------
-- create_order va admin_create_order ichida `insert into orders`
-- bitta joyda — trigger bilan to'ldirish eng ishonchlisi: yangi
-- yo'l qo'shilsa ham ustun bo'sh qolmaydi.
create or replace function public.tg_orders_bill()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.bill_customer_id is null then
    new.bill_customer_id := public.hisob_mijozi(new.customer_id);
  end if;
  return new;
end $$;

create trigger trg_orders_bill
  before insert on public.orders
  for each row execute function public.tg_orders_bill();

-- ---------- 6. Ikki tomonlama qarz ----------

create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_item  record;
  v_org   uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if is_admin() then
    select org_id into v_org from customers where id = v_order.customer_id;
    if v_org is null or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  elsif is_manager() then
    if not exists (
      select 1 from customers where id = v_order.customer_id and manager_id = current_manager_id()
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    raise exception 'RUXSAT_YOQ';
  end if;

  if v_order.status <> 'new' then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  for v_item in
    select oi.variant_id, oi.qty, sl.reserved
    from order_items oi
    join stock_levels sl on sl.variant_id = oi.variant_id
    where oi.order_id = p_order_id
    order by oi.variant_id
    for update of sl
  loop
    if v_item.reserved < v_item.qty then
      raise exception 'REZERV_XATO: variant %', v_item.variant_id;
    end if;
  end loop;

  update stock_levels sl
     set reserved = sl.reserved - oi.qty,
         updated_at = now()
    from order_items oi
   where oi.order_id = p_order_id
     and sl.variant_id = oi.variant_id;

  insert into stock_movements (variant_id, qty, reason, order_id, created_by)
  select variant_id, -qty, 'order_out', p_order_id, auth.uid()
  from order_items where order_id = p_order_id;

  -- Mijozning menejer oldidagi qarzi — HAQIQIY (ustamali) narxda.
  -- Buni menejer va mijozning o'zi ko'radi.
  insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
  values (v_order.customer_id, v_order.total, 'order_debt', p_order_id, auth.uid());

  -- Yashirin sotuvda korxona menejerga sotgan hisoblanadi: uning
  -- qarzi — BAZA narxda, menejerning ustamasisiz. Ikkinchi yozuv
  -- menejer-xaridor kartochkasiga tushadi.
  if v_order.bill_customer_id is distinct from v_order.customer_id then
    insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
    values (v_order.bill_customer_id, v_order.base_total, 'order_debt', p_order_id, auth.uid());
  end if;

  update orders set status = 'confirmed', confirmed_at = now()
  where id = p_order_id;
end $$;

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_order record;
  v_org   uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'BUYURTMA_TOPILMADI';
  end if;

  if is_admin() then
    select org_id into v_org from customers where id = v_order.customer_id;
    if v_org is null or v_org <> current_org_id() then
      raise exception 'RUXSAT_YOQ';
    end if;
  elsif is_manager() then
    if not exists (
      select 1 from customers where id = v_order.customer_id and manager_id = current_manager_id()
    ) then
      raise exception 'RUXSAT_YOQ';
    end if;
  else
    if v_order.customer_id is distinct from current_customer_id()
       or v_order.status <> 'new' then
      raise exception 'RUXSAT_YOQ';
    end if;
  end if;

  if v_order.status in ('cancelled', 'done') then
    raise exception 'HOLAT_NOTOGRI: %', v_order.status;
  end if;

  if v_order.status = 'new' then
    update stock_levels sl
       set reserved = greatest(sl.reserved - oi.qty, 0),
           updated_at = now()
      from order_items oi
     where oi.order_id = p_order_id
       and sl.variant_id = oi.variant_id;
  else
    insert into stock_movements (variant_id, qty, reason, order_id, created_by)
    select variant_id, qty, 'order_cancel_return', p_order_id, auth.uid()
    from order_items where order_id = p_order_id;

    insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
    values (v_order.customer_id, -v_order.total, 'cancel_reversal', p_order_id, auth.uid());

    -- Tasdiqlashda ikkita yozuv bo'lgan bo'lsa, bekor qilishda ham
    -- ikkitasi qaytariladi. Bittasi qolib ketsa korxonada yolg'on
    -- qarz osilib turardi.
    if v_order.bill_customer_id is distinct from v_order.customer_id then
      insert into ledger_entries (customer_id, amount, kind, order_id, created_by)
      values (v_order.bill_customer_id, -v_order.base_total, 'cancel_reversal', p_order_id, auth.uid());
    end if;
  end if;

  update orders set status = 'cancelled' where id = p_order_id;
end $$;

-- ---------- 7. Siyosatlar ----------

-- Mijozlar: yashirin menejerning mijozi korxona xodimlariga (admin,
-- direktor) UMUMAN ko'rinmaydi. Menejer-xaridor kartochkasi esa
-- ko'rinadi — u korxonaning haqiqiy xaridori.
drop policy "customers: own read" on public.customers;
create policy "customers: own read" on public.customers
  for select to authenticated
  using (
    (is_admin() and org_id = current_org_id() and mijoz_korinadimi(manager_id))
    or id = current_customer_id()
  );

drop policy "customers: direktor read" on public.customers;
create policy "customers: direktor read" on public.customers
  for select to authenticated
  using (is_direktor() and org_id = current_org_id() and mijoz_korinadimi(manager_id));

-- "for all" siyosat USING orqali O'QISHNI ham beradi — bu yerda
-- filtrni unutish butun yashirishni bekor qilardi.
--
-- WITH CHECK'ga filtr QO'YILMAYDI: admin mijoz yaratib, uni menejerga
-- biriktira olishi kerak (CustomerNew shunday ishlaydi). Yaratilgan
-- qator darhol admindan yashirinadi — bu kutilgan holat.
drop policy "customers: admin write" on public.customers;
create policy "customers: admin write" on public.customers
  for all to authenticated
  using (is_admin() and org_id = current_org_id() and mijoz_korinadimi(manager_id))
  with check (is_admin() and org_id = current_org_id());

-- Buyurtmalar: korxona ularni BILL bo'yicha ko'radi. customer_id
-- bo'yicha qolsa, yashirin mijozning buyurtmasi admin ro'yxatidan
-- butunlay yo'qolardi — holbuki tovarni korxona jo'natadi.
drop policy "orders: own read" on public.orders;
create policy "orders: own read" on public.orders
  for select to authenticated
  using (
    (is_admin() and bill_customer_id in (
      select id from public.customers where org_id = current_org_id()
    ))
    or customer_id = current_customer_id()
  );

drop policy "orders: direktor read" on public.orders;
create policy "orders: direktor read" on public.orders
  for select to authenticated
  using (
    is_direktor()
    and bill_customer_id in (select id from public.customers where org_id = current_org_id())
  );

drop policy "order_items: own read" on public.order_items;
create policy "order_items: own read" on public.order_items
  for select to authenticated
  using (
    (is_admin() and order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.bill_customer_id
      where c.org_id = current_org_id()
    ))
    or order_id in (select id from public.orders where customer_id = current_customer_id())
  );

drop policy "order_items: direktor read" on public.order_items;
create policy "order_items: direktor read" on public.order_items
  for select to authenticated
  using (
    is_direktor()
    and order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.bill_customer_id
      where c.org_id = current_org_id()
    )
  );

-- ledger_entries va payments siyosatlari O'ZGARTIRILMAYDI: ular
-- "customer_id in (select id from customers where org_id = ...)"
-- deb yozilgan va bu ichki so'rovga customers RLS'i qo'llanadi.
-- Yashirin mijoz endi o'sha ro'yxatga tushmaydi, ya'ni uning qarzi
-- ham, to'lovi ham admindan o'z-o'zidan yopiladi.

-- Menejer o'z xaridor kartochkasini (korxona oldidagi qarzini)
-- ko'rsin — lekin faqat O'QISH
create policy "customers: xaridor kartochkam" on public.customers
  for select to authenticated
  using (proxy_manager_id = current_manager_id());

create policy "ledger_entries: xaridor kartochkam" on public.ledger_entries
  for select to authenticated
  using (customer_id in (
    select id from public.customers where proxy_manager_id = current_manager_id()
  ));

create policy "payments: xaridor kartochkam" on public.payments
  for select to authenticated
  using (customer_id in (
    select id from public.customers where proxy_manager_id = current_manager_id()
  ));
