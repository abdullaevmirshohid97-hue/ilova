// =============================================================
//  PRAYS HUJJATI SINOVI
//
//  Bu sinov kodni o'qimaydi — hujjatni HAQIQATAN yasab, keyin uni
//  ExcelJS bilan qaytadan ochib tekshiradi. Ya'ni "katak formulasi
//  to'g'ri yozilganmi", "sariq rang o'sha ustundami", "umumiy summa
//  qaysi katakni yig'yaptimi" degan savollarga faylning o'zidan
//  javob olinadi.
//
//  Nega shunday: avval eksport komponent ichida edi va uni faqat
//  "kodda shunday yozilganmi" deb tekshirish mumkin edi. Bunday
//  tekshiruv formulaning noto'g'ri katakka ishora qilishini yoki
//  rangning boshqa ustunga tushib qolishini UMUMAN ushlamaydi.
//
//  Ishga tushirish:  node tests/prays-hujjat.mjs
// =============================================================

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';
import ExcelJS from 'exceljs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mPRAYS HUJJATI\x1b[0m');

// ---------- hujjatni yasaymiz ----------
// Bundl LOYIHA ICHIGA chiqariladi: tashqarida turса, undagi
// import('exceljs') node_modules'ni topolmaydi.
const ish = join(ROOT, 'node_modules', '.cache', 'prays-sinov');
mkdirSync(ish, { recursive: true });
const chiqish = join(ish, 'eksport.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/prays-eksport.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['exceljs'],
  outfile: chiqish,
  logLevel: 'error',
});
const E = await import('file://' + chiqish.replace(/\\/g, '/'));

const QATORLAR = [
  { nomi: 'Analgin 500mg №10', narx: 4390, yaroqlilik: '2027-06-30', ishlab_chiqaruvchi: 'Nobel' },
  { nomi: 'Aspirin 100mg', narx: 12500, yaroqlilik: '2026-11-15', ishlab_chiqaruvchi: 'Bayer' },
  { nomi: 'Vata 100g', narx: 7765, yaroqlilik: null, ishlab_chiqaruvchi: null },
];

const bayt = await E.praysKitobi(QATORLAR, 'IDAA FARM', new Date(2026, 8, 4));
const fayl = join(ish, 'prays.xlsx');
writeFileSync(fayl, Buffer.from(bayt));

// ---------- qaytadan ochamiz ----------
const kitob = new ExcelJS.Workbook();
await kitob.xlsx.readFile(fayl);
const v = kitob.getWorksheet('Прайс');

console.log('\n1. Sarlavha bloki');
tekshir('varaq nomi «Прайс»', !!v);
tekshir('firma nomi 1-qatorda', v.getCell('A1').value === 'IDAA FARM', String(v.getCell('A1').value));
tekshir('«ПРАЙС ЛИСТ» 2-qatorda', v.getCell('A2').value === 'ПРАЙС ЛИСТ');
tekshir('«Прайс-лист» yorlig‘i', v.getCell('A3').value === 'Прайс-лист');
tekshir(
  'sana rus tilida',
  v.getCell('A4').value === '4 сентября 2026 г.',
  String(v.getCell('A4').value),
);
tekshir('«Общая сумма» yorlig‘i', v.getCell('F3').value === 'Общая сумма');

const kok = v.getCell('A1').fill;
tekshir('firma nomi ko‘k fonda', kok?.fgColor?.argb === 'FFB8D9EC', kok?.fgColor?.argb);
tekshir('firma nomi qalin va yotiq', v.getCell('A1').font?.bold === true && v.getCell('A1').font?.italic === true);

