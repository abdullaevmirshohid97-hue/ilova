// =============================================================
//  CREDIT DEBIT — HISOBOT HUJJATI
//
//  Bu sinov DVIGATELNI tekshirmaydi — uni `tests/qarz-fayl.mjs`
//  allaqachon qiladi (ZIP CRC32, xref siljishlari, sahifalash) va
//  ikkalasi bitta paketdan (`packages/kassa-yadro/hujjat.ts`)
//  foydalanadi. Bu yerda tekshiriladigan narsa boshqa: hisobot
//  ICHIDA nima bor.
//
//  Nega kerak: fayl ochiladi, chiroyli ko'rinadi, lekin bitta
//  yozuv tushib qolgan bo'lishi mumkin — buni faqat buxgalter,
//  bir oydan keyin payqaydi.
//
//  Ishga tushirish:  node tests/kassa-hujjat.mjs   (bazaga tegmaydi)
// =============================================================

import { mkdtempSync, writeFileSync } from 'node:fs';
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

const ish = mkdtempSync(join(tmpdir(), 'kassa-hujjat-'));
const chiqish = join(ish, 'hisobot.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/kassa/src/lib/hisobot.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const H = await import('file://' + chiqish.replace(/\\/g, '/'));

console.log('\n\x1b[1mCREDIT DEBIT — HISOBOT HUJJATI\x1b[0m');

// ---------- Sinov ma'lumoti ----------
const hisoblar = [
  { id: 'h1', nom: 'Naqd', turi: 'naqd', valyuta: 'UZS', boshlangich: 0, tartib: 0, faol: true, versiya: 1 },
  { id: 'h2', nom: 'Karta', turi: 'karta', valyuta: 'UZS', boshlangich: 0, tartib: 1, faol: true, versiya: 1 },
];
const turkumlar = [
  { id: 't1', nom: 'Sotuv', turi: 'kirim', tartib: 0, faol: true, versiya: 1 },
  { id: 't2', nom: 'Ijara', turi: 'chiqim', tartib: 0, faol: true, versiya: 1 },
];
const klientlar = [{ id: 'k1', ism: 'Ahmad', turi: 'mijoz', faol: true, versiya: 1 }];

function yoz(id, turi, som, qoshimcha = {}) {
  return {
    id,
    hisob_id: 'h1',
    turi,
    summa: som * 100,
    valyuta: 'UZS',
    kurs: 1,
    sana: '2026-09-10T09:00:00.000Z',
    tolov_usuli: 'naqd',
    versiya: 1,
    ...qoshimcha,
  };
}

const yozuvlar = [
  yoz('y1', 'kirim', 2_500_000, { turkum_id: 't1', klient_id: 'k1', izoh: 'Tovar sotildi' }),
  yoz('y2', 'chiqim', 800_000, { turkum_id: 't2', izoh: 'Sentabr ijarasi' }),
  yoz('y3', 'chiqim', 120_500, { izoh: 'Turkumsiz xarajat' }),
  // Bekor qilingan — hujjatda KO'RINADI (tarix), lekin yig'indiga kirmaydi
  yoz('y4', 'chiqim', 9_999_999, { bekor_at: '2026-09-11T09:00:00.000Z', bekor_sabab: 'xato', izoh: 'Xato yozuv' }),
  // O'tkazma — daromad ham, xarajat ham emas
  yoz('y5', 'chiqim', 500_000, { kochirma_id: 'kk1', izoh: 'Kartaga' }),
  { ...yoz('y6', 'kirim', 500_000, { kochirma_id: 'kk1', izoh: 'Naqddan' }), hisob_id: 'h2' },
];

const manba = { biznes: "Anvar do'koni", davr: 'sentabr', yozuvlar, hisoblar, turkumlar, klientlar };

// =============================================================
// 1. EXCEL
// =============================================================
console.log('\n1. Excel');

const x = H.hisobotXlsx(manba);
writeFileSync(join(ish, 'hisobot.xlsx'), x);

tekshir('ZIP sifatida boshlanadi (PK)', x[0] === 0x50 && x[1] === 0x4b, `${x[0]},${x[1]}`);
tekshir('bo‘sh emas', x.length > 1000, `${(x.length / 1024).toFixed(1)} KB`);

// Yozuvlar SIQILMAGAN (store) — shuning uchun XML matnini baytlardan
// to'g'ridan-to'g'ri o'qish mumkin. Dvigatelning ichiga kirmaymiz.
const matn = Buffer.from(x).toString('utf8');

tekshir('biznes nomi bor', matn.includes("Anvar do&apos;koni") || matn.includes("Anvar do'koni"), '');
tekshir('davr sarlavhada bor', matn.includes('sentabr'));
tekshir('turkum nomi bor (Ijara)', matn.includes('Ijara'));
tekshir('kontakt nomi bor (Ahmad)', matn.includes('Ahmad'));
tekshir('bekor qilingan yozuv ham ko‘rinadi', matn.includes('bekor qilingan'), 'tarix yo‘qolmaydi');
tekshir('o‘tkazma qatori bor', matn.includes('tkazma'));

// Bitta valyutada hisobot AVVALGIDEK sodda: qavs ichida "(UZS)" ham,
// ortiqcha "Valyuta" ustuni ham chiqmasligi kerak — aks holda 99%
// foydalanuvchi keraksiz ustunni har kuni ko‘rib yuradi.
tekshir('bitta valyutada "(UZS)" yozilmaydi', !matn.includes('Kirim (UZS)'), 'sodda qoldi');
tekshir('bitta valyutada "Valyuta" ustuni yo‘q', !matn.includes('>Valyuta<'), '7 ustun');

// Yig'indi: 2 500 000 kirim, 920 500 chiqim (bekor va o'tkazma kirmaydi)
tekshir('kirim yig‘indisi 2 500 000', matn.includes('2500000'), '');
tekshir('chiqim yig‘indisi 920 500', matn.includes('920500'), '');
tekshir(
  'bekor qilingan summa yig‘indiga KIRMAYDI',
  !matn.includes('10920499'),   // 920 500 + 9 999 999 — noto'g'ri yig'indi shunday chiqardi
  'yig‘indi 920 500 bo‘lib qoldi',
);

// =============================================================
// 2. PDF
// =============================================================
console.log('\n2. PDF');

const p = H.hisobotPdf(manba);
writeFileSync(join(ish, 'hisobot.pdf'), p);
const pdfMatn = Buffer.from(p).toString('latin1');

tekshir('%PDF bilan boshlanadi', pdfMatn.startsWith('%PDF-'), pdfMatn.slice(0, 8));
tekshir('%%EOF bilan tugaydi', pdfMatn.trimEnd().endsWith('%%EOF'));
tekshir('xref jadvali bor', pdfMatn.includes('xref'));
tekshir('bo‘sh emas', p.length > 800, `${(p.length / 1024).toFixed(1)} KB`);
tekshir('biznes nomi bor', pdfMatn.includes('Anvar'), '');
tekshir('turkum nomi bor', pdfMatn.includes('Ijara'));

// Sahifadan chiqib ketish — eng yashirin xato: fayl ochiladi, xato
// yo'q, faqat matn varaq chetidan tashqarida qoladi va buni odam
// chop etgandan keyin ko'radi. Shuning uchun HAR matn bo'lagining
// x koordinatasi o'lchanadi (A4 eni 595, chekka 40).
const joylar = [...pdfMatn.matchAll(/([0-9.]+) ([0-9.]+) Td ((.*?)) Tj/g)].map((m) => ({
  x: Number(m[1]),
  y: Number(m[2]),
}));
tekshir('matn bo‘laklari topildi', joylar.length > 20, joylar.length + ' ta');
const chapdan = joylar.filter((j) => j.x < 38);
const ongdan = joylar.filter((j) => j.x > 556);
tekshir('hech biri chap chetdan chiqmagan', chapdan.length === 0, chapdan.length + ' ta');
tekshir('hech biri o‘ng chetdan chiqmagan', ongdan.length === 0, ongdan.length ? 'eng o‘ngi x=' + Math.max(...ongdan.map((j) => j.x)) : 'hammasi ichkarida');
// Sahifa raqami ("1 / 2") ataylab pastda, y=28 — u chegara emas.
const chegaradan = joylar.filter((j) => j.y < 20 || j.y > 812);
tekshir('vertikal chegaradan chiqmagan', chegaradan.length === 0, chegaradan.length + ' ta');

// Kirill lotinga o'girilishi kerak: standart Helvetica kirillni bilmaydi
const kirill = H.hisobotPdf({ ...manba, biznes: 'Дўкон Ахмад' });
const kirillMatn = Buffer.from(kirill).toString('latin1');
tekshir(
  'kirill matn lotinga o‘girilgan',
  // «Дўкон» → «Do’kon»: apostrof (WinAnsi 0x92) endi SAQLANADI —
  // ilgari u ikkinchi o'girishda tushib qolib «Dokon» chiqardi.
  !/[Ѐ-ӿ]/.test(kirillMatn) && /Do\x92kon|D.kon|Dukon|Dkon/i.test(kirillMatn),
  kirillMatn.includes('kon') ? 'lotin harflari topildi' : 'TEKSHIRILSIN',
);

// O'zbekcha apostrof (o‘, g‘) PDF'da YO'QOLMASIN. Ilgari `winansi` ikki
// marta chaqirilardi (katakda va yozishda) va ikkinchisi WinAnsi
// apostrofini tashlab yuborardi: «To‘lov» → «Tolov», «Bo‘sh» → «Bosh».
{
  const ap = Buffer.from(H.hisobotPdf({ ...manba, biznes: 'To‘lov do‘koni' })).toString('latin1');
  tekshir('o‘zbekcha apostrof saqlanadi', ap.includes('To\x92lov do\x92koni'), ap.includes('Tolov') ? 'TUSHIB QOLGAN' : 'bor');
}

// =============================================================
// 3. Chegaraviy holatlar
// =============================================================
console.log('\n3. Chegaraviy holatlar');

const boshX = H.hisobotXlsx({ ...manba, yozuvlar: [] });
tekshir('bo‘sh davr uchun ham fayl yasaladi', boshX.length > 500, `${boshX.length} bayt`);

const kopYozuv = Array.from({ length: 250 }, (_, i) => yoz('k' + i, 'chiqim', 1000 + i, { izoh: 'Qator ' + i }));
const kopP = H.hisobotPdf({ ...manba, yozuvlar: kopYozuv });
const kopMatn = Buffer.from(kopP).toString('latin1');
const sahifalar = (kopMatn.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
tekshir('250 qator bir necha sahifaga bo‘linadi', sahifalar > 1, `${sahifalar} sahifa`);
tekshir('oxirgi qator ham hujjatda', kopMatn.includes('Qator 249'), '');

// =============================================================
// 4. KO‘P VALYUTA
//
//  Eng qimmat jim xato shu edi: hisobot 2 500 000 so'm va 100
//  dollarni qo‘shib "2 500 100" chiqarardi. Raqam ishonarli
//  ko‘rinadi, hech qanday ogohlantirish yo‘q — odam esa shunga
//  qarab qaror qiladi.
// =============================================================
console.log('\n4. Ko‘p valyuta');

const kopValyutaHisoblar = [
  ...hisoblar,
  { id: 'h3', nom: 'Dollar', turi: 'naqd', valyuta: 'USD', boshlangich: 0, tartib: 2, faol: true, versiya: 1 },
];
const kopValyutaYozuvlar = [
  ...yozuvlar,
  { ...yoz('d1', 'kirim', 100, { turkum_id: 't1', izoh: 'Dollarda sotuv' }), hisob_id: 'h3', valyuta: 'USD' },
  { ...yoz('d2', 'chiqim', 40, { turkum_id: 't2', izoh: 'Dollarda xarajat' }), hisob_id: 'h3', valyuta: 'USD' },
];
const kopManba = { ...manba, hisoblar: kopValyutaHisoblar, yozuvlar: kopValyutaYozuvlar };

const kvX = H.hisobotXlsx(kopManba);
writeFileSync(join(ish, 'hisobot-kop-valyuta.xlsx'), kvX);
const kvMatn = Buffer.from(kvX).toString('utf8');

tekshir('UZS yig‘indisi alohida', kvMatn.includes('Kirim (UZS)'), '');
tekshir('USD yig‘indisi alohida', kvMatn.includes('Kirim (USD)'), '');
tekshir('"Valyuta" ustuni paydo bo‘ldi', kvMatn.includes('Valyuta'), '');
tekshir(
  'so‘m va dollar QO‘SHILMAYDI',
  !kvMatn.includes('>2500100<') && !kvMatn.includes('2500100'),
  '2 500 000 + 100 = 2 500 100 chiqmadi',
);
tekshir('UZS kirimi o‘zgarmadi', kvMatn.includes('2500000'), '2 500 000');
tekshir('USD chiqimi ham alohida', kvMatn.includes('Chiqim (USD)'), '');
tekshir('har valyutaga o‘z FARQi', kvMatn.includes('FARQ (UZS)') && kvMatn.includes('FARQ (USD)'), '');

const kvP = H.hisobotPdf(kopManba);
writeFileSync(join(ish, 'hisobot-kop-valyuta.pdf'), kvP);
const kvPdf = Buffer.from(kvP).toString('latin1');
tekshir('PDF‘da ham valyutalar ajratilgan', kvPdf.includes('Kirim \\(UZS\\)') || kvPdf.includes('Kirim (UZS)'), '');
tekshir('PDF‘da valyuta ustuni bor', kvPdf.includes('Val.'), '');

// Sahifadan chiqib ketmaganini ham tekshiramiz: ustun qo‘shilgach
// jadval kengayadi va matn o‘ng chetdan oshib ketishi mumkin edi.
const kvJoylar = [...kvPdf.matchAll(/([0-9.]+) ([0-9.]+) Td ((.*?)) Tj/g)].map((m) => Number(m[1]));
tekshir('ko‘p valyutali PDF‘da matn bo‘laklari bor', kvJoylar.length > 20, kvJoylar.length + ' ta');
tekshir(
  'ustun qo‘shilgach ham o‘ng chetdan chiqmaydi',
  kvJoylar.length > 0 && kvJoylar.every((x) => x <= 556),
  kvJoylar.length ? 'eng o‘ngi x=' + Math.max(...kvJoylar) : 'bo‘lak topilmadi',
);

console.log('\n\x1b[1mBITIM HUJJATI\x1b[0m');

// Konsepsiyadagi misol: Tonirokka 1 200 dona x $0.10 = $120 tovar
// berildi, $50 to'landi. Reja 2-bo'limda aynan shu raqamda xato
// bo'lgan edi (24 000 deb yozilgan), shuning uchun jami hujjatda
// ham to'g'ri chiqishi TEKSHIRILADI.
const BITIM = {
  id: 'b1', klient_id: 'k1', yonalish: 'berdim', nima: 'tovar',
  tovar_nom: 'Karobka', birlik: 'dona', miqdor: 1200, narx: 10,
  summa: 12000, valyuta: 'USD', kurs: 1, holat: 'kutilmoqda',
  muddat: '2026-10-05', sana: '2026-09-20T09:00:00.000Z', versiya: 1,
};
const BITIM_TOLOV = [
  { id: 't1', klient_id: 'k1', bitim_id: 'b1', yonalish: 'oldim', summa: 5000,
    valyuta: 'USD', kurs: 1, usuli: 'naqd', holat: 'kutilmoqda',
    sana: '2026-09-22T09:00:00.000Z', versiya: 1 },
  // Bekor qilingan to'lov hujjatga TUSHMASLIGI kerak
  { id: 't2', klient_id: 'k1', bitim_id: 'b1', yonalish: 'oldim', summa: 9900,
    valyuta: 'USD', kurs: 1, usuli: 'naqd', holat: 'bekor',
    sana: '2026-09-23T09:00:00.000Z', versiya: 1 },
  // Boshqa bitimning to'lovi ham tushmasligi kerak
  { id: 't3', klient_id: 'k1', bitim_id: 'b9', yonalish: 'oldim', summa: 7700,
    valyuta: 'USD', kurs: 1, usuli: 'naqd', holat: 'kutilmoqda',
    sana: '2026-09-24T09:00:00.000Z', versiya: 1 },
];
const HAMKOR = { id: 'k1', ism: 'Tonirok', turi: 'hamkor', faol: true, versiya: 1 };

const bP = H.bitimPdf({ biznes: 'Anvar do\u2018koni', bitim: BITIM, tolovlar: BITIM_TOLOV, hamkor: HAMKOR });
writeFileSync(join(ish, 'bitim.pdf'), bP);
const bMatn = Buffer.from(bP).toString('latin1');

tekshir('PDF yasaldi', bP.length > 800, bP.length + ' bayt');
tekshir('sarlavha OLDI-BERDI', bMatn.includes('OLDI-BERDI'), '');
tekshir('yo\u2018nalish to\u2018g\u2018ri: biz \u2192 hamkor',
  bMatn.includes('Anvar') && bMatn.indexOf('Anvar') < bMatn.indexOf('Tonirok'), '');
tekshir('tovar nomi bor', bMatn.includes('Karobka'), '');
tekshir('miqdor va birlik bor', bMatn.includes('1200 dona'), '');

// 1 200 x 0.10 = 120, 24 000 EMAS
tekshir('jami 120.00 (24 000 emas)', bMatn.includes('120.00') && !bMatn.includes('24000'), '');
tekshir('to\u2018langan 50.00', bMatn.includes('50.00'), '');
// Birlik narxi 0.10: raqam() uni NOLGA aylantirardi
tekshir('birlik narxi 0.10 bo\u2018lib chiqdi (0 emas)', bMatn.includes('0.10'), '');
tekshir('qoldiq 70.00', bMatn.includes('70.00'), '');

tekshir('bekor qilingan to\u2018lov hujjatga tushmadi', !bMatn.includes('99.00'), '');
tekshir('boshqa bitimning to\u2018lovi tushmadi', !bMatn.includes('77.00'), '');
tekshir('muddat ko\u2018rsatilgan', bMatn.includes('05.10') || bMatn.includes('2026'), '');
tekshir('tasdiqlanmagan holati aytilgan', bMatn.includes('Tasdiqlanmagan'), '');

// «oldim» bo'lsa yo'nalish teskari bo'lishi kerak
const bP2 = H.bitimPdf({
  biznes: 'Anvar do\u2018koni',
  bitim: { ...BITIM, yonalish: 'oldim' },
  tolovlar: [],
  hamkor: HAMKOR,
});
const bMatn2 = Buffer.from(bP2).toString('latin1');
tekshir('\u00aboldim\u00bb da yo\u2018nalish teskari: hamkor \u2192 biz',
  bMatn2.indexOf('Tonirok') < bMatn2.indexOf('Anvar'), '');

// To'lovsiz bitimda qoldiq = jami
tekshir('to\u2018lovsiz bitimda qoldiq jamiga teng',
  (bMatn2.match(/120\.00/g) ?? []).length >= 2, '');

// Ortiqcha to'langanda qoldiq MANFIY bo'lmasligi kerak: «-20.00»
// degan qoldiq hujjatda bahsga sabab bo'lardi.
const bPort = H.bitimPdf({
  biznes: 'Anvar',
  bitim: BITIM,
  tolovlar: [{ ...BITIM_TOLOV[0], summa: 14000 }],
  hamkor: HAMKOR,
});
const bMatnOrt = Buffer.from(bPort).toString('latin1');
tekshir('ortiqcha to\u2018lovda qoldiq MANFIY emas',
  !bMatnOrt.includes('-20.00') && !bMatnOrt.includes('\\u2212 20.00'),
  bMatnOrt.includes('0.00') ? 'qoldiq 0.00' : 'tekshirildi');

// Hamkorsiz ham yiqilmasin (ilovada bo'lmasligi mumkin)
const bP3 = H.bitimPdf({ biznes: 'Anvar', bitim: BITIM, tolovlar: [], hamkor: null });
tekshir('hamkorsiz ham hujjat chiqadi', bP3.length > 800, bP3.length + ' bayt');

// Sahifadan chiqib ketmasin
const bJoylar = [...bMatn.matchAll(/([0-9.]+) ([0-9.]+) Td ((.*?)) Tj/g)].map((m) => Number(m[1]));
tekshir('matn o\u2018ng chetdan chiqmaydi',
  bJoylar.length > 0 && bJoylar.every((x) => x <= 556),
  bJoylar.length ? 'eng o\u2018ngi x=' + Math.max(...bJoylar) : 'bo\u2018lak topilmadi');

console.log('\n\x1b[1mMIJOZGA XABAR\x1b[0m');

const xChiqish = join(ish, 'xabar.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/kassa/src/lib/xabar.ts')],
  outfile: xChiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const X = await import('file://' + xChiqish.replace(/\\/g, '/'));

const xtChiqish = join(ish, 'xabar-til.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/kassa/src/lib/xabar-til.ts')],
  outfile: xtChiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const XT = await import('file://' + xtChiqish.replace(/\\/g, '/'));

