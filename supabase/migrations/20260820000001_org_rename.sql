-- Tenant (biznes) nomini o'zgartirish.
--
-- Hozirgi holat: organizations ustida super_admin'da ALL, admin'da faqat
-- SELECT policy bor. Ya'ni admin o'z biznesining nomini o'zgartira olmaydi.
--
-- Nega to'g'ridan-to'g'ri UPDATE policy BERMAYMIZ: RLS butun qatorga
-- ruxsat beradi, ustunlarni ajrata olmaydi. Admin'ga UPDATE bersak, u
-- o'zining subscription_status'ini 'active' qilib, plan'ini o'zgartirib
-- qo'ya olardi — ya'ni to'lovni chetlab o'tardi. Shuning uchun faqat
-- xavfsiz maydonlarni yangilaydigan security-definer RPC yozamiz.

create or replace function public.update_org_profile(
  p_org_id uuid,
  p_name text,
  p_contact_name text default null,
  p_contact_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(p_name), '');
begin
  if v_name is null then
    raise exception 'Tenant nomi bo''sh bo''lishi mumkin emas';
  end if;

  -- super_admin — istalgan tenant; admin — faqat o'ziniki
  if not (
    is_super_admin()
    or (is_admin() and p_org_id = current_org_id())
  ) then
    raise exception 'Ruxsat yo''q';
  end if;

  update organizations
     set name          = v_name,
         contact_name  = nullif(btrim(coalesce(p_contact_name, '')), ''),
         contact_phone = nullif(btrim(coalesce(p_contact_phone, '')), '')
   where id = p_org_id;

  if not found then
    raise exception 'Tenant topilmadi';
  end if;
end;
$$;

revoke all on function public.update_org_profile(uuid, text, text, text) from public;
grant execute on function public.update_org_profile(uuid, text, text, text) to authenticated;
