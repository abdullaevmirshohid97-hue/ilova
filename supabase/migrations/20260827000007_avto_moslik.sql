-- =============================================================
--  AVTOMATIK BIRLASHTIRISH
--
--  Kaliti VA ishlab chiqaruvchisi mos bo'lgan juftliklar (o'lchandi:
--  598 ta). Bunday juftlikda ikkilanish yo'q - bu bir dorining ikki
--  skladdagi taklifi.
--
--  ASOSIY QAYSI BIRI: shtrix-kodi bori. Shtrix-kod - eng ishonchli
--  belgi va u bilan kelgan kartochka boyroq; ikkinchisi unga qo'shiladi.
--  Ikkalasida ham bo'lsa (yoki ikkalasida ham bo'lmasa) - eskisi asosiy.
--
--  p_apply = false bo'lsa HECH NARSA o'zgarmaydi, faqat nechta va
--  qanaqa juftlik borligi qaytadi. Birlashtirish qaytmas amal.
-- =============================================================

create or replace function public.dori_avto_moslik(
  p_apply boolean default false,
  p_limit int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_n     int := 0;
  v_namuna jsonb := '[]'::jsonb;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  perform set_config('statement_timeout', '240s', true);

  drop table if exists _avto;
  create temp table _avto on commit drop as
  with dori as (
    select p.id, p.name, p.manufacturer, p.barcode, p.first_seen,
           dori_kalit(p.name)             as kalit,
           dori_ich_kalit(p.manufacturer) as ich,
           (select min(o.warehouse_id::text) from dori_offers o where o.product_id = p.id) as sklad
    from dori_products p
    where p.is_active
  )
  select
    case when a.barcode is not null and b.barcode is null then a.id
         when b.barcode is not null and a.barcode is null then b.id
         when a.first_seen <= b.first_seen then a.id else b.id end as asosiy_id,
    case when a.barcode is not null and b.barcode is null then b.id
         when b.barcode is not null and a.barcode is null then a.id
         when a.first_seen <= b.first_seen then b.id else a.id end as dublikat_id,
    a.name as nom_a, b.name as nom_b, a.kalit
  from dori a
  join dori b
    on b.kalit = a.kalit
   and a.id < b.id
   and b.sklad is distinct from a.sklad
   and b.ich = a.ich
  where a.kalit is not null and a.kalit <> '||'
    and a.ich <> ''
  limit greatest(coalesce(p_limit, 200), 1);

  select count(*) into v_n from _avto;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_namuna
  from (select nom_a, nom_b, kalit from _avto limit 8) t;

  if p_apply then
    v_n := 0;
    for r in select * from _avto loop
      -- Oldingi qadamda birlashib ketgan bo'lishi mumkin
      if exists (select 1 from dori_products where id = r.asosiy_id)
         and exists (select 1 from dori_products where id = r.dublikat_id) then
        perform dori_birlashtir(r.asosiy_id, r.dublikat_id);
        insert into dori_aliases (kalit, manufacturer_key, product_id, source)
        select r.kalit, dori_ich_kalit(p.manufacturer), r.asosiy_id, 'auto'
        from dori_products p where p.id = r.asosiy_id
        on conflict (kalit, coalesce(manufacturer_key, '')) do nothing;
        v_n := v_n + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'qollandi', p_apply,
    'juftlik', v_n,
    'namuna', v_namuna
  );
end $$;

revoke all on function public.dori_avto_moslik(boolean, int) from public, anon;
grant execute on function public.dori_avto_moslik(boolean, int) to authenticated;
