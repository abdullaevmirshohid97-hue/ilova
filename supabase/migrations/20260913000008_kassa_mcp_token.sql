-- =============================================================
-- CREDIT DEBIT — AI AGENT ULANISHI (MCP) UCHUN TOKENLAR
--
-- Foydalanuvchi o'z daftariga AI agentni ulaydi: telefondagi
-- yordamchi, Claude yoki boshqa MCP mijozi «qancha qarzim bor?»,
-- «bu oy qancha ketdi?» degan savolga javob bera olsin.
--
-- NEGA JWT EMAS: mobil ilovadagi sessiya tokeni bir soatda
-- eskiradi va uni MCP mijoziga qo'yib bo'lmaydi. Shuning uchun
-- ALOHIDA, uzoq muddatli token — foydalanuvchi o'zi yaratadi va
-- istalgan vaqt o'chiradi.
--
-- TOKENNING O'ZI SAQLANMAYDI. Bazada faqat SHA-256 xesh va
-- ko'rinadigan prefiks turadi:
--   · baza o'g'irlansa ham token bilan kirib bo'lmaydi;
--   · foydalanuvchi tokenni faqat YARATILGANDA bir marta ko'radi.
-- Bu — parol saqlashning o'sha qoidasi.
--
-- CHEGARA: token EGASINING tashkilotiga bog'langan. AI agent uning
-- nomidan ishlaydi va boshqa tenantni ko'ra olmaydi. Chekka funksiya
-- `service_role` bilan ishlagani uchun RLS chetlab o'tiladi —
-- shuning uchun HAR SO'ROVDA org filtri QO'LDA yoziladi va buni
-- `tests/kassa-mcp.mjs` bosib ko'radi.
-- =============================================================

