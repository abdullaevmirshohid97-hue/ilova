-- =============================================================
--  1-BOSQICH — ulanishni admin boshqarsin
--
--  Hozir kod faqat xodimning O'ZI panelga kirganda yaratiladi. Admin
--  menejerni botga chaqira olmaydi va kim ulangani ko'rinmaydi.
--
--  XAVFSIZLIK — eng muhim joyi:
--  Admin menejer uchun kod yarata olsa, o'sha kodni O'ZI ishlatib
--  menejer profiliga ulanib olishi mumkin edi — va bot menejerning
--  ustama narxlarini ko'rsatib qo'yardi. Bu butun diler modelining
--  asosiy shartini (admin menejer ustamasini ko'rmaydi) buzadi.
--
--  Yechim: admin yaratgan kod MENEJERNING TELEFON RAQAMIGA bog'lanadi
--  (bound_phone). Kodning o'zi yetarli emas — botda telefon raqamni
--  tasdiqlash ham kerak, ya'ni o'sha raqamli Telegram akkaunt egasi
--  bo'lish shart. Xodimning o'zi panelda yaratgan kodida bunday shart
--  yo'q: u allaqachon o'z hisobi bilan kirgan.
-- =============================================================

-- ---------- 1. Bot suhbat holati ----------
-- "Telefonni kutyapmiz", "mijoz qidiruvi" kabi holatlar shu yerda.
-- Faqat service_role ko'radi (edge funksiya), policy ataylab yo'q.
create table if not exists public.staff_bot_state (
  chat_id    bigint primary key,
  state      text not null default 'idle',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.staff_bot_state enable row level security;

-- ---------- 2. Kodlarga: kim yaratgani va telefon bog'lanishi ----------
alter table public.staff_telegram_codes
  add column if not exists created_by  uuid references public.profiles(id) on delete set null,
  add column if not exists bound_phone text;

comment on column public.staff_telegram_codes.bound_phone is
  'Bo''sh bo''lmasa: kod faqat shu raqamli Telegram akkaunt bilan ishlaydi (admin yaratgan taklif).';

-- ---------- 3. Admin: menejer uchun taklif kodi ----------
create or replace function public.staff_telegram_code_for(p_manager_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_phone   text;
  v_profile uuid;
  v_code    text;
begin
  if not (is_admin() or is_super_admin()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  select m.org_id, m.phone into v_org, v_phone
  from managers m
  where m.id = p_manager_id and m.is_active;

  if v_org is null then
    raise exception 'MENEJER_TOPILMADI';
  end if;

  -- Admin faqat O'Z tenantidagi menejer uchun kod yarata oladi
  if is_admin() and not is_super_admin() and v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select p.id into v_profile from profiles p where p.manager_id = p_manager_id limit 1;
  if v_profile is null then
    raise exception 'MENEJER_HISOBI_YOQ';
  end if;

  delete from staff_telegram_codes where profile_id = v_profile and used_at is null;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into staff_telegram_codes (code, profile_id, expires_at, created_by, bound_phone)
  values (v_code, v_profile, now() + interval '24 hours', auth.uid(), v_phone);

  -- Telefon raqamning o'zi qaytarilmaydi — admin uni allaqachon biladi,
  -- lekin qaytarish shart emas: kod baribir raqam bilan tekshiriladi.
  return jsonb_build_object('ok', true, 'code', v_code, 'hours', 24);
end $$;

revoke all on function public.staff_telegram_code_for(uuid) from anon, public;
grant execute on function public.staff_telegram_code_for(uuid) to authenticated;

-- ---------- 4. Admin: menejer ulanishini uzish ----------
create or replace function public.staff_telegram_admin_unlink(p_manager_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not (is_admin() or is_super_admin()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  select m.org_id into v_org from managers m where m.id = p_manager_id;
  if v_org is null then raise exception 'MENEJER_TOPILMADI'; end if;
  if is_admin() and not is_super_admin() and v_org <> current_org_id() then
    raise exception 'RUXSAT_YOQ';
  end if;

  delete from staff_telegram
  where profile_id in (select p.id from profiles p where p.manager_id = p_manager_id);

  delete from staff_telegram_codes
  where profile_id in (select p.id from profiles p where p.manager_id = p_manager_id)
    and used_at is null;
end $$;

revoke all on function public.staff_telegram_admin_unlink(uuid) from anon, public;
grant execute on function public.staff_telegram_admin_unlink(uuid) to authenticated;

-- ---------- 5. Admin: kim ulangan ----------
-- Faqat holat qaytadi (ulanganmi, qachon, telegram username) — menejerning
-- narxlariga aloqasi yo'q.
create or replace function public.manager_telegram_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not (is_admin() or is_super_admin()) then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select m.id            as manager_id,
           (p.id is not null)  as has_account,
           (st.chat_id is not null) as linked,
           st.username,
           st.linked_at,
           (select max(c.expires_at) from staff_telegram_codes c
             where c.profile_id = p.id and c.used_at is null and c.expires_at > now()
           ) as invite_expires_at
    from managers m
    left join profiles p       on p.manager_id = m.id
    left join staff_telegram st on st.profile_id = p.id
    where is_super_admin() or m.org_id = current_org_id()
    order by m.name
  ) t;

  return v_res;
end $$;

revoke all on function public.manager_telegram_status() from anon, public;
grant execute on function public.manager_telegram_status() to authenticated;

-- ---------- 6. Bot: kod bilan ulanish (telefon shartini biladi) ----------
-- Kod telefon bilan bog'langan bo'lsa, bu funksiya kodni ISHLATMAYDI —
-- botga "telefon so'ra" deb javob qaytaradi.
create or replace function public.staff_telegram_link(
  p_code       text,
  p_chat_id    bigint,
  p_username   text default null,
  p_first_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_bound   text;
  v_role    text;
  v_name    text;
begin
  select c.profile_id, c.bound_phone into v_profile, v_bound
  from staff_telegram_codes c
  where c.code = upper(trim(p_code))
    and c.used_at is null
    and c.expires_at > now();

  if v_profile is null then
    return jsonb_build_object('ok', false, 'error', 'KOD_NOTOGRI');
  end if;

  -- Admin yaratgan taklif: kodning o'zi yetarli emas
  if v_bound is not null then
    return jsonb_build_object('ok', false, 'error', 'TELEFON_KERAK', 'need_phone', true);
  end if;

  update staff_telegram_codes set used_at = now() where code = upper(trim(p_code));

  delete from staff_telegram where chat_id = p_chat_id;

  insert into staff_telegram (profile_id, chat_id, username, first_name)
  values (v_profile, p_chat_id, p_username, p_first_name)
  on conflict (profile_id) do update
    set chat_id    = excluded.chat_id,
        username   = excluded.username,
        first_name = excluded.first_name,
        linked_at  = now();

  select p.role, p.full_name into v_role, v_name from profiles p where p.id = v_profile;
  return jsonb_build_object('ok', true, 'role', v_role, 'name', coalesce(v_name, ''));
end $$;

-- ---------- 7. Bot: kod + telefon (admin taklifi) ----------
create or replace function public.staff_telegram_link_code_phone(
  p_code       text,
  p_phone      text,
  p_chat_id    bigint,
  p_username   text default null,
  p_first_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_bound   text;
  v_role    text;
  v_name    text;
begin
  select c.profile_id, c.bound_phone into v_profile, v_bound
  from staff_telegram_codes c
  where c.code = upper(trim(p_code))
    and c.used_at is null
    and c.expires_at > now();

  if v_profile is null then
    return jsonb_build_object('ok', false, 'error', 'KOD_NOTOGRI');
  end if;

  -- Oxirgi 9 raqam bo'yicha solishtiramiz: bazada raqamlar turli
  -- formatda saqlangan bo'lishi mumkin (+998 90 111-22-33 va h.k.)
  if v_bound is null
     or right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9)
        <> right(regexp_replace(v_bound, '\D', '', 'g'), 9) then
    return jsonb_build_object('ok', false, 'error', 'TELEFON_MOS_EMAS');
  end if;

  update staff_telegram_codes set used_at = now() where code = upper(trim(p_code));

  delete from staff_telegram where chat_id = p_chat_id;

  insert into staff_telegram (profile_id, chat_id, username, first_name)
  values (v_profile, p_chat_id, p_username, p_first_name)
  on conflict (profile_id) do update
    set chat_id    = excluded.chat_id,
        username   = excluded.username,
        first_name = excluded.first_name,
        linked_at  = now();

  select p.role, p.full_name into v_role, v_name from profiles p where p.id = v_profile;
  return jsonb_build_object('ok', true, 'role', v_role, 'name', coalesce(v_name, ''));
end $$;

-- ---------- 8. Bot holati (service_role) ----------
create or replace function public.staff_bot_state_set(
  p_chat_id bigint,
  p_state   text,
  p_data    jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.staff_bot_state (chat_id, state, data, updated_at)
  values (p_chat_id, p_state, coalesce(p_data, '{}'::jsonb), now())
  on conflict (chat_id) do update
    set state = excluded.state, data = excluded.data, updated_at = now();
$$;

create or replace function public.staff_bot_state_get(p_chat_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('state', s.state, 'data', s.data)
  from public.staff_bot_state s
  where s.chat_id = p_chat_id;
$$;

revoke all on function public.staff_telegram_link(text, bigint, text, text) from anon, authenticated, public;
grant execute on function public.staff_telegram_link(text, bigint, text, text) to service_role;

revoke all on function public.staff_telegram_link_code_phone(text, text, bigint, text, text) from anon, authenticated, public;
grant execute on function public.staff_telegram_link_code_phone(text, text, bigint, text, text) to service_role;

revoke all on function public.staff_bot_state_set(bigint, text, jsonb) from anon, authenticated, public;
grant execute on function public.staff_bot_state_set(bigint, text, jsonb) to service_role;

revoke all on function public.staff_bot_state_get(bigint) from anon, authenticated, public;
grant execute on function public.staff_bot_state_get(bigint) to service_role;
