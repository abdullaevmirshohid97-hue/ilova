// =============================================================
//  IDAA MONEY — IKONKA QORALAMASI
//
//  Uch variant, hammasi KODDAN chiziladi (Photoshop ham, tashqi
//  kutubxona ham kerak emas — sabablari `credit-debit-logo.mjs`
//  boshida yozilgan).
//
//  Bu QORALAMA: hozirgi ikonkalar ustiga yozilmaydi, hammasi
//  `assets/qoralama/` ga tushadi. Tanlangani ma'lum bo'lgach,
//  asosiy generatorga ko'chiriladi.
//
//  Talab: yon daftar + «IDAA» + pul ramzi.
//
//  Ishga tushirish:  node scripts/idaa-ikonka-qoralama.mjs
// =============================================================

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHIQISH = join(ROOT, 'apps/kassa/assets/qoralama');
mkdirSync(CHIQISH, { recursive: true });

// ---------- Palitra ----------
// Tinch ranglar: ilova kun bo'yi ochiladi, baland rang charchatadi.
const RANG = {
  fon1: [0x16, 0x20, 0x2e], // chuqur ko'k-kulrang
  fon2: [0x25, 0x35, 0x4b],
  daftar: [0xf0, 0xe6, 0xd2], // kraft qog'oz
  daftarSoya: [0xd8, 0xc9, 0xad],
  muqova: [0x2f, 0x6d, 0x52], // to'q yashil — daftar tikilgan qismi
  rezina: [0xc4, 0x6e, 0x62], // terakota rezinka
  yashil: [0x46, 0xa2, 0x78],
  siyoh: [0x1b, 0x2a, 0x3a],
  oq: [0xf7, 0xf9, 0xfb],
  xira: [0xa8, 0xb4, 0xc4],
};

// =============================================================
//  PNG
// =============================================================
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function bolak(tur, data) {
  const u = Buffer.alloc(4);
  u.writeUInt32BE(data.length);
  const t = Buffer.concat([Buffer.from(tur, 'latin1'), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(t));
  return Buffer.concat([u, t, c]);
}
function pngYoz(yol, k) {
  const { w, h, px } = k;
  const xom = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    xom[y * (w * 4 + 1)] = 0;
    px.copy(xom, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
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
//  Kanvas va SDF
// =============================================================
const kanvas = (w, h) => ({ w, h, px: Buffer.alloc(w * h * 4) });

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

function chiz(k, masofa, rang, imkon = {}) {
  const { alfa = 1 } = imkon;
  for (let y = 0; y < k.h; y++) {
    for (let x = 0; x < k.w; x++) {
      const d = masofa(x + 0.5, y + 0.5);
      if (d > 1) continue;
      nuqta(k, x, y, rang, alfa * Math.min(1, Math.max(0, 0.5 - d)));
    }
  }
}

const yumaloq = (cx, cy, w, h, r) => (x, y) => {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
};
const doira = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
// Ellips: tanga uyumi uchun (yuqoridan qaralgan tanga — yassi doira)
const ellips = (cx, cy, rx, ry) => (x, y) => {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry);
};
const kesma = (x1, y1, x2, y2, q) => (x, y) => {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = x - x1;
  const wy = y - y1;
  const u = vx * vx + vy * vy;
  const t = u === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / u));
  return Math.hypot(wx - vx * t, wy - vy * t) - q / 2;
};
const birlashma = (...s) => (x, y) => {
  let d = Infinity;
  for (const f of s) d = Math.min(d, f(x, y));
  return d;
};
/** A dan B ni ayirish: A ichida, B tashqarisida */
const ayir = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));

const RAD = Math.PI / 180;
function yoy(cx, cy, rx, ry, bosh, oxir, q, qadam = 8) {
  const qismlar = [];
  const soni = Math.max(2, Math.round(Math.abs(oxir - bosh) / (qadam * RAD)));
  for (let i = 0; i < soni; i++) {
    const a1 = bosh + ((oxir - bosh) * i) / soni;
    const a2 = bosh + ((oxir - bosh) * (i + 1)) / soni;
    qismlar.push(
      kesma(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1), cx + rx * Math.cos(a2), cy + ry * Math.sin(a2), q),
    );
  }
  return birlashma(...qismlar);
}

