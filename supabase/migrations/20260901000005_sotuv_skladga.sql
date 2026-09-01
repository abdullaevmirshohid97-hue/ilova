-- =============================================================
--  SOTUV SKLADGA BORADI: TERISH UCHUN FAKTURA
--
--  Bot buyurtmasi skladlarga taqsimlanib, har biriga Telegramda so'rov
--  ketardi. SOTUV esa hech qayerga ketmasdi - operator sotardi, omborchi
--  esa nima terish kerakligini bilmasdi.
--
--  Sotuvda sklad ALLAQACHON tanlangan, ya'ni taqsimlash kerak emas:
--  so'rov to'g'ridan-to'g'ri o'sha skladning Telegramiga ketadi.
--
--  Omborchiga NARX EMAS, TERISH ma'lumoti kerak: nom, ishlab
--  chiqaruvchi, seriya, muddat va dona. Tannarx qo'shiladi (u skladning
--  o'z narxi), mijoz narxi esa yo'q.
-- =============================================================

alter table public.dori_sales
  add column if not exists yigildi_at   timestamptz,
  add column if not exists yigildi_chat bigint,
  add column if not exists yuborildi_at timestamptz;

-- ---------- 1. Yuborish uchun ma'lumot ----------
create or replace function public.dori_sotuv_yuborilsin(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'sale_id',   s.id,
    'sale_no',   s.sale_no,
    'sklad',     w.name,
    'mijoz',     coalesce(s.pharmacy, s.customer_name, '—'),
    'telefon',   s.customer_phone,
    'izoh',      s.comment,
    'base_total', s.base_total,
    'yigildi',   s.yigildi_at is not null,
    'chatlar', coalesce((
      select jsonb_agg(tg.chat_id::text order by tg.chat_id)
      from dori_warehouse_telegram tg
      where tg.warehouse_id = s.warehouse_id and tg.is_active
    ), '[]'::jsonb),
    'pozitsiyalar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', i.name,
               'manufacturer', i.manufacturer,
               'series', i.series,
               'expiry', i.expiry,
               'qty', i.qty,
               'base_price', i.base_price,
               'base_sum', i.base_sum
             ) order by i.name)
      from dori_sale_items i where i.sale_id = s.id
    ), '[]'::jsonb)
  ) into v
  from dori_sales s
  left join dori_warehouses w on w.id = s.warehouse_id
  where s.id = p_sale_id and s.status = 'done';

  return v;
end $$;

revoke all on function public.dori_sotuv_yuborilsin(uuid) from public, anon, authenticated;
grant execute on function public.dori_sotuv_yuborilsin(uuid) to service_role;

