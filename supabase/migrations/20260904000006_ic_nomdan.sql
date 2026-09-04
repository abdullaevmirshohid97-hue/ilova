-- =============================================================
--  ISHLAB CHIQARUVCHINI NOM OXIRIDAN TOPISH
--
--  Muammo: 1said ta'minotchisining prays faylida ishlab chiqaruvchi
--  ALOHIDA USTUN EMAS - u dori nomining oxiriga yozilgan:
--      "Рингер лактат инф 200мл Радикс"
--      "Сорбилакт р-р инф 200мл Юрия фарм"
--  Shu sababli o'sha skladdagi 2 614 pozitsiyaning birortasida ham
--  ishlab chiqaruvchi yo'q, eksportda esa ustun bo'sh chiqadi.
--
--  Yechim: katalogda allaqachon 1 555 xil ishlab chiqaruvchi bor
--  (boshqa ta'minotchi fayllaridan). Nomi ularning biri bilan
--  TUGAYDIGAN dorilarga o'sha nom qo'yiladi.
--
--  NIMA QILINMAYDI: taxmin. Faqat aniq moslik - nom tanish ishlab
--  chiqaruvchi nomi bilan tugashi va so'z chegarasida bo'lishi kerak.
--  Qolgani ta'minotchidan so'raladi: hujjat mijozga ketadi, unga
--  taxminiy ma'lumot yozib bo'lmaydi.
--
--  Standart holatda QURUQ SINOV: nima o'zgarishini ko'rsatadi, hech
--  narsani yozmaydi. Yozish uchun p_qollash => true.
-- =============================================================

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
  v_topildi int;
  v_namuna  jsonb;
  v_yozildi int := 0;
begin
  if not is_super_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- Tanish ishlab chiqaruvchilar: '/' dan oldingi qism nom bo'lib
  -- ishlatiladi ('Радикс/Узбекистан' -> 'радикс'). Bir qisqa nomga
  -- bir necha to'liq variant bo'lsa, eng ko'p uchragani olinadi.
  create temp table _ic on commit drop as
  with hammasi as (
    select lower(btrim(split_part(manufacturer, '/', 1))) as qisqa,
           manufacturer,
           count(*) as nechta
    from dori_products
    where manufacturer is not null
      and btrim(split_part(manufacturer, '/', 1)) <> ''
    group by 1, 2
  )
  select distinct on (qisqa) qisqa, manufacturer
  from hammasi
  -- 4 belgidan qisqa nom xato moslik beradi ("MR" boshqa so'z ichida
  -- ham uchraydi), shuning uchun ular chetlab o'tiladi
  where length(qisqa) >= 4
  order by qisqa, nechta desc;

  create temp table _moslik on commit drop as
  select p.id, p.name, t.manufacturer
  from dori_products p
  join _ic t
    -- Nom AYNAN shu nom bilan tugashi va oldida bo'sh joy bo'lishi
    -- kerak: "…200мл Радикс" mos keladi, "Радикснинг…" yo'q
    on lower(btrim(p.name)) like '% ' || t.qisqa
  where p.manufacturer is null;

  select count(*) into v_topildi from _moslik;

  select coalesce(jsonb_agg(jsonb_build_object('nom', name, 'ic', manufacturer)), '[]'::jsonb)
    into v_namuna
  from (select name, manufacturer from _moslik order by name limit greatest(0, coalesce(p_limit, 50))) x;

  if p_qollash then
    update dori_products p
       set manufacturer = m.manufacturer,
           updated_at = now()
      from _moslik m
     where p.id = m.id and p.manufacturer is null;
    get diagnostics v_yozildi = row_count;
  end if;

  return jsonb_build_object(
    'topildi', v_topildi,
    'yozildi', v_yozildi,
    'qollandi', p_qollash,
    -- Qolgani: manba yo'q, ta'minotchidan so'rash kerak
    'hamon_nomsiz', (select count(*) from dori_products where manufacturer is null) - v_yozildi,
    'namuna', v_namuna
  );
end $$;

revoke all on function public.dori_ic_nomdan(boolean, int) from public, anon;
grant execute on function public.dori_ic_nomdan(boolean, int) to authenticated;
