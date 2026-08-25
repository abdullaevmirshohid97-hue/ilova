-- =============================================================
--  SKLADLAR — 3-bosqich: panel uchun RPC'lar
--
--  Super admin skladni qo'shadi, ustama/chegirmasini belgilaydi va
--  har skladga yuklangan praysni ro'yxat shaklida ko'radi.
--
--  Hammasi SECURITY DEFINER + is_super_admin() tekshiruvi bilan:
--  jadvallarga to'g'ridan-to'g'ri yozish yo'li ochiq qolmasin.
-- =============================================================

-- ---------- 1. Sklad qo'shish/tahrirlash ----------
create or replace function public.dori_sklad_saqla(
  p_id           uuid    default null,
  p_name         text    default null,
  p_code         text    default null,
  p_phone        text    default null,
  p_address      text    default null,
  p_contact_name text    default null,
  p_note         text    default null,
  p_markup_pct   numeric default null,
  p_markup_sum   numeric default null,
  p_discount_pct numeric default null,
  p_discount_sum numeric default null,
  p_priority     int     default null,
  p_is_active    boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_narx int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null and p_id is null then
    raise exception 'NOM_KERAK';
  end if;

  if p_id is null then
    insert into dori_warehouses (name, code, phone, address, contact_name, note,
                                 markup_pct, markup_sum, discount_pct, discount_sum,
                                 priority, is_active, created_by)
    values (trim(p_name), nullif(trim(coalesce(p_code, '')), ''),
            nullif(trim(coalesce(p_phone, '')), ''),
            nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_contact_name, '')), ''),
            nullif(trim(coalesce(p_note, '')), ''),
            p_markup_pct, p_markup_sum, p_discount_pct, p_discount_sum,
            coalesce(p_priority, 100), coalesce(p_is_active, true), auth.uid())
    returning id into v_id;
  else
    update dori_warehouses
       set name         = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
           code         = nullif(trim(coalesce(p_code, '')), ''),
           phone        = nullif(trim(coalesce(p_phone, '')), ''),
           address      = nullif(trim(coalesce(p_address, '')), ''),
           contact_name = nullif(trim(coalesce(p_contact_name, '')), ''),
           note         = nullif(trim(coalesce(p_note, '')), ''),
           -- Ustama/chegirma ATAYLAB coalesce'siz: bo'sh qoldirish
           -- "qoidani olib tashla" degani, "eskisi qolsin" degani emas
           markup_pct   = p_markup_pct,
           markup_sum   = p_markup_sum,
           discount_pct = p_discount_pct,
           discount_sum = p_discount_sum,
           priority     = coalesce(p_priority, priority),
           is_active    = coalesce(p_is_active, is_active),
           updated_at   = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'SKLAD_TOPILMADI';
    end if;
  end if;

  -- Ustama o'zgargani zahoti narxlar qayta hisoblanadi: aks holda panel
  -- bir narxni, mijoz boshqasini ko'rib turardi
  v_narx := dori_offer_narx(v_id, null);
  perform dori_katalog_yigish(null);

  return jsonb_build_object('ok', true, 'id', v_id, 'narx_yangilandi', v_narx);
end $$;

revoke all on function public.dori_sklad_saqla(uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, int, boolean) from public, anon;
grant execute on function public.dori_sklad_saqla(uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, int, boolean) to authenticated;

-- ---------- 2. Skladlar ro'yxati ----------
create or replace function public.dori_skladlar()
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

  select coalesce(jsonb_agg(t order by t.priority, t.name), '[]'::jsonb) into v
  from (
    select w.id, w.name, w.code, w.phone, w.address, w.contact_name, w.note,
           w.markup_pct, w.markup_sum, w.discount_pct, w.discount_sum,
           w.priority, w.is_default, w.is_active,
           (select count(*) from dori_offers o where o.warehouse_id = w.id) as pozitsiya,
           (select count(*) from dori_offers o
             where o.warehouse_id = w.id and coalesce(o.stock, 0) > 0) as qoldiqli,
           -- Ombor qiymati TANNARXDA: bu ichki ko'rsatkich, sotuv
           -- narxida hisoblasak o'zimizni chalg'itamiz
           (select coalesce(sum(coalesce(o.base_price, 0) * coalesce(o.stock, 0)), 0)
              from dori_offers o where o.warehouse_id = w.id) as qiymat,
           (select max(i.created_at) from dori_imports i
             where i.warehouse_id = w.id and i.status = 'done') as oxirgi_yuklash
    from dori_warehouses w
  ) t;

  return v;
