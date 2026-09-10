// =============================================================
//  PRAYS BLOKLARI SINOVI
//
//  Ta'minotchining prays fayli BITTA jadval emas. Jonli faylda uchta:
//    1) asosiy ro'yxat (~3 600 qator)
//    2) "ҚЎШИМЧАЛАР"         № | Nomi | Цена СПЕЦ | Цена Реал | Орг.упк | ...
//    3) "Внимание! Акции!!!" № | Nomi | Акция | Цена без акции | Цена после | ...
//
//  Ular BOSHQA ustun tartibida. Robot esa butun varaqqa BITTA
//  moslashtirish qo'llardi va oqibati jonli bazada shunday bo'lgan:
//
//    aksiya blokida 3-ustun narx emas, "Акция" ("5+1") edi
//    songa("5+1") = 51
//    63 800 so'mlik Алдобел skladda 51 so'm bo'lib qoldi
//
//  56 ta pozitsiya shunday buzilgan (54 tasi aynan 31/41/51/101 —
//  ya'ni "3+1", "4+1", "5+1", "10+1"). Sotuv narxi ham shundan
//  hisoblangan. Sotuv bo'lmagani uchun pul yo'qolmagan.
//
//  Yana bir oqibat: blok sarlavhalari dori bo'lib qolgan — katalogda
//  "Наименование товаров" degan dori bor, ishlab chiqaruvchisi
//  "Производитель", va u skladga ham tushgan.
//
//  Sinov faylni HAQIQATAN yasaydi va robotga o'qitadi: kod o'qish
//  "ustun qaysi indeksda" degan savolga javob bermaydi.
//
//  Ishga tushirish:  node tests/prays-bloklar.mjs
// =============================================================

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';
import * as XLSX from 'xlsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

// ---------- Robotni yuklaymiz ----------
//
// Bundle LOYIHA ichiga yoziladi (node_modules/.cache), tmpdir'ga emas.
// Sabab: xlsx CommonJS kutubxona, uni ESM bundle ichiga qo'shsak
// "Dynamic require of stream is not supported" bilan yiqiladi.
// Tashqarida qoldirilsa esa vaqtinchalik papkadan node_modules
// ko'rinmaydi. Loyiha ichida ikkala muammo ham yo'q.
const kesh = join(ROOT, 'node_modules/.cache/prays-bloklar');
mkdirSync(kesh, { recursive: true });
const chiqish = join(kesh, 'robot.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/faktura-robot.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['xlsx'],
});
const R = await import('file://' + chiqish.replace(/\\/g, '/'));

// ---------- Fayl yasaymiz (rasmdagi tuzilish) ----------
//
// Ustunlar ATAYLAB rasmdagidek: asosiy blokda narx 3-ustunda, aksiya
// blokida 3-ustun "Акция". Aynan shu farq xatoga sabab bo'lgan.

const ASOSIY = [
  ['Прайс-лист', null, null, null, null, null, null],
  ['№', 'Наименование товаров', 'Сотув нархи', 'Ваш заказ', 'Сумма заказ', 'Производитель', 'Срок годности'],
  [1, 'Парацетамол таб 500мг №10', 12000, null, null, 'Нобел-Фармасаноат', '01.04.2027'],
  [2, 'Анальгин таб 500мг №10', 8500, null, null, 'Spring Pharmaceutic', '01.06.2028'],
  [3, 'Аспирин таб 500мг №20', 15400, null, null, 'Bayer', '01.09.2029'],
];

// Qatorlar rasmdagi haqiqiy qiymatlar bilan
const QOSHIMCHA = [
  [null, null, null, null, null, null, null],
  ['ҚЎШИМЧАЛАР', null, null, null, null, null, null],
  ['№', 'Наименование товаров', 'Цена СПЕЦ', 'Цена Реал', 'Орг. упк', 'Производитель', 'Срок годности'],
  [1, 'Гетры эластичный "GT" р. 1', 6208, 6400, 80, 'Elastic Medical Tex', '01.04.2029'],
  [2, 'Корфлам таб №100', 57715, 59500, 100, 'Индия', '01.10.2026'],
  [3, 'Стекавит капс. №30', 116400, 120000, 1, 'Ilacsan Medikal', '01.12.2028'],
];

