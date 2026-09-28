// =============================================================
//  CLARY — HAMKOR BILAN SODDA KIRIM / CHIQIM
//
//  2026-09-28, foydalanuvchi talabi: hamkor kartochkasidagi kirim
//  va chiqim — faqat SUMMA va IZOH (+ rasm). Olib tashlandi:
//    · chiqimdagi oltita tanlovli ro'yxat (tovar / qarz / pul / kassa)
//    · «Qaysi hisobdan» (Naqd / Karta)
//    · «Usuli» (Naqd / Karta / Bank)
//    · Muddat
//
//  Bu soddalik QAYTIB kelmasin — bir kun kimdir «foydali» deb
//  maydonni qaytarsa, sinov aytadi. Hamkor qoldig'i bundan
//  o'zgarmaydi: u to'lovning o'zidan hisoblanadi (kassa yozuvi
//  endi tushmaydi, ikki marta sanash xatosi ham shu bilan yo'q).
//
//  Ishga tushirish: node tests/kassa-oddiy.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/kassa');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}
const izohsiz = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
const oq = (y) => izohsiz(readFileSync(join(APP, y), 'utf8'));

console.log('\n\x1b[1mCLARY — SODDA KIRIM / CHIQIM\x1b[0m\n');

// -------------------------------------------------------------
console.log('\x1b[1m1. Kartochkadagi tugmalar\x1b[0m');
{
  const b = oq('src/ekran/BoshEkran.tsx');
  tekshir('«+ Kirim» → oyna, oldim', /ochKirim=\{\(\) => ochTolov\(tanlangan\.id, 'oldim'\)\}/.test(b));
  tekshir('«− Chiqim» → O‘SHA oyna, berdim (tanlov ro‘yxatisiz)', /ochChiqim=\{\(\) => ochTolov\(tanlangan\.id, 'berdim'\)\}/.test(b));
  const app = oq('App.tsx');
  tekshir('App yo‘nalishni uzatadi', /ochTolov=\{\(klientId, yonalish\) => setTolovOyna\(\{ yonalish, klient: klientId \}\)\}/.test(app));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m2. Oynada ortiqcha maydon yo‘q\x1b[0m');
{
  const t = oq('src/ekran/TolovOynasi.tsx');
  tekshir('«Qaysi hisobdan» yo‘q', !/Qaysi hisobdan/.test(t));
  tekshir('«Usuli» (naqd/karta/bank) yo‘q', !/tr\('Usuli'\)/.test(t) && !/USULLAR/.test(t) && !/setUsuli/.test(t));
  tekshir('muddat yo‘q', !/MuddatMaydoni/.test(t) && !/setMuddat/.test(t));
  tekshir('hisob tanlash holati yo‘q', !/setHisobId/.test(t));
  tekshir('«Qaysi bitimga» faqat aniq bitimdan', /\{!!boshBitim && ochiqBitimlar\.length > 0 && \(/.test(t));
  tekshir('sarlavha tugma bilan bir xil: Kirim / Chiqim', /yonalish === 'oldim' \? tr\('Kirim'\) : tr\('Chiqim'\)/.test(t));
  tekshir('hisobsiz saqlanadi', /hisob_id: null,/.test(t));
  // «Hozir» kartochkadagi qoldiq bilan bir xil bo'lsin
  tekshir('«Hozir» qoldig‘ida yozuvlar ham bor', /hamkorQoldiq\(klientId, bitimlar, tolovlar, yozuvlar\)/.test(t));
}

// -------------------------------------------------------------
console.log('\n\x1b[1m3. Hisobsiz to‘lov kassaga tushmaydi\x1b[0m');
{
  const baza = oq('src/lib/baza.ts');
  const f = baza.slice(baza.indexOf('export async function tolovQosh'), baza.indexOf('await mahalliyQosh(\'tolovlar\''));
  tekshir('YangiTolov.hisob_id ixtiyoriy', /hisob_id\?: string \| null;/.test(baza));
  tekshir('hisob bo‘lmasa yozuv YARATILMAYDI', /const yozuvId = !t\.hisob_id \? null : await yozuvQosh\(/.test(f));
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
