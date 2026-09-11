// =============================================================
//  QARZDORLIK HUJJATLARI SINOVI
//
//  Sverkani Excel va chop etish (PDF) ko'rinishida yasaydi va
//  QAYTA OCHIB tekshiradi.
//
//  Nega kod o'qish yetarli emas: katak noto'g'ri ustunga tushgani,
//  yugurib boradigan qoldiq noto'g'ri hisoblangani yoki bekor
//  qilingan qator hisobga qo'shilib ketgani manbadan bilinmaydi.
//  Bu loyihada aynan shunday xatolar bo'lgan (mergeCells qamrovi
//  qo'lda yozilgani uchun jadval varaqdan chiqib ketgan edi).
//
//  Eng nozik joyi — QOLDIQ USTUNI. Sverka ayni shu ustun uchun
//  qilinadi: mijoz "shu amaldan keyin qancha qarzim qoldi" degan
//  savolga javob izlaydi. Bekor qilingan amal qoldiqni
//  o'zgartirmasligi kerak, lekin ko'rinib turishi shart.
//
//  Ishga tushirish:  node tests/qarz-hujjat.mjs
// =============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

const kesh = join(ROOT, 'node_modules/.cache/qarz-hujjat');
mkdirSync(kesh, { recursive: true });
const chiqish = join(kesh, 'eksport.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/qarz-eksport.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['exceljs'],
});
const E = await import('file://' + chiqish.replace(/\\/g, '/'));

console.log('\n\x1b[1mQARZDORLIK HUJJATLARI\x1b[0m');

// Sverka: boshlang'ich 200 000, keyin chiqim/kirim/bekor
const SVERKA = {
  klient: {
    ism: 'Valijon',
    familiya: 'Aliyev',
    apteka: 'Valijon Farm',
    telefon: '+998901112233',
    agent: 'Aziz',
  },
  boshlangich: 200000,
  chiqim: 1250000,
  kirim: 500000,
  usullar: { naqd: 200000, plastik: 300000 },
  qoldiq: 950000,
  amallar: [
    { id: '1', tur: 'chiqim', summa: 1250000, sana: '2026-09-01T10:20:00Z', izoh: null, usul: null },
    { id: '2', tur: 'kirim', summa: 200000, sana: '2026-09-03T15:42:00Z', usul: 'naqd' },
    { id: '3', tur: 'kirim', summa: 999999, sana: '2026-09-04T09:00:00Z', usul: 'klik',
      bekor: true, bekor_sabab: "noto'g'ri summa" },
    { id: '4', tur: 'kirim', summa: 300000, sana: '2026-09-08T11:15:00Z', usul: 'plastik' },
  ],
};

// ---------- 1. Yugurib boradigan qoldiq ----------
console.log('\n1. Qoldiq ustuni');

const q = E.qoldiqlar(SVERKA.boshlangich, SVERKA.amallar);
tekshir('to‘rt qator uchun to‘rt qoldiq', q.length === 4, q.join(', '));
tekshir('1) 200 000 + 1 250 000 = 1 450 000', q[0] === 1450000, String(q[0]));
tekshir('2) − 200 000 = 1 250 000', q[1] === 1250000, String(q[1]));
tekshir(
  '3) BEKOR qilingan qator qoldiqni o‘zgartirmaydi',
  q[2] === 1250000,
  q[2] === 1250000 ? '' : `${q[2]} — bekor hisobga olindi!`
);
tekshir('4) − 300 000 = 950 000', q[3] === 950000, String(q[3]));
tekshir(
  'oxirgi qoldiq bazaning qoldig‘iga teng',
  q[q.length - 1] === SVERKA.qoldiq,
  `${q[q.length - 1]} / ${SVERKA.qoldiq}`
);

// ---------- 2. Excel ----------
console.log('\n2. Excel hujjati');

const bayt = await E.sverkaKitobi(SVERKA, 'IDAA FARM', 'Shu oy', new Date(2026, 8, 11));
writeFileSync(join(kesh, 'sverka.xlsx'), Buffer.from(bayt));

const ExcelJS = (await import('exceljs')).default;
const kitob = new ExcelJS.Workbook();
await kitob.xlsx.load(bayt);
const v = kitob.worksheets[0];

const satr = [];
v.eachRow({ includeEmpty: true }, (r, i) => {
  const k = [];
  r.eachCell({ includeEmpty: true }, (c) => k.push(String(c.value ?? '')));
  satr[i] = k;
});
const yassi = Array.from(satr, (s) => (s ?? []).join(' | '));

