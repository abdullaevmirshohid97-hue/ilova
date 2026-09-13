// =============================================================
//  CREDIT DEBIT — DAVR VA DIZAYN SINOVI
//
//  Ikki qism:
//
//   1) DAVR mantiqi (`src/lib/davr.ts`) — kunlik/haftalik/oylik
//      oraliqlari, kalendar to'ri, sana yozuvlari. Uch ekran shunga
//      tayanadi (Yozuvlar, Kalendar, Hisobot), ya'ni bir kunlik
//      xato uch joyda bir vaqtda ko'rinadi va uni faqat oy oxirida
//      payqash mumkin.
//
//   2) DIZAYN qoidalari — kodning o'zidan tekshiriladi:
//      · `Intl` ishlatilmasin (Telegram WebView'da oq ekran bergan)
//      · ranglar ekranlarda QATTIQ yozilmasin (tema fayli bor)
//      · har ekran tungi rejimni bilsin (`useTema`)
//
//  Ishga tushirish:  node tests/kassa-dizayn.mjs
//  (bazaga tegmaydi)
// =============================================================

import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/kassa/src');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mCREDIT DEBIT — DAVR VA DIZAYN\x1b[0m');

// =============================================================
// 1. DAVR
// =============================================================
const ish = mkdtempSync(join(tmpdir(), 'kassa-davr-'));
const chiqish = join(ish, 'davr.mjs');
await esbuild.build({
  entryPoints: [join(APP, 'lib/davr.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const D = await import('file://' + chiqish.replace(/\\/g, '/'));

console.log('\n1. Davr oraliqlari');

const kun = D.davrOraligi('kun', 0);
tekshir('bugun — 00:00 dan boshlanadi', kun.bosh.getHours() === 0 && kun.bosh.getMinutes() === 0);
tekshir('bugun — 23:59 da tugaydi', kun.oxir.getHours() === 23 && kun.oxir.getMinutes() === 59);
tekshir('bugun deb nomlanadi', kun.nom === 'Bugun', kun.nom);
tekshir('kecha deb nomlanadi', D.davrOraligi('kun', -1).nom === 'Kecha');

const hafta = D.davrOraligi('hafta', 0);
const haftaKunlari = Math.round((hafta.oxir - hafta.bosh) / 86400000);
tekshir('hafta 7 kun', haftaKunlari === 7, `${haftaKunlari} kun`);
tekshir('hafta DUSHANBADAN boshlanadi', hafta.bosh.getDay() === 1, `kun raqami ${hafta.bosh.getDay()}`);

const oy = D.davrOraligi('oy', 0);
tekshir('oy 1-sanadan boshlanadi', oy.bosh.getDate() === 1, String(oy.bosh.getDate()));
tekshir(
  'oy oxirgi kun bilan tugaydi',
  oy.oxir.getMonth() === oy.bosh.getMonth() &&
    new Date(oy.oxir.getTime() + 1000).getMonth() !== oy.bosh.getMonth(),
  oy.oxir.toISOString().slice(0, 10),
);

// Fevral — eng ko'p xato beradigan oy
const fevral = new Date(2028, 1, 15); // 2028 kabisa yili
const tor2028 = D.oyTori(2028, 1);
const fevralKunlari = tor2028.flat().filter(Boolean).length;
tekshir('2028-yil fevralda 29 kun (kabisa)', fevralKunlari === 29, String(fevralKunlari));
tekshir('kalendar to‘ri 7 ustunli', tor2028.every((q) => q.length === 7));

// Yil chegarasi: dekabrdan keyin yanvar
const dekabr = D.oyTori(2026, 11);
const oxirgi = dekabr.flat().filter(Boolean).pop();
tekshir('dekabr 31 bilan tugaydi', oxirgi.getDate() === 31, String(oxirgi.getDate()));

console.log('\n2. Sana yozuvlari (Intl’siz)');

tekshir('bugun → "Bugun"', D.sanaQisqa(new Date()) === 'Bugun');
const kecha = new Date();
kecha.setDate(kecha.getDate() - 1);
tekshir('kecha → "Kecha"', D.sanaQisqa(kecha) === 'Kecha');
tekshir(
  'eski sana o‘zbekcha oy nomi bilan',
  D.sanaQisqa(new Date(2026, 6, 15)).includes('iyul'),
  D.sanaQisqa(new Date(2026, 6, 15)),
);
tekshir(
  'boshqa yil — yil ham yoziladi',
  /2024/.test(D.sanaQisqa(new Date(2024, 2, 3))),
  D.sanaQisqa(new Date(2024, 2, 3)),
);

// Kalit MAHALLIY vaqt bo'yicha bo'lishi kerak: UTC bo'lsa, kechqurun
// kiritilgan yozuv ertangi kunga tushib qolardi (O'zbekiston UTC+5).
const kechqurun = new Date(2026, 8, 13, 23, 30);
tekshir('kun kaliti mahalliy vaqt bo‘yicha', D.kunKaliti(kechqurun) === '2026-09-13', D.kunKaliti(kechqurun));

const oraliq = D.davrOraligi('oy', 0);
const shuOy = new Date();
tekshir('shu oydagi sana oraliqqa tushadi', D.oraliqdami(shuOy.toISOString(), oraliq));
tekshir(
  'o‘tgan yildagi sana tushmaydi',
  !D.oraliqdami(new Date(2020, 0, 1).toISOString(), oraliq),
);

// =============================================================
// 3. DIZAYN QOIDALARI
// =============================================================
console.log('\n3. Dizayn qoidalari (kod bo‘yicha)');

function fayllar(dir, natija = []) {
  for (const nom of readdirSync(dir)) {
    const yol = join(dir, nom);
    if (statSync(yol).isDirectory()) fayllar(yol, natija);
    else if (/\.tsx?$/.test(nom)) natija.push(yol);
  }
  return natija;
}

const hammasi = [...fayllar(APP), join(ROOT, 'apps/kassa/App.tsx')];
const oqish = (f) => readFileSync(f, 'utf8');

const intlBor = hammasi.filter((f) => /\bIntl\.|toLocaleString|toLocaleDate/.test(oqish(f)));
tekshir(
  'Intl / toLocaleString ishlatilmagan',
  intlBor.length === 0,
  intlBor.map((f) => f.split(/[\\/]/).pop()).join(', ') || 'toza',
);

// Ranglar faqat tema faylida. Ekranda `#RRGGBB` yozilsa, tungi
// rejimda o'sha joy oq bo'lib qolardi.
const temaFayl = join(APP, 'lib/tema.ts');
const rangliEkranlar = hammasi
  .filter((f) => f !== temaFayl)
  .map((f) => ({ f, soni: (oqish(f).match(/#[0-9a-fA-F]{6}\b/g) ?? []).length }))
  .filter((x) => x.soni > 0);

// Kirish ekranlari bundan tashqari: ular login oldidan, doim to'q fonda
const ruxsat = ['KirishEkrani.tsx', 'BiznesEkrani.tsx'];
const qoidabuzganlar = rangliEkranlar.filter((x) => !ruxsat.some((r) => x.f.endsWith(r)));
tekshir(
  'ranglar tema faylida (ekranlarda qattiq yozilmagan)',
  qoidabuzganlar.length === 0,
  qoidabuzganlar.map((x) => `${x.f.split(/[\\/]/).pop()}:${x.soni}`).join(', ') || 'toza',
);

// Kirish va biznes ekrani ro'yxatdan TASHQARI: ular login oldidan
// ko'rsatiladi va ataylab doim to'q fonda — tanlash mumkin bo'lgan
// tema u yerda hali yo'q (foydalanuvchi sozlamasi ham yuklanmagan).
const ekranlar = fayllar(join(APP, 'ekran')).filter(
  (f) => !ruxsat.some((r) => f.endsWith(r)),
);
const temasiz = ekranlar.filter((f) => !/useTema/.test(oqish(f)));
tekshir(
  'har ekran tungi rejimni biladi (useTema)',
  temasiz.length === 0,
  temasiz.map((f) => f.split(/[\\/]/).pop()).join(', ') || 'hammasi',
);

// Tungi va yorug' palitrada bir xil kalitlar bo'lsin — biri unutilsa
// o'sha joy `undefined` rang oladi va shaffof chiqadi.
const tema = oqish(temaFayl);
const kalitlar = (nom) => {
  const bosh = tema.indexOf(`export const ${nom}: Ranglar = {`);
  const oxir = tema.indexOf('};', bosh);
  return [...tema.slice(bosh, oxir).matchAll(/^\s{2}([a-zA-Z0-9]+):/gm)].map((m) => m[1]).sort();
};
const y = kalitlar('YORUG');
const q = kalitlar('QORONGI');
tekshir(
  'yorug‘ va tungi palitra bir xil kalitlarga ega',
  y.length > 0 && JSON.stringify(y) === JSON.stringify(q),
  y.length === q.length ? `${y.length} ta rang` : `yorug‘ ${y.length}, tungi ${q.length}`,
);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
