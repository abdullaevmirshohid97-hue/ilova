-- =============================================================
--  Hamkor qoldig'i: to'lov yaratgan yozuv IKKI MARTA sanalmasin
--
--  Bitimga bog'lanmagan («Umumiy qarzga») to'lov kassaga yozuv
--  tushiradi. O'sha yozuvda ham `klient_id` bor, `bitim_id` esa
--  yo'q — ya'ni u «eski, bitimsiz yozuv» shartiga tushib, qoldiqqa
--  ikkinchi marta qo'shilardi. To'lovning o'zi esa allaqachon
--  sanalgan.
--
--  Topilgan holat (2026-09-28): 51 458 000 so'mlik to'lov qoldiqda
--  102 916 000 bo'lib ko'ringan. Ilova yadrosi
--  (`packages/kassa-yadro/balans.ts`, `tolovYozuvlari`) va MCP ham
--  shu migratsiya bilan birga tuzatildi — uchalasi bir xil hisoblashi
--  shart, aks holda internetli va internetsiz raqam farq qiladi.
--
--  BEKOR qilingan to'lovning yozuvi ham chiqariladi: aks holda
--  to'lov bekor qilinganda uning yozuvi «eski qarz» bo'lib tirilardi.
-- =============================================================

create or replace function public.kassa_hamkor_qoldiq(p_klient_id uuid)
returns numeric
language sql
stable
set search_path to 'public'
as $function$
  select
    coalesce((
      select sum(case when b.yonalish = 'berdim' then b.summa else -b.summa end)
        from public.kassa_bitimlar b
       where b.klient_id = p_klient_id and b.holat <> 'bekor'
    ), 0)
    +
    coalesce((
      select sum(case when t.yonalish = 'berdim' then t.summa else -t.summa end)
        from public.kassa_bitim_tolovlar t
       where t.klient_id = p_klient_id and t.holat <> 'bekor'
    ), 0)
    +
    -- Eski, bitimsiz yozuvlar — TO'LOV YARATGANI BUNGA KIRMAYDI
    coalesce((
      select sum(case when y.turi = 'chiqim' then y.summa else -y.summa end)
        from public.kassa_yozuvlar y
       where y.klient_id = p_klient_id
         and y.bitim_id is null
         and y.bekor_at is null
         and y.kochirma_id is null
         and not exists (
           select 1 from public.kassa_bitim_tolovlar t2
            where t2.yozuv_id = y.id
         )
    ), 0);
$function$;