tekshir('firma nomi bor', yassi.some((s) => s.includes('IDAA FARM')));
tekshir('SVERKA sarlavhasi bor', yassi.some((s) => s.includes('SVERKA')));
tekshir('klient nomi bor', yassi.some((s) => s.includes('Valijon Farm')));
tekshir('agent ko‘rsatilgan', yassi.some((s) => s.includes('Aziz')));
tekshir('davr yozilgan', yassi.some((s) => s.includes('Shu oy')));

// Xulosa qatorlari
tekshir('boshlang‘ich qoldiq 200 000', yassi.some((s) => /Boshlang.*qoldiq/.test(s) && s.includes('200000')));
tekshir('QOLDIQ 950 000', yassi.some((s) => s.includes('QOLDIQ') && s.includes('950000')));
tekshir(
  'kirim usullari yozilgan',
  yassi.some((s) => s.includes('Naqd: 200000') && s.includes('Plastik: 300000')),
  yassi.find((s) => s.includes('usullari')) ?? ''
);

// Jadval sarlavhasi
const sarlavhaQator = yassi.findIndex((s) => s.startsWith('№ | Sana | Amal'));
tekshir('jadval sarlavhasi bor', sarlavhaQator > 0, 'qator ' + sarlavhaQator);
if (sarlavhaQator > 0) {
  const ustunlar = satr[sarlavhaQator];
  tekshir('sakkizta ustun', ustunlar.length === 8, ustunlar.length + ' ta');
  tekshir('«Usul» ustuni bor', ustunlar.includes('Usul'));
  tekshir('«Qoldiq» ustuni bor', ustunlar.includes('Qoldiq'));

  // Qatorlar TO'G'RI USTUNGA tushdimi — eng ko'p xato shu yerda
  const q1 = satr[sarlavhaQator + 1];
  tekshir('1-qator: chiqim 5-ustunda', q1[4] === '1250000', `[${q1.join('][')}]`);
  tekshir('1-qator: kirim ustuni bo‘sh', q1[5] === '', q1[5]);
  tekshir('1-qator: qoldiq 1 450 000', q1[6] === '1450000', q1[6]);

  const q2 = satr[sarlavhaQator + 2];
  tekshir('2-qator: kirim 6-ustunda', q2[5] === '200000', `[${q2.join('][')}]`);
  tekshir('2-qator: usul «Naqd»', q2[3] === 'Naqd', q2[3]);

  const q3 = satr[sarlavhaQator + 3];
  tekshir('3-qator: BEKOR deb belgilangan', /BEKOR/.test(q3[7]), q3[7]);
  tekshir('3-qator: qoldiq o‘zgarmadi', q3[6] === '1250000', q3[6]);

  // Bekor qilingan qator ko'zga tashlanishi kerak
  const bekorKatak = v.getCell(sarlavhaQator + 3, 1);
  tekshir(
    'bekor qilingan qator ajratilgan (rang yoki chizib tashlangan)',
    Boolean(bekorKatak.font?.strike) || Boolean(bekorKatak.fill?.fgColor),
    JSON.stringify({ strike: bekorKatak.font?.strike })
  );
}

tekshir('sarlavha muzlatilgan', v.views?.[0]?.state === 'frozen', JSON.stringify(v.views?.[0] ?? {}));

// ---------- 3. Chop etish ko'rinishi ----------
console.log('\n3. Chop etish (PDF) ko‘rinishi');

const html = E.sverkaTanasi(SVERKA, 'Shu oy');
writeFileSync(join(kesh, 'sverka.html'), html);

tekshir('SVERKA sarlavhasi', html.includes('SVERKA'));
tekshir('klient nomi', html.includes('Valijon Farm'));
tekshir('boshlang‘ich qoldiq 200 000', /200 000/.test(html));
tekshir('qoldiq 950 000', /950 000/.test(html));
tekshir('usullar yozilgan', /Naqd: 200 000/.test(html) && /Plastik: 300 000/.test(html));
tekshir('bekor qilingan qator chizib tashlangan', /line-through/.test(html));
tekshir('bekor sababi ko‘rinadi', /noto/.test(html) && /BEKOR/.test(html));

// Ustun soni jadval sarlavhasi bilan mos bo'lsin — aks holda
// jadval siljib ketardi
const th = (html.match(/<th>/g) ?? []).length;
tekshir('sakkizta ustun sarlavhasi', th === 8, th + ' ta');
const birinchiQator = html.slice(html.indexOf('<tbody>'));
const td = (birinchiQator.slice(0, birinchiQator.indexOf('</tr>')).match(/<td/g) ?? []).length;
tekshir('qatorda ham sakkizta katak', td === 8, td + ' ta');

