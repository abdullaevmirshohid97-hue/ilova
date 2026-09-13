-- =============================================================
-- CREDIT DEBIT — biznes nomini o'zgartirish
--
-- `organizations` da tenant admini uchun FAQAT o'qish siyosati bor
-- (yozish super adminda). B2B'da bu to'g'ri: tenantni biz ochamiz va
-- nomini ham biz qo'yamiz. Credit Debit'da esa odam o'zi ro'yxatdan
-- o'tadi — nomni xato yozsa yoki do'kon nomi o'zgarsa, uni o'zi
-- to'g'rilay olishi kerak.
--
-- Butun jadvalga UPDATE siyosati BERILMAYDI: unda tenant admini
-- `yonalishlar` yoki `subscription_status` ustunini ham o'zgartirib,
-- o'ziga boshqa tizimlarni ochib olardi. Shuning uchun tor funksiya:
-- faqat `name`, faqat o'z tashkilotida, faqat admin.
-- =============================================================

create or replace function public.kassa_biznes_nomi(p_nom text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
begin
  if v_org is null or not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if v_nom is null or length(v_nom) < 2 then
    raise exception 'NOM_QISQA: kamida 2 ta belgi';
  end if;
  if length(v_nom) > 80 then
    v_nom := left(v_nom, 80);
  end if;

  update public.organizations set name = v_nom where id = v_org;
  return v_nom;
end $$;

revoke all on function public.kassa_biznes_nomi(text) from public, anon;
grant execute on function public.kassa_biznes_nomi(text) to authenticated;

comment on function public.kassa_biznes_nomi(text) is
  'Tenant admini o''z biznesining NOMINI o''zgartiradi. Boshqa ustunlarga tegmaydi — yo''nalish va obuna super adminda qoladi.';