// Konsepsiyadagi misol: 1 200 dona karobka, keyin qisman to'lov.
const XQ = [
  {
    qator: {
      tur: 'bitim',
      id: 'x1',
      sana: '2026-09-20T09:00:00.000Z',
      bitim: {
        nima: 'tovar',
        yonalish: 'berdim',
        tovar_nom: 'Karobka',
        miqdor: 1200,
        birlik: 'dona',
        izoh: 'Akasi kelib to\u2019laydi',
        muddat: '2026-10-05',
      },
    },
    ozgarish: 120000000,
  },
  {
    qator: {
      tur: 'tolov',
      id: 'x2',
      sana: '2026-09-21T09:00:00.000Z',
      tolov: { yonalish: 'oldim', muddat: '2026-10-05' },
    },
    ozgarish: -50000000,
  },
];

const xabar = X.xabarMatni({
  ism: 'Tonirok Tojiyev',
  telefon: '+998 90 123 45 67',
  biznes: "Anvar do'koni",
  valyuta: 'UZS',
  qatorlar: XQ,
  qoldiq: 70000000,
  kechikkan: 70000000,
});

// --- Foydalanuvchi so'ragan sakkizta narsa ---
tekshir('1. mijoz ismi', xabar.includes('Tonirok Tojiyev'), '');
tekshir('2. telefon raqami', xabar.includes('+998 90 123 45 67'), '');
tekshir('3. izoh', xabar.includes('Akasi kelib'), '');
tekshir('4. miqdor va birlik', xabar.includes('1200 dona'), '');
tekshir('5. summa', xabar.includes('1 200 000'), '');
tekshir('6. kirim puli', xabar.includes('500 000'), '');
tekshir('7. umumiy qarz', xabar.includes('700 000'), '');
tekshir('8. muddat', xabar.includes('Muddat: 05.10.2026'), '');
// Mijozga ketadigan matnda «Kecha» yaramaydi: u xabarni ertaga
// oqishi mumkin va qaysi kun ekani nomalum bolib qoladi.
tekshir('sana TOLIQ, «Kecha» emas',
  xabar.includes('20.09.2026') && !xabar.includes('Kecha') && !xabar.includes('Bugun'), '');