// HTML kiritmasi qochirilganmi
const xavfli = E.sverkaTanasi(
  { ...SVERKA, klient: { ...SVERKA.klient, apteka: '<script>x</script>' } },
  'Shu oy'
);
tekshir('klient nomidagi HTML qochiriladi', !xavfli.includes('<script>x'), 'XSS!');

// ---------- 4. Chekka hollar ----------
console.log('\n4. Chekka hollar');

const bosh = await E.sverkaKitobi(
  { klient: { ism: 'Yangi' }, boshlangich: 0, chiqim: 0, kirim: 0, usullar: {}, qoldiq: 0, amallar: [] },
  'IDAA FARM',
  'Bugun'
);
tekshir('harakatsiz sverka ham yasaladi', bosh.byteLength > 0, bosh.byteLength + ' bayt');

const boshHtml = E.sverkaTanasi(
  { klient: { ism: 'Yangi' }, boshlangich: 0, chiqim: 0, kirim: 0, usullar: null, qoldiq: 0, amallar: [] },
  'Bugun'
);
tekshir('harakatsizda tushunarli yozuv', /harakat yo/.test(boshHtml));

tekshir('manfiy qoldiq (haqi) belgisi bilan', /-50 000/.test(
  E.sverkaTanasi({ ...SVERKA, qoldiq: -50000, amallar: [] }, 'Bugun')
));

// =============================================================
//  5. UMUMIY HISOBOT — har bir klient qatori
//
//  Hisobotda avval faqat qoldiq turardi. Endi har qatorda davrdagi
//  chiqim, kirim va to'lov turlari ham bor. Eng nozik joyi: QARZ
//  ustuni davrga bog'liq EMAS (bugungi holat), chiqim/kirim esa
//  davrga bog'liq. Ikkovi bir jadvalda turgani uchun jami qatori
//  har uchala ustunda ham to'g'ri chiqishi kerak.
// =============================================================
console.log('\n5. Umumiy hisobot');

const HISOBOT = {
  chiqim: 9000000, kirim: 4500000, naqd: 3000000, plastik: 1000000,
  klik: 500000, qarz: 7500000, klientlar: 3, agentlar: 2,
};

const KLIENTLAR = [
  {
    ism: 'Valijon', familiya: 'Aliyev', apteka: 'Valijon Farm', telefon: '+998901112233',
    agent: 'Aziz', chiqim: 5000000, kirim: 3500000,
    naqd: 2000000, plastik: 1000000, klik: 500000, qarz: 2500000,
  },
  {
    ism: 'Bobur', familiya: null, apteka: 'Shifo', telefon: null, agent: 'Aziz',
    chiqim: 4000000, kirim: 1000000, naqd: 1000000, plastik: 0, klik: 0, qarz: 3000000,
  },
  // Davrda harakat qilmagan, lekin qarzi bor — qatori chiqishi shart
  {
    ism: 'Dilnoza', familiya: 'Yo‘ldosheva', apteka: null, telefon: '+998911111111',
    agent: 'Bekzod', chiqim: 0, kirim: 0, naqd: 0, plastik: 0, klik: 0, qarz: 2000000,
  },
];

const hBayt = await E.hisobotKitobi(HISOBOT, KLIENTLAR, 'IDAA FARM', 'sentabr 2026');
writeFileSync(join(kesh, 'hisobot.xlsx'), Buffer.from(hBayt));

const hKitob = new ExcelJS.Workbook();
await hKitob.xlsx.load(hBayt);
const hv = hKitob.worksheets[0];

tekshir('hisobot varag‘i yasaldi', hv.name === 'Hisobot', hv.name);
tekshir('yetti ustun', E.HISOBOT_USTUNLAR.length === 7, String(E.HISOBOT_USTUNLAR.length));

// Jadval sarlavhasini topamiz
let hBosh = 0;
hv.eachRow((r, i) => {
  if (String(r.getCell(7).value ?? '') === 'Qarzdorlik') hBosh = i;
});
tekshir('jadval sarlavhasi topildi', hBosh > 0, String(hBosh));
tekshir('C — Apteka', hv.getRow(hBosh).getCell(3).value === 'Apteka');
tekshir('D — Tovar chiqimi', hv.getRow(hBosh).getCell(4).value === 'Tovar chiqimi');
tekshir('E — Pul kirimi', hv.getRow(hBosh).getCell(5).value === 'Pul kirimi');
tekshir('F — To‘lov turi', hv.getRow(hBosh).getCell(6).value === 'To‘lov turi');

