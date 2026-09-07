-- =============================================================
--  QIDIRUV NATIJASIDA PACHKA
--
--  Operator dorini tanlaganda pachkada nechta dona borligini KO'RISHI
--  kerak: «№90 · dona 28 947». Bilmasa donaga sotish tugmasi nima
--  qilishini tushunmaydi va noto'g'ri miqdor yozadi.
--
--  Ikkala funksiya ham bir xil ustun to'plamini qaytaradi — ekran
--  ularni bir xil ishlatadi.
-- =============================================================

create or replace function public.dori_sotuv_qidir(
  p_warehouse_id uuid,
  p_q            text,
  p_limit        int default 20
)
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
  if v_q is null then
    return '[]'::jsonb;
  end if;

  v_lat := dori_lat(v_q);

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.manufacturer, p.unit,
           o.price, o.base_price, o.stock,
           greatest(coalesce(p.pachka, 1), 1) as pachka,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.expiry >= current_date) as expiry,
           (select b.series from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.series is not null
             order by (b.expiry is null), b.expiry limit 1) as series
    from dori_offers o
    join dori_products p on p.id = o.product_id
    where o.warehouse_id = p_warehouse_id
      and o.price is not null and o.price > 0
      -- Kirill ham, lotin ham ishlaydi: mijoz botidagi bilan bir xil
      and (p.name ilike '%' || v_q || '%' or dori_lat(p.name) like '%' || v_lat || '%')
    limit least(coalesce(p_limit, 20), 50)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_sotuv_qidir(uuid, text, int) from public, anon;
grant execute on function public.dori_sotuv_qidir(uuid, text, int) to authenticated;


create or replace function public.dori_sotuv_narxlar(
  p_warehouse_id uuid,
  p_ids          uuid[]
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
  if p_warehouse_id is null or p_ids is null or array_length(p_ids, 1) is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) into v_res
  from (
    select p.id, p.name, p.manufacturer, p.unit,
           o.price, o.base_price, o.stock,
           greatest(coalesce(p.pachka, 1), 1) as pachka,
           (o.price is not null and o.price > 0) as bor,
           (select min(b.expiry) from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.expiry >= current_date) as expiry,
           (select b.series from dori_batches b
             where b.product_id = p.id and b.warehouse_id = p_warehouse_id
               and b.series is not null
             order by (b.expiry is null), b.expiry limit 1) as series
    from dori_products p
    left join dori_offers o
           on o.product_id = p.id and o.warehouse_id = p_warehouse_id
    where p.id = any(p_ids)
  ) t;

  return v_res;
end $$;

revoke all on function public.dori_sotuv_narxlar(uuid, uuid[]) from public, anon;
grant execute on function public.dori_sotuv_narxlar(uuid, uuid[]) to authenticated;


-- ---------- Pachkani qo'lda tuzatish ----------
-- Robot nomdan topadi, lekin nom har doim ham to'g'ri yozilmagan:
-- «Маска респиратор ASDA N95» dagi 95 — standart, dona soni emas.
-- Operator buni ko'rib turib tuzata olsin.
create or replace function public.dori_pachka_qoy(p_product_id uuid, p_pachka int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_pachka is null or p_pachka < 1 or p_pachka > 10000 then
    raise exception 'PACHKA_NOTOGRI';
  end if;

  update dori_products set pachka = p_pachka, updated_at = now()
   where id = p_product_id
  returning name into v_nom;

  if v_nom is null then
    raise exception 'DORI_TOPILMADI';
  end if;

  return jsonb_build_object('ok', true, 'name', v_nom, 'pachka', p_pachka);
end $$;

revoke all on function public.dori_pachka_qoy(uuid, int) from public, anon;
grant execute on function public.dori_pachka_qoy(uuid, int) to authenticated;
