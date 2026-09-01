-- =============================================================
--  MIJOZLARGA PUSH XABAR + BUYURTMA POZITSIYASINING ID'si
--
--  1) Panel buyurtma pozitsiyasini tahrirlashi uchun uning id'si kerak
--     edi - dori_buyurtmalar uni qaytarmasdi.
--
--  2) Yangilik xabari: super admin mijozlarni tanlaydi (bittalab yoki
--     hammasini) va Telegram bot orqali xabar yuboradi.
--
--  XABAR TARIXI SAQLANADI: kimga ketdi, kimga yetmadi. Bu shunchaki
--  hisobot emas - Telegram foydalanuvchi botni bloklaganini aynan
--  yuborish paytida aytadi, boshqa yo'l bilan bilib bo'lmaydi.
-- =============================================================

-- ---------- 1. Pozitsiya id'si ----------
create or replace function public.dori_buyurtmalar(p_limit int default 30, p_status text default null)
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
    select o.id, o.order_no, o.name, o.phone, o.pharmacy, o.status,
           o.total, o.comment, o.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'item_id', i.id,
                      'name', i.name, 'qty', i.qty, 'price', i.price,
                      'sum', i.sum, 'yetishmadi', i.yetishmadi) order by i.name)
             from dori_order_items i where i.order_id = o.id), '[]'::jsonb) as pozitsiyalar,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'split_id', s.id, 'sklad', w.name, 'status', s.status,
                      'base_total', s.base_total, 'sell_total', s.sell_total,
                      'sent_at', s.sent_at, 'faktura_no', s.faktura_no, 'qabul_at', s.qabul_at,
                      'ulangan', exists (select 1 from dori_warehouse_telegram tg
                                          where tg.warehouse_id = s.warehouse_id and tg.is_active),
                      'pozitsiyalar', coalesce((
                        select jsonb_agg(jsonb_build_object('name', si.name, 'qty', si.qty) order by si.name)
                        from dori_split_items si where si.split_id = s.id), '[]'::jsonb)
                    ) order by w.name)
             from dori_order_splits s
             left join dori_warehouses w on w.id = s.warehouse_id
             where s.order_id = o.id), '[]'::jsonb) as taqsimot
    from dori_orders o
    where p_status is null or o.status = p_status
    order by o.created_at desc
    limit least(coalesce(p_limit, 30), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_buyurtmalar(int, text) from public, anon;
grant execute on function public.dori_buyurtmalar(int, text) to authenticated;

-- ---------- 2. Xabar tarixi ----------
create table if not exists public.dori_broadcasts (
  id         uuid primary key default gen_random_uuid(),
  matn       text not null,
  jami       int not null default 0,
  yuborildi  int not null default 0,
  xato       int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists dori_broadcasts_at_idx on public.dori_broadcasts (created_at desc);

alter table public.dori_broadcasts enable row level security;

drop policy if exists "dori_broadcasts: super_admin" on public.dori_broadcasts;
create policy "dori_broadcasts: super_admin"
  on public.dori_broadcasts for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create table if not exists public.dori_broadcast_targets (
  id           bigserial primary key,
  broadcast_id uuid not null references public.dori_broadcasts(id) on delete cascade,
  customer_id  uuid references public.dori_customers(id) on delete set null,
  chat_id      bigint,
  holat        text not null default 'kutmoqda' check (holat in ('kutmoqda', 'yuborildi', 'xato')),
  sabab        text
);

create index if not exists dori_bt_idx on public.dori_broadcast_targets (broadcast_id, holat);

alter table public.dori_broadcast_targets enable row level security;

drop policy if exists "dori_bt: super_admin" on public.dori_broadcast_targets;
create policy "dori_bt: super_admin"
  on public.dori_broadcast_targets for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ---------- 3. Kimga yuborish mumkin ----------
-- Faqat botga ulangan mijozga xabar boradi: chat_id bo'lmasa Telegram
-- uni topa olmaydi. Shuning uchun ro'yxatda buni ochiq ko'rsatamiz.
create or replace function public.dori_push_mijozlar(p_q text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v   jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select coalesce(jsonb_agg(t order by t.ulangan desc, t.nom), '[]'::jsonb) into v
  from (
    select c.id,
           coalesce(nullif(trim(coalesce(c.pharmacy, '')), ''), c.name, c.phone) as nom,
           c.phone, c.chat_id is not null as ulangan, c.is_blocked
    from dori_customers c
    where (v_q is null
           or c.name ilike '%' || v_q || '%'
           or c.pharmacy ilike '%' || v_q || '%'
           or c.phone_norm like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%')
  ) t;

  return v;
end $$;

revoke all on function public.dori_push_mijozlar(text) from public, anon;
grant execute on function public.dori_push_mijozlar(text) to authenticated;

-- ---------- 4. Yuborishni tayyorlash ----------
-- Edge funksiya shu ro'yxatni oladi va Telegramga yozadi. Nishonlar
-- OLDINDAN yoziladi: yuborish yarim yo'lda uzilsa ham kimga ketgani
-- va kimga yetmagani ma'lum bo'lib qoladi.
create or replace function public.dori_push_tayyorla(
  p_matn    text,
  p_ids     uuid[] default null,   -- null = hammasi
  p_faqat_ulangan boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_jami int;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if nullif(trim(coalesce(p_matn, '')), '') is null then
    raise exception 'MATN_BOSH';
  end if;

  insert into dori_broadcasts (matn, created_by)
  values (trim(p_matn), auth.uid())
  returning id into v_id;

  insert into dori_broadcast_targets (broadcast_id, customer_id, chat_id)
  select v_id, c.id, c.chat_id
  from dori_customers c
  where (p_ids is null or c.id = any (p_ids))
    and not c.is_blocked
    and (not p_faqat_ulangan or c.chat_id is not null);

  select count(*) into v_jami from dori_broadcast_targets where broadcast_id = v_id;
  update dori_broadcasts set jami = v_jami where id = v_id;

  if v_jami = 0 then
    delete from dori_broadcasts where id = v_id;
    raise exception 'MIJOZ_YOQ';
  end if;

  return jsonb_build_object('ok', true, 'broadcast_id', v_id, 'jami', v_jami);
end $$;

revoke all on function public.dori_push_tayyorla(text, uuid[], boolean) from public, anon;
grant execute on function public.dori_push_tayyorla(text, uuid[], boolean) to authenticated;

-- ---------- 5. Edge funksiya uchun ----------
create or replace function public.dori_push_nishonlar(p_broadcast_id uuid, p_limit int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (
    select jsonb_build_object(
      'matn', (select matn from dori_broadcasts where id = p_broadcast_id),
      'nishonlar', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'chat_id', t.chat_id::text))
        from (
          select id, chat_id from dori_broadcast_targets
          where broadcast_id = p_broadcast_id and holat = 'kutmoqda' and chat_id is not null
          order by id limit least(coalesce(p_limit, 200), 500)
        ) t
      ), '[]'::jsonb)
    )
  );
end $$;

revoke all on function public.dori_push_nishonlar(uuid, int) from public, anon, authenticated;
grant execute on function public.dori_push_nishonlar(uuid, int) to service_role;

create or replace function public.dori_push_belgila(
  p_target_id bigint,
  p_holat     text,
  p_sabab     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update dori_broadcast_targets
     set holat = p_holat, sabab = p_sabab
   where id = p_target_id;

  update dori_broadcasts b
     set yuborildi = (select count(*) from dori_broadcast_targets t
                       where t.broadcast_id = b.id and t.holat = 'yuborildi'),
         xato      = (select count(*) from dori_broadcast_targets t
                       where t.broadcast_id = b.id and t.holat = 'xato')
   where b.id = (select broadcast_id from dori_broadcast_targets where id = p_target_id);
end $$;

revoke all on function public.dori_push_belgila(bigint, text, text) from public, anon, authenticated;
grant execute on function public.dori_push_belgila(bigint, text, text) to service_role;

-- ---------- 6. Tarix ----------
create or replace function public.dori_push_tarix(p_limit int default 20)
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
    select b.id, b.matn, b.jami, b.yuborildi, b.xato, b.created_at
    from dori_broadcasts b
    order by b.created_at desc
    limit least(coalesce(p_limit, 20), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_push_tarix(int) from public, anon;
grant execute on function public.dori_push_tarix(int) to authenticated;
