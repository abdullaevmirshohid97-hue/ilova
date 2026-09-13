// =============================================================
//  CREDIT DEBIT — MIJOZNING AI KALITI (BYOK) SINOVI
//
//  Mijoz o'z API kalitini ulaydi (Claude, GPT yoki Gemini) va
//  token puli uning hisobidan ketadi. Kalit — MIJOZNIKI, ya'ni
//  eng maxfiy narsa: u shifrlangan holda yotishi va hech kimga,
//  hatto egasiga ham, qayta ko'rinmasligi kerak.
//
//  Shuning uchun bu sinov aynan shu chegaralarni bosib ko'radi:
//   · kalit jadvalini TENANT o'qiy oladimi (yo'q bo'lishi kerak)
//   · begona tenant ko'ra oladimi (yo'q)
//   · ochish funksiyasi authenticated ga ochiqmi (yo'q)
//   · ilova faqat niqob va provayder nomini oladimi (ha)
//   · noto'g'ri kalit bilan chaqirilganda TUSHUNARLI xato
//     qaytadimi va u «faol emas» deb belgilanadimi
//
//  Ishga tushirish:  node tests/kassa-ai-kalit.mjs
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

const kalitlar = await (await fetch(`${MGMT}/api-keys?reveal=true`, {
  headers: { Authorization: 'Bearer ' + K.mgmt_token },
})).json();
const SK = (kalitlar || []).find((x) => x.type === 'secret' || x.name === 'service_role')?.api_key;

const yaratilgan = { userlar: [], orglar: [] };

async function hisobYarat(belgi) {
  const email = `cd-kalit-${belgi}-${Date.now()}@yukchibolla.com`;
  const parol = 'Sinov12345!';
  const u = await (await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SK, Authorization: 'Bearer ' + SK },
    body: JSON.stringify({ email, password: parol, email_confirm: true, user_metadata: { kassa: 'true' } }),
  })).json();
  yaratilgan.userlar.push(u.id);
  const t = await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ email, password: parol }),
  })).json();
  return { id: u.id, token: t.access_token };
}

const bosh = (t) => ({ 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + t });

async function rpc(token, nom, args) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: bosh(token),
    body: JSON.stringify(args ?? {}),
  });
  return { status: r.status, javob: await r.json().catch(() => null) };
}

// Haqiqiy shakldagi, lekin YOLG'ON kalit — provayder uni rad etadi
const SOXTA = 'sk-ant-api03-' + 'x'.repeat(80);

console.log('\n\x1b[1mCREDIT DEBIT — AI KALITI (BYOK)\x1b[0m');