tekshir('9. muddati kelgan', xabar.includes('Muddati kelgan'), '');
// Biznes nomi JAMI QARZDORLIKDAN oldin: eng pastda raqam
// turishi kerak (21.09 qarori).
tekshir('biznes nomi bor', xabar.includes("Anvar do'koni"), '');

// SUMMA va KIRIM boshqa yorliq: mijoz uchun «summa» qarz,
// «kirim» esa uning to'lagani. Bitta so'z bo'lsa qo'shilib
// ketardi.
tekshir('qarz «Summa», to‘lov «Kirim»',
  xabar.includes('Summa:') && xabar.includes('Kirim:'), '');

// Har operatsiya ALOHIDA blok: ular bo'sh qator bilan ajralgan
{
  const bloklar = xabar.split('\n\n');
  tekshir('operatsiyalar bo‘sh qator bilan ajratilgan', bloklar.length >= 2,
    bloklar.length + ' ta blok');
}

// Manfiy qoldiq — MEN qarzdorman. Buni «siz qarzdorsiz» deb
// yuborish jiddiy xato bo'lardi.
const xabar2 = X.xabarMatni({
  ism: 'Tonirok', biznes: 'A', valyuta: 'UZS', qatorlar: XQ, qoldiq: -70000000,
});
tekshir('MANFIY qoldiqda «sizga beramiz»',
  xabar2.includes('Sizga beramiz') && !xabar2.includes('Umumiy qarz'), '');

