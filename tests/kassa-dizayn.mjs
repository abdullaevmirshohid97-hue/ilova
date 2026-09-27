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

import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
// IZOHLAR SANALMAYDI. Bir marta shunday bo‘lgan: KirishEkrani
// temaga to‘liq o‘tkazildi, lekin izohda ESKI xato tasvirlangan
// edi («oq fonda #F2F4F7 edi») — sinov shuni qoidabuzarlik deb
// ko‘rsatdi. Ya‘ni tuzatishni HUJJATLASH sinovni yiqitardi, bu
// esa odamni izoh yozmaslikka undardi.
const izohsiz = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((q) => q.replace(/\/\/.*$/, ''))
    .join('\n');

const rangliEkranlar = hammasi
  .filter((f) => f !== temaFayl)
  // 6 ham, 8 ham: `#00000080` kabi shaffoflik bilan yozilgan rang
  // ilgari TEKSHIRUVDAN O‘TIB KETARDI, chunki `\b` sakkizinchi
  // raqamdan keyin ishlamaydi. Kalkulator modalini yozganda shu
  // tasodifan ma’lum bo‘ldi.
  .map((f) => ({ f, soni: (izohsiz(oqish(f)).match(/#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/g) ?? []).length }))
  .filter((x) => x.soni > 0);

// ISTISNOLAR — YO‘Q (2026-09-27).
//
// Ro‘yxat ilgari uchta edi (modal pardalari), keyin bitta qoldi:
// `BiznesEkrani`. Aynan o‘sha istisno XATONI YASHIRGAN: ekranda
// tugma foni ham, ekran foni ham oq, tugma matni `#fff` edi —
// ro‘yxatdan o‘tishning ikkinchi qadamida «Boshlash» ko‘rinmasdi.
// Istisno «bu fayl tekshirilmasin» degani ekan, «bu fayl to‘g‘ri»
// degani emas.
const ruxsat = [];
const qoidabuzganlar = rangliEkranlar.filter((x) => !ruxsat.some((r) => x.f.endsWith(r)));
tekshir(
  'ranglar tema faylida (ekranlarda qattiq yozilmagan)',
  qoidabuzganlar.length === 0,
  qoidabuzganlar.map((x) => `${x.f.split(/[\\/]/).pop()}:${x.soni}`).join(', ') || 'toza',
);

// Endi kirish va biznes ekrani ham tekshiriladi: «login oldidan
// tema yo'q» degan eski taxmin noto'g'ri edi — `TemaKontekst`
// ildizda turadi va ular ham uni oladi.
const ekranlar = fayllar(join(APP, 'ekran')).filter(
  (f) => !ruxsat.some((r) => f.endsWith(r)),
);
const temasiz = ekranlar.filter((f) => !/useTema/.test(oqish(f)));

// KIRISH YO'LIDAGI TUGMA KO'RINSIN. Ikki marta aynan shu buzilgan:
// avval KirishEkrani, keyin BiznesEkrani — tugma foni ekran foni
// bilan bir xil (`C.tun`), matni oq. Bu yo'l yopilsa odam ilovaga
// umuman kira olmaydi, shuning uchun alohida qoida: asosiy tugma
// temadagi urg'u rangida (`faol` / `faolMatn`).
for (const nom of ['KirishEkrani.tsx', 'BiznesEkrani.tsx']) {
  const t = izohsiz(oqish(join(APP, 'ekran', nom)));
  const tugma = t.match(/\btugma:\s*\{[^}]*\}/)?.[0] ?? '';
  const tugmaMatn = t.match(/\btugmaMatn:\s*\{[^}]*\}/)?.[0] ?? '';
  tekshir(
    nom + ': asosiy tugma ko‘rinadi',
    /backgroundColor:\s*C\.faol\b/.test(tugma) && /color:\s*C\.faolMatn\b/.test(tugmaMatn),
    tugma ? tugma.replace(/\s+/g, ' ').slice(0, 70) : 'tugma uslubi topilmadi',
  );
}
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

// =============================================================
// 4. KUN YAKUNI QACHON SO‘RALADI
//
//  Taklif noto'g'ri paytda chiqsa, u bezovta qiladigan qizil
//  nuqtaga aylanadi va odam uni umuman ko'rmaydigan bo'lib
//  qoladi. Shuning uchun qoida qat’iy: kuniga bir marta,
//  kechqurun va faqat yozuv bo‘lgan kuni.
// =============================================================
console.log('\n4. Kun yakuni qoidalari');

const yakunChiqish = join(ish, 'yakun.mjs');
const stub = join(ish, 'async-storage.js');
// AsyncStorage telefon moduli — node‘da ishlamaydi. Qoida esa
// undan mustaqil, shuning uchun soxta modul qo‘yamiz.
writeFileSync(
  stub,
  [
    'const xotira = new Map();',
    'export default {',
    '  getItem: async (k) => (xotira.has(k) ? xotira.get(k) : null),',
    '  setItem: async (k, v) => { xotira.set(k, v); },',
    '};',
  ].join('\n'),
);
await esbuild.build({
  entryPoints: [join(APP, 'lib/yakun.ts')],
  outfile: yakunChiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { '@react-native-async-storage/async-storage': stub },
});
const K = await import('file://' + yakunChiqish.replace(/\\/g, '/'));

const yakunKech = new Date(2026, 8, 18, 19, 0);
const yakunErta = new Date(2026, 8, 18, 9, 0);

tekshir('ertalab so‘ralmaydi', K.yakunSorash(true, yakunErta) === false);
tekshir('kechqurun so‘raladi', K.yakunSorash(true, yakunKech) === true);
tekshir('yozuvsiz kunda so‘ralmaydi', K.yakunSorash(false, yakunKech) === false);

// Yakunlangandan keyin O‘SHA kuni qayta so‘ralmaydi
await K.yakunniBelgila();
tekshir('yakundan keyin bugun qayta so‘ralmaydi', K.yakunSorash(true, new Date()) === false);
tekshir('bugun yakunlangani ko‘rinadi', K.bugunYakunlandi() === true);

// Ertaga yana so‘raladi — aks holda odat bir kunda tugardi
const ertaga = new Date();
ertaga.setDate(ertaga.getDate() + 1);
ertaga.setHours(19, 0, 0, 0);
tekshir('ertaga yana so‘raladi', K.yakunSorash(true, ertaga) === true);
tekshir('ertaga yakunlanmagan deb hisoblanadi', K.bugunYakunlandi(ertaga) === false);

console.log('\n\x1b[1mKONTRAST\x1b[0m');

// WCAG 2.1 nisbiy yorqinlik va kontrast nisbati.
// Oddiy matn uchun talab 4.5:1. Summalar qalin, ya'ni rasmiy
// talab 3:1 ham yetardi — lekin daftar quyoshda, ko'chada
// o'qiladi, shuning uchun qat'iyroq chegara olindi.
function yorqinlik(hex) {
  const b = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, bl] = b.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
function kontrast(a, b) {
  const la = yorqinlik(a);
  const lb = yorqinlik(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

{
  const temaMatn = readFileSync(join(ROOT, 'apps/kassa/src/lib/tema.ts'), 'utf8');
  const olish = (blok, nom) => {
    const b = temaMatn.indexOf('export const ' + blok);
    const qism = temaMatn.slice(b, temaMatn.indexOf('};', b));
    return qism.match(new RegExp(nom + ":\\s*'(#[0-9A-Fa-f]{6})'"))?.[1] ?? null;
  };

  for (const [blok, nomi] of [
    ['YORUG', 'kunduzgi'],
    ['QORONGI', 'tungi'],
  ]) {
    const karta = olish(blok, 'karta');
    for (const rang of ['kirim', 'chiqim', 'matn']) {
      const q = olish(blok, rang);
      const n = q && karta ? kontrast(q, karta) : 0;
      tekshir(
        nomi + ': ' + rang + ' kartada o\u2018qiladi (4.5:1)',
        n >= 4.5,
        (q ?? '?') + ' / ' + (karta ?? '?') + ' = ' + n.toFixed(2) + ':1',
      );
    }

    // Kirim va chiqim BIR-BIRIDAN ham ajralishi kerak: ular
    // yonma-yon turadi. Rang ajratmaydigan odam uchun ishora
    // (+ / \u2212) bor, lekin ko'rgan odam uchun rang ham
    // farqlanishi kerak.
    const k = olish(blok, 'kirim');
    const c = olish(blok, 'chiqim');
    tekshir(
      nomi + ': kirim va chiqim bir-biridan farq qiladi',
      k !== c && Math.abs(yorqinlik(k) - yorqinlik(c)) < 0.9,
      k + ' / ' + c,
    );
  }
}

// -------------------------------------------------------------
//  TELEGRAM RANGLARI (2026-09-27 qarori)
//
//  Foydalanuvchi talabi: ilova ranglari Telegram bilan BIR XIL.
//  Qiymatlar Telegram Android kodidan olingan (`ThemeColors.java`,
//  `assets/night.attheme`) va shu yerda QOTIRILADI. Kimdir rangni
//  «biroz yumshoqroq» qilsa — talab jimgina buziladi, ko'z bilan
//  esa farqni hech kim sezmaydi. Sinov sezadi.
//
//  `kirim` (kunduzgi) bu ro'yxatda YO'Q — u ataylab chetlanadi,
//  sababi `tema.ts` boshida yozilgan: Telegram ko'ki oq fonda
//  4.5:1 ga yetmaydi. Uning o'rniga pastda tusi tekshiriladi.
// -------------------------------------------------------------
console.log('\nTELEGRAM RANGLARI');

{
  const temaMatn2 = readFileSync(join(ROOT, 'apps/kassa/src/lib/tema.ts'), 'utf8');
  const ol = (blok, nom) => {
    const b = temaMatn2.indexOf('export const ' + blok);
    const qism = temaMatn2.slice(b, temaMatn2.indexOf('};', b));
    return qism.match(new RegExp('\\b' + nom + ":\\s*'(#[0-9A-Fa-f]{6})'"))?.[1]?.toUpperCase() ?? null;
  };

  const TELEGRAM = {
    YORUG: {
      fon: '#F1F1F3', //    windowBackgroundGray
      karta: '#FFFFFF', //  windowBackgroundWhite
      matn: '#1A1D21', //   DEFAULT_BLACK_TEXT
      xira: '#808384', //   windowBackgroundWhiteGrayText
      tun: '#FFFFFF', //    actionBarDefault
      chiqim: '#CC2929', // text_RedRegular
      faol: '#229AF0', //   TELEGRAM_COLOR
    },
    QORONGI: {
      fon: '#000000', //    windowBackgroundGray
      karta: '#181819', //  windowBackgroundWhite
      matn: '#FFFFFF', //   windowBackgroundWhiteBlackText
      xira: '#7D7D7D', //   windowBackgroundWhiteHintText
      tun: '#232326', //    actionBarDefault
      kirim: '#64B5EF', //  windowBackgroundWhiteBlueText
      chiqim: '#EE686F', // text_RedRegular
      faol: '#229AF0', //   featuredStickers_addButton (standart)
    },
  };

  for (const [blok, ranglar] of Object.entries(TELEGRAM)) {
    for (const [nom, kerak] of Object.entries(ranglar)) {
      const bor = ol(blok, nom);
      tekshir(`${blok}.${nom} = Telegram`, bor === kerak, `${bor ?? '?'}${bor === kerak ? '' : ' — kerak ' + kerak}`);
    }
  }

  // Kunduzgi kirim — Telegram ko'kining O'SHA TUSI bo'lsin.
  // Rang oilasi saqlanmasa, «Telegram ranglari» degan talab shu
  // bitta joyda sezilmay buziladi.
  const tus = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d === 0) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  const kirimKun = ol('YORUG', 'kirim');
  const farq = kirimKun ? Math.abs(tus(kirimKun) - tus('#298ACF')) : 999;
  tekshir(
    'kunduzgi kirim — Telegram ko‘kining tusi',
    farq < 3,
    `${kirimKun} tusi ${kirimKun ? tus(kirimKun).toFixed(1) : '?'}°, Telegram #298ACF ${tus('#298ACF').toFixed(1)}°`,
  );

  // Karta fondan QIYMAT bilan ajralsin — Telegram'da ham shunday:
  // kulrang fon, oq bo'limlar. Oq-oq bo'lsa ekran tekis ko'rinadi
  // («dizayni juda oddiy» degan e'tiroz shundan chiqqan edi).
  for (const blok of ['YORUG', 'QORONGI']) {
    const fon = ol(blok, 'fon');
    const karta = ol(blok, 'karta');
    const n = fon && karta ? kontrast(fon, karta) : 1;
    tekshir(
      blok + ': karta fondan ajraladi',
      fon !== karta && n >= 1.04,
      fon + ' / ' + karta + ' = ' + n.toFixed(3) + ':1',
    );
  }

  // Tugma matni. Chegara 3:1, 4.5 emas — ATAYLAB: Telegram'ning o'z
  // tugmasi (`#229AF0` ustida oq) aynan 3.0:1, va ranglar Telegram
  // bilan bir xil bo'lishi talab qilingan. Tugma yozuvi qisqa va
  // qalin, WCAG 1.4.11 / katta matn uchun talab ham 3:1. Summalar
  // va oddiy matn esa yuqorida 4.5:1 bilan tekshiriladi.
  for (const blok of ['YORUG', 'QORONGI']) {
    const faol = ol(blok, 'faol');
    const faolMatn = ol(blok, 'faolMatn');
    const n = faol && faolMatn ? kontrast(faol, faolMatn) : 0;
    tekshir(
      blok + ': tugma matni o‘qiladi (3:1)',
      n >= 3,
      faol + ' / ' + faolMatn + ' = ' + n.toFixed(2) + ':1',
    );
  }

  // Olib tashlangan rejim qaytmasin: ikki joyda qolsa, tanlovda
  // ko'rinib, bosilganda hech narsa o'zgarmasdi.
  const app = readFileSync(join(ROOT, 'apps/kassa/App.tsx'), 'utf8');
  const sozlama = readFileSync(join(ROOT, 'apps/kassa/src/ekran/YanaSozlama.tsx'), 'utf8');
  tekshir(
    '«shifo» palitrasi olib tashlangan',
    !/export const SHIFO/.test(temaMatn2) && !/\bSHIFO\b/.test(app),
    'tema.ts, App.tsx',
  );
  tekshir('sozlamada «shifo» tugmasi yo‘q', !/k: 'shifo'/.test(sozlama));
  // Eski tanlov «shifo» saqlangan telefonlarda jimgina yo'qolmasin
  tekshir("saqlangan «shifo» → «tizim» ko'chiriladi", /x === 'shifo'[\s\S]{0,400}setRejim\('tizim'\)/.test(app));
}
console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
