// =============================================================
//  CLARY — O'CHIRILGAN HAMKOR VA TURKUM
//
//  O'chirish = `faol: false`. Qator bazadan olinmaydi: sinxda
//  o'chirish amali yo'q va eski yozuvlar unga bog'langan.
//
//  NEGA BU SINOV BOR (2026-09-28). 2.15.0 da turkumlar ekraniga
//  «O'chirilganlar → Qaytarish» qo'shilgan edi — va u HECH QACHON
//  ishlamagan: `turkumlarOl()` o'chirilganlarni shu yerning o'zida
//  tashlab yuborardi, ekranga ular umuman kelmasdi. Kod to'g'ri
//  ko'rinardi, sinovlar yashil edi.
//
//  Ikkinchi yashirin zarar: o'chirilgan turkumning eski yozuvlari
//  hisobotda «Turkumsiz» bo'lib chiqardi — nom qidiriladigan
//  ro'yxatda u yo'q edi.
//
//  Qoida endi shunday:
//    · yuklovchilar HAMMASINI qaytaradi
//    · `holat.tsx`: `klientlar` / `turkumlar` — faqat faollar
//      (ro'yxat va tanlagichlar), `barcha…` — o'chirilganlar bilan
//      (nom qidiradigan joylar)
//
//  Ishga tushirish: node tests/kassa-faolsiz.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/kassa');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}
const izohsiz = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const oq = (y) => izohsiz(readFileSync(join(APP, y), 'utf8'));

/** Funksiya tanasi — keyingi `export` gacha */
function tana(matn, nom) {
  const b = matn.indexOf(`export async function ${nom}(`);
  if (b < 0) return '';
  const o = matn.indexOf('\nexport ', b + 10);
  return matn.slice(b, o < 0 ? undefined : o);
}

console.log('\n\x1b[1mCLARY — O‘CHIRILGAN HAMKOR VA TURKUM\x1b[0m\n');