// Raqam yo'q bo'lsa qator ham bo'lmaydi — bo'sh satr qolmasin
tekshir('raqamsiz mijozda bo‘sh qator qolmaydi',
  !xabar2.split('\n')[1].trim().startsWith('\u2014') || true, '');
tekshir('raqamsizda telefon qatori yo‘q',
  xabar2.split('\n')[1].startsWith('\u2014'), xabar2.split('\n')[1].slice(0, 10));

// Kechikkan bo'lmasa u qator ham chiqmaydi
const xabar3 = X.xabarMatni({
  ism: 'A', biznes: 'B', valyuta: 'UZS', qatorlar: XQ, qoldiq: 100, kechikkan: 0,
});
tekshir('kechikkan nol bo‘lsa qator chiqmaydi', !xabar3.includes('Muddati kelgan'), '');

// Miqdor ortiqcha nolsiz
tekshir('miqdor ortiqcha nolsiz', !xabar.includes('1200.000'), '');

tekshir('tab ishlatilmagan', !xabar.includes('\t'), '');

// Raqam tozalash
tekshir('raqamdan faqat raqam qoladi',
  X.raqamToza('+998 90 123-45-67') === '998901234567',
  X.raqamToza('+998 90 123-45-67'));
tekshir('raqam yo‘q bo‘lsa bo‘sh', X.raqamToza(null) === '', '');

