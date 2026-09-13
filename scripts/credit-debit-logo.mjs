// =============================================================
//  CREDIT DEBIT — LOGO VA DO'KON GRAFIKASI
//
//  Bu skript hamma belgi-rasmlarni KODDAN yasaydi: Photoshop ham,
//  tashqi kutubxona ham kerak emas. Sabab uchta:
//
//   1. Play Console har o'lcham uchun alohida fayl talab qiladi
//      (512×512 ikonka, 1024×500 banner, adaptiv ikonka...). Qo'lda
//      kesilsa, bittasi eskirib qoladi va buni faqat rad javobida
//      bilinadi.
//   2. Rang o'zgarsa — bitta joyda o'zgaradi va hammasi qayta chiqadi.
//   3. Loyihada `sharp` yo'q va uni o'rnatish uchun internet kerak.
//      PNG esa standartning sodda qismi: IHDR + IDAT (zlib) + IEND.
//      Xuddi `telegram-qarz/hujjat.ts` XLSX va PDF ni shunday yasaydi.
//
//  Chizish usuli: SDF (signed distance field). Har piksel uchun
//  shaklgacha bo'lgan masofa hisoblanadi va chekkada alfa yumshatiladi
//  — supersampling'siz ham chetlari silliq chiqadi.
//
//  RANG: tinch palitra. Play Market'dagi hisob-kitob ilovalari baland
//  ko'k-qizil-yashildan foydalanadi; kun bo'yi qaraladigan ilovada u
//  ko'zni charchatadi.
//
//  Ishga tushirish:  node scripts/credit-debit-logo.mjs
// =============================================================

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'apps/kassa/assets');
const PLAY = join(ASSETS, 'play');

// ---------- Palitra ----------
const RANG = {
  fon1: [0x16, 0x20, 0x2e], // chuqur ko'k-kulrang (yuqori)
  fon2: [0x20, 0x2f, 0x43], // biroz ochroq (past) — sekin gradient
  kirim: [0x46, 0xa2, 0x78], // o't yashil emas, bosiq yashil
  chiqim: [0xc4, 0x6e, 0x62], // terakota — "qizil" o'rniga
  oq: [0xf2, 0xf4, 0xf7],
  oqXira: [0x9a, 0xa7, 0xb8],
};

