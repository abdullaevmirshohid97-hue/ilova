// =============================================================
//  CREDIT DEBIT — SINXRONIZATSIYA: HAQIQIY BAZA BILAN
//
//  `tests/kassa-sinx.mjs` dvigatelni SOXTA server bilan sinaydi —
//  u yerda mantiq tekshiriladi. Bu yerda esa boshqa savol:
//  serverning o'zi dvigatel kutgandek javob beradimi?
//
//  Ikkalasi kerak. Soxta server "shunday bo'lishi kerak" deb
//  yozilgan; haqiqiy Postgres esa boshqacha javob berishi mumkin
//  va bu farq faqat foydalanuvchida ko'rinardi.
//
//  Tekshiriladi:
//   · kassa_ozgarishlar kursor bo'yicha qator tushirib qoldirmaydi
//   · BOSHQA tenantning qatorlari kelmaydi (RPC ham RLS ostida)
//   · bir id ikki marta yuborilsa 23505 (dvigatel buni "ok" deb biladi)
//   · versiya mos kelmasa 0 qator yangilanadi (ziddiyat)
//   · bekor qilingan yozuv ham o'zgarish sifatida keladi
//
//  Sinov o'zi yaratgan ma'lumotni oxirida tozalaydi.
//
//  Ishga tushirish:  node tests/kassa-sinx-baza.mjs
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
if (!SK) {
  console.error('  service_role kaliti olinmadi');
  process.exit(1);
}

console.log('\n\x1b[1mCREDIT DEBIT — SINX (HAQIQIY BAZA)\x1b[0m');

const yaratilgan = { userlar: [], orglar: [] };

async function hisobYarat(belgi) {
  const email = `cd-sinx-${belgi}-${Date.now()}@yukchibolla.com`;
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
  return { id: u.id, token: t.access_token };
}

const bosh = (t) => ({
  'Content-Type': 'application/json',
  apikey: K.anon_key,
  Authorization: 'Bearer ' + t,
});

async function rpc(token, nom, args) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: bosh(token),
    body: JSON.stringify(args ?? {}),
  });
  return { status: r.status, javob: await r.json().catch(() => null) };
}

/** uuid — mijoz qanday yaratsa, shunday */
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

