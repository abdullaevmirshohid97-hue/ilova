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
  !/[Ѐ-ӿ]/.test(kirillMatn) && /D.kon|Dukon|Dwkon|Dkon/i.test(kirillMatn),
  kirillMatn.includes('kon') ? 'lotin harflari topildi' : 'TEKSHIRILSIN',
);

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

console.log('\n  fayllar: ' + ish);
console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
