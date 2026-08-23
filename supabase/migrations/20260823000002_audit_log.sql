-- =============================================================
--  1-BOSQICH · NAZORAT MARKAZI — audit jurnali
--
--  Talab: super admin har bir harakatni ko'rib, kuzatib tursin.
--
--  Nega ilovada emas, BAZADA yoziladi: panel orqali ham, bot orqali
--  ham, to'g'ridan-to'g'ri SQL orqali ham o'zgarish bo'lishi mumkin.
--  Trigger bazada turgani uchun uchalasi ham yoziladi — ya'ni jurnalni
--  chetlab o'tish yo'li yo'q.
--
--  NARX MAXFIYLIGI: menejer narxlari jadvallarida faqat HARAKAT FAKTI
--  yoziladi (kim, qachon, qaysi yozuvni o'zgartirdi), QIYMAT yozilmaydi.
--  Aks holda super admin jurnal orqali menejer ustamasini ko'rib qolardi
--  va butun diler modeli buzilardi. Zarur bo'lganda alohida, sababi
--  yozib ochiladigan ruxsat mexanizmi qo'shiladi.
--
--  HAJM: jurnal eng tez o'sadigan jadval. Shuning uchun oy bo'yicha
--  bo'linadi (partitsiya) — eski oyni o'chirish bir buyruq bo'ladi va
--  so'rovlar faqat kerakli oyni o'qiydi.
-- =============================================================

create table if not exists public.audit_log (
  id         bigserial,
  at         timestamptz not null default now(),
  actor_id   uuid,
  actor_role text,
  org_id     uuid,
  entity     text not null,
  entity_id  text,
  action     text not null check (action in ('insert', 'update', 'delete')),
  diff       jsonb,
  primary key (id, at)
) partition by range (at);

create index if not exists audit_log_at_idx     on public.audit_log (at desc);
create index if not exists audit_log_org_idx    on public.audit_log (org_id, at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;

-- Jurnalni faqat super admin o'qiydi. Tenant admini o'z tenantining
-- jurnalini ko'rishi kelajakda alohida qo'shiladi (hozir kerak emas).
drop policy if exists "audit_log: super_admin read" on public.audit_log;
create policy "audit_log: super_admin read"
  on public.audit_log for select to authenticated
  using (is_super_admin());

revoke all on table public.audit_log from anon, authenticated;
grant select on table public.audit_log to authenticated;

-- ---------- Partitsiyalar ----------
create or replace function public.ensure_audit_partitions(p_oldinga int default 2)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oy   date := date_trunc('month', now())::date;
  v_i    int;
  v_bosh date;
  v_oxir date;
  v_nom  text;
begin
  for v_i in 0 .. greatest(coalesce(p_oldinga, 2), 1) loop
    v_bosh := (v_oy + (v_i || ' month')::interval)::date;
    v_oxir := (v_bosh + interval '1 month')::date;
    v_nom  := 'audit_log_' || to_char(v_bosh, 'YYYY_MM');

    if not exists (select 1 from pg_class where relname = v_nom) then
      execute format(
        'create table public.%I partition of public.audit_log for values from (%L) to (%L)',
        v_nom, v_bosh, v_oxir
      );
    end if;
  end loop;
end $$;

revoke all on function public.ensure_audit_partitions(int) from public, anon, authenticated;

select public.ensure_audit_partitions(2);

-- Har oyning 1-sanasida keyingi oy uchun joy tayyorlanadi
select cron.unschedule('audit-partitions')
where exists (select 1 from cron.job where jobname = 'audit-partitions');

select cron.schedule('audit-partitions', '0 0 1 * *', 'select public.ensure_audit_partitions(2);');

-- ---------- Yozuvchi trigger ----------
-- TG_ARGV[0] = 'mask' bo'lsa qiymatlar yozilmaydi (menejer narxlari).
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eski   jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_yangi  jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_diff   jsonb := '{}'::jsonb;
  v_kalit  text;
  v_id     text;
  v_org    uuid;
  v_role   text;
  v_mask   boolean := coalesce(tg_argv[0], '') = 'mask';
  v_amal   text := lower(tg_op);
begin
  -- Qaysi yozuv
  v_id := coalesce(v_yangi ->> 'id', v_eski ->> 'id');

  -- Tenant: qatorning o'zida bo'lsa o'shani olamiz
  begin
    v_org := nullif(coalesce(v_yangi ->> 'org_id', v_eski ->> 'org_id'), '')::uuid;
  exception when others then
    v_org := null;
  end;

  select role into v_role from profiles where id = auth.uid();

  if v_mask then
    -- Faqat FAKT: qaysi ustunlar o'zgargani, qiymatsiz
    if tg_op = 'UPDATE' then
      for v_kalit in select jsonb_object_keys(v_yangi) loop
        if v_yangi -> v_kalit is distinct from v_eski -> v_kalit then
          v_diff := v_diff || jsonb_build_object(v_kalit, 'yopiq');
        end if;
      end loop;
    else
      v_diff := jsonb_build_object('qiymatlar', 'yopiq');
    end if;
  elsif tg_op = 'UPDATE' then
    for v_kalit in select jsonb_object_keys(v_yangi) loop
      if v_yangi -> v_kalit is distinct from v_eski -> v_kalit then
        v_diff := v_diff || jsonb_build_object(
          v_kalit, jsonb_build_object('eski', v_eski -> v_kalit, 'yangi', v_yangi -> v_kalit)
        );
      end if;
    end loop;
    -- Faqat updated_at o'zgargan bo'lsa — bu haqiqiy o'zgarish emas
    if v_diff - 'updated_at' = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'INSERT' then
    v_diff := v_yangi;
  else
    v_diff := v_eski;
  end if;

  insert into audit_log (actor_id, actor_role, org_id, entity, entity_id, action, diff)
  values (auth.uid(), v_role, v_org, tg_table_name, v_id, v_amal, v_diff);

  return null;   -- AFTER trigger
exception when others then
  -- Jurnal yozilmasa ham ASOSIY AMAL bajarilishi kerak: nazorat tizimi
  -- biznesni to'xtatib qo'ymasin
  return null;
end $$;

revoke all on function public.audit_trigger() from public, anon, authenticated;

-- ---------- Triggerlarni ulash ----------
do $$
declare
  r record;
begin
  -- Qiymatlari bilan yoziladigan jadvallar
  for r in
    select unnest(array[
      'products', 'product_variants', 'prices', 'price_groups', 'categories',
      'customers', 'managers', 'profiles', 'organizations',
      'orders', 'order_items'
    ]) as t
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || r.t, r.t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.audit_trigger()',
      'audit_' || r.t, r.t
    );
  end loop;

  -- Menejer narxlari: faqat fakt, qiymatsiz
  for r in
    select unnest(array['manager_prices', 'manager_customer_prices']) as t
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || r.t, r.t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.audit_trigger(''mask'')',
      'audit_' || r.t, r.t
    );
  end loop;

  -- Pul va ombor daftarlari o'zi tarix: faqat O'ZGARTIRISH/O'CHIRISH
  -- yoziladi (bu ikkisi bo'lmasligi kerak — bo'lsa, darhol ko'rinsin)
  for r in
    select unnest(array['ledger_entries', 'payments', 'stock_movements']) as t
  loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || r.t, r.t);
    execute format(
      'create trigger %I after update or delete on public.%I
       for each row execute function public.audit_trigger()',
      'audit_' || r.t, r.t
    );
  end loop;
