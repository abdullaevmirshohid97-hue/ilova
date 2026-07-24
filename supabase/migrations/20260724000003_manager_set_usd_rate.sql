-- =============================================================
-- YUKCHIBOLLA — menejer o'z dollar kursini o'zi o'zgartiradi.
-- To'g'ridan-to'g'ri jadval UPDATE huquqi berish o'rniga (bu menejerga
-- o'z ismi/telefoni/faolligini ham o'zgartirish imkonini berib qo'yardi),
-- faqat usd_rate'ni yozadigan tor RPC.
-- =============================================================

create or replace function public.set_my_usd_rate(p_rate numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'NOTOGRI_KURS';
  end if;

  update managers set usd_rate = p_rate where id = current_manager_id();
end $$;
