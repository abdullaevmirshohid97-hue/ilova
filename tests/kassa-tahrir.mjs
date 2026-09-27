// =============================================================
//  CLARY — TASDIQLANGAN OPERATSIYANI TAHRIRLASH CHEKLOVI
//
//  Ilovada tahrirlash bor: sana, vaqt, izoh. Lekin tasdiqlangan
//  bitimning PULI o'zgarmasligi kerak, aks holda tasdiq o'z
//  ma'nosini yo'qotadi: hamkor 1 200 000 ni tasdiqlaydi,
//  do'kondor 2 000 000 qiladi, tarixda esa «tasdiqlangan» deb
//  turadi.
//
//  Cheklov BAZADA, UI da emas: sinx PostgREST orqali
//  to'g'ridan-to'g'ri update yuboradi, ya'ni ekranni chetlab
//  o'tish mumkin.
//
//  Hammasi BITTA do blokida va oxirida QAYTARIB OLINADI.
//
//  Ishga tushirish:  node tests/kassa-tahrir.mjs
//  SQL ni ko'rish:   node tests/kassa-tahrir.mjs --sql
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
  v_org uuid; v_user uuid; v_hamkor uuid; v_hisob uuid;
  v_kut uuid; v_tas uuid; v_tolov uuid;
  v_ok boolean; v_n jsonb := '[]'::jsonb;
  v_summa numeric; v_izoh text;
begin
  insert into public.organizations (name, subscription_status, yonalishlar)
  values ('SINOV-TAHRIR ' || gen_random_uuid(), 'active', array['kassa'])
  returning id into v_org;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sinov-tahrir-' || gen_random_uuid() || '@clary.test', '',
    now(), now(), now(), '{}'::jsonb, '{"kassa":"true"}'::jsonb
  ) returning id into v_user;

  insert into public.profiles (id, role, org_id, full_name)
  values (v_user, 'admin', v_org, 'Sinov admin');

  insert into public.kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
  values (v_org, 'Naqd', 'naqd', 'UZS', 0) returning id into v_hisob;

  insert into public.kassa_klientlar (org_id, ism, turi)
  values (v_org, 'Sinov hamkor', 'hamkor') returning id into v_hamkor;

  -- Ikki bitim: biri kutilmoqda, biri tasdiqlangan
  insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, tovar_nom, summa)
  values (v_org, v_hamkor, 'berdim', 'tovar', 'Karobka', 1200000)
  returning id into v_kut;

  insert into public.kassa_bitimlar (org_id, klient_id, yonalish, nima, tovar_nom, summa, holat)
  values (v_org, v_hamkor, 'berdim', 'tovar', 'Shakar', 1200000, 'tasdiqlangan')
  returning id into v_tas;

  insert into public.kassa_bitim_tolovlar (org_id, klient_id, yonalish, summa, holat)
  values (v_org, v_hamkor, 'oldim', 500000, 'tasdiqlangan')
  returning id into v_tolov;

  -- ---------- 1. KUTILMOQDA — hammasi mumkin ----------
  begin
    update public.kassa_bitimlar set summa = 999999 where id = v_kut;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'kutilmoqda: summa o''zgaradi', 'ok', v_ok);

  begin
    update public.kassa_bitimlar set sana = now() - interval '3 days' where id = v_kut;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'kutilmoqda: sana o''zgaradi', 'ok', v_ok);

  -- ---------- 2. TASDIQLANGAN — pul o'zgarmaydi ----------
  begin
    update public.kassa_bitimlar set summa = 2000000 where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: summa RAD etiladi', 'ok', v_ok);

  select summa into v_summa from public.kassa_bitimlar where id = v_tas;
  v_n := v_n || jsonb_build_object(
    'nom', 'summa haqiqatan o''zgarmagan',
    'ok', v_summa = 1200000, 'izoh', v_summa::text);

  begin
    update public.kassa_bitimlar set sana = now() - interval '5 days' where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: sana RAD etiladi', 'ok', v_ok);

  begin
    update public.kassa_bitimlar set yonalish = 'oldim' where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: yo''nalish RAD etiladi', 'ok', v_ok);

  -- NULL li ustun: cheklov "is distinct from" bilan yozilgan.
  -- Oddiy tengsizlik bilan yozilsa, NULL dan qiymatga o'tish
  -- jimgina o'tib ketardi.
  begin
    update public.kassa_bitimlar set miqdor = 50 where id = v_tas;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: NULL dan qiymatga ham RAD etiladi', 'ok', v_ok);

  -- ---------- 3. TASDIQLANGAN — izoh va muddat MUMKIN ----------
  begin
    update public.kassa_bitimlar set izoh = 'Akasi kelib to''laydi' where id = v_tas;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: izoh MUMKIN', 'ok', v_ok);

  select izoh into v_izoh from public.kassa_bitimlar where id = v_tas;
  v_n := v_n || jsonb_build_object(
    'nom', 'izoh haqiqatan yozildi',
    'ok', v_izoh is not null, 'izoh', coalesce(v_izoh, 'null'));

  begin
    update public.kassa_bitimlar set muddat = current_date + 10 where id = v_tas;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TASDIQLANGAN: muddat MUMKIN', 'ok', v_ok);

  -- ---------- 4. HOLAT o'zgarishi to'siqdan O'TADI ----------
  -- Busiz tasdiq va bekor qilish tugmalarining o'zi ishlamasdi.
  begin
    update public.kassa_bitimlar
       set holat = 'bekor', bekor_sabab = 'sinov'
     where id = v_tas;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'holat o''zgarishi to''sib qo''yilmaydi', 'ok', v_ok);

  -- ---------- 5. TO'LOV uchun ham ----------
  begin
    update public.kassa_bitim_tolovlar set summa = 700000 where id = v_tolov;
    v_ok := false;
  exception when others then
    v_ok := true;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TO''LOV tasdiqlangan: summa RAD etiladi', 'ok', v_ok);

  begin
    update public.kassa_bitim_tolovlar set izoh = 'qayd' where id = v_tolov;
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_n := v_n || jsonb_build_object(
    'nom', 'TO''LOV tasdiqlangan: izoh MUMKIN', 'ok', v_ok);

  raise exception 'SINOV_NATIJA: %', v_n::text;
