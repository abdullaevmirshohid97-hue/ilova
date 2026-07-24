-- =============================================================
-- YUKCHIBOLLA — mijoz o'ziga biriktirilgan menejerning ismini
-- ko'ra olishi kerak (faktura/hisobda ko'rsatish uchun). managers
-- jadvalida mijoz uchun umuman policy yo'q edi (faqat menejerning
-- o'zi va admin), shuning uchun keng RLS policy ochish o'rniga
-- faqat ismni qaytaradigan tor SECURITY DEFINER funksiya.
-- =============================================================

create or replace function public.my_manager_name()
returns text
language sql stable security definer set search_path = public
as $$
  select m.name
  from customers c
  join managers m on m.id = c.manager_id
  where c.id = public.current_customer_id();
$$;

grant execute on function public.my_manager_name() to authenticated;