try {
  console.log('\n1. Tayyorgarlik');

  const a = await hisobYarat('a');
  const orgA = (await rpc(a.token, 'kassa_royxatdan_ot', { p_biznes: 'SINX-SINOVI A' })).javob;
  yaratilgan.orglar.push(orgA);
  const b = await hisobYarat('b');
  const orgB = (await rpc(b.token, 'kassa_royxatdan_ot', { p_biznes: 'SINX-SINOVI B' })).javob;
  yaratilgan.orglar.push(orgB);
  tekshir('ikki tenant ochildi', typeof orgA === 'string' && typeof orgB === 'string');

  // ---------------------------------------------------------------
  console.log('\n2. Boshlang‘ich holat');

  const nol = (await rpc(a.token, 'kassa_ozgarishlar', { p_kursor: 0 })).javob;
  tekshir(
    'ro‘yxatdan o‘tishdagi hisob va turkumlar keldi',
    nol.hisoblar.length === 2 && nol.turkumlar.length === 10,
    `${nol.hisoblar.length} hisob, ${nol.turkumlar.length} turkum`,
  );
  tekshir('kursor 0 dan katta', Number(nol.kursor) > 0, String(nol.kursor));
  tekshir('yana yo‘q (hammasi sig‘di)', nol.yana === false);

  // ---------------------------------------------------------------
  console.log('\n3. Begona tenant ko‘rinmaydi');

  const bNiki = (await rpc(b.token, 'kassa_ozgarishlar', { p_kursor: 0 })).javob;
  const aHisobIdlari = new Set(nol.hisoblar.map((h) => h.id));
  const kesishma = bNiki.hisoblar.filter((h) => aHisobIdlari.has(h.id));
  tekshir('B ning javobida A ning hisobi yo‘q', kesishma.length === 0, `${kesishma.length} ta umumiy`);
  tekshir(
    'B o‘z hisoblarini ko‘rdi',
    bNiki.hisoblar.length === 2,
    `${bNiki.hisoblar.length} ta`,
  );

  // ---------------------------------------------------------------
  console.log('\n4. Yozuv qo‘shish (mijoz id bilan)');

  const hisobId = nol.hisoblar[0].id;
  const yozuvId = uuid();
  const qosh = await fetch(`${BASE}/rest/v1/kassa_yozuvlar`, {
    method: 'POST',
    headers: bosh(a.token),
    body: JSON.stringify({ id: yozuvId, hisob_id: hisobId, turi: 'chiqim', summa: '125000.50' }),
  });
  tekshir('mijoz yaratgan id bilan yozildi', qosh.status === 201, 'HTTP ' + qosh.status);

  const takror = await fetch(`${BASE}/rest/v1/kassa_yozuvlar`, {
    method: 'POST',
    headers: bosh(a.token),
    body: JSON.stringify({ id: yozuvId, hisob_id: hisobId, turi: 'chiqim', summa: '125000.50' }),
  });
  const takrorJavob = await takror.json().catch(() => ({}));
  tekshir(
    'takroriy id 23505 beradi (dvigatel buni «ok» deb biladi)',
    takrorJavob?.code === '23505',
    takrorJavob?.code ?? 'HTTP ' + takror.status,
  );

  const keyin = (await rpc(a.token, 'kassa_ozgarishlar', { p_kursor: nol.kursor })).javob;
  tekshir('yangi yozuv o‘zgarishlarda keldi', keyin.yozuvlar.length === 1, `${keyin.yozuvlar.length} ta`);
  tekshir('eski qatorlar qayta kelmadi', keyin.hisoblar.length === 0 && keyin.turkumlar.length === 0);
  tekshir('summa kasri saqlandi', keyin.yozuvlar[0]?.summa === '125000.50', String(keyin.yozuvlar[0]?.summa));
  tekshir('versiya 1', Number(keyin.yozuvlar[0]?.versiya) === 1);

  // ---------------------------------------------------------------
  console.log('\n5. Tahrir va ziddiyat');

  const tahrir = await fetch(
    `${BASE}/rest/v1/kassa_yozuvlar?id=eq.${yozuvId}&versiya=eq.1&select=id`,
    { method: 'PATCH', headers: { ...bosh(a.token), Prefer: 'return=representation' }, body: JSON.stringify({ izoh: 'tuzatildi' }) },
  );
  const tahrirQator = await tahrir.json().catch(() => []);
  tekshir('to‘g‘ri versiya bilan tahrir o‘tdi', tahrirQator.length === 1, `${tahrirQator.length} qator`);

  const eskiVersiya = await fetch(
    `${BASE}/rest/v1/kassa_yozuvlar?id=eq.${yozuvId}&versiya=eq.1&select=id`,
    { method: 'PATCH', headers: { ...bosh(a.token), Prefer: 'return=representation' }, body: JSON.stringify({ izoh: 'ikkinchi qurilma' }) },
  );
  const eskiQator = await eskiVersiya.json().catch(() => []);
  tekshir(
    'ESKI versiya bilan tahrir 0 qator (ziddiyat)',
    eskiQator.length === 0,
    `${eskiQator.length} qator`,
  );

  const tekshirYozuv = await (await fetch(
    `${BASE}/rest/v1/kassa_yozuvlar?id=eq.${yozuvId}&select=izoh,versiya`,
    { headers: bosh(a.token) },
  )).json();
  tekshir('serverdagi qiymat birinchi tahrirdan qoldi', tekshirYozuv[0]?.izoh === 'tuzatildi', tekshirYozuv[0]?.izoh);
  tekshir('versiya 2 ga o‘sdi', Number(tekshirYozuv[0]?.versiya) === 2, String(tekshirYozuv[0]?.versiya));

  // ---------------------------------------------------------------
  console.log('\n6. Kursor: qator tushib qolmaydi');

  // Chegarani 2 ga tushirib, ko'p qator qo'shamiz
  const oldingi = (await rpc(a.token, 'kassa_ozgarishlar', { p_kursor: 0 })).javob.kursor;
  const yangiIdlar = [];
  for (let i = 0; i < 7; i++) {
    const id = uuid();
    yangiIdlar.push(id);
    await fetch(`${BASE}/rest/v1/kassa_yozuvlar`, {
      method: 'POST',
      headers: bosh(a.token),
      body: JSON.stringify({ id, hisob_id: hisobId, turi: 'kirim', summa: `${1000 + i}.00` }),
    });
  }

  // Dvigatel qanday qilsa — shunday: paket-paket, kursorni surib
  const kelgan = new Set();
  let kursor = oldingi;
  for (let aylanish = 0; aylanish < 20; aylanish++) {
    const j = (await rpc(a.token, 'kassa_ozgarishlar', { p_kursor: kursor, p_chegara: 2 })).javob;
    for (const y of j.yozuvlar) kelgan.add(y.id);
    kursor = j.kursor;
    if (!j.yana) break;
  }
  const yetmagan = yangiIdlar.filter((id) => !kelgan.has(id));
  tekshir(
    'chegara 2 bo‘lsa ham hamma yozuv keldi',
    yetmagan.length === 0,
    yetmagan.length ? `${yetmagan.length} ta YO‘QOLDI` : `${kelgan.size} ta`,
  );

  // ---------------------------------------------------------------
  console.log('\n7. Bekor qilish ham o‘zgarish');

  const oldinBekor = (await rpc(a.token, 'kassa_ozgarishlar', { p_kursor: 0 })).javob.kursor;
  await fetch(`${BASE}/rest/v1/kassa_yozuvlar?id=eq.${yozuvId}`, {
    method: 'PATCH',
    headers: bosh(a.token),
    body: JSON.stringify({ bekor_at: new Date().toISOString(), bekor_sabab: 'sinov' }),
  });
  const bekorJavob = (await rpc(a.token, 'kassa_ozgarishlar', { p_kursor: oldinBekor })).javob;
  tekshir(
    'bekor qilingan yozuv o‘zgarish bo‘lib keldi',
    bekorJavob.yozuvlar.some((y) => y.id === yozuvId && y.bekor_at),
    `${bekorJavob.yozuvlar.length} ta o‘zgarish`,
  );

  // ---------------------------------------------------------------
  console.log('\n8. Qurilma kursori');

  const qurilma = uuid();
  const saqla = await rpc(a.token, 'kassa_qurilma_kursor', {
    p_qurilma: qurilma,
    p_kursor: 12345,
    p_platforma: 'sinov',
  });
  tekshir('kursor serverda saqlandi', saqla.status === 200 || saqla.status === 204, 'HTTP ' + saqla.status);

  const bazada = await sql(`select oxirgi_kursor from kassa_qurilmalar where id = '${qurilma}'`);
  tekshir('bazada ko‘rinadi', Number(bazada[0]?.oxirgi_kursor) === 12345, String(bazada[0]?.oxirgi_kursor));

  // Orqaga surilmaydi
  await rpc(a.token, 'kassa_qurilma_kursor', { p_qurilma: qurilma, p_kursor: 999 });
  const keyingi = await sql(`select oxirgi_kursor from kassa_qurilmalar where id = '${qurilma}'`);
  tekshir(
    'kursor ORQAGA surilmaydi',
    Number(keyingi[0]?.oxirgi_kursor) === 12345,
    String(keyingi[0]?.oxirgi_kursor),
  );

  // B ning qurilmalari A ga ko'rinmaydi
  const bQurilma = await (await fetch(`${BASE}/rest/v1/kassa_qurilmalar?select=id`, {
    headers: bosh(b.token),
  })).json();
  tekshir('B begona qurilmani ko‘rmaydi', Array.isArray(bQurilma) && bQurilma.length === 0, JSON.stringify(bQurilma).slice(0, 40));
} finally {
  console.log('\n9. Tozalash');
  for (const org of yaratilgan.orglar) {
    if (typeof org !== 'string') continue;
    await sql(`delete from profiles where org_id = '${org}'`).catch(() => {});
    await sql(`delete from uzvliklar where org_id = '${org}'`).catch(() => {});
    await sql(`delete from organizations where id = '${org}'`).catch(() => {});
  }
  for (const u of yaratilgan.userlar) {
    await sql(`delete from auth.users where id = '${u}'`).catch(() => {});
  }
  const qoldi = await sql(`select count(*) n from organizations where name like 'SINX-SINOVI%'`);
  tekshir('sinov ma’lumoti tozalandi', Number(qoldi[0].n) === 0, `${qoldi[0].n} ta qoldi`);
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
