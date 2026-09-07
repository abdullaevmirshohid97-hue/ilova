// =============================================================
//  FAKTURA KO'RINISHI — «1C» va «Oracle»
//
//  Nega bu sinov manba kodini o'qib qo'ya qolmaydi: faktura mijozga
//  ketadigan QOG'OZ hujjat. "Kodda shunday yozilgan" degan tekshiruv
//  jadval varaqdan chiqib ketganini, matn qo'shni ustun ustiga
//  yozilganini yoki summa yozuvda noto'g'ri chiqqanini ushlamaydi.
//
//  Shuning uchun bu yerda chekka funksiya HAQIQATAN yig'iladi va
//  ikkala PDF chizib ko'riladi. Deno o'rniga Node: `npm:` importlar
//  mahalliy paketlarga bog'lanadi, Deno.serve esa qo'g'irchoq.
//
//  Ishga tushirish:  node tests/faktura-dizayn.mjs
//  Kerak:            npm i --no-save pdf-lib @pdf-lib/fontkit
// =============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';
import { PDFDocument } from 'pdf-lib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANBA = join(ROOT, 'supabase/functions/dori-faktura/index.ts');
const src = readFileSync(MANBA, 'utf8');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mFAKTURA KO‘RINISHI\x1b[0m');

// ---------- 1. Manba qoidalari ----------
console.log('\n1. Manba');

tekshir('«1C» ko‘rinishi bor', /async function pdf1C\(/.test(src));
tekshir('«Oracle» ko‘rinishi bor', /async function pdfOracle\(/.test(src));
tekshir(
  'ko‘rinish sozlamadan tanlanadi',
  /firma\?\.uslub === 'oracle' \? pdfOracle/.test(src),
  'kodda qotib qolmasin',
);
tekshir(
  'tik A4 (landshaft emas)',
  /const EN = 595\.28/.test(src) && /const BO = 841\.89/.test(src),
  'hisob-faktura tik bo‘ladi',
);
tekshir(
  'firma nomi kodda qotirilmagan',
  (src.match(/'IDAA FARM'/g) ?? []).length === 1,
  'faqat zaxira qiymatda qolishi kerak',
);
tekshir('rekvizitlar bazadan olinadi', /dori_faktura_firma_srv/.test(src));
tekshir('logo hujjat ichiga joylanadi', /embedPng|embedJpg/.test(src));
tekshir(
  'logo turi magic baytdan aniqlanadi',
  /0x89 && bayt\[1\] === 0x50/.test(src),
  '.jpg deb saqlangan PNG uchraydi',
);
tekshir('sahifa raqami bor', /sahifaRaqamlari/.test(src));
tekshir('namuna rejimi bor', /rejim === 'namuna'/.test(src));

// ---------- 2. Yig'ish ----------
console.log('\n2. Yig‘ish');

const ish = join(ROOT, 'node_modules', '.cache', 'faktura-sinov');
mkdirSync(ish, { recursive: true });
const chiqish = join(ish, 'faktura.mjs');

// Sinov uchun ichki funksiyalar tashqariga chiqariladi. Manba faylni
// o'zgartirmaymiz: chekka funksiyada ortiqcha export bo'lmasligi kerak.
const sinovManba =
  src +
  '\nexport { pdf1C, pdfOracle, excelYasa, sozBilan, summaYozuvda, ustunlarniTanla, namunaFaktura, bol, kengliklar };\n';
const vaqtinchalik = join(ish, 'manba.ts');
writeFileSync(vaqtinchalik, sinovManba);

await esbuild.build({
  entryPoints: [vaqtinchalik],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: chiqish,
  // npm: sxemasi Deno'niki — Node uchun oddiy paket nomiga bog'laymiz
  plugins: [
    {
      name: 'deno-npm',
      setup(build) {
        build.onResolve({ filter: /^npm:/ }, (a) => {
          const nom = a.path.replace(/^npm:/, '').replace(/@[\d.^~]+$/, '');
          if (nom.startsWith('@supabase')) return { path: a.path, namespace: 'qq' };
          return { path: nom, external: true };
        });
        build.onLoad({ filter: /.*/, namespace: 'qq' }, () => ({
          contents: 'export const createClient = () => ({});',
        }));
      },
    },
  ],
  // Modul tanasida Deno.serve chaqiriladi — import paytida yiqilmasin
  banner: {
    js: 'globalThis.Deno = globalThis.Deno ?? { serve: () => {}, env: { get: () => "x" } };',
  },
  logLevel: 'error',
});

const F = await import('file://' + chiqish.replace(/\\/g, '/'));
tekshir('modul yuklandi', typeof F.pdf1C === 'function');

// ---------- 3. Summa yozuvda ----------
// Buxgalteriya hujjatining majburiy qatori. Xato bo'lsa hujjat
// yaroqsiz — raqam bilan yozuv mos kelmasa uni qabul qilishmaydi.
console.log('\n3. Summa yozuvda');

for (const [son, kutilgan] of [
  [0, 'Nol'],
  [1, 'Bir'],
  [7, 'Yetti'],
  [10, 'O‘n'],
  [19, 'O‘n to‘qqiz'],
  [100, 'Bir yuz'],
  [1000, 'Ming'],
  [1001, 'Ming bir'],
  [2000, 'Ikki ming'],
  [1234567, 'Bir million ikki yuz o‘ttiz to‘rt ming besh yuz oltmish yetti'],
  [1000000000, 'Bir milliard'],
]) {
  tekshir(`${son}`, F.sozBilan(son) === kutilgan, F.sozBilan(son));
}
// "Ming besh yuz" — o'zbekchada mingning birligi tushib qoladi,
// "bir ming" emas. 1 000 000 da esa "bir million" bo'ladi.
tekshir(
  'tiyin qo‘shiladi',
  F.summaYozuvda(1500.5) === 'Ming besh yuz so‘m 50 tiyin',
  F.summaYozuvda(1500.5),
);

// ---------- 4. Ustunlar ----------
console.log('\n4. Ustunlar');

const namuna = F.namunaFaktura();
const uSotuv = F.ustunlarniTanla(namuna);
tekshir(
  'bo‘sh «ishlab chiqarilgan» ustuni tushib qoladi',
  !uSotuv.some((u) => u.kalit === 'made'),
  'sotuvda u hech qachon to‘ldirilmaydi',
);
tekshir('narx ustuni bor', uSotuv.some((u) => u.kalit === 'price'));
tekshir('summa ustuni bor', uSotuv.some((u) => u.kalit === 'sum'));

const uYigish = F.ustunlarniTanla({ ...namuna, ustunlar: 'yigish' });
tekshir(
  'yig‘ish varaqasida narx YO‘Q',
  !uYigish.some((u) => u.kalit === 'price' || u.kalit === 'sum'),
  'sklad bizning ustamamizni ko‘rmasin',
);
tekshir('yig‘ishda sklad ustuni bor', uYigish.some((u) => u.kalit === 'sklad'));

const ICH = 595.28 - 76;
const w = F.kengliklar(uSotuv, ICH);
tekshir(
  'ustunlar yig‘indisi varaqqa teng',
  Math.abs(w.reduce((a, b) => a + b, 0) - ICH) < 0.01,
  'chetdan chiqmasin',
);
tekshir('har ustun 20pt dan keng', w.every((k) => k > 20), Math.min(...w).toFixed(1) + 'pt');

// ---------- 5. Matnni bo'lish ----------
console.log('\n5. Matn bo‘linishi');

const soxtaShrift = { widthOfTextAtSize: (s, size) => s.length * size * 0.5 };
const uzunSoz = 'ААААААААААААААААААААААААААААААААААААААА';
const q = F.bol(uzunSoz, 40, 8, soxtaShrift, 3);
tekshir(
  'uzun bitta so‘z ham bo‘linadi',
  q.length > 1 && q.every((s) => soxtaShrift.widthOfTextAtSize(s, 8) <= 40),
  'avval ustundan chiqib ketardi',
);
const kop = F.bol(Array(60).fill('soz').join(' '), 40, 8, soxtaShrift, 3);
tekshir('qator soni cheklangan', kop.length <= 3, kop.length + ' qator');

// ---------- 6. Ikkala hujjat haqiqatan chiziladi ----------
console.log('\n6. Chizish');

const firma = {
  uslub: '1c',
  nom: 'IDAA FARM',
  manzil: 'Toshkent sh., Yashnobod t., Farg‘ona yo‘li 12',
  telefon: '+998 71 200 00 20',
  stir: '302 456 789',
  bank_nomi: 'AT «Ipoteka-bank» Toshkent filiali',
  hisob_raqam: '20208000900123456001',
  mfo: '00443',
  rahbar: 'A. Abdullayev',
  hisobchi: 'N. Karimova',
  qqs_foiz: 12,
  logo_path: null,
};

const chiqDir = join(ROOT, 'node_modules', '.cache', 'faktura-namuna');
mkdirSync(chiqDir, { recursive: true });

const natija = {};
for (const [nom, fn] of [['1c', F.pdf1C], ['oracle', F.pdfOracle]]) {
  let r = null;
  let xato = null;
  try {
    r = await fn(namuna, { ...firma, uslub: nom }, null);
  } catch (e) {
    xato = e;
  }
  tekshir(`${nom}: chizildi`, !!r, xato ? String(xato?.message ?? xato).slice(0, 90) : '');
  if (!r) continue;
  natija[nom] = r.bayt;
  const bosh = new TextDecoder().decode(r.bayt.subarray(0, 5));
  tekshir(`${nom}: haqiqiy PDF`, bosh === '%PDF-', bosh);
  tekshir(`${nom}: bo‘sh emas`, r.bayt.length > 8000, (r.bayt.length / 1024).toFixed(0) + ' KB');
  tekshir(`${nom}: kirill shrifti joylandi`, r.kirill === true, 'aks holda dori nomlari o‘qilmaydi');
  writeFileSync(join(chiqDir, `${nom}.pdf`), r.bayt);

  // Varaq o'lchamini PDF'ning o'zidan o'qiymiz: kodda EN/BO to'g'ri
  // yozilgani sahifa haqiqatan shu o'lchamda chiqqanini bildirmaydi.
  const hujjat = await PDFDocument.load(r.bayt);
  const { width, height } = hujjat.getPage(0).getSize();
  tekshir(
    `${nom}: tik A4`,
    Math.round(width) === 595 && Math.round(height) === 842,
    `${Math.round(width)}×${Math.round(height)}pt`,
  );
}

if (natija['1c'] && natija.oracle) {
  tekshir(
    'ikki ko‘rinish bir xil emas',
    Buffer.compare(Buffer.from(natija['1c']), Buffer.from(natija.oracle)) !== 0,
    'tanlov haqiqatan ta’sir qilsin',
  );
}

// Ko'p qatorli faktura ikkinchi sahifaga o'tishi kerak — bir sahifaga
// tiqilib, qatorlar bir-birining ustiga chiqmasin
const kattaFaktura = {
  ...namuna,
  items: Array.from({ length: 90 }, (_, i) => ({
    ...namuna.items[i % namuna.items.length],
    line_no: i + 1,
  })),
};
for (const [nom, fn] of [['1c', F.pdf1C], ['oracle', F.pdfOracle]]) {
  const r = await fn(kattaFaktura, { ...firma, uslub: nom }, null);
  // Sahifa sonini PDF'ni qayta o'qib olamiz: pdf-lib faylni siqib
  // yozadi, shuning uchun baytlarda "/Type /Page" matn bo'lib turmaydi.
  const hujjat = await PDFDocument.load(r.bayt);
  const sahifa = hujjat.getPageCount();
  tekshir(`${nom}: 90 qator ko‘p sahifaga bo‘linadi`, sahifa >= 3, sahifa + ' sahifa');
  writeFileSync(join(chiqDir, `${nom}-katta.pdf`), r.bayt);
}

// Yig'ish varaqasi ham ikkala ko'rinishda chiqishi kerak
for (const [nom, fn] of [['1c', F.pdf1C], ['oracle', F.pdfOracle]]) {
  let ok = true;
  try {
    await fn({ ...namuna, ustunlar: 'yigish', sarlavha: 'YIG‘ISH VARAQASI' }, { ...firma, uslub: nom }, null);
  } catch {
    ok = false;
  }
  tekshir(`${nom}: yig‘ish varaqasi ham chiqadi`, ok);
}

// Rekvizit umuman kiritilmagan bo'lsa ham yiqilmasin
for (const [nom, fn] of [['1c', F.pdf1C], ['oracle', F.pdfOracle]]) {
  let ok = true;
  try {
    await fn(namuna, { uslub: nom, nom: 'FIRMA', qqs_foiz: 0 }, null);
  } catch {
    ok = false;
  }
  tekshir(`${nom}: rekvizitsiz ham chiqadi`, ok, 'bo‘sh sozlama hujjatni to‘xtatmasin');
}

// Excel ham ikkala ko'rinishda
for (const nom of ['1c', 'oracle']) {
  let baytlar = null;
  try {
    baytlar = await F.excelYasa(namuna, { ...firma, uslub: nom });
  } catch { /* pastda ushlanadi */ }
  tekshir(`${nom}: Excel yasaladi`, !!baytlar && baytlar.length > 3000,
    baytlar ? (baytlar.length / 1024).toFixed(0) + ' KB' : 'yiqildi');
  if (baytlar) writeFileSync(join(chiqDir, `${nom}.xlsx`), baytlar);
}

console.log(`\n  namunalar: ${chiqDir}`);

// ---------- 7. Baza ----------
console.log('\n7. Baza');

let K = null;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}

if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kalitlar yo‘q — o‘tkazib yuborildi');
} else {
  const sql = async (s) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
      body: JSON.stringify({ query: s }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 200));
    return j;
  };

  const ustunlar = await sql(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'dori_settings'
  `);
  const bor = new Set(ustunlar.map((r) => r.column_name));
  for (const u of ['faktura_uslubi', 'manzil', 'telefon', 'stir', 'bank_nomi',
                   'hisob_raqam', 'mfo', 'rahbar', 'hisobchi', 'qqs_foiz']) {
    tekshir(`dori_settings.${u}`, bor.has(u));
  }

  // Noto'g'ri yozilgan uslub jimgina eski ko'rinishga qaytarib
  // qo'ymasligi kerak — baza uni rad etsin
  const chek = await sql(`
    select count(*)::int as n from pg_constraint
    where conname = 'dori_settings_faktura_uslubi_chk'
  `);
  tekshir('uslub qiymati cheklangan', chek[0].n === 1, "'1c' yoki 'oracle'");

  const fn = await sql(`
    select p.prosecdef as definer,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as auth,
           has_function_privilege('service_role', p.oid, 'execute') as srv
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dori_faktura_firma_srv'
  `);
  tekshir('dori_faktura_firma_srv mavjud', fn.length === 1);
  if (fn.length === 1) {
    tekshir('security definer', fn[0].definer === true);
    tekshir('anon chaqirolmaydi', fn[0].anon === false, 'rekvizit ochiq turmasin');
    tekshir('authenticated ham chaqirolmaydi', fn[0].auth === false, 'faqat chekka funksiya');
    tekshir('service_role chaqiradi', fn[0].srv === true);
  }

  // Jonli sozlamadagi uslub haqiqiy qiymat bo'lsin
  const joriy = await sql(`select faktura_uslubi, qqs_foiz from dori_settings where id`);
  tekshir(
    'jonli uslub to‘g‘ri',
    ['1c', 'oracle'].includes(joriy[0]?.faktura_uslubi),
    joriy[0]?.faktura_uslubi,
  );
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
