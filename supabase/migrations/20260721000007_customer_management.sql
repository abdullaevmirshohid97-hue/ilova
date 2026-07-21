-- =============================================================
-- ILOVA B2B — Mijoz boshqaruvi: to'lovni ortga qaytarish (storno)
-- + to'lov sanasini orqaga surish imkoniyati
-- =============================================================

-- -------------------------------------------------------------
-- record_payment: endi ixtiyoriy sana (kechroq kiritilgan to'lovlar uchun)
-- Eski 4-argumentli versiya avval o'chiriladi — aks holda Postgres
-- ikkala funksiyani ham "mos nomzod" deb ko'rib, chaqiruv noaniq bo'lib qoladi.
-- -------------------------------------------------------------
drop function if exists public.record_payment(uuid, numeric, text, text);

create or replace function public.record_payment(
  p_customer_id uuid,
  p_amount      numeric,
  p_method      text,
  p_note        text default null,
  p_paid_at     timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_payment_id uuid;
  v_when       timestamptz := coalesce(p_paid_at, now());
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'NOTOGRI_SUMMA';
  end if;
  if v_when > now() then
    raise exception 'SANA_KELAJAKDA';
  end if;

  insert into payments (customer_id, amount, method, note, created_by, created_at)
  values (p_customer_id, p_amount, p_method, p_note, auth.uid(), v_when)
  returning id into v_payment_id;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by, created_at)
  values (p_customer_id, -p_amount, 'payment', v_payment_id, p_note, auth.uid(), v_when);

  return v_payment_id;
end $$;

-- -------------------------------------------------------------
-- reverse_payment: xato to'lovni storno qilish (izoh majburiy, audit uchun)
-- Asl to'lov o'chirilmaydi — teskari 'adjustment' yozuvi qo'shiladi.
-- -------------------------------------------------------------
create or replace function public.reverse_payment(p_payment_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payment record;
  v_already numeric;
begin
  if not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'IZOH_MAJBURIY';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'TOLOV_TOPILMADI';
  end if;

  select coalesce(sum(amount), 0) into v_already
  from ledger_entries
  where payment_id = p_payment_id and kind = 'adjustment';
  if v_already <> 0 then
    raise exception 'ALLAQACHON_STORNO_QILINGAN';
  end if;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by)
  values (v_payment.customer_id, v_payment.amount, 'adjustment', p_payment_id,
          'Storno: ' || p_note, auth.uid());
end $$;

grant execute on function public.record_payment(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