try {
  console.log('\n1. Tayyorgarlik');

  const a = await hisobYarat('a');
  const orgA = (await rpc(a.token, 'kassa_royxatdan_ot', { p_biznes: 'KALIT-SINOVI A' })).javob;
  yaratilgan.orglar.push(orgA);
  const b = await hisobYarat('b');
  const orgB = (await rpc(b.token, 'kassa_royxatdan_ot', { p_biznes: 'KALIT-SINOVI B' })).javob;
  yaratilgan.orglar.push(orgB);
  tekshir('ikki tenant ochildi', typeof orgA === 'string' && typeof orgB === 'string');

  // ---------------------------------------------------------------
  console.log('\n2. Saqlash va niqob');

  const saqla = await rpc(a.token, 'kassa_ai_kalit_saqla', {
    p_provayder: 'anthropic',
    p_model: 'claude-opus-5',
    p_kalit: SOXTA,
  });
  tekshir('kalit saqlandi', saqla.status === 200, 'HTTP ' + saqla.status);
  tekshir(
    'niqob qaytdi, kalitning o‘zi emas',
    saqla.javob?.niqob?.includes('…') && !String(JSON.stringify(saqla.javob)).includes(SOXTA),
    saqla.javob?.niqob,
  );

  const ol = await rpc(a.token, 'kassa_ai_kalit_ol', {});
  tekshir('ilova provayder va modelni ko‘radi', ol.javob?.provayder === 'anthropic' && ol.javob?.model === 'claude-opus-5');
  tekshir(
    'javobda KALIT YO‘Q',
    !JSON.stringify(ol.javob ?? {}).includes(SOXTA) && (ol.javob?.niqob ?? '').length < 20,
    'faqat niqob: ' + ol.javob?.niqob + ' (' + (ol.javob?.niqob ?? '').length + ' belgi)',
  );

  // ---------------------------------------------------------------
  console.log('\n3. Kalitni o‘qishga urinish');

  const jadval = await fetch(`${BASE}/rest/v1/kassa_ai_kalit?select=*`, { headers: bosh(a.token) });
  const jadvalJavob = await jadval.json().catch(() => null);
  tekshir(
    'EGASI ham jadvalni o‘qiy olmaydi',
    !Array.isArray(jadvalJavob) || jadvalJavob.length === 0,
    Array.isArray(jadvalJavob) ? `${jadvalJavob.length} qator` : 'HTTP ' + jadval.status,
  );

  const begona = await fetch(`${BASE}/rest/v1/kassa_ai_kalit?select=*`, { headers: bosh(b.token) });
  const begonaJavob = await begona.json().catch(() => null);
  tekshir(
    'BEGONA tenant ham ko‘rmaydi',
    !Array.isArray(begonaJavob) || begonaJavob.length === 0,
    Array.isArray(begonaJavob) ? `${begonaJavob.length} qator` : 'HTTP ' + begona.status,
  );

  const ochiq = await rpc(a.token, 'kassa_ai_kalit_ochiq', { p_org: orgA });
  tekshir(
    'ochish funksiyasi authenticated ga YOPIQ',
    ochiq.status >= 400,
    'HTTP ' + ochiq.status,
  );

  const begonaOl = await rpc(b.token, 'kassa_ai_kalit_ol', {});
  tekshir('B o‘z bo‘sh holatini ko‘radi (A niki emas)', !begonaOl.javob, JSON.stringify(begonaOl.javob));

  // Shifrlanganini bazadan tasdiqlaymiz
  const bazada = await sql(`
    select length(kalit_shifr) uzunlik,
           encode(kalit_shifr, 'escape') like '%xxxxxxxx%' as ochiq_turibdi
      from kassa_ai_kalit where org_id = '${orgA}'
  `);
  tekshir('bazada shifrlangan (ochiq matn emas)', bazada[0]?.ochiq_turibdi === false, `${bazada[0]?.uzunlik} bayt`);

  // ---------------------------------------------------------------
  console.log('\n4. Noto‘g‘ri kalit bilan sinov');

  const sinov = await fetch(`${BASE}/functions/v1/kassa-ai`, {
    method: 'POST',
    headers: bosh(a.token),
    body: JSON.stringify({ amal: 'sina' }),
  });
  const sinovJavob = await sinov.json().catch(() => ({}));
  tekshir('yolg‘on kalit rad etildi', sinov.status === 400, 'HTTP ' + sinov.status);
  tekshir(
    'xato TUSHUNARLI (kalit haqida)',
    /kalit|Kalit/.test(sinovJavob?.error ?? ''),
    (sinovJavob?.error ?? '').slice(0, 60),
  );
  tekshir(
    'xato matnida kalitning o‘zi YO‘Q',
    !String(sinovJavob?.error ?? '').includes('xxxx'),
    'sizmadi',
  );

  const keyin = await rpc(a.token, 'kassa_ai_kalit_ol', {});
  tekshir('kalit «faol emas» deb belgilandi', keyin.javob?.faol === false, String(keyin.javob?.faol));
  tekshir('sabab saqlandi', !!keyin.javob?.oxirgi_xato, (keyin.javob?.oxirgi_xato ?? '').slice(0, 40));

  // ---------------------------------------------------------------
  console.log('\n5. Kalitsiz tenant');

  const kalitsiz = await fetch(`${BASE}/functions/v1/kassa-ai`, {
    method: 'POST',
    headers: bosh(b.token),
    body: JSON.stringify({ amal: 'sina' }),
  });
  const kalitsizJavob = await kalitsiz.json().catch(() => ({}));
  tekshir('kalitsiz tenantga tushunarli javob', /KALIT_YOQ/.test(kalitsizJavob?.error ?? ''), (kalitsizJavob?.error ?? '').slice(0, 40));

  // ---------------------------------------------------------------
  console.log('\n6. O‘chirish');

  const ochir = await rpc(a.token, 'kassa_ai_kalit_ochir', {});
  tekshir('kalit o‘chirildi', ochir.status === 200 || ochir.status === 204, 'HTTP ' + ochir.status);
  const qoldi = await sql(`select count(*) n from kassa_ai_kalit where org_id = '${orgA}'`);
  tekshir('bazada qolmadi', Number(qoldi[0].n) === 0, String(qoldi[0].n));
} finally {
  console.log('\n7. Tozalash');
  for (const org of yaratilgan.orglar) {
    if (typeof org !== 'string') continue;
    await sql(`delete from kassa_ai_sarf where org_id = '${org}'`).catch(() => {});
    await sql(`delete from kassa_ai_kalit where org_id = '${org}'`).catch(() => {});
    await sql(`delete from profiles where org_id = '${org}'`).catch(() => {});
    await sql(`delete from uzvliklar where org_id = '${org}'`).catch(() => {});
    await sql(`delete from organizations where id = '${org}'`).catch(() => {});
  }
  for (const u of yaratilgan.userlar) {
    await sql(`delete from auth.users where id = '${u}'`).catch(() => {});
  }
  const qoldi = await sql(`select count(*) n from organizations where name like 'KALIT-SINOVI%'`);
  tekshir('sinov ma’lumoti tozalandi', Number(qoldi[0].n) === 0, `${qoldi[0].n} ta qoldi`);
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
