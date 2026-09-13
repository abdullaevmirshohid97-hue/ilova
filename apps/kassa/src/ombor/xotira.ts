// =============================================================
//  XOTIRA OMBORI
//
//  Ikki joyda kerak:
//   · SINOVDA — sinxronizatsiya dvigatelini haqiqiy telefon va
//     brauzersiz sinash uchun;
//   · ZAXIRA sifatida — agar qurilmada SQLite ham, IndexedDB ham
//     ochilmasa (shaxsiy oyna, buzilgan saqlash), ilova ishlashda
//     davom etadi, faqat qayta ochilganda ma'lumot qaytadan
//     serverdan yuklanadi.
//
//  Bu — eng sodda amalga oshirish, shuning uchun interfeys shu
//  yerda "qanday bo'lishi kerak"ligini ko'rsatadi.
// =============================================================

import type { Amal, Jadval, Ombor, Ziddiyat } from './turi';
import { JADVALLAR } from './turi';

export function xotiraOmbori(): Ombor {
  const jadvallar = new Map<Jadval, Map<string, Record<string, unknown>>>();
  for (const j of JADVALLAR) jadvallar.set(j, new Map());
  let kursor = 0;
  let navbat: Amal[] = [];
  let ziddiyatlar: Ziddiyat[] = [];

  const olish = (j: Jadval) => jadvallar.get(j)!;

  return {
    async ochil() {
      /* xotirada ochiladigan narsa yo'q */
    },

    async royxat<T>(jadval: Jadval) {
      return [...olish(jadval).values()] as T[];
    },

    async saqla(jadval: Jadval, qatorlar: Record<string, unknown>[]) {
      const m = olish(jadval);
      for (const q of qatorlar) {
        const id = String(q.id);
        // Ustiga yozamiz, lekin ESKI qatorni yo'qotmaymiz: server
        // faqat o'zgargan ustunlarni yuborsa, qolganlari saqlanadi.
        m.set(id, { ...(m.get(id) ?? {}), ...q });
      }
    },

    async bitta<T>(jadval: Jadval, id: string) {
      return (olish(jadval).get(id) ?? null) as T | null;
    },

    async kursorOl() {
      return kursor;
    },

    async kursorQoy(k: number) {
      // Kursor faqat OLDINGA yuradi: kechikib kelgan javob uni
      // orqaga surib, o'qilgan o'zgarishlarni qayta yuklatib
      // qo'ymasin.
      kursor = Math.max(kursor, k);
    },

    async navbat() {
      return [...navbat];
    },

    async navbatQosh(amal: Amal) {
      navbat.push(amal);
    },

    async navbatYangila(amal: Amal) {
      navbat = navbat.map((a) => (a.id === amal.id ? amal : a));
    },

    async navbatOchir(amalId: string) {
      navbat = navbat.filter((a) => a.id !== amalId);
    },

    async ziddiyatlar() {
      return [...ziddiyatlar];
    },

    async ziddiyatQosh(z: Ziddiyat) {
      ziddiyatlar.push(z);
    },

    async ziddiyatOchir(id: string) {
      ziddiyatlar = ziddiyatlar.filter((z) => z.id !== id);
    },

    async tozala() {
      for (const j of JADVALLAR) olish(j).clear();
      kursor = 0;
      navbat = [];
      ziddiyatlar = [];
    },
  };
}
