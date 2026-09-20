// =============================================================
//  IDAA MONEY — IKONKA QORALAMASI (tekis illyustratsiya)
//
//  Ikki urinish rad etildi va ikkalasining ham sababi bitta edi:
//  men ikonkaga TEXTURA qo'shgandim. Birinchisida kraft qog'oz,
//  teshik va rezinka; ikkinchisida oltin gradient va yumshoq soya.
//  Ikkalasi ham kod bilan chizilganda sun'iy chiqadi.
//
//  Tekis uslubning qoidalari QAT'IY va ular shu yerda buzilmaydi:
//
//   · GRADIENT YO'Q — har yuza bitta rang;
//   · SOYA YO'Q — chuqurlik o'rniga kontrast;
//   · IKKI-UCH RANG — ko'pi shovqin;
//   · YO'G'ON SHAKL — ingichka chiziq 48 pikselda yo'qoladi;
//   · KATTA BO'SHLIQ — shakl ikonkaning 60-70 foizini egallaydi,
//     qolgani havo.
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

// =============================================================
//  PNG yozuvchi
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
  writeFileSync(
    yol,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bolak('IHDR', ihdr),
      bolak('IDAT', deflateSync(xom, { level: 9 })),
      bolak('IEND', Buffer.alloc(0)),
    ]),
  );
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

function chiz(k, masofa, rang) {
  for (let y = 0; y < k.h; y++) {
    for (let x = 0; x < k.w; x++) {
      const d = masofa(x + 0.5, y + 0.5);
      if (d > 1) continue;
      nuqta(k, x, y, rang, Math.min(1, Math.max(0, 0.5 - d)));
    }
  }
}

function toldir(k, rang) {
  for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) nuqta(k, x, y, rang, 1);
}

const yumaloq = (cx, cy, w, h, r) => (x, y) => {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

const doira = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

/** Tekis uchli chiziq — harf uchlari yumaloq bo'lmasin */
const chiziq = (x1, y1, x2, y2, q) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L;
  const uy = dy / L;
  return (x, y) => {
    const px = x - x1;
    const py = y - y1;
    const t = px * ux + py * uy;
    const s = -px * uy + py * ux;
    const a = Math.abs(t - L / 2) - L / 2;
    const b = Math.abs(s) - q / 2;
    return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0);
  };
};

/** Yarim halqa — qalin yoyni to'g'ri chizish usuli */
const yarimHalqa = (cx, cy, r, q, yuqorimi) => (x, y) => {
  const a = Math.abs(Math.hypot(x - cx, y - cy) - r) - q / 2;
  return Math.max(a, yuqorimi ? y - cy : cy - y);
};

/** To‘liq halqa (quvur): valyuta belgilari uchun */
const halqa = (cx, cy, r, q) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - q / 2;

/** To'rtburchak — kesish uchun (burchaklari o'tkir) */
const tortburchak = (cx, cy, w, h) => (x, y) => {
  const dx = Math.abs(x - cx) - w / 2;
  const dy = Math.abs(y - cy) - h / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
};

/** Ko'pburchak — ruchka uchi uchun */
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

const birlashma = (...s) => (x, y) => {
  let d = Infinity;
  for (const f of s) d = Math.min(d, f(x, y));
  return d;
};

const yumshoqBirlashma = (radius, ...shakllar) => (x, y) => {
  let d = shakllar[0](x, y);
  for (let i = 1; i < shakllar.length; i++) {
    const b = shakllar[i](x, y);
    const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - d)) / radius));
    d = b + (d - b) * h - radius * h * (1 - h);
  }
  return d;
};

const ayir = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
const kesishma = (a, b) => (x, y) => Math.max(a(x, y), b(x, y));

// =============================================================
//  Harflar — yo'g'on, tekis uchli
// =============================================================
function harf(belgi, x, y, h, q) {
  const w = h * 0.66;
  const orta = y + h / 2;
  switch (belgi) {
    case 'I':
      return [chiziq(x + q / 2, y, x + q / 2, y + h, q), q];
    case 'D': {
      const tashqi = yumaloq(x + w / 2, orta, w, h, h * 0.34);
      const ichki = yumaloq(x + w / 2 + q * 0.28, orta, w - 2 * q, h - 2 * q, h * 0.34 - q);
      return [birlashma(ayir(tashqi, ichki), chiziq(x + q / 2, y, x + q / 2, y + h, q)), w];
    }
    case 'A':
      return [
        birlashma(
          chiziq(x + w * 0.06, y + h, x + w * 0.5, y, q),
          chiziq(x + w * 0.5, y, x + w * 0.94, y + h, q),
          chiziq(x + w * 0.25, y + h * 0.66, x + w * 0.75, y + h * 0.66, q * 0.85),
        ),
        w,
      ];
    default:
      return [null, h * 0.3];
  }
}