const AKSIYA = [
  [null, null, null, null, null, null, null],
  ['Внимание! Акции!!!', null, null, null, null, null, null],
  ['№', 'Наименование товаров', 'Акция', 'Цена без акции', 'Цена после акции', 'Производитель', 'Срок годности'],
  [1, 'Алдобел 100 таб №30', '5+1', 63800, 53167, 'Нобел-Фармасаноат', '01.04.2027'],
  [2, 'Алдобел 25 таб №28', '4+1', 23000, 18400, 'Нобел-Фармасаноат', '01.04.2028'],
  [3, 'Анзибел таб со вкусом имбиря №30', '10+1', 51000, 46364, 'Нобел-Фармасаноат', '01.12.2027'],
  [4, 'Воксабан 10 таб №28', '3+1', 107800, 80850, 'Нобел-Фармасаноат', '01.11.2027'],
];

function faylYasa(bloklar) {
  const ws = XLSX.utils.aoa_to_sheet(bloklar.flat());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Прайс');
  const bufer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return bufer;
}

console.log('\n\x1b[1mPRAYS BLOKLARI\x1b[0m');

const bayt = faylYasa([ASOSIY, QOSHIMCHA, AKSIYA]);
const natija = R.faylniOqi(bayt, 'sinov-prays.xlsx');

// ---------- 1. Bloklar ----------
console.log('\n1. Bloklar topildi');

const bl = natija.bloklar ?? [];
tekshir('uchta blok topildi', bl.length === 3, bl.length + ' ta');
tekshir(
  'bo‘limlar to‘g‘ri tanildi',
  bl.map((b) => b.bolim).join(',') === 'asosiy,qoshimcha,aksiya',
  bl.map((b) => `${b.bolim}(${b.qatorSoni})`).join(' · ')
);

const asosiy = natija.qatorlar.filter((q) => q.bolim === 'asosiy');
const qosh = natija.qatorlar.filter((q) => q.bolim === 'qoshimcha');
const aks = natija.qatorlar.filter((q) => q.bolim === 'aksiya');

tekshir('asosiy: 3 qator', asosiy.length === 3, asosiy.length + ' ta');
tekshir('qo‘shimcha: 3 qator', qosh.length === 3, qosh.length + ' ta');
tekshir('aksiya: 4 qator', aks.length === 4, aks.length + ' ta');

// ---------- 2. Axlat qator bo'lmasin ----------
console.log('\n2. Sarlavha va blok nomi dori bo‘lib qolmasin');

const AXLAT = ['Наименование товаров', 'ҚЎШИМЧАЛАР', 'Внимание! Акции!!!', '№', 'Прайс-лист'];
for (const a of AXLAT) {
  const bor = natija.qatorlar.find((q) => (q.name ?? '').trim() === a);
  tekshir(`"${a}" dori bo‘lmadi`, !bor, bor ? 'KATALOGGA TUSHDI!' : '');
}

// ---------- 3. Aksiya narxi — asosiy xato ----------
console.log('\n3. Aksiya bloki');

const alдobel = aks.find((q) => (q.name ?? '').startsWith('Алдобел 100'));
tekshir('Алдобел 100 topildi', Boolean(alдobel));
if (alдobel) {
  tekshir(
    'narx = «Цена без акции» (63 800)',
    alдobel.price === 63800,
    'olingan: ' + alдobel.price
  );
  tekshir(
    'narx 51 EMAS (songa("5+1") tuzog‘i)',
    alдobel.price !== 51,
    alдobel.price === 51 ? 'AYNAN ESKI XATO QAYTDI' : ''
  );
  tekshir('aksiya sharti «5+1» saqlandi', alдobel.aksiya === '5+1', String(alдobel.aksiya));
  tekshir('aksiya narxi 53 167', alдobel.aksiya_narx === 53167, String(alдobel.aksiya_narx));
  tekshir('ishlab chiqaruvchi o‘qildi', alдobel.manufacturer === 'Нобел-Фармасаноат', String(alдobel.manufacturer));
  tekshir('muddat o‘qildi', alдobel.expiry === '2027-04-01', String(alдobel.expiry));
}

// Hamma aksiya qatorida shart matn bo'lib qolsin, narx esa son
const shartlar = aks.map((q) => q.aksiya);
tekshir(
  'hamma aksiya sharti matn bo‘lib qoldi',
  shartlar.every((s) => typeof s === 'string' && s.includes('+')),
  shartlar.join(', ')
);
const arzon = aks.filter((q) => (q.price ?? 0) < 1000);
tekshir(
  'aksiya narxlari orasida arzon (shartdan kelgan) yo‘q',
  arzon.length === 0,
  arzon.map((q) => `${q.name}=${q.price}`).join('; ')
);

// ---------- 4. Qo'shimchalar bloki ----------
console.log('\n4. Qo‘shimchalar bloki');

