-- =============================================================
--  DORI MIJOZI UCHUN LOGIN — profil yaratilmasin
--
--  Xato: "Database error creating new user".
--
--  Sababi: har yangi auth foydalanuvchisi uchun handle_new_user() trigger'i
--  public.profiles ga qator yozadi, profilda esa
--  `profiles_org_required_unless_super_admin` sharti bor — super_admin'dan
--  boshqa har kimda org_id bo'lishi kerak.
--
--  Dori mijozi esa Yukchibolla tenantiga UMUMAN tegishli emas: u
--  dori_customers jadvalida yashaydi va panelga kirmaydi. Ya'ni unga
--  profil kerak emas.
--
--  Yechim: trigger metama'lumotda `dori_mijoz` belgisini ko'rsa, profil
--  yaratmasdan o'tib ketadi. Boshqa foydalanuvchilar uchun hech narsa
--  o'zgarmaydi.
-- =============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  v_manager_id  uuid := nullif(new.raw_user_meta_data->>'manager_id', '')::uuid;
  v_org_id      uuid := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  v_role        text := coalesce(new.raw_user_meta_data->>'role', 'customer');
begin
  -- Dori mijozi: u alohida tizim (dori_customers), profil kerak emas
  if coalesce(new.raw_user_meta_data->>'dori_mijoz', 'false') = 'true' then
    return new;
  end if;

  if v_customer_id is not null then
    select org_id into v_org_id from public.customers where id = v_customer_id;
  end if;
  if v_manager_id is not null then
    select org_id into v_org_id from public.managers where id = v_manager_id;
  end if;

  insert into public.profiles (id, full_name, customer_id, manager_id, org_id, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''),
          v_customer_id, v_manager_id, v_org_id, v_role);
  return new;
end $$;
