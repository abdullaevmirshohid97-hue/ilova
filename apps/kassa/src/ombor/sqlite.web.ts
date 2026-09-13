// =============================================================
//  SQLITE — BRAUZER UCHUN QO'G'IRCHOQ
//
//  Web versiyada IndexedDB ishlatiladi (`indexeddb.ts`), SQLite esa
//  kerak emas. Lekin Metro `tanla.ts` dagi importni HAR IKKI platforma
//  uchun ham yechishga urinadi va `expo-sqlite` ning web varianti
//  `wa-sqlite.wasm` faylini so'raydi — u esa Metro sozlamasida yo'q,
//  natijada butun web build yiqilardi.
//
//  Shuning uchun bu yerda bo'sh nusxa turadi: brauzerda u hech qachon
//  chaqirilmaydi (`tanla.ts` avval `Platform.OS` ni tekshiradi).
// =============================================================

import type { Ombor } from './turi';

export function sqliteOmbori(): Ombor {
  throw new Error('SQLite brauzerda ishlatilmaydi — IndexedDB bor');
}
