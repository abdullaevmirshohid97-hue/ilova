-- =============================================================
--  KATALOGNI VARAQLASH
--
--  Mini App faqat qidiruvdan keyin natija ko'rsatardi — mijoz esa ochishi
--  bilan dorilar ro'yxatini ko'rishni kutadi (mavjud mijozlar katalogi
--  kabi). 6900 dorini birdan yuborib bo'lmaydi, shuning uchun sahifalab.
--
--  Guruhlar filtri ham shu yerdan: mijoz "vitaminlar" ni bosib, faqat
--  o'shalarni ko'radi.
-- =============================================================

create or replace function public.dori_catalog_page(
  p_group  text default null,
  p_offset int  default 0,
  p_limit  int  default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
  v_lim int := least(coalesce(p_limit, 40), 60);
  v_off int := greatest(coalesce(p_offset, 0), 0);
  v_grp text := nullif(trim(coalesce(p_group, '')), '');
begin
  select jsonb_build_object(
    'jami', (
      select count(*) from dori_products p
      where p.is_active and (v_grp is null or p.grp = v_grp)
    ),
    'items', coalesce((
      select jsonb_agg(t) from (
        select p.id, p.name, p.manufacturer, p.price, p.unit, p.grp,
               coalesce(p.stock, 0) as stock,
               (select min(b.expiry) from dori_batches b
                 where b.product_id = p.id and b.expiry >= current_date) as eng_yaqin_muddat
        from dori_products p
        where p.is_active
          and (v_grp is null or p.grp = v_grp)
          -- Narxi yo'q dori sotib bo'lmaydi: ro'yxatda ham ko'rinmasin
          and p.price is not null
        order by p.name
        offset v_off limit v_lim
      ) t
    ), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

revoke all on function public.dori_catalog_page(text, int, int) from public, anon;
grant execute on function public.dori_catalog_page(text, int, int) to authenticated, service_role;

-- Guruhlar — filtr uchun
create or replace function public.dori_groups()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t order by t.n desc), '[]'::jsonb)
  from (
    select grp, count(*) as n
    from dori_products
    where is_active and grp is not null and price is not null
    group by grp
    having count(*) > 2
    limit 20
  ) t;
$$;

revoke all on function public.dori_groups() from public, anon;
grant execute on function public.dori_groups() to authenticated, service_role;
