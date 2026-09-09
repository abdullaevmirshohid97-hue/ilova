-- =============================================================
-- YUKCHIBOLLA — menejerning hisob-kitobi (pul oldi-berdi)
--
-- Menejer mijozlarini yashirsa, korxona ular bilan hisob-kitob
-- qilmaydi — pulni menejer o'zi oladi. Shuning uchun unga o'z
-- moliya vositasi kerak: to'lov qabul qilish, storno, qarz
-- ro'yxati.
--
-- Alohida jadval OCHILMAYDI. To'lov ham, qarz ham mavjud
-- payments/ledger_entries da yuritiladi — farqi FAQAT kimga
-- yozilishida:
--   real mijoz    -> menejer bilan hisob-kitob (ustamali narx)
--   proxy kartochka -> korxona bilan hisob-kitob (baza narx)
-- Ikkinchi jadval bo'lsa customer_balances, faktura va mobil
-- ilovaning qarz ekrani ikki manbadan o'qishga majbur bo'lardi.
--
-- record_payment "faqat admin" bo'lib qoladi: admin menejerning
-- yashirin mijoziga to'lov yoza olmaydi (u mijozni ko'rmaydi ham).
-- =============================================================

-- ---------- 1. Menejer to'lov qabul qiladi ----------
create or replace function public.menejer_tolov(
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
  v_mgr        uuid;
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  v_mgr := current_manager_id();

  if p_amount is null or p_amount <= 0 then
    raise exception 'NOTOGRI_SUMMA';
  end if;
  if p_method not in ('cash', 'card', 'transfer') then
    raise exception 'NOTOGRI_USUL';
  end if;
  if v_when > now() then
    raise exception 'SANA_KELAJAKDA';
  end if;

  -- FAQAT o'z mijoziga. Menejer-xaridor kartochkasi ham chetda
  -- qoladi: korxona oldidagi qarzni menejer o'zi "to'ladim" deb
  -- yoza olmasligi kerak — uni admin yozadi.
  if not exists (
    select 1 from customers
    where id = p_customer_id and manager_id = v_mgr
  ) then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into payments (customer_id, amount, method, note, created_by, created_at)
  values (p_customer_id, p_amount, p_method, p_note, auth.uid(), v_when)
  returning id into v_payment_id;

  insert into ledger_entries (customer_id, amount, kind, payment_id, note, created_by, created_at)
  values (p_customer_id, -p_amount, 'payment', v_payment_id, p_note, auth.uid(), v_when);

  return v_payment_id;
end $$;

grant execute on function public.menejer_tolov(uuid, numeric, text, text, timestamptz) to authenticated;

-- ---------- 2. Storno ----------
create or replace function public.menejer_storno(p_payment_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_payment record;
  v_already numeric;
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    raise exception 'IZOH_MAJBURIY';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'TOLOV_TOPILMADI';
  end if;

  if not exists (
    select 1 from customers
    where id = v_payment.customer_id and manager_id = current_manager_id()
  ) then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Ikki marta storno qilinsa mijozning qarzi ikki barobar oshib
  -- ketardi va buni faqat oyoq oxirida sezilardi
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

grant execute on function public.menejer_storno(uuid, text) to authenticated;

-- Menejer o'zi yozgan to'lovni ko'rishi kerak. payments'da unga
-- siyosat yo'q edi: to'lov yozilardi, lekin ro'yxatda ko'rinmasdi.
create policy "payments: manager read" on public.payments
  for select to authenticated
  using (customer_id in (
    select id from public.customers where manager_id = current_manager_id()
  ));

-- ---------- 3. Menejerning hisob varag'i ----------
-- Bitta chaqiruvda: mijozlar qarzi + menejerning korxona oldidagi
-- qarzi. Panel uchta alohida so'rov yuborsa, uchtasi uch vaqtda
-- kelib, jami raqamlar bir-biriga to'g'ri kelmasdi.
create or replace function public.menejer_hisob()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_mgr   uuid;
  v_proxy uuid;
  v_res   jsonb;
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  v_mgr := current_manager_id();
  select id into v_proxy from customers where proxy_manager_id = v_mgr;

  select jsonb_build_object(
    -- Menejerning korxona oldidagi qarzi (baza narxda)
    'korxonaga_qarzim', coalesce((
      select sum(le.amount) from ledger_entries le where le.customer_id = v_proxy
    ), 0),
    -- Mijozlar menejerga qancha qarz (ustamali narxda)
    'mijozlar_qarzi', coalesce((
      select sum(le.amount) from ledger_entries le
      join customers c on c.id = le.customer_id
      where c.manager_id = v_mgr
    ), 0),
    'mijozlar', coalesce((
      select jsonb_agg(x order by x->>'name')
      from (
        select jsonb_build_object(
                 'id',      c.id,
                 'name',    c.name,
                 'phone',   c.phone,
                 'active',  c.is_active,
                 -- Balans: + qarz, - haqi. Yozuvi yo'q mijozda 0
                 'balance', coalesce((
                   select sum(le.amount) from ledger_entries le
                   where le.customer_id = c.id
                 ), 0)
               ) as x
        from customers c
        where c.manager_id = v_mgr
      ) t
    ), '[]'::jsonb)
  )
  into v_res;

  return v_res;
end $$;

grant execute on function public.menejer_hisob() to authenticated;

-- ---------- 4. Bitta mijozning harakati ----------
create or replace function public.menejer_mijoz_harakati(p_customer_id uuid, p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_manager() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if not exists (
    select 1 from customers
    where id = p_customer_id and manager_id = current_manager_id()
  ) then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object(
             'id',           le.id,
             'amount',       le.amount,
             'kind',         le.kind,
             'note',         le.note,
             'payment_id',   le.payment_id,
             'order_number', (select o.order_number from orders o where o.id = le.order_id),
             'created_at',   le.created_at
           ) as x
    from ledger_entries le
    where le.customer_id = p_customer_id
    order by le.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) t;

  return v_res;
end $$;

grant execute on function public.menejer_mijoz_harakati(uuid, int) to authenticated;
