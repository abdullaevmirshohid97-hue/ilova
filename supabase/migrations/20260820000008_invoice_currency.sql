-- =============================================================
--  FAKTURADA VALYUTA: menejer dollarda sotgan bo'lsa, faktura ham
--  dollarda chiqishi kerak edi — lekin doim so'mda chiqayotgan edi.
--
--  Sabab: order_invoice* funksiyalari faqat `unit_price`/`total`ni
--  qaytarardi, ular esa HAR DOIM so'mda saqlanadi (USD narx buyurtma
--  paytida managers.usd_rate bo'yicha so'mga o'giriladi va qarz/ledger
--  shu so'm bo'yicha yuritiladi). Dollarning ASL summasi `order_items.
--  orig_price` da muzlatib qo'yilgan, lekin fakturaga chiqmagan.
--
--  Qoida mobil ilovadagi bilan AYNAN bir xil bo'lishi shart (OrdersScreen):
--  dollar ko'rsatiladi faqat mijozning display_currency='USD' bo'lsa VA
--  buyurtmadagi HAR BIR qator USD bo'lsa. Aralash buyurtma so'mda qoladi —
--  aks holda qatorlar yig'indisi jamiga to'g'ri kelmaydi.
--  Chegirmali qator ham so'mga tushadi: chegirma so'mda saqlanadi va
--  orig_price'ga tegmaydi, ya'ni dollar narx chegirmani ko'rsatmay qolardi.
--
--  Baza (rasmiy) narx esa HAR DOIM so'mda — u kompaniyaning price_group
--  narxi, unda valyuta tanlash umuman yo'q.
-- =============================================================