create or replace function public.dori_sotuv_yuborildi(p_sale_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.dori_sales set yuborildi_at = now() where id = p_sale_id;
$$;

revoke all on function public.dori_sotuv_yuborildi(uuid) from public, anon, authenticated;
grant execute on function public.dori_sotuv_yuborildi(uuid) to service_role;

-- ---------- 2. Omborchi "tayyor" deb belgilaydi ----------
-- Telegramdan bosiladi. Chat AYNAN shu sotuvning skladiga tegishlimi -
-- har chaqiruvda qayta tekshiriladi, aks holda boshqa sklad xodimi
-- begona sotuvni yopib qo'yishi mumkin edi.
create or replace function public.dori_sotuv_tayyor(p_chat_id bigint, p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wh uuid;
  v_no bigint;
begin
  select warehouse_id into v_wh
  from dori_warehouse_telegram
  where chat_id = p_chat_id and is_active;

  if v_wh is null then
    return jsonb_build_object('ok', false, 'error', 'ULANMAGAN');
  end if;

  update dori_sales
     set yigildi_at = now(), yigildi_chat = p_chat_id
   where id = p_sale_id and warehouse_id = v_wh
  returning sale_no into v_no;

  if v_no is null then
    return jsonb_build_object('ok', false, 'error', 'TOPILMADI');
  end if;

  return jsonb_build_object('ok', true, 'sale_no', v_no);
end $$;

revoke all on function public.dori_sotuv_tayyor(bigint, uuid) from public, anon, authenticated;
grant execute on function public.dori_sotuv_tayyor(bigint, uuid) to service_role;

-- ---------- 3. Bot: skladning sotuvlari ----------
create or replace function public.dori_sklad_sotuvlar(p_chat_id bigint, p_limit int default 10)
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

  select jsonb_build_object('ok', true, 'sotuvlar',
    coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb)) into v
  from (
    select s.id, s.sale_no, s.created_at, s.base_total,
           coalesce(s.pharmacy, s.customer_name, '—') as mijoz,
           s.yigildi_at is not null as yigildi,
           (select count(*) from dori_sale_items i where i.sale_id = s.id) as pozitsiya
    from dori_sales s
    where s.warehouse_id = v_wh and s.status = 'done'
    order by s.created_at desc
    limit least(coalesce(p_limit, 10), 50)
  ) t;

  return v;
end $$;

revoke all on function public.dori_sklad_sotuvlar(bigint, int) from public, anon, authenticated;
grant execute on function public.dori_sklad_sotuvlar(bigint, int) to service_role;

create or replace function public.dori_sklad_sotuv(p_chat_id bigint, p_sale_id uuid)
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

  select jsonb_build_object(
           'ok', true, 'sale_id', s.id, 'sale_no', s.sale_no,
           'mijoz', coalesce(s.pharmacy, s.customer_name, '—'),
           'izoh', s.comment, 'base_total', s.base_total,
           'yigildi', s.yigildi_at is not null,
           'pozitsiyalar', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name, 'manufacturer', i.manufacturer,
                      'series', i.series, 'expiry', i.expiry,
                      'qty', i.qty, 'base_price', i.base_price, 'base_sum', i.base_sum
                    ) order by i.name)
             from dori_sale_items i where i.sale_id = s.id
           ), '[]'::jsonb)
         ) into v
  from dori_sales s
  where s.id = p_sale_id and s.warehouse_id = v_wh;

  if v is null then
    return jsonb_build_object('ok', false, 'error', 'TOPILMADI');
  end if;
  return v;
end $$;

revoke all on function public.dori_sklad_sotuv(bigint, uuid) from public, anon, authenticated;
grant execute on function public.dori_sklad_sotuv(bigint, uuid) to service_role;

-- ---------- 4. Kabinet: sotuvlar ro'yxati ----------
create or replace function public.dori_kabinet_sotuvlar(p_limit int default 20)
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
    select s.id, s.sale_no, s.created_at, s.base_total,
           coalesce(s.pharmacy, s.customer_name, '—') as mijoz,
           s.comment, s.yigildi_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name, 'manufacturer', i.manufacturer,
                      'series', i.series, 'expiry', i.expiry,
                      'qty', i.qty, 'base_price', i.base_price, 'base_sum', i.base_sum
                    ) order by i.name)
             from dori_sale_items i where i.sale_id = s.id
           ), '[]'::jsonb) as pozitsiyalar
    from dori_sales s
    where s.warehouse_id = v_wh and s.status = 'done'
    order by s.created_at desc
    limit least(coalesce(p_limit, 20), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_kabinet_sotuvlar(int) from public, anon;
grant execute on function public.dori_kabinet_sotuvlar(int) to authenticated;

create or replace function public.dori_kabinet_sotuv_tayyor(p_sale_id uuid)
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

  update dori_sales
     set yigildi_at = now()
   where id = p_sale_id and warehouse_id = v_wh;

  if not found then
    raise exception 'SOTUV_TOPILMADI';
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_kabinet_sotuv_tayyor(uuid) from public, anon;
grant execute on function public.dori_kabinet_sotuv_tayyor(uuid) to authenticated;
