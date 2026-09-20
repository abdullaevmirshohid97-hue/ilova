// =============================================================
//  CLARY — EKRANGA CHIQMAYDIGAN JOYLAR
//
//  Ilova o'sgan sari «yozildi, lekin ko'rinmaydi» degan holat
//  ko'payadi: ekran yaratiladi, tugma qo'shiladi, lekin unga
//  boradigan yo'l qolmaydi. Bunday narsani qo'lda topib
//  bo'lmaydi — ilovani ochib ko'rgan odam uning BORLIGINI ham
//  bilmaydi.
//
//  Shuning uchun to'rt narsa tekshiriladi:
//
//   1. Har bir EKRAN chizilishi kerak (import qilingani yetmaydi).
//   2. Yon paneldagi har bir bo'limning chizish shoxi bo'lsin.
//   3. Har bir chizish shoxiga yon paneldan yo'l bo'lsin.
//   4. `src/ui` dagi har bir qism ishlatilsin.
//
//  Ishga tushirish: node tests/kassa-ui.mjs
// =============================================================

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KASSA = join(ROOT, 'apps/kassa');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

const oqi = (p) => readFileSync(p, 'utf8');

/** Barcha .tsx/.ts fayllar */
function fayllar(katalog, natija = []) {
  for (const nom of readdirSync(katalog, { withFileTypes: true })) {
    const yol = join(katalog, nom.name);
    if (nom.isDirectory()) {
      if (nom.name === 'node_modules' || nom.name.startsWith('.')) continue;
      fayllar(yol, natija);
      continue;
    }
    if (/\.tsx?$/.test(nom.name)) natija.push(yol);
  }
  return natija;
}

const hamma = [...fayllar(join(KASSA, 'src')), join(KASSA, 'App.tsx')];
const matnlar = new Map(hamma.map((f) => [f, oqi(f)]));
const qisqa = (f) => f.replace(KASSA + '\\', '').replace(KASSA + '/', '').replace(/\\/g, '/');

console.log('\n\x1b[1mCLARY — EKRANGA CHIQMAYDIGAN JOYLAR\x1b[0m');

// =============================================================
// 1. Har bir ekran chiziladimi
// =============================================================
console.log('\n1. Ekranlar');

const ekranlar = hamma.filter((f) => qisqa(f).startsWith('src/ekran/'));
const chizilmagan = [];

for (const f of ekranlar) {
  const nom = qisqa(f).split('/').pop().replace(/\.tsx?$/, '');

  let chizildi = false;
  for (const [boshqa, matn] of matnlar) {
    if (boshqa === f) continue;

    // Standart eksport BOSHQA NOM bilan import qilinishi mumkin:
    // `import Hisoblar from './YanaHisoblar'`. Shuning uchun avval
    // o'sha fayl uchun qanday nom ishlatilganini topamiz — aks
    // holda sinov «chizilmagan» deb yolg'on xabar berardi.
    const nomzodlar = [nom];
    for (const satr of matn.split('\n')) {
      if (!satr.startsWith('import ') || !satr.includes('/' + nom)) continue;
      const m = satr.match(/^import\s+(\w+)/);
      if (m) nomzodlar.push(m[1]);
    }

    if (nomzodlar.some((x) => new RegExp('<' + x + '\\b').test(matn))) {
      chizildi = true;
      break;
    }
  }
  if (!chizildi) chizilmagan.push(nom);
}

tekshir(
  'har bir ekran chiziladi',
  chizilmagan.length === 0,
  chizilmagan.length ? chizilmagan.join(', ') : ekranlar.length + ' ta ekran',
);

// =============================================================
// 2 va 3. Yon panel va chizish shoxlari
// =============================================================
console.log('\n2. Yon panel va bo‘limlar');

const panel = oqi(join(KASSA, 'src/ui/YonPanel.tsx'));
const app = oqi(join(KASSA, 'App.tsx'));

const panelBolimlar = [...panel.matchAll(/\{\s*kalit:\s*'([a-z]+)'/g)].map((m) => m[1]);
const appShoxlar = [...app.matchAll(/bolim === '([a-z]+)'/g)].map((m) => m[1]);

// «yakun» — bo'lim emas, oyna: u `setYakunOynasi` ni ochadi.
const OYNA_BOLIMLAR = ['yakun'];

const yolsiz = panelBolimlar.filter(
  (b) => !appShoxlar.includes(b) && !OYNA_BOLIMLAR.includes(b),
);
tekshir(
  'yon paneldagi har bo‘limning ekrani bor',
  yolsiz.length === 0,
  yolsiz.length ? yolsiz.join(', ') : panelBolimlar.length + ' ta bo‘lim',
);

const koringanmas = appShoxlar.filter((b) => !panelBolimlar.includes(b));
tekshir(
  'har bir ekranga yon paneldan yo‘l bor',
  koringanmas.length === 0,
  koringanmas.length ? koringanmas.join(', ') : 'hammasi ro‘yxatda',
);

// =============================================================
// 4. `src/ui` qismlari
// =============================================================
console.log('\n3. UI qismlari');

const uiFayllar = hamma.filter((f) => qisqa(f).startsWith('src/ui/'));
const ishlatilmagan = [];

for (const f of uiFayllar) {
  const eksportlar = [...oqi(f).matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w*)/g)].map(
    (m) => m[1],
  );
  for (const e of eksportlar) {
    let bor = false;
    for (const [boshqa, matn] of matnlar) {
      if (boshqa === f) continue;
      if (new RegExp('\\b' + e + '\\b').test(matn)) {
        bor = true;
        break;
      }
    }
    if (!bor) ishlatilmagan.push(qisqa(f).split('/').pop() + ':' + e);
  }
}

tekshir(
  'ui qismlari ishlatiladi',
  ishlatilmagan.length === 0,
  ishlatilmagan.length ? ishlatilmagan.join(', ') : uiFayllar.length + ' ta fayl',
);

// =============================================================
// 5. SHART BILAN YASHIRINGAN joylar
//
//  Eng yomon tur: kod bor, yo'l ham bor, lekin shart hech qachon
//  bajarilmaydi. Masalan «ro'yxat 1 tadan ko'p bo'lsa ko'rsat» —
//  ro'yxat esa bo'sh bo'lsa, odam uni hech qachon ko'rmaydi va
//  to'ldirishning yo'lini ham topa olmaydi.
// =============================================================
console.log('\n4. Shart bilan yashiringan joylar');

// Istisno: yonida `tanlovsiz-mayli` izohi turgan joy.
// Sabab kod yonida yozilgan bo‘lsa, sinov unga ishonadi —
// shunda keyingi odam sababni sinovda emas, o‘sha joyda
// o‘qiydi.
const shubhali = [];
for (const [f, matn] of matnlar) {
  const qatorlar = matn.split('\n');
  qatorlar.forEach((satr, i) => {
    const m = satr.match(/\{(\w+)\.length > (\d+) && \(/);
    if (!m || Number(m[2]) < 1) return;
    // Uch qator tepasida izoh bormi
    const atrof = qatorlar.slice(Math.max(0, i - 4), i + 1).join('\n');
    if (atrof.includes('tanlovsiz-mayli')) return;
    shubhali.push(`${qisqa(f).split('/').pop()}: ${m[1]}.length > ${m[2]}`);
  });
}

tekshir(
  'bo‘sh ro‘yxatda butunlay yo‘qoladigan joy yo‘q',
  shubhali.length === 0,
  shubhali.length ? shubhali.join(' | ') : 'toza',
);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
