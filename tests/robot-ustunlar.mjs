// =============================================================
//  ROBOT USTUN TANISHI
//
//  Muammo: 1said praysida «Производитель» ustuni bor edi, robot esa
//  uni topmasdi va eksportda ustun bo'sh chiqardi.
//
//  Ikki sabab topildi:
//   1. Saqlangan shablon robot topganini BUTUNLAY almashtirar edi.
//      29-avgustdagi shablonda ishlab chiqaruvchi yo'q edi va u har
//      safar robotning to'g'ri javobini o'chirib tashlardi — robot
//      bir marta xato o'rgangan va hech qachon unutolmasdi.
//   2. «Ваш заказ» ustuni "miqdor" deb olinardi. U mijoz to'ldiradigan
//      BO'SH ustun, ya'ni butun prays bo'ylab miqdor nol bo'lardi.
//
//  Bu sinov robotni ikkala haqiqiy fayl sarlavhalari bilan sinaydi.
//
//  Ishga tushirish:  node tests/robot-ustunlar.mjs
// =============================================================

import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mROBOT USTUN TANISHI\x1b[0m');

// ---------- robotni yig'amiz ----------
const ish = join(ROOT, 'node_modules', '.cache', 'robot-sinov');
mkdirSync(ish, { recursive: true });
const chiqish = join(ish, 'robot.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/faktura-robot.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  external: ['xlsx'],
  outfile: chiqish,
  logLevel: 'error',
});
const R = await import('file://' + chiqish.replace(/\\/g, '/'));

// ---------- haqiqiy fayllardagi sarlavhalar ----------
// Ikkalasi ham foydalanuvchi yuborgan rasmlardan olingan
const SAID = ['№', 'Название', 'Ваш заказ', 'Сотув нархи', 'Сумма заказ', 'Срок годности', 'Производитель'];
const SADAF = ['№', 'Название', 'Ваш заказ', 'Сотув цена со скидкой/наценкой', 'Срок годности', 'Производитель'];

console.log('\n1. Sarlavha nomlari');

for (const [nom, sarlavhalar] of [
  ['said', SAID],
  ['sadaf', SADAF],
]) {
  const m = R.nomNomzodlari;
  for (const s of sarlavhalar) {
    const nomzod = m(s);
    const eng = nomzod[0]?.maydon ?? null;
    const kutilgan = {
      '№': null,
      Название: 'name',
      'Ваш заказ': null,
      'Сотув нархи': 'price',
      'Сотув цена со скидкой/наценкой': 'price',
      'Сумма заказ': null,
      'Срок годности': 'expiry',
      Производитель: 'manufacturer',
    }[s];
    if (kutilgan === undefined) continue;
    tekshir(
      `${nom}: «${s}»`,
      eng === kutilgan,
      kutilgan === null ? `e'tiborsiz (${eng ?? 'yo‘q'})` : `${eng ?? 'topilmadi'}`,
    );
  }
}

console.log('\n2. Manba qoidalari');

const robot = readFileSync(join(ROOT, 'apps/admin/src/lib/faktura-robot.ts'), 'utf8');
tekshir('e’tiborsiz ustunlar ro‘yxati bor', /ETIBORSIZ_USTUNLAR/.test(robot));
tekshir('«ваш заказ» ro‘yxatda', /'ваш заказ'/.test(robot));
tekshir('«сумма заказ» ro‘yxatda', /'сумма заказ'/.test(robot));
tekshir('«сотув нархи» narx kalitida', /'сотув нархи'/.test(robot));
tekshir('«цена со скидкой» narx kalitida', /'цена со скидкой'/.test(robot));
tekshir('«производитель» allaqachon bor', /'производитель'/.test(robot));
tekshir(
  'bitta ustun ikki maydonga tushmaydi',
  /bandUstun\.has\(j\.indeks\)/.test(robot),
  'qty va unit bir ustunga tushgan edi',
);

console.log('\n3. Shablon robotni bosmasin');

const komp = readFileSync(join(ROOT, 'apps/admin/src/components/PraysYuklash.tsx'), 'utf8');
tekshir(
  'shablon to‘ldiradi, almashtirmaydi',
  /const m: Moslash = \{ \.\.\.shablonM \}/.test(komp) && /n\.moslash/.test(komp),
  'avval butun moslashtirish almashardi',
);
tekshir(
  'shablonda yo‘q maydon robotdan olinadi',
  /if \(m\[maydon\] !== undefined\) continue;/.test(komp),
);
tekshir(
  'band ustunga ikkinchi maydon tushmaydi',
  /if \(band\.has\(indeks\)\) continue;/.test(komp),
);

console.log('\n4. Topilmagan ustun ko‘rinadi');
tekshir('muhim ustunlar ro‘yxati bor', /const MUHIM:/.test(komp));
tekshir('ishlab chiqaruvchi muhimlar ichida', /maydon: 'manufacturer'/.test(komp));
tekshir('ogohlantirish chiqadi', /USTUN TOPILMADI/.test(komp));

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
rmSync(ish, { recursive: true, force: true });
process.exit(yiqildi === 0 ? 0 : 1);
