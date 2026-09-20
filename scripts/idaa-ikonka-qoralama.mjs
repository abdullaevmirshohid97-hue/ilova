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
function variant(n, olcham) {
  const k = kanvas(olcham, olcham);
  const b = olcham / 512;
  const cx = olcham / 2;
  const cy = olcham / 2;

  if (n === 1) {
    // I. To'q fon · oq daftar · zumrad tanga.
    //    Ikki shakl, uch rang, hech qanday bezak yo'q.
    toldir(k, P.siyoh);
    const kitob = daftarShakl(cx - 18 * b, cy - 10 * b, 232 * b, 288 * b);
    chiz(k, kitob, P.oq);
    chiz(k, tikuvShakl(cx - 18 * b, cy - 10 * b, 232 * b, 288 * b), P.yashil);
    // Tanga daftar ustiga chiqadi — chuqurlik soyasiz shunday beriladi
    chiz(k, doira(cx + 112 * b, cy + 116 * b, 92 * b), P.siyoh);
    chiz(k, doira(cx + 112 * b, cy + 116 * b, 78 * b), P.yashil);
    chiz(k, dollarShakl(cx + 112 * b, cy + 116 * b, 86 * b, 17 * b), P.siyoh);
  } else if (n === 2) {
    // II. Zumrad fon · oq daftar · to'q «$» muqovada.
    //     Rang teskari: yorqin fon yorqinroq ko'rinadi.
    toldir(k, P.yashil);
    const kitob = daftarShakl(cx, cy, 258 * b, 320 * b);
    chiz(k, kitob, P.oq);
    chiz(k, tikuvShakl(cx, cy, 258 * b, 320 * b), P.siyoh);
    chiz(k, dollarShakl(cx + 26 * b, cy, 176 * b, 34 * b), P.siyoh);
  } else if (n === 3) {
    // III. To'q fon · oq daftar · «IDAA» muqovada · sariq tasma.
    //      Uchala talab ham bajarilgan: daftar, nom, pul.
    toldir(k, P.siyoh);
    const kitob = daftarShakl(cx, cy, 262 * b, 324 * b);
    chiz(k, kitob, P.oq);
    chiz(k, tikuvShakl(cx, cy, 262 * b, 324 * b), P.sariq);
    const h = 54 * b;
    const w = KENGLIK('IDAA', h, h * 0.22);
    chiz(k, yozuvShakl('IDAA', cx + 30 * b - w / 2, cy - 78 * b, h, h * 0.22), P.siyoh);
    // «$» ham to'q rangda: sariq oq muqovada deyarli ko'rinmaydi
    chiz(k, dollarShakl(cx + 30 * b, cy + 62 * b, 104 * b, 22 * b), P.siyoh);
  } else {
    // IV. Oq fon · to'q daftar · zumrad tanga.
    //     Yorug' ikonka: qora ekranda ham, oq ekranda ham ajralib turadi.
    toldir(k, P.qaymoq);
    const kitob = daftarShakl(cx - 18 * b, cy - 10 * b, 232 * b, 288 * b);
    chiz(k, kitob, P.siyoh);
    chiz(k, tikuvShakl(cx - 18 * b, cy - 10 * b, 232 * b, 288 * b), P.kok);
    chiz(k, doira(cx + 112 * b, cy + 116 * b, 92 * b), P.qaymoq);
    chiz(k, doira(cx + 112 * b, cy + 116 * b, 78 * b), P.yashil);
    chiz(k, dollarShakl(cx + 112 * b, cy + 116 * b, 86 * b, 17 * b), P.oq);
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
