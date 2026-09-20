-- =============================================================
--  TO'LOVGA HAM MUDDAT
--
--  Muddat hozir faqat `kassa_bitimlar` da. Lekin do'kondor
--  kelishuvni ikkala tomonda ham yozadi:
--
--    «500 mingni oldim, qolganini 5-oktabrga kelishdik»
--
--  Bu TO'LOV qatoriga tegishli va uni bitimga yozib qo'yish
--  noto'g'ri bo'lardi: bitim muddati — butun qarzniki, to'lov
--  muddati esa o'sha kelishuvniki.
--
--  `kassa_yozuvlar` ga ham qo'shiladi: kartochkadagi «Kirim» va
--  «Chiqim» hamkorsiz yozuvga ham olib borishi mumkin.
--
--  `date` turi ATAYLAB: muddat KUN, soat emas. Soat qo'shilsa
--  «5-oktabr 00:00 da kechikdi» degan holat chiqib, odam bir kun
--  oldin ogohlantirish olardi.
-- =============================================================

alter table public.kassa_bitim_tolovlar
  add column if not exists muddat date;

alter table public.kassa_yozuvlar
  add column if not exists muddat date;

create index if not exists kassa_tolovlar_muddat_idx
  on public.kassa_bitim_tolovlar (org_id, muddat)
  where muddat is not null and holat <> 'bekor';

create index if not exists kassa_yozuvlar_muddat_idx
  on public.kassa_yozuvlar (org_id, muddat)
  where muddat is not null and bekor_at is null;


-- ---------- `kassa_tolov_qosh` muddatni qabul qiladi ----------
--
-- ESKI IMZO O'CHIRILADI. `create or replace` boshqa parametrlar
-- ro'yxati bilan chaqirilsa YANGI funksiya yasaydi, eskisi esa
-- joyida qoladi — va ikkalasi bir xil nomli, bir xil nomdagi
-- parametrlar bilan chaqirilganda PostgREST «function is not
-- unique» deb yiqilardi.
drop function if exists public.kassa_tolov_qosh(uuid, text, numeric, uuid, uuid, text, text, numeric, text, timestamptz, uuid);

-- Funksiya tanasi 20260920000001 dan AYNAN ko'chirilgan; faqat
-- `p_muddat` parametri va `muddat` ustuni qo'shildi. Qayta
-- yozilmadi: u yerda `tolov_usuli` xaritasi ('bank' -> 'otkazma')
-- va xato nomlari bor, ular sinovda qat'iy tekshiriladi.
create or replace function public.kassa_tolov_qosh(
  p_klient_id uuid,
  p_yonalish  text,
  p_summa     numeric,
  p_hisob_id  uuid,
  p_bitim_id  uuid default null,
  p_usuli     text default 'naqd',
  p_valyuta   text default 'UZS',
  p_kurs      numeric default 1,
  p_izoh      text default null,
  p_sana      timestamptz default null,
  p_id        uuid default null,
  p_muddat    date default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tolov uuid;
  v_yozuv uuid;
  v_sana  timestamptz := coalesce(p_sana, now());
  v_bitim record;
begin
  -- Bitimga bog'langan bo'lsa: yo'nalish TESKARI bo'lishi shart.
  -- «Men berdim» bitimi «men oldim» to'lovi bilan yopiladi. Bir xil
  -- yo'nalish qo'yilsa qarz kamaymay, ikki baravar oshib ketardi.
  if p_bitim_id is not null then
    select * into v_bitim from public.kassa_bitimlar where id = p_bitim_id;
    if not found then
      raise exception 'BITIM_YOQ';
    end if;
    if v_bitim.yonalish = p_yonalish then
      raise exception 'YONALISH_TESKARI_BOLSIN'
        using hint = 'Bitim ' || v_bitim.yonalish || ', to''lov esa qarama-qarshi bo''lishi kerak';
    end if;
    if v_bitim.klient_id <> p_klient_id then
      raise exception 'HAMKOR_MOS_EMAS';
    end if;
  end if;

  -- Pul har doim harakat qiladi — daftarga yozuv tushadi
  insert into public.kassa_yozuvlar (
    hisob_id, turi, summa, valyuta, kurs, klient_id, izoh, sana, bitim_id, tolov_usuli
  ) values (
    p_hisob_id,
    case when p_yonalish = 'berdim' then 'chiqim' else 'kirim' end,
    p_summa, p_valyuta, p_kurs, p_klient_id,
    coalesce(p_izoh, 'To''lov'), v_sana, p_bitim_id,
    case when p_usuli = 'bank' then 'otkazma' when p_usuli = 'tovar' then 'naqd' else p_usuli end
  )
  returning id into v_yozuv;

  insert into public.kassa_bitim_tolovlar (
    id, klient_id, bitim_id, yonalish, summa, valyuta, kurs, usuli,
    yozuv_id, izoh, sana, muddat
  ) values (
    coalesce(p_id, gen_random_uuid()), p_klient_id, p_bitim_id, p_yonalish,
    p_summa, p_valyuta, p_kurs, p_usuli, v_yozuv, p_izoh, v_sana, p_muddat
  )
  returning id into v_tolov;

  -- To'liq to'langan bo'lsa bitim yopiladi. Qoldiq SAQLANMAYDI —
  -- har safar qaytadan hisoblanadi, shuning uchun bu yerdagi
  -- `holat` faqat ko'rsatkich, hisobning manbai emas.
  if p_bitim_id is not null and public.kassa_bitim_qoldiq(p_bitim_id) <= 0 then
    update public.kassa_bitimlar
       set holat = 'yopilgan'
     where id = p_bitim_id and holat <> 'bekor';
  end if;

  return v_tolov;
end $$;

revoke all on function public.kassa_tolov_qosh(uuid, text, numeric, uuid, uuid, text, text, numeric, text, timestamptz, uuid, date) from public, anon;
grant execute on function public.kassa_tolov_qosh(uuid, text, numeric, uuid, uuid, text, text, numeric, text, timestamptz, uuid, date) to authenticated;
