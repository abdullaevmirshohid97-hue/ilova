// =============================================================
//  PANEL TUZILISHI SINOVI
//
//  Super admin paneli endi ikki bosqichli: yo'nalish -> modul.
//  Bu tuzilmada bitta jimgina xato bor: modulni `Bolim` ro'yxatida
//  qoldirib, uni hech qaysi yo'nalishga qo'shmaslik. Kod xato
//  bermaydi, build o'tadi, lekin modul panelda UMUMAN KO'RINMAYDI -
//  ya'ni ishlangan ish yo'qolgandek bo'ladi.
//
//  Shuning uchun uch ro'yxat solishtiriladi:
//    1) Bolim turi           - modul nomlari
//    2) YONALISHLAR ichidagi - odam bosa oladigan tugmalar
//    3) bolim === 'x' &&     - ekranda chizilishi
//  Uchalasi bir xil bo'lishi shart.
//
//  Ishga tushirish:  node tests/panel-yonalish.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAYL = 'apps/admin/src/pages/SuperAdminPanel.tsx';
const src = readFileSync(join(ROOT, FAYL), 'utf8');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mPANEL TUZILISHI\x1b[0m\n');

// ---------- 1. Bolim turidagi nomlar ----------
const turQator = src.match(/type Bolim =([^;]+);/);
const turlar = turQator ? [...turQator[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [];
tekshir('Bolim turi topildi', turlar.length > 0, turlar.length + ' ta modul');

// ---------- 2. Yo'nalishlar ichidagi modullar ----------
const yonBlok = src.match(/const YONALISHLAR: Yonalish\[\] = \[([\s\S]*?)\n\];/);
const yonMatn = yonBlok ? yonBlok[1] : '';
// Modul kalitlarini FAQAT `modullar: [...]` ro'yxatlaridan olamiz.
// Avval butun blok bo'ylab qidirilgan edi va yo'nalishning o'z kaliti ham
// (masalan 'sklad') modul deb hisoblanib, yolg'on xato berardi.
const modullar = [...yonMatn.matchAll(/modullar: \[([\s\S]*?)\n {4}\]/g)]
  .flatMap((blok) => [...blok[1].matchAll(/\{ key: '([a-z_]+)'/g)].map((m) => m[1]));
const yonalishlar = [...yonMatn.matchAll(/\n  \{\s*\n?\s*key: '([a-z0-9_]+)'/g)].map((m) => m[1]);

tekshir('yo‘nalish soni 5 ta', yonalishlar.length === 5, yonalishlar.join(', '));
tekshir('DORI-DORIXONA bor', /nom: 'DORI-DORIXONA'/.test(yonMatn));
tekshir('TIZIM bor', /nom: 'TIZIM'/.test(yonMatn));

// ---------- 3. Ekranda chizilishi ----------
const chizilgan = [...src.matchAll(/bolim === '([a-z]+)'/g)].map((m) => m[1]);

// ---------- 4. Uchalasi mos kelishi ----------
for (const t of turlar) {
  tekshir(
    `${t}: yo‘nalish ichida bor`,
    modullar.includes(t),
    modullar.includes(t) ? '' : 'HECH QAYSI YO‘NALISHDA YO‘Q — panelda ko‘rinmaydi',
  );
  tekshir(`${t}: ekranga chiziladi`, chizilgan.includes(t));
}

for (const m of modullar) {
  tekshir(`${m}: Bolim turida bor`, turlar.includes(m));
}

// ---------- 5. Dorixona yo'nalishi to'liqmi ----------
// Foydalanuvchi aynan shu yettitasini bitta joyga yig'ishni so'ragan.
const KUTILGAN = ['dori', 'skladlar', 'sotuv', 'buyurtmalar', 'moslik', 'narxlar', 'mijozlar'];
const dorixona = yonMatn.slice(yonMatn.indexOf("key: 'dorixona'"), yonMatn.indexOf("key: 'tizim'"));
for (const k of KUTILGAN) {
  tekshir(`dorixona ichida: ${k}`, new RegExp(`key: '${k}'`).test(dorixona));
}

// ---------- 6. Yo'nalishdan chiqish yo'li bormi ----------
// Kirib qolib chiqolmaslik - eng oson qilinadigan xato.
tekshir('orqaga qaytish tugmasi bor', /yonalishlargaQayt/.test(src));
tekshir('orqaga qaytish ikki joyda (kompyuter + telefon)',
  (src.match(/onClick=\{yonalishlargaQayt\}/g) ?? []).length === 2);

// ---------- 7. Bo'sh yo'nalish ochilmasin ----------
tekshir('“tez orada” yo‘nalish ochilmaydi', /if \(!y\.modullar\.length\) return;/.test(src));
tekshir('“tez orada” yozuvi bor', /TEZ ORADA/.test(src));

// ---------- 8. Xotira ----------
// sessionStorage bo'lishi SHART: localStorage bo'lsa, odam panelga qayta
// kirganda to'g'ridan-to'g'ri modul ichiga tushib qoladi va yo'nalishlar
// ekranini boshqa ko'rmaydi — so'ralgan xatti-harakat buzilardi.
tekshir('oxirgi yo‘nalish eslab qolinadi', /sessionStorage\.setItem\(XOTIRA/.test(src));
tekshir('localStorage ishlatilmagan', !/localStorage\.\w+\(XOTIRA/.test(src));
tekshir('xotira try/catch ichida', /try \{\s*sessionStorage\.setItem\(XOTIRA/.test(src));

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
