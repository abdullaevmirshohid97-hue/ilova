-- =============================================================
--  XODIMLAR UCHUN TELEGRAM BOT (@yukchibolla_bot) — admin va menejer
--
--  Mijozlar boti (@Catalog_yukchibolla_bot) allaqachon bor: u mijozni
--  telefoni bo'yicha tanib, unga faktura yuboradi. Bu yerdagisi ESA
--  XODIM uchun: admin/menejer botga ulanadi, yangi buyurtma haqida
--  darhol xabar oladi va istalgan buyurtmaning fakturasini PDF qilib
--  yuklab oladi.
--
--  Ulanish telefon orqali EMAS, bir martalik KOD orqali: adminda
--  umuman telefon ustuni yo'q (u email bilan kiradi), qolaversa kod
--  panelga kirgan odam qo'lida yaratiladi — ya'ni begona odam birovning
--  raqamini bilib olib ulanib ololmaydi. Menejer uchun qulaylik sifatida
--  kontakt yuborish yo'li ham qoldirilgan (uning raqami bazada bor).
--
--  NARX MAXFIYLIGI (muhim): botdagi faktura ham panel bilan bir xil
--  qoidaga bo'ysunadi — admin/super_admin RASMIY (baza) narxni ko'radi,
--  menejer esa o'zining HAQIQIY narxini. Ya'ni menejer ustamasi bot
--  orqali ham sizib chiqmaydi.
-- =============================================================

-- ---------- 1. Xodim <-> telegram bog'lanishi ----------
create table if not exists public.staff_telegram (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id    bigint not null unique,
  username   text,
  first_name text,
  linked_at  timestamptz not null default now()
);

alter table public.staff_telegram enable row level security;

-- Xodim faqat O'Z bog'lanishini ko'radi (panelda "ulangan/ulanmagan"
-- holatini ko'rsatish uchun). Yozish/o'chirish faqat RPC orqali.
drop policy if exists "staff_telegram: self read" on public.staff_telegram;
create policy "staff_telegram: self read"
  on public.staff_telegram for select to authenticated
  using (profile_id = auth.uid());

