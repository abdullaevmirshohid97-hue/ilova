// =============================================================
//  CREDIT DEBIT — TIL SINOVI
//
//  Ikki tilli ilovada eng ko'p uchraydigan nosozlik "xato" emas:
//  ekranning yarmi ruscha, yarmi o'zbekcha bo'lib qoladi. Buni
//  odam ko'radi, biz esa ko'rmaymiz — chunki biz o'zbekcha
//  ishlatamiz.
//
//  Shuning uchun bu sinov KODNI O'QIYDI:
//    1. har bir `tr('…')` uchun ruscha tarjima bormi;
//    2. ekranlarda o'ralmay qolgan o'zbekcha matn bormi;
//    3. oy va hafta nomlari ikkala tilda to'liqmi.
//
//  Ishga tushirish:  node tests/kassa-til.mjs
//  (bazaga tegmaydi)
// =============================================================

import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/kassa');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

function fayllar(dir, natija = []) {
  for (const nom of readdirSync(dir)) {
    const yol = join(dir, nom);
    if (statSync(yol).isDirectory()) fayllar(yol, natija);
    else if (/\.tsx?$/.test(nom)) natija.push(yol);
  }
  return natija;
}

const tilKod = readFileSync(join(APP, 'src/lib/til.ts'), 'utf8');
const hamma = [...fayllar(join(APP, 'src')), join(APP, 'App.tsx')];
const oqish = (f) => readFileSync(f, 'utf8');
const qisqaNom = (f) => f.split(/[\\/]/).pop();

console.log('\n\x1b[1mCREDIT DEBIT — TIL\x1b[0m');

// =============================================================
// 1. Lug'at
// =============================================================
console.log('\n1. Lug‘at');

const bosh = tilKod.indexOf('const RU: Record<string, string> = {');
const oxir = tilKod.indexOf('\n};', bosh);
tekshir('ruscha lug‘at topildi', bosh > 0 && oxir > bosh);

const blok = tilKod.slice(bosh, oxir);
const juftlar = [...blok.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*\n?\s*'((?:[^'\\]|\\.)*)',/gm)];
const lugat = new Map(juftlar.map((m) => [m[1], m[2]]));

tekshir('lug‘at bo‘sh emas', lugat.size > 150, lugat.size + ' ta kalit');

const boshTarjima = [...lugat.entries()].filter(([, v]) => !v.trim());
tekshir(
  'bo‘sh tarjima yo‘q',
  boshTarjima.length === 0,
  boshTarjima.map(([k]) => k).join(', ') || 'toza',
);

// =============================================================
// 2. Har bir tr('…') tarjimaga ega
// =============================================================
console.log('\n2. Kodda ishlatilgan matnlar');

const ishlatilgan = new Map();
for (const f of hamma) {
  if (f.endsWith('til.ts')) continue;
  for (const m of oqish(f).matchAll(/\btr\('((?:[^'\\]|\\.)*)'\)/g)) {
    if (!ishlatilgan.has(m[1])) ishlatilgan.set(m[1], new Set());
    ishlatilgan.get(m[1]).add(qisqaNom(f));
  }
}

tekshir('tr(...) chaqiruvlari topildi', ishlatilgan.size > 100, ishlatilgan.size + ' xil matn');

const tarjimasiz = [...ishlatilgan.keys()].filter((k) => !lugat.has(k));
tekshir(
  'har bir matnning ruschasi bor',
  tarjimasiz.length === 0,
  tarjimasiz.length
    ? tarjimasiz.slice(0, 8).map((k) => `"${k}" (${[...ishlatilgan.get(k)].join(', ')})`).join('; ')
    : 'hammasi tarjima qilingan',
);

// Lug'atda bor, lekin hech qayerda ishlatilmagan kalitlar — ular
// xato emas (hisobot va sinov ham ishlatadi), lekin ko'p bo'lsa
// lug'at eskirgan degani.
const ishlatilmagan = [...lugat.keys()].filter((k) => !ishlatilgan.has(k));
console.log(`  \x1b[90m·\x1b[0m ishlatilmagan kalit: ${ishlatilmagan.length} ta`);

