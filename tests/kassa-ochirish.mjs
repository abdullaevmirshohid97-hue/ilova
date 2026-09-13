// =============================================================
//  CREDIT DEBIT — HISOBNI O'CHIRISH SINOVI
//
//  `kassa-hisob-ochir` loyihadagi eng xavfli chekka funksiya: u
//  ma'lumotni butunlay yo'q qiladi. Shuning uchun bu sinov uning
//  CHEGARALARINI bosib ko'radi — ishlashini emas, ishlamasligi
//  kerak bo'lgan joylarni.
//
//  Nimalar tekshiriladi:
//   · tasdiq matnisiz o'chirmaydi
//   · begona foydalanuvchi id'sini yuborib bo'lmaydi (JWT dan olinadi)
//   · `kassa` bo'lmagan tenant (b2b, dorixona) o'chirilmaydi — u
//     yerda o'nlab odam ishlaydi
//   · tashkilotda ikkinchi odam bo'lsa o'chirilmaydi
//   · o'chirgandan keyin: auth hisobi, tashkilot va uning yozuvlari
//     yo'q; BOSHQA tashkilotning ma'lumoti esa joyida
//
//  Sinov o'zi yaratgan ma'lumotni oxirida tozalaydi.
//
//  Ishga tushirish:  node tests/kassa-ochirish.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let K;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  console.error('\n  kodchi/kalitlar.json topilmadi — bu skript shaxsiy kompyuterda ishlaydi.\n');
  process.exit(1);
}

const BASE = `https://${K.ref}.supabase.co`;
const MGMT = `https://api.supabase.com/v1/projects/${K.ref}`;

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