-- ---------- 2. Bir martalik ulanish kodlari ----------
create table if not exists public.staff_telegram_codes (
  code       text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists staff_telegram_codes_profile_idx
  on public.staff_telegram_codes (profile_id);

-- Ataylab hech qanday policy yo'q: kodlarni faqat security-definer
-- funksiyalar va service_role ko'radi.
alter table public.staff_telegram_codes enable row level security;

-- ---------- 3. Yangi buyurtma xabari yuborilganligi belgisi ----------
-- Buyurtma tahrirlanganda summasi qayta o'zgaradi — shu jadval bo'lmasa
-- xodimga bitta buyurtma haqida bir necha marta xabar borardi.
create table if not exists public.staff_order_notified (
  order_id uuid not null references public.orders(id) on delete cascade,
  kind     text not null,
  at       timestamptz not null default now(),
  primary key (order_id, kind)
);

alter table public.staff_order_notified enable row level security;

-- ---------- 4. Ichki sozlamalar (trigger uchun) ----------
-- Trigger edge funksiyani chaqiradi; uning manzili va maxfiy kaliti shu
-- yerda turadi. Migratsiya faylida QIYMAT YO'Q — uni kodchi\ dagi sozlash
-- skripti yozadi, ya'ni maxfiy kalit git'ga tushmaydi.
create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;  -- policy yo'q: faqat service_role

-- =============================================================
--  RPC: panel tomoni (authenticated)
-- =============================================================

-- Ulanish kodi. Panelda "Telegramga ulash" bosilganda chaqiriladi va
-- t.me/yukchibolla_bot?start=KOD havolasi yasaladi.
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

  -- pgcrypto ishlatilmaydi: u extensions sxemasida, bu funksiya esa
  -- search_path = public bilan ishlaydi. gen_random_uuid() pg_catalog'da.
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into staff_telegram_codes (code, profile_id, expires_at)
  values (v_code, auth.uid(), now() + interval '30 minutes');

  return v_code;
end $$;

revoke all on function public.staff_telegram_code() from anon, public;
grant execute on function public.staff_telegram_code() to authenticated;

create or replace function public.staff_telegram_unlink()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.staff_telegram where profile_id = auth.uid();
$$;

revoke all on function public.staff_telegram_unlink() from anon, public;
grant execute on function public.staff_telegram_unlink() to authenticated;

-- =============================================================
--  RPC: bot tomoni (faqat service_role)
--
--  Bularning hech biriga authenticated grant BERILMAYDI: chat_id taxmin
--  qilib begona buyurtmani so'rab olish yo'li ochilmasin.
-- =============================================================

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
  v_role    text;
  v_name    text;
begin
  select c.profile_id into v_profile
  from staff_telegram_codes c
  where c.code = upper(trim(p_code))
    and c.used_at is null
    and c.expires_at > now();

  if v_profile is null then
    return jsonb_build_object('ok', false, 'error', 'KOD_NOTOGRI');
  end if;

  update staff_telegram_codes set used_at = now() where code = upper(trim(p_code));

  -- Bitta telegram akkaunt bir vaqtda faqat bitta xodimga tegishli
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

-- Menejer uchun qulaylik: kontakt yuborsa ham ulanadi (raqami bazada bor).
-- Adminda telefon ustuni yo'q — u faqat kod bilan ulanadi.
create or replace function public.staff_telegram_link_phone(
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
  v_oxirgi9 text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_profile uuid;
  v_name    text;
begin
  if length(v_oxirgi9) < 9 then
    return jsonb_build_object('ok', false, 'error', 'TELEFON_NOTOGRI');
  end if;

  select p.id, coalesce(nullif(p.full_name, ''), m.name)
    into v_profile, v_name
  from managers m
  join profiles p on p.manager_id = m.id
  where m.is_active
    and right(regexp_replace(m.phone, '\D', '', 'g'), 9) = v_oxirgi9
  limit 1;

  if v_profile is null then
    return jsonb_build_object('ok', false, 'error', 'MENEJER_TOPILMADI');
  end if;

  delete from staff_telegram where chat_id = p_chat_id;

  insert into staff_telegram (profile_id, chat_id, username, first_name)
  values (v_profile, p_chat_id, p_username, p_first_name)
  on conflict (profile_id) do update
    set chat_id    = excluded.chat_id,
        username   = excluded.username,
        first_name = excluded.first_name,
        linked_at  = now();

  return jsonb_build_object('ok', true, 'role', 'manager', 'name', coalesce(v_name, ''));
end $$;

-- Shu chatga ulangan xodim ko'ra oladigan oxirgi buyurtmalar.
create or replace function public.staff_orders_for_chat(
  p_chat_id bigint,
  p_status  text default null,
  p_limit   int  default 10
)
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

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select o.id,
           o.order_number,
           o.status,
           o.created_at,
           (case when v_baza then o.base_total else o.total end) as total,
           c.name  as customer,
           c.phone as phone
    from orders o
    join customers c on c.id = o.customer_id
    where (p_status is null or o.status = p_status)
      and (
        v_role = 'super_admin'
        or (v_role = 'admin'   and c.org_id     = v_org)
        or (v_role = 'manager' and c.manager_id = v_manager)
      )
    order by o.created_at desc
    limit least(coalesce(p_limit, 10), 30)
  ) t;

  return v_res;
end $$;

-- Faktura — xodim uchun. Rolga qarab narx turi tanlanadi.
create or replace function public.order_invoice_for_staff_chat(
  p_order_id uuid,
  p_chat_id  bigint
)
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
    'order_number', o.order_number,
    'status',       o.status,
    'created_at',   o.created_at,
    'total',        case when v_baza then o.base_total else o.total end,
    'price_kind',   case when v_baza then 'base' else 'real' end,
    'comment',      o.comment,
    'org_name',     org.name,
    'customer', jsonb_build_object(
      'name',  c.name,
      'phone', c.phone
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',       pr.name,
               'sku',        pv.sku,
               'size',       pv.size,
               'color',      pv.color,
               'qty',        oi.qty,
               'unit_price', case when v_baza then oi.base_price
                                  else oi.unit_price - coalesce(oi.discount, 0) end,
               'line_total', case when v_baza then oi.base_price * oi.qty
                                  else (oi.unit_price - coalesce(oi.discount, 0)) * oi.qty end,
               'image_path', (
                 select coalesce(pi.thumb_path, pi.storage_path)
                 from product_images pi
                 where pi.product_id = pr.id
                 order by pi.is_primary desc, pi.sort_order
                 limit 1
               )
             ) order by pr.name)
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id
      join products pr         on pr.id = pv.product_id
      where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_res
  from orders o
  join customers c            on c.id  = o.customer_id
  left join organizations org on org.id = c.org_id
  where o.id = p_order_id
    and (
      v_role = 'super_admin'
      or (v_role = 'admin'   and c.org_id     = v_org)
      or (v_role = 'manager' and c.manager_id = v_manager)
    );

  return v_res;
