// =============================================================
//  SQLITE OMBORI — Android va iOS
//
//  Qatorlar JSON matn sifatida saqlanadi, har ustunga alohida
//  maydon ochilmaydi. Sabab: serverga yangi ustun qo'shilsa
//  (masalan `rasm_path`), telefondagi bazani KO'CHIRISH kerak
//  bo'lardi — va o'sha ko'chirish yiqilsa, foydalanuvchi
//  ma'lumotisiz qolardi. JSON'da yangi ustun shunchaki paydo
//  bo'ladi.
//
//  Hisob-kitob (balans, yig'indi) JS tomonda, xotirada bajariladi:
//  bir tenantda bir necha ming yozuv bo'ladi, bu esa telefon uchun
//  kichik yuk. Yuz minglab yozuv paydo bo'lsa — o'shanda SQL
//  yig'indilariga o'tamiz.
//
//  ULANISH BITTA — ILOVA UMRI DAVOMIDA (2026-09-27).
//
//  Ekranda chiqqan xato: «Call to function 'NativeDatabase.
//  prepareAsync' has been rejected → NullPointerException».
//
//  `expo-sqlite` (Android, `SQLiteModule.kt`) bir yo'ldagi bazani
//  KESHLAYDI: ikkinchi `openDatabaseAsync('kassa.db')` yangi
//  ulanish ochmaydi, o'sha native obyektni qaytaradi. Lekin
//  birinchi JS obyekti chiqindiga (GC) tushganda
//  `sharedObjectDidRelease()` native ulanishni YOPADI — keshdan
//  olmasdan va `isClosed` ni qo'ymasdan. Ikkinchi obyekt esa
//  yopilgan ulanishga so'rov yuboradi va NullPointerException
//  oladi. GC qachon ishlashi noma'lum, shuning uchun xato
//  tasodifiy ko'rinadi.
//
//  Ikkinchi ochilish qayerdan: `HolatProvider` qayta o'rnatilganda.
//  Qulf ekrani, biznes almashishi va «Qayta urinish» — uchalasi
//  ham uni olib tashlab qayta qo'yadi.
//
//  Yechim: ulanish modul darajasida BIR MARTA ochiladi va unga
//  kuchli havola saqlanadi — JS obyekti hech qachon chiqindiga
//  tushmaydi, ikkinchi ochilish esa umuman bo'lmaydi.
// =============================================================

import * as SQLite from 'expo-sqlite';
import type { Amal, Jadval, Ombor, Ziddiyat } from './turi';

const SXEMA = `
  pragma journal_mode = WAL;
  create table if not exists qatorlar (
    jadval text not null,
    id     text not null,
    malumot text not null,
    primary key (jadval, id)
  );
  create table if not exists navbat (
    id      text primary key,
    tartib  integer not null,
    malumot text not null
  );
  create table if not exists ziddiyat (
    id      text primary key,
    malumot text not null
  );
  create table if not exists sozlama (
    kalit  text primary key,
    qiymat text not null
  );
`;

/**
 * Ochilgan ulanishlar — nom bo'yicha. MODUL DARAJASIDA turadi:
 * bu yerdagi havola JS obyektini chiqindidan saqlaydi. Havola
 * yo'qolsa, GC native ulanishni yopadi (yuqoridagi izoh).
 *
 * Promise saqlanadi, tayyor ulanish emas: ikki joy bir vaqtda
 * `ochil()` chaqirsa, ikkalasi ham BITTA ochilishni kutadi.
 */
const ulanishlar = new Map<string, Promise<SQLite.SQLiteDatabase>>();

function ulan(nom: string): Promise<SQLite.SQLiteDatabase> {
  let u = ulanishlar.get(nom);
  if (!u) {
    u = (async () => {
      const db = await SQLite.openDatabaseAsync(nom);
      await db.execAsync(SXEMA);
      return db;
    })();
    ulanishlar.set(nom, u);
    // Ochilish YIQILSA keshda qolmasin: aks holda keyingi urinish
    // ham o'sha yiqilgan va'dani olib, hech qachon tiklanmasdi.
    u.catch(() => ulanishlar.delete(nom));
  }
  return u;
}

/**
 * Yozish tranzaksiyalari NAVBAT bilan. `withTransactionAsync`
 * ulanishni ajratmaydi: ikkitasi bir vaqtda boshlansa ikkinchisi
 * «cannot start a transaction within a transaction» bilan
 * yiqiladi. Sinx `saqla()` qilib turganda odam yozuv qo'shsa
 * aynan shunday bo'ladi. Modul darajasida — chunki ulanish ham
 * modul darajasida va hamma `sqliteOmbori()` nusxalari bitta.
 */
let yozishNavbati: Promise<unknown> = Promise.resolve();

function navbatda<T>(ish: () => Promise<T>): Promise<T> {
  // `then(ish, ish)` — ikkinchi `ish` ATAYLAB: oldingi tranzaksiya
  // yiqilgan bo'lsa ham keyingisi ishlaydi, ya'ni navbat xatoda
  // UZILMAYDI. Xato esa o'z chaqiruvchisiga qaytadi.
  const natija = yozishNavbati.then(ish, ish);
  yozishNavbati = natija;
  return natija;
}