async function sql(q) {
  const r = await fetch(`${MGMT}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  return j;
}

console.log('\n\x1b[1mCREDIT DEBIT — HISOBNI O‘CHIRISH\x1b[0m');

// ---------- Maxfiy kalit ----------
const kalitlar = await (await fetch(`${MGMT}/api-keys?reveal=true`, {
  headers: { Authorization: 'Bearer ' + K.mgmt_token },
})).json();
const SK = (kalitlar || []).find((x) => x.type === 'secret' || x.name === 'service_role')?.api_key;
if (!SK) {
  console.error('  service_role kaliti olinmadi');
  process.exit(1);
}

const yaratilgan = { userlar: [], orglar: [] };

async function hisobYarat(belgi) {
  const email = `cd-ochirish-${belgi}-${Date.now()}@yukchibolla.com`;
  const parol = 'Sinov12345!';
  const u = await (await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SK, Authorization: 'Bearer ' + SK },
    body: JSON.stringify({ email, password: parol, email_confirm: true, user_metadata: { kassa: 'true' } }),
  })).json();
  if (!u.id) throw new Error('hisob yaratilmadi: ' + JSON.stringify(u).slice(0, 150));
  yaratilgan.userlar.push(u.id);
  const t = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ email, password: parol }),
  })).json();
  return { id: u.id, email, token: t.access_token };
}

function bosh(token) {
  return { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token };
}

async function ochir(token, tana) {
  const r = await fetch(`${BASE}/functions/v1/kassa-hisob-ochir`, {
    method: 'POST',
    headers: bosh(token),
    body: JSON.stringify(tana ?? {}),
  });
  return { status: r.status, javob: await r.json().catch(() => ({})) };
}

try {
  // =============================================================
  // 1. Sinov tenanti
  // =============================================================
  console.log('\n1. Tayyorgarlik');

  const a = await hisobYarat('a');
  const orgA = await (await fetch(`${BASE}/rest/v1/rpc/kassa_royxatdan_ot`, {
    method: 'POST',
    headers: bosh(a.token),
    body: JSON.stringify({ p_biznes: 'OCHIRISH-SINOVI A' }),
  })).json();
  yaratilgan.orglar.push(orgA);
  tekshir('sinov tashkiloti ochildi', typeof orgA === 'string', String(orgA).slice(0, 8));

  const hisoblar = await (await fetch(`${BASE}/rest/v1/kassa_hisoblar?select=id&limit=1`, {
    headers: bosh(a.token),
  })).json();
  await fetch(`${BASE}/rest/v1/kassa_yozuvlar`, {
    method: 'POST',
    headers: bosh(a.token),
    body: JSON.stringify({ hisob_id: hisoblar[0].id, turi: 'chiqim', summa: '250000.00', izoh: 'sinov' }),
  });
  const yozuvSoni = (await sql(`select count(*) n from kassa_yozuvlar where org_id = '${orgA}'`))[0].n;
  tekshir('yozuv qo‘shildi', Number(yozuvSoni) === 1, `${yozuvSoni} ta`);

  // Ikkinchi tenant — u TEGILMASLIGI kerak
  const b = await hisobYarat('b');
  const orgB = await (await fetch(`${BASE}/rest/v1/rpc/kassa_royxatdan_ot`, {
    method: 'POST',
    headers: bosh(b.token),
    body: JSON.stringify({ p_biznes: 'OCHIRISH-SINOVI B' }),
  })).json();
  yaratilgan.orglar.push(orgB);

  // =============================================================
  // 2. Chegaralar
  // =============================================================
  console.log('\n2. Chegaralar');

  const tasdiqsiz = await ochir(a.token, {});
  tekshir('tasdiq matnisiz o‘chirmaydi', tasdiqsiz.status === 400, 'HTTP ' + tasdiqsiz.status);

  const notogri = await ochir(a.token, { tasdiq: 'ha' });
  tekshir('noto‘g‘ri tasdiq ham o‘tmaydi', notogri.status === 400, 'HTTP ' + notogri.status);

  // Boshqa odamning id'sini yuborish — funksiya uni O'QIMAYDI
  const begona = await ochir(a.token, { tasdiq: 'OCHIRISH', user_id: b.id, org_id: orgB });
  const bHali = (await sql(`select count(*) n from organizations where id = '${orgB}'`))[0].n;
  tekshir(
    'tanadagi begona id e’tiborsiz qoldirildi',
    Number(bHali) === 1,
    Number(bHali) === 1 ? 'B tegilmadi' : 'B O‘CHDI — XAVF',
  );
  tekshir('A ning o‘zi o‘chdi (JWT bo‘yicha)', begona.status === 200, 'HTTP ' + begona.status);

  // Tokensiz
  const tokensiz = await fetch(`${BASE}/functions/v1/kassa-hisob-ochir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasdiq: 'OCHIRISH' }),
  });
  tekshir('tokensiz so‘rov rad etiladi', tokensiz.status === 401, 'HTTP ' + tokensiz.status);

  // =============================================================
  // 3. A o'chdimi, B joyidami
  // =============================================================
  console.log('\n3. Natija');

  const holat = await sql(`
    select
      (select count(*) from auth.users where id = '${a.id}')                as user_a,
      (select count(*) from organizations where id = '${orgA}')             as org_a,
      (select count(*) from kassa_yozuvlar where org_id = '${orgA}')        as yozuv_a,
      (select count(*) from kassa_hisoblar where org_id = '${orgA}')        as hisob_a,
      (select count(*) from profiles where org_id = '${orgA}')              as profil_a,
      (select count(*) from organizations where id = '${orgB}')             as org_b,
      (select count(*) from kassa_hisoblar where org_id = '${orgB}')        as hisob_b
  `);
  const h = holat[0];
  tekshir('auth hisobi o‘chdi', Number(h.user_a) === 0, h.user_a);
  tekshir('tashkilot o‘chdi', Number(h.org_a) === 0, h.org_a);
  tekshir('yozuvlar o‘chdi (kaskad)', Number(h.yozuv_a) === 0, h.yozuv_a);
  tekshir('hisoblar o‘chdi (kaskad)', Number(h.hisob_a) === 0, h.hisob_a);
  tekshir('profil o‘chdi', Number(h.profil_a) === 0, h.profil_a);
  tekshir('BOSHQA tenant joyida', Number(h.org_b) === 1 && Number(h.hisob_b) === 2, `org ${h.org_b}, hisob ${h.hisob_b}`);

  // =============================================================
  // 4. kassa bo'lmagan tenant himoyalangan
  // =============================================================
  console.log('\n4. Boshqa yo‘nalishdagi tenant');

  // B ni b2b ga o'tkazamiz — endi u Credit Debit tenanti emas
  await sql(`update organizations set yonalishlar = array['b2b'] where id = '${orgB}'`);
  const b2b = await ochir(b.token, { tasdiq: 'OCHIRISH' });
  const bQoldi = (await sql(`select count(*) n from organizations where id = '${orgB}'`))[0].n;
  tekshir('b2b tenanti o‘chirilmaydi', b2b.status === 403, 'HTTP ' + b2b.status);
  tekshir('u joyida qoldi', Number(bQoldi) === 1, bQoldi);

  // =============================================================
  // 5. Ikkinchi odam bo'lsa — o'chirilmaydi
  // =============================================================
  console.log('\n5. Yakka bo‘lmagan tashkilot');

  await sql(`update organizations set yonalishlar = array['kassa'] where id = '${orgB}'`);
  const c = await hisobYarat('c');
  await sql(`
    insert into profiles (id, full_name, org_id, role)
    values ('${c.id}', 'Ikkinchi odam', '${orgB}', 'admin')
  `);
  const kopOdam = await ochir(b.token, { tasdiq: 'OCHIRISH' });
  const bYana = (await sql(`select count(*) n from organizations where id = '${orgB}'`))[0].n;
  tekshir('ikkinchi profil bo‘lsa o‘chirilmaydi', kopOdam.status === 403, 'HTTP ' + kopOdam.status);
  tekshir('tashkilot joyida', Number(bYana) === 1, bYana);
} finally {
  // ---------- Tozalash ----------
  console.log('\n6. Tozalash');
  for (const org of yaratilgan.orglar) {
    if (typeof org !== 'string') continue;
    await sql(`delete from profiles where org_id = '${org}'`).catch(() => {});
    await sql(`delete from uzvliklar where org_id = '${org}'`).catch(() => {});
    await sql(`delete from organizations where id = '${org}'`).catch(() => {});
  }
  for (const u of yaratilgan.userlar) {
    await sql(`delete from auth.users where id = '${u}'`).catch(() => {});
  }
  const qoldi = await sql(`
    select count(*) n from organizations where name like 'OCHIRISH-SINOVI%'
  `);
  tekshir('sinov ma’lumoti tozalandi', Number(qoldi[0].n) === 0, `${qoldi[0].n} ta qoldi`);
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