const KENGLIK = (matn, h, oraliq) => {
  let w = 0;
  for (const b of matn) w += harf(b, 0, 0, h, h * 0.185)[1] + oraliq;
  return w - oraliq;
};

function yozuvShakl(matn, x, y, h, oraliq) {
  const q = h * 0.185;
  const qismlar = [];
  let joriy = x;
  for (const b of matn) {
    const [shakl, w] = harf(b, joriy, y, h, q);
    if (shakl) qismlar.push(shakl);
    joriy += w + oraliq;
  }
  return birlashma(...qismlar);
}

// =============================================================
//  Dollar belgisi — yo'g'on va sodda
// =============================================================
function dollarShakl(cx, cy, h, q) {
  const r = h * 0.23;
  return birlashma(
    yumshoqBirlashma(
      q * 0.9,
      yarimHalqa(cx, cy - r, r, q, true),
      chiziq(cx - r, cy - r, cx + r, cy + r, q * 0.94),
      yarimHalqa(cx, cy + r, r, q, false),
    ),
    chiziq(cx, cy - h * 0.5, cx, cy + h * 0.5, q * 0.72),
  );
}

// =============================================================
//  Yevro va yuan
//
//  «C» to'liq halqadan o'ng tomondagi to'rtburchakni kesib
//  olish bilan yasaladi — burchakli yoy chizishdan sodda va
//  natijasi aniq.
// =============================================================
function yevroShakl(cx, cy, h, q) {
  const r = h * 0.4;
  const c = ayir(halqa(cx + q * 0.3, cy, r, q), tortburchak(cx + r + q, cy, r * 1.8, r * 0.95));
  return birlashma(
    c,
    chiziq(cx - r * 1.25, cy - h * 0.13, cx + r * 0.62, cy - h * 0.13, q * 0.82),
    chiziq(cx - r * 1.25, cy + h * 0.13, cx + r * 0.62, cy + h * 0.13, q * 0.82),
  );
}

function yuanShakl(cx, cy, h, q) {
  const w = h * 0.78;
  return birlashma(
    chiziq(cx - w / 2, cy - h / 2, cx, cy - h * 0.04, q),
    chiziq(cx + w / 2, cy - h / 2, cx, cy - h * 0.04, q),
    chiziq(cx, cy - h * 0.04, cx, cy + h / 2, q),
    chiziq(cx - w * 0.42, cy + h * 0.08, cx + w * 0.42, cy + h * 0.08, q * 0.85),
    chiziq(cx - w * 0.42, cy + h * 0.28, cx + w * 0.42, cy + h * 0.28, q * 0.85),
  );
}

// =============================================================
//  Ruchka — tanasi, bandi va uchi
//
//  Uchi UCHBURCHAK: qalam bilan adashmasin uchun tanasi uzun va
//  ingichka, uchi esa qisqa.
// =============================================================
function ruchkaShakl(x1, y1, x2, y2, en) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  // Tana uchning boshigacha
  const uchBosh = [x1 + ux * (L - en * 1.5), y1 + uy * (L - en * 1.5)];
  const tana = chiziq(x1, y1, uchBosh[0], uchBosh[1], en);
  const uch = kopburchak([
    [uchBosh[0] + nx * (en / 2), uchBosh[1] + ny * (en / 2)],
    [uchBosh[0] - nx * (en / 2), uchBosh[1] - ny * (en / 2)],
    [x2, y2],
  ]);
  return { tana, uch, band: chiziq(x1 + ux * en * 0.55, y1 + uy * en * 0.55, x1 + ux * en * 1.5, y1 + uy * en * 1.5, en) };
}

// =============================================================
//  Ranglar — har variantda UCHTADAN oshmaydi
// =============================================================
const P = {
  siyoh: [0x16, 0x1f, 0x33], // to'q ko'k-siyoh
  oq: [0xff, 0xff, 0xff],
  qaymoq: [0xf4, 0xf6, 0xfa],
  yashil: [0x21, 0xc7, 0x8f], // yorqin zumrad
  kok: [0x2f, 0x6b, 0xed],
  sariq: [0xff, 0xc2, 0x3c],
  marjon: [0xff, 0x6b, 0x5b],
};

// =============================================================
//  Daftar — tekis uslubda: ikki to'rtburchak, xolos
// =============================================================
function daftarShakl(cx, cy, w, h) {
  return yumaloq(cx, cy, w, h, w * 0.14);
}

/**
 * Daftarning tikilgan chekkasi — CHAP ustun.
 *
 * Yarim tekislik yo'nalishiga e'tibor: masofa manfiy bo'lgan tomon
 * «ichkari» hisoblanadi. Teskari yozilganda tikuv o'rniga BUTUN
 * muqova bo'yalib, ustidagi belgi ko'rinmay qolgan edi.
 */