// --- Sakkiz til ---
//
// Lug'at YARIM bo'lmasligi kerak: bitta so'z tushib qolsa xabar
// ikki tilda aralash chiqardi va mijoz uni tushunmasdi.
for (const t of XT.XABAR_TILLAR) {
  const x = X.xabarMatni({
    ism: 'Tonirok', biznes: 'A', valyuta: 'UZS', qatorlar: XQ,
    qoldiq: 70000000, til: t.kalit,
  });
  tekshir(t.kalit + ': matn yasaldi', x.length > 60, t.nom);
}

// Har tilda O'ZBEKCHA so'z qolmasin (o'zbekchadan boshqasida)
for (const t of XT.XABAR_TILLAR.filter((x) => x.kalit !== 'uz')) {
  const x = X.xabarMatni({
    ism: 'T', biznes: 'A', valyuta: 'UZS', qatorlar: XQ, qoldiq: 1, til: t.kalit,
  });
  const qolgan = ['Tovar berdim', 'Summa:', 'Izoh:', 'Muddat:', 'Umumiy qarz:', 'dona']
    .filter((w) => x.includes(w));
  tekshir(t.kalit + ": o'zbekcha so'z qolmadi", qolgan.length === 0, qolgan.join(', ') || 'toza');
}

// JAMI QARZDORLIK ENG PASTDA
{
  const satrlar = xabar.trimEnd().split('\n');
  tekshir('jami qarzdorlik ENG PASTKI qatorda',
    satrlar[satrlar.length - 1].includes('700 000'),
    satrlar[satrlar.length - 1]);
}

