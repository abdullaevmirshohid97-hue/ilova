// =============================================================
//  CLARY — BIR ODAMDA BIR NECHTA BIZNES
//
//  Bu sinov TENANT AJRATISHNI tekshiradi, chunki bu yerda
//  `profiles.org_id` KO'CHIRILADI — butun RLS shunga tayanadi.
//  Bitta qorovul tushib qolsa, odam boshqa tashkilotning
//  daftarini ochib o'tirardi va buni hech kim sezmasdi.
//
//  Eng muhim to'rttasi:
//
//   1. A'ZOLIKSIZ tashkilotga o'tib bo'lmaydi.
//   2. KASSA BO'LMAGAN tashkilotga o'tib bo'lmaydi — odamning
//      B2B tashkilotida admin a'zoligi bo'lishi mumkin, Clary u
//      yerga kirmasligi kerak.
//   3. ADMIN bo'lmagan a'zolik o'tkazmaydi.
//   4. O'tgandan keyin FAQAT yangi biznesning yozuvlari ko'rinadi.
//
//  Hammasi BITTA `do` blokida bajariladi va oxirida `raise
//  exception` bilan QAYTARIB OLINADI — jonli bazada iz qolmaydi.
//
//  Ishga tushirish:  node tests/kassa-biznes.mjs
//  SQL ni ko'rish:   node tests/kassa-biznes.mjs --sql
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
  v_org1 uuid; v_org2 uuid; v_b2b uuid; v_begona uuid;
  v_user uuid; v_user2 uuid;
  v_yangi uuid; v_nom text; v_soni int; v_ok boolean;
  v_n jsonb := '[]'::jsonb;
  v_royxat jsonb;
