// =============================================================
//  QARZDORLIK BOTI SINOVI
//
//  Oqim: Agent -> Klient -> Chiqim (+qarz) -> Kirim (-qarz) -> SVERKA
//
//  Eng katta xavf — CHEGARA. Agent FAQAT o'z klienti bilan ishlashi
//  kerak. Botda ruxsat hisoblanmaydi: har bir amal chat_id -> agent ->
//  org zanjirini bazada qaytadan quradigan RPC orqali o'tadi. Shu
//  zanjir bir joyda uzilsa, agent boshqa agentning klientiga pul
//  yozib yuborardi va buni faqat oy oxirida sezilardi.
//
//  Bot funksiyalari FAQAT service_role uchun ochiq: chat_id maxfiy
//  emas, uni bilgan har qanday kirgan foydalanuvchi o'sha agent
//  nomidan yozardi. Bu ham tekshiriladi.
//
//  Sinov jonli bazaga yozadi va OXIRIDA o'zi tozalaydi.
//
//  Ishga tushirish:  node tests/qarz-bot.mjs
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

const URL_ = `https://${K.ref}.supabase.co`;

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${K.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) return { xato: t.slice(0, 300) };
  return { qatorlar: JSON.parse(t) };
}

async function bir(q) {
  const { qatorlar, xato } = await sql(q);
  if (xato) throw new Error(xato);
  return qatorlar[0];
}

console.log('\n\x1b[1mQARZDORLIK BOTI\x1b[0m');

const BELGI = '__qarz_sinov__';
const TEL_A = '+998900001' + String(Math.floor(Math.random() * 900) + 100);
const TEL_B = '+998900002' + String(Math.floor(Math.random() * 900) + 100);
const CHAT_A = 900000000 + Math.floor(Math.random() * 1000000);
const CHAT_B = 910000000 + Math.floor(Math.random() * 1000000);

let orgId, agentA, agentB, klientA, klientB;

async function tozala() {
  await sql(`
    delete from qarz_audit where org_id = '${orgId}' and (sabab like '${BELGI}%' or agent_id in (
      select id from qarz_agents where ism like '${BELGI}%'));
    delete from qarz_transactions where client_id in (
      select id from qarz_clients where ism like '${BELGI}%');
    delete from qarz_clients where ism like '${BELGI}%';
    delete from qarz_bot_state where chat_id in (${CHAT_A}, ${CHAT_B});
    delete from qarz_agents where ism like '${BELGI}%'
  `);
}

