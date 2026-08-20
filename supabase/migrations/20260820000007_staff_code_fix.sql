-- TUZATISH: staff_telegram_code() ishlamas edi —
-- "function gen_random_bytes(integer) does not exist".
--
-- Sababi: pgcrypto Supabase'da `extensions` sxemasida turadi, funksiya esa
-- `set search_path = public` bilan ishlaydi (bu ataylab: search_path'ni ochiq
-- qoldirish security-definer funksiyada xavfli). Ya'ni pgcrypto funksiyalari
-- ko'rinmaydi.
--
-- Yechim: pgcrypto'ga umuman bog'lanmaymiz — gen_random_uuid() PostgreSQL'ning
-- o'zida (pg_catalog) va u ham kriptografik tasodifiy. Undan 12 belgi olamiz.

create or replace function public.staff_telegram_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_code text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin', 'super_admin', 'manager') then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Bir vaqtning o'zida faqat bitta kod amal qilsin
  delete from staff_telegram_codes where profile_id = auth.uid() and used_at is null;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into staff_telegram_codes (code, profile_id, expires_at)
  values (v_code, auth.uid(), now() + interval '30 minutes');

  return v_code;
end $$;

revoke all on function public.staff_telegram_code() from anon, public;
grant execute on function public.staff_telegram_code() to authenticated;