const korflam = qosh.find((q) => (q.name ?? '').startsWith('Корфлам'));
tekshir('Корфлам topildi', Boolean(korflam));
if (korflam) {
  // Foydalanuvchi tanlovi: baza narx = «Цена СПЕЦ» (hozir jonli bazada
  // ham shunday va to'g'ri tushgan)
  tekshir('narx = «Цена СПЕЦ» (57 715)', korflam.price === 57715, 'olingan: ' + korflam.price);
  tekshir('«Цена Реал» saqlandi (59 500)', korflam.narx_real === 59500, String(korflam.narx_real));
  tekshir('«Орг. упк» saqlandi (100)', korflam.org_upk === 100, String(korflam.org_upk));
}

// ---------- 5. Asosiy blok buzilmadi ----------
console.log('\n5. Asosiy blok');

const paracetamol = asosiy.find((q) => (q.name ?? '').startsWith('Парацетамол'));
tekshir('Парацетамол topildi', Boolean(paracetamol));
if (paracetamol) {
  tekshir('narx 12 000', paracetamol.price === 12000, String(paracetamol.price));
  tekshir('aksiya maydoni bo‘sh', paracetamol.aksiya === undefined, String(paracetamol.aksiya));
  // "Ваш заказ" mijoz to'ldiradigan ustun — miqdor deb olinmasin
  tekshir('«Ваш заказ» miqdor bo‘lmadi', paracetamol.qty === undefined, String(paracetamol.qty));
}

// ---------- 6. Bitta blokli fayl ham ishlasin ----------
console.log('\n6. Eski (bitta blokli) fayl');

const yolgiz = R.faylniOqi(faylYasa([ASOSIY]), 'yolgiz.xlsx');
tekshir('bitta blok', (yolgiz.bloklar ?? []).length === 1, (yolgiz.bloklar ?? []).length + ' ta');
tekshir('uchala qator o‘qildi', yolgiz.qatorlar.length === 3, yolgiz.qatorlar.length + ' ta');
tekshir('hammasi asosiy', yolgiz.qatorlar.every((q) => q.bolim === 'asosiy'));
tekshir('moslashtirish qaytdi', yolgiz.moslash.name !== undefined && yolgiz.moslash.price !== undefined);

// ---------- 7. Eksport hujjati uch bo'limda ----------
//
// Hujjat HAQIQATAN yasaladi va qayta ochiladi. Kod o'qish "sarlavha
// qaysi katakda" degan savolga javob bermaydi — jonli xato aynan
// shunday joyda bo'lgan (jadval varaqdan chiqib ketgani kod bo'yicha
// bilinmasdi).
console.log('\n7. Eksport hujjati');

const eksportChiqish = join(kesh, 'eksport.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/prays-eksport.ts')],
  outfile: eksportChiqish,
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['exceljs'],
});
const E = await import('file://' + eksportChiqish.replace(/\\/g, '/'));

const EKSPORT_QATORLAR = [
  { bolim: 'asosiy', nomi: 'Парацетамол таб 500мг №10', narx: 14000, yaroqlilik: '2027-04-01', ishlab_chiqaruvchi: 'Нобел' },
  { bolim: 'asosiy', nomi: 'Алдобел 100 таб №30', narx: 70000, yaroqlilik: '2027-04-01', ishlab_chiqaruvchi: 'Нобел' },
  { bolim: 'qoshimcha', nomi: 'Корфлам таб №100', narx: 57715, narx_real: 59500, org_upk: 100, yaroqlilik: '2026-10-01', ishlab_chiqaruvchi: 'Индия' },
  { bolim: 'aksiya', nomi: 'Алдобел 100 таб №30', narx: 63800, aksiya: '5+1', aksiya_narx: 53167, yaroqlilik: '2027-04-01', ishlab_chiqaruvchi: 'Нобел' },
  { bolim: 'aksiya', nomi: 'Воксабан 10 таб №28', narx: 107800, aksiya: '3+1', aksiya_narx: 80850, yaroqlilik: '2027-11-01', ishlab_chiqaruvchi: 'Нобел' },
];

const hujjatBayt = await E.praysKitobi(EKSPORT_QATORLAR, 'IDAA FARM', new Date(2026, 8, 11));

const ExcelJS = (await import('exceljs')).default;
const kitob = new ExcelJS.Workbook();
await kitob.xlsx.load(hujjatBayt);
const varaq = kitob.worksheets[0];

