// =============================================================
//  DIZAYN SINOVI
//
//  QA hisobotida topilgan kamchiliklar qaytib kelmasin.
//
//  Bu sinov ikki narsani qiladi:
//   1) Ranglarni WCAG formulasi bilan HISOBLAYDI - "yaxshi ko'rinadi"
//      degan fikrga tayanmaydi. text-gray-400 oq fonda 2.54:1 edi,
//      talab esa 4.5:1.
//   2) Kodda xom brauzer oynachalari qolmaganini tekshiradi.
//
//  Ishga tushirish:  node tests/dizayn.mjs
// =============================================================

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/admin/src');

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

const hammasi = fayllar(SRC);

console.log('\n\x1b[1mDIZAYN\x1b[0m');

// ---------- 1. Kontrast ----------
// WCAG 2.1: oddiy matn uchun 4.5:1, yirik matn uchun 3:1
const hex = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const L = (h) => {
  const [r, g, b] = hex(h);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const nisbat = (a, b) => {
  const [hi, lo] = L(a) > L(b) ? [L(a), L(b)] : [L(b), L(a)];
  return (hi + 0.05) / (lo + 0.05);
};
const aralash = (ust, ost, foiz) => {
  const u = hex(ust), o = hex(ost);
  return '#' + u.map((v, i) => Math.round(v * foiz + o[i] * (1 - foiz)).toString(16).padStart(2, '0')).join('');
};

const OQ = '#ffffff';
const SAHIFA = '#f6f7fb';
const NAVY = '#101425';

console.log('\n1. Rang kontrasti (talab 4.5:1)');
for (const [nom, oldi, orqa] of [
  ['gray-500 / oq', '#6b7280', OQ],
  ['gray-500 / sahifa foni', '#6b7280', SAHIFA],
  ['gray-600 / oq', '#4b5563', OQ],
  ['gray-900 / oq', '#111827', OQ],
  ['brand tugma matni', OQ, '#7000ff'],
  ['menyu izohi (white/55)', aralash(OQ, NAVY, 0.55), NAVY],
]) {
  const n = nisbat(oldi, orqa);
  tekshir(nom, n >= 4.5, n.toFixed(2) + ':1');
}

// Eski, o'qilmaydigan ranglar qaytib kelmasin
console.log('\n2. O‘qilmaydigan ranglar qaytmadimi');
for (const [sinf, nisbatMatn] of [
  ['text-gray-400', '2.54:1'],
  ['text-white/40', '3.82:1'],
]) {
  const topilgan = hammasi.filter((f) => readFileSync(f, 'utf8').includes(sinf));
  tekshir(
    `${sinf} ishlatilmagan (${nisbatMatn})`,
    topilgan.length === 0,
    topilgan.length ? topilgan.length + ' faylda bor' : 'toza',
  );
}

// ---------- 3. Brauzer oynachalari ----------
console.log('\n3. Brauzer oynachalari');
const xomlar = [];
for (const f of hammasi) {
  if (f.endsWith('Xabar.tsx')) continue; // komponentning o'zi
  const s = readFileSync(f, 'utf8');
  if (/(^|[^a-zA-Z.])(alert|confirm)\(/m.test(s)) xomlar.push(f.split(/[\\/]/).pop());
}
tekshir('xom alert/confirm qolmadi', xomlar.length === 0, xomlar.join(', ') || 'toza');

const xabarKomp = readFileSync(join(SRC, 'components/Xabar.tsx'), 'utf8');
tekshir('toast komponenti bor', /XabarProvider/.test(xabarKomp));
tekshir('tasdiqlash va’da qaytaradi', /Promise<boolean>/.test(xabarKomp));

// ---------- 4. Klaviatura ----------
console.log('\n4. Klaviatura');
tekshir('tasdiqlash oynasi Escape bilan yopiladi', /e\.key === 'Escape'/.test(xabarKomp));
tekshir('fokus oynadan chiqib ketmaydi', /e\.key !== 'Tab'/.test(xabarKomp));
tekshir('oyna ochilganda fokus ichkarida', /tugma\.current\?\.focus\(\)/.test(xabarKomp));

// ---------- 5. Barmoq uchun o'lcham ----------
console.log('\n5. Sensorli ekran');
const css = readFileSync(join(SRC, 'index.css'), 'utf8');
tekshir('coarse pointer uchun eng kam balandlik', /pointer:\s*coarse/.test(css));
tekshir('44px belgilangan', /min-height:\s*44px/.test(css));
tekshir(
  'faqat sensorli ekranga tegadi',
  /@media \(pointer: coarse\)/.test(css),
  'sichqonchali kompyuterda zich jadval saqlanadi',
);

// ---------- 6. Yuklanish holati ----------
// Eng yomon holat skeletning yo'qligi emas edi: ro'yxat bo'sh bo'lgani
// uchun ma'lumot kelguncha "Mijoz topilmadi" deb yozilib turardi —
// mijoz bor bo'lsa ham. Odam yo'q narsani qidirib vaqt yo'qotardi.
console.log('\n6. Yuklanish holati');

tekshir(
  'skelet komponenti bor',
  hammasi.some((f) => f.endsWith('Skelet.tsx')),
);

const skelet = readFileSync(join(SRC, 'components/Skelet.tsx'), 'utf8');
tekshir('harakat kamaytirilganda pulsatsiya o‘chadi', /motion-safe:animate-pulse/.test(skelet));
tekshir('ekran o‘quvchiga xabar beradi', /role="status"/.test(skelet));

// Ro'yxatli sahifalarda "topilmadi" faqat yuklash tugagach chiqsin
for (const [fayl, nom] of [
  ['pages/Customers.tsx', 'Mijozlar'],
  ['pages/Orders.tsx', 'Buyurtmalar'],
  ['pages/Products.tsx', 'Mahsulotlar'],
]) {
  const s = readFileSync(join(SRC, fayl), 'utf8');
  const bayroq = /const \[yuklandi, setYuklandi\]/.test(s);
  const kutadi = /yuklandi &&|!yuklandi/.test(s);
  tekshir(
    `${nom}: "topilmadi" yuklashdan keyin`,
    bayroq && kutadi,
    bayroq ? 'ok' : 'bayroq yo‘q — bo‘sh ro‘yxat "topilmadi" deb ko‘rsatiladi',
  );
}

// ---------- 7. Tugma ko'rinishi ----------
// Bir xil rangdagi asosiy tugma sahifadan sahifaga turlicha
// yumaloqlanardi. Alohida qaralganda bilinmaydi, ketma-ket ko'rilganda
// panel "yig'ib qo'yilgan"dek taassurot qoldiradi.
console.log('\n7. Tugma ko‘rinishi');

// `rounded-full` bu tekshiruvdan tashqarida: u yorliq (pill) va avatar
// uchun ishlatiladi va ular ATAYLAB yumaloq. Sinov faqat to'rtburchak
// radiuslar aralashmasligini talab qiladi — audit topgan muammo ham
// aynan shu edi (xl 43 / lg 12).
const radiuslar = {};
for (const f of hammasi) {
  const s = readFileSync(f, 'utf8');
  // Tugmaning belgisi — `px-` bilan kelishi. Avatar kvadratlari
  // (h-10 w-10, px- yo'q) bunga tushmaydi.
  for (const m of s.matchAll(/rounded-(sm|md|lg|xl|2xl|3xl) bg-brand(?:-soft)? px-/g)) {
    radiuslar[m[1]] = (radiuslar[m[1]] ?? 0) + 1;
  }
}
const turlar = Object.keys(radiuslar);
tekshir(
  'asosiy tugmalar bitta radiusda',
  turlar.length === 1,
  turlar.map((t) => `${t}:${radiuslar[t]}`).join(' ') || 'tugma topilmadi',
);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
