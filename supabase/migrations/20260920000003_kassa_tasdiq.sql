-- =============================================================
--  CREDIT DEBIT — BITIMNI TELEGRAM ORQALI TASDIQLASH
--
--  Muammo. Hamkorda ilova yo'q va bo'lmaydi ham: Tonirok bozordagi
--  odam, u hech qachon ro'yxatdan o'tmaydi. Demak tasdiqlash
--  ILOVASIZ ishlashi kerak.
--
--  Yechim. Bitimga BIR MARTALIK havola yasaladi:
--    t.me/<bot>?start=T_<token>
--  Siz uni istalgan yo'l bilan yuborasiz (Telegram, SMS, WhatsApp).
--  Hamkor bosadi, bot kartochkani ko'rsatadi, u tugmani bosadi.
--
--  XAVFSIZLIK (telegram-qarz dan o'rganilgan darslar):
--
--   * TOKEN XESHLANIB saqlanadi. Baza o'g'irlansa ham havolani
--     tiklab bo'lmaydi — parol saqlashning o'sha qoidasi.
--   * TOKEN BIR MARTALIK va MUDDATLI (7 kun). Aks holda havola
--     boshqa odamga o'tsa, u begona bitimni tasdiqlab yuborardi.
--   * Bot HECH QACHON o'zi ruxsat hisoblamaydi. Har amal
--     token -> bitim -> org zanjirini bazada qaytadan quradigan
--     RPC orqali o'tadi.
--   * TASDIQNI FAQAT `kutilmoqda` HOLATIDAGI bitim qabul qiladi.
--     Yopilganini yoki bekor qilinganini qayta tasdiqlab bo'lmaydi.
--   * Tasdiq funksiyalari faqat `service_role` uchun ochiq: token
--     maxfiy emas deb hisoblanmasin, uni bilgan odam boshqa
--     tashkilotning bitimini tasdiqlab yuborardi.
--
--  MUHIM QAROR (reja 7.4): tasdiq SHART EMAS. Tasdiqlanmagan bitim
--  ham qoldiqqa kiradi — aks holda daftar hamkorning tugma
--  bosishiga bog'liq bo'lib qolardi. Tasdiq — DALIL, shart emas.
--  Shuning uchun bu yerda qoldiq hisobiga tegadigan hech narsa yo'q.
-- =============================================================


-- ---------- 1. Tokenlar ----------
create table if not exists public.kassa_tasdiq_tokenlar (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  bitim_id   uuid not null,
  -- sha256(token) — token matni HECH QAYERDA saqlanmaydi
  xesh       text not null unique,
  -- Muddati o'tgan havola ishlamaydi. 7 kun: bitim muddatidan
  -- qisqaroq bo'lsa odam ulgurmasdi, uzunroq bo'lsa havola
  -- yig'ilib qolardi.
  amal_qiladi timestamptz not null default now() + interval '7 days',
  -- Bir martalik: ishlatilgandan keyin qayta ochilmaydi
  ishlatilgan_at timestamptz,
  ishlatgan_chat bigint,
  created_at timestamptz not null default now(),
  constraint kassa_tasdiq_bitim_fk
    foreign key (bitim_id, org_id)
    references public.kassa_bitimlar (id, org_id) on delete cascade
);

create index if not exists kassa_tasdiq_tokenlar_org_idx
  on public.kassa_tasdiq_tokenlar (org_id);
create index if not exists kassa_tasdiq_tokenlar_bitim_idx
  on public.kassa_tasdiq_tokenlar (bitim_id);

alter table public.kassa_tasdiq_tokenlar enable row level security;

-- Egasi o'z tashkilotining havolalarini ko'radi. Xesh ko'rinadi,
-- lekin undan token tiklab bo'lmaydi.
drop policy if exists "kassa_tasdiq_tokenlar: oz tashkiloti" on public.kassa_tasdiq_tokenlar;
create policy "kassa_tasdiq_tokenlar: oz tashkiloti" on public.kassa_tasdiq_tokenlar
  for all to authenticated
  using (org_id = current_org_id())
  with check (org_id = current_org_id());


-- ---------- 2. Havola yaratish (ilovadan) ----------
--
-- Token matni FAQAT shu yerda qaytadi. Ilova uni havolaga qo'yib
-- foydalanuvchiga beradi va o'zida saqlamaydi.
create or replace function public.kassa_tasdiq_havola(p_bitim_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org   uuid := current_org_id();
  v_bitim public.kassa_bitimlar;
  v_token text;
begin
  if v_org is null then
    raise exception 'RUXSAT_YOQ';
  end if;

  -- RLS ham to'sadi, lekin org filtri QO'LDA ham yoziladi: bitta
  -- qorovulga tayanmaslik shu loyihaning qoidasi.
  select * into v_bitim from public.kassa_bitimlar
   where id = p_bitim_id and org_id = v_org;
  if not found then
    raise exception 'BITIM_TOPILMADI';
  end if;

  if v_bitim.holat <> 'kutilmoqda' then
    raise exception 'TASDIQ_KERAKMAS: bitim holati %', v_bitim.holat;
  end if;

  -- "T_" + 32 belgi (16 bayt). Telegram `start` parametri 64
  -- belgidan oshmasligi kerak.
  v_token := 'T_' || encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.kassa_tasdiq_tokenlar (org_id, bitim_id, xesh)
  values (v_org, p_bitim_id, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return jsonb_build_object(
    'token', v_token,
    'amal_qiladi', (now() + interval '7 days')::text
  );
end $$;

revoke all on function public.kassa_tasdiq_havola(uuid) from public, anon;
grant execute on function public.kassa_tasdiq_havola(uuid) to authenticated;


-- ---------- 3. Kartochkani ko'rish (bot uchun) ----------
--
-- O'QIYDI, o'zgartirmaydi: bot avval kartochkani ko'rsatadi, odam
-- keyin tugmani bosadi. Token shu bosqichda SARFLANMAYDI — aks
-- holda odam kartochkani ko'rib, o'ylab turib qaytsa havola
-- kuyib ketardi.
create or replace function public.kassa_tasdiq_korish(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t     public.kassa_tasdiq_tokenlar;
  v_bitim public.kassa_bitimlar;
  v_klient public.kassa_klientlar;
  v_org   record;
begin
  if coalesce(btrim(p_token), '') = '' then
    return jsonb_build_object('xato', 'TOKEN_YOQ');
  end if;

  select * into v_t from public.kassa_tasdiq_tokenlar
   where xesh = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('xato', 'TOKEN_NOTOGRI');
  end if;
  if v_t.ishlatilgan_at is not null then
    return jsonb_build_object('xato', 'TOKEN_ISHLATILGAN');
  end if;
  if v_t.amal_qiladi < now() then
    return jsonb_build_object('xato', 'TOKEN_MUDDATI_OTGAN');
  end if;

  select * into v_bitim from public.kassa_bitimlar
   where id = v_t.bitim_id and org_id = v_t.org_id;
  if not found then
    return jsonb_build_object('xato', 'BITIM_TOPILMADI');
  end if;

  select * into v_klient from public.kassa_klientlar
   where id = v_bitim.klient_id and org_id = v_t.org_id;

  select name into v_org from public.organizations where id = v_t.org_id;

  return jsonb_build_object(
    'bitim_id',  v_bitim.id,
    'holat',     v_bitim.holat,
    'yonalish',  v_bitim.yonalish,
    'nima',      v_bitim.nima,
    'tovar_nom', v_bitim.tovar_nom,
    'birlik',    v_bitim.birlik,
    'miqdor',    v_bitim.miqdor::text,
    'narx',      v_bitim.narx::text,
    -- Pul MATN bo'lib ketadi: `to_jsonb` numeric ni JSON float ga
    -- aylantiradi va 0.1 + 0.2 muammosi paydo bo'lardi.
    'summa',     v_bitim.summa::text,
    'valyuta',   v_bitim.valyuta,
    'muddat',    v_bitim.muddat::text,
    'sana',      v_bitim.sana::text,
    'izoh',      v_bitim.izoh,
    'hamkor',    coalesce(v_klient.ism, ''),
    'biznes',    coalesce(v_org.name, '')
  );
end $$;

revoke all on function public.kassa_tasdiq_korish(text) from public, anon, authenticated;
grant execute on function public.kassa_tasdiq_korish(text) to service_role;


-- ---------- 4. Tasdiqlash yoki rad etish (bot uchun) ----------
--
-- Zanjir bazada QAYTADAN quriladi: token -> bitim -> org. Bot
-- yuborgan `bitim_id` ga ISHONILMAYDI, u umuman qabul qilinmaydi.
create or replace function public.kassa_tasdiq_bajar(
  p_token   text,
  p_chat_id bigint,
  p_javob   text  -- 'tasdiq' | 'rad'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t     public.kassa_tasdiq_tokenlar;
  v_bitim public.kassa_bitimlar;
  v_yangi text;
begin
  if p_javob not in ('tasdiq', 'rad') then
    return jsonb_build_object('xato', 'JAVOB_NOTOGRI');
  end if;

  -- Tokenni QULFLAB olamiz: ikki marta bosilsa ikkinchisi kutadi
  -- va `ishlatilgan_at` ni ko'rib to'xtaydi. Qulfsiz ikkala so'rov
  -- ham «bo'sh» ko'rib, ikkitasi ham o'tib ketardi.
  select * into v_t from public.kassa_tasdiq_tokenlar
   where xesh = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if not found then
    return jsonb_build_object('xato', 'TOKEN_NOTOGRI');
  end if;
  if v_t.ishlatilgan_at is not null then
    return jsonb_build_object('xato', 'TOKEN_ISHLATILGAN');
  end if;
  if v_t.amal_qiladi < now() then
    return jsonb_build_object('xato', 'TOKEN_MUDDATI_OTGAN');
  end if;

  select * into v_bitim from public.kassa_bitimlar
   where id = v_t.bitim_id and org_id = v_t.org_id
   for update;
  if not found then
    return jsonb_build_object('xato', 'BITIM_TOPILMADI');
  end if;

  -- Yopilgan yoki bekor qilingan bitimni tasdiqlab bo'lmaydi
  if v_bitim.holat <> 'kutilmoqda' then
    return jsonb_build_object('xato', 'HOLAT_MOS_EMAS', 'holat', v_bitim.holat);
  end if;

  v_yangi := case when p_javob = 'tasdiq' then 'tasdiqlangan' else 'rad' end;

  update public.kassa_bitimlar
     set holat      = v_yangi,
         tasdiq_at  = now(),
         tasdiq_kim = p_chat_id
         -- `versiya` va `o_raqam` ni trigger (tg_kassa_oqim) qo‘yadi.
         -- Bu yerda ham oshirsak versiya IKKITAGA sakrardi va
         -- ilovadagi optimistik qulf yolgon toqnashuv korardi.
   where id = v_bitim.id and org_id = v_t.org_id;

  -- Hamkorga chat bog'lanadi: keyingi safar havola kerak emas.
  -- Faqat BO'SH bo'lsa yoziladi — bir hamkorni ikkinchisining
  -- chat'i egallab olmasin.
  update public.kassa_klientlar
     set telegram_id = p_chat_id
   where id = v_bitim.klient_id
     and org_id = v_t.org_id
     and telegram_id is null;

  update public.kassa_tasdiq_tokenlar
     set ishlatilgan_at = now(),
         ishlatgan_chat = p_chat_id
   where id = v_t.id;

  return jsonb_build_object('ok', true, 'holat', v_yangi, 'bitim_id', v_bitim.id);
end $$;

revoke all on function public.kassa_tasdiq_bajar(text, bigint, text) from public, anon, authenticated;
grant execute on function public.kassa_tasdiq_bajar(text, bigint, text) to service_role;
