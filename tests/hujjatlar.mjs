// =============================================================
//  CHOP ETILADIGAN HUJJATLAR SINOVI
//
//  To'rtta hujjat (faktura, yig'ish varaqasi, katalog, hisobot)
//  endi bitta asosdan quriladi va tenantning sozlamasini o'qiydi.
//
//  Ikki xil tekshiruv bor:
//
//   1) HAQIQIY ISHLATIB KO'RISH - lib/hujjat.ts esbuild bilan
//      yig'iladi (supabase o'rniga qo'g'irchoq qo'yiladi) va uslub
//      haqiqiy sozlama bilan chaqiriladi. Ya'ni "A5 tanlansa
//      hujjatda A5 chiqadimi" degan savolga kod o'qib emas, natijani
//      ko'rib javob beriladi.
//
//   2) NAQSH TEKSHIRUVI - pop-up muammosi uchun. `window.open` ni
//      `await` dan KEYIN chaqirsa, brauzer uni bloklaydi va hujjat
//      umuman ochilmaydi. Bu xato hech qanday xato xabari bermaydi -
//      shunchaki hech narsa bo'lmaydi. Shuning uchun har to'rt
//      funksiyada oyna birinchi await'dan oldin ochilishini
//      tekshiramiz.
//
//  Ishga tushirish:  node tests/hujjatlar.mjs
// =============================================================

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
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

console.log('\n\x1b[1mCHOP ETILADIGAN HUJJATLAR\x1b[0m');

// ---------- 1. Asosni haqiqatan ishlatib ko'ramiz ----------
console.log('\n1. Sozlama hujjatga yetib boradimi');

const ish = mkdtempSync(join(tmpdir(), 'hujjat-'));
const kirish = join(ish, 'kirish.ts');
const chiqish = join(ish, 'hujjat.mjs');

// supabase importini qo'g'irchoq bilan almashtiramiz: bu sinov tarmoqqa
// chiqmaydi, faqat uslub/blank/imzo funksiyalarini tekshiradi.
writeFileSync(
  kirish,
  `export * from ${JSON.stringify(join(ROOT, 'apps/admin/src/lib/hujjat.ts').replace(/\\/g, '/'))};`,
);

const qogirchoq = join(ish, 'supabase-qogirchoq.ts');
writeFileSync(qogirchoq, 'export const supabase = {} as any;\n');

// esbuild'ning JS API'si: .cmd faylini ishga tushirish Windows'da
// spawnSync EINVAL beradi, API esa hamma tizimda bir xil ishlaydi.
// `alias` nisbiy yo'lni qabul qilmaydi, shuning uchun kichik plagin.
await esbuild.build({
  entryPoints: [kirish],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: chiqish,
  logLevel: 'error',
  plugins: [
    {
      name: 'supabase-qogirchoq',
      setup(build) {
        build.onResolve({ filter: /(^|\/)supabase$/ }, () => ({ path: qogirchoq }));
      },
    },
  ],
});

const H = await import('file://' + chiqish.replace(/\\/g, '/'));

const SOZLAMA = {
  org_id: 'x',
  logo_path: null,
  manzil: "Andijon, Bobur ko'chasi 12",
  telefon: '+998 90 123 45 67',
  stir: '301234567',
  bank: 'Ipoteka Bank',
  hisob_raqam: '20208000900001234567',
  qogoz: 'A5',
  chekka_tepa: 8,
  chekka_past: 9,
  chekka_chap: 10,
  chekka_ong: 11,
  shrift: '"Times New Roman", Times, serif',
  olcham_matn: 13,
  olcham_sarlavha: 26,
  olcham_jadval: 9,
  rang: '#0B7A55',
  ustun_rasm: false,
  ustun_sku: true,
  ustun_razmer: true,
  imzo_topshirdi: 'Berdi',
  imzo_qabul: 'Oldi',
  altbilgi: 'Rahmat!',
  org_nomi: 'Mary Collection',
};

const css = H.uslub(SOZLAMA);

tekshir('qog‘oz o‘lchami', css.includes('size: A5'), 'A5');
// Chekka tartibi CSS'da: tepa o'ng past chap
tekshir('chekka to‘rt tomondan', css.includes('margin: 8mm 11mm 9mm 10mm'), '8/11/9/10 mm');
tekshir('shrift', css.includes('font-family: "Times New Roman"'));
tekshir('matn o‘lchami', css.includes('font-size: 13pt'));
tekshir('jadval o‘lchami', css.includes('font-size: 9pt'));
tekshir('sarlavha o‘lchami', css.includes('font-size: 26pt'));
tekshir('rang', css.includes('#0B7A55'));