// Varaqni matn qatorlariga aylantiramiz
const satrMatn = [];
varaq.eachRow({ includeEmpty: true }, (r, i) => {
  const kataklar = [];
  r.eachCell({ includeEmpty: true }, (c) => {
    const v = c.value;
    kataklar.push(v && typeof v === 'object' && 'formula' in v ? '=' + v.formula : String(v ?? ''));
  });
  satrMatn[i] = kataklar;
});
// satrMatn SIYRAK massiv (eachRow bo'sh qatorlarni tashlab ketadi).
// .map siyrak joylarni O'TKAZIB yuboradi va teshik qoladi 2014 Array.from
// esa hammasini aylanadi.
const yassi = Array.from(satrMatn, (s) => (s ?? []).join(' | '));

const qoshIndeks = yassi.findIndex((s) => s.includes('ҚЎШИМЧАЛАР'));
const aksIndeks = yassi.findIndex((s) => s.includes('Внимание! Акции!!!'));

tekshir('«ҚЎШИМЧАЛАР» sarlavhasi bor', qoshIndeks > 0, 'qator ' + qoshIndeks);
tekshir('«Внимание! Акции!!!» sarlavhasi bor', aksIndeks > 0, 'qator ' + aksIndeks);
tekshir(
  'aksiya QO‘SHIMCHALARDAN KEYIN turadi',
  qoshIndeks > 0 && aksIndeks > qoshIndeks,
  `qoshimcha=${qoshIndeks}, aksiya=${aksIndeks}`
);

// Qo'shimchalar jadvalining ustunlari
const qoshSarlavha = (satrMatn[qoshIndeks + 1] ?? []).join(' | ');
tekshir('qo‘shimcha ustunlari: Цена СПЕЦ va Цена Реал', /Цена СПЕЦ/.test(qoshSarlavha) && /Цена Реал/.test(qoshSarlavha), qoshSarlavha);
tekshir('qo‘shimcha ustunlari: Орг. упк', /Орг\. упк/.test(qoshSarlavha));

const korflamQator = (satrMatn[qoshIndeks + 2] ?? []).join(' | ');
tekshir('Корфлам qatori narxlari bilan', /57715/.test(korflamQator) && /59500/.test(korflamQator) && /100/.test(korflamQator), korflamQator);

// Aksiya jadvalining ustunlari
const aksSarlavha = (satrMatn[aksIndeks + 1] ?? []).join(' | ');
tekshir('aksiya ustunlari: Акция', /Акция/.test(aksSarlavha), aksSarlavha);
tekshir('aksiya ustunlari: ikkala narx', /Цена без акции/.test(aksSarlavha) && /Цена после акции/.test(aksSarlavha));

const aksQator = satrMatn[aksIndeks + 2] ?? [];
tekshir('aksiya sharti «5+1» MATN bo‘lib chiqdi', aksQator.includes('5+1'), aksQator.join(' | '));
tekshir('aksiya narxlari 63 800 va 53 167', aksQator.includes('63800') && aksQator.includes('53167'), aksQator.join(' | '));

// Asosiy jadvalning yig'indisi FAQAT asosiy qatorlarni qamrasin —
// aks holda aksiya jadvali ham qo'shilib, umumiy summa yolg'on chiqardi
const jamiFormula = yassi.find((s) => s.includes('=SUM(E'));
tekshir(
  'umumiy summa faqat asosiy jadvalni qamraydi',
  /=SUM\(E6:E7\)/.test(jamiFormula ?? ''),
  jamiFormula ?? 'topilmadi'
);

// Bo'limsiz (eski) chaqiruv ham ishlasin
const eskiBayt = await E.praysKitobi(
  [{ nomi: 'Аспирин', narx: 15400, yaroqlilik: '2029-09-01', ishlab_chiqaruvchi: 'Bayer' }],
  'IDAA FARM',
  new Date(2026, 8, 11)
);
const kitob2 = new ExcelJS.Workbook();
await kitob2.xlsx.load(eskiBayt);
const yassi2 = [];
kitob2.worksheets[0].eachRow((r) => {
  const k = [];
  r.eachCell({ includeEmpty: true }, (c) => k.push(String(c.value ?? '')));
  yassi2.push(k.join(' | '));
});
tekshir('bo‘limsiz chaqiruvda qo‘shimcha jadval chizilmaydi', !yassi2.some((s) => s.includes('ҚЎШИМЧАЛАР')));
tekshir('bo‘limsiz chaqiruvda dori qatori bor', yassi2.some((s) => s.includes('Аспирин')));

console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
