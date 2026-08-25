-- =============================================================
--  DORI MIJOZLARI — adminni yaratadi, mijoz botda o'zini tanitadi
--
--  Bugungi holat: mijoz o'zi botga /start bosib telefon yuborsa yozilardi,
--  ya'ni istalgan odam kirib narxlarni ko'rib, buyurtma bera olardi.
--  Ulgurji savdoda bu to'g'ri emas — mijozni admin ro'yxatga oladi.
--
--  TUZILISH O'ZGARADI: kalit `chat_id` edi, lekin admin mijozni
--  yaratganda Telegram chat'i hali YO'Q. Endi kalit — `id`, telefon esa
--  yagona; chat_id keyin, mijoz botda telefonini tasdiqlaganda to'ladi.
--
--  Login: telefon raqamdan `<raqamlar>@dori.ilova` email yasaladi
--  (Yukchibolla'dagi bilan bir xil usul), parol admin qo'yadi.
-- =============================================================

-- ---------- 1. Yangi tuzilish ----------
alter table public.dori_customers rename to dori_customers_eski;

create table public.dori_customers (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  phone_norm   text not null,          -- solishtirish uchun: faqat raqamlar
  name         text,
  pharmacy     text,
  address      text,
  chat_id      bigint,                 -- Telegram (keyin to'ladi)
  username     text,
  auth_user_id uuid,                   -- login uchun
  is_blocked   boolean not null default false,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz
);

create unique index dori_customers_phone_key on public.dori_customers (phone_norm);
create unique index dori_customers_chat_key  on public.dori_customers (chat_id) where chat_id is not null;

-- Eskilarni ko'chiramiz (o'zi ro'yxatdan o'tganlar saqlanib qoladi)
insert into public.dori_customers (phone, phone_norm, name, pharmacy, chat_id, username, is_blocked, created_at, last_seen)
select coalesce(e.phone, e.chat_id::text),
       right(regexp_replace(coalesce(e.phone, ''), '\D', '', 'g'), 9),
       e.name, e.pharmacy, e.chat_id, e.username, e.is_blocked, e.created_at, e.last_seen
from public.dori_customers_eski e
where coalesce(e.phone, '') <> ''
on conflict do nothing;

drop table public.dori_customers_eski;

alter table public.dori_customers enable row level security;

drop policy if exists "dori_customers: super_admin" on public.dori_customers;
create policy "dori_customers: super_admin"
  on public.dori_customers for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 2. Telefonni normallashtirish ----------
create or replace function public.dori_tel(p text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9);
$$;

-- ---------- 3. Botda o'zini tanitish ----------
-- Endi ro'yxatda BO'LMAGAN raqam ulanmaydi: mijozni admin yaratadi.
create or replace function public.dori_bot_link(
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
  v_id  uuid;
  v_nom text;
begin
  select id, name into v_id, v_nom
  from dori_customers
  where phone_norm = dori_tel(p_phone) and not is_blocked;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'ROYXATDA_YOQ');
  end if;

  -- Bitta telegram akkaunt bir vaqtda bitta mijozga
  update dori_customers set chat_id = null where chat_id = p_chat_id and id <> v_id;

  update dori_customers
     set chat_id   = p_chat_id,
         username  = p_username,
         name      = coalesce(name, p_name),
         last_seen = now()
   where id = v_id;

  return jsonb_build_object('ok', true, 'name', coalesce(v_nom, p_name, ''));
end $$;

revoke all on function public.dori_bot_link(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.dori_bot_link(bigint, text, text, text) to service_role;

-- ---------- 4. Super admin: mijozlar ro'yxati ----------
create or replace function public.dori_customers_list(p_q text default null, p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select c.id, c.name, c.phone, c.pharmacy, c.address, c.is_blocked,
           (c.chat_id is not null) as telegram_ulangan,
           (c.auth_user_id is not null) as login_bor,
           c.created_at, c.last_seen,
           (select count(*) from dori_orders o where o.chat_id = c.chat_id) as buyurtmalar,
           (select coalesce(sum(o.total), 0) from dori_orders o
             where o.chat_id = c.chat_id and o.status <> 'cancelled') as jami_summa
    from dori_customers c
    where v_q is null
       or c.name ilike '%' || v_q || '%'
       or c.phone ilike '%' || v_q || '%'
       or c.pharmacy ilike '%' || v_q || '%'
    order by c.created_at desc
    limit least(coalesce(p_limit, 100), 300)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_customers_list(text, int) from public, anon;
grant execute on function public.dori_customers_list(text, int) to authenticated;

-- ---------- 5. Super admin: yaratish va tahrirlash ----------
-- Parol bu yerda emas, edge funksiyada qo'yiladi (auth foydalanuvchisi
-- bilan birga) — parolni bazadagi funksiyaga uzatib bo'lmaydi.
create or replace function public.dori_customer_upsert(
  p_id       uuid default null,
  p_name     text default null,
  p_phone    text default null,
  p_pharmacy text default null,
  p_address  text default null,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if length(dori_tel(p_phone)) < 9 then
    return jsonb_build_object('ok', false, 'error', 'TELEFON_NOTOGRI');
  end if;

  if p_id is null then
    if exists (select 1 from dori_customers where phone_norm = dori_tel(p_phone)) then
      return jsonb_build_object('ok', false, 'error', 'TELEFON_BAND');
    end if;
    insert into dori_customers (phone, phone_norm, name, pharmacy, address, note, created_by)
    values (trim(p_phone), dori_tel(p_phone), nullif(trim(p_name), ''),
            nullif(trim(p_pharmacy), ''), nullif(trim(p_address), ''),
            nullif(trim(p_note), ''), auth.uid())
    returning id into v_id;
  else
    update dori_customers
       set name     = nullif(trim(p_name), ''),
           phone    = coalesce(nullif(trim(p_phone), ''), phone),
           phone_norm = case when nullif(trim(p_phone), '') is not null
                             then dori_tel(p_phone) else phone_norm end,
           pharmacy = nullif(trim(p_pharmacy), ''),
           address  = nullif(trim(p_address), ''),
           note     = nullif(trim(p_note), '')
     where id = p_id
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.dori_customer_upsert(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.dori_customer_upsert(uuid, text, text, text, text, text) to authenticated;

create or replace function public.dori_customer_block(p_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  update dori_customers set is_blocked = p_blocked where id = p_id;
end $$;

revoke all on function public.dori_customer_block(uuid, boolean) from public, anon;
grant execute on function public.dori_customer_block(uuid, boolean) to authenticated;

-- Telegram bog'lanishini uzish (mijoz telefonini almashtirsa kerak bo'ladi)
create or replace function public.dori_customer_unlink(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  update dori_customers set chat_id = null, username = null where id = p_id;
end $$;

revoke all on function public.dori_customer_unlink(uuid) from public, anon;
grant execute on function public.dori_customer_unlink(uuid) to authenticated;