// Navbat tartibi SAQLANISHI kerak: "hisob qo'shish" undan keyingi
// "yozuv qo'shish"dan oldin ketsin. Shuning uchun o'suvchi raqam.
// Modul darajasida: ulanish bitta, demak hisoblagich ham bitta
// bo'lishi kerak — aks holda qayta o'rnatilgan `HolatProvider`
// eskisi bilan bir xil raqam berib, tartibni buzardi.
let tartib = Date.now();

export function sqliteOmbori(nom = 'kassa.db'): Ombor {
  let db: SQLite.SQLiteDatabase | null = null;

  const baza = () => {
    if (!db) throw new Error('Ombor ochilmagan');
    return db;
  };

  return {
    async ochil() {
      db = await ulan(nom);
      const oxirgi = await db.getFirstAsync<{ t: number }>('select max(tartib) as t from navbat');
      if (oxirgi?.t) tartib = Math.max(tartib, oxirgi.t + 1);
    },

    async royxat<T>(jadval: Jadval) {
      const qatorlar = await baza().getAllAsync<{ malumot: string }>(
        'select malumot from qatorlar where jadval = ?',
        jadval,
      );
      return qatorlar.map((q) => JSON.parse(q.malumot)) as T[];
    },

    async saqla(jadval: Jadval, qatorlar: Record<string, unknown>[]) {
      if (!qatorlar.length) return;
      await navbatda(() => baza().withTransactionAsync(async () => {
        for (const q of qatorlar) {
          const id = String(q.id);
          // Eski qatorni yo'qotmaymiz: server faqat o'zgargan
          // maydonlarni yuborsa, qolganlari joyida qoladi.
          const eski = await baza().getFirstAsync<{ malumot: string }>(
            'select malumot from qatorlar where jadval = ? and id = ?',
            jadval,
            id,
          );
          const yangi = { ...(eski ? JSON.parse(eski.malumot) : {}), ...q };
          await baza().runAsync(
            'insert into qatorlar (jadval, id, malumot) values (?, ?, ?) ' +
              'on conflict (jadval, id) do update set malumot = excluded.malumot',
            jadval,
            id,
            JSON.stringify(yangi),
          );
        }
      }));
    },

    async bitta<T>(jadval: Jadval, id: string) {
      const q = await baza().getFirstAsync<{ malumot: string }>(
        'select malumot from qatorlar where jadval = ? and id = ?',
        jadval,
        id,
      );
      return q ? (JSON.parse(q.malumot) as T) : null;
    },

    async kursorOl() {
      const q = await baza().getFirstAsync<{ qiymat: string }>(
        "select qiymat from sozlama where kalit = 'kursor'",
      );
      return Number(q?.qiymat ?? 0) || 0;
    },

    async kursorQoy(kursor: number) {
      // Faqat oldinga: kechikib kelgan javob kursorni orqaga surib,
      // o'qilgan o'zgarishlarni qayta yuklatib qo'ymasin.
      const hozir = await this.kursorOl();
      const yangi = Math.max(hozir, kursor);
      await baza().runAsync(
        "insert into sozlama (kalit, qiymat) values ('kursor', ?) " +
          'on conflict (kalit) do update set qiymat = excluded.qiymat',
        String(yangi),
      );
    },

    async navbat() {
      const qatorlar = await baza().getAllAsync<{ malumot: string }>(
        'select malumot from navbat order by tartib',
      );
      return qatorlar.map((q) => JSON.parse(q.malumot) as Amal);
    },

    async navbatQosh(amal: Amal) {
      await baza().runAsync(
        'insert into navbat (id, tartib, malumot) values (?, ?, ?)',
        amal.id,
        tartib++,
        JSON.stringify(amal),
      );
    },

    async navbatYangila(amal: Amal) {
      await baza().runAsync('update navbat set malumot = ? where id = ?', JSON.stringify(amal), amal.id);
    },

    async navbatOchir(amalId: string) {
      await baza().runAsync('delete from navbat where id = ?', amalId);
    },

    async ziddiyatlar() {
      const qatorlar = await baza().getAllAsync<{ malumot: string }>('select malumot from ziddiyat');
      return qatorlar.map((q) => JSON.parse(q.malumot) as Ziddiyat);
    },

    async ziddiyatQosh(z: Ziddiyat) {
      await baza().runAsync(
        'insert into ziddiyat (id, malumot) values (?, ?) ' +
          'on conflict (id) do update set malumot = excluded.malumot',
        z.id,
        JSON.stringify(z),
      );
    },

    async ziddiyatOchir(id: string) {
      await baza().runAsync('delete from ziddiyat where id = ?', id);
    },

    async tozala() {
      await baza().execAsync(
        'delete from qatorlar; delete from navbat; delete from ziddiyat; delete from sozlama;',
      );
    },
  };
}
