-- =============================================================
-- YUKCHIBOLLA — yangi funksiyalar ANON uchun ochiq qolgan (TESHIK)
--
-- tests/prays-oqimi.mjs topdi: "anon eksport qilolmaydi" tekshiruvi
-- HTTP 200 berdi.
--
-- SABAB: Postgres YANGI funksiyaga EXECUTE huquqini PUBLIC ga
-- STANDART holatda beradi. `drop function` + qayta yaratish ham
-- eski revoke'ni yo'q qiladi va standart huquqni tiklaydi.
--
-- Shu sessiyada qo'shilgan 16 ta funksiyaning HAMMASI anon uchun
-- ochiq qolgan edi. Ko'pchiligi ichida is_manager()/dori_ruxsat()
-- tekshiruvi bor, lekin ikkitasi YOZADI va tekshiruvsiz edi:
--
--   menejer_xaridori()          — customers ga qator qo'shadi
--   menejer_hisobini_moslash()  — orders ni yangilaydi,
--                                 ledger_entries ga yozadi va o'chiradi
--
-- Ya'ni kirmagan odam menejer uuid'ini bilsa qarz yozuvlarini
-- surib yubora olardi.
--
-- Qoida: har yangi funksiyadan keyin PUBLIC dan REVOKE, keyin
-- kimga kerak bo'lsa aniq GRANT.
-- =============================================================

-- ---------- 1. Hammasidan PUBLIC ni olib tashlaymiz ----------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as imzo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'my_effective_prices', 'mijoz_valyuta', 'korinish_narxi', 'korinish_valyutasi',
        'mijoz_korinadimi', 'hisob_mijozi', 'menejer_xaridori', 'menejer_yashirish',
        'menejer_hisobini_moslash', 'set_my_mijoz_korinish', 'menejer_tolov',
        'menejer_storno', 'menejer_hisob', 'menejer_mijoz_harakati', 'is_direktor',
        'dori_prays_eksport', 'tg_menejer_xaridori', 'tg_orders_bill'
      )
  loop
    execute format('revoke all on function %s from public, anon', r.imzo);
  end loop;
end $$;

-- ---------- 2. Kerakligiga aniq huquq ----------

-- Mijoz ilovasi chaqiradi
grant execute on function public.my_effective_prices() to authenticated;
grant execute on function public.mijoz_valyuta() to authenticated;

-- Menejer paneli chaqiradi
grant execute on function public.set_my_mijoz_korinish(boolean) to authenticated;
grant execute on function public.menejer_tolov(uuid, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.menejer_storno(uuid, text) to authenticated;
grant execute on function public.menejer_hisob() to authenticated;
grant execute on function public.menejer_mijoz_harakati(uuid, int) to authenticated;

-- Admin paneli chaqiradi
grant execute on function public.menejer_yashirish(uuid, boolean) to authenticated;
grant execute on function public.dori_prays_eksport(text, integer, integer) to authenticated;

-- RLS siyosatlari ichida chaqiriladi — siyosat SO'ROV YUBORGAN odam
-- nomidan hisoblanadi, ya'ni unga EXECUTE kerak
grant execute on function public.is_direktor() to authenticated;
grant execute on function public.mijoz_korinadimi(uuid) to authenticated;

-- Qolganlari (korinish_narxi, korinish_valyutasi, hisob_mijozi,
-- menejer_xaridori, menejer_hisobini_moslash, trigger funksiyalari)
-- FAQAT boshqa security definer funksiyalar va triggerlar ichidan
-- chaqiriladi. Ular egasining huquqi bilan ishlaydi, shuning uchun
-- hech kimga grant kerak emas.

-- ---------- 3. Eksport tartibi barqaror bo'lsin ----------
-- Nomlar takrorlansa bo'lak chegarasida qator ikki marta tushib,
-- boshqasi umuman tushmay qolardi. Union all da bu yanada xavfli:
-- uchta bo'lim bir xil nomni beradi.
create or replace function public.dori_prays_eksport(
  p_q      text default null,
  p_limit  integer default 1000,
  p_offset integer default 0
)
returns table(
  bolim              text,
  nomi               text,
  narx               numeric,
  seriya             text,
  yaroqlilik         date,
  ishlab_chiqaruvchi text,
  aksiya             text,
  aksiya_narx        numeric,
  narx_real          numeric,
  org_upk            numeric
)
language sql stable security definer set search_path = public
as $$
  with taklif as (
    select p.id, p.name, p.price, p.manufacturer,
           (array_agg(o.bolim       order by o.updated_at desc))[1] as bolim,
           (array_agg(o.aksiya      order by o.updated_at desc))[1] as aksiya,
           (array_agg(o.aksiya_narx order by o.updated_at desc))[1] as aksiya_narx,
           (array_agg(o.narx_real   order by o.updated_at desc))[1] as narx_real,
           (array_agg(o.org_upk     order by o.updated_at desc))[1] as org_upk
    from dori_products p
    left join dori_offers o on o.product_id = p.id
    where p.is_active
      and p.price is not null
      and (
        p_q is null or btrim(p_q) = ''
        or p.name ilike '%' || btrim(p_q) || '%'
        or p.manufacturer ilike '%' || btrim(p_q) || '%'
      )
    group by p.id, p.name, p.price, p.manufacturer
  ),
  partiya as (
    select distinct on (bb.product_id) bb.product_id, bb.series, bb.expiry
    from dori_batches bb
    join dori_warehouses w on w.id = bb.warehouse_id and w.is_active
    order by bb.product_id, bb.expiry asc nulls last, bb.last_seen desc
  ),
  hammasi as (
    -- 1-bo'lim: asosiy ro'yxat (aksiyadagi dori ham shu yerda turadi)
    select 1 as tartib, t.id, 'asosiy'::text as bolim, t.name, t.price,
           pb.series, pb.expiry, t.manufacturer,
           null::text as aksiya, null::numeric as aksiya_narx,
           null::numeric as narx_real, null::numeric as org_upk
    from taklif t left join partiya pb on pb.product_id = t.id
    where coalesce(t.bolim, 'asosiy') <> 'qoshimcha'

    union all
    -- 2-bo'lim: qo'shimchalar (o'z ustunlari bilan)
    select 2, t.id, 'qoshimcha', t.name, t.price, pb.series, pb.expiry, t.manufacturer,
           null, null, t.narx_real, t.org_upk
    from taklif t left join partiya pb on pb.product_id = t.id
    where t.bolim = 'qoshimcha'

    union all
    -- 3-bo'lim: aksiya (aksiya sharti bor har bir dori)
    select 3, t.id, 'aksiya', t.name, t.price, pb.series, pb.expiry, t.manufacturer,
           t.aksiya, t.aksiya_narx, null, null
    from taklif t left join partiya pb on pb.product_id = t.id
    where t.aksiya is not null
  )
  select bolim, name, price, series, expiry, manufacturer,
         aksiya, aksiya_narx, narx_real, org_upk
  from hammasi
  where dori_ruxsat()
  order by tartib, name, id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.dori_prays_eksport(text, integer, integer) from public, anon;
grant execute on function public.dori_prays_eksport(text, integer, integer) to authenticated;