begin
  -- ---------- Tayyorgarlik ----------
  -- Birinchi biznes (kassa)
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-BIZNES A ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org1;

  -- B2B tashkiloti: kassa YO'Q. Clary bu yerga kirmasligi kerak.
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-BIZNES B2B ' || gen_random_uuid(), 'active', array['b2b'])
  returning id into v_b2b;

  -- Butunlay begona kassa tashkiloti: a'zolik yo'q
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-BIZNES BEGONA ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_begona;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-biznes-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org1, 'Sinov admin');

  insert into public.uzvliklar (user_id, org_id, role)
  values (v_user, v_org1, 'admin'), (v_user, v_b2b, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  -- ---------- 1. Ro'yxat ----------
  select jsonb_agg(to_jsonb(x)) into v_royxat from public.kassa_bizneslarim() x;

  v_n := v_n || jsonb_build_object(
    'nom', 'ro''yxatda FAQAT kassa tashkiloti (B2B chiqmaydi)',
    'ok', jsonb_array_length(coalesce(v_royxat, '[]'::jsonb)) = 1,
    'izoh', coalesce(jsonb_array_length(v_royxat), -1)::text || ' ta');

  v_n := v_n || jsonb_build_object(
    'nom', 'joriy biznes belgilangan',
    'ok', (v_royxat->0->>'joriymi')::boolean is true,
    'izoh', coalesce(v_royxat->0->>'joriymi', 'null'));

  -- ---------- 2. Yangi biznes qo'shish ----------
  v_yangi := public.kassa_biznes_qosh('SINOV-BIZNES C');
  v_org2 := v_yangi;

  v_n := v_n || jsonb_build_object(
    'nom', 'yangi biznes yaratildi',
    'ok', v_yangi is not null);

  v_n := v_n || jsonb_build_object(
    'nom', 'yangi biznes DARHOL ochildi (profiles ko''chdi)',
    'ok', (select org_id from public.profiles where id = v_user) = v_org2,
    'izoh', 'ok');

  v_n := v_n || jsonb_build_object(
    'nom', 'current_org_id() yangi biznesni ko''rsatadi',
    'ok', public.current_org_id() = v_org2);

  select count(*) into v_soni from public.kassa_hisoblar where org_id = v_org2;
  v_n := v_n || jsonb_build_object(
    'nom', 'yangi biznesda ikkita hisob tayyor',
    'ok', v_soni = 2, 'izoh', v_soni || ' ta');

  select count(*) into v_soni from public.kassa_turkumlar where org_id = v_org2;
  v_n := v_n || jsonb_build_object(
    'nom', 'yangi biznesda turkumlar tayyor',
    'ok', v_soni = 10, 'izoh', v_soni || ' ta');

  select count(*) into v_soni from public.uzvliklar
   where user_id = v_user and org_id = v_org2 and role = 'admin';
  v_n := v_n || jsonb_build_object(
    'nom', 'a''zolik yozildi',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  -- ---------- 3. Bir xil nom ----------
  begin
    perform public.kassa_biznes_qosh('sinov-biznes c');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'NOM_BAND%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'bir xil nomli ikkinchi biznes rad etiladi', 'ok', v_ok);

  begin
    perform public.kassa_biznes_qosh('A');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'NOM_QISQA%';
  end;
  v_n := v_n || jsonb_build_object('nom', 'bir harfli nom rad etiladi', 'ok', v_ok);

  -- ---------- 4. Almashtirish ----------
  select public.kassa_biznes_tanla(v_org1) into v_nom;
  v_n := v_n || jsonb_build_object(
    'nom', 'birinchi biznesga qaytildi',
    'ok', public.current_org_id() = v_org1,
    'izoh', coalesce(v_nom, 'null'));

  -- A'zolik YO'Q tashkilot
  begin
    perform public.kassa_biznes_tanla(v_begona);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'AZOLIK_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'A''ZOLIKSIZ tashkilotga o''tib bo''lmaydi', 'ok', v_ok);

  -- Kassa BO'LMAGAN tashkilot (a'zolik bor!)
  begin
    perform public.kassa_biznes_tanla(v_b2b);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'KASSA_EMAS%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'B2B tashkilotiga o''tib bo''lmaydi (a''zolik bo''lsa ham)', 'ok', v_ok);

  v_n := v_n || jsonb_build_object(
    'nom', 'rad etilgandan keyin joriy biznes O''ZGARMAGAN',
    'ok', public.current_org_id() = v_org1);

  -- Admin bo'lmagan a'zolik
  update public.uzvliklar set role = 'director' where user_id = v_user and org_id = v_org2;
  begin
    perform public.kassa_biznes_tanla(v_org2);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'RUXSAT_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'admin bo''lmagan a''zolik o''tkazmaydi', 'ok', v_ok);
  update public.uzvliklar set role = 'admin' where user_id = v_user and org_id = v_org2;

  -- ---------- 5. Ma'lumot ajratilganmi ----------
  insert into public.kassa_klientlar (org_id, ism, turi) values (v_org1, 'A ning hamkori', 'hamkor');
  perform public.kassa_biznes_tanla(v_org2);
  insert into public.kassa_klientlar (org_id, ism, turi) values (v_org2, 'C ning hamkori', 'hamkor');

  select count(*) into v_soni from public.kassa_klientlar where org_id = public.current_org_id();
  v_n := v_n || jsonb_build_object(
    'nom', 'yangi biznesda FAQAT o''zining hamkori',
    'ok', v_soni = 1, 'izoh', v_soni || ' ta');

  select count(*) into v_soni from public.kassa_klientlar
   where org_id = public.current_org_id() and ism = 'A ning hamkori';
  v_n := v_n || jsonb_build_object(
    'nom', 'avvalgi biznesning hamkori ko''rinmaydi',
    'ok', v_soni = 0, 'izoh', v_soni || ' ta');

  -- ---------- 6. Nomini o'zgartirish ----------
  select public.kassa_biznes_nomi(v_org2, 'SINOV-BIZNES C2') into v_nom;
  v_n := v_n || jsonb_build_object(
    'nom', 'nom o''zgardi',
    'ok', v_nom = 'SINOV-BIZNES C2'
      and (select name from public.organizations where id = v_org2) = 'SINOV-BIZNES C2',
    'izoh', coalesce(v_nom, 'null'));

  begin
    perform public.kassa_biznes_nomi(v_begona, 'O''ZIMNIKI');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'RUXSAT_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'BEGONA tashkilot nomini o''zgartirib bo''lmaydi', 'ok', v_ok);

  v_n := v_n || jsonb_build_object(
    'nom', 'begona tashkilot nomi haqiqatan o''zgarmagan',
    'ok', (select name from public.organizations where id = v_begona) <> 'O''ZIMNIKI');

  -- B2B tashkilotining nomiga ham tegib bo'lmaydi
  begin
    perform public.kassa_biznes_nomi(v_b2b, 'CLARY EGALLADI');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'RUXSAT_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'B2B tashkiloti nomiga tegib bo''lmaydi', 'ok', v_ok);

  -- ---------- 7. Boshqa odamning biznesi ----------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-biznes2-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user2;
  insert into public.profiles (id, role, org_id, full_name)
  values (v_user2, 'admin', v_begona, 'Boshqa odam');
  insert into public.uzvliklar (user_id, org_id, role) values (v_user2, v_begona, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_user2::text)::text, true);
  select jsonb_agg(to_jsonb(x)) into v_royxat from public.kassa_bizneslarim() x;
  v_n := v_n || jsonb_build_object(
    'nom', 'boshqa odam FAQAT o''z biznesini ko''radi',
    'ok', jsonb_array_length(coalesce(v_royxat, '[]'::jsonb)) = 1
      and (v_royxat->0->>'org_id')::uuid = v_begona,
    'izoh', coalesce(jsonb_array_length(v_royxat), -1)::text || ' ta');

  begin
    perform public.kassa_biznes_tanla(v_org1);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'AZOLIK_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'boshqa odamning biznesiga o''tib bo''lmaydi', 'ok', v_ok);

  -- ---------- 8. Huquqlar ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_biznes_tanla anon ga OCHIQ EMAS',
    'ok', not has_function_privilege('anon', 'public.kassa_biznes_tanla(uuid)', 'execute'),
    'izoh', 'anon');
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_biznes_qosh anon ga OCHIQ EMAS',
    'ok', not has_function_privilege('anon', 'public.kassa_biznes_qosh(text,text)', 'execute'),
    'izoh', 'anon');
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_biznes_nomi anon ga OCHIQ EMAS',
    'ok', not has_function_privilege('anon', 'public.kassa_biznes_nomi(uuid,text)', 'execute'),
    'izoh', 'anon');
  v_n := v_n || jsonb_build_object(
    'nom', 'uchalasi authenticated ga ochiq',
    'ok', has_function_privilege('authenticated', 'public.kassa_biznes_tanla(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.kassa_biznes_qosh(text,text)', 'execute')
      and has_function_privilege('authenticated', 'public.kassa_bizneslarim()', 'execute'),
    'izoh', 'authenticated');

  -- ---------- 8b. Biznesni o'chirish ----------
  -- Quruq sinov HECH NARSAGA tegmasligi kerak: ilova avval
  -- shuni ko'rsatadi, odam tasdiqlagandan keyingina o'chiriladi.
  insert into public.kassa_klientlar (org_id, ism, turi) values (v_org1, 'O''chadi', 'hamkor');

  v_royxat := public.kassa_biznes_ochir(v_org1);
  v_n := v_n || jsonb_build_object(
    'nom', 'quruq sinov: o''chmaydi, sanab beradi',
    'ok', (v_royxat->>'quruq')::boolean is true
      and (v_royxat->>'klientlar')::int >= 1
      and exists (select 1 from public.organizations where id = v_org1),
    'izoh', coalesce(v_royxat->>'klientlar', '?') || ' ta klient');

  -- Begona tashkilotni sanab ham bo''lmaydi
  begin
    perform public.kassa_biznes_ochir(v_begona);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'RUXSAT_YOQ%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'BEGONA biznesni o''chirib bo''lmaydi', 'ok', v_ok);

  -- Haqiqiy o'chirish. Shu paytda JORIY biznes — v_org2,
  -- ya'ni o'chirilayotgani boshqasi.
  v_royxat := public.kassa_biznes_ochir(v_org1, true);
  v_n := v_n || jsonb_build_object(
    'nom', 'biznes o''chdi',
    'ok', (v_royxat->>'quruq')::boolean is false
      and not exists (select 1 from public.organizations where id = v_org1));

  v_n := v_n || jsonb_build_object(
    'nom', 'o''chgan biznesning klientlari ham ketdi',
    'ok', not exists (select 1 from public.kassa_klientlar where org_id = v_org1));

  v_n := v_n || jsonb_build_object(
    'nom', 'a''zolik ham ketdi',
    'ok', not exists (select 1 from public.uzvliklar where org_id = v_org1));

  -- Endi bitta biznes qoldi — uni o'chirib bo'lmaydi.
  -- Aks holda profiles.org_id bo'sh qolib, ilova butunlay
  -- ishlamay qolardi.
  begin
    perform public.kassa_biznes_ochir(v_org2, true);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'OXIRGI_BIZNES%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'OXIRGI biznesni o''chirib bo''lmaydi', 'ok', v_ok);

  v_n := v_n || jsonb_build_object(
    'nom', 'rad etilgandan keyin biznes joyida',
    'ok', exists (select 1 from public.organizations where id = v_org2));

  -- ---------- 8v. Mijoz kartochkasi ustunlari ----------
  insert into public.kassa_klientlar (org_id, ism, familya, turi, cheklov, lat, lng, kategoriya)
  values (v_org2, 'Tonirok', 'Tojiyev', 'hamkor', 1000000000, 41.31, 69.24, 'Bozor');
  v_n := v_n || jsonb_build_object(
    'nom', 'yangi ustunlar yozildi (cheklov tiyinda)',
    'ok', (select cheklov from public.kassa_klientlar where ism = 'Tonirok' and org_id = v_org2)
          = 1000000000);

  -- Cheklov musbat bo'lishi kerak
  begin
    insert into public.kassa_klientlar (org_id, ism, turi, cheklov)
    values (v_org2, 'Manfiy', 'hamkor', -5);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'manfiy cheklov rad etiladi', 'ok', v_ok);

  -- Koordinata JUFT bo'lishi kerak: bittasi bo'lsa xarita
  -- nuqtani ekvatorga qo''yib yuborardi.
  begin
    insert into public.kassa_klientlar (org_id, ism, turi, lat)
    values (v_org2, 'Yarim', 'hamkor', 41.31);
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object('nom', 'yarim koordinata rad etiladi', 'ok', v_ok);

  -- Rasmlar ombori
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa-rasm ombori bor va OCHIQ EMAS',
    'ok', exists (select 1 from storage.buckets where id = 'kassa-rasm' and public = false));


  -- ---------- 9. Eski oqim buzilmagan ----------
  -- Profili bor odam «kassa_royxatdan_ot» ni chaqirsa, avvalgidek
  -- rad etilishi kerak: ikki funksiya chalkashib ketmasin.
  begin
    perform public.kassa_royxatdan_ot('YANA BIR');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'HISOB_BOR%';
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'kassa_royxatdan_ot avvalgidek bitta biznesga cheklangan', 'ok', v_ok);

  -- ---------- Hammasini qaytarib olamiz ----------
  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

if (process.argv.includes('--sql')) {
  const chiqish = join(ROOT, 'supabase/sinov/kassa-biznes-sinov.sql');
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

console.log('\n\x1b[1mCLARY — KO‘P BIZNES\x1b[0m\n');

if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kodchi/kalitlar.json topilmadi — sinov o‘tkazib yuborildi.');
  console.log('    SQL ni ko‘rish: node tests/kassa-biznes.mjs --sql\n');
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
  "select count(*) as n from public.organizations where name like 'SINOV-BIZNES%'",
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