function tikuvShakl(cx, cy, w, h) {
  const chegara = cx - w / 2 + w * 0.26;
  return kesishma(daftarShakl(cx, cy, w, h), (x) => x - chegara);
}

// =============================================================
//  To'rt variant
// =============================================================
/**
 * Umumiy kompozitsiya: chapda daftarcha, o‘ngida ruchka,
 * muqovada valyuta belgilari.
 */
function variant(n, olcham) {
  const k = kanvas(olcham, olcham);
  const b = olcham / 512;
  const cx = olcham / 2;
  const cy = olcham / 2;

  // Ranglar variantga qarab
  const fonRang = n === 4 ? P.qaymoq : P.siyoh;
  const muqova = n === 4 ? P.siyoh : P.oq;
  const belgiRang = n === 4 ? P.oq : P.siyoh;
  const aksent = n === 2 ? P.kok : n === 3 ? P.sariq : P.yashil;

  toldir(k, fonRang);

  // ---- Daftarcha: chapga surilgan, ruchkaga joy qoladi ----
  const dx = cx - 46 * b;
  const dw = 236 * b;
  const dh = 312 * b;
  chiz(k, daftarShakl(dx, cy, dw, dh), muqova);
  chiz(k, tikuvShakl(dx, cy, dw, dh), aksent);

  // ---- Ruchka: daftarchaning o‘ng yonida, biroz qiya ----
  const r = ruchkaShakl(cx + 150 * b, cy - 150 * b, cx + 108 * b, cy + 158 * b, 34 * b);
  // Ruchka tanasi muqova rangida — to'q fonda oq, oq fonda to'q.
  // Uchi va bandi aksent rangida: siyoh rangda bo'lsa to'q fonga
  // singib ketib, ruchka kesilgandek ko'rinardi.
  chiz(k, r.tana, muqova);
  chiz(k, r.band, aksent);
  // Uchi SIYOH — oq bo'lsa qalamga o'xshab qoladi
  chiz(k, r.uch, aksent);

  // ---- Valyuta belgilari muqovada ----
  // Muqovaning bo‘sh qismi: tikuvdan o‘ngda
  // Muqovaning bo‘sh qismi tikuvdan o‘ngda: markazi dx + dw*0.13
  const mx = dx + 30 * b;

  if (n === 1 || n === 4) {
    // Uchtasi bir qatorda. O‘lcham muqova enidan kelib chiqadi:
    // avvalgi urinishda belgilar bir-birining ustiga minib ketgan edi.
    const h = 46 * b;
    const q = 10 * b;
    chiz(k, dollarShakl(mx - 58 * b, cy, h, q), belgiRang);
    chiz(k, yevroShakl(mx, cy, h, q), belgiRang);
    chiz(k, yuanShakl(mx + 58 * b, cy, h, q), belgiRang);
  } else if (n === 2) {
    // Katta «$», ostida yevro va yuan — kichraytirilganda ham
    // kamida bitta belgi o‘qiladi
    chiz(k, dollarShakl(mx, cy - 52 * b, 120 * b, 24 * b), belgiRang);
    chiz(k, yevroShakl(mx - 44 * b, cy + 72 * b, 58 * b, 12 * b), belgiRang);
    chiz(k, yuanShakl(mx + 44 * b, cy + 72 * b, 58 * b, 12 * b), belgiRang);
  } else {
    // Ustma-ust uchta — daftar satrlariga o‘xshaydi
    const h = 64 * b;
    const q = 13 * b;
    chiz(k, dollarShakl(mx, cy - 88 * b, h, q), belgiRang);
    chiz(k, yevroShakl(mx, cy, h, q), belgiRang);
    chiz(k, yuanShakl(mx, cy + 88 * b, h, q), belgiRang);
  }

  return k;
}
// =============================================================
//  Taqqoslash varag'i: katta · 96 px · doira niqobi
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

for (const n of [1, 2, 3, 4]) pngYoz(join(CHIQISH, `ikonka-${n}.png`), variant(n, 512));

const V = kanvas(1160, 700);
toldir(V, [0x8a, 0x92, 0xa0]);
for (let i = 0; i < 4; i++) {
  const x = 30 + i * 275;
  joyla(variant(i + 1, 240), V, x, 40);
  joyla(variant(i + 1, 96), V, x + 72, 312);
  joyla(variant(i + 1, 200), V, x + 20, 440, (px, py) => Math.hypot(px - 100, py - 100) <= 99);
}
pngYoz(join(CHIQISH, 'variantlar.png'), V);

console.log('Qoralama tayyor:');
for (const n of [1, 2, 3, 4]) console.log(`  apps/kassa/assets/qoralama/ikonka-${n}.png`);
console.log('  apps/kassa/assets/qoralama/variantlar.png');
