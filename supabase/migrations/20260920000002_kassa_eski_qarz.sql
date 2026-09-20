-- =============================================================
--  ESKI QARZ HAM HAMKOR QOLDIG'IGA KIRADI
--
--  Muammo. `kassa_hamkor_qoldiq` faqat `kassa_bitimlar` va
--  `kassa_bitim_tolovlar` ni sanaydi. Lekin bitim tushunchasi
--  paydo bo'lgunicha hamma qarz `kassa_yozuvlar` ga klient
--  bog'lab yozilardi. Ular qoldiqdan tushib qolgan edi: odam
--  ilovani yangilaganda Tonirokning 120 dollari yo'qolardi.
--
--  Yechim. Bitimga BOG'LANMAGAN klientli yozuvlar ham qo'shiladi.
--  Bog'langani olinmaydi: bitim to'lovi daftarga ham tushadi, uni
--  ikkala tomondan sanasak qarz ikki barobar chiqardi.
--
--  Ishora qoidasi daftardagidek: chiqim = tovar/pul berildi =
--  u menga qarzdor (+). Bu ilovadagi `hamkorQoldiq` bilan ayni
--  bir xil — ikkisi farq qilsa, internet kelganda raqam
--  o'zgarib ketardi.
-- =============================================================

create or replace function public.kassa_hamkor_qoldiq(p_klient_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
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
    -- Eski, bitimsiz yozuvlar
    coalesce((
      select sum(case when y.turi = 'chiqim' then y.summa else -y.summa end)
        from public.kassa_yozuvlar y
       where y.klient_id = p_klient_id
         and y.bitim_id is null
         and y.bekor_at is null
         and y.kochirma_id is null
    ), 0);
$$;

revoke all on function public.kassa_hamkor_qoldiq(uuid) from public, anon;
grant execute on function public.kassa_hamkor_qoldiq(uuid) to authenticated;