console.log('\n2. Ustunlar');
const KUTILGAN = ['№', 'Название', 'Ваш заказ', 'Сотув нархи', 'Сумма заказ', 'Срок годности', 'Производитель'];
const bosh = v.getRow(5);
KUTILGAN.forEach((nom, i) => {
  tekshir(`${i + 1}-ustun «${nom}»`, bosh.getCell(i + 1).value === nom, String(bosh.getCell(i + 1).value));
});
tekshir('sklad ustuni yo‘q', !KUTILGAN.some((u) => /склад|sklad/i.test(u)));
tekshir('seriya ustuni yo‘q', !KUTILGAN.some((u) => /сери|seriya/i.test(u)));

tekshir(
  '«Ваш заказ» sarlavhasi sariq',
  bosh.getCell(3).fill?.fgColor?.argb === 'FFFFFF00',
  bosh.getCell(3).fill?.fgColor?.argb,
);
tekshir(
  'qolgan sarlavhalar kulrang',
  bosh.getCell(2).fill?.fgColor?.argb === 'FFD9D9D9',
  bosh.getCell(2).fill?.fgColor?.argb,
);

console.log('\n3. Ma’lumot qatorlari');
tekshir('3 ta qator yozildi', v.rowCount === 8, `rowCount=${v.rowCount}`);

const q1 = v.getRow(6);
tekshir('tartib raqami', q1.getCell(1).value === 1);
tekshir('nomi', q1.getCell(2).value === 'Analgin 500mg №10');
tekshir('«Ваш заказ» bo‘sh', q1.getCell(3).value == null, String(q1.getCell(3).value));
tekshir('narx son sifatida', q1.getCell(4).value === 4390, String(q1.getCell(4).value));
tekshir('sana kun.oy.yil', q1.getCell(6).value === '30.06.2027', String(q1.getCell(6).value));
tekshir('ishlab chiqaruvchi', q1.getCell(7).value === 'Nobel');

// Eng muhimi: formula to'g'ri katakka ishora qilyaptimi
const f = q1.getCell(5).value;
tekshir(
  'summa formulasi shu qatorga ishora qiladi',
  f?.formula === 'IF(C6="","",C6*D6)',
  f?.formula,
);
const f2 = v.getRow(7).getCell(5).value;
tekshir('keyingi qator formulasi ham surildi', f2?.formula === 'IF(C7="","",C7*D7)', f2?.formula);

tekshir(
  '«Ваш заказ» kataklari ham sariq',
  q1.getCell(3).fill?.fgColor?.argb === 'FFFFFF00',
  q1.getCell(3).fill?.fgColor?.argb,
);

console.log('\n4. Umumiy summa');
const jami = v.getCell('F4').value;
tekshir(
  'yig‘indi «Сумма заказ» ustunini oladi',
  jami?.formula === 'SUM(E6:E8)',
  jami?.formula,
);
tekshir('yig‘indi oxirgi qatorgacha', /E8\)$/.test(jami?.formula ?? ''), 'oxirgi qator 8');

console.log('\n5. Qulaylik');
tekshir('sarlavha qotirilgan', v.views?.[0]?.state === 'frozen' && v.views[0].ySplit === 5, JSON.stringify(v.views?.[0]));
tekshir('nom ustuni keng', (v.getColumn(2).width ?? 0) >= 40, String(v.getColumn(2).width));
tekshir('narx uch xonali ajratma bilan', v.getRow(6).getCell(4).numFmt === '#,##0');

console.log('\n6. Bo‘sh qiymatlar');
const q3 = v.getRow(8);
tekshir('srogi yo‘q dori — bo‘sh katak', q3.getCell(6).value == null || q3.getCell(6).value === '', String(q3.getCell(6).value));
tekshir('ishlab chiqaruvchisi yo‘q — bo‘sh', q3.getCell(7).value == null || q3.getCell(7).value === '');


// ---------- 7. Logo bilan ----------
// Logo hujjat ICHIGA joylanadi, havola bilan emas: mijoz faylni
// ochganda rasm ko'rinishi kerak, u esa bizning yopiq bucket'ga
// kira olmaydi.
console.log('\n7. Logo');

