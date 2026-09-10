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

console.log(`\n  hujjatlar: ${kesh}`);
console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
