-- =============================================================
--  ISHLAB CHIQARUVCHINI MOSLIK NAVBATIDAN OLISH
--
--  Moslashtirish navbatida 714 juftlik turibdi: bir ta'minotchining
--  dorisi va boshqasining shu dori bo'lishi mumkin bo'lgan nomzodi.
--  Ularning 452 tasida nomzodda ishlab chiqaruvchi BOR, asosiy
--  yozuvda esa yo'q.
--
--  MUHIM FARQ: bu funksiya juftliklarni BIRLASHTIRMAYDI. Birlashtirish
--  ikki katalog yozuvini bittaga qo'shadi va uni orqaga qaytarish
--  qiyin - shuning uchun u odam qaroriga qoladi (MOSLASHTIRISH
--  moduli). Bu yerda faqat bo'sh maydon to'ldiriladi: yozuvlar
--  o'z joyida qoladi, hech narsa yo'qolmaydi.
--
--  O'xshashlik chegarasi bor: past o'xshashlikdagi juftlik boshqa
--  dori bo'lishi mumkin va unga begona ishlab chiqaruvchini yozib
--  qo'yish - mijozga ketadigan hujjatda yolg'on ma'lumot demak.
--
--  Standart holatda QURUQ SINOV.
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
  v_topildi int;
  v_namuna  jsonb;
  v_yozildi int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  create temp table _nav on commit drop as
  -- Bir doriga bir necha nomzod bo'lishi mumkin: eng o'xshashini olamiz
  select distinct on (n.product_id)
         n.product_id, a.name, b.manufacturer, n.oxshashlik
  from dori_moslik_navbat n
  join dori_products a on a.id = n.product_id
  join dori_products b on b.id = n.nomzod_id
  where n.holat = 'kutilmoqda'
    and a.manufacturer is null
    and b.manufacturer is not null
    and n.oxshashlik >= coalesce(p_min_oxshashlik, 0.9)
  order by n.product_id, n.oxshashlik desc;

  select count(*) into v_topildi from _nav;

  select coalesce(jsonb_agg(jsonb_build_object('nom', name, 'ic', manufacturer, 'oxshashlik', oxshashlik)), '[]'::jsonb)
    into v_namuna
  from (select name, manufacturer, oxshashlik from _nav order by name limit greatest(0, coalesce(p_limit, 50))) x;

  if p_qollash then
    update dori_products p
       set manufacturer = v.manufacturer,
           updated_at = now()
      from _nav v
     where p.id = v.product_id and p.manufacturer is null;
    get diagnostics v_yozildi = row_count;
  end if;

  return jsonb_build_object(
    'topildi', v_topildi,
    'yozildi', v_yozildi,
    'qollandi', p_qollash,
    'chegara', coalesce(p_min_oxshashlik, 0.9),
    'hamon_nomsiz', (select count(*) from dori_products where manufacturer is null) - v_yozildi,
    'namuna', v_namuna
  );
end $$;

revoke all on function public.dori_ic_navbatdan(boolean, numeric, int) from public, anon;
grant execute on function public.dori_ic_navbatdan(boolean, numeric, int) to authenticated;