try {
  orgId = (await bir('select id from organizations order by created_at limit 1')).id;

  // ---------- 1. Agent yaratish va ulash ----------
  console.log('\n1. Agent va Telegram ulanishi');

  agentA = (await bir(`
    insert into qarz_agents (org_id, ism, rayon, telefon)
    values ('${orgId}', '${BELGI} A', 'Chilonzor', '${TEL_A}') returning id
  `)).id;
  agentB = (await bir(`
    insert into qarz_agents (org_id, ism, rayon, telefon)
    values ('${orgId}', '${BELGI} B', 'Yunusobod', '${TEL_B}') returning id
  `)).id;
  tekshir('ikki agent yaratildi', Boolean(agentA && agentB));

  // Telegram "+998901234567" yuboradi, admin boshqacha yozgan bo'lishi
  // mumkin — oxirgi 9 raqam bo'yicha topilishi kerak
  const ulash = await bir(`
    select qarz_agent_ulash('${TEL_A.replace('+998', '')}', ${CHAT_A}, 'sinov', 'A') as j
  `);
  tekshir(
    'agent kontakt orqali ulandi (mamlakat kodisiz ham)',
    ulash.j?.ok === true,
    ulash.j?.error ?? ulash.j?.ism
  );

  await sql(`select qarz_agent_ulash('${TEL_B}', ${CHAT_B}, 'sinov', 'B')`);

  const yoq = await bir(`select qarz_agent_ulash('+998999999999', 999999999) as j`);
  tekshir(
    "ro'yxatda yo'q raqam ulanmaydi",
    yoq.j?.ok === false && yoq.j?.error === 'AGENT_TOPILMADI',
    yoq.j?.error
  );

  const men = await bir(`select qarz_agent_men(${CHAT_A}) as j`);
  tekshir('chat_id bo‘yicha agent topiladi', men.j?.agent_id === agentA, men.j?.ism);

  // ---------- 2. Klient qo'shish ----------
  console.log('\n2. Klient');

  const kA = await bir(`
    select qarz_bot_klient_qosh(${CHAT_A}, '${BELGI} Valijon', 'Aliyev', 'Valijon Farm', '+998901112233') as j
  `);
  klientA = kA.j?.id;
  tekshir('agent A klient qo‘shdi', Boolean(klientA));

  const kB = await bir(`
    select qarz_bot_klient_qosh(${CHAT_B}, '${BELGI} Nozim', 'Nozimov', 'Nozim Farm', null) as j
  `);
  klientB = kB.j?.id;
  tekshir('agent B klient qo‘shdi', Boolean(klientB));

  const royxatA = await bir(`select qarz_bot_klientlar(${CHAT_A}) as j`);
  const idlarA = (royxatA.j ?? []).map((x) => x.id);
  tekshir('agent A faqat o‘z klientini ko‘radi', idlarA.length === 1 && idlarA[0] === klientA,
    idlarA.length + ' ta');
  tekshir('agent A da agent B ning klienti yo‘q', !idlarA.includes(klientB));

  // ---------- 3. Chiqim va kirim ----------
  console.log('\n3. Chiqim va kirim');

  const chiqim = await bir(`
    select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'chiqim', 1250000, null) as j
  `);
  tekshir('chiqim yozildi', chiqim.j?.ok === true);
  tekshir('qarz 1 250 000 bo‘ldi', Number(chiqim.j?.qoldiq) === 1250000, String(chiqim.j?.qoldiq));

  const kirim = await bir(`
    select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 500000, null) as j
  `);
  tekshir('kirim yozildi', kirim.j?.ok === true);
  tekshir(
    'oldingi qarz to‘g‘ri ko‘rsatildi',
    Number(kirim.j?.oldingi) === 1250000,
    String(kirim.j?.oldingi)
  );
  tekshir('qolgan qarz 750 000', Number(kirim.j?.qoldiq) === 750000, String(kirim.j?.qoldiq));

  // ---------- 4. Chegara ----------
  console.log('\n4. Chegara — eng muhim qism');

  const begona = await sql(`
    select qarz_bot_yozuv(${CHAT_A}, '${klientB}', 'chiqim', 999, null) as j
  `);
  tekshir(
    'agent A agent B ning klientiga YOZA OLMAYDI',
    Boolean(begona.xato) && /RUXSAT_YOQ/.test(begona.xato),
    begona.xato ? '' : 'YOZILDI!'
  );

  const begonaSverka = await sql(`select qarz_bot_sverka(${CHAT_A}, '${klientB}') as j`);
  tekshir(
    'agent A begona klient sverkasini ochmaydi',
    Boolean(begonaSverka.xato) && /RUXSAT_YOQ/.test(begonaSverka.xato),
    begonaSverka.xato ? '' : 'OCHILDI!'
  );

  const ulanmagan = await sql(`select qarz_bot_klientlar(999999999) as j`);
  tekshir(
    'ulanmagan chat hech narsa ko‘rmaydi',
    Boolean(ulanmagan.xato) && /RUXSAT_YOQ/.test(ulanmagan.xato)
  );

  // Bloklangan agent
  await sql(`update qarz_agents set faol = false where id = '${agentA}'`);
  const bloklangan = await sql(`select qarz_bot_klientlar(${CHAT_A}) as j`);
  tekshir(
    'bloklangan agent ishlay olmaydi',
    Boolean(bloklangan.xato) && /RUXSAT_YOQ/.test(bloklangan.xato)
  );
  await sql(`update qarz_agents set faol = true where id = '${agentA}'`);

  const manfiy = await sql(`select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'chiqim', -100, null) as j`);
  tekshir('manfiy summa o‘tmaydi', Boolean(manfiy.xato) && /NOTOGRI_SUMMA/.test(manfiy.xato));

  const notogriTur = await sql(`select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'sovga', 100, null) as j`);
  tekshir('noma’lum tur o‘tmaydi', Boolean(notogriTur.xato) && /NOTOGRI_TUR/.test(notogriTur.xato));

  // ---------- 5. SVERKA ----------
  console.log('\n5. SVERKA');

  const sv = await bir(`select qarz_bot_sverka(${CHAT_A}, '${klientA}') as j`);
  const s = sv.j;
  tekshir('chiqim 1 250 000', Number(s?.chiqim) === 1250000, String(s?.chiqim));
  tekshir('kirim 500 000', Number(s?.kirim) === 500000, String(s?.kirim));
  tekshir('qoldiq 750 000', Number(s?.qoldiq) === 750000, String(s?.qoldiq));
  tekshir('harakatlar ro‘yxati 2 ta', (s?.amallar ?? []).length === 2, (s?.amallar ?? []).length + ' ta');

  // ---------- 6. Bekor qilish ----------
  console.log('\n6. Bekor qilish');

  const oxirgi = await bir(`select qarz_bot_oxirgi(${CHAT_A}) as j`);
  const kirimId = (oxirgi.j ?? []).find((x) => x.tur === 'kirim')?.id;
  tekshir('oxirgi yozuvlar ro‘yxati keldi', Boolean(kirimId));

  const sababsiz = await sql(`select qarz_bot_bekor(${CHAT_A}, '${kirimId}', '') as j`);
  tekshir('sababsiz bekor qilib bo‘lmaydi', Boolean(sababsiz.xato) && /SABAB_MAJBURIY/.test(sababsiz.xato));

  const bekor = await bir(`
    select qarz_bot_bekor(${CHAT_A}, '${kirimId}', '${BELGI} noto''g''ri summa') as j
  `);
  tekshir('kirim bekor qilindi', bekor.j?.ok === true);
  tekshir(
    'qarz 1 250 000 ga qaytdi',
    Number(bekor.j?.qoldiq) === 1250000,
    String(bekor.j?.qoldiq)
  );

  const ikki = await sql(`select qarz_bot_bekor(${CHAT_A}, '${kirimId}', 'ikkinchi marta') as j`);
  tekshir(
    'ikki marta bekor qilib bo‘lmaydi',
    Boolean(ikki.xato) && /ALLAQACHON_BEKOR/.test(ikki.xato),
    ikki.xato ? '' : 'IKKI MARTA O‘TDI!'
  );

  // Bekor qilingan yozuv O'CHMAYDI — audit uchun joyida qoladi
  const qoldi = await bir(`select count(*)::int as n from qarz_transactions where id = '${kirimId}'`);
  tekshir('bekor qilingan yozuv o‘chmadi', qoldi.n === 1);

  const auditN = await bir(`
    select count(*)::int as n from qarz_audit
    where org_id = '${orgId}' and amal = 'bekor' and yozuv_id = '${kirimId}'
  `);
  tekshir('bekor audit jurnaliga tushdi', auditN.n === 1);

  // ---------- 7. Hisobot ----------
  console.log('\n7. Hisobot');

  const h = await bir(`select qarz_bot_hisobot(${CHAT_A}) as j`);
  tekshir('hisobot chiqimi 1 250 000', Number(h.j?.chiqim) === 1250000, String(h.j?.chiqim));
  tekshir('bekor qilingan kirim hisobga olinmadi', Number(h.j?.kirim) === 0, String(h.j?.kirim));
  tekshir('agentning klientlari 1 ta', Number(h.j?.klientlar) === 1, String(h.j?.klientlar));

  // ---------- 8. Webhook himoyasi ----------
  console.log('\n8. Webhook');

  const soxta = await fetch(`${URL_}/functions/v1/telegram-qarz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { chat: { id: 1 }, text: '/start' } }),
  });
  tekshir(
    'maxfiy kalitsiz webhook rad etiladi',
    soxta.status === 403,
    'HTTP ' + soxta.status
  );
} catch (e) {
  tekshir('sinov oxirigacha yetdi', false, e.message);
} finally {
  // ---------- 9. Tozalash ----------
  console.log('\n9. Tozalash');
  await tozala();
  const qoldiq = await bir(`
    select (select count(*)::int from qarz_agents where ism like '${BELGI}%') as agentlar,
           (select count(*)::int from qarz_clients where ism like '${BELGI}%') as klientlar,
           (select count(*)::int from qarz_transactions t
             join qarz_clients c on c.id = t.client_id where c.ism like '${BELGI}%') as yozuvlar,
           (select count(*)::int from qarz_bot_state where chat_id in (${CHAT_A}, ${CHAT_B})) as holat
  `);
  tekshir(
    'sinov qoldig‘i tozalandi',
    qoldiq.agentlar === 0 && qoldiq.klientlar === 0 && qoldiq.yozuvlar === 0 && qoldiq.holat === 0,
    JSON.stringify(qoldiq)
  );
}

console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