function gradient(k, yuqori, past) {
  for (let y = 0; y < k.h; y++) {
    const t = y / (k.h - 1);
    const r = [0, 1, 2].map((c) => Math.round(yuqori[c] + (past[c] - yuqori[c]) * t));
    for (let x = 0; x < k.w; x++) nuqta(k, x, y, r, 1);
  }
}

// =============================================================
//  Harflar — IDAA uchun I, D, A kerak; qolganlari so'z belgisi uchun
// =============================================================
function harf(belgi, x, y, h, q) {
  const w = h * 0.6;
  const orta = y + h / 2;
  switch (belgi) {
    case 'I':
      return [kesma(x + q / 2, y, x + q / 2, y + h, q), q];
    case 'D':
      return [
        birlashma(
          kesma(x, y, x, y + h, q),
          kesma(x, y, x + w * 0.3, y, q),
          kesma(x, y + h, x + w * 0.3, y + h, q),
          yoy(x + w * 0.3, orta, w * 0.7, h / 2, -90 * RAD, 90 * RAD, q),
        ),
        w,
      ];
    case 'A':
      return [
        birlashma(
          kesma(x, y + h, x + w / 2, y, q),
          kesma(x + w / 2, y, x + w, y + h, q),
          kesma(x + w * 0.22, y + h * 0.62, x + w * 0.78, y + h * 0.62, q),
        ),
        w,
      ];
    case 'M':
      return [
        birlashma(
          kesma(x, y + h, x, y, q),
          kesma(x, y, x + w / 2, y + h * 0.62, q),
          kesma(x + w / 2, y + h * 0.62, x + w, y, q),
          kesma(x + w, y, x + w, y + h, q),
        ),
        w * 1.12,
      ];
    case 'O':
      return [yoy(x + w / 2, orta, w / 2, h / 2, 0, 360 * RAD, q), w];
    case 'N':
      return [
        birlashma(kesma(x, y + h, x, y, q), kesma(x, y, x + w, y + h, q), kesma(x + w, y + h, x + w, y, q)),
        w,
      ];
    case 'E':
      return [
        birlashma(
          kesma(x, y, x, y + h, q),
          kesma(x, y, x + w * 0.85, y, q),
          kesma(x, y + h / 2, x + w * 0.68, y + h / 2, q),
          kesma(x, y + h, x + w * 0.85, y + h, q),
        ),
        w,
      ];
    case 'Y':
      return [
        birlashma(
          kesma(x, y, x + w / 2, y + h * 0.52, q),
          kesma(x + w, y, x + w / 2, y + h * 0.52, q),
          kesma(x + w / 2, y + h * 0.52, x + w / 2, y + h, q),
        ),
        w,
      ];
    default:
      return [null, h * 0.32];
  }
}

function yozuvKengligi(matn, h, oraliq) {
  let w = 0;
  for (const b of matn) w += harf(b, 0, 0, h, h * 0.16)[1] + oraliq;
  return w - oraliq;
}

function yozuv(k, matn, x, y, h, rang, oraliqNisbat = 0.22) {
  const q = h * 0.16;
  const oraliq = h * oraliqNisbat;
  let joriy = x;
  for (const b of matn) {
    const [shakl, w] = harf(b, joriy, y, h, q);
    if (shakl) chiz(k, shakl, rang);
    joriy += w + oraliq;
  }
}

// =============================================================
//  Pul ramzlari
//
//  Birinchi urinishda «$» ni ikki yoydan yig'gan edim va u
//  kaktusga o'xshab chiqdi. Sabab: yoy yo'nalishlari noto'g'ri edi.
//  Endi S ANIQ uch bo‘lakdan: yuqori kosacha, bel chizig‘i,
//  pastki kosacha — har birining boshlanish va tugash burchagi
//  hisoblab qo‘yilgan.
// =============================================================

