-- =============================================================
-- YUKCHIBOLLA — yashirishni YOQISH va hisobni moslashtirish
--
-- 20260909000006 sxemani qo'ydi, lekin hech kimning ko'rinishini
-- o'zgartirmadi. Bu migratsiya moslashtirish MANTIQINI beradi;
-- yashirishni yoqish esa alohida chaqiriladi va QURUQ SINOVI bor.
--
-- Nima o'zgaradi (menejer yashirganda):
--   1. Uning mijozlari admin/direktorga ko'rinmay qoladi
--   2. Buyurtmalar korxonaga menejer nomidan ko'rinadi
--      (orders.bill_customer_id -> menejer-xaridor kartochkasi)
--   3. Korxona oldida QARZ menejerda paydo bo'ladi — BAZA narxda
--
-- Mijozning menejer oldidagi qarzi (ustamali) TEGILMAYDI: u
-- mijozning o'z yozuvi, menejer va mijoz uni ko'rib turadi. Ya'ni
-- amal QO'SHIMCHA — eski yozuvlar o'chirilmaydi.
--
-- Yashirish o'chirilsa (menejer qaytarsa) — korxona tomonidagi
-- yozuvlar olib tashlanadi, aks holda bitta buyurtma ikki marta
-- qarz bo'lib qolardi.
-- =============================================================

create or replace function public.menejer_hisobini_moslash(p_manager_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_proxy   uuid;
  v_korinsin boolean;
begin
  select mijoz_korinsin into v_korinsin from managers where id = p_manager_id;
  if not found then
    raise exception 'MENEJER_TOPILMADI';
  end if;

  v_proxy := menejer_xaridori(p_manager_id);

  -- 1. Buyurtmalar qaysi tomonga yozilishi qayta hisoblanadi.
  --    Buni o'tkazib yuborish eng nozik xato bo'lardi: eski
  --    buyurtmalarda bill_customer_id qadimgi qiymatda qolib,
  --    bekor qilishda qarz noto'g'ri tomondan qaytarilardi.
  update orders o
     set bill_customer_id = hisob_mijozi(o.customer_id)
   where o.customer_id in (select id from customers where manager_id = p_manager_id)
     and o.bill_customer_id is distinct from hisob_mijozi(o.customer_id);

  if not v_korinsin then
    -- 2. Yashirin: korxona oldida menejerning qarzi bo'lishi kerak.
    --    Faqat qarz allaqachon yozilgan (tasdiqlangan) buyurtmalar —
    --    'new' holatdagisiga confirm_order o'zi yozadi.
    insert into ledger_entries (customer_id, amount, kind, order_id, note)
    select v_proxy, o.base_total, 'order_debt', o.id,
           'Menejerga sotuv — baza narxda'
    from orders o
    where o.bill_customer_id = v_proxy
      and o.status in ('confirmed', 'picking', 'done')
      and not exists (
        select 1 from ledger_entries le
        where le.order_id = o.id and le.customer_id = v_proxy
      );
  else
    -- 3. Ko'rinadigan holatga qaytdi: korxona tomonidagi yozuvlar
    --    ortiqcha. Ular faqat SHU mexanizm yaratgan qatorlar —
    --    (buyurtma + menejer kartochkasi) juftligi bilan aniq
    --    topiladi, boshqa hech narsaga tegmaydi.
    delete from ledger_entries le
    using orders o
    where le.order_id = o.id
      and le.customer_id = v_proxy
      and o.customer_id in (select id from customers where manager_id = p_manager_id);
  end if;
end $$;

-- Menejer o'z sozlamasidan yoqib-o'chirganda hisob ham moslashadi.
-- Avvalgi versiya faqat belgini o'zgartirardi — eski buyurtmalar
-- eski tomonda qolib ketardi.
create or replace function public.set_my_mijoz_korinish(p_korinsin boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_korinsin is null then
    raise exception 'QIYMAT_YOQ';
  end if;

  v_id := current_manager_id();
  update managers set mijoz_korinsin = p_korinsin where id = v_id;
  perform menejer_hisobini_moslash(v_id);
end $$;

-- =============================================================
-- QURUQ SINOV + QO'LLASH
--
-- p_qollash = false (standart): nima o'zgarishini KO'RSATADI,
-- hech narsa yozmaydi. Natijani odam ko'radi, keyin qo'llaydi.
-- =============================================================
create or replace function public.menejer_yashirish(
  p_manager_id uuid default null,      -- null = shu org'ning hamma menejeri
  p_qollash    boolean default false
)
returns table(
  menejer            text,
  mijozlar           int,
  buyurtmalar        int,
  korxonaga_yoziladi numeric,
  menejerda_qoladi   numeric,
  ustama             numeric,
  tolovlar           int,
  holat              text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  r     record;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  v_org := current_org_id();

  for r in
    select m.id, m.name, m.mijoz_korinsin
    from managers m
    where m.org_id = v_org
      and (p_manager_id is null or m.id = p_manager_id)
    order by m.name
  loop
    -- Hisob-kitob QO'LLASHDAN OLDIN olinadi: quruq sinovda ham,
    -- haqiqiy amalda ham bir xil raqam chiqishi uchun
    select
      r.name,
      (select count(*)::int from customers c where c.manager_id = r.id),
      (select count(*)::int from orders o
        where o.customer_id in (select id from customers where manager_id = r.id)
          and o.status in ('confirmed', 'picking', 'done')),
      (select coalesce(sum(o.base_total), 0) from orders o
        where o.customer_id in (select id from customers where manager_id = r.id)
          and o.status in ('confirmed', 'picking', 'done')),
      (select coalesce(sum(o.total), 0) from orders o
        where o.customer_id in (select id from customers where manager_id = r.id)
          and o.status in ('confirmed', 'picking', 'done')),
      (select count(*)::int from payments p
        where p.customer_id in (select id from customers where manager_id = r.id))
    into menejer, mijozlar, buyurtmalar, korxonaga_yoziladi, menejerda_qoladi, tolovlar;

    ustama := menejerda_qoladi - korxonaga_yoziladi;

    if not r.mijoz_korinsin then
      holat := 'allaqachon yashirin';
    elsif p_qollash then
      update managers set mijoz_korinsin = false where id = r.id;
      perform menejer_hisobini_moslash(r.id);
      holat := 'QO''LLANDI';
    else
      holat := 'quruq sinov — hech narsa yozilmadi';
    end if;

    return next;
  end loop;
end $$;

comment on function public.menejer_yashirish(uuid, boolean) is
  'Quruq sinov standart. p_qollash=true bo''lgandagina yozadi.';

grant execute on function public.menejer_yashirish(uuid, boolean) to authenticated;