create table if not exists public.kassa_tokenlar (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nom         text not null,
  -- sha256(token) — token matni HECH QAYERDA saqlanmaydi
  xesh        text not null unique,
  -- "cd_a1b2c3…" — ro'yxatda qaysi token ekanini bilish uchun
  prefiks     text not null,
  -- Yozish huquqi: standart holatda AI faqat O'QIY oladi
  yozishi     boolean not null default false,
  faol        boolean not null default true,
  oxirgi_ishlatilgan timestamptz,
  soralgan_soni bigint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists kassa_tokenlar_org_idx on public.kassa_tokenlar (org_id);
create index if not exists kassa_tokenlar_xesh_idx on public.kassa_tokenlar (xesh);

alter table public.kassa_tokenlar enable row level security;

-- Foydalanuvchi FAQAT o'z tokenlarini ko'radi. Xesh ustuni ham
-- ko'rinadi, lekin undan token tiklab bo'lmaydi.
drop policy if exists "kassa_tokenlar: oziniki" on public.kassa_tokenlar;
create policy "kassa_tokenlar: oziniki" on public.kassa_tokenlar
  for all to authenticated
  using (org_id = current_org_id() and user_id = auth.uid())
  with check (org_id = current_org_id() and user_id = auth.uid());


-- ---------- Jurnal: AI nima so'radi ----------
-- Ikki sabab bilan kerak:
--  1. Foydalanuvchi «agent nima qildi?» deb ko'ra olsin;
--  2. Cheklovni (kunlik so'rov soni) shu jadval ustida hisoblaymiz.
create table if not exists public.kassa_mcp_jurnal (
  id         bigserial primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  token_id   uuid references public.kassa_tokenlar(id) on delete set null,
  asbob      text not null,
  natija     text not null check (natija in ('ok', 'rad', 'xato')),
  izoh       text,
  created_at timestamptz not null default now()
);

create index if not exists kassa_mcp_jurnal_org_idx
  on public.kassa_mcp_jurnal (org_id, created_at desc);

alter table public.kassa_mcp_jurnal enable row level security;

drop policy if exists "kassa_mcp_jurnal: org oqiydi" on public.kassa_mcp_jurnal;
create policy "kassa_mcp_jurnal: org oqiydi" on public.kassa_mcp_jurnal
  for select to authenticated
  using (org_id = current_org_id());


-- ---------- Token yaratish ----------
-- Token SERVERDA yasaladi: mijozdagi tasodifiy son manbasiga
-- ishonmaymiz (eski Android WebView'da u zaif bo'lishi mumkin).
create or replace function public.kassa_token_yarat(
  p_nom     text,
  p_yozishi boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := current_org_id();
  v_uid   uuid := auth.uid();
  v_token text;
  v_id    uuid;
  v_soni  int;
begin
  if v_org is null or v_uid is null or not is_admin() then
    raise exception 'RUXSAT_YOQ';
  end if;

  select count(*) into v_soni from public.kassa_tokenlar
   where user_id = v_uid and faol;
  if v_soni >= 10 then
    raise exception 'KOP_TOKEN: bir vaqtda 10 tadan ko''p faol ulanish bo''lmaydi';
  end if;

  -- "cd_" + 40 belgi (20 bayt)
  v_token := 'cd_' || encode(extensions.gen_random_bytes(20), 'hex');

  insert into public.kassa_tokenlar (org_id, user_id, nom, xesh, prefiks, yozishi)
  values (
    v_org, v_uid,
    coalesce(nullif(btrim(p_nom), ''), 'AI ulanish'),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    left(v_token, 11),
    coalesce(p_yozishi, false)
  )
  returning id into v_id;

  -- Token matni FAQAT SHU YERDA qaytadi va boshqa hech qayerda
  -- saqlanmaydi. Foydalanuvchi ko'chirib olmasa — yangisini yaratadi.
  return jsonb_build_object('id', v_id, 'token', v_token, 'prefiks', left(v_token, 11));
end $$;

revoke all on function public.kassa_token_yarat(text, boolean) from public, anon;
grant execute on function public.kassa_token_yarat(text, boolean) to authenticated;


-- ---------- Tokenni tekshirish (chekka funksiya uchun) ----------
-- `service_role` bilan chaqiriladi: `auth.uid()` null bo'ladi,
-- shuning uchun bu funksiya EGASINI tokenning o'zidan aniqlaydi.
create or replace function public.kassa_token_tekshir(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qator public.kassa_tokenlar;
begin
  if coalesce(btrim(p_token), '') = '' then
    return null;
  end if;

  select * into v_qator from public.kassa_tokenlar
   where xesh = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and faol
   limit 1;

  if not found then
    return null;
  end if;

  update public.kassa_tokenlar
     set oxirgi_ishlatilgan = now(),
         soralgan_soni = soralgan_soni + 1
   where id = v_qator.id;

  return jsonb_build_object(
    'token_id', v_qator.id,
    'org_id',   v_qator.org_id,
    'user_id',  v_qator.user_id,
    'yozishi',  v_qator.yozishi,
    'nom',      v_qator.nom
  );
end $$;

-- Bu funksiyani FAQAT server chaqiradi. `authenticated` ga ochiq
-- qolsa, kirgan odam boshqa tokenlarni taxmin qilib sinab ko'rardi.
revoke all on function public.kassa_token_tekshir(text) from public, anon, authenticated;
grant execute on function public.kassa_token_tekshir(text) to service_role;

comment on function public.kassa_token_tekshir(text) is
  'MCP chekka funksiyasi uchun: token xeshi bo''yicha egasini topadi. Faqat service_role.';


-- ---------- Kunlik cheklov ----------
create or replace function public.kassa_mcp_hisob(p_org uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.kassa_mcp_jurnal
   where org_id = p_org and created_at > now() - interval '1 day';
$$;

revoke all on function public.kassa_mcp_hisob(uuid) from public, anon, authenticated;
grant execute on function public.kassa_mcp_hisob(uuid) to service_role;
