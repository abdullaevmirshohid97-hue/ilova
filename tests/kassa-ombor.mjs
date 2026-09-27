// =============================================================
//  CLARY — SQLITE ULANISHI BITTA BO'LISHI
//
//  NEGA BU SINOV BOR — 2026-09-27.
//
//  Ekranda chiqqan xato:
//    Call to function 'NativeDatabase.prepareAsync' has been
//    rejected → Caused by: java.lang.NullPointerException
//
//  `expo-sqlite` (Android, `SQLiteModule.kt`) bir yo'ldagi
//  bazani KESHLAYDI: ikkinchi `openDatabaseAsync('kassa.db')`
//  o'sha native ulanishni qaytaradi. Birinchi JS obyekti esa
//  chiqindiga tushganda `sharedObjectDidRelease()` o'sha
//  ulanishni YOPADI — keshdan olmasdan va `isClosed` ni
//  qo'ymasdan. Keyingi so'rov NullPointerException oladi.
//
//  Ikkinchi ochilish `HolatProvider` qayta o'rnatilganda bo'lardi:
//  qulf ekrani, biznes almashishi, «Qayta urinish».
//
//  BU SINOV XATONI HAQIQATAN TAKRORLAYDI. `expo-sqlite` o'rniga
//  soxta modul qo'yiladi va u aynan shunday qiladi: ulanishni
//  nom bo'yicha keshlaydi, `gc()` chaqirilsa esa eski JS
//  obyektlarining ulanishini yopadi. Tuzatma olib tashlansa
//  sinov o'sha NullPointerException bilan yiqiladi.
//
//  Ishga tushirish: node tests/kassa-ombor.mjs
// =============================================================

import { mkdtempSync, writeFileSync } from 'node:fs';
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

// -------------------------------------------------------------
//  SOXTA expo-sqlite — haqiqiy xulqni takrorlaydi
// -------------------------------------------------------------
//
// Holat `globalThis` da: esbuild bu modulni `sqlite.ts` ichiga
// YIG'IB OLADI, sinov esa uni alohida import qiladi — ya'ni ikki
// nusxa bo'ladi. Umumiy holat bo'lmasa sinov o'z nusxasidagi
// hisoblagichni o'qib «0 marta ochildi» derdi (birinchi
// yozilishida shunday bo'ldi).
const SOXTA = `
const g = (globalThis.__soxtaSqlite ??= {
  holat: { ochishlar: 0, yiqitish: 0, ichmaIch: 0, tranzaksiyalar: 0 },
  native: new Map(),
  jsObyektlar: [],
});
// yiqitish — shuncha keyingi ochilish yiqiladi
// ichmaIch — tranzaksiya ichida tranzaksiya boshlangan
export const holat = g.holat;

// Native ulanishlar — YO'L bo'yicha kesh (SQLiteModule.findCachedDatabase)
const native = g.native;
// Har ochilish YANGI JS obyekti beradi, native esa umumiy
const jsObyektlar = g.jsObyektlar;

function tekshirNative(n) {
  if (n.yopiq) {
    throw new Error(
      "Call to function 'NativeDatabase.prepareAsync' has been rejected.\\n" +
      '→ Caused by: java.lang.NullPointerException',
    );
  }
}

const tik = () => new Promise((r) => setTimeout(r, 0));

export async function openDatabaseAsync(nom) {
  holat.ochishlar++;
  await tik();
  if (holat.yiqitish > 0) {
    holat.yiqitish--;
    throw new Error('disk to\\'la');
  }
  let n = native.get(nom);
  if (!n) {
    n = { yopiq: false, tranzaksiyada: false };
    native.set(nom, n);
  }
  const db = {
    _n: n,
    async execAsync() { tekshirNative(n); await tik(); },
    async getFirstAsync(sql) {
      tekshirNative(n);
      await tik();
      // Faqat navbat tartibi so'raladi; qolganida qator «yo'q»
      return /max\\(tartib\\)/.test(sql) ? { t: null } : null;
    },
    async getAllAsync() { tekshirNative(n); await tik(); return []; },
    async runAsync() { tekshirNative(n); await tik(); return { changes: 1 }; },
    async withTransactionAsync(ish) {
      tekshirNative(n);
      if (n.tranzaksiyada) {
        holat.ichmaIch++;
        throw new Error('cannot start a transaction within a transaction');
      }
      n.tranzaksiyada = true;
      holat.tranzaksiyalar++;
      try {
        await tik();
        await ish();
        await tik();
      } finally {
        n.tranzaksiyada = false;
      }
    },
  };
  jsObyektlar.push(db);
  return db;
}

/**
 * Chiqindi yig'uvchini taqlid qiladi: OXIRGISIDAN boshqa har
 * JS obyekti «yig'iladi» va sharedObjectDidRelease() uning
 * native ulanishini yopadi. Native esa umumiy — demak oxirgi
 * obyekt ham yopilgan ulanishga qoladi. Aynan telefondagi xato.
 */
export function gc() {
  const eskilar = jsObyektlar.slice(0, -1);
  for (const o of eskilar) o._n.yopiq = true;
  return eskilar.length;
}

export function tozala() {
  jsObyektlar.length = 0;
  holat.ochishlar = 0;
  holat.yiqitish = 0;
  holat.ichmaIch = 0;
  holat.tranzaksiyalar = 0;
}
`;

const ish = mkdtempSync(join(tmpdir(), 'kassa-ombor-'));
const soxtaYol = join(ish, 'expo-sqlite.mjs');
writeFileSync(soxtaYol, SOXTA);

const chiqish = join(ish, 'sqlite.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/kassa/src/ombor/sqlite.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  alias: { 'expo-sqlite': soxtaYol },
});

