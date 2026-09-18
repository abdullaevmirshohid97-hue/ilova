// =============================================================
//  CREDIT DEBIT — RAQAM VA PUL SINOVI
//
//  Robot odam gapirgan matndan summani ajratadi. Bu yerda eng katta
//  xavf "xato" emas — JIM xato: model 2 000 000 o'rniga 2 000 yozib
//  qo'ysa, ekranda hammasi to'g'ri ko'rinadi, shunchaki pul kam
//  bo'ladi. Shuning uchun raqam modelga emas, deterministik kodga
//  topshirilgan va shu sinov uni qo'riqlaydi.
//
//  Ikkinchi qism — tiyin. JS'da 0.1 + 0.2 = 0.30000000000000004,
//  ya'ni pulni float'da yuritib bo'lmaydi. Bu loyihada kasr bir marta
//  jimgina kesilgan (RPC o'zgaruvchisi eski aniqlikda qolgan edi).
//
//  Ishga tushirish:  node tests/kassa-raqam.mjs
//  (bazaga tegmaydi — internetsiz ham ishlaydi)
// =============================================================

import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

const ish = mkdtempSync(join(tmpdir(), 'kassa-'));
const chiqish = join(ish, 'yadro.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'packages/kassa-yadro/index.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const Y = await import('file://' + chiqish.replace(/\\/g, '/'));

console.log('\n\x1b[1mCREDIT DEBIT — RAQAM VA PUL\x1b[0m');

// ---------- 1. So'z bilan aytilgan summa ----------
console.log('\n1. So‘z bilan aytilgan summa');

const SOZ = [
  ['ikki million', 2_000_000],
  ['ikki million so‘m', 2_000_000],
  ['bir million besh yuz ming', 1_500_000],
  ['besh yuz ming', 500_000],
  ['yigirma besh ming', 25_000],
  ['uch yuz ellik ming', 350_000],
  ['bir milliard', 1_000_000_000],
  ['yarim million', 500_000],
  ['bir yarim million', 1_500_000],
  ['o‘n ming', 10_000],
  ['to‘qson to‘qqiz ming', 99_000],
  ['yetti yuz', 700],
  ['sakson besh ming', 85_000],
];

for (const [matn, kutilgan] of SOZ) {
  const r = Y.raqamTahlil(matn);
  const som = r.qiymat === null ? null : r.qiymat / 100;
  tekshir(`"${matn}" → ${kutilgan.toLocaleString('ru')}`, som === kutilgan, String(som));
}

// ---------- 2. Qo'shimchali shakllar ----------
// "Ahmadga ikki millionga mahsulot berdim" — gap ichida, qo'shimcha bilan
console.log('\n2. Gap ichida, qo‘shimcha bilan');

const GAP = [
  ['Ahmadga ikki millionga mahsulot berdim', 2_000_000],
  ['bugun uch yuz mingga benzin quydim', 300_000],
  ['Jamshid besh million so‘m qarzini to‘ladi', 5_000_000],
  ['elektrga bir yuz ellik ming to‘ladim', 150_000],
  ['ikki millionlik tovar oldim', 2_000_000],
];

for (const [matn, kutilgan] of GAP) {
  const r = Y.raqamTahlil(matn);
  const som = r.qiymat === null ? null : r.qiymat / 100;
  tekshir(`"${matn.slice(0, 38)}…" → ${kutilgan.toLocaleString('ru')}`, som === kutilgan, String(som));
}

// ---------- 3. Raqam bilan yozilgan ----------
console.log('\n3. Raqam bilan');

const RAQAM = [
  ['2000000', 2_000_000],
  ['2 000 000', 2_000_000],
  ['2.000.000', 2_000_000],
  ['2,000,000', 2_000_000],
  ['2 mln', 2_000_000],
  ['2mln', 2_000_000],
  ['500k', 500_000],
  ['450 ming', 450_000],
  ['1 500 000 so‘m', 1_500_000],
];

for (const [matn, kutilgan] of RAQAM) {
  const r = Y.raqamTahlil(matn);
  const som = r.qiymat === null ? null : r.qiymat / 100;
  tekshir(`"${matn}" → ${kutilgan.toLocaleString('ru')}`, som === kutilgan, String(som));
}

// ---------- 4. NOANIQLIK — eng muhim qism ----------
// Robot bu holatda YOZMASLIGI va so'rashi kerak.
console.log('\n4. Noaniqlik so‘ralsin (taxmin qilinmasin)');

for (const matn of ['Ahmadga ikkiga berdim', 'beshga oldim', '2', 'o‘nga sotdim']) {
  const r = Y.raqamTahlil(matn);
  tekshir(
    `"${matn}" — aniq emas deb belgilanadi`,
    r.aniq === false && Array.isArray(r.nomzodlar) && r.nomzodlar.length === 3,
    r.aniq ? 'TAXMIN QILDI: ' + r.qiymat / 100 : r.sabab,
  );
}

// Shkala aytilgan bo'lsa — aniq
for (const [matn, kutilgan] of [['ikki ming', 2000], ['ikki million', 2_000_000]]) {
  const r = Y.raqamTahlil(matn);
  tekshir(`"${matn}" — aniq`, r.aniq === true && r.qiymat / 100 === kutilgan, String(r.qiymat / 100));
}

// Summa yo'q bo'lsa — null, taxmin yo'q
const bosh = Y.raqamTahlil('Ahmadga mahsulot berdim');
tekshir('summasiz gapda qiymat yo‘q', bosh.qiymat === null && bosh.aniq === false, String(bosh.qiymat));

// ---------- 5. Valyuta ----------
console.log('\n5. Valyuta');

tekshir("so'm tanildi", Y.raqamTahlil("ikki million so'm").valyuta === 'UZS');
tekshir('dollar tanildi', Y.raqamTahlil('ikki ming dollar').valyuta === 'USD');
tekshir('aytilmasa — bo‘sh', Y.raqamTahlil('ikki million').valyuta === undefined);

// ---------- 6. Tiyin: kasr yo'qolmasin ----------
console.log('\n6. Tiyin (kasr yo‘qolmasin)');

tekshir('"1234.56" → 123456 tiyin', Y.tiyinga('1234.56') === 123456, String(Y.tiyinga('1234.56')));
tekshir('"1234.5" → 123450 tiyin', Y.tiyinga('1234.5') === 123450, String(Y.tiyinga('1234.5')));
tekshir('"0.01" → 1 tiyin', Y.tiyinga('0.01') === 1, String(Y.tiyinga('0.01')));
tekshir('"-500.25" → -50025', Y.tiyinga('-500.25') === -50025, String(Y.tiyinga('-500.25')));
tekshir('bo‘sh → 0', Y.tiyinga(null) === 0 && Y.tiyinga('') === 0);
tekshir('123456 → "1234.56"', Y.bazaga(123456) === '1234.56', Y.bazaga(123456));
tekshir('5 → "0.05"', Y.bazaga(5) === '0.05', Y.bazaga(5));

// Float bo'lsa yiqiladigan hisob: 0.1 + 0.2
const uchdan = Y.tiyinga('0.10') + Y.tiyinga('0.20');
tekshir('0.10 + 0.20 = 0.30 (float emas)', Y.bazaga(uchdan) === '0.30', Y.bazaga(uchdan));

// Katta summa: milliardlar ham butun qoladi
const katta = Y.tiyinga('987654321.99');
tekshir('987 654 321.99 buzilmaydi', Y.bazaga(katta) === '987654321.99', Y.bazaga(katta));

// ---------- 7. Formatlash (Intl'siz) ----------
console.log('\n7. Formatlash');

tekshir(
  "2 000 000 so'm",
  Y.formatla(200_000_000, 'UZS') === "2 000 000 so'm",
  Y.formatla(200_000_000, 'UZS'),
);
tekshir("so'mda kasr ko‘rinmaydi", Y.formatla(500_000, 'UZS') === "5 000 so'm", Y.formatla(500_000, 'UZS'));
tekshir("so'mda kasr bo‘lsa ko‘rinadi", Y.formatla(500_050, 'UZS') === "5 000,50 so'm", Y.formatla(500_050, 'UZS'));
tekshir('dollarda ikki xona, belgi oldinda', Y.formatla(500, 'USD') === '$5.00', Y.formatla(500, 'USD'));
tekshir('katta dollar summasi', Y.formatla(165_000, 'USD') === '$1 650.00', Y.formatla(165_000, 'USD'));
tekshir('manfiy summa', Y.formatla(-123_400, 'UZS').startsWith('−1 234'), Y.formatla(-123_400, 'UZS'));
tekshir('manfiy dollar: minus belgidan oldin', Y.formatla(-500, 'USD') === '−$5.00', Y.formatla(-500, 'USD'));
tekshir('nol', Y.formatla(0, 'UZS') === "0 so'm", Y.formatla(0, 'UZS'));

// Intl ishlatilmaganini kodning o'zidan tekshiramiz: Telegram WebView'da
// u RangeError berib oq ekran qilgan.
const { readFileSync } = await import('node:fs');
const pulKod = readFileSync(join(ROOT, 'packages/kassa-yadro/pul.ts'), 'utf8');
tekshir('Intl ishlatilmagan', !/\bIntl\./.test(pulKod), 'kodda Intl. topilmadi');
tekshir('toLocaleString ishlatilmagan', !/toLocaleString/.test(pulKod));

// ---------- 8. Kalkulyator klaviaturasi ----------
// Rasmlardagi ilovada summa maydonida + - * / bor: odam "1200+300" yozadi
console.log('\n8. Kalkulyator (1200+300)');

tekshir('"1200+300" → 1500', Y.ifodaHisobla('1200+300') === 150_000, String(Y.ifodaHisobla('1200+300')));
tekshir('"1200 + 300" (probel bilan)', Y.ifodaHisobla('1200 + 300') === 150_000);
tekshir('"2*3000" → 6000', Y.ifodaHisobla('2*3000') === 600_000);
tekshir('"(1000+500)*2" → 3000', Y.ifodaHisobla('(1000+500)*2') === 300_000);
tekshir('"10000/4" → 2500', Y.ifodaHisobla('10000/4') === 250_000);
tekshir('"1200.50" → 1200.50', Y.ifodaHisobla('1200.50') === 120_050);
tekshir('"1200,50" (vergul)', Y.ifodaHisobla('1200,50') === 120_050);
tekshir('nolga bo‘linish → null', Y.ifodaHisobla('100/0') === null);
tekshir('yopilmagan qavs → null', Y.ifodaHisobla('(100+2') === null);
tekshir('harf → null', Y.ifodaHisobla('100+abc') === null);
tekshir('bo‘sh → null', Y.ifodaHisobla('') === null);

// ---------- 9. Ming ajratgich (faqat ko‘rinish) ----------
// Ajratgich summani O‘ZGARTIRMASLIGI shart. Agar u hisobga
// tushib qolsa, "1 200" 1 ga aylanib ketishi mumkin edi — jim
// xato, ekranda hammasi joyida ko‘rinadi.
console.log('\n9. Ming ajratgich');

tekshir('1200000 → "1 200 000"', Y.ifodaKorinish('1200000') === '1 200 000', Y.ifodaKorinish('1200000'));
tekshir('100 o‘zgarmaydi', Y.ifodaKorinish('100') === '100');
tekshir('1000 → "1 000"', Y.ifodaKorinish('1000') === '1 000');
tekshir('amal belgisi saqlanadi', Y.ifodaKorinish('1200000+50000') === '1 200 000+50 000', Y.ifodaKorinish('1200000+50000'));
tekshir('kasr ajratilmaydi', Y.ifodaKorinish('1200.50') === '1 200.50', Y.ifodaKorinish('1200.50'));
tekshir('yarim yozilgan kasr', Y.ifodaKorinish('1200.') === '1 200.', Y.ifodaKorinish('1200.'));
tekshir('bo‘sh matn', Y.ifodaKorinish('') === '');

// Eng muhimi: ajratgich qo‘yilgan matn ham AYNAN o‘sha summani beradi
for (const x of ['1200000', '1200000+50000', '2*3000', '1200.50', '(1000+500)*2']) {
  tekshir(
    'ajratgichdan keyin summa o‘zgarmadi: ' + x,
    Y.ifodaHisobla(Y.ifodaKorinish(x)) === Y.ifodaHisobla(x),
    String(Y.ifodaHisobla(Y.ifodaKorinish(x))),
  );
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
