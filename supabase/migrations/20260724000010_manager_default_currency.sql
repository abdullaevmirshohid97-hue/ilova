-- =============================================================
-- YUKCHIBOLLA — menejer "men faqat dollarda ishlayman" deb bir marta
-- belgilab qo'ysin, shunda har bir mahsulot uchun alohida "$" tanlash
-- shart bo'lmaydi (Narxlarim'dagi valyuta tanlagichlar shu bo'yicha
-- standart bo'ladi).
-- =============================================================

alter table public.managers
  add column default_currency text not null default 'UZS' check (default_currency in ('UZS', 'USD'));

create or replace function public.set_my_default_currency(p_currency text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_currency not in ('UZS', 'USD') then
    raise exception 'NOTOGRI_VALYUTA';
  end if;

  update managers set default_currency = p_currency where id = current_manager_id();
end $$;