const O = await import('file://' + chiqish.replace(/\\/g, '/'));
const S = await import('file://' + soxtaYol.replace(/\\/g, '/'));

console.log('\n\x1b[1mCLARY — SQLITE ULANISHI\x1b[0m\n');

// -------------------------------------------------------------
console.log('\x1b[1m1. Qayta o‘rnatish — telefondagi aynan o‘sha yo‘l\x1b[0m');
//
// HolatProvider #1 ochadi → qulf → HolatProvider #2 ochadi →
// GC eskisini yig'adi → keyingi so'rov.
{
  const birinchi = O.sqliteOmbori();
  await birinchi.ochil();
  await birinchi.royxat('yozuvlar');

  const ikkinchi = O.sqliteOmbori(); // qulfdan keyin
  await ikkinchi.ochil();

  tekshir('baza BIR marta ochildi', S.holat.ochishlar === 1, S.holat.ochishlar + ' marta');

  const yigildi = S.gc();
  tekshir('GC yig‘adigan eski JS obyekti yo‘q', yigildi === 0, yigildi + ' ta');

  let xato = null;
  try {
    await ikkinchi.royxat('yozuvlar');
    await ikkinchi.saqla('yozuvlar', [{ id: 'a', summa: 1 }]);
    await ikkinchi.navbat();
  } catch (e) {
    xato = e;
  }
  tekshir(
    'GC dan keyin ham so‘rov ishlaydi',
    xato === null,
    xato ? String(xato.message).split('\n').pop() : 'NullPointerException yo‘q',
  );
}

// -------------------------------------------------------------
console.log('\n\x1b[1m2. Bir vaqtda ochish\x1b[0m');
//
// Ikki joy bir vaqtda `ochil()` chaqirsa, ikkinchi ulanish
// ochilmasligi kerak — aks holda muammo qaytadi.
{
  S.tozala();
  // Modul keshi ham tozalanishi uchun yangi nom
  const a = O.sqliteOmbori('bir-vaqtda.db');
  const b = O.sqliteOmbori('bir-vaqtda.db');
  await Promise.all([a.ochil(), b.ochil()]);
  tekshir('parallel ochilishda ham BITTA', S.holat.ochishlar === 1, S.holat.ochishlar + ' marta');
}

// -------------------------------------------------------------
console.log('\n\x1b[1m3. Ochilish yiqilsa — keyingisi qayta urinadi\x1b[0m');
//
// Yiqilgan va'da keshda qolsa, ilova qayta ishga tushirilguncha
// omborsiz qolardi.
{
  S.tozala();
  S.holat.yiqitish = 1;
  const a = O.sqliteOmbori('yiqiladi.db');
  let birinchiYiqildi = false;
  try {
    await a.ochil();
  } catch {
    birinchiYiqildi = true;
  }
  tekshir('birinchi urinish yiqildi (kutilgan)', birinchiYiqildi);

  const b = O.sqliteOmbori('yiqiladi.db');
  let ikkinchiXato = null;
  try {
    await b.ochil();
    await b.royxat('yozuvlar');
  } catch (e) {
    ikkinchiXato = e;
  }
  tekshir('ikkinchi urinish QAYTA ochdi', ikkinchiXato === null && S.holat.ochishlar === 2, S.holat.ochishlar + ' marta ochildi');
}

// -------------------------------------------------------------
console.log('\n\x1b[1m4. Tranzaksiyalar navbat bilan\x1b[0m');
//
// Sinx `saqla()` qilib turganda odam yozuv qo'shsa, ikki
// tranzaksiya bir ulanishda boshlanardi.
{
  S.tozala();
  const a = O.sqliteOmbori('navbat.db');
  await a.ochil();
  const b = O.sqliteOmbori('navbat.db');
  await b.ochil();

  // `allSettled`: navbat buzilsa `Promise.all` birinchi xatoda
  // butun sinovni yiqitib, qolgan bo'limlarni ko'rsatmasdi.
  const natijalar = await Promise.allSettled([
    a.saqla('yozuvlar', [{ id: '1' }, { id: '2' }]),
    b.saqla('bitimlar', [{ id: '3' }]),
    a.saqla('tolovlar', [{ id: '4' }]),
  ]);
  const yiqilganlar = natijalar.filter((n) => n.status === 'rejected');
  tekshir('tranzaksiya ichida tranzaksiya yo‘q', S.holat.ichmaIch === 0, S.holat.ichmaIch + ' ta');
  tekshir(
    'uchala tranzaksiya ham bajarildi',
    S.holat.tranzaksiyalar === 3 && yiqilganlar.length === 0,
    `${S.holat.tranzaksiyalar} ta, ${yiqilganlar.length} tasi yiqildi`,
  );
}

// -------------------------------------------------------------
console.log('\n\x1b[1m5. Bitta tranzaksiya yiqilsa navbat uzilmaydi\x1b[0m');
{
  S.tozala();
  const a = O.sqliteOmbori('uzilmas.db');
  await a.ochil();

  const yomon = a.saqla('yozuvlar', [{ id: 'x', get summa() { throw new Error('buzuq qator'); } }]);
  const yaxshi = a.saqla('yozuvlar', [{ id: 'y' }]);

  let yomonYiqildi = false;
  try {
    await yomon;
  } catch {
    yomonYiqildi = true;
  }
  let yaxshiXato = null;
  try {
    await yaxshi;
  } catch (e) {
    yaxshiXato = e;
  }
  tekshir('buzuq tranzaksiya xatosi chaqiruvchiga qaytdi', yomonYiqildi);
  tekshir('keyingi tranzaksiya baribir bajarildi', yaxshiXato === null, yaxshiXato ? yaxshiXato.message : 'ishladi');
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