const q1 = hv.getRow(hBosh + 1);
tekshir('1-qator: klient', q1.getCell(2).value === 'Valijon Aliyev', String(q1.getCell(2).value));
tekshir('1-qator: apteka', q1.getCell(3).value === 'Valijon Farm', String(q1.getCell(3).value));
tekshir('1-qator: chiqim SON', q1.getCell(4).value === 5000000, String(q1.getCell(4).value));
tekshir('1-qator: kirim SON', q1.getCell(5).value === 3500000, String(q1.getCell(5).value));
tekshir(
  '1-qator: to‘lov turlari summasi bilan',
  q1.getCell(6).value === 'Naqd 2 000 000 · Plastik 1 000 000 · Click 500 000',
  String(q1.getCell(6).value)
);
tekshir('1-qator: qarz SON', q1.getCell(7).value === 2500000, String(q1.getCell(7).value));
tekshir('1-qator: qarz qizil', /B91C1C/i.test(JSON.stringify(q1.getCell(7).font ?? {})),
  JSON.stringify(q1.getCell(7).font ?? {}));

// Bo'lmagan usul yozilmasin — uchta nol qatorni uzaytirardi
tekshir(
  '2-qator: faqat naqd',
  hv.getRow(hBosh + 2).getCell(6).value === 'Naqd 1 000 000',
  String(hv.getRow(hBosh + 2).getCell(6).value)
);

const q3 = hv.getRow(hBosh + 3);
tekshir('3-qator: harakatsiz klient ham chiqdi', q3.getCell(2).value === 'Dilnoza Yo‘ldosheva');
// Nol emas, BO'SH: har qatorda ikkita nol turib, ko'z haqiqiy summani
// ajrata olmasdi
tekshir('3-qator: chiqim bo‘sh qoldi', q3.getCell(4).value == null, String(q3.getCell(4).value));
tekshir('3-qator: qarzi ko‘rinadi', q3.getCell(7).value === 2000000, String(q3.getCell(7).value));

// JAMI — FORMULA bo'lishi shart: qo'lda yozilsa qator qo'shilganda eskirardi
const hJami = hv.getRow(hBosh + 4);
tekshir('JAMI qatori', String(hJami.getCell(1).value ?? '') === 'JAMI', String(hJami.getCell(1).value));
for (const [ustun, harf] of [[4, 'D'], [5, 'E'], [7, 'G']]) {
  const v = hJami.getCell(ustun).value;
  tekshir(
    `JAMI ${harf} formula bilan`,
    Boolean(v && typeof v === 'object' && 'formula' in v && v.formula === `SUM(${harf}${hBosh + 1}:${harf}${hBosh + 3})`),
    JSON.stringify(v)
  );
}

tekshir(
  'sarlavha muzlatilgan',
  hv.views?.[0]?.state === 'frozen' && hv.views[0].ySplit === hBosh,
  JSON.stringify(hv.views?.[0] ?? {})
);

// ---- chop etish ko'rinishi ----
const hHtml = E.hisobotTanasi(HISOBOT, KLIENTLAR, 'sentabr 2026');
writeFileSync(join(kesh, 'hisobot.html'), hHtml);

tekshir('PDF: sarlavha', /QARZDORLIK HISOBOTI/.test(hHtml));
// `<th` emas `<th[ >]` — aks holda <thead> ham sanalib ketardi
tekshir('PDF: yetti ustun sarlavhasi', (hHtml.match(/<th[ >]/g) ?? []).length === 7,
  String((hHtml.match(/<th[ >]/g) ?? []).length));
const hBirinchiQator = hHtml.split('<tbody>')[1].split('</tr>')[0];
tekshir('PDF: qatorda ham yettita katak', (hBirinchiQator.match(/<td/g) ?? []).length === 7,
  String((hBirinchiQator.match(/<td/g) ?? []).length));
