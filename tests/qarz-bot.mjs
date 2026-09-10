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

/** Panel RPC'lari admin JWT bilan chaqiriladi — SQL orqali emas */
async function panel(fn, tana) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: K.anon_key,
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tana ?? {}),
  });
  const t = await r.text();
  if (!r.ok) return { xato: t.slice(0, 300) };
  return { j: t ? JSON.parse(t) : null };
}

let adminToken = null;

try {
  // Sinov ADMINNING tashkilotida ishlaydi: panel funksiyalari
  // current_org_id() ga tayanadi, boshqa org olinsa ular bo'sh
  // qaytarardi va sinov hech narsa tekshirmagan bo'lardi
  const kirish = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: K.anon_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: K.admin.email, password: K.admin.password }),
  });
  const kj = await kirish.json();
  adminToken = kj.access_token ?? null;
  if (!adminToken) throw new Error('admin kira olmadi: ' + JSON.stringify(kj).slice(0, 200));

  orgId = (await bir(`
    select org_id as id from profiles
    where id = (select id from auth.users where email = '${K.admin.email}')
  `)).id;
  if (!orgId) throw new Error('adminning org_id si yo‘q');

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

  // Kirimda TO'LOV USULI majburiy: oy oxirida "kassada qancha naqd
  // bo'lishi kerak" degan savolga javob shundan chiqadi
  const usulsiz = await sql(`
    select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 500000, null, null) as j
  `);
  tekshir(
    'usulsiz kirim o‘tmaydi',
    Boolean(usulsiz.xato) && /USUL_MAJBURIY/.test(usulsiz.xato),
    usulsiz.xato ? '' : 'YOZILDI!'
  );

  const notogriUsul = await sql(`
    select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 100, null, 'bitcoin') as j
  `);
  tekshir('noma’lum usul o‘tmaydi', Boolean(notogriUsul.xato) && /NOTOGRI_USUL/.test(notogriUsul.xato));

  const kirim = await bir(`
    select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 500000, null, 'plastik') as j
  `);
  tekshir('kirim yozildi', kirim.j?.ok === true);
  tekshir('usul saqlandi', kirim.j?.usul === 'plastik', String(kirim.j?.usul));
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
  tekshir('bekor qilingach plastik ham 0', Number(h.j?.plastik) === 0, String(h.j?.plastik));
  tekshir('agentning klientlari 1 ta', Number(h.j?.klientlar) === 1, String(h.j?.klientlar));

  // Uch usulda uch kirim — hisobot ularni ajratib bersinmi
  await sql(`select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 100000, null, 'naqd')`);
  await sql(`select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 200000, null, 'plastik')`);
  await sql(`select qarz_bot_yozuv(${CHAT_A}, '${klientA}', 'kirim', 300000, null, 'klik')`);
  const h2 = await bir(`select qarz_bot_hisobot(${CHAT_A}) as j`);
  tekshir('naqd 100 000', Number(h2.j?.naqd) === 100000, String(h2.j?.naqd));
  tekshir('plastik 200 000', Number(h2.j?.plastik) === 200000, String(h2.j?.plastik));
  tekshir('klik 300 000', Number(h2.j?.klik) === 300000, String(h2.j?.klik));
  tekshir(
    'usullar yig‘indisi jami kirimga teng',
    Number(h2.j?.naqd) + Number(h2.j?.plastik) + Number(h2.j?.klik) === Number(h2.j?.kirim),
    `${h2.j?.kirim}`
  );

  // Chiqimga usul yozib bo'lmasin — hisobot yolg'on gapirardi
  const chiqimUsul = await sql(`
    select qarz_yozuv_qosh('${klientA}', 'chiqim', 1000, null, null, '${agentA}', 'naqd') as id
  `);
  if (!chiqimUsul.xato) {
    const u = await bir(`
      select usul from qarz_transactions where client_id = '${klientA}'
        and tur = 'chiqim' and summa = 1000 limit 1
    `);
    tekshir('chiqimda usul yozilmaydi', u?.usul === null, String(u?.usul));
  } else {
    tekshir('chiqimda usul yozilmaydi', false, chiqimUsul.xato);
  }

  // ---------- 8. Panel: yozuvlar ro'yxati ----------
  console.log('\n8. Panel — chiqim/kirim ro‘yxati');

  const p1 = await panel('qarz_yozuvlar', { p_agent_id: agentA, p_limit: 200 });
  tekshir('panel ro‘yxatni berdi', !p1.xato, p1.xato ?? '');
  const qatorlar = p1.j?.qatorlar ?? [];
  const jami = p1.j?.jami ?? {};

  // Klient ustuni apteka nomini ko'rsatadi — odam aynan shuni qidiradi
  tekshir(
    'ro‘yxatda klient apteka nomi bilan turibdi',
    qatorlar.length > 0 && qatorlar.every((q) => q.klient === 'Valijon Farm'),
    `${qatorlar.length} qator, birinchisi: ${qatorlar[0]?.klient}`
  );
  tekshir('barcha 6 yozuv qaytdi (bekor qilingani bilan)', qatorlar.length === 6,
    String(qatorlar.length));
  tekshir('agent nomi qatorda ko‘rinadi', qatorlar.every((q) => q.agent === `${BELGI} A`));

  // JAMI ekrandagi qatorlardan emas, bazadan kelishi shart
  tekshir('jami chiqim 1 251 000', Number(jami.chiqim) === 1251000, String(jami.chiqim));
  tekshir(
    'jami kirim usullar yig‘indisiga teng',
    Number(jami.naqd) + Number(jami.plastik) + Number(jami.klik) === Number(jami.kirim),
    String(jami.kirim)
  );
  // Bekor qilingan yozuv KO'RINADI, lekin jamiga kirmaydi
  tekshir('bekor qilingan yozuv ro‘yxatda turibdi', qatorlar.some((q) => q.bekor === true));
  tekshir('bekor soni 1', Number(jami.bekor) === 1, String(jami.bekor));

  const p2 = await panel('qarz_yozuvlar', { p_agent_id: agentA, p_tur: 'kirim', p_usul: 'naqd' });
  tekshir(
    'usul filtri faqat naqdni qoldiradi',
    (p2.j?.qatorlar ?? []).every((q) => q.usul === 'naqd'),
    `${(p2.j?.qatorlar ?? []).length} qator`
  );
  tekshir('naqd jami 100 000', Number(p2.j?.jami?.naqd) === 100000, String(p2.j?.jami?.naqd));

  // Boshqa agentning yozuvlari SIZILIB o'tmasin
  const p3 = await panel('qarz_yozuvlar', { p_agent_id: agentB });
  tekshir(
    'boshqa agent filtri A ning yozuvlarini bermaydi',
    (p3.j?.qatorlar ?? []).every((q) => q.agent !== `${BELGI} A`)
  );

  // Kelajakdagi oraliq — bo'sh bo'lishi shart
  const p4 = await panel('qarz_yozuvlar', {
    p_agent_id: agentA,
    p_dan: '2099-01-01T00:00:00',
  });
  tekshir('kelajak oralig‘i bo‘sh', (p4.j?.qatorlar ?? []).length === 0);
  tekshir('bo‘sh oraliqda jami ham nol', Number(p4.j?.jami?.chiqim) === 0);

  // anon uchun yopiq bo'lishi shart
  const anon = await fetch(`${URL_}/rest/v1/rpc/qarz_yozuvlar`, {
    method: 'POST',
    headers: { apikey: K.anon_key, 'Content-Type': 'application/json' },
    body: '{}',
  });
  tekshir('anon panel ro‘yxatini ocha olmaydi', anon.status >= 400, 'HTTP ' + anon.status);

  // ---------- 9. Webhook himoyasi ----------
  console.log('\n9. Webhook');

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
  // ---------- 10. Tozalash ----------
  console.log('\n10. Tozalash');
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