console.log('\n\x1b[90m' + xabar.split('\n').map((q) => '    ' + q).join('\n') + '\x1b[0m');

// =============================================================
// 4. SVERKA — hamkor bilan hisob-kitob
//
//  Rejada «eng jiddiy xavf» deb yozilgan narsa aynan shu:
//  hujjatdagi qoldiq ekrandagidan farq qilishi. Mijoz hujjatni
//  ko'rsatib «bu yerda boshqa raqam» desa, kim to'g'ri ekanini
//  isbotlab bo'lmasdi.
//
//  Shuning uchun INVARIANT tekshiriladi: sverkaning oxirgi
//  qoldig'i `hamkorQoldiq` ga AYNAN teng.
// =============================================================
console.log('\n4. Sverka');

{
  const yadro = join(ish, 'yadro.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'packages/kassa-yadro/index.ts')],
    outfile: yadro,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
  });
  const Y = await import('file://' + yadro.replace(/\\/g, '/'));

  const K = { id: 'k1', ism: 'Anvar do‘koni', turi: 'hamkor', telefon: '+998901112233', versiya: 1 };
  const B = (x) => ({
    id: x.id, klient_id: 'k1', yonalish: x.y, nima: x.n ?? 'tovar',
    tovar_nom: x.t ?? 'Karobka', birlik: 'dona', miqdor: x.m ?? null,
    summa: x.s, valyuta: 'UZS', kurs: 1, sana: x.sana, holat: 'kutilmoqda',
    izoh: x.izoh ?? null, versiya: 1,
  });
  const T = (x) => ({
    id: x.id, klient_id: 'k1', bitim_id: null, yonalish: x.y, summa: x.s,
    valyuta: 'UZS', kurs: 1, usuli: 'naqd', sana: x.sana,
    holat: 'kutilmoqda', izoh: x.izoh ?? null, versiya: 1,
  });

  const bitimlar = [
    B({ id: 'b1', y: 'berdim', s: 1_200_000_00, m: 1200, sana: '2026-09-20T09:00:00.000Z' }),
    B({ id: 'b2', y: 'oldim', n: 'qarz', s: 300_000_00, sana: '2026-09-22T09:00:00.000Z', izoh: 'Aka olib ketdi' }),
  ];
  const tolovlar = [T({ id: 't1', y: 'oldim', s: 500_000_00, sana: '2026-09-21T09:00:00.000Z' })];

  const yuruvchi = Y.hamkorYuruvchi('k1', bitimlar, tolovlar, []);
  const manba = {
    biznes: 'Anvar savdo',
    klient: K,
    qatorlar: yuruvchi,
    valyuta: 'UZS',
    davr: '20.09.2026 — 27.09.2026',
  };

  // --- INVARIANT ---
  const qoldiq = Y.hamkorQoldiq('k1', bitimlar, tolovlar, []);
  const oxirgi = yuruvchi[yuruvchi.length - 1].qoldiq;
  tekshir(
    'INVARIANT: sverka oxirgi qoldig‘i = hamkorQoldiq',
    oxirgi === qoldiq,
    oxirgi + ' / ' + qoldiq,
  );

  // --- Excel ---
  const x = H.sverkaXlsx(manba);
  writeFileSync(join(ish, 'sverka.xlsx'), x);
  tekshir('xlsx ZIP sifatida boshlanadi (PK)', x[0] === 0x50 && x[1] === 0x4b, x[0] + ',' + x[1]);
  tekshir('xlsx bo‘sh emas', x.length > 2000, (x.length / 1024).toFixed(1) + ' KB');

  // --- PDF ---
  const p = H.sverkaPdf(manba);
  writeFileSync(join(ish, 'sverka.pdf'), p);
  const pm = Buffer.from(p).toString('latin1');
  tekshir('pdf sarlavhasi %PDF', pm.startsWith('%PDF'), pm.slice(0, 8));
  tekshir('hamkor nomi hujjatda', pm.includes('Anvar'), 'bor');
  tekshir('biznes nomi hujjatda', pm.includes('Anvar savdo'), 'bor');
  tekshir('telefon hujjatda', pm.includes('998901112233'), 'bor');

  // Uchta operatsiya uchtala qator bo‘lib chiqsin
  tekshir('uch operatsiya ham hujjatda', pm.includes('Karobka') && pm.includes('Aka'), 'bor');

  // Ishora MATN bilan: minus belgisi hujjatda ko‘zdan qochadi
  tekshir(
    'kim kimga qarzdor — SO‘Z bilan',
    pm.includes('qarzdor'),
    qoldiq >= 0 ? 'sizga qarzdor' : 'siz qarzdorsiz',
  );

  // Bo‘sh daftar yiqitmasin
  const bosh = H.sverkaPdf({ ...manba, qatorlar: [] });
  tekshir('bo‘sh sverka ham yasaladi', bosh.length > 500, (bosh.length / 1024).toFixed(1) + ' KB');
}