/** Dollar belgisi: S + vertikal ustun. `h` — umumiy balandlik */
function dollar(k, cx, cy, h, q, rang) {
  const r = h * 0.25;
  const Uy = cy - r; // yuqori kosacha markazi
  const Ly = cy + r; // pastki kosacha markazi
  const chapX = cx - r * 0.866;
  const ongX = cx + r * 0.866;
  chiz(
    k,
    birlashma(
      // yuqori kosacha: o‘ng tepadan boshlab, tepa orqali chapga
      yoy(cx, Uy, r, r, -30 * RAD, -210 * RAD, q),
      // bel: chapdan o‘ngga qiya
      kesma(chapX, Uy + r * 0.5, ongX, Ly - r * 0.5, q),
      // pastki kosacha: o‘ngdan past orqali chapga
      yoy(cx, Ly, r, r, -30 * RAD, 150 * RAD, q),
      // ustun
      kesma(cx, cy - h * 0.5, cx, cy + h * 0.5, q * 0.85),
    ),
    rang,
  );
}

/**
 * Tanga uyumi: uchta ellips ustma-ust.
 *
 * Eng ishonchli «pul» tasviri — hech qanday belgi bilmasdan ham
 * o'qiladi va 48 pikselda ham shakli saqlanadi.
 */
function tangaUyumi(k, cx, cy, rx, rang, soya) {
  const ry = rx * 0.42;
  const qalinlik = ry * 0.9;
  for (let i = 2; i >= 0; i--) {
    const y = cy + i * qalinlik * 1.15 - qalinlik * 1.15;
    // Tanga qirrasi: pastroqdagi nusxa — qalinlik taassuroti
    chiz(k, ellips(cx, y + qalinlik * 0.55, rx, ry), soya);
    chiz(k, ellips(cx, y, rx, ry), rang);
  }
}

/** Banknot: yumaloq to‘rtburchak + ichida dollar belgisi */
function banknot(k, cx, cy, w, h, fon, belgi) {
  chiz(k, yumaloq(cx, cy, w, h, h * 0.2), fon);
  // Ichki ramka — pul qog‘oziga o‘xshasin
  chiz(
    k,
    ayir(yumaloq(cx, cy, w * 0.9, h * 0.78, h * 0.14), yumaloq(cx, cy, w * 0.9 - h * 0.09, h * 0.78 - h * 0.09, h * 0.1)),
    belgi,
    { alfa: 0.4 },
  );
  dollar(k, cx, cy, h * 0.62, h * 0.11, belgi);
}
// =============================================================
//  Daftar
// =============================================================
/**
 * Yon daftar: muqova + tikilgan chap chekka + varaq chiziqlari.
 * `rezinkali` — o'ng tomonda terakota rezinka (klassik bloknot).
 */
function daftar(k, cx, cy, w, h, imkon = {}) {
  const { rezinkali = true, chiziqli = true } = imkon;
  const r = w * 0.09;

  // Soya — daftar fondan ajralib tursin
  chiz(k, yumaloq(cx + w * 0.02, cy + h * 0.02, w, h, r), [0, 0, 0], { alfa: 0.28 });

  // Qog'oz
  chiz(k, yumaloq(cx, cy, w, h, r), RANG.daftar);

  // Tikilgan chap chekka
  const chapX = cx - w / 2;
  chiz(
    k,
    ayir(yumaloq(cx, cy, w, h, r), (x) => chapX + w * 0.17 - x),
    RANG.muqova,
  );

  // Tikuv teshiklari
  for (let i = 0; i < 3; i++) {
    const y = cy - h * 0.26 + i * h * 0.26;
    chiz(k, doira(chapX + w * 0.085, y, w * 0.028), RANG.daftar, { alfa: 0.75 });
  }

  if (chiziqli) {
    for (let i = 0; i < 3; i++) {
      const y = cy + h * 0.16 + i * h * 0.1;
      const uzunlik = i === 2 ? 0.34 : 0.52;
      chiz(
        k,
        kesma(chapX + w * 0.28, y, chapX + w * 0.28 + w * uzunlik, y, h * 0.022),
        RANG.daftarSoya,
      );
    }
  }

  if (rezinkali) {
    // Rezinka O‘NG CHEKKAGA yaqin: markazda bo‘lsa «IDAA» ustidan
    // o‘tib ketadi va yozuv buzilgandek ko‘rinadi.
    chiz(k, kesma(cx + w * 0.38, cy - h / 2, cx + w * 0.38, cy + h / 2, w * 0.05), RANG.rezina);
  }
}

