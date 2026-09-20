// =============================================================
//  IDAA MONEY — IKONKA QORALAMASI
//
//  Birinchi urinish rad etildi: «premium ko'rinmaydi». Uch sabab
//  aniqlandi va uchalasi ham shu versiyada tuzatilgan:
//
//   1. KO'P ELEMENT. Daftar + teshiklar + chiziqlar + rezinka + pul
//      — beshta narsa 96 pikselda bo'tqaga aylanadi. Premium ikonka
//      bitta fikrni ko'rsatadi.
//   2. YASSI RANG. Kraft sarg'ish va o'rtacha yashil arzon ko'rinadi.
//      Moliyada «qimmat» tuyg'usi chuqur fon + metall aksentdan keladi.
//   3. YUMALOQ UCHLI HARFLAR. Kapsula chiziqlardan yig'ilgan harf
//      yumshoq va qo'lbola chiqadi. Endi harflar TEKIS UCHLI.
//
//  Chizish usuli: SDF (har piksel uchun shaklgacha masofa). Shuning
//  uchun chetlar silliq va kutubxona kerak emas — sabablari
//  `credit-debit-logo.mjs` boshida batafsil yozilgan.
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
//  Palitra
//
//  Fon deyarli qora-ko'k: oltin FAQAT to'q fonda qimmat ko'rinadi,
//  ochiq fonda u sarg'ish loyqaga aylanadi.
// =============================================================
const RANG = {
  fonYuqori: [0x0d, 0x14, 0x1f],
  fonPast: [0x1a, 0x26, 0x38],
  oltinYorug: [0xf8, 0xe7, 0xb0],
  oltinOrta: [0xd8, 0xb1, 0x5c],
  oltinToq: [0x8f, 0x6b, 0x2c],
  qogoz: [0xf4, 0xf1, 0xe8],
};

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
//  Kanvas
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

/**
 * Shakl chizish. `rang` — massiv yoki (x,y) => massiv.
 *
 * Ikkinchisi gradient uchun: oltin bitta rang emas, yuqoridan pastga
 * yorug'dan to'qqa o'tadigan yuza. Yassi oltin plastmassaga o'xshaydi.
 */
function chiz(k, masofa, rang, imkon = {}) {
  const { alfa = 1 } = imkon;
  const rangFn = typeof rang === 'function' ? rang : () => rang;
  for (let y = 0; y < k.h; y++) {
    for (let x = 0; x < k.w; x++) {
      const d = masofa(x + 0.5, y + 0.5);
      if (d > 1) continue;
      nuqta(k, x, y, rangFn(x, y), alfa * Math.min(1, Math.max(0, 0.5 - d)));
    }
  }
}

/** Yumshoq soya: shakl tashqarisiga tarqaladigan qorayish */
function soya(k, masofa, radius, quyuqlik = 0.5, siljish = 0) {
  for (let y = 0; y < k.h; y++) {
    for (let x = 0; x < k.w; x++) {
      const d = masofa(x + 0.5, y + 0.5 - siljish);
      if (d <= 0 || d > radius) continue;
      nuqta(k, x, y, [0, 0, 0], (1 - d / radius) ** 2 * quyuqlik);
    }
  }
}

