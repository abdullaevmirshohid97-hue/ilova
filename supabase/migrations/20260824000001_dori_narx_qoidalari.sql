-- =============================================================
--  NARX QO'YISH — ustama foiz va chegirma
--
--  Bugungi holat: fayldan kelgan postavshchik narxi to'g'ridan-to'g'ri
--  mijozga ko'rinadi, ya'ni tizim foydasiz sotyapti.
--
--  Endi: fayldagi narx TANNARX (`base_price`) bo'lib qoladi va mijozga
--  hech qachon ko'rinmaydi. Ustiga qoida qo'yiladi, `price` esa SOTUV
--  narxi bo'ladi.
--
--  NEGA `price` USTUNI SOTUV NARXI: bot, Mini App, savat, buyurtma va
--  faktura allaqachon shu ustunni o'qiydi. Tannarxni alohida ustunga
--  chiqarsak, mijozga ketadigan yo'lda u umuman qatnashmaydi — tasodifan
--  ochilib qolishi mumkin emas. Teskarisi (price = tannarx) bo'lganda
--  har bir joyni qo'lda tuzatish kerak bo'lardi va bittasi unutilsa
--  tannarx sizib chiqardi.
--
--  QOIDALAR JADVALI, bitta ustun emas: "kim, qachon, nechchi foiz
--  qo'ygan" degan savolga javob qolsin va ortga qaytarish mumkin bo'lsin.
--  Kuchi: alohida dori > guruh > umumiy. Ustama va chegirma ALOHIDA
--  hal qilinadi — aks holda bitta doriga chegirma qo'yilsa, umumiy
--  ustama undan tushib qolardi.
-- =============================================================

-- ---------- 1. Tannarx ustuni ----------
alter table public.dori_products
  add column if not exists base_price numeric(16,2);

-- Bugungi narxlar — postavshchik narxi, ya'ni tannarx
update public.dori_products
   set base_price = price
 where base_price is null;

-- ---------- 2. Sozlama ----------
create table if not exists public.dori_settings (
  id           boolean primary key default true check (id),
  rounding     int not null default 100,   -- 0 = yaxlitlamaslik
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

insert into public.dori_settings (id) values (true) on conflict do nothing;

alter table public.dori_settings enable row level security;

drop policy if exists "dori_settings: super_admin" on public.dori_settings;
create policy "dori_settings: super_admin"
  on public.dori_settings for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 3. Qoidalar ----------
create table if not exists public.dori_price_rules (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('global', 'group', 'product')),
  target_key   text,                       -- guruh nomi yoki product_id
  markup_pct   numeric(6,2),
  discount_pct numeric(6,2),
  is_active    boolean not null default true,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (scope = 'global' or target_key is not null),
  check (coalesce(markup_pct, 0) between -100 and 1000),
  check (coalesce(discount_pct, 0) between 0 and 100)
);

-- Bitta nishonga bitta faol qoida
create unique index if not exists dori_price_rules_key
  on public.dori_price_rules (scope, coalesce(target_key, ''))
  where is_active;

alter table public.dori_price_rules enable row level security;

drop policy if exists "dori_price_rules: super_admin" on public.dori_price_rules;
create policy "dori_price_rules: super_admin"
  on public.dori_price_rules for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 4. Hisoblash ----------