end $$;

revoke all on function public.dori_skladlar() from public, anon;
grant execute on function public.dori_skladlar() to authenticated;

-- ---------- 3. Skladning prays ro'yxati ----------
create or replace function public.dori_sklad_narxlar(
  p_warehouse_id uuid,
  p_q            text default null,
  p_offset       int  default 0,
  p_limit        int  default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int := least(coalesce(p_limit, 50), 200);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v     jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
    'jami', (
      select count(*) from dori_offers o join dori_products p on p.id = o.product_id
      where o.warehouse_id = p_warehouse_id
        and (v_q is null or p.name ilike '%' || v_q || '%'
                         or p.name_norm like '%' || dori_norm(v_q) || '%'
                         or coalesce(p.manufacturer, '') ilike '%' || v_q || '%')
    ),
    'items', coalesce((
      select jsonb_agg(t) from (
        select p.id, p.name, p.manufacturer, p.grp, p.unit,
               o.base_price, o.price, o.stock, o.updated_at,
               (select min(b.expiry) from dori_batches b
                 where b.warehouse_id = o.warehouse_id and b.product_id = p.id
                   and b.expiry >= current_date) as eng_yaqin_muddat,
               (select string_agg(distinct b.series, ', ') from dori_batches b
                 where b.warehouse_id = o.warehouse_id and b.product_id = p.id
                   and b.series is not null) as seriyalar
        from dori_offers o
        join dori_products p on p.id = o.product_id
        where o.warehouse_id = p_warehouse_id
          and (v_q is null or p.name ilike '%' || v_q || '%'
                           or p.name_norm like '%' || dori_norm(v_q) || '%'
                           or coalesce(p.manufacturer, '') ilike '%' || v_q || '%')
        order by p.name
        offset v_off limit v_lim
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

revoke all on function public.dori_sklad_narxlar(uuid, text, int, int) from public, anon;
grant execute on function public.dori_sklad_narxlar(uuid, text, int, int) to authenticated;

-- ---------- 4. Yuklash tarixi ----------
create or replace function public.dori_import_tarix(
  p_warehouse_id uuid default null,
  p_limit        int  default 20
)
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
    select i.id, i.warehouse_id, w.name as sklad, i.file_name, i.rows_total,
           i.status, i.natija, i.created_at, i.finished_at
    from dori_imports i
    left join dori_warehouses w on w.id = i.warehouse_id
    where p_warehouse_id is null or i.warehouse_id = p_warehouse_id
    order by i.created_at desc
    limit least(coalesce(p_limit, 20), 100)
  ) t;

  return v;
end $$;

revoke all on function public.dori_import_tarix(uuid, int) from public, anon;
grant execute on function public.dori_import_tarix(uuid, int) to authenticated;

-- ---------- 5. Skladni o'chirish ----------
-- Asosiy sklad va buyurtmaga bog'langan sklad o'chirilmaydi: buyurtma
-- tarixi "qaysi skladdan kelgan" degan javobsiz qolmasin.
create or replace function public.dori_sklad_ochir(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def boolean;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select is_default into v_def from dori_warehouses where id = p_id;
  if v_def is null then
    raise exception 'SKLAD_TOPILMADI';
  end if;
  if v_def then
    raise exception 'ASOSIY_SKLAD_OCHIRILMAYDI';
  end if;

  delete from dori_warehouses where id = p_id;
  perform dori_katalog_yigish(null);

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.dori_sklad_ochir(uuid) from public, anon;
grant execute on function public.dori_sklad_ochir(uuid) to authenticated;
