// =============================================================
//  CREDIT DEBIT — MCP SERVERI SINOVI
//
//  MCP — bu AI agent uchun ochilgan ESHIK. U internetda turadi va
//  unga Supabase JWT emas, bizning tokenimiz bilan kiriladi. Ya'ni
//  chekka funksiya `service_role` bilan ishlaydi va RLS CHETLAB
//  O'TILADI — org filtri qo'lda yozilgan.
//
//  Shuning uchun bu sinovning asosiy savoli bitta: A ning tokeni
//  bilan B ning pulini ko'rib bo'ladimi?
//
//  Yana tekshiriladi:
//   · tokensiz hech narsa ko'rinmaydi
//   · faqat o'qish huquqli token YOZOLMAYDI
//   · yozish tokeni ham TASDIQSIZ yozmaydi (quruq sinov)
//   · o'chirilgan token ishlamaydi
//   · har chaqiruv jurnalga tushadi
//
//  Ishga tushirish:  node tests/kassa-mcp.mjs
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
const MCP = `${BASE}/functions/v1/kassa-mcp`;
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
  const email = `cd-mcp-${belgi}-${Date.now()}@yukchibolla.com`;
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
  return r.json().catch(() => null);
}

/** MCP so'rovi — mijoz qanday yuborsa, shunday */
let raqam = 0;
async function mcp(token, method, params) {
  const r = await fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++raqam, method, params }),
  });
  return { status: r.status, javob: await r.json().catch(() => null) };
}

const matni = (j) => (j?.result?.content ?? []).map((c) => c.text).join('\n');

console.log('\n\x1b[1mCREDIT DEBIT — MCP SERVERI\x1b[0m');