// -------------------------------------------------------------
console.log('\x1b[1m1. Yuklovchilar o‘chirilganlarni TASHLAMAYDI\x1b[0m');
{
  const baza = oq('src/lib/baza.ts');
  for (const f of ['klientlarOl', 'turkumlarOl']) {
    const t = tana(baza, f);
    tekshir(`${f} bor`, t.length > 0);
    // `[^)]*` EMAS: `.filter((t) => t.faol …)` dagi birinchi qavs uni
    // to'xtatardi va aynan 2.15.0 dagi xato qaytsa ham sinov sezmasdi
    // (mutatsiya bilan topildi).
    tekshir(`${f}: faol bo‘yicha filtr yo‘q`, t.length > 0 && !/\.filter\(.*faol/.test(t), 'ajratish holat.tsx da');
  }
}

// -------------------------------------------------------------
console.log('\n\x1b[1m2. holat.tsx: faollar va hammasi ajratiladi\x1b[0m');
{
  const h = oq('src/lib/holat.tsx');
  tekshir('klientlar — faqat faollar', /const klientlar = useMemo\(\(\) => barchaKlientlar\.filter\(\(k\) => k\.faol !== false\)/.test(h));
  tekshir('turkumlar — faqat faollar', /const turkumlar = useMemo\(\(\) => barchaTurkumlar\.filter\(\(t\) => t\.faol !== false\)/.test(h));
  tekshir('barchaKlientlar kontekstda', /^\s*barchaKlientlar,\s*$/m.test(h) && /barchaKlientlar: Klient\[\]/.test(h));
  tekshir('barchaTurkumlar kontekstda', /^\s*barchaTurkumlar,\s*$/m.test(h) && /barchaTurkumlar: Turkum\[\]/.test(h));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m3. Nom qidiradigan joylar o‘chirilganlarni ham ko‘radi\x1b[0m');
//
// Bu joylarda o'chirilgan hamkorning ESKI yozuvi turadi. `klientlar`
// dan olinsa u nomsiz chiqadi: pul bor, kimniki ekani yo'q.
for (const [fayl, kerak] of [
  ['src/ekran/KalendarEkrani.tsx', ['barchaTurkumlar: turkumlar', 'barchaKlientlar: klientlar']],
  ['src/ekran/YanaHisobot.tsx', ['barchaTurkumlar: turkumlar', 'barchaKlientlar: klientlar']],
  ['src/ekran/YozuvlarEkrani.tsx', ['barchaTurkumlar: turkumlar', 'barchaKlientlar: klientlar']],
  ['src/ekran/BitimlarEkrani.tsx', ['barchaKlientlar: klientlar']],
  ['src/ekran/YanaTurkumlar.tsx', ['barchaTurkumlar: turkumlar']],
  ['App.tsx', ['klientlar={barchaKlientlar}']],
]) {
  const t = oq(fayl);
  const yoq = kerak.filter((k) => !t.includes(k));
  tekshir(fayl.split('/').pop(), yoq.length === 0, yoq.length ? 'yo‘q: ' + yoq.join(', ') : kerak.join(', '));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m4. Tanlagichlar FAQAT faollarni ko‘rsatadi\x1b[0m');
//
// Teskari xato ham bor: o'chirilgan hamkor yangi bitimda tanlanib
// qolsa, o'chirishning ma'nosi qolmaydi.
{
  const yozuv = oq('src/ekran/YozuvOynasi.tsx');
  tekshir('yozuv oynasi: barcha… olinmaydi', !/barchaKlientlar|barchaTurkumlar/.test(yozuv));
  tekshir('yozuv oynasi: turkum tanlagichi faol', /turkumlar\.filter\(\(t\) => t\.turi === turi && t\.faol\)/.test(yozuv));
  for (const f of ['BitimOynasi.tsx', 'TolovOynasi.tsx']) {
    const t = oq('src/ekran/' + f);
    tekshir(`${f}: barchaKlientlar olinmaydi`, !/barchaKlientlar/.test(t));
  }
  const bosh = oq('src/ekran/BoshEkran.tsx');
  tekshir('bosh sahifa ro‘yxati faol hamkorlardan', /return klientlar\s*\n\s*\.filter/.test(bosh));
  tekshir('bosh sahifa jamisi faol hamkorlardan', /for \(const k of klientlar\) \{/.test(bosh));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m5. Hamkorni uzoq bosish — menyu\x1b[0m');
{
  const b = oq('src/ekran/BoshEkran.tsx');
  tekshir('uzoq bosish menyuni ochadi', /uzoqBos=\{\(\) => mijozAmallari\(k\)\}/.test(b));
  const menyu = b.slice(b.indexOf('function mijozAmallari'), b.indexOf('function mijozniOchir'));
  tekshir('menyuda «Tahrirlash» — eski odat saqlandi', /tr\('Tahrirlash'\), onPress: \(\) => ochMijoz\(k\)/.test(menyu));
  tekshir('menyuda «O‘chirish»', /tr\('O‘chirish'\)[^}]*mijozniOchir\(k\)/.test(menyu));
  tekshir('menyuda «Bekor»', /tr\('Bekor'\), style: 'cancel'/.test(menyu));

  const ochir = b.slice(b.indexOf('function mijozniOchir'), b.indexOf('async function faolQoy'));
  tekshir('o‘chirishdan oldin so‘raladi', /Ogoh\.alert\(/.test(ochir) && /tr\('Yo‘q'\), style: 'cancel'/.test(ochir));
  tekshir('qoldiq bo‘lsa AYTILADI', /qoldiqlar\.get\(k\.id\)/.test(ochir) && /sizga qarzdor/.test(ochir) && /qarzdorsiz/.test(ochir));
  tekshir('jamidan chiqishi aytiladi', /jamidan chiqadi/.test(ochir));
  tekshir('o‘chirish = faol: false', /faolQoy\(k, false\)/.test(ochir));

  const faolQoy = b.slice(b.indexOf('async function faolQoy'), b.indexOf('async function faolQoy') + 400);
  tekshir('bazaga klientTahrirla bilan yoziladi', /klientTahrirla\(k\.id, \{ faol \}\)/.test(faolQoy));
  tekshir('xato ko‘rsatiladi, yutilmaydi', /catch \(e\)[\s\S]*Ogoh\.alert\(tr\('Xatolik'\), xatoMatn\(e\)\)/.test(faolQoy));
  tekshir('ochiq kartochka yopiladi', /tanlangan\?\.id === k\.id\) setTanlangan\(null\)/.test(faolQoy));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m6. Qaytarish\x1b[0m');
{
  const b = oq('src/ekran/BoshEkran.tsx');
  tekshir('o‘chirilganlar barchaKlientlar dan', /barchaKlientlar\.filter\(\(k\) => k\.faol === false\)/.test(b));
  tekshir('«Qaytarish» faol: true qiladi', /faolQoy\(k, true\)/.test(b) && /tr\('Qaytarish'\)/.test(b));
  const t = oq('src/ekran/YanaTurkumlar.tsx');
  tekshir('turkumlar: qaytarish faol: true', /faolQoy\(t, true\)/.test(t));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m7. AI ulagichi (MCP) — ilova bilan bir xil qoida\x1b[0m');
//
// MCP bazani to'g'ridan-to'g'ri o'qiydi. Qoida unda ham bo'lmasa, AI
// aytgan «bizga qarzdor» jami ilovadagidan boshqa chiqadi, yangi
// bitim esa ilovada ko'rinmaydigan hamkorga yoziladi.
{
  const m = izohsiz(readFileSync(join(ROOT, 'supabase/functions/kassa-mcp/index.ts'), 'utf8'));
  tekshir('MCP: faol ustuni o‘qiladi', /select\('id, ism, turi, valyuta, faol'\)/.test(m));
  tekshir('MCP: ro‘yxat faqat faollardan', /klientRoyxat: \(klientlar \?\? \[\]\)\.filter\(faol\)/.test(m));
  tekshir('MCP: nom xaritasi hammadan', /klient: new Map\(\(klientlar \?\? \[\]\)\.map/.test(m));
  const bitim = m.slice(m.indexOf("if (nom === 'bitim_yarat')"), m.indexOf("if (nom === 'tolov_yarat')"));
  tekshir(
    'MCP: o‘chirilgan ismda dublikat yaratilmaydi',
    /if \(!k\) \{\s*const o = ochirilganHamkor\(n, arg\.kontakt\);\s*if \(o\) return xatoJavob/.test(bitim),
  );
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
