-- =============================================================
--  2-BOSQICH — buyurtmani botdan turib boshqarish
--
--  Muammo: confirm_order/cancel_order/set_order_status qoldiq zaxirasi
--  va qarz yozuvini ham boshqaradi, ruxsatni esa auth.uid() orqali
--  tekshiradi. Bot service_role bilan ishlaydi — unda auth.uid() bo'sh.
--
--  Tanlangan yo'l (A): biznes mantiq TAKRORLANMAYDI. Bu funksiya
--  chat egasining profilini aniqlaydi va tranzaksiya ichida o'sha
--  profil nomidan mavjud RPC'ni chaqiradi — ya'ni ruxsatni baribir
--  o'sha eski, sinovdan o'tgan tekshiruvlar hal qiladi.
--
--  XAVFSIZLIK chegaralari (ataylab tor):
--   * funksiya faqat service_role'ga berilgan — brauzerdan chaqirib
--     bo'lmaydi;
--   * kimning nomidan ishlashini FOYDALANUVCHI EMAS, staff_telegram
--     jadvalidagi chat_id bog'lanishi hal qiladi — ya'ni "istalgan
--     odam bo'lib ko'rinish" imkoni yo'q;
--   * ruxsat ikki marta tekshiriladi: shu yerda ham, chaqirilgan
--     RPC ichida ham;
--   * faqat to'rtta amal ro'yxatdan o'tgan, boshqasi rad etiladi;
--   * claim tranzaksiya ichida (is_local = true) qo'yiladi va
--     funksiya oxirida qaytariladi — tashqariga chiqmaydi;
--   * har bir bosish jurnalga yoziladi (staff_bot_actions).
-- =============================================================

-- ---------- 1. Jurnal ----------
create table if not exists public.staff_bot_actions (
  id         bigserial primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  chat_id    bigint,
  order_id   uuid,
  action     text not null,
  ok         boolean not null,
  error      text,
  at         timestamptz not null default now()
);

create index if not exists staff_bot_actions_order_idx on public.staff_bot_actions (order_id, at desc);

alter table public.staff_bot_actions enable row level security;

-- Admin o'z tenantidagi amallarni ko'ra oladi (tekshiruv uchun).
drop policy if exists "staff_bot_actions: admin read" on public.staff_bot_actions;
create policy "staff_bot_actions: admin read"
  on public.staff_bot_actions for select to authenticated
  using (
    is_super_admin()
    or (is_admin() and exists (
      select 1 from profiles p
      where p.id = staff_bot_actions.profile_id and p.org_id = current_org_id()
    ))
  );

-- ---------- 2. Amal ----------
create or replace function public.staff_order_action(
  p_order_id uuid,
  p_chat_id  bigint,
  p_action   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_ruxsat  boolean;
  v_status  text;
  v_eski    text;
  v_xato    text;
begin
  if p_action not in ('confirm', 'cancel', 'picking', 'done') then
    return jsonb_build_object('ok', false, 'error', 'NOMALUM_AMAL');
  end if;

  select st.profile_id, p.role, p.org_id, p.manager_id
    into v_profile, v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_profile is null then
    return jsonb_build_object('ok', false, 'error', 'ULANMAGAN');
  end if;

  -- Birinchi tekshiruv (ikkinchisi chaqiriladigan RPC ichida)
  select (
    v_role = 'super_admin'
    or (v_role = 'admin'   and c.org_id     = v_org)
    or (v_role = 'manager' and c.manager_id = v_manager)
  ), o.status
  into v_ruxsat, v_status
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'BUYURTMA_TOPILMADI');
  end if;
  if coalesce(v_ruxsat, false) = false then
    return jsonb_build_object('ok', false, 'error', 'RUXSAT_YOQ');
  end if;

  -- Xodim nomidan: auth.uid() shu profilni qaytaradi, ya'ni is_admin()/
  -- is_manager() panelda qanday ishlasa, shunday ishlaydi.
  v_eski := current_setting('request.jwt.claims', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_profile::text, 'role', 'authenticated')::text,
    true
  );

  begin
    if p_action = 'confirm' then
      perform confirm_order(p_order_id);
    elsif p_action = 'cancel' then
      perform cancel_order(p_order_id);
    else
      perform set_order_status(p_order_id, p_action);
    end if;
  exception when others then
    v_xato := sqlerrm;
  end;

  -- Claim'ni tranzaksiyaning qolgan qismiga qoldirmaymiz
  perform set_config('request.jwt.claims', coalesce(v_eski, ''), true);

  insert into staff_bot_actions (profile_id, chat_id, order_id, action, ok, error)
  values (v_profile, p_chat_id, p_order_id, p_action, v_xato is null, v_xato);

  if v_xato is not null then
    return jsonb_build_object('ok', false, 'error', v_xato);
  end if;

  select status into v_status from orders where id = p_order_id;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

revoke all on function public.staff_order_action(uuid, bigint, text) from anon, authenticated, public;
grant execute on function public.staff_order_action(uuid, bigint, text) to service_role;

-- ---------- 3. Bitta buyurtma haqida qisqa ma'lumot ----------
-- Xabarni yangilash uchun kerak (tugma bosilgach matn o'zgaradi).
create or replace function public.staff_order_card(p_order_id uuid, p_chat_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    text;
  v_org     uuid;
  v_manager uuid;
  v_baza    boolean;
  v_res     jsonb;
begin
  select p.role, p.org_id, p.manager_id
    into v_role, v_org, v_manager
  from staff_telegram st
  join profiles p on p.id = st.profile_id
  where st.chat_id = p_chat_id;

  if v_role is null then return null; end if;
  v_baza := v_role in ('admin', 'super_admin');

  select jsonb_build_object(
    'order_id',     o.id,
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'customer',     c.name,
    'phone',        c.phone,
    'items_count',  (select count(*) from order_items oi where oi.order_id = o.id),
    'total',    case when v_baza then o.base_total
                     else coalesce(order_usd_total(o.id), o.total) end,
    'currency', case when not v_baza and order_usd_total(o.id) is not null
                     then 'USD' else 'UZS' end,
    'can_act',  (v_role = 'super_admin'
                 or (v_role = 'admin'   and c.org_id     = v_org)
                 or (v_role = 'manager' and c.manager_id = v_manager)),
    'customer_linked', (c.telegram_chat_id is not null)
  )
  into v_res
  from orders o
  join customers c on c.id = o.customer_id
  where o.id = p_order_id
    and (
      v_role = 'super_admin'
      or (v_role = 'admin'   and c.org_id     = v_org)
      or (v_role = 'manager' and c.manager_id = v_manager)
    );

  return v_res;
end $$;

revoke all on function public.staff_order_card(uuid, bigint) from anon, authenticated, public;
grant execute on function public.staff_order_card(uuid, bigint) to service_role;