// =============================================================
//  Uch variant
// =============================================================
function variant(n, olcham) {
  const k = kanvas(olcham, olcham);
  const b = olcham / 512;
  gradient(k, RANG.fon1, RANG.fon2);
  const cx = olcham / 2;

  if (n === 1) {
    // I: daftar + tanga uyumi (belgisiz ham «pul» deb o‘qiladi)
    daftar(k, cx - 10 * b, 244 * b, 262 * b, 322 * b, { rezinkali: true });
    yozuv(k, 'IDAA', cx - yozuvKengligi('IDAA', 60 * b, 60 * b * 0.22) / 2 + 6 * b, 148 * b, 60 * b, RANG.siyoh);
    tangaUyumi(k, cx + 118 * b, 386 * b, 86 * b, RANG.yashil, RANG.muqova);
  } else if (n === 2) {
    // II: daftar, «IDAA» tepada, dollar belgisi muqova o‘rtasida
    daftar(k, cx, 256 * b, 272 * b, 334 * b, { rezinkali: false, chiziqli: false });
    yozuv(k, 'IDAA', cx - yozuvKengligi('IDAA', 58 * b, 58 * b * 0.22) / 2 + 18 * b, 146 * b, 58 * b, RANG.siyoh);
    chiz(k, kesma(cx - 58 * b, 228 * b, cx + 92 * b, 228 * b, 5 * b), RANG.daftarSoya);
    dollar(k, cx + 18 * b, 322 * b, 150 * b, 22 * b, RANG.muqova);
  } else {
    // III: daftar + banknot
    daftar(k, cx, 226 * b, 252 * b, 292 * b, { rezinkali: true });
    yozuv(k, 'IDAA', cx - yozuvKengligi('IDAA', 54 * b, 54 * b * 0.22) / 2 + 4 * b, 146 * b, 54 * b, RANG.siyoh);
    banknot(k, cx + 4 * b, 392 * b, 268 * b, 124 * b, RANG.yashil, RANG.fon1);
  }

  return k;
}
// =============================================================
//  Taqqoslash varag‘i
//
//  Uch qator: katta, telefondagi o'lcham (96 px) va DOIRA ichida.
//  Uchinchisi muhim — Android ikonkani niqob bilan kesadi va
//  chekkadagi narsa yo'qoladi. Buni faqat kesib ko'rgandan keyin
//  bilinadi.
// =============================================================
function joyla(manba, nishon, x0, y0, niqob) {
  for (let y = 0; y < manba.h; y++) {
    for (let x = 0; x < manba.w; x++) {
      if (niqob && !niqob(x + 0.5, y + 0.5)) continue;
      const i = (y * manba.w + x) * 4;
      nuqta(nishon, x0 + x, y0 + y, [manba.px[i], manba.px[i + 1], manba.px[i + 2]], manba.px[i + 3] / 255);
    }
  }
}

const yasalgan = [];
for (const n of [1, 2, 3]) {
  const k = variant(n, 512);
  yasalgan.push([`ikonka-${n}.png`, pngYoz(join(CHIQISH, `ikonka-${n}.png`), k)]);
}

const V = kanvas(1040, 730);
gradient(V, [0xf7, 0xf9, 0xfb], [0xe6, 0xeb, 0xf1]);
for (let i = 0; i < 3; i++) {
  joyla(variant(i + 1, 300), V, 30 + i * 330, 30);
  joyla(variant(i + 1, 96), V, 30 + i * 330 + 102, 352);
  // Doira niqobi: adaptiv ikonka shu tarzda kesiladi
  const d = variant(i + 1, 200);
  joyla(d, V, 30 + i * 330 + 50, 480, (x, y) => Math.hypot(x - 100, y - 100) <= 99);
}
pngYoz(join(CHIQISH, 'variantlar.png'), V);
yasalgan.push(['variantlar.png', 0]);

console.log('Qoralama tayyor:');
for (const [nom] of yasalgan) console.log('  ' + join('apps/kassa/assets/qoralama', nom));
