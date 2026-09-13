-- =============================================================
-- CREDIT DEBIT — MIJOZNING O'Z AI KALITI (BYOK)
--
-- Foydalanuvchi xohlagan modelni tanlaydi: Claude, GPT yoki Gemini.
-- Obunasi (API kaliti) bo'lsa — o'zinikini ulaydi va **token puli
-- ham o'zidan ketadi**. Bizda esa xarajat qolmaydi.
--
-- KALIT QANDAY SAQLANADI
-- Bu — MCP tokenidan BOSHQACHA masala. MCP tokenini biz yaratamiz,
-- shuning uchun uni xeshlab qo'ysak yetardi. Bu yerdagi kalit esa
-- MIJOZNIKI va uni SERVER O'QIY OLISHI kerak (modelga yuborish
-- uchun). Ya'ni xesh emas, QAYTARILADIGAN shifr kerak.
--
-- Shuning uchun:
--   · kalit `pgp_sym_encrypt` bilan shifrlanadi;
--   · shifr ochqichi `app_secrets` da turadi va unga faqat
--     `service_role` yetadi (jadvalda RLS yoqilgan, siyosat yo'q);
--   · `kassa_ai_kalit` jadvalining o'zida ham SIYOSAT YO'Q —
--     tenant shifrlangan matnni ham ko'ra olmaydi, faqat RPC orqali
--     provayder nomi va niqoblangan prefiksni oladi;
--   · ochish funksiyasi FAQAT `service_role` ga berilgan.
--
-- Ya'ni kalitni na boshqa tenant, na kalit egasining o'zi qayta
-- o'qiy oladi — uni faqat chekka funksiya modelga yuborish uchun
-- ochadi.
-- =============================================================

-- ---------- 1. Shifr ochqichi ----------
-- Bir marta yasaladi va o'zgarmaydi: o'zgarsa, saqlangan kalitlar
-- ochilmay qoladi.
insert into public.app_secrets (key, value)
select 'kassa_ai_shifr', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.app_secrets where key = 'kassa_ai_shifr');