end $$;

-- Buyurtma haqida kimga xabar berish kerak: shu tenant adminlari,
-- mijozning menejeri va (ulangan bo'lsa) super_admin. Har bir chat uchun
-- summa o'sha odam ko'rishi kerak bo'lgan narxda qaytadi.
create or replace function public.staff_chats_for_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select st.chat_id,
           p.role,
           o.id    as order_id,
           o.order_number,
           o.status,
           o.created_at,
           c.name  as customer,
           c.phone as phone,
           (case when p.role in ('admin', 'super_admin') then o.base_total else o.total end) as total,
           (select count(*) from order_items oi where oi.order_id = o.id) as items_count
    from orders o
    join customers c on c.id = o.customer_id
    join profiles p
      on (p.role = 'super_admin')
      or (p.role = 'admin'   and p.org_id     = c.org_id)
      or (p.role = 'manager' and p.manager_id = c.manager_id)
    join staff_telegram st on st.profile_id = p.id
    where o.id = p_order_id
  ) t;

  return v_res;
end $$;

revoke all on function public.staff_telegram_link(text, bigint, text, text) from anon, public;
revoke all on function public.staff_telegram_link(text, bigint, text, text) from authenticated;
grant execute on function public.staff_telegram_link(text, bigint, text, text) to service_role;

revoke all on function public.staff_telegram_link_phone(text, bigint, text, text) from anon, public;
revoke all on function public.staff_telegram_link_phone(text, bigint, text, text) from authenticated;
grant execute on function public.staff_telegram_link_phone(text, bigint, text, text) to service_role;

revoke all on function public.staff_orders_for_chat(bigint, text, int) from anon, public;
revoke all on function public.staff_orders_for_chat(bigint, text, int) from authenticated;
grant execute on function public.staff_orders_for_chat(bigint, text, int) to service_role;

revoke all on function public.order_invoice_for_staff_chat(uuid, bigint) from anon, public;
revoke all on function public.order_invoice_for_staff_chat(uuid, bigint) from authenticated;
grant execute on function public.order_invoice_for_staff_chat(uuid, bigint) to service_role;

revoke all on function public.staff_chats_for_order(uuid) from anon, public;
revoke all on function public.staff_chats_for_order(uuid) from authenticated;
grant execute on function public.staff_chats_for_order(uuid) to service_role;

-- =============================================================
--  Yangi buyurtma -> xodimlarga xabar (pg_net orqali edge funksiya)
--
--  Nega INSERT emas, "total o'zgarganda": create_order avval bo'sh
--  buyurtma qatorini yozadi, summani esa qatorlar kiritilgach UPDATE
--  qiladi. INSERT'da xabar bersak summasi 0 bo'lib ketardi.
-- =============================================================
create extension if not exists pg_net;

create or replace function public.staff_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_n      int;
begin
  if new.status <> 'new' or coalesce(new.total, 0) <= 0 then
    return new;
  end if;

  insert into staff_order_notified (order_id, kind)
  values (new.id, 'new_order')
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return new; end if;   -- bu buyurtma haqida allaqachon aytilgan

  select value into v_url    from app_secrets where key = 'staff_notify_url';
  select value into v_secret from app_secrets where key = 'internal_notify_secret';
  if v_url is null or v_secret is null then return new; end if;

  -- Xabar ketmasa ham buyurtma yozilishi SHART — shuning uchun xatoni yutamiz
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-internal-secret', v_secret),
      body    := jsonb_build_object('order_id', new.id)
    );
  exception when others then
    null;
  end;

  return new;
end $$;

drop trigger if exists orders_staff_notify on public.orders;
create trigger orders_staff_notify
  after insert or update of total on public.orders
  for each row execute function public.staff_notify_new_order();