try {
  // =============================================================
  console.log('\n1. Tayyorgarlik');

  const a = await hisobYarat('a');
  const orgA = await rpc(a.token, 'kassa_royxatdan_ot', { p_biznes: 'MCP-SINOVI A' });
  yaratilgan.orglar.push(orgA);
  const b = await hisobYarat('b');
  const orgB = await rpc(b.token, 'kassa_royxatdan_ot', { p_biznes: 'MCP-SINOVI B' });
  yaratilgan.orglar.push(orgB);

  // A ga 250 000 chiqim, B ga 999 999 kirim — ular aralashmasligi kerak
  const hA = (await (await fetch(`${BASE}/rest/v1/kassa_hisoblar?select=id&limit=1`, { headers: bosh(a.token) })).json())[0];
  const hB = (await (await fetch(`${BASE}/rest/v1/kassa_hisoblar?select=id&limit=1`, { headers: bosh(b.token) })).json())[0];
  await fetch(`${BASE}/rest/v1/kassa_yozuvlar`, {
    method: 'POST', headers: bosh(a.token),
    body: JSON.stringify({ hisob_id: hA.id, turi: 'chiqim', summa: '250000.00', izoh: 'A ning ijarasi' }),
  });
  await fetch(`${BASE}/rest/v1/kassa_yozuvlar`, {
    method: 'POST', headers: bosh(b.token),
    body: JSON.stringify({ hisob_id: hB.id, turi: 'kirim', summa: '999999.00', izoh: 'B ning siri' }),
  });

  const tokenA = await rpc(a.token, 'kassa_token_yarat', { p_nom: 'Sinov (o‘qish)' });
  tekshir('token yaratildi', typeof tokenA?.token === 'string' && tokenA.token.startsWith('cd_'), tokenA?.prefiks);
  tekshir(
    'token matni bazada SAQLANMAYDI',
    (await sql(`select count(*) n from kassa_tokenlar where xesh = '${tokenA.token}'`))[0].n === '0' ||
      Number((await sql(`select count(*) n from kassa_tokenlar where xesh = '${tokenA.token}'`))[0].n) === 0,
    'faqat xesh turadi',
  );

  // =============================================================
  console.log('\n2. Protokol');

  const init = await mcp(null, 'initialize', {});
  tekshir('initialize tokensiz ham javob beradi', init.javob?.result?.protocolVersion !== undefined, init.javob?.result?.protocolVersion);
  tekshir('server nomi bor', init.javob?.result?.serverInfo?.name === 'credit-debit');
  tekshir(
    'yo‘riqnomada tasdiq qoidasi bor',
    /TASDIQ/i.test(init.javob?.result?.instructions ?? ''),
    'model tasdiqsiz yozmasligi aytilgan',
  );

  const ping = await mcp(null, 'ping', {});
  tekshir('ping ishlaydi', ping.javob?.result !== undefined);

  // =============================================================
  console.log('\n3. Tokensiz — eshik yopiq');

  const royxatsiz = await mcp(null, 'tools/list', {});
  tekshir('tokensiz tools/list rad etiladi', royxatsiz.javob?.error?.code === -32001, JSON.stringify(royxatsiz.javob?.error?.code));

  const chaqiruvsiz = await mcp(null, 'tools/call', { name: 'qoldiq_ol', arguments: {} });
  tekshir('tokensiz tools/call rad etiladi', chaqiruvsiz.javob?.error?.code === -32001);

  const yolgon = await mcp('cd_' + 'f'.repeat(40), 'tools/list', {});
  tekshir('yolg‘on token ham o‘tmaydi', yolgon.javob?.error?.code === -32001);

  // =============================================================
  console.log('\n4. Asboblar ro‘yxati');

  const royxat = await mcp(tokenA.token, 'tools/list', {});
  const asboblar = (royxat.javob?.result?.tools ?? []).map((x) => x.name);
  tekshir('asboblar keldi', asboblar.length >= 5, asboblar.join(', '));
  tekshir(
    'faqat o‘qish tokenida `yozuv_yarat` KO‘RINMAYDI',
    !asboblar.includes('yozuv_yarat'),
    asboblar.includes('yozuv_yarat') ? 'KO‘RINDI — xavf' : 'ko‘rinmadi',
  );

  // =============================================================
  console.log('\n5. Ma’lumot — faqat o‘ziniki');

  const qoldiq = await mcp(tokenA.token, 'tools/call', { name: 'qoldiq_ol', arguments: {} });
  const qoldiqMatn = matni(qoldiq.javob);
  tekshir('A o‘z hisoblarini ko‘rdi', /Naqd/.test(qoldiqMatn), qoldiqMatn.split('\n')[0]);
  tekshir('qoldiq −250 000 (chiqim hisobga olingan)', /-?250 000/.test(qoldiqMatn), qoldiqMatn.split('\n')[0]);

  const yozuvlar = await mcp(tokenA.token, 'tools/call', { name: 'yozuvlar_ol', arguments: { davr: 'oy' } });
  const yozuvMatn = matni(yozuvlar.javob);
  tekshir('A o‘z yozuvini ko‘rdi', /ijara/i.test(yozuvMatn));
  tekshir(
    'B NING YOZUVI KO‘RINMAYDI',
    !/B ning siri|999 999/.test(yozuvMatn),
    /siri/.test(yozuvMatn) ? 'SIZIB CHIQDI' : 'ko‘rinmadi',
  );

  const qidiruv = await mcp(tokenA.token, 'tools/call', { name: 'qidir', arguments: { matn: 'siri' } });
  tekshir('qidiruv ham begonani topmaydi', !/999 999/.test(matni(qidiruv.javob)), '0 natija');

  const hisobot = await mcp(tokenA.token, 'tools/call', { name: 'hisobot_ol', arguments: { davr: 'oy' } });
  tekshir('hisobot chiqdi', /Chiqim/.test(matni(hisobot.javob)), matni(hisobot.javob).split('\n')[1]);

  // =============================================================
  console.log('\n6. Yozish huquqi');

  const yozishUrinish = await mcp(tokenA.token, 'tools/call', {
    name: 'yozuv_yarat',
    arguments: { turi: 'chiqim', summa: 1000, tasdiq: true },
  });
  tekshir(
    'o‘qish tokeni bilan yozib bo‘lmaydi',
    yozishUrinish.javob?.result?.isError === true,
    matni(yozishUrinish.javob).slice(0, 50),
  );

  const tokenYoz = await rpc(a.token, 'kassa_token_yarat', { p_nom: 'Sinov (yozish)', p_yozishi: true });
  const royxat2 = await mcp(tokenYoz.token, 'tools/list', {});
  tekshir(
    'yozish tokenida `yozuv_yarat` ko‘rinadi',
    (royxat2.javob?.result?.tools ?? []).some((x) => x.name === 'yozuv_yarat'),
  );

  // Quruq sinov: tasdiqsiz
  const oldingiSoni = Number((await sql(`select count(*) n from kassa_yozuvlar where org_id = '${orgA}'`))[0].n);
  const quruq = await mcp(tokenYoz.token, 'tools/call', {
    name: 'yozuv_yarat',
    arguments: { turi: 'chiqim', summa: 50000, izoh: 'quruq sinov' },
  });
  const keyingiSoni = Number((await sql(`select count(*) n from kassa_yozuvlar where org_id = '${orgA}'`))[0].n);
  tekshir('tasdiqsiz chaqiruv YOZMAYDI', keyingiSoni === oldingiSoni, `${oldingiSoni} → ${keyingiSoni}`);
  tekshir('tasdiq so‘raladi', /tasdiq/i.test(matni(quruq.javob)), matni(quruq.javob).split('\n').pop()?.slice(0, 40));

  // Tasdiq bilan
  const tasdiqli = await mcp(tokenYoz.token, 'tools/call', {
    name: 'yozuv_yarat',
    arguments: { turi: 'chiqim', summa: 50000, izoh: 'AI yozdi', tasdiq: true },
  });
  const oxirgiSoni = Number((await sql(`select count(*) n from kassa_yozuvlar where org_id = '${orgA}'`))[0].n);
  tekshir('tasdiq bilan yozildi', oxirgiSoni === oldingiSoni + 1, `${oldingiSoni} → ${oxirgiSoni}`);
  tekshir('javobda tasdiq bor', /qo‘shildi/.test(matni(tasdiqli.javob)));

  const yozilgan = await sql(
    `select summa, izoh from kassa_yozuvlar where org_id = '${orgA}' and izoh = 'AI yozdi'`,
  );
  tekshir('summa to‘g‘ri yozildi', yozilgan[0]?.summa === '50000.00', String(yozilgan[0]?.summa));

  // =============================================================
  console.log('\n7. O‘chirilgan token');

  await sql(`update kassa_tokenlar set faol = false where prefiks = '${tokenA.prefiks}'`);
  const ochirilgan = await mcp(tokenA.token, 'tools/list', {});
  tekshir('o‘chirilgan token ishlamaydi', ochirilgan.javob?.error?.code === -32001);

  // =============================================================
  console.log('\n8. Jurnal');

  const jurnal = await sql(
    `select asbob, natija from kassa_mcp_jurnal where org_id = '${orgA}' order by created_at`,
  );
  tekshir('chaqiruvlar jurnalga tushdi', jurnal.length >= 5, `${jurnal.length} ta yozuv`);
  tekshir(
    'rad etilgan urinish ham qayd etilgan',
    jurnal.some((x) => x.natija === 'rad'),
    jurnal.filter((x) => x.natija === 'rad').length + ' ta rad',
  );
} finally {
  console.log('\n9. Tozalash');
  for (const org of yaratilgan.orglar) {
    if (typeof org !== 'string') continue;
    await sql(`delete from kassa_mcp_jurnal where org_id = '${org}'`).catch(() => {});
    await sql(`delete from kassa_tokenlar where org_id = '${org}'`).catch(() => {});
    await sql(`delete from profiles where org_id = '${org}'`).catch(() => {});
    await sql(`delete from uzvliklar where org_id = '${org}'`).catch(() => {});
    await sql(`delete from organizations where id = '${org}'`).catch(() => {});
  }
  for (const u of yaratilgan.userlar) {
    await sql(`delete from auth.users where id = '${u}'`).catch(() => {});
  }
  const qoldi = await sql(`select count(*) n from organizations where name like 'MCP-SINOVI%'`);
  tekshir('sinov ma’lumoti tozalandi', Number(qoldi[0].n) === 0, `${qoldi[0].n} ta qoldi`);
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
