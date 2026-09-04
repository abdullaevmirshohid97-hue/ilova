-- =============================================================
--  TO'QNASHADIGAN YOZUVLARNI CHETLAB O'TISH
--
--  Ishlab chiqaruvchini to'ldirmoqchi bo'lganda baza rad etdi:
--    duplicate key ... (name_norm, coalesce(manufacturer,''))
--    = (дусконалретардкапсулы200мг30, World Medicine/Турция)
--
--  Ma'nosi: bu nom va bu ishlab chiqaruvchi bilan katalogda ALLAQACHON
--  yozuv bor. Ya'ni ikkovi bir dori va ularni BIRLASHTIRISH kerak,
--  ikkinchisiga nom yozib qo'yish emas.
--
--  Birlashtirish - odam qarori (MOSLASHTIRISH moduli), chunki u ikki
--  yozuvni bittaga qo'shadi va orqaga qaytarish qiyin. Shuning uchun
--  bu funksiyalar bunday holatni CHETLAB O'TADI va nechtasi shunday
--  ekanini alohida ko'rsatadi - ular birlashtirish uchun ro'yxat.
-- =============================================================

create or replace function public.dori_ic_navbatdan(
  p_qollash        boolean default false,
  p_min_oxshashlik numeric default 0.9,
  p_limit          int     default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topildi   int;
  v_toqnashuv int;
  v_namuna    jsonb;
  v_yozildi   int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  create temp table _nav on commit drop as
  select distinct on (n.product_id)
         n.product_id, a.name, a.name_norm, b.manufacturer, n.oxshashlik
  from dori_moslik_navbat n
  join dori_products a on a.id = n.product_id
  join dori_products b on b.id = n.nomzod_id
  where n.holat = 'kutilmoqda'
    and a.manufacturer is null
    and b.manufacturer is not null
    and n.oxshashlik >= coalesce(p_min_oxshashlik, 0.9)
  order by n.product_id, n.oxshashlik desc;

  select count(*) into v_topildi from _nav;

  -- Shu nom + shu ishlab chiqaruvchi bilan boshqa yozuv bormi
  create temp table _toza on commit drop as
  select v.* from _nav v
  where not exists (
    select 1 from dori_products p2
    where p2.name_norm = v.name_norm
      and p2.manufacturer = v.manufacturer
      and p2.id <> v.product_id
  );

  v_toqnashuv := v_topildi - (select count(*) from _toza);

  select coalesce(jsonb_agg(jsonb_build_object('nom', name, 'ic', manufacturer, 'oxshashlik', oxshashlik)), '[]'::jsonb)
    into v_namuna
  from (select name, manufacturer, oxshashlik from _toza order by name limit greatest(0, coalesce(p_limit, 50))) x;

  if p_qollash then
    update dori_products p
       set manufacturer = v.manufacturer, updated_at = now()
      from _toza v
     where p.id = v.product_id and p.manufacturer is null;
    get diagnostics v_yozildi = row_count;
  end if;

  return jsonb_build_object(
    'topildi', v_topildi,
    'yoziladi', (select count(*) from _toza),
    'yozildi', v_yozildi,
    -- Bular birlashtirilishi kerak: nom+ishlab chiqaruvchi juftligi
    -- allaqachon band, ya'ni katalogda ikki nusxa turibdi
    'birlashtirish_kerak', v_toqnashuv,
    'qollandi', p_qollash,
    'namuna', v_namuna
  );
end $$;

revoke all on function public.dori_ic_navbatdan(boolean, numeric, int) from public, anon;
grant execute on function public.dori_ic_navbatdan(boolean, numeric, int) to authenticated;


create or replace function public.dori_ic_nomdan(
  p_qollash boolean default false,
  p_limit   int     default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topildi   int;
  v_toqnashuv int;
  v_namuna    jsonb;
  v_yozildi   int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  create temp table _ic on commit drop as
  with hammasi as (
    select lower(btrim(split_part(manufacturer, '/', 1))) as qisqa,
           manufacturer, count(*) as nechta
    from dori_products
    where manufacturer is not null
      and btrim(split_part(manufacturer, '/', 1)) <> ''
    group by 1, 2
  )
  select distinct on (qisqa) qisqa, manufacturer
  from hammasi
  where length(qisqa) >= 4
  order by qisqa, nechta desc;

  create temp table _moslik on commit drop as
  select p.id, p.name, p.name_norm, t.manufacturer
  from dori_products p
  join _ic t on lower(btrim(p.name)) like '% ' || t.qisqa
  where p.manufacturer is null;

  select count(*) into v_topildi from _moslik;

  create temp table _toza2 on commit drop as
  select m.* from _moslik m
  where not exists (
    select 1 from dori_products p2
    where p2.name_norm = m.name_norm
      and p2.manufacturer = m.manufacturer
      and p2.id <> m.id
  );

  v_toqnashuv := v_topildi - (select count(*) from _toza2);

  select coalesce(jsonb_agg(jsonb_build_object('nom', name, 'ic', manufacturer)), '[]'::jsonb)
    into v_namuna
  from (select name, manufacturer from _toza2 order by name limit greatest(0, coalesce(p_limit, 50))) x;

  if p_qollash then
    update dori_products p
       set manufacturer = m.manufacturer, updated_at = now()
      from _toza2 m
     where p.id = m.id and p.manufacturer is null;
    get diagnostics v_yozildi = row_count;
  end if;

  return jsonb_build_object(
    'topildi', v_topildi,
    'yoziladi', (select count(*) from _toza2),
    'yozildi', v_yozildi,
    'birlashtirish_kerak', v_toqnashuv,
    'qollandi', p_qollash,
    'namuna', v_namuna
  );
end $$;

revoke all on function public.dori_ic_nomdan(boolean, int) from public, anon;
grant execute on function public.dori_ic_nomdan(boolean, int) to authenticated;