end $$;

-- ---------- Konsol uchun o'qish ----------
create or replace function public.audit_feed(
  p_org    uuid default null,
  p_entity text default null,
  p_actor  uuid default null,
  p_days   int  default 7,
  p_limit  int  default 100
)
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

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_res
  from (
    select a.id, a.at, a.entity, a.entity_id, a.action, a.diff,
           a.actor_role, a.org_id,
           coalesce(p.full_name, '—') as actor_name,
           o.name                     as org_name
    from audit_log a
    left join profiles p      on p.id = a.actor_id
    left join organizations o on o.id = a.org_id
    where a.at > now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
      and (p_org    is null or a.org_id   = p_org)
      and (p_entity is null or a.entity   = p_entity)
      and (p_actor  is null or a.actor_id = p_actor)
    order by a.at desc
    limit least(coalesce(p_limit, 100), 500)
  ) t;

  return v_res;
end $$;

revoke all on function public.audit_feed(uuid, text, uuid, int, int) from public, anon;
grant execute on function public.audit_feed(uuid, text, uuid, int, int) to authenticated;

-- Kunlik yig'ma: "kim eng ko'p o'zgartiryapti", "qaysi jadval qaynayapti"
create or replace function public.audit_summary(p_days int default 7)
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
    'jami', (select count(*) from audit_log where at > now() - make_interval(days => p_days)),
    'jadval_boyicha', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select entity, count(*) as n
        from audit_log where at > now() - make_interval(days => p_days)
        group by entity order by count(*) desc limit 15
      ) t
    ),
    'xodim_boyicha', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(p.full_name, '—') as actor_name, a.actor_role, count(*) as n
        from audit_log a left join profiles p on p.id = a.actor_id
        where a.at > now() - make_interval(days => p_days)
        group by 1, 2 order by count(*) desc limit 15
      ) t
    ),
    'tenant_boyicha', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select coalesce(o.name, '—') as org_name, count(*) as n
        from audit_log a left join organizations o on o.id = a.org_id
        where a.at > now() - make_interval(days => p_days)
        group by 1 order by count(*) desc limit 15
      ) t
    )
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.audit_summary(int) from public, anon;
grant execute on function public.audit_summary(int) to authenticated;
