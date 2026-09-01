-- =============================================================
--  KATALOGNI SKLAD BO'YICHA KO'RISH
--
--  DORI moduli endi yuklash joyi emas - u KO'RISH joyi. Prays
--  skladning ichida yuklanadi (sklad allaqachon tanlangan bo'ladi,
--  ya'ni "qaysi skladga" degan xato umuman yuz bermaydi).
--
--  Bu funksiya bitta sklad yoki HAMMA sklad bo'yicha ro'yxat beradi.
--  Hamma sklad tanlanganda dori har skladda alohida qator bo'lib
--  chiqadi: bir xil dori ikki skladda boshqa narxda turishi mumkin va
--  aynan shuni ko'rish kerak.
-- =============================================================

create or replace function public.dori_katalog_royxat(
  p_warehouse_id uuid default null,
  p_q            text default null,
  p_offset       int  default 0,
  p_limit        int  default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lim int := least(coalesce(p_limit, 100), 300);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_q   text := nullif(trim(coalesce(p_q, '')), '');
  v_lat text := case when nullif(trim(coalesce(p_q, '')), '') is null
                     then null else dori_lat(p_q) end;
  v     jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select jsonb_build_object(
    'jami', (
      select count(*)
      from dori_offers o
      join dori_products p on p.id = o.product_id
      where (p_warehouse_id is null or o.warehouse_id = p_warehouse_id)
        and (v_q is null
             or p.name ilike '%' || v_q || '%'
             or dori_lat(p.name) like '%' || v_lat || '%'
             or coalesce(p.manufacturer, '') ilike '%' || v_q || '%')
    ),
    'items', coalesce((
      select jsonb_agg(t) from (
        select p.id, p.name, p.manufacturer, p.grp, p.unit,
               w.name as sklad, w.id as warehouse_id,
               o.base_price, o.price, o.stock, o.updated_at,
               (select min(b.expiry) from dori_batches b
                 where b.warehouse_id = o.warehouse_id and b.product_id = p.id
                   and b.expiry >= current_date) as muddat,
               (select string_agg(distinct b.series, ', ') from dori_batches b
                 where b.warehouse_id = o.warehouse_id and b.product_id = p.id
                   and b.series is not null) as seriya
        from dori_offers o
        join dori_products p on p.id = o.product_id
        join dori_warehouses w on w.id = o.warehouse_id
        where (p_warehouse_id is null or o.warehouse_id = p_warehouse_id)
          and (v_q is null
               or p.name ilike '%' || v_q || '%'
               or dori_lat(p.name) like '%' || v_lat || '%'
               or coalesce(p.manufacturer, '') ilike '%' || v_q || '%')
        order by p.name, w.name
        offset v_off limit v_lim
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

revoke all on function public.dori_katalog_royxat(uuid, text, int, int) from public, anon;
grant execute on function public.dori_katalog_royxat(uuid, text, int, int) to authenticated;
