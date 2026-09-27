-- =============================================================
--  TASDIQLANGAN OPERATSIYA PUL TOMONIDAN O'ZGARMAYDI
--
--  Ilovaga tahrirlash qo'shiladi: sana, vaqt, izoh. Lekin bitta
--  narsa cheklanmasa, tasdiq tizimi o'z ma'nosini yo'qotadi.
--
--  Vaziyat: hamkor Telegram orqali «1 200 000» ni TASDIQLAYDI.
--  Keyin do'kondor summani 2 000 000 qiladi. Tarixda esa
--  «tasdiqlangan» deb turadi va hamkor nimani tasdiqlaganini
--  isbotlab bo'lmaydi. Bu shunchaki xato emas — bu tasdiqning
--  o'zini bekor qiladi.
--
--  CHEKLOV UI DA EMAS, BAZADA. Sabab: sinxronizatsiya
--  PostgREST orqali TO'G'RIDAN-TO'G'RI `update` yuboradi
--  (`server.ts`, `yubor`). Ya'ni ekranni chetlab o'tish mumkin va
--  faqat baza cheklovi ishonchli.
--
--  NIMA MUMKIN, NIMA YO'Q:
--
--    holat = 'kutilmoqda'  -> hammasi tahrirlanadi
--    boshqa holatlarda     -> faqat `izoh` va `muddat`
--
--  Izoh ataylab ochiq: u pulga tegmaydi va «akasi kelib to'ladi»
--  kabi qayd keyin ham kerak bo'ladi.
--
--  HOLAT O'ZGARISHI TAHRIR EMAS. Tasdiqlash va bekor qilish
--  oqimlari `holat` ni o'zgartiradi — ular to'siqdan o'tadi,
--  aks holda tasdiq tugmasining o'zi ishlamay qolardi.
-- =============================================================

create or replace function public.tg_kassa_bitim_tahrir()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Oqim (tasdiq, rad, bekor, yopilgan) — to'sib qo'yilmaydi
  if new.holat is distinct from old.holat then
    return new;
  end if;

  if old.holat = 'kutilmoqda' then
    return new;
  end if;

  -- `is distinct from` ataylab: NULL li ustunlarda `<>` NULL
  -- qaytaradi va shart hech qachon rost bo'lmasdi — cheklov
  -- jimgina ishlamay turardi.
  if new.summa    is distinct from old.summa
  or new.yonalish is distinct from old.yonalish
  or new.nima     is distinct from old.nima
  or new.valyuta  is distinct from old.valyuta
  or new.kurs     is distinct from old.kurs
  or new.sana     is distinct from old.sana
  or new.miqdor   is distinct from old.miqdor
  or new.narx     is distinct from old.narx
  or new.tovar_nom is distinct from old.tovar_nom
  or new.klient_id is distinct from old.klient_id
  then
    raise exception 'TASDIQLANGAN_OZGARMAYDI';
  end if;

  return new;
end $$;

drop trigger if exists trg_kassa_bitim_tahrir on public.kassa_bitimlar;
create trigger trg_kassa_bitim_tahrir
  before update on public.kassa_bitimlar
  for each row execute function public.tg_kassa_bitim_tahrir();


create or replace function public.tg_kassa_tolov_tahrir()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.holat is distinct from old.holat then
    return new;
  end if;

  if old.holat = 'kutilmoqda' then
    return new;
  end if;

  if new.summa    is distinct from old.summa
  or new.yonalish is distinct from old.yonalish
  or new.valyuta  is distinct from old.valyuta
  or new.kurs     is distinct from old.kurs
  or new.sana     is distinct from old.sana
  or new.usuli    is distinct from old.usuli
  or new.klient_id is distinct from old.klient_id
  or new.bitim_id  is distinct from old.bitim_id
  then
    raise exception 'TASDIQLANGAN_OZGARMAYDI';
  end if;

  return new;
end $$;

drop trigger if exists trg_kassa_tolov_tahrir on public.kassa_bitim_tolovlar;
create trigger trg_kassa_tolov_tahrir
  before update on public.kassa_bitim_tolovlar
  for each row execute function public.tg_kassa_tolov_tahrir();