// =============================================================
// 3. O'ralmay qolgan matn
// =============================================================
console.log('\n3. O‘ralmay qolgan o‘zbekcha matn');

// Wrapper bilan BIR XIL qoidalar: JSX matni va nomli xossalar.
// Ular tarjimasiz qolsa, ruscha ekranda o'zbekcha so'z chiqadi.
const XOSSALAR = 'matn|nom|izoh|placeholder|yorliq|sarlavha|xabar';
const kodQiymatlari = new Set([
  'naqd', 'bank', 'karta', 'boshqa', 'kirim', 'chiqim', 'mijoz', 'taminotchi',
  'UZS', 'USD', 'EUR', 'RUB', 'xlsx', 'pdf', 'uz', 'ru',
  // BREND nomlari: ular hech qaysi tilda tarjima qilinmaydi.
  // Lug‘atga «Telegram: Telegram» deb yozish faqat ortiqcha
  // qator bo‘lardi va keyingi odam uni nima uchunligini
  // tushunmasdi.
  'SMS', 'Telegram', 'WhatsApp',
]);

const qoldi = [];
for (const f of hamma) {
  if (f.endsWith('til.ts')) continue;
  for (const satr of oqish(f).split('\n')) {
    const toza = satr.trimStart();
    if (toza.startsWith('//') || toza.startsWith('*') || toza.startsWith('/*')) continue;

    const nomzodlar = [];
    for (const m of satr.matchAll(new RegExp(`\\b(${XOSSALAR})="([^"\\n]{2,})"`, 'g'))) nomzodlar.push(m[2]);
    for (const m of satr.matchAll(/>\s*([A-Z][^<>{}\n]{2,})\s*<\/Text>/g)) nomzodlar.push(m[1]);

    for (const x of nomzodlar) {
      const matn = x.trim();
      if (kodQiymatlari.has(matn)) continue;
      if (!/[A-Za-z]/.test(matn)) continue;
      // Faqat belgi va raqamdan iborat bo'lsa — tarjima kerak emas
      if (!/[a-z]{2}/i.test(matn)) continue;
      qoldi.push(`${qisqaNom(f)}: "${matn}"`);
    }
  }
}
tekshir(
  'ekranlarda o‘ralmagan matn qolmadi',
  qoldi.length === 0,
  qoldi.length ? qoldi.slice(0, 10).join(' | ') : 'toza',
);

// =============================================================
// 4. Sana nomlari
// =============================================================
console.log('\n4. Oy va hafta nomlari');

