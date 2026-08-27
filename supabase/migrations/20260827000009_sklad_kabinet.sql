-- =============================================================
--  SKLAD KABINETI — login, parol va Google
--
--  Telegram bot yetarli emas: sklad o'z praysini, qoldig'ini va
--  so'rovlarini brauzerda ko'rishi va tahrirlashi kerak.
--
--  SKLAD FOYDALANUVCHISI TENANT EMAS. U Yukchibolla organizatsiyasiga
--  tegishli emas va admin panelga kirmaydi — shuning uchun unga
--  `profiles` yozuvi ochilmaydi (u yerda org_id majburiy). Bog'lanish
--  alohida jadvalda: dori_warehouse_users.
--
--  IKKI XIL KIRISH:
--   * parol — super admin email va parol beradi (edge funksiya orqali,
--     chunki auth foydalanuvchisini yaratish service_role talab qiladi)
--   * Google — super admin faqat EMAILNI ro'yxatga oladi. Odam Google
--     bilan kirganda email bo'yicha bog'lanadi. Ro'yxatda yo'q email
--     bilan kirsa — hech qanday sklad ochilmaydi.
--
--  Ya'ni ikkala yo'lda ham ruxsatni super admin beradi: Google tugmasi
--  o'zi hech kimga eshik ochmaydi.
-- =============================================================

create table if not exists public.dori_warehouse_users (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.dori_warehouses(id) on delete cascade,
  email        text not null,
  -- Google bilan kirish uchun oldindan ro'yxatga olinganda bo'sh bo'ladi
  user_id      uuid references auth.users(id) on delete set null,
  full_name    text,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz
);

create unique index if not exists dori_wh_users_email_key
  on public.dori_warehouse_users (lower(trim(email)));

create unique index if not exists dori_wh_users_uid_key
  on public.dori_warehouse_users (user_id) where user_id is not null;

create index if not exists dori_wh_users_wh_idx
  on public.dori_warehouse_users (warehouse_id);

alter table public.dori_warehouse_users enable row level security;

-- Super admin boshqaradi; sklad xodimi O'Z qatorini ko'ra oladi
drop policy if exists "dori_wh_users: super_admin" on public.dori_warehouse_users;
create policy "dori_wh_users: super_admin"
  on public.dori_warehouse_users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists "dori_wh_users: ozi" on public.dori_warehouse_users;
create policy "dori_wh_users: ozi"
  on public.dori_warehouse_users for select to authenticated
  using (user_id = auth.uid());

-- ---------- Profil yaratilmasin ----------
-- Har yangi auth foydalanuvchisi uchun handle_new_user() profiles ga
-- yozadi, u yerda esa org_id majburiy. Sklad xodimi tenantga tegishli
-- emas — dori mijozi kabi, profilsiz yashaydi.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := nullif(new.raw_user_meta_data->>'customer_id', '')::uuid;
  v_manager_id  uuid := nullif(new.raw_user_meta_data->>'manager_id', '')::uuid;
  v_org_id      uuid := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  v_role        text := coalesce(new.raw_user_meta_data->>'role', 'customer');
begin
  if coalesce(new.raw_user_meta_data->>'dori_mijoz', 'false') = 'true' then
    return new;
  end if;

  -- Sklad xodimi: bog'lanish dori_warehouse_users da
  if coalesce(new.raw_user_meta_data->>'sklad_user', 'false') = 'true' then
    return new;
  end if;

  if v_customer_id is not null then
    select org_id into v_org_id from public.customers where id = v_customer_id;
  end if;
  if v_manager_id is not null then
    select org_id into v_org_id from public.managers where id = v_manager_id;
  end if;

  insert into public.profiles (id, full_name, customer_id, manager_id, org_id, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''),
          v_customer_id, v_manager_id, v_org_id, v_role);
  return new;
end $$;

