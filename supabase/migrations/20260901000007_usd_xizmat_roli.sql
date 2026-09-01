-- =============================================================
--  order_usd_total: XIZMAT ROLI HAM CHAQIRA OLSIN
--
--  Oldingi migratsiyada bu funksiyaga tenant tekshiruvi qo'shildi
--  (boshqa tenantning buyurtma summasi ochilib qolmasin). Lekin uni
--  staff bot va kunlik hisobot ham chaqiradi - ular service_role
--  bilan ishlaydi, ya'ni auth.uid() YO'Q. Natijada tekshiruv ularni
--  ham to'sib qo'ydi va faktura valyutasi so'mga tushib ketardi.
--
--  Bu aynan bir necha hafta oldin tuzatilgan kritik xato edi -
--  sinov uni darhol ushladi ("dollarli buyurtma topilmadi").
--
--  Yechim: auth.uid() bo'sh bo'lsa - bu ichki chaqiruv (service_role
--  yoki definer zanjiri). anon bu funksiyaga umuman kira olmaydi
--  (grant olib tashlangan), shuning uchun bo'sh uid faqat ichkaridan
--  keladi.
-- =============================================================

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
           then (select sum(oi.qty * oi.orig_price) from order_items oi where oi.order_id = o.id)
         end
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id
    and (
      auth.uid() is null          -- ichki chaqiruv: bot, hisobot, edge
      or is_super_admin()
      or c.org_id = current_org_id()
    );
$$;

revoke all on function public.order_usd_total(uuid) from public, anon;
grant execute on function public.order_usd_total(uuid) to authenticated, service_role;