-- ---------- Qoida — bitta joyda ----------
-- Buyurtma dollarda ko'rsatilishi mumkinmi? Mumkin bo'lsa dollardagi
-- jami summani, aks holda NULL qaytaradi. Faktura ham, ro'yxatlar ham,
-- botdagi xabar ham SHU funksiyaga tayanadi — qoida ikkiga bo'linib
-- ketmasin (mobil ilovadagi mantiq bilan bir xil).
create or replace function public.order_usd_total(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.display_currency = 'USD'
            and exists (select 1 from order_items oi where oi.order_id = o.id)
            and not exists (
              select 1 from order_items oi
              where oi.order_id = o.id
                and (oi.currency is distinct from 'USD'
                     or oi.orig_price is null
                     or coalesce(oi.discount, 0) <> 0)
            )
           then (select sum(oi.orig_price * oi.qty)
                 from order_items oi where oi.order_id = o.id)
         end
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id;
$$;

revoke all on function public.order_usd_total(uuid) from anon, public;
grant execute on function public.order_usd_total(uuid) to authenticated, service_role;

-- ---------- Faktura mazmuni — bitta joyda ----------
-- Uchala RPC (panel, mijoz boti, xodim boti) endi shu funksiyani
-- chaqiradi va faqat RUXSATNI o'zi tekshiradi. p_baza = rasmiy narxmi.
create or replace function public.order_invoice_payload(
  p_order_id uuid,
  p_baza     boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_usd_total numeric;
  v_usd boolean;
  v_res jsonb;
begin
  if not exists (select 1 from orders where id = p_order_id) then
    return null;
  end if;

  -- Baza (rasmiy) narx doim so'mda: unda valyuta tanlash yo'q
  v_usd_total := case when p_baza then null else order_usd_total(p_order_id) end;
  v_usd := v_usd_total is not null;

  select jsonb_build_object(
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'comment',      o.comment,
    'org_name',     org.name,
    'currency',     case when v_usd then 'USD' else 'UZS' end,
    'price_kind',   case when p_baza then 'base' else 'real' end,
    'total', case
               when v_usd  then v_usd_total
               when p_baza then o.base_total
               else o.total
             end,
    -- Dollarli fakturada ham so'm summasi kerak: qarz/ledger shu bo'yicha
    -- yuritiladi, mijoz bilan hisob-kitobda ikkalasi ko'rinib tursin
    'total_uzs',  case when v_usd then o.total else null end,
    'base_total', o.base_total,
    'customer', jsonb_build_object(
      'name',  c.name,
      'phone', c.phone,
      'telegram_chat_id', c.telegram_chat_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       pr.name,
               'sku',        pv.sku,
               'size',       pv.size,
               'color',      pv.color,
               'qty',        oi.qty,
               'currency',   oi.currency,
               'orig_price', oi.orig_price,
               'discount',   oi.discount,
               'unit_price', case
                               when v_usd   then oi.orig_price
                               when p_baza  then oi.base_price
                               else oi.unit_price - coalesce(oi.discount, 0)
                             end,
               'line_total', case
                               when v_usd   then oi.orig_price * oi.qty
                               when p_baza  then oi.base_price * oi.qty
                               else (oi.unit_price - coalesce(oi.discount, 0)) * oi.qty
                             end,
               'image_path', (
                 select coalesce(pi.thumb_path, pi.storage_path)
                 from product_images pi
                 where pi.product_id = pr.id
                 order by pi.is_primary desc, pi.sort_order
                 limit 1
               )
             ) order by pr.name)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join products pr         on pr.id = pv.product_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_res
  from orders o
  join customers c            on c.id  = o.customer_id
  left join organizations org on org.id = c.org_id
  where o.id = p_order_id;

  return v_res;
end $$;

-- Yordamchi funksiya o'zi ruxsat tekshirmaydi, shuning uchun uni
-- TASHQARIDAN chaqirib bo'lmasligi kerak — faqat quyidagi uchta RPC ichidan.
revoke all on function public.order_invoice_payload(uuid, boolean) from anon, authenticated, public;

-- ---------- 1. Panel: admin / menejer / mijoz o'z JWT'si bilan ----------
-- Bu faktura MIJOZGA mo'ljallangan (panelda ko'riladi va mijozning
-- Telegramiga yuboriladi), shuning uchun narx doim HAQIQIY — admin
-- chaqirganda ham. Admin panelidagi baza narx alohida yo'l bilan
-- (Orders.tsx o'z so'rovi orqali) ko'rsatiladi.
create or replace function public.order_invoice(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ruxsat boolean;
begin
  select (
    is_super_admin()
    or (is_admin() and c.org_id = current_org_id())
    or (is_manager() and c.manager_id = current_manager_id())
    or c.id = current_customer_id()
  )
  into v_ruxsat
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id;

  if coalesce(v_ruxsat, false) = false then return null; end if;
  return order_invoice_payload(p_order_id, false);
end $$;

revoke all on function public.order_invoice(uuid) from anon, public;
grant execute on function public.order_invoice(uuid) to authenticated;

-- ---------- 2. Mijoz boti: chat_id bog'lanishi bo'yicha ----------
create or replace function public.order_invoice_for_chat(
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
  v_bor boolean;
begin
  select true into v_bor
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id
    and c.telegram_chat_id = p_chat_id;

  if not coalesce(v_bor, false) then return null; end if;
  return order_invoice_payload(p_order_id, false);
end $$;

revoke all on function public.order_invoice_for_chat(uuid, bigint) from anon, authenticated, public;
grant execute on function public.order_invoice_for_chat(uuid, bigint) to service_role;

-- ---------- 3. Xodim boti: admin baza narxni, menejer o'z narxini ----------
create or replace function public.order_invoice_for_staff_chat(
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
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_ruxsat  boolean;
begin
  select p.role, p.org_id, p.manager_id
    into v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_role is null then return null; end if;

  select (
    v_role = 'super_admin'
    or (v_role = 'admin'   and c.org_id     = v_org)
    or (v_role = 'manager' and c.manager_id = v_manager)
  )
  into v_ruxsat
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id;

  if coalesce(v_ruxsat, false) = false then return null; end if;
  return order_invoice_payload(p_order_id, v_role in ('admin', 'super_admin'));
end $$;

revoke all on function public.order_invoice_for_staff_chat(uuid, bigint) from anon, authenticated, public;
grant execute on function public.order_invoice_for_staff_chat(uuid, bigint) to service_role;

-- ---------- 4. Xodim botidagi ro'yxat ham valyutani bilsin ----------
-- Faktura dollarda, ro'yxatdagi summa so'mda chiqsa menejer chalkashadi.
create or replace function public.staff_orders_for_chat(
  p_chat_id bigint,
  p_status  text default null,
  p_limit   int  default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_baza    boolean;
  v_res     jsonb;
begin
  select p.role, p.org_id, p.manager_id
    into v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_role is null then return null; end if;
  v_baza := v_role in ('admin', 'super_admin');

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select o.id,
           o.order_number,
           o.status,
           o.created_at,
           (case when v_baza then o.base_total
                 else coalesce(u.usd_total, o.total) end) as total,
           (case when not v_baza and u.usd_total is not null then 'USD' else 'UZS' end) as currency,
           c.name  as customer,
           c.phone as phone
    from orders o
    join customers c on c.id = o.customer_id
    left join lateral (select order_usd_total(o.id) as usd_total) u on true
    where (p_status is null or o.status = p_status)
      and (
        v_role = 'super_admin'
        or (v_role = 'admin'   and c.org_id     = v_org)
        or (v_role = 'manager' and c.manager_id = v_manager)
      )
    order by o.created_at desc
    limit least(coalesce(p_limit, 10), 30)
  ) t;

  return v_res;
end $$;

revoke all on function public.staff_orders_for_chat(bigint, text, int) from anon, authenticated, public;
grant execute on function public.staff_orders_for_chat(bigint, text, int) to service_role;

-- ---------- 5. "Yangi buyurtma" xabari ham ----------
create or replace function public.staff_chats_for_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select st.chat_id,
           p.role,
           o.id    as order_id,
           o.order_number,
           o.status,
           o.created_at,
           c.name  as customer,
           c.phone as phone,
           (case when p.role in ('admin', 'super_admin') then o.base_total
                 else coalesce(u.usd_total, o.total) end) as total,
           (case when p.role not in ('admin', 'super_admin') and u.usd_total is not null
                 then 'USD' else 'UZS' end) as currency,
           (select count(*) from order_items oi where oi.order_id = o.id) as items_count
    from orders o
    join customers c on c.id = o.customer_id
    left join lateral (select order_usd_total(o.id) as usd_total) u on true
    join profiles p
      on (p.role = 'super_admin')
      or (p.role = 'admin'   and p.org_id     = c.org_id)
      or (p.role = 'manager' and p.manager_id = c.manager_id)
    join staff_telegram st on st.profile_id = p.id
    where o.id = p_order_id
  ) t;

  return v_res;
end $$;

revoke all on function public.staff_chats_for_order(uuid) from anon, authenticated, public;
grant execute on function public.staff_chats_for_order(uuid) to service_role;
