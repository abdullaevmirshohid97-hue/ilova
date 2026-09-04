-- =============================================================
--  EKSPORT: PostgREST 1000 QATORDA KESADI
--
--  Sinovda ko'rindi: katalogda 4 828 dori bor, eksport esa 1 000
--  qator qaytardi. Funksiyaga p_limit 50000 berilgan bo'lsa ham -
--  chegara PostgREST tomonida (max-rows), funksiyada emas.
--
--  Bu jimgina kesish: xato ham, ogohlantirish ham chiqmaydi. Odam
--  praysni yuklab olib, mijozga yuboradi va katalogning to'rtdan
--  uch qismi yo'q ekanini bilmay qoladi. Avval xuddi shunday
--  "300 qator ko'rsatyapti" muammosi bo'lgan edi.
--
--  Yechim: p_offset qo'shiladi, panel bo'lak-bo'lak so'raydi.
-- =============================================================

create or replace function public.dori_prays_eksport(
  p_q      text default null,
  p_limit  int  default 1000,
  p_offset int  default 0
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
  select p.name, p.price, b.series, b.expiry, p.manufacturer
  from dori_products p
  left join lateral (
    select distinct on (bb.product_id) bb.series, bb.expiry
    from dori_batches bb
    join dori_warehouses w on w.id = bb.warehouse_id and w.is_active
    where bb.product_id = p.id
    order by bb.product_id, bb.expiry asc nulls last, bb.last_seen desc
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
  -- Tartib BARQAROR bo'lishi shart: bo'lak-bo'lak so'ralganda nom
  -- bir xil bo'lsa tartib o'zgarib, ba'zi qator ikki marta tushib,
  -- ba'zisi umuman tushmay qolardi. Shuning uchun id ham qo'shildi.
  order by p.name, p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.dori_prays_eksport(text, int, int) from public, anon;
grant execute on function public.dori_prays_eksport(text, int, int) to authenticated;

-- Eski ikki argumentli imzo qolib ketmasin: panel yangisini chaqiradi,
-- eskisi esa 1000 qator kesib qaytaraverardi.
drop function if exists public.dori_prays_eksport(text, int);