-- ---------- Men kim? ----------
-- Ilova kirishdan keyin shuni so'raydi: javob bo'lsa - sklad kabineti
-- ochiladi, bo'lmasa oddiy oqim davom etadi.
--
-- GOOGLE BOG'LANISHI shu yerda: agar foydalanuvchining emaili ro'yxatda
-- bo'lsa-yu, hali bog'lanmagan bo'lsa - bog'lanadi. Ro'yxatda bo'lmagan
-- email hech narsa olmaydi.
create or replace function public.dori_sklad_men()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  r       record;
begin
  if auth.uid() is null then
    return null;
  end if;

  select lower(trim(email)) into v_email from auth.users where id = auth.uid();

  -- Avval to'g'ridan-to'g'ri bog'lanish
  select u.*, w.name as sklad, w.is_active as sklad_faol
    into r
  from dori_warehouse_users u
  join dori_warehouses w on w.id = u.warehouse_id
  where u.user_id = auth.uid() and u.is_active;

  -- Bog'lanmagan bo'lsa - email bo'yicha (Google bilan birinchi kirish)
  if r.id is null and v_email is not null then
    update dori_warehouse_users u
       set user_id = auth.uid(), last_seen = now()
     where lower(trim(u.email)) = v_email
       and u.user_id is null
       and u.is_active;

    select u.*, w.name as sklad, w.is_active as sklad_faol
      into r
    from dori_warehouse_users u
    join dori_warehouses w on w.id = u.warehouse_id
    where u.user_id = auth.uid() and u.is_active;
  end if;

  if r.id is null or not coalesce(r.sklad_faol, false) then
    return null;
  end if;

  update dori_warehouse_users set last_seen = now() where id = r.id;

  return jsonb_build_object(
    'warehouse_id', r.warehouse_id,
    'sklad', r.sklad,
    'email', r.email,
    'full_name', r.full_name
  );
end $$;

revoke all on function public.dori_sklad_men() from public, anon;
grant execute on function public.dori_sklad_men() to authenticated;

