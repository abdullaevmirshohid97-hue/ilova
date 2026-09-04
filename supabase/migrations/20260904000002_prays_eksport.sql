-- =============================================================
--  NARX QO'YILGAN PRAYSNI YUKLAB OLISH
--
--  Mijozga yuboriladigan ro'yxat: dori nomi, sotuv narxi, seriya,
--  yaroqlilik muddati, ishlab chiqaruvchi.
--
--  SKLAD NOMI CHIQMAYDI - bu ataylab. Ro'yxat tashqariga ketadi va
--  qaysi tovar qaysi omborda turgani mijozning ishi emas. Shuning
--  uchun hamma sklad bitta ro'yxatga yig'iladi.
--
--  BIR DORI - BIR QATOR. Bitta dori bir necha skladda turishi mumkin
--  va har birida o'z seriyasi bo'ladi. Narx esa bitta - katalogdagi
--  (eng arzon sklad bo'yicha yig'ilgan). Shu sababli:
--    narx     - dori_products dan (katalog narxi)
--    seriya   - MUDDATI ENG YAQIN partiyadan
--    muddat   - o'sha partiyaniki
--
--  Nega eng yaqin muddat: dorixonada avval muddati o'tayotgani
--  sotiladi. Eng uzoq muddatni ko'rsatib qo'yish esa mijozni
--  aldash bo'lardi.
-- =============================================================

create or replace function public.dori_prays_eksport(
  p_q      text default null,
  p_limit  int  default 20000
)
returns table (
  nomi              text,
  narx              numeric,
  seriya            text,
  yaroqlilik        date,
  ishlab_chiqaruvchi text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.name,
         p.price,
         b.series,
         b.expiry,
         p.manufacturer
  from dori_products p
  -- Muddati eng yaqin partiya. `distinct on` har dori uchun bitta
  -- qator qoldiradi - skladlar shu yerda birlashadi.
  left join lateral (
    select distinct on (bb.product_id) bb.series, bb.expiry
    from dori_batches bb
    join dori_warehouses w on w.id = bb.warehouse_id and w.is_active
    where bb.product_id = p.id
    order by bb.product_id,
             -- Muddati yo'q partiya oxirida tursin: u noma'lum, eng
             -- yaqin degani emas
             bb.expiry asc nulls last,
             bb.last_seen desc
    limit 1
  ) b on true
  where is_super_admin()
    and p.is_active
    and p.price is not null
    and (
      p_q is null or btrim(p_q) = ''
      or p.name ilike '%' || btrim(p_q) || '%'
      or p.manufacturer ilike '%' || btrim(p_q) || '%'
    )
  order by p.name
  limit greatest(1, least(coalesce(p_limit, 20000), 50000));
$$;

revoke all on function public.dori_prays_eksport(text, int) from public, anon;
grant execute on function public.dori_prays_eksport(text, int) to authenticated;