const blank = H.blank(SOZLAMA, null, null, { turi: 'Faktura', raqam: 7, sana: '01.09.2026' });
tekshir('blankda biznes nomi', blank.includes('Mary Collection'));
tekshir('blankda manzil', blank.includes('Bobur'));
tekshir('blankda STIR', blank.includes('STIR: 301234567'));
tekshir('blankda bank va hisob', blank.includes('Ipoteka Bank · 20208000900001234567'));
tekshir('blankda raqam', blank.includes('№7'));
tekshir('logosiz ham ishlaydi', !blank.includes('<img'));

const imzo = H.imzo(SOZLAMA);
tekshir('imzo matnlari sozlamadan', imzo.includes('Berdi') && imzo.includes('Oldi'));
tekshir('altbilgi matni', H.altbilgi(SOZLAMA).includes('Rahmat!'));

// Bo'sh sozlama bilan ham yiqilmasin: qator hali yaratilmagan tenant
const bosh = H.uslub({});
tekshir('sozlamasiz ham hujjat quriladi', bosh.includes('size: A4') && bosh.includes('margin: 14mm'));

// XSS: biznes nomi bazadan keladi, ya'ni ishonchli emas
const yovuz = H.blank({ ...SOZLAMA, org_nomi: '<script>alert(1)</script>' }, null, null, { turi: 'T' });
tekshir('nom ekranlanadi (XSS)', !yovuz.includes('<script>'), 'html qochirildi');

// ---------- 2. Pop-up naqshi ----------
console.log('\n2. Oyna await’dan oldin ochiladimi');

const FUNKSIYALAR = [
  ['apps/admin/src/lib/invoice.ts', 'openInvoice', 'faktura'],
  ['apps/admin/src/pages/Orders.tsx', 'printPickList', 'yig‘ish varaqasi'],
  ['apps/admin/src/pages/Products.tsx', 'printCatalog', 'katalog'],
  ['apps/admin/src/pages/Reports.tsx', 'printReport', 'hisobot'],
];

for (const [fayl, fn, nom] of FUNKSIYALAR) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  const bosh = src.indexOf(`function ${fn}(`);
  const tana = src.slice(bosh, bosh + 2500);

  const oyna = tana.indexOf('oynaOch()');
  const kut = tana.indexOf('await ');

  tekshir(
    `${nom}: oyna await’dan oldin`,
    oyna > 0 && (kut < 0 || oyna < kut),
    oyna < 0 ? 'oynaOch topilmadi' : 'ok',
  );
}

// ---------- 3. Eski qattiq yozilgan ko'rinish qolmadimi ----------
console.log('\n3. Ko‘rinish faqat sozlamadan');

for (const [fayl, , nom] of FUNKSIYALAR) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  const yomon = [];
  if (/@page\s*\{/.test(src)) yomon.push('@page');
  if (/font-family:\s*(?!\$)/.test(src)) yomon.push('font-family');
  if (/margin:\s*\d+mm/.test(src)) yomon.push('mm chekka');
  tekshir(`${nom}: qattiq yozilgan qiymat yo‘q`, yomon.length === 0, yomon.join(', ') || 'toza');
}

// Locale nomi qattiq yozilmasin: ICU'si qirqilgan muhitda (Telegram
// WebView) RangeError berib ekranni butunlay bo'sh qoldirgan - bu ikki
// marta bo'lgan.
//
// Tekshiruv FAQAT hujjat yasaydigan funksiya ichida: sahifaning o'zida
// 'uz-UZ' ishlatilishi muammo emas, u oddiy brauzerda ishlaydi va
// hujjatga tegishi yo'q. Butun faylni tekshirganimda aynan shu yolg'on
// xato chiqdi.
for (const [fayl, fn, nom] of [...FUNKSIYALAR, ['apps/admin/src/lib/hujjat.ts', 'altbilgi', 'asos']]) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  const bosh = src.indexOf(`function ${fn}(`);
  const tana = bosh < 0 ? '' : src.slice(bosh, bosh + 3000);
  const bor = /toLocale\w+\(\s*['"][a-z]{2}-[A-Z]{2}['"]/.test(tana);
  tekshir(`${nom}: locale nomi qattiq yozilmagan`, !bor, bor ? 'RangeError xavfi' : 'ok');
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
