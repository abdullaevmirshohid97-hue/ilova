// =============================================================
//  QORALAMA SINOVI
//
//  Xato: sotuv ekranida savat to'ldirilgan, mijoz tanlangan — boshqa
//  modulga o'tilsa hammasi yo'qolardi. Sabab: panel modulni shart
//  bilan chizadi (`bolim === 'sotuv' && <DoriSotuv />`), shart yolg'on
//  bo'lgan zahoti React komponentni yo'q qiladi.
//
//  Sinov ikki qismdan:
//   1. Hook'ning o'zi haqiqatan ishlaydimi — esbuild bilan yig'ilib,
//      soxta sessionStorage ustida chaqiriladi.
//   2. Ikkala sotuv ekrani ham unga ulanganmi va sotuvdan keyin
//      tozalaydimi.
//
//  Ishga tushirish:  node tests/qoralama.mjs
// =============================================================

import { readFileSync, mkdtempSync } from 'node:fs';
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

console.log('\n\x1b[1mQORALAMA\x1b[0m');

// ---------- 1. Hook'ni haqiqatan ishlatib ko'ramiz ----------
console.log('\n1. Saqlash va tiklash');

// React kerak emas: faqat qoralamalarniTozala va sessionStorage bilan
// ishlash mantiqini tekshiramiz. useQoralama React'siz chaqirilmaydi,
// shuning uchun uning sessionStorage qismini alohida sinaymiz.
const ish = mkdtempSync(join(tmpdir(), 'qoralama-'));
const chiqish = join(ish, 'q.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/qoralama.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  // React'ni qo'g'irchoq bilan almashtiramiz: bu sinov faqat
  // sessionStorage mantiqini tekshiradi, hook'larni emas. 'external'
  // qilinsa node uni vaqtinchalik papkadan topolmaydi.
  plugins: [
    {
      name: 'react-qogirchoq',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, (a) => ({ path: a.path, namespace: 'qq' }));
        build.onLoad({ filter: /.*/, namespace: 'qq' }, () => ({
          contents:
            'export const useState=()=>[];export const useEffect=()=>{};' +
            'export const useRef=()=>({current:null});export const useCallback=(f)=>f;',
        }));
      },
    },
  ],
  outfile: chiqish,
  logLevel: 'error',
});

// Soxta sessionStorage — brauzerникidek
const saqlangan = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (saqlangan.has(k) ? saqlangan.get(k) : null),
  setItem: (k, v) => saqlangan.set(k, String(v)),
  removeItem: (k) => saqlangan.delete(k),
};

const Q = await import('file://' + chiqish.replace(/\\/g, '/'));

saqlangan.set('qoralama.pos.savat', JSON.stringify([{ nom: 'A' }]));
saqlangan.set('qoralama.pos.mijoz', JSON.stringify({ id: '1' }));
saqlangan.set('boshqa.narsa', 'tegilmasin');

Q.qoralamalarniTozala('pos.savat', 'pos.mijoz');
tekshir('tozalash kalit prefiksi bilan ishlaydi', !saqlangan.has('qoralama.pos.savat'));
tekshir('ikkinchi kalit ham ketdi', !saqlangan.has('qoralama.pos.mijoz'));
tekshir('begona kalitga tegmaydi', saqlangan.get('boshqa.narsa') === 'tegilmasin');

// Xotira yopiq bo'lsa (shaxsiy oyna) yiqilmasin
const eski = globalThis.sessionStorage;
globalThis.sessionStorage = {
  getItem() { throw new Error('yopiq'); },
  setItem() { throw new Error('yopiq'); },
  removeItem() { throw new Error('yopiq'); },
};
let yiqildimi = false;
try {
  Q.qoralamalarniTozala('pos.savat');
} catch {
  yiqildimi = true;
}
globalThis.sessionStorage = eski;
tekshir('xotira yopiq bo‘lsa ham yiqilmaydi', !yiqildimi, 'shaxsiy oyna');

// ---------- 2. Manba kod ----------
console.log('\n2. Hook qoidalari');

const lib = readFileSync(join(ROOT, 'apps/admin/src/lib/qoralama.ts'), 'utf8');
tekshir('sessionStorage ishlatiladi', /sessionStorage/.test(lib));
tekshir(
  'localStorage ishlatilmaydi',
  !/localStorage/.test(lib),
  'brauzer yopilsa qoralama ham ketsin',
);
tekshir('buzilgan qoralama e’tiborga olinmaydi', /catch \{[\s\S]{0,200}return boshlangich/.test(lib));
tekshir('tiklanganini bildiradi', /tiklandi/.test(lib));

// ---------- 3. Sotuv ekranlari ----------
console.log('\n3. Sotuv ekranlari');

for (const [fayl, nom, kalitlar] of [
  ['apps/admin/src/pages/DoriSotuv.tsx', 'Dorixona sotuvi', ['dori.sotuv.savat', 'dori.sotuv.mijoz', 'dori.sotuv.izoh']],
  ['apps/admin/src/pages/PosSotuv.tsx', 'B2B kassa', ['pos.savat', 'pos.mijoz', 'pos.izoh', 'pos.chegirma']],
]) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');

  tekshir(`${nom}: savat qoralamada`, new RegExp(`useQoralama<Savat\\[\\]>\\('${kalitlar[0]}'`).test(src));
  tekshir(`${nom}: mijoz qoralamada`, src.includes(`'${kalitlar[1]}'`));
  tekshir(`${nom}: tiklanganini aytadi`, /savatQ\.tiklandi/.test(src));
  tekshir(`${nom}: tozalash tugmasi bor`, /savatQ\.tozala\(\)/.test(src));

  // Eng muhimi: sotuvdan keyin qoralama qolmasin, aks holda saqlangan
  // savat keyingi safar yana ochilib qolardi
  tekshir(
    `${nom}: sotuvdan keyin tozalanadi`,
    new RegExp(`qoralamalarniTozala\\([^)]*${kalitlar[0].replace(/\./g, '\\.')}`).test(src),
  );

  // Qidiruv natijasi saqlanmasin — u baribir qayta so'raladi va
  // eskirgan qoldiq ko'rsatishi mumkin
  tekshir(
    `${nom}: qidiruv natijasi saqlanmaydi`,
    !/useQoralama[^;]*setTovarlar|useQoralama[^;]*setTopilgan/.test(src),
  );
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
