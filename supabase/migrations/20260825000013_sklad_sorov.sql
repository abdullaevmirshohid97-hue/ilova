-- =============================================================
--  SKLADGA SO'ROV: YUBORISH VA JAVOB
--
--  Taqsimot tayyor bo'lgach, har sklad o'z so'rovini Telegramda oladi
--  va shu yerda javob beradi.
--
--  MUHIM: sklad FAQAT o'ziga tegishli so'rovni ko'radi. Har chaqiruvda
--  chat_id -> sklad bog'lanishi qayta tekshiriladi, ya'ni split_id ni
--  qo'lda o'zgartirib boshqa skladning so'rovini ochib bo'lmaydi.
--
--  SKLAD MIJOZ NARXINI KO'RMAYDI: so'rovda faqat tannarx (base_price)
--  chiqadi. Bizning ustamamiz - bizning ishimiz.
-- =============================================================

-- ---------- 1. Yuborish uchun ma'lumot ----------
-- Edge funksiya shu ro'yxatni oladi va har chatga xabar yuboradi.
create or replace function public.dori_split_yuborilsin(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select coalesce(jsonb_agg(t order by t.sklad), '[]'::jsonb) into v
  from (
    select s.id as split_id, s.warehouse_id, w.name as sklad, s.status,
           s.base_total,
           o.order_no, o.name as mijoz, o.phone, o.pharmacy, o.comment,
           coalesce((
             select jsonb_agg(chat_id::text order by chat_id)
             from dori_warehouse_telegram tg
             where tg.warehouse_id = s.warehouse_id and tg.is_active
           ), '[]'::jsonb) as chatlar,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name, 'qty', i.qty,
                      'base_price', i.base_price, 'base_sum', i.base_sum
                    ) order by i.name)
             from dori_split_items i where i.split_id = s.id
           ), '[]'::jsonb) as pozitsiyalar
    from dori_order_splits s
    join dori_orders o on o.id = s.order_id
    left join dori_warehouses w on w.id = s.warehouse_id
    where s.order_id = p_order_id
      and s.status in ('new', 'sent')
  ) t;

  return v;
end $$;

revoke all on function public.dori_split_yuborilsin(uuid) from public, anon, authenticated;
grant execute on function public.dori_split_yuborilsin(uuid) to service_role;

-- ---------- 2. Yuborildi deb belgilash ----------
create or replace function public.dori_split_holat_srv(p_split_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update dori_order_splits
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         updated_at = now()
   where id = p_split_id;
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.dori_split_holat_srv(uuid, text) from public, anon, authenticated;
grant execute on function public.dori_split_holat_srv(uuid, text) to service_role;

-- ---------- 3. Skladning o'z so'rovlari ----------
create or replace function public.dori_sklad_sorovlar(p_chat_id bigint, p_limit int default 10)
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
  from dori_warehouse_telegram
  where chat_id = p_chat_id and is_active;

  if v_wh is null then
    return jsonb_build_object('ok', false, 'error', 'ULANMAGAN');
  end if;

  select jsonb_build_object('ok', true, 'sorovlar', coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb))
    into v
  from (
    select s.id, s.status, s.base_total, s.created_at, s.sent_at,
           o.order_no, o.pharmacy,
           (select count(*) from dori_split_items i where i.split_id = s.id) as pozitsiya
    from dori_order_splits s
    join dori_orders o on o.id = s.order_id
    where s.warehouse_id = v_wh
      and s.status <> 'cancelled'
    order by s.created_at desc
    limit least(coalesce(p_limit, 10), 50)
  ) t;

  return v;
end $$;

revoke all on function public.dori_sklad_sorovlar(bigint, int) from public, anon, authenticated;
grant execute on function public.dori_sklad_sorovlar(bigint, int) to service_role;

-- ---------- 4. Bitta so'rov tafsiloti ----------
create or replace function public.dori_sklad_sorov(p_chat_id bigint, p_split_id uuid)
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
  from dori_warehouse_telegram
  where chat_id = p_chat_id and is_active;

  if v_wh is null then
    return jsonb_build_object('ok', false, 'error', 'ULANMAGAN');
  end if;

  -- Sklad boshqa skladning so'rovini ochmasin
  select jsonb_build_object(
           'ok', true,
           'split_id', s.id,
           'status', s.status,
           'order_no', o.order_no,
           'pharmacy', o.pharmacy,
           'comment', o.comment,
           'base_total', s.base_total,
           'created_at', s.created_at,
           'pozitsiyalar', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name, 'qty', i.qty,
                      'base_price', i.base_price, 'base_sum', i.base_sum
                    ) order by i.name)
             from dori_split_items i where i.split_id = s.id
           ), '[]'::jsonb)
         ) into v
  from dori_order_splits s
  join dori_orders o on o.id = s.order_id
  where s.id = p_split_id and s.warehouse_id = v_wh;

  if v is null then
    return jsonb_build_object('ok', false, 'error', 'TOPILMADI');
  end if;
  return v;
end $$;

revoke all on function public.dori_sklad_sorov(bigint, uuid) from public, anon, authenticated;
grant execute on function public.dori_sklad_sorov(bigint, uuid) to service_role;

-- ---------- 5. Sklad javobi ----------
create or replace function public.dori_split_javob(
  p_chat_id  bigint,
  p_split_id uuid,
  p_status   text,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
begin
  if p_status not in ('accepted', 'rejected', 'done') then
    return jsonb_build_object('ok', false, 'error', 'HOLAT_NOTOGRI');
  end if;

  select warehouse_id into v_wh
  from dori_warehouse_telegram
  where chat_id = p_chat_id and is_active;

  if v_wh is null then
    return jsonb_build_object('ok', false, 'error', 'ULANMAGAN');
  end if;

  update dori_order_splits
     set status = p_status,
         note   = coalesce(nullif(trim(coalesce(p_note, '')), ''), note),
         updated_at = now()
   where id = p_split_id and warehouse_id = v_wh;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'TOPILMADI');
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_no', (select o.order_no from dori_order_splits s
                  join dori_orders o on o.id = s.order_id where s.id = p_split_id)
  );
end $$;

revoke all on function public.dori_split_javob(bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.dori_split_javob(bigint, uuid, text, text) to service_role;
