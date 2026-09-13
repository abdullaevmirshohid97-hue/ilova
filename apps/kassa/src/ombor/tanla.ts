// =============================================================
//  QAYSI OMBOR — platformaga qarab
//
//  Telefon/planshet → SQLite, brauzer → IndexedDB.
//
//  Ikkalasi ham OCHILMASLIGI mumkin: shaxsiy oyna, sayt ma'lumoti
//  o'chirilgan, disk to'la, eski Android WebView. Bunday holatda
//  ilova YIQILMAYDI — xotira omboriga o'tadi va ishlashda davom
//  etadi. Farqi shuki, qayta ochilganda ma'lumot serverdan
//  qaytadan yuklanadi va internetsiz kirilsa bo'sh ko'rinadi.
//  Buni foydalanuvchiga aytish kerak, jimgina yutib yuborilmaydi.
// =============================================================

import { Platform } from 'react-native';
import type { Ombor } from './turi';
import { xotiraOmbori } from './xotira';

export type OmborNatija = {
  ombor: Ombor;
  /** Haqiqiy saqlash ishlayaptimi — yo'q bo'lsa ekranda ogohlantiramiz */
  doimiy: boolean;
  sabab?: string;
};

export async function omborOch(): Promise<OmborNatija> {
  try {
    if (Platform.OS === 'web') {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB yo‘q');
      const { indexeddbOmbori } = await import('./indexeddb');
      const o = indexeddbOmbori();
      await o.ochil();
      return { ombor: o, doimiy: true };
    }

    const { sqliteOmbori } = await import('./sqlite');
    const o = sqliteOmbori();
    await o.ochil();
    return { ombor: o, doimiy: true };
  } catch (e) {
    const o = xotiraOmbori();
    await o.ochil();
    return {
      ombor: o,
      doimiy: false,
      sabab: (e as Error)?.message ?? String(e),
    };
  }
}