-- ---------- 2. Jadval ----------
create table if not exists public.kassa_ai_kalit (
  -- Bir tashkilotda bitta kalit: ikkita bo'lsa «qaysi biri bilan
  -- so'ralsin?» degan savol chiqadi va javob ko'rinmaydi.
  org_id     uuid primary key references public.organizations(id) on delete cascade,
  provayder  text not null check (provayder in ('anthropic', 'openai', 'google')),
  model      text not null,
  kalit_shifr bytea not null,
  -- Ro'yxatda ko'rsatish uchun: "sk-ant-…7f2c"
  niqob      text not null,
  faol       boolean not null default true,
  oxirgi_sinov timestamptz,
  oxirgi_xato  text,
  qoshgan    uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS yoqilgan, SIYOSAT YO'Q: hech kim to'g'ridan o'qiy olmaydi.
-- Kirish faqat quyidagi funksiyalar orqali.
alter table public.kassa_ai_kalit enable row level security;


-- ---------- 3. Saqlash ----------
create or replace function public.kassa_ai_kalit_saqla(
  p_provayder text,
  p_model     text,
  p_kalit     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := current_org_id();
  v_uid   uuid := auth.uid();
  v_kalit text := btrim(coalesce(p_kalit, ''));
  v_shifr text;
  v_niqob text;
begin
  if v_org is null or not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  if p_provayder not in ('anthropic', 'openai', 'google') then
    raise exception 'PROVAYDER_NOTOGRI';
  end if;
  if length(v_kalit) < 20 then
    raise exception 'KALIT_QISQA: API kaliti to''liq ko''chirilmagan';
  end if;
  if coalesce(btrim(p_model), '') = '' then
    raise exception 'MODEL_YOQ';
  end if;

  select value into v_shifr from public.app_secrets where key = 'kassa_ai_shifr';
  if v_shifr is null then
    raise exception 'SHIFR_YOQ: server sozlanmagan';
  end if;

  -- "sk-ant-api03-…a1b2" — qaysi kalit ekanini bilish uchun yetadi,
  -- tiklash uchun yetmaydi
  v_niqob := left(v_kalit, 7) || '…' || right(v_kalit, 4);

  insert into public.kassa_ai_kalit (org_id, provayder, model, kalit_shifr, niqob, qoshgan, faol)
  values (v_org, p_provayder, btrim(p_model),
          extensions.pgp_sym_encrypt(v_kalit, v_shifr), v_niqob, v_uid, true)
  on conflict (org_id) do update
     set provayder = excluded.provayder,
         model = excluded.model,
         kalit_shifr = excluded.kalit_shifr,
         niqob = excluded.niqob,
         qoshgan = excluded.qoshgan,
         faol = true,
         oxirgi_xato = null,
         updated_at = now();

  return jsonb_build_object('provayder', p_provayder, 'model', btrim(p_model), 'niqob', v_niqob);
end $$;

revoke all on function public.kassa_ai_kalit_saqla(text, text, text) from public, anon;
grant execute on function public.kassa_ai_kalit_saqla(text, text, text) to authenticated;


-- ---------- 4. Ko'rish (kalitsiz) ----------
create or replace function public.kassa_ai_kalit_ol()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'provayder', k.provayder,
    'model', k.model,
    'niqob', k.niqob,
    'faol', k.faol,
    'oxirgi_sinov', k.oxirgi_sinov,
    'oxirgi_xato', k.oxirgi_xato
  )
  from public.kassa_ai_kalit k
  where k.org_id = current_org_id();
$$;

revoke all on function public.kassa_ai_kalit_ol() from public, anon;
grant execute on function public.kassa_ai_kalit_ol() to authenticated;


-- ---------- 5. O'chirish ----------
create or replace function public.kassa_ai_kalit_ochir()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_org_id() is null or not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;
  delete from public.kassa_ai_kalit where org_id = current_org_id();
end $$;

revoke all on function public.kassa_ai_kalit_ochir() from public, anon;
grant execute on function public.kassa_ai_kalit_ochir() to authenticated;


-- ---------- 6. Ochish — FAQAT SERVER ----------
-- Chekka funksiya modelga yuborish uchun chaqiradi. `authenticated`
-- ga berilsa, kalit egasi ham, boshqa tenant ham uni o'qib olardi.
create or replace function public.kassa_ai_kalit_ochiq(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shifr text;
  v_qator public.kassa_ai_kalit;
begin
  select * into v_qator from public.kassa_ai_kalit where org_id = p_org and faol;
  if not found then
    return null;
  end if;
  select value into v_shifr from public.app_secrets where key = 'kassa_ai_shifr';
  return jsonb_build_object(
    'provayder', v_qator.provayder,
    'model', v_qator.model,
    'kalit', extensions.pgp_sym_decrypt(v_qator.kalit_shifr, v_shifr)
  );
end $$;

revoke all on function public.kassa_ai_kalit_ochiq(uuid) from public, anon, authenticated;
grant execute on function public.kassa_ai_kalit_ochiq(uuid) to service_role;

comment on function public.kassa_ai_kalit_ochiq(uuid) is
  'Mijozning AI kalitini ochadi. FAQAT service_role — chekka funksiya modelga yuborish uchun chaqiradi.';


-- ---------- 7. Sinov natijasini yozish ----------
create or replace function public.kassa_ai_kalit_natija(
  p_org  uuid,
  p_xato text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.kassa_ai_kalit
     set oxirgi_sinov = now(),
         oxirgi_xato  = p_xato,
         -- Kalit noto'g'ri bo'lsa o'chirmaymiz: odam uni tuzatishi
         -- mumkin. Lekin "faol emas" deb belgilaymiz, robot esa
         -- ishlamaydi va sababini ko'rsatadi.
         faol = (p_xato is null)
   where org_id = p_org;
$$;

revoke all on function public.kassa_ai_kalit_natija(uuid, text) from public, anon, authenticated;
grant execute on function public.kassa_ai_kalit_natija(uuid, text) to service_role;