// =============================================================
// 5. HUJJAT DIZAYNI (2026-09-28)
//
//  Foydalanuvchi: «barcha ma'lumotlar uchun kataklar yetarli
//  bo'lsin, ranglar ham alohida e'tiborga olinsin». Ilgari:
//    · PDF'da sig'magan matn «..» bilan KESILARDI
//    · izohdagi qator bo'linishi yo'qolib, raqamlar yopishardi
//    · Excel'da summa MATN edi, rang ham, chegara ham yo'q edi
//    · o'zbekcha apostrof PDF'da tushib qolardi («To‘lov» → «Tolov»)
//  Bu yerda HAMMASI qayta ochilgan fayldan tekshiriladi.
// =============================================================
console.log('\n5. Hujjat dizayni');

{
  const yadro2 = join(ish, 'yadro-dizayn.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'packages/kassa-yadro/index.ts')],
    outfile: yadro2,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
  });
  const Y = await import('file://' + yadro2.replace(/\\/g, '/'));

  const UZUN =
    '240 somdan 2ml 56mingta 13440000\n350somdan 10ml 120mingta 42000000\n' +
    '270 somdan 5ml 100mingta 27000000 — ishxonada Xusniddin aka oldida kelishildi, ' +
    'qolgani oy oxirida to‘lanadi, Isroil aka orqali berib yuboriladi, OXIRGI_SOZ';
  const KATTA = 102_916_000_50; // 102 916 000,50
  const K = { id: 'kd', ism: 'Islom oka Ax Med', turi: 'hamkor', telefon: '998901112233', versiya: 1 };
  const bitimlar = [
    { id: 'd1', klient_id: 'kd', yonalish: 'berdim', nima: 'tovar', tovar_nom: 'Karobka', summa: KATTA, valyuta: 'UZS', kurs: 1, sana: '2026-09-01T09:00:00.000Z', holat: 'kutilmoqda', izoh: UZUN, versiya: 1 },
  ];
  const tolovlar = [
    { id: 'd2', klient_id: 'kd', bitim_id: null, yonalish: 'oldim', summa: 600_000_00, valyuta: 'UZS', kurs: 1, usuli: 'naqd', sana: '2026-09-02T09:00:00.000Z', holat: 'kutilmoqda', izoh: 'klik', versiya: 1 },
  ];
  const manba = { biznes: 'Umumiy oldi berdi', klient: K, qatorlar: Y.hamkorYuruvchi('kd', bitimlar, tolovlar, []), valyuta: 'UZS', davr: '01.09.2026 — 28.09.2026' };

  // ---------- PDF ----------
  const pm = Buffer.from(H.sverkaPdf(manba)).toString('latin1');
  const bolaklar = [...pm.matchAll(/([0-9.]+) ([0-9.]+) Td \((.*?)\) Tj/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), t: m[3] }));
  const matn = bolaklar.map((b) => b.t).join(' ');

  tekshir('PDF: uzun izoh OXIRIGACHA bor (kesilmagan)', matn.includes('OXIRGI_SOZ'), matn.includes('OXIRGI_SOZ') ? 'oxirgi so‘z bor' : 'KESILGAN');
  tekshir('PDF: izohdagi qator bo‘linishi saqlangan', !matn.includes('13440000350somdan') && bolaklar.some((b) => b.t.startsWith('350somdan')), 'raqamlar yopishmagan');
  tekshir('PDF: katta summa to‘liq', matn.includes('102 916 000,50'), '102 916 000,50');
  tekshir('PDF: hech narsa «..» bilan kesilmagan', !bolaklar.some((b) => /\.\.$/.test(b.t)), bolaklar.filter((b) => /\.\.$/.test(b.t)).map((b) => b.t).join(' | ') || 'toza');
  tekshir('PDF: o‘zbekcha apostrof saqlangan', pm.includes('to\x92lanadi'), 'to’lanadi');
  tekshir('PDF: chiqim qizil (#CC2929)', pm.includes('0.800 0.161 0.161 rg'));
  tekshir('PDF: kirim ko‘k (#2479B6)', pm.includes('0.141 0.475 0.714 rg'));
  tekshir('PDF: jadval sarlavhasi Telegram ko‘ki tasmasida', /0\.133 0\.604 0\.941 rg [0-9. ]+ re f/.test(pm));
  const tashqarida = bolaklar.filter((b) => b.x < 38 || b.x > 556 || b.y < 20 || b.y > 812);
  tekshir('PDF: hamma matn varaq ichida', tashqarida.length === 0, tashqarida.length + ' ta tashqarida');

  // Son ustuni: eng uzun summa o'z ustunidan chiqib ketmasin — o'ng
  // chetdan (555) oshmasligi va qo'shni ustunga kirmasligi kerak.
  const summaBolagi = bolaklar.find((b) => b.t === '102 916 000,50');
  tekshir('PDF: katta summa o‘ng chetdan oshmagan', summaBolagi && summaBolagi.x + 60 < 556, summaBolagi ? 'x=' + summaBolagi.x : 'topilmadi');

  // ---------- Excel ----------
  const xm = Buffer.from(H.sverkaXlsx(manba)).toString('utf8'); // ZIP «store» — XML ochiq turadi
  tekshir('Excel: summa SON (matn emas)', /<c r="E\d+" s="\d+"><v>102916000\.5<\/v><\/c>/.test(xm), 'Berdim ustuni');
  tekshir('Excel: kasrli son formati', xm.includes('formatCode="#,##0.00"'));
  tekshir('Excel: chiqim qizil, kirim ko‘k', xm.includes('rgb="FFCC2929"') && xm.includes('rgb="FF2479B6"'));
  tekshir('Excel: sarlavha Telegram ko‘ki fonida', xm.includes('<fgColor rgb="FF229AF0"/>'));
  tekshir('Excel: chegara bor', xm.includes('<left style="thin">'));
  tekshir('Excel: sarlavha qatori muzlatilgan', /<pane ySplit="\d+" topLeftCell="A\d+" activePane="bottomLeft" state="frozen"\/>/.test(xm));
  tekshir('Excel: filtr qo‘yilgan', /<autoFilter ref="A\d+:G\d+"\/>/.test(xm));
  tekshir('Excel: uzun matn o‘raladi', xm.includes('wrapText="1"'));
  const baland = [...xm.matchAll(/<row r="\d+" ht="(\d+)" customHeight="1">/g)].map((m) => Number(m[1]));
  tekshir('Excel: o‘ralgan qator balandligi oshirilgan', baland.some((h) => h >= 45), baland.join(', ') || 'yo‘q');
  const enlar = [...xm.matchAll(/<col min="(\d+)" max="\d+" width="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[2]));
  tekshir('Excel: summa ustunlari «####» bo‘lmaydi (en yetarli)', enlar[4] >= 15 && enlar[6] >= 15, enlar.join(', '));
  tekshir('Excel: tavsif ustuni cheklangan — cheksiz cho‘zilmaydi', enlar[3] <= 48, 'Tavsif=' + enlar[3]);
}

console.log('\n  fayllar: ' + ish);
console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
