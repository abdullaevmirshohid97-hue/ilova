-- =============================================================
-- ILOVA B2B — SaaS: super_admin uchun tenant statistikasi
--
-- super_admin tenant biznes-ma'lumotini (mijoz ismi, buyurtma summasi va h.k.)
-- to'g'ridan-to'g'ri ko'rmasligi kerak (RLS shunday yopilgan — 000012).
-- Lekin platforma egasi sifatida har tenant qanchalik faolligini (necha
-- mijoz/mahsulot/buyurtma) bilishi kerak — shuning uchun faqat JAMLANGAN
-- sonlarni qaytaradigan, hech qanday individual qatorni ochib bermaydigan
-- bitta security definer funksiya.
-- =============================================================

create or replace function public.super_admin_org_stats()
returns table (
  org_id          uuid,
  customers_count bigint,
  products_count  bigint,
  orders_count    bigint,
  admins_count    bigint
)
language sql stable security definer set search_path = public
as $$
  select
    o.id as org_id,
    (select count(*) from customers c where c.org_id = o.id) as customers_count,
    (select count(*) from products p where p.org_id = o.id) as products_count,
    (select count(*) from orders ord join customers c2 on c2.id = ord.customer_id where c2.org_id = o.id) as orders_count,
    (select count(*) from profiles pr where pr.org_id = o.id and pr.role = 'admin') as admins_count
  from organizations o
  where is_super_admin();
$$;

grant execute on function public.super_admin_org_stats() to authenticated;