tekshir('PDF: apteka ko‘rinadi', /Valijon Farm/.test(hHtml));
tekshir('PDF: to‘lov turlari', /Naqd 2 000 000/.test(hHtml));
tekshir('PDF: qarz qizil', /#b91c1c/i.test(hHtml));
tekshir('PDF: jami chiqim', /9 000 000/.test(hHtml));
tekshir(
  'PDF: jami qarz qatorlar yig‘indisiga teng',
  new RegExp(String(7500000).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')).test(hHtml)
);
tekshir(
  'PDF: klient nomidagi HTML qochiriladi',
  !/<script>/.test(
    E.hisobotTanasi(HISOBOT, [{ ...KLIENTLAR[0], apteka: '<script>x</script>' }], 'Bugun')
  )
);
tekshir(
  'PDF: klientsiz hisobot ham yasaladi',
  /Klient yo/.test(E.hisobotTanasi(HISOBOT, [], 'Bugun'))
);

// =============================================================
//  6. KUNLAR KESIMI
//
//  Bir kunda ikki marta chiqim bo'lsa, ro'yxatda ular ajralib
//  turmasdi: ikkalasi ham "11.09.2026" deb yozilardi. Endi qatorlar
//  kun bo'yicha guruhlanadi.
//
//  Eng nozik joyi — KALIT MAHALLIY kun bo'yicha bo'lishi.
//  toISOString() UTC beradi va kechqurun yozilgan yozuv ertangi
//  kunga tushib ketardi.
// =============================================================
console.log('\n6. Kunlar kesimi');

const HOZIR = new Date(2026, 8, 11, 14, 0); // 11.09.2026, payshanba

tekshir('bugun → «Bugun»', E.kunYorligi(new Date(2026, 8, 11, 9, 0), HOZIR) === 'Bugun');
tekshir('kecha → «Kecha»', E.kunYorligi(new Date(2026, 8, 10, 23, 30), HOZIR) === 'Kecha');
tekshir(
  'oldingi kun — kun, oy va hafta kuni',
  E.kunYorligi(new Date(2026, 8, 9), HOZIR) === '9 sentabr, chorshanba',
  E.kunYorligi(new Date(2026, 8, 9), HOZIR)
);
// O'tgan yil bo'lsa yil ham yozilsin — aks holda "9 sentabr" ikki xil
// yilni bildirib, hisob solishtirib bo'lmasdi
tekshir(
  'o‘tgan yilda yil ham ko‘rinadi',
  /2025/.test(E.kunYorligi(new Date(2025, 8, 9), HOZIR)),
  E.kunYorligi(new Date(2025, 8, 9), HOZIR)
);
// Oy boshida "kecha" oldingi oyga tushadi
tekshir(
  'oy boshida kecha oldingi oyga tushadi',
  E.kunYorligi(new Date(2026, 7, 31), new Date(2026, 8, 1, 10, 0)) === 'Kecha'
);
// Kechasi soat 23:30 da yozilgan yozuv O'SHA kunga tegishli bo'lsin
tekshir(
  'kalit mahalliy kun bo‘yicha (UTC emas)',
  E.kunKaliti(new Date(2026, 8, 11, 23, 30)) === '2026-09-11',
  E.kunKaliti(new Date(2026, 8, 11, 23, 30))
);

const AMALLAR = [
  { id: 'a', sana: new Date(2026, 8, 9, 10, 0).toISOString(), tur: 'chiqim', summa: 1000 },
  { id: 'b', sana: new Date(2026, 8, 9, 16, 0).toISOString(), tur: 'kirim', summa: 400 },
  { id: 'c', sana: new Date(2026, 8, 11, 9, 0).toISOString(), tur: 'chiqim', summa: 2000 },
  { id: 'd', sana: new Date(2026, 8, 11, 18, 0).toISOString(), tur: 'chiqim', summa: 3000 },
];

const kunlar = E.kunlarga(AMALLAR, (a) => a.sana, HOZIR);
tekshir('ikki kunga bo‘lindi', kunlar.length === 2, kunlar.length + ' kun');
tekshir('birinchi kun 9-sentabr', kunlar[0].kalit === '2026-09-09', kunlar[0].kalit);
tekshir('9-sentabrda ikki yozuv', kunlar[0].qatorlar.length === 2);
tekshir('bugungi kun yorlig‘i', kunlar[1].yorliq === 'Bugun', kunlar[1].yorliq);
// Bir kunda IKKI chiqim — aynan shu holat ajralib turishi kerak edi
tekshir('bugun ikkita chiqim bir guruhda', kunlar[1].qatorlar.length === 2);
tekshir(
  'tartib saqlanadi',
  kunlar[1].qatorlar.map((a) => a.id).join('') === 'cd',
  kunlar[1].qatorlar.map((a) => a.id).join('')
);
tekshir(
  'birorta yozuv yo‘qolmadi',
  kunlar.reduce((n, k) => n + k.qatorlar.length, 0) === AMALLAR.length
);
tekshir('bo‘sh ro‘yxat bo‘sh natija beradi', E.kunlarga([], (a) => a.sana).length === 0);

console.log(`\n  hujjatlar: ${kesh}`);
console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
