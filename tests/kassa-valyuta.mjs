// =============================================================
//  CLARY — VALYUTA VA KURS
//
//  Eng muhim uchtasi:
//
//   1. ASOSIY VALYUTA BITTA. Ikkitasi bo'lsa bosh sahifadagi
//      jami qaysi biriga o'girilganini hech kim bilmasdi.
//   2. ILOVADAGI RO'YXAT BAZADAGI CHEKLOV BILAN BIR XIL. Farq
//      bo'lsa, ilova yozmoqchi bo'lgan valyutani server rad
//      etardi va sabab ekranda «cheklov buzildi» bo'lib chiqardi.
//   3. KURS SINXDA MATN. `to_jsonb` numeric'ni JSON float ga
//      aylantirib 11850.500000 ni yo'qotardi.
//
//  Hammasi BITTA `do` blokida va oxirida QAYTARIB OLINADI.
//
//  Ishga tushirish:  node tests/kassa-valyuta.mjs
//  SQL ni ko'rish:   node tests/kassa-valyuta.mjs --sql
// =============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

const BLOK = `
do $$
declare
  v_org uuid; v_b2b uuid; v_user uuid; v_hisob uuid; v_hamkor uuid;
  v_valyuta text;
  v_ok boolean; v_soni int; v_ozg jsonb; v_kurs numeric;
  v_n jsonb := '[]'::jsonb;
begin
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-VALYUTA ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-valyuta-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org, 'Sinov admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- ---------- 1. Yangi valyutalar qabul qilinadi ----------
  -- Ilovadagi ro'yxat: UZS USD EUR RUB KZT KGS TRY AZN TJS
  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Tenge', 'naqd', 'KZT', 0) returning id into v_hisob;
  v_n := v_n || jsonb_build_object('nom', 'KZT hisob yaratildi', 'ok', v_hisob is not null);

  begin
    insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
    values (v_org, 'Som', 'naqd', 'KGS', 0);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object('nom', 'KGS ham qabul qilinadi', 'ok', v_ok);

  begin
    insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
    values (v_org, 'Yolgon', 'naqd', 'XXX', 0);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'NOTANISH valyuta rad etiladi', 'ok', v_ok);

  -- Bitim va to'lovda ham
  insert into public.kassa_klientlar (org_id, ism, turi, valyuta)
  values (v_org, 'Tonirok', 'hamkor', 'KZT') returning id into v_hamkor;
  begin
    insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, summa, valyuta)
    values (v_org, v_hamkor, 'berdim', 'qarz', 100, 'TRY');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object('nom', 'bitimda TRY qabul qilinadi', 'ok', v_ok);

  -- TO‘LOV jadvali ALOHIDA tekshiriladi. U bitimdan boshqa jadval va
  -- cheklovi ham boshqa. Kengaytirish o‘tmay qolsa, hamkor TRY da
  -- bitim yozardi-yu, unga to‘lov kirita olmasdi — qarz abadiy ochiq
  -- qolardi.
  begin
    insert into public.kassa_bitim_tolovlar (org_id, klient_id, yonalish, summa, valyuta)
    values (v_org, v_hamkor, 'oldim', 50, 'TJS');
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object('nom', 'to''lovda TJS qabul qilinadi', 'ok', v_ok);

  -- ---------- 2. Valyuta jadvali ----------
  --
  -- Trigger tashkilot yaratilganda asosiy valyutani qo‘yadi.
  -- Usiz yangi biznes valyutasiz qolardi va unikal indeks ham
  -- ishga tushmasdi: asosiy umuman yo‘q bo‘lsa, ikkinchisini
  -- rad etadigan narsa qolmaydi.
  select count(*) into v_soni from public.kassa_valyutalar
   where org_id = v_org and asosiy;
  v_n := v_n || jsonb_build_object(
    'nom', 'TRIGGER yangi tashkilotga asosiy valyuta qo''yadi',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  select valyuta into v_valyuta from public.kassa_valyutalar
   where org_id = v_org and asosiy;
  v_n := v_n || jsonb_build_object(
    'nom', 'asosiy valyuta UZS',
    'ok', v_valyuta = 'UZS', 'izoh', coalesce(v_valyuta, 'null'));

  -- B2B tashkilotiga TEGMAYDI: trigger qamrovi tor.
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-VALYUTA B2B ' || gen_random_uuid(), 'active', array['b2b'])
  returning id into v_b2b;
  select count(*) into v_soni from public.kassa_valyutalar where org_id = v_b2b;
  v_n := v_n || jsonb_build_object(
    'nom', 'B2B tashkilotiga valyuta qo''yilmaydi',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta');

  insert into public.kassa_valyutalar (org_id, valyuta, kurs)
  values (v_org, 'USD', 11850.5);

  select kurs into v_kurs from public.kassa_valyutalar
   where org_id = v_org and valyuta = 'USD';
  v_n := v_n || jsonb_build_object(
    'nom', 'kasrli kurs saqlanadi (11850.5)',
    'ok', v_kurs = 11850.5, 'izoh', v_kurs::text);

  -- ---------- 3. ASOSIY BITTA ----------
  begin
    insert into public.kassa_valyutalar (org_id, valyuta, kurs, asosiy)
    values (v_org, 'EUR', 13000, true);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'IKKINCHI asosiy valyuta rad etiladi', 'ok', v_ok);

  -- Bir xil valyuta ikki marta ham yozilmaydi
  begin
    insert into public.kassa_valyutalar (org_id, valyuta, kurs)
    values (v_org, 'USD', 12000);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'bir valyuta IKKI MARTA yozilmaydi', 'ok', v_ok);

  -- Manfiy va nol kurs
  begin
    insert into public.kassa_valyutalar (org_id, valyuta, kurs)
    values (v_org, 'RUB', 0);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'nol kurs rad etiladi', 'ok', v_ok);

  -- ---------- 4. Sinxronizatsiya ----------
  --
  -- «N ta» raqamiga qarab xulosa chiqarmang. Bu blok SQL Editor’da
  -- postgres roli ostida ishlaydi, u esa jadval EGASI — RLS unga
  -- qo‘llanmaydi. Shuning uchun bu yerda butun bazadagi qatorlar
  -- sanaladi, faqat shu tashkilotniki emas.
  --
  -- Ajratishning O‘ZI tests/tenant-ajratish.mjs da tekshiriladi: u
  -- REST orqali haqiqiy foydalanuvchi JWT’si bilan boradi, ya’ni
  -- authenticated roli ostida RLS rostdan ishlaydi.
  select public.kassa_ozgarishlar(0, 2000) into v_ozg;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_ozgarishlar «valyutalar» beradi',
    'ok', v_ozg ? 'valyutalar',
    'izoh', coalesce(jsonb_array_length(v_ozg->'valyutalar'), -1)::text || ' ta');

  -- KURS MATN bo'lib chiqsin: float bo'lsa 11850.500000 yo'qolardi
  v_n := v_n || jsonb_build_object(
    'nom', 'kurs sinxda MATN (float emas)',
    'ok', jsonb_typeof(v_ozg->'valyutalar'->0->'kurs') = 'string',
    'izoh', coalesce(jsonb_typeof(v_ozg->'valyutalar'->0->'kurs'), 'yo''q'));

  -- ---------- 5. RLS va o_raqam ----------
  select count(*) into v_soni from pg_class
   where relname = 'kassa_valyutalar' and relrowsecurity;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_valyutalar da RLS yoqilgan', 'ok', v_soni = 1);

  select count(*) into v_soni from public.kassa_valyutalar
   where org_id = v_org and o_raqam is null;
  v_n := v_n || jsonb_build_object(
    'nom', 'trigger o_raqam qo''yadi (sinx uchun)',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta o''raqamsiz');

  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

if (process.argv.includes('--sql')) {
  const chiqish = join(ROOT, 'supabase/sinov/kassa-valyuta-sinov.sql');
  writeFileSync(chiqish, BLOK.trimStart(), 'utf8');
  console.log(BLOK);
  console.log('\n  fayl: ' + chiqish);
  process.exit(0);
}

let K;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}

console.log('\n\x1b[1mCLARY — VALYUTA VA KURS\x1b[0m\n');

if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kodchi/kalitlar.json topilmadi — sinov o‘tkazib yuborildi.');
  console.log('    SQL ni ko‘rish: node tests/kassa-valyuta.mjs --sql\n');
  process.exit(0);
}

async function sqlXom(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  return { ok: r.ok, matn: await r.text() };
}

const javob = await sqlXom(BLOK);
let xabar = javob.matn;
try {
  xabar = JSON.parse(javob.matn)?.message ?? JSON.parse(javob.matn)?.error?.message ?? javob.matn;
} catch {
  /* JSON emas */
}
const m = xabar.match(/SINOV_NATIJA: (\[[\s\S]*?\])\s*(?:CONTEXT|PL\/pgSQL|$)/);
if (!m) {
  tekshir('sinov bloki bajarildi', false, xabar.slice(0, 400));
} else {
  for (const n of JSON.parse(m[1])) tekshir(n.nom, n.ok === true, n.izoh);
}

const qoldi = await sqlXom(
  "select count(*) as n from public.organizations where name like 'SINOV-VALYUTA%'",
);
let soni = -1;
try {
  soni = Number(JSON.parse(qoldi.matn)[0]?.n);
} catch {
  /* o'qib bo'lmadi */
}
tekshir('sinov tashkilotlari qaytarib olindi', soni === 0, soni === 0 ? 'iz yo‘q' : `${soni} ta QOLDI`);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
