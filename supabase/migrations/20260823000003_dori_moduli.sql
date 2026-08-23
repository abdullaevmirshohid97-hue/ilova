-- =============================================================
--  DORI MODULI — faktura roboti
--
--  Vazifa: har xil postavshchikdan kelgan, har xil ko'rinishdagi Excel
--  fakturani robot o'qib, standart qatorlarga aylantirsin. Shablon
--  QOTIB QOLGAN emas — robot ustunlarni o'zi topadi, foydalanuvchi
--  tuzatsa esa o'sha moslashtirishni ESLAB QOLADI va keyingi safar
--  o'sha ko'rinishdagi fayl darhol to'g'ri o'qiladi.
--
--  "1:1" sharti: robot tanimagan ustun ham YO'QOLMAYDI — u `qoshimcha`
--  (jsonb) ichiga tushadi. Ya'ni faylda bor har bir katak bazada ham
--  bo'ladi, shunchaki nomi standartlashtirilmagan bo'ladi.
--
--  Kim ishlatadi: hozircha faqat super admin (bu platforma egasining
--  ish quroli). Kerak bo'lsa keyin tenant adminlariga ochiladi.
-- =============================================================

-- ---------- 1. Faktura sarlavhasi ----------
create table if not exists public.dori_invoices (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null,
  file_name       text not null,
  supplier        text,
  invoice_no      text,
  invoice_date    date,
  currency        text not null default 'UZS',
  rows_count      int  not null default 0,
  -- Fayldagi "Jami" va robot hisoblagan jami: ikkalasi saqlanadi, chunki
  -- ular farq qilsa — bu fayl noto'g'ri o'qilganining eng aniq belgisi
  total_declared  numeric(16,2),
  total_computed  numeric(16,2),
  status          text not null default 'draft' check (status in ('draft', 'saved')),
  meta            jsonb not null default '{}'::jsonb
);

create index if not exists dori_invoices_at_idx on public.dori_invoices (created_at desc);

alter table public.dori_invoices enable row level security;

drop policy if exists "dori_invoices: super_admin" on public.dori_invoices;
create policy "dori_invoices: super_admin"
  on public.dori_invoices for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 2. Qatorlar ----------
create table if not exists public.dori_invoice_items (
  id           bigserial primary key,
  invoice_id   uuid not null references public.dori_invoices(id) on delete cascade,
  line_no      int  not null,
  name         text,
  manufacturer text,
  series       text,
  expiry       date,
  qty          numeric(16,3),
  unit         text,
  price        numeric(16,4),
  sum          numeric(16,2),
  nds_rate     numeric(6,2),
  nds_sum      numeric(16,2),
  -- Robot tanimagan ustunlar shu yerda: {ustun nomi: qiymat}
  qoshimcha    jsonb not null default '{}'::jsonb,
  -- Tekshiruvda chiqqan ogohlantirishlar: ['summa mos emas', ...]
  ogohlar      text[] not null default '{}'
);

create index if not exists dori_items_invoice_idx on public.dori_invoice_items (invoice_id, line_no);

alter table public.dori_invoice_items enable row level security;

drop policy if exists "dori_items: super_admin" on public.dori_invoice_items;
create policy "dori_items: super_admin"
  on public.dori_invoice_items for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 3. O'rganilgan shablonlar ----------
-- Robot ustunlarni topgach yoki foydalanuvchi tuzatgach, shu moslashtirish
-- saqlanadi. Kalit — sarlavha qatoridagi ustun nomlaridan yasalgan imzo.
create table if not exists public.dori_templates (
  id           uuid primary key default gen_random_uuid(),
  signature    text not null unique,
  supplier     text,
  mapping      jsonb not null,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  used_count   int not null default 1,
  last_used_at timestamptz not null default now()
);

alter table public.dori_templates enable row level security;

drop policy if exists "dori_templates: super_admin" on public.dori_templates;
create policy "dori_templates: super_admin"
  on public.dori_templates for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 4. Shablonni eslab qolish ----------
create or replace function public.dori_template_save(
  p_signature text,
  p_mapping   jsonb,
  p_supplier  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  insert into dori_templates (signature, supplier, mapping, created_by)
  values (p_signature, p_supplier, p_mapping, auth.uid())
  on conflict (signature) do update
    set mapping      = excluded.mapping,
        supplier     = coalesce(excluded.supplier, dori_templates.supplier),
        used_count   = dori_templates.used_count + 1,
        last_used_at = now();
end $$;

revoke all on function public.dori_template_save(text, jsonb, text) from public, anon;
grant execute on function public.dori_template_save(text, jsonb, text) to authenticated;

-- ---------- 5. Fakturani qatorlari bilan saqlash ----------
-- Bitta chaqiruvda: sarlavha + barcha qatorlar. Yarim saqlanib qolgan
-- faktura bo'lmasin uchun hammasi bitta tranzaksiyada.
create or replace function public.dori_invoice_save(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
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

  insert into dori_invoices (
    created_by, file_name, supplier, invoice_no, invoice_date, currency,
    rows_count, total_declared, total_computed, status, meta
  )
  values (
    auth.uid(),
    coalesce(p_invoice ->> 'file_name', 'nomsiz.xlsx'),
    nullif(p_invoice ->> 'supplier', ''),
    nullif(p_invoice ->> 'invoice_no', ''),
    nullif(p_invoice ->> 'invoice_date', '')::date,
    coalesce(nullif(p_invoice ->> 'currency', ''), 'UZS'),
    coalesce(jsonb_array_length(p_items), 0),
    nullif(p_invoice ->> 'total_declared', '')::numeric,
    nullif(p_invoice ->> 'total_computed', '')::numeric,
    'saved',
    coalesce(p_invoice -> 'meta', '{}'::jsonb)
  )
  returning id into v_id;

  insert into dori_invoice_items (
    invoice_id, line_no, name, manufacturer, series, expiry,
    qty, unit, price, sum, nds_rate, nds_sum, qoshimcha, ogohlar
  )
  select
    v_id,
    coalesce((e ->> 'line_no')::int, row_number() over ()::int),
    nullif(e ->> 'name', ''),
    nullif(e ->> 'manufacturer', ''),
    nullif(e ->> 'series', ''),
    nullif(e ->> 'expiry', '')::date,
    nullif(e ->> 'qty', '')::numeric,
    nullif(e ->> 'unit', ''),
    nullif(e ->> 'price', '')::numeric,
    nullif(e ->> 'sum', '')::numeric,
    nullif(e ->> 'nds_rate', '')::numeric,
    nullif(e ->> 'nds_sum', '')::numeric,
    coalesce(e -> 'qoshimcha', '{}'::jsonb),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(e -> 'ogohlar', '[]'::jsonb)) x),
      '{}'::text[]
    )
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;

  return v_id;
end $$;

revoke all on function public.dori_invoice_save(jsonb, jsonb) from public, anon;
grant execute on function public.dori_invoice_save(jsonb, jsonb) to authenticated;

-- ---------- 6. Saqlangan fakturalar ro'yxati ----------
create or replace function public.dori_invoice_list(p_limit int default 50)
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
    select i.id, i.created_at, i.file_name, i.supplier, i.invoice_no, i.invoice_date,
           i.currency, i.rows_count, i.total_declared, i.total_computed,
           (i.total_declared is not null
            and abs(i.total_declared - coalesce(i.total_computed, 0)) > 1) as jami_mos_emas
    from dori_invoices i
    order by i.created_at desc
    limit least(coalesce(p_limit, 50), 200)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_invoice_list(int) from public, anon;
grant execute on function public.dori_invoice_list(int) to authenticated;