end $$;
`;

if (process.argv.includes('--sql')) {
  const chiqish = join(ROOT, 'supabase/sinov/kassa-tahrir-sinov.sql');
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

console.log('\n\x1b[1mCLARY — TAHRIR CHEKLOVI\x1b[0m\n');

if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kodchi/kalitlar.json topilmadi — sinov o‘tkazib yuborildi.');
  console.log('    SQL ni ko‘rish: node tests/kassa-tahrir.mjs --sql\n');
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


// =============================================================
//  EKRAN TOMONI
//
//  Baza cheklovi ishlaydi, lekin ekran ham to'g'ri qurilgan
//  bo'lishi kerak. Bu tekshiruvlar faylni O'QIB ko'radi — ular
//  bazaga tegmaydi va tokensiz ham yuriladi.
// =============================================================

console.log('\n\x1b[1m6. Ekran tomoni\x1b[0m');

const OYNA = readFileSync(join(ROOT, 'apps/kassa/src/ekran/OperatsiyaOynasi.tsx'), 'utf8');
const BOSH = readFileSync(join(ROOT, 'apps/kassa/src/ekran/BoshEkran.tsx'), 'utf8');
const BAZA = readFileSync(join(ROOT, 'apps/kassa/src/lib/baza.ts'), 'utf8');
const SUPA = readFileSync(join(ROOT, 'apps/kassa/src/lib/supabase.ts'), 'utf8');

// Serverning xato kodi tushunarli matnga aylanishi shart. Aylanmasa
// odam «TASDIQLANGAN_OZGARMAYDI» degan yozuvni ko'rardi.
tekshir(
  'TASDIQLANGAN_OZGARMAYDI matnga aylanadi',
  /TASDIQLANGAN_OZGARMAYDI/.test(SUPA) && /Tasdiqlangan operatsiyaning summasi/.test(SUPA),
  'xatoMatn',
);

// Bo'sh patch yuborilmasin: «versiya» bekorga o'sardi va har
// qurilma bitta ortiqcha tortish qilardi (rejaning 5.4 bandi).
for (const f of ['bitimTahrirla', 'tolovTahrirla']) {
  const m = BAZA.match(new RegExp('export async function ' + f + '\\([\\s\\S]*?\\n}'));
  tekshir(f + ' bor', m !== null);
  if (m) {
    tekshir(
      f + ': bo‘sh patch yuborilmaydi',
      /Object\.keys\(patch\)\.length === 0\) return;/.test(m[0]),
      'ortiqcha versiya o‘smaydi',
    );
  }
}

// Summa suzuvchi nuqtadan o'tmasin: «12.34 * 100» 1233.99... beradi.
tekshir(
  'oynada pul suzuvchi nuqtaga aylanmaydi',
  !/Number\(boshlangich\.summa\)\s*\*\s*100/.test(OYNA) && /boshlangich\.tiyin/.test(OYNA),
  'asl tiyin saqlanadi',
);

// Tasdiqlangan operatsiyada summa, sana va vaqt maydonlari yopiladi.
// Bu himoya EMAS (himoya bazada), lekin odam bekorga yozmasin.
tekshir(
  'tasdiqlanganda summa, sana, vaqt yopiladi',
  (OYNA.match(/editable={kutilmoqda}/g) ?? []).length >= 3,
  (OYNA.match(/editable={kutilmoqda}/g) ?? []).length + ' ta maydon',
);

// Tasdiqlangan operatsiyada SABAB yoziladi. Yozilmasa odam
// maydon nega ishlamayotganini bilmaydi va ilovani buzuq deydi.
tekshir(
  'tasdiqlanganda sabab yoziladi',
  /!kutilmoqda && boshlangich && \(/.test(OYNA) && /Bu operatsiya tasdiqlangan/.test(OYNA),
  'ogohlantirish',
);

// O'zgarish bo'lmasa saqlash ishlamaydi (rejaning 5.4 bandi).
tekshir(
  'o‘zgarishsiz saqlanmaydi',
  /if \(!qator \|\| !boshlangich \|\| !ozgardi\) return;/.test(OYNA),
  'saqla() qaytadi',
);

// Daftar yozuvi BU oynada emas: uning o'z oynasi bor va u hisob,
// turkum, o'tkazmani ham biladi. Ikki joyda tahrirlash ikki xil
// qoida yasardi.
tekshir(
  'daftar yozuvi o‘z oynasiga boradi',
  /if \(q\.tur === 'yozuv'\) \{\s*\n\s*tahrirYozuv\(q\.yozuv\);/.test(BOSH),
  'BoshEkran → tahrirYozuv',
);

// To'lov qatori ham menyu ochishi kerak: ilgari faqat bitim
// ishlardi va to'lovni bosgan odam hech narsa ko'rmasdi.
tekshir(
  'to‘lov qatori ham menyu ochadi',
  /if \(q\.tur === 'tolov'\) \{/.test(BOSH) && /q\.tolov\.summa/.test(BOSH),
  'amallarKorsat',
);

// Yo'q kun rad etilsin: «new Date(2026, 1, 31)» 3-martga siljiydi
// va odam yozgan sanadan boshqasini olardi.
tekshir(
  'yo‘q kun rad etiladi',
  /d\.getMonth\(\) !== Number\(s\[2\]\) - 1 \|\| d\.getDate\(\) !== Number\(s\[3\]\)/.test(OYNA),
  'isoYasa',
);

const qoldi = await sqlXom(
  "select count(*) as n from public.organizations where name like 'SINOV-TAHRIR%'",
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