// =============================================================
//  1. PNG yozuvchi
// =============================================================
const CRC_JADVAL = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_JADVAL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function bolak(tur, data) {
  const uzunlik = Buffer.alloc(4);
  uzunlik.writeUInt32BE(data.length);
  const tanasi = Buffer.concat([Buffer.from(tur, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tanasi));
  return Buffer.concat([uzunlik, tanasi, crc]);
}

/** RGBA buferni PNG faylga yozadi */
function pngYoz(yol, w, h, rgba) {
  // Har qator oldiga filtr bayti (0 = filtrsiz) qo'yiladi — PNG talabi
  const xom = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    xom[y * (w * 4 + 1)] = 0;
    rgba.copy(xom, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit chuqurligi
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bolak('IHDR', ihdr),
    bolak('IDAT', deflateSync(xom, { level: 9 })),
    bolak('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(yol, png);
  return png.length;
}

// =============================================================
//  2. Rasm (kanvas)
// =============================================================
function kanvas(w, h) {
  return { w, h, px: Buffer.alloc(w * h * 4) };
}

function nuqta(k, x, y, rang, alfa) {
  if (alfa <= 0 || x < 0 || y < 0 || x >= k.w || y >= k.h) return;
  const a = Math.min(1, alfa);
  const i = (y * k.w + x) * 4;
  const eskiA = k.px[i + 3] / 255;
  const yangiA = a + eskiA * (1 - a);
  if (yangiA <= 0) return;
  for (let c = 0; c < 3; c++) {
    k.px[i + c] = Math.round((rang[c] * a + k.px[i + c] * eskiA * (1 - a)) / yangiA);
  }
  k.px[i + 3] = Math.round(yangiA * 255);
}

/**
 * SDF bilan shakl chizish: `masofa(x,y)` manfiy bo'lsa — ichkarida.
 * Chekkada alfa 0 dan 1 ga bir piksel ichida o'tadi (silliq chet).
 */
function chiz(k, masofa, rang, imkon = {}) {
  const { x0 = 0, y0 = 0, x1 = k.w, y1 = k.h, alfa = 1 } = imkon;
  for (let y = Math.max(0, y0 | 0); y < Math.min(k.h, y1); y++) {
    for (let x = Math.max(0, x0 | 0); x < Math.min(k.w, x1); x++) {
      const d = masofa(x + 0.5, y + 0.5);
      if (d > 1) continue;
      nuqta(k, x, y, rang, alfa * Math.min(1, Math.max(0, 0.5 - d)));
    }
  }
}

function gradientFon(k, yuqori, past) {
  for (let y = 0; y < k.h; y++) {
    const t = y / (k.h - 1);
    const rang = [0, 1, 2].map((c) => Math.round(yuqori[c] + (past[c] - yuqori[c]) * t));
    for (let x = 0; x < k.w; x++) nuqta(k, x, y, rang, 1);
  }
}

// ---------- SDF shakllari ----------
const yumaloqTortburchak = (cx, cy, w, h, r) => (x, y) => {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
};

const doira = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

/** Uchlari yumaloq chiziq (kapsula) */
const kesma = (x1, y1, x2, y2, qalin) => (x, y) => {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = x - x1;
  const wy = y - y1;
  const uz2 = vx * vx + vy * vy;
  const t = uz2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / uz2));
  return Math.hypot(wx - vx * t, wy - vy * t) - qalin / 2;
};

/** Ko'pburchak: chekkagacha masofa + ichkarida ekanini aniqlash */
const kopburchak = (nuqtalar) => (x, y) => {
  let d = Infinity;
  let ichkarida = false;
  for (let i = 0, j = nuqtalar.length - 1; i < nuqtalar.length; j = i++) {
    const [xi, yi] = nuqtalar[i];
    const [xj, yj] = nuqtalar[j];
    const ex = xj - xi;
    const ey = yj - yi;
    const wx = x - xi;
    const wy = y - yi;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ichkarida = !ichkarida;
  }
  return ichkarida ? -d : d;
};

/** Bir nechta shaklning birlashmasi */
const birlashma =
  (...shakllar) =>
  (x, y) => {
    let d = Infinity;
    for (const s of shakllar) d = Math.min(d, s(x, y));
    return d;
  };

// =============================================================
//  3. Belgi: ikki o'q — kirim va chiqim
//
//  Ikki o'q pulning ikki yo'nalishini bildiradi: yuqoriga (kirim,
//  yashil) va pastga (chiqim, terakota). 48 pikselda ham o'qiladi —
//  ikonkada eng muhim shart shu.
// =============================================================
function belgiChiz(k, cx, cy, olcham) {
  const b = olcham / 100; // "birlik": belgi o'lchamiga nisbatan
  const qalin = 13 * b;
  const surish = 21 * b; // markazdan chapga/o'ngga

  // Yuqoriga o'q — KIRIM
  const yuqori = birlashma(
    kesma(cx - surish, cy + 30 * b, cx - surish, cy - 16 * b, qalin),
    kopburchak([
      [cx - surish, cy - 40 * b],
      [cx - surish - 22 * b, cy - 12 * b],
      [cx - surish + 22 * b, cy - 12 * b],
    ]),
  );
  chiz(k, yuqori, RANG.kirim);

  // Pastga o'q — CHIQIM
  const past = birlashma(
    kesma(cx + surish, cy - 30 * b, cx + surish, cy + 16 * b, qalin),
    kopburchak([
      [cx + surish, cy + 40 * b],
      [cx + surish - 22 * b, cy + 12 * b],
      [cx + surish + 22 * b, cy + 12 * b],
    ]),
  );
  chiz(k, past, RANG.chiqim);
}

// =============================================================
//  4. Yozuv: "CREDIT DEBIT"
//
//  Shrift kutubxonasi yo'q, shuning uchun harflar chiziq va yoydan
//  yig'iladi. Kerak bo'lgan harflar atigi ettita: C R E D I T B.
// =============================================================
// Yoy ELLIPTIK: rx va ry alohida. Doiraviy yoy bilan harflar bir xil
// balandlikda chiqmasdi — "C" qo'shnilaridan past turardi, chunki
// uning bo'yi radiusga bog'liq edi, kenglik esa alohida belgilangan.
function yoy(cx, cy, rx, ry, bosh, oxir, qalin, qadam = 10) {
  const qismlar = [];
  const soni = Math.max(2, Math.round(Math.abs(oxir - bosh) / ((qadam * Math.PI) / 180)));
  for (let i = 0; i < soni; i++) {
    const a1 = bosh + ((oxir - bosh) * i) / soni;
    const a2 = bosh + ((oxir - bosh) * (i + 1)) / soni;
    qismlar.push(
      kesma(
        cx + rx * Math.cos(a1), cy + ry * Math.sin(a1),
        cx + rx * Math.cos(a2), cy + ry * Math.sin(a2),
        qalin,
      ),
    );
  }
  return birlashma(...qismlar);
}

const RAD = Math.PI / 180;

/** Harf: x — chap chekka, h — balandlik. Qaytaradi: [shakl, kenglik] */
function harf(belgi, x, y, h, q) {
  const w = h * 0.58;
  const orta = y + h / 2;
  switch (belgi) {
    case 'C':
      return [yoy(x + w / 2, orta, w / 2, h / 2, 52 * RAD, 308 * RAD, q), w];
    case 'R':
      return [
        birlashma(
          kesma(x, y, x, y + h, q),
          kesma(x, y, x + w * 0.35, y, q),
          kesma(x, y + h * 0.5, x + w * 0.35, y + h * 0.5, q),
          yoy(x + w * 0.35, y + h * 0.25, w * 0.6, h * 0.25, -90 * RAD, 90 * RAD, q),
          kesma(x + w * 0.4, y + h * 0.5, x + w, y + h, q),
        ),
        w,
      ];
    case 'E':
      return [
        birlashma(
          kesma(x, y, x, y + h, q),
          kesma(x, y, x + w * 0.9, y, q),
          kesma(x, y + h / 2, x + w * 0.72, y + h / 2, q),
          kesma(x, y + h, x + w * 0.9, y + h, q),
        ),
        w,
      ];
    case 'D':
      return [
        birlashma(
          kesma(x, y, x, y + h, q),
          kesma(x, y, x + w * 0.32, y, q),
          kesma(x, y + h, x + w * 0.32, y + h, q),
          yoy(x + w * 0.32, orta, w * 0.68, h / 2, -90 * RAD, 90 * RAD, q),
        ),
        w,
      ];
    case 'I':
      return [kesma(x + q / 2, y, x + q / 2, y + h, q), q];
    case 'T':
      return [
        birlashma(
          kesma(x, y, x + w, y, q),
          kesma(x + w / 2, y, x + w / 2, y + h, q),
        ),
        w,
      ];
    case 'B':
      return [
        birlashma(
          kesma(x, y, x, y + h, q),
          kesma(x, y, x + w * 0.3, y, q),
          kesma(x, y + h * 0.5, x + w * 0.35, y + h * 0.5, q),
          kesma(x, y + h, x + w * 0.35, y + h, q),
          yoy(x + w * 0.3, y + h * 0.25, w * 0.6, h * 0.25, -90 * RAD, 90 * RAD, q),
          yoy(x + w * 0.35, y + h * 0.75, w * 0.62, h * 0.25, -90 * RAD, 90 * RAD, q),
        ),
        w,
      ];
    default:
      return [null, h * 0.3]; // probel
  }
}

function yozuvChiz(k, matn, x, y, h, rang) {
  const q = h * 0.15;
  let joriy = x;
  for (const belgi of matn) {
    const [shakl, w] = harf(belgi, joriy, y, h, q);
    if (shakl) chiz(k, shakl, rang);
    joriy += w + h * 0.22;
  }
  return joriy - x - h * 0.22;
}

/** Yozuv kengligini oldindan o'lchash — markazga qo'yish uchun */
function yozuvKengligi(matn, h) {
  let w = 0;
  for (const belgi of matn) w += harf(belgi, 0, 0, h, 1)[1] + h * 0.22;
  return w - h * 0.22;
}

// =============================================================
//  5. Fayllar
// =============================================================
mkdirSync(ASSETS, { recursive: true });
mkdirSync(PLAY, { recursive: true });

const yasalgan = [];
function qayd(nom, yol, w, h, bayt) {
  yasalgan.push({ nom, w, h, kb: (bayt / 1024).toFixed(1) });
}

// ---------- 5.1. Ilova ikonkasi (1024×1024, to'liq fon) ----------
{
  const k = kanvas(1024, 1024);
  gradientFon(k, RANG.fon1, RANG.fon2);
  belgiChiz(k, 512, 512, 560);
  const yol = join(ASSETS, 'icon.png');
  qayd('icon.png — Expo/iOS ilova ikonkasi', yol, 1024, 1024, pngYoz(yol, 1024, 1024, k.px));
}

// ---------- 5.2. Android adaptiv ikonka (old qatlam) ----------
// Android ikonkaning chetini kesadi (dumaloq, kvadrat, tomchi —
// qurilmaga qarab). Shuning uchun belgi markazdagi 66% "xavfsiz
// doira" ichida turishi kerak, foni esa app.json dan beriladi.
{
  const k = kanvas(1024, 1024);
  belgiChiz(k, 512, 512, 420);
  const yol = join(ASSETS, 'adaptive-icon.png');
  qayd('adaptive-icon.png — Android adaptiv (shaffof)', yol, 1024, 1024, pngYoz(yol, 1024, 1024, k.px));
}

// ---------- 5.3. Splash (ochilish ekrani) ----------
{
  const k = kanvas(1024, 1024);
  belgiChiz(k, 512, 430, 460);
  const w = yozuvKengligi('CREDIT DEBIT', 66);
  yozuvChiz(k, 'CREDIT DEBIT', (1024 - w) / 2, 700, 66, RANG.oq);
  const yol = join(ASSETS, 'splash-icon.png');
  qayd('splash-icon.png — ochilish ekrani (shaffof)', yol, 1024, 1024, pngYoz(yol, 1024, 1024, k.px));
}

// ---------- 5.4. Favicon (web) ----------
{
  const k = kanvas(196, 196);
  gradientFon(k, RANG.fon1, RANG.fon2);
  belgiChiz(k, 98, 98, 116);
  const yol = join(ASSETS, 'favicon.png');
  qayd('favicon.png — brauzer yorlig‘i', yol, 196, 196, pngYoz(yol, 196, 196, k.px));
}

// ---------- 5.5. Play Console: 512×512 ikonka ----------
// Talab: aynan 512×512 PNG, 1 MB dan kichik, shaffofliksiz.
{
  const k = kanvas(512, 512);
  gradientFon(k, RANG.fon1, RANG.fon2);
  belgiChiz(k, 256, 256, 280);
  const yol = join(PLAY, 'play-icon-512.png');
  qayd('play/play-icon-512.png — Play Console ikonkasi', yol, 512, 512, pngYoz(yol, 512, 512, k.px));
}

// ---------- 5.6. Play Console: 1024×500 banner ----------
// Do'kon sahifasining tepasida turadi, majburiy. Matn chetdan
// uzoqroq: turli ekranlarda chetlari kesiladi.
{
  const k = kanvas(1024, 500);
  gradientFon(k, RANG.fon1, RANG.fon2);

  // Fonda xira doiralar — tekis fon "tayyorlanmagan"dek ko'rinadi
  chiz(k, doira(880, 90, 150), RANG.oq, { alfa: 0.04 });
  chiz(k, doira(120, 430, 190), RANG.oq, { alfa: 0.03 });

  belgiChiz(k, 205, 250, 320);

  // Matn O'LCHAB joylashtiriladi. Birinchi urinishda qo'lda qo'yilgan
  // edi va "CREDIT DEBIT" o'ng chetdan chiqib ketdi — bannerda bu
  // to'g'ridan-to'g'ri rad javobi degani.
  const maydonX = 380;
  const maydonW = 1024 - maydonX - 60;
  let h = 72;
  while (yozuvKengligi('CREDIT DEBIT', h) > maydonW && h > 30) h -= 2;
  const w = yozuvKengligi('CREDIT DEBIT', h);
  const bosh = maydonX + (maydonW - w) / 2;
  yozuvChiz(k, 'CREDIT DEBIT', bosh, 205, h, RANG.oq);
  // Ostidagi ingichka chiziq — sarlavhani "cho'ktiradi"
  chiz(k, kesma(bosh + w * 0.22, 205 + h + 42, bosh + w * 0.78, 205 + h + 42, 7), RANG.kirim);
  const yol = join(PLAY, 'feature-graphic-1024x500.png');
  qayd('play/feature-graphic-1024x500.png — do‘kon banneri', yol, 1024, 500, pngYoz(yol, 1024, 500, k.px));
}

// ---------- 5.7. Sayt uchun gorizontal logo ----------
{
  const k = kanvas(1200, 300);
  belgiChiz(k, 140, 150, 210);
  let h = 84;
  while (yozuvKengligi('CREDIT DEBIT', h) > 1200 - 280 - 40 && h > 30) h -= 2;
  yozuvChiz(k, 'CREDIT DEBIT', 280, 150 - h / 2, h, RANG.oq);
  const yol = join(PLAY, 'logo-gorizontal-oq.png');
  qayd('play/logo-gorizontal-oq.png — sayt uchun (shaffof)', yol, 1200, 300, pngYoz(yol, 1200, 300, k.px));
}

// ---------- Natija ----------
console.log('\n\x1b[1mCREDIT DEBIT — grafika yasaldi\x1b[0m\n');
for (const f of yasalgan) {
  console.log(`  ${f.nom.padEnd(52)} ${String(f.w).padStart(4)}×${String(f.h).padEnd(4)}  ${f.kb} KB`);
}
console.log(`\n  Papka: apps/kassa/assets/\n`);