-- ---------- Kabinet: mening so'rovlarim ----------
create or replace function public.dori_kabinet_sorovlar(p_limit int default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v    jsonb;
begin
  select warehouse_id into v_wh
  from dori_warehouse_users
  where user_id = auth.uid() and is_active;

  if v_wh is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v
  from (
    select s.id, s.status, s.base_total, s.created_at, s.sent_at, s.note,
           o.order_no, o.pharmacy, o.comment,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name, 'qty', i.qty,
                      'base_price', i.base_price, 'base_sum', i.base_sum
                    ) order by i.name)
             from dori_split_items i where i.split_id = s.id
           ), '[]'::jsonb) as pozitsiyalar
    from dori_order_splits s
    join dori_orders o on o.id = s.order_id
    where s.warehouse_id = v_wh and s.status <> 'cancelled'
    order by s.created_at desc
    limit least(coalesce(p_limit, 20), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_kabinet_sorovlar(int) from public, anon;
grant execute on function public.dori_kabinet_sorovlar(int) to authenticated;

-- ---------- Kabinet: so'rovga javob ----------
create or replace function public.dori_kabinet_javob(p_split_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
begin
  if p_status not in ('accepted', 'rejected', 'done') then
    raise exception 'HOLAT_NOTOGRI';
  end if;

  select warehouse_id into v_wh
  from dori_warehouse_users where user_id = auth.uid() and is_active;

  if v_wh is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Sklad faqat O'Z so'roviga javob beradi
  update dori_order_splits
     set status = p_status,
         note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note),
         updated_at = now()
   where id = p_split_id and warehouse_id = v_wh;

  if not found then
    raise exception 'SOROV_TOPILMADI';
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_kabinet_javob(uuid, text, text) from public, anon;
grant execute on function public.dori_kabinet_javob(uuid, text, text) to authenticated;

-- ---------- Kabinet: mening praysim ----------
create or replace function public.dori_kabinet_narxlar(
  p_q      text default null,
  p_offset int default 0,
  p_limit  int default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v_lim int := least(coalesce(p_limit, 50), 200);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v     jsonb;
begin
  select warehouse_id into v_wh
  from dori_warehouse_users where user_id = auth.uid() and is_active;

  if v_wh is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
    'jami', (
      select count(*) from dori_offers o join dori_products p on p.id = o.product_id
      where o.warehouse_id = v_wh
        and (v_q is null or p.name ilike '%' || v_q || '%')
    ),
    'items', coalesce((
      select jsonb_agg(t) from (
        -- DIQQAT: sklad O'Z narxini (base_price) ko'radi. Mijozga
        -- qo'yilgan ustama (price) unga ko'rsatilmaydi.
        select p.id, p.name, p.manufacturer, p.unit,
               o.base_price, o.stock, o.updated_at
        from dori_offers o
        join dori_products p on p.id = o.product_id
        where o.warehouse_id = v_wh
          and (v_q is null or p.name ilike '%' || v_q || '%')
        order by p.name
        offset v_off limit v_lim
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

revoke all on function public.dori_kabinet_narxlar(text, int, int) from public, anon;
grant execute on function public.dori_kabinet_narxlar(text, int, int) to authenticated;

-- ---------- Kabinet: qoldiqni yangilash ----------
-- Prays fayllarida qoldiq ustuni yo'q. Sklad o'z qoldig'ini shu yerdan
-- kiritsa, buyurtma taqsimoti aniqroq bo'ladi.
create or replace function public.dori_kabinet_qoldiq(p_product_id uuid, p_stock numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
begin
  select warehouse_id into v_wh
  from dori_warehouse_users where user_id = auth.uid() and is_active;

  if v_wh is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  update dori_offers
     set stock = case when p_stock is null then null else greatest(p_stock, 0) end,
         updated_at = now()
   where warehouse_id = v_wh and product_id = p_product_id;

  if not found then
    raise exception 'TAKLIF_TOPILMADI';
  end if;

  perform dori_katalog_yigish(array[p_product_id]);

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_kabinet_qoldiq(uuid, numeric) from public, anon;
grant execute on function public.dori_kabinet_qoldiq(uuid, numeric) to authenticated;

-- ---------- Panel: sklad foydalanuvchilari ----------
create or replace function public.dori_sklad_user_royxat(p_warehouse_id uuid default null)
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

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v
  from (
    select u.id, u.warehouse_id, w.name as sklad, u.email, u.full_name,
           u.is_active, u.created_at, u.last_seen,
           (u.user_id is not null) as kirgan
    from dori_warehouse_users u
    join dori_warehouses w on w.id = u.warehouse_id
    where p_warehouse_id is null or u.warehouse_id = p_warehouse_id
  ) t;

  return v;
end $$;

revoke all on function public.dori_sklad_user_royxat(uuid) from public, anon;
grant execute on function public.dori_sklad_user_royxat(uuid) to authenticated;

-- Faqat EMAIL qo'shish (Google bilan kirish uchun; parol bermaymiz)
create or replace function public.dori_sklad_user_qosh(
  p_warehouse_id uuid,
  p_email        text,
  p_full_name    text default null
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
  if nullif(trim(coalesce(p_email, '')), '') is null or p_email not like '%@%' then
    raise exception 'EMAIL_NOTOGRI';
  end if;
  if not exists (select 1 from dori_warehouses where id = p_warehouse_id) then
    raise exception 'SKLAD_TOPILMADI';
  end if;

  insert into dori_warehouse_users (warehouse_id, email, full_name, created_by)
  values (p_warehouse_id, lower(trim(p_email)), nullif(trim(coalesce(p_full_name, '')), ''), auth.uid())
  on conflict (lower(trim(email))) do update
    set warehouse_id = excluded.warehouse_id,
        full_name    = coalesce(excluded.full_name, dori_warehouse_users.full_name),
        is_active    = true
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.dori_sklad_user_qosh(uuid, text, text) from public, anon;
grant execute on function public.dori_sklad_user_qosh(uuid, text, text) to authenticated;

create or replace function public.dori_sklad_user_ochir(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  delete from dori_warehouse_users where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_sklad_user_ochir(uuid) from public, anon;
grant execute on function public.dori_sklad_user_ochir(uuid) to authenticated;