// Eng kichik haqiqiy PNG (1x1) — sinov uchun yetarli
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const baytLogo = await E.praysKitobi(
  QATORLAR,
  'IDAA FARM',
  new Date(2026, 8, 4),
  { bayt: PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength), kengaytma: 'png' },
);
const faylLogo = join(ish, 'prays-logo.xlsx');
writeFileSync(faylLogo, Buffer.from(baytLogo));

const kitob2 = new ExcelJS.Workbook();
await kitob2.xlsx.readFile(faylLogo);
const v2 = kitob2.getWorksheet('Прайс');

tekshir('rasm hujjatga joylandi', (v2.getImages() ?? []).length === 1, String((v2.getImages() ?? []).length));
tekshir('rasm eng yuqorida', (v2.getImages()?.[0]?.range?.tl?.nativeRow ?? 9) === 0);
tekshir(
  'logo bo‘lganda nom B ustundan boshlanadi',
  v2.getCell('B1').value === 'IDAA FARM',
  String(v2.getCell('B1').value),
);
tekshir('logo ustuni kengaytirildi', (v2.getColumn(1).width ?? 0) >= 12, String(v2.getColumn(1).width));
tekshir('sarlavha qatori balandroq', (v2.getRow(1).height ?? 0) > 34, String(v2.getRow(1).height));

// Ustunlar va formula logo bo'lganda ham o'zgarmasligi kerak
tekshir(
  'ustunlar o‘zgarmadi',
  v2.getRow(5).getCell(3).value === 'Ваш заказ' && v2.getRow(5).getCell(5).value === 'Сумма заказ',
);
tekshir(
  'formula o‘zgarmadi',
  (v2.getRow(6).getCell(5).value)?.formula === 'IF(C6="","",C6*D6)',
);

// Logosiz hujjat ham to'g'ri chiqishi kerak
tekshir('logosiz hujjatda rasm yo‘q', (v.getImages() ?? []).length === 0);
tekshir('logosiz nom A ustunda', v.getCell('A1').value === 'IDAA FARM');


// ---------- 8. Sarlavha foni butun kenglikda ----------
// Xato: sarlavha 'A1:F1' deb qo'lda yozilgan edi, jadval esa yetti
// ustunli. Natijada ko'k fon G ustuniga yetmay, sarlavhaning o'ng
// chekkasi oq bo'lib qolardi — mijozga ketadigan hujjatda ko'zga
// darrov tashlanadi.
console.log('\n8. Sarlavha foni');

const OXIRGI_USTUN = 'G'; // 7 ta ustun

tekshir(
  'firma nomi oxirgi ustungacha birlashtirilgan',
  (v.getCell('A1').master ?? v.getCell('A1')).address === 'A1' &&
    v.getCell(OXIRGI_USTUN + '1').isMerged,
  'G1 birlashmaga kiradi',
);
tekshir(
  'oxirgi ustunda ham ko‘k fon bor',
  v.getCell(OXIRGI_USTUN + '1').fill?.fgColor?.argb === 'FFB8D9EC',
  v.getCell(OXIRGI_USTUN + '1').fill?.fgColor?.argb,
);
tekshir(
  '«ПРАЙС ЛИСТ» qatori ham to‘liq',
  v.getCell(OXIRGI_USTUN + '2').fill?.fgColor?.argb === 'FFB8D9EC',
  v.getCell(OXIRGI_USTUN + '2').fill?.fgColor?.argb,
);

// Umumiy summa endi oxirgi ikki ustunda
tekshir(
  '«Общая сумма» o‘ng chekkada',
  v.getCell('F3').value === 'Общая сумма',
  String(v.getCell('F3').value),
);
tekshir(
  'yig‘indi formulasi o‘sha katakda',
  (v.getCell('F4').value)?.formula === 'SUM(E6:E8)',
  (v.getCell('F4').value)?.formula,
);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
rmSync(ish, { recursive: true, force: true });
process.exit(yiqildi === 0 ? 0 : 1);
