-- =============================================================
--  SKLAD TELEGRAMGA ULANADI
--
--  Buyurtma skladlarga taqsimlanadi (dori_order_split), endi har sklad
--  o'z so'rovini Telegramda oladi va shu yerda "qabul qildim / yo'q"
--  deb javob beradi.
--
--  XAVFSIZLIK - taklif kodi TELEFON RAQAMGA bog'lanadi:
--    * super admin sklad uchun kod yaratadi va raqamini ko'rsatadi
--    * kodni kim ushlab qolsa ham, boshqa raqamli akkaunt bilan
--      ishlatolmaydi
--    * kod 24 soatda kuchdan qoladi va bir marta ishlaydi
--    * botda kontakt kelganda contact.user_id === from.id tekshiriladi
--      (Telegramda boshqa odamning kontaktini yuborish mumkin)
--
--  Sklad bot orqali FAQAT o'ziga tegishli so'rovni ko'radi: har
--  chaqiruvda chat_id -> sklad bog'lanishi qayta tekshiriladi.
-- =============================================================

-- ---------- 1. Bog'lanishlar ----------
create table if not exists public.dori_warehouse_telegram (
  chat_id      bigint primary key,
  warehouse_id uuid not null references public.dori_warehouses(id) on delete cascade,
  phone        text not null,
  name         text,
  username     text,
  is_active    boolean not null default true,
  linked_at    timestamptz not null default now(),
  last_seen    timestamptz
);

-- Bitta skladda bir necha xodim bo'lishi mumkin (mudir + operator)
create index if not exists dori_wh_tg_idx on public.dori_warehouse_telegram (warehouse_id);

alter table public.dori_warehouse_telegram enable row level security;

drop policy if exists "dori_wh_tg: super_admin" on public.dori_warehouse_telegram;
create policy "dori_wh_tg: super_admin"
  on public.dori_warehouse_telegram for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 2. Taklif kodlari ----------
create table if not exists public.dori_warehouse_codes (
  code         text primary key,
  warehouse_id uuid not null references public.dori_warehouses(id) on delete cascade,
  bound_phone  text not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_chat_id bigint
);

create index if not exists dori_wh_codes_idx on public.dori_warehouse_codes (warehouse_id, used_at);

alter table public.dori_warehouse_codes enable row level security;

drop policy if exists "dori_wh_codes: super_admin" on public.dori_warehouse_codes;
create policy "dori_wh_codes: super_admin"
  on public.dori_warehouse_codes for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- Raqamni solishtirish uchun: faqat raqamlar qoladi
create or replace function public.dori_tel_norm(p_phone text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

-- ---------- 3. Kod yaratish (super admin) ----------
create or replace function public.dori_sklad_kod(p_warehouse_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_tel   text := dori_tel_norm(p_phone);
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if length(v_tel) < 9 then
    raise exception 'TELEFON_NOTOGRI';
  end if;
  if not exists (select 1 from dori_warehouses where id = p_warehouse_id) then
    raise exception 'SKLAD_TOPILMADI';
  end if;

  -- Shu sklad uchun ishlatilmagan eski kodlar bekor qilinadi: bir vaqtda
  -- ikkita amaldagi kod bo'lsa, qaysi biri kimga berilgani chalkashadi
  delete from dori_warehouse_codes
   where warehouse_id = p_warehouse_id and used_at is null;

  v_code := 'SKL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into dori_warehouse_codes (code, warehouse_id, bound_phone, created_by, expires_at)
  values (v_code, p_warehouse_id, v_tel, auth.uid(), now() + interval '24 hours');

  return jsonb_build_object('ok', true, 'code', v_code, 'phone', v_tel, 'hours', 24);
end $$;

revoke all on function public.dori_sklad_kod(uuid, text) from public, anon;
grant execute on function public.dori_sklad_kod(uuid, text) to authenticated;

-- ---------- 4. Ulash (bot chaqiradi) ----------
create or replace function public.dori_sklad_ulash(
  p_code     text,
  p_chat_id  bigint,
  p_phone    text,
  p_name     text default null,
  p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r    record;
  v_tel text := dori_tel_norm(p_phone);
begin
  select * into r
  from dori_warehouse_codes
  where code = upper(trim(p_code))
  limit 1;

  if r.code is null then
    return jsonb_build_object('ok', false, 'error', 'KOD_TOPILMADI');
  end if;
  if r.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'KOD_ISHLATILGAN');
  end if;
  if r.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'KOD_MUDDATI_TUGAGAN');
  end if;

  -- Kod raqamga bog'langan: oxirgi 9 raqam solishtiriladi (kod +998 bilan
  -- yozilgan bo'lishi mumkin, Telegram esa boshqacha qaytaradi)
  if right(v_tel, 9) is distinct from right(r.bound_phone, 9) then
    return jsonb_build_object('ok', false, 'error', 'RAQAM_MOS_EMAS');
  end if;

  insert into dori_warehouse_telegram (chat_id, warehouse_id, phone, name, username, last_seen)
  values (p_chat_id, r.warehouse_id, v_tel, p_name, p_username, now())
  on conflict (chat_id) do update
    set warehouse_id = excluded.warehouse_id,
        phone     = excluded.phone,
        name      = coalesce(excluded.name, dori_warehouse_telegram.name),
        username  = excluded.username,
        is_active = true,
        last_seen = now();

  update dori_warehouse_codes
     set used_at = now(), used_chat_id = p_chat_id
   where code = r.code;

  return jsonb_build_object(
    'ok', true,
    'warehouse_id', r.warehouse_id,
    'sklad', (select name from dori_warehouses where id = r.warehouse_id)
  );
end $$;

revoke all on function public.dori_sklad_ulash(text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.dori_sklad_ulash(text, bigint, text, text, text) to service_role;

-- ---------- 5. Chat qaysi skladniki ----------
create or replace function public.dori_sklad_kim(p_chat_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'warehouse_id', t.warehouse_id,
    'sklad', w.name,
    'phone', t.phone
  )
  from dori_warehouse_telegram t
  join dori_warehouses w on w.id = t.warehouse_id
  where t.chat_id = p_chat_id and t.is_active and w.is_active;
$$;

revoke all on function public.dori_sklad_kim(bigint) from public, anon, authenticated;
grant execute on function public.dori_sklad_kim(bigint) to service_role;

-- ---------- 6. Panel: bog'langanlar ro'yxati ----------
create or replace function public.dori_sklad_telegram_royxat(p_warehouse_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.linked_at desc), '[]'::jsonb) into v
  from (
    select tg.chat_id::text as chat_id, tg.warehouse_id, w.name as sklad,
           tg.phone, tg.name, tg.username, tg.is_active, tg.linked_at, tg.last_seen
    from dori_warehouse_telegram tg
    join dori_warehouses w on w.id = tg.warehouse_id
    where p_warehouse_id is null or tg.warehouse_id = p_warehouse_id
  ) t;

  return v;
end $$;

revoke all on function public.dori_sklad_telegram_royxat(uuid) from public, anon;
grant execute on function public.dori_sklad_telegram_royxat(uuid) to authenticated;

create or replace function public.dori_sklad_uzish(p_chat_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  delete from dori_warehouse_telegram where chat_id = p_chat_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_sklad_uzish(bigint) from public, anon;
grant execute on function public.dori_sklad_uzish(bigint) to authenticated;