function royxat(nom, til) {
  const b = tilKod.indexOf(`export const ${nom}: Record<Til, string[]> = {`);
  if (b < 0) return [];
  const qism = tilKod.slice(b, tilKod.indexOf('\n};', b));
  const t = qism.indexOf(`${til}: [`);
  if (t < 0) return [];
  const ichi = qism.slice(t, qism.indexOf('],', t));
  return [...ichi.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

for (const til of ['uz', 'ru']) {
  tekshir(`${til}: 12 ta oy`, royxat('OY_NOMLARI', til).length === 12, royxat('OY_NOMLARI', til).length + ' ta');
  tekshir(`${til}: 7 ta hafta kuni`, royxat('HAFTA_NOMLARI', til).length === 7, royxat('HAFTA_NOMLARI', til).length + ' ta');
}

// Ruscha oy nomlari KIRILLDA bo'lsin: lotinda qolib ketsa
// "sentabr" ruscha ekranda ham turaveradi va buni sezish qiyin.
const ruOylar = royxat('OY_NOMLARI', 'ru');
tekshir(
  'ruscha oylar kirillda',
  ruOylar.every((x) => /[Ѐ-ӿ]/.test(x)),
  ruOylar[8] ?? '—',
);

// O'zbekcha oylar lotinda qolsin
const uzOylar = royxat('OY_NOMLARI', 'uz');
tekshir(
  'o‘zbekcha oylar lotinda',
  uzOylar.every((x) => /^[a-z]+$/.test(x)),
  uzOylar[8] ?? '—',
);

// =============================================================
// 5. Intl hali ham yo'q
// =============================================================
console.log('\n5. Intl ishlatilmagan');

const intlBor = hamma.filter((f) => /\bIntl\.|toLocaleString|toLocaleDate/.test(oqish(f)));
tekshir(
  'til qo‘shilgach ham Intl kirmadi',
  intlBor.length === 0,
  intlBor.map(qisqaNom).join(', ') || 'toza',
);

// =============================================================
// 6. HAQIQATDAN ISHLAYAPTIMI
//
//  Yuqoridagilar kodni O'QIDI. Bu bo'lim esa kodni ISHGA
//  TUSHIRADI: til almashtiriladi va matn haqiqatan o'zgarganini
//  tekshiradi. Lug'at to'liq bo'lib, ulanmay qolgan bo'lsa —
//  faqat shu yerda ko‘rinadi.
// =============================================================
console.log('\n6. Til almashishi');

const ish = mkdtempSync(join(tmpdir(), 'kassa-til-'));
const chiqish = join(ish, 'til.mjs');
await esbuild.build({
  entryPoints: [join(APP, 'src/lib/davr.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const D = await import('file://' + chiqish.replace(/\\/g, '/'));

// davr.ts til.ts ni qayta eksport qilmaydi, shuning uchun til
// modulini alohida yuklaymiz — lekin AYNAN o‘sha to‘plamdan
// bo‘lishi kerak, aks holda ikki nusxa bo‘lib qoladi.
const chiqish2 = join(ish, 'yadro.mjs');
await esbuild.build({
  stdin: {
    contents:
      "export * from './src/lib/davr';\nexport { joriyTilniQoy, tr, trn } from './src/lib/til';",
    resolveDir: APP,
    loader: 'ts',
  },
  outfile: chiqish2,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const Y = await import('file://' + chiqish2.replace(/\\/g, '/'));

const sana = new Date(2026, 8, 15); // 15-sentabr

Y.joriyTilniQoy('uz');
tekshir('uz: oy nomi o‘zbekcha', Y.sanaQisqa(sana).includes('sentabr'), Y.sanaQisqa(sana));
tekshir('uz: «Bugun» o‘zbekcha', Y.tr('Bugun') === 'Bugun', Y.tr('Bugun'));
tekshir('uz: hafta kunlari lotin', Y.haftaKunlari()[0] === 'Du', Y.haftaKunlari().join(' '));

Y.joriyTilniQoy('ru');
// Rus tilida sana bilan oy QARATQICH kelishigida keladi: oyning
// o'zi \u00ab\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044c\u00bb, lekin sana bilan \u00ab15 \u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f\u00bb. Bu farq
// bo'lmasa, matn darhol "mashina tarjimasi" bo'lib ko'rinadi.
tekshir(
  'ru: sanada qaratqich kelishigi',
  Y.sanaQisqa(sana) === '15 \u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f',
  Y.sanaQisqa(sana),
);
tekshir('ru: oy nomi bosh kelishikda', Y.oylar()[8] === '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044c', Y.oylar()[8]);
tekshir('ru: «Bugun» → «Сегодня»', Y.tr('Bugun') === 'Сегодня', Y.tr('Bugun'));
tekshir('ru: hafta kunlari kirillda', Y.haftaKunlari()[0] === 'Пн', Y.haftaKunlari().join(' '));
tekshir('ru: davr nomi tarjima qilindi', Y.davrOraligi('kun', 0).nom === 'Сегодня', Y.davrOraligi('kun', 0).nom);

// Son qo‘yiladigan matn: {n} o‘rni to‘g‘ri to‘ldirilsin
tekshir('ru: son qo‘yildi', Y.trn('{n} ta yozuv', 5) === 'записей: 5', Y.trn('{n} ta yozuv', 5));
Y.joriyTilniQoy('uz');
tekshir('uz: son qo‘yildi', Y.trn('{n} ta yozuv', 5) === '5 ta yozuv', Y.trn('{n} ta yozuv', 5));

// Tarjimasi yo‘q matn YO‘QOLMASIN — o‘zbekchasi chiqsin
Y.joriyTilniQoy('ru');
tekshir('tarjimasiz matn yo‘qolmaydi', Y.tr('Bunday matn lug‘atda yo‘q') === 'Bunday matn lug‘atda yo‘q');
Y.joriyTilniQoy('uz');

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