-- Ustama va chegirma alohida, eng aniq qoidadan olinadi.
create or replace function public.dori_narx_hisobla(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round int;
  v_n     int;
begin
  select rounding into v_round from dori_settings where id;
  v_round := coalesce(v_round, 0);

  with qoida as (
    select p.id,
           coalesce(p.base_price, p.price, 0) as tannarx,
           -- Eng aniq qoidadan: dori -> guruh -> umumiy
           coalesce(
             (select r.markup_pct from dori_price_rules r
               where r.is_active and r.scope = 'product'
                 and r.target_key = p.id::text and r.markup_pct is not null),
             (select r.markup_pct from dori_price_rules r
               where r.is_active and r.scope = 'group'
                 and r.target_key = p.grp and r.markup_pct is not null),
             (select r.markup_pct from dori_price_rules r
               where r.is_active and r.scope = 'global' and r.markup_pct is not null),
             0
           ) as ustama,
           coalesce(
             (select r.discount_pct from dori_price_rules r
               where r.is_active and r.scope = 'product'
                 and r.target_key = p.id::text and r.discount_pct is not null),
             (select r.discount_pct from dori_price_rules r
               where r.is_active and r.scope = 'group'
                 and r.target_key = p.grp and r.discount_pct is not null),
             (select r.discount_pct from dori_price_rules r
               where r.is_active and r.scope = 'global' and r.discount_pct is not null),
             0
           ) as chegirma
    from dori_products p
    where p_ids is null or p.id = any (p_ids)
  ),
  hisob as (
    select id,
           case
             when v_round > 0
               then round(tannarx * (1 + ustama / 100) * (1 - chegirma / 100) / v_round) * v_round
             else round(tannarx * (1 + ustama / 100) * (1 - chegirma / 100))
           end as yangi
    from qoida
  )
  update dori_products p
     set price = h.yangi, updated_at = now()
    from hisob h
   where p.id = h.id
     and p.price is distinct from h.yangi;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.dori_narx_hisobla(uuid[]) from public, anon;
grant execute on function public.dori_narx_hisobla(uuid[]) to authenticated;

-- ---------- 5. Qoida qo'yish ----------
create or replace function public.dori_price_rule_set(
  p_scope        text,
  p_target_key   text default null,
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Ikkalasi ham bo'sh bo'lsa — qoidani o'chirish deb tushuniladi
  if p_markup_pct is null and p_discount_pct is null then
    update dori_price_rules
       set is_active = false, updated_at = now()
     where is_active and scope = p_scope
       and coalesce(target_key, '') = coalesce(p_target_key, '');
  else
    insert into dori_price_rules (scope, target_key, markup_pct, discount_pct, note, created_by)
    values (p_scope, p_target_key, p_markup_pct, p_discount_pct, p_note, auth.uid())
    on conflict (scope, coalesce(target_key, '')) where is_active
    do update set markup_pct   = excluded.markup_pct,
                  discount_pct = excluded.discount_pct,
                  note         = excluded.note,
                  updated_at   = now()
    returning id into v_id;
  end if;

  v_n := dori_narx_hisobla(null);
  return jsonb_build_object('ok', true, 'rule_id', v_id, 'ozgargan_narx', v_n);
end $$;

revoke all on function public.dori_price_rule_set(text, text, numeric, numeric, text) from public, anon;
grant execute on function public.dori_price_rule_set(text, text, numeric, numeric, text) to authenticated;

-- Bir nechta doriga birdaniga (tanlanganlarga chegirma)
create or replace function public.dori_price_rule_bulk(
  p_ids          uuid[],
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'DORI_TANLANMAGAN');
  end if;

  foreach v_id in array p_ids loop
    if p_markup_pct is null and p_discount_pct is null then
      update dori_price_rules
         set is_active = false, updated_at = now()
       where is_active and scope = 'product' and target_key = v_id::text;
    else
      insert into dori_price_rules (scope, target_key, markup_pct, discount_pct, note, created_by)
      values ('product', v_id::text, p_markup_pct, p_discount_pct, p_note, auth.uid())
      on conflict (scope, coalesce(target_key, '')) where is_active
      do update set markup_pct   = excluded.markup_pct,
                    discount_pct = excluded.discount_pct,
                    note         = excluded.note,
                    updated_at   = now();
    end if;
  end loop;

  v_n := dori_narx_hisobla(p_ids);
  return jsonb_build_object('ok', true, 'dorilar', array_length(p_ids, 1), 'ozgargan_narx', v_n);
end $$;

revoke all on function public.dori_price_rule_bulk(uuid[], numeric, numeric, text) from public, anon;
grant execute on function public.dori_price_rule_bulk(uuid[], numeric, numeric, text) to authenticated;

-- ---------- 6. Oldindan ko'rish (bazaga yozmasdan) ----------
create or replace function public.dori_price_preview(
  p_scope        text,
  p_target_key   text default null,
  p_markup_pct   numeric default null,
  p_discount_pct numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_round int;
  v_res   jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(rounding, 0) into v_round from dori_settings where id;

  with tegishli as (
    select p.id, p.name, coalesce(p.base_price, p.price, 0) as tannarx, p.price as hozirgi
    from dori_products p
    where p.is_active
      and (
        p_scope = 'global'
        or (p_scope = 'group'   and p.grp = p_target_key)
        or (p_scope = 'product' and p.id::text = p_target_key)
      )
  ),
  hisob as (
    select *,
           case when v_round > 0
             then round(tannarx * (1 + coalesce(p_markup_pct, 0) / 100)
                                * (1 - coalesce(p_discount_pct, 0) / 100) / v_round) * v_round
             else round(tannarx * (1 + coalesce(p_markup_pct, 0) / 100)
                                * (1 - coalesce(p_discount_pct, 0) / 100))
           end as yangi
    from tegishli
  )
  select jsonb_build_object(
    'dorilar',   (select count(*) from hisob),
    'ozgaradi',  (select count(*) from hisob where yangi is distinct from hozirgi),
    'namuna',    (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                    select name, tannarx, hozirgi, yangi from hisob
                    where yangi is distinct from hozirgi
                    order by name limit 8
                  ) t)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_price_preview(text, text, numeric, numeric) from public, anon;
grant execute on function public.dori_price_preview(text, text, numeric, numeric) to authenticated;

-- ---------- 7. Qoidalar ro'yxati ----------
create or replace function public.dori_price_rules_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.tartib, t.created_at desc), '[]'::jsonb) into v_res
  from (
    select r.id, r.scope, r.target_key, r.markup_pct, r.discount_pct, r.note, r.created_at,
           case r.scope when 'global' then 1 when 'group' then 2 else 3 end as tartib,
           case r.scope
             when 'product' then (select p.name from dori_products p where p.id::text = r.target_key)
             else r.target_key
           end as nishon
    from dori_price_rules r
    where r.is_active
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_price_rules_list() from public, anon;
grant execute on function public.dori_price_rules_list() to authenticated;

-- ---------- 8. Super admin uchun dori qidirish (tannarx bilan) ----------
-- Mijoz qidiruvidan FARQLI: bu yerda tannarx ham ko'rinadi.
create or replace function public.dori_admin_search(p_q text, p_limit int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_lat text;
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if v_q is null or length(v_q) < 2 then return '[]'::jsonb; end if;

  v_lat := dori_lat(v_q);
  perform set_config('pg_trgm.word_similarity_threshold', '0.45', true);

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.grp, p.manufacturer,
           coalesce(p.base_price, 0) as tannarx,
           coalesce(p.price, 0)      as sotuv,
           (select r.markup_pct from dori_price_rules r
             where r.is_active and r.scope = 'product' and r.target_key = p.id::text) as oz_ustamasi,
           (select r.discount_pct from dori_price_rules r
             where r.is_active and r.scope = 'product' and r.target_key = p.id::text) as oz_chegirmasi
    from dori_products p
    where p.is_active
      and (p.name ilike '%' || v_q || '%' or p.name_lat like '%' || v_lat || '%' or v_lat <% p.name_lat)
    order by (p.name_lat like v_lat || '%') desc, p.name
    limit least(coalesce(p_limit, 30), 100)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_admin_search(text, int) from public, anon;
grant execute on function public.dori_admin_search(text, int) to authenticated;

-- ---------- 9. Guruhlar va umumiy holat ----------
create or replace function public.dori_price_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
    'jami',      (select count(*) from dori_products where is_active),
    'yaxlitlash',(select rounding from dori_settings where id),
    'umumiy_ustama',   (select markup_pct from dori_price_rules where is_active and scope = 'global'),
    'umumiy_chegirma', (select discount_pct from dori_price_rules where is_active and scope = 'global'),
    'ortacha_ustama', (
      select round(avg(case when coalesce(base_price, 0) > 0
                       then (price - base_price) * 100.0 / base_price end), 2)
      from dori_products where is_active
    ),
    'guruhlar', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(grp, '—') as grp, count(*) as n
        from dori_products where is_active
        group by 1 order by count(*) desc limit 30
      ) t
    )
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_price_overview() from public, anon;
grant execute on function public.dori_price_overview() to authenticated;

-- ---------- 10. Import: tannarxni yozadi, sotuv narxini hisoblaydi ----------
-- Import narxni `base_price` ga yozishi kerak, `price` esa qoidalardan
-- kelib chiqib hisoblanadi. Aks holda har importda ustama yo'qolardi.
create or replace function public.dori_import_narx_yakun()
returns int
language sql
security definer
set search_path = public
as $$
  select public.dori_narx_hisobla(null);
$$;

revoke all on function public.dori_import_narx_yakun() from public, anon;
grant execute on function public.dori_import_narx_yakun() to authenticated;