// =============================================================
//  SDF shakllari
// =============================================================
const yumaloq = (cx, cy, w, h, r) => (x, y) => {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

const doira = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

/**
 * TEKIS uchli chiziq (aylantirilgan to'rtburchak).
 *
 * Kapsula (yumaloq uchli) emas: harf uchlari yumaloq bo'lsa, yozuv
 * bolalar kitobidagidek chiqadi. Jiddiy shriftlarda uchlar tekis.
 */
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

/**
 * Yarim halqa — qalin yoyni TO'G'RI chizish usuli.
 *
 * Yoyni kichik to'g'ri chiziqlardan yig'sak, har bo'lak tekis uchi
 * bilan yon tomonga chiqib ketadi va qalin yoy nur sochgandek
 * ko'rinadi. Halqa masofasida bunday kamchilik yo'q.
 */
const yarimHalqa = (cx, cy, r, q, yuqorimi) => (x, y) => {
  const a = Math.abs(Math.hypot(x - cx, y - cy) - r) - q / 2;
  return Math.max(a, yuqorimi ? y - cy : cy - y);
};

const birlashma = (...s) => (x, y) => {
  let d = Infinity;
  for (const f of s) d = Math.min(d, f(x, y));
  return d;
};

/**
 * Silliq birlashma: tutashgan joyda burchak qolmasin.
 *
 * Oddiy birlashmada «S» ning bel chizig'i yarim halqaga burchak
 * bilan urilib, ikki yonida qanotdek chiqib qolardi. `radius` —
 * silliqlash kengligi.
 */
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
//  Fon va oltin yuza
// =============================================================
function fon(k) {
  for (let y = 0; y < k.h; y++) {
    const t = y / (k.h - 1);
    const r = [0, 1, 2].map((c) =>
      Math.round(RANG.fonYuqori[c] + (RANG.fonPast[c] - RANG.fonYuqori[c]) * t),
    );
    for (let x = 0; x < k.w; x++) nuqta(k, x, y, r, 1);
  }
}

/**
 * Oltin: yuqoridan pastga yorug' -> o'rta -> to'q, ustiga diagonal
 * yaltirash tasmasi. Metall shu ikki narsadan tanilib turadi.
 */
function oltin(y0, y1) {
  const balandlik = Math.max(1, y1 - y0);
  return (x, y) => {
    const t = Math.min(1, Math.max(0, (y - y0) / balandlik));
    const asos =
      t < 0.5
        ? [0, 1, 2].map((c) => RANG.oltinYorug[c] + (RANG.oltinOrta[c] - RANG.oltinYorug[c]) * (t / 0.5))
        : [0, 1, 2].map((c) => RANG.oltinOrta[c] + (RANG.oltinToq[c] - RANG.oltinOrta[c]) * ((t - 0.5) / 0.5));
    const yaltirash = Math.exp(-(((x - y * 0.7) / balandlik) ** 2) * 5) * 28;
    return asos.map((c) => Math.min(255, Math.round(c + yaltirash)));
  };
}

// =============================================================
//  Harflar — tekis uchli, bir xil qalinlikda
// =============================================================
function harf(belgi, x, y, h, q) {
  const w = h * 0.62;
  const orta = y + h / 2;
  switch (belgi) {
    case 'I':
      return [chiziq(x + q / 2, y, x + q / 2, y + h, q), q];
    case 'D': {
      // Tashqi yumaloq to'rtburchakdan ichkarisi kesib olinadi.
      // Yoydan yig'ilganda ulanish joyi bilinib turardi.
      const tashqi = yumaloq(x + w / 2, orta, w, h, h * 0.36);
      const ichki = yumaloq(x + w / 2 + q * 0.3, orta, w - 2 * q, h - 2 * q, h * 0.36 - q);
      return [birlashma(ayir(tashqi, ichki), chiziq(x + q / 2, y, x + q / 2, y + h, q)), w];
    }
    case 'A':
      return [
        birlashma(
          chiziq(x + w * 0.05, y + h, x + w * 0.5, y, q),
          chiziq(x + w * 0.5, y, x + w * 0.95, y + h, q),
          chiziq(x + w * 0.24, y + h * 0.66, x + w * 0.76, y + h * 0.66, q * 0.82),
        ),
        w,
      ];
    case 'M':
      return [
        birlashma(
          chiziq(x + q / 2, y + h, x + q / 2, y, q),
          chiziq(x, y + q * 0.4, x + w / 2, y + h * 0.66, q),
          chiziq(x + w / 2, y + h * 0.66, x + w, y + q * 0.4, q),
          chiziq(x + w - q / 2, y, x + w - q / 2, y + h, q),
        ),
        w * 1.1,
      ];
    case 'O': {
      const tashqi = yumaloq(x + w / 2, orta, w, h, Math.min(w, h) / 2);
      const ichki = yumaloq(x + w / 2, orta, w - 2 * q, h - 2 * q, Math.min(w, h) / 2 - q);
      return [ayir(tashqi, ichki), w];
    }
    case 'N':
      return [
        birlashma(
          chiziq(x + q / 2, y + h, x + q / 2, y, q),
          chiziq(x, y, x + w, y + h, q),
          chiziq(x + w - q / 2, y + h, x + w - q / 2, y, q),
        ),
        w,
      ];
    case 'E':
      return [
        birlashma(
          chiziq(x + q / 2, y, x + q / 2, y + h, q),
          chiziq(x, y + q / 2, x + w * 0.88, y + q / 2, q),
          chiziq(x, orta, x + w * 0.7, orta, q),
          chiziq(x, y + h - q / 2, x + w * 0.88, y + h - q / 2, q),
        ),
        w,
      ];
    case 'Y':
      return [
        birlashma(
          chiziq(x, y, x + w / 2, y + h * 0.54, q),
          chiziq(x + w, y, x + w / 2, y + h * 0.54, q),
          chiziq(x + w / 2, y + h * 0.54, x + w / 2, y + h, q),
        ),
        w,
      ];
    default:
      return [null, h * 0.3];
  }
}

const KENGLIK = (matn, h, oraliq) => {
  let w = 0;
  for (const b of matn) w += harf(b, 0, 0, h, h * 0.155)[1] + oraliq;
  return w - oraliq;
};

function yozuvShakl(matn, x, y, h, oraliq) {
  const q = h * 0.155;
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
//  Dollar belgisi
//
//  Ikki yarim halqa + qiya bel. Uchalasi SILLIQ birlashadi, ustun
//  esa oddiy qo'shiladi — u to'g'ri burchak bilan chiqib turishi
//  kerak.
// =============================================================
function dollarShakl(cx, cy, h, q) {
  const r = h * 0.23;
  const U = cy - r;
  const L = cy + r;
  const egri = yumshoqBirlashma(
    q * 0.9,
    yarimHalqa(cx, U, r, q, true),
    chiziq(cx - r, U, cx + r, L, q * 0.94),
    yarimHalqa(cx, L, r, q, false),
  );
  return birlashma(egri, chiziq(cx, cy - h * 0.5, cx, cy + h * 0.5, q * 0.72));
}

// =============================================================
//  To'rt variant
// =============================================================
function variant(n, olcham) {
  const k = kanvas(olcham, olcham);
  const b = olcham / 512;
  fon(k);
  const cx = olcham / 2;

  if (n === 1) {
    // I. Oltin daftar, ichida «$» O'YIB OLINGAN (negativ bo'shliq).
    //    Bitta shakl, bitta metall — eng jim va eng qimmat variant.
    const kitob = yumaloq(cx, 256 * b, 250 * b, 320 * b, 34 * b);
    const belgi = dollarShakl(cx + 20 * b, 258 * b, 172 * b, 32 * b);
    soya(k, kitob, 46 * b, 0.55, 10 * b);
    chiz(k, ayir(kitob, belgi), oltin(96 * b, 416 * b));
    // Tikilgan chekka — «daftar» ekanini shu bitta chiziq aytadi
    chiz(k, kesishma(chiziq(cx - 92 * b, 96 * b, cx - 92 * b, 416 * b, 6 * b), kitob), RANG.fonYuqori, {
      alfa: 0.4,
    });
  } else if (n === 2) {
    // II. To'q daftar, oltin ramka, «IDAA» va kichik «$».
    //     Yagona variant: daftar + nom + pul — talab qilinganidek.
    const kitob = yumaloq(cx, 256 * b, 264 * b, 330 * b, 32 * b);
    soya(k, kitob, 44 * b, 0.55, 10 * b);
    chiz(k, kitob, (x, y) => {
      const t = (y - 91 * b) / (330 * b);
      return [0x1c + Math.round(8 * t), 0x26 + Math.round(8 * t), 0x36 + Math.round(10 * t)];
    });
    chiz(k, ayir(kitob, yumaloq(cx, 256 * b, 252 * b, 318 * b, 26 * b)), oltin(91 * b, 421 * b));
    chiz(k, kesishma(chiziq(cx - 94 * b, 91 * b, cx - 94 * b, 421 * b, 7 * b), kitob), oltin(91 * b, 421 * b), {
      alfa: 0.8,
    });
    const h = 60 * b;
    const w = KENGLIK('IDAA', h, h * 0.2);
    chiz(k, yozuvShakl('IDAA', cx - w / 2 + 14 * b, 190 * b, h, h * 0.2), oltin(190 * b, 190 * b + h));
    chiz(k, chiziq(cx - 58 * b, 288 * b, cx + 72 * b, 288 * b, 4 * b), oltin(284 * b, 294 * b));
    chiz(k, dollarShakl(cx + 12 * b, 350 * b, 84 * b, 15 * b), oltin(308 * b, 392 * b));
  } else if (n === 3) {
    // III. Faqat yozuv: oltin «IDAA» va ostida ikki daftar satri.
    //      Eng minimal — 48 pikselda ham o'qiladi.
    const h = 112 * b;
    const w = KENGLIK('IDAA', h, h * 0.2);
    const y0 = 196 * b;
    chiz(k, yozuvShakl('IDAA', cx - w / 2 + 8 * b, y0, h, h * 0.2), oltin(y0, y0 + h));
    const s1 = y0 + h + 36 * b;
    chiz(k, chiziq(cx - w / 2, s1, cx + w / 2, s1, 8 * b), oltin(s1 - 5 * b, s1 + 5 * b));
    chiz(k, chiziq(cx - w / 2, s1 + 30 * b, cx + w * 0.12, s1 + 30 * b, 8 * b), oltin(s1 + 25 * b, s1 + 35 * b), {
      alfa: 0.45,
    });
  } else {
    // IV. Oltin halqa ichida qog'oz sahifa va oltin «$» — tanga tuyg'usi.
    const tashqi = doira(cx, 256 * b, 186 * b);
    soya(k, tashqi, 40 * b, 0.5, 8 * b);
    chiz(k, ayir(tashqi, doira(cx, 256 * b, 172 * b)), oltin(70 * b, 442 * b));
    const kitob = yumaloq(cx, 256 * b, 170 * b, 216 * b, 24 * b);
    chiz(k, kitob, RANG.qogoz);
    chiz(k, kesishma(chiziq(cx - 58 * b, 148 * b, cx - 58 * b, 364 * b, 6 * b), kitob), RANG.oltinOrta, {
      alfa: 0.55,
    });
    chiz(k, dollarShakl(cx + 18 * b, 256 * b, 126 * b, 23 * b), oltin(193 * b, 319 * b));
  }

  return k;
}

// =============================================================
//  Taqqoslash varag'i
//
//  Uch qator: katta · 96 px (telefondagi haqiqiy o'lcham) · doira
//  niqobi (Android adaptiv ikonkani shunday kesadi).
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
for (let y = 0; y < V.h; y++) for (let x = 0; x < V.w; x++) nuqta(V, x, y, [0x24, 0x24, 0x28], 1);
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
