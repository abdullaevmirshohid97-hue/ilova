// =============================================================
//  INDEXEDDB OMBORI — brauzer
//
//  Web versiyada SQLite yo'q, IndexedDB esa har brauzerda bor.
//  Tuzilma SQLite adapteridagidek: qator = JSON, ustunlar alohida
//  emas (server yangi ustun qo'shsa ko'chirish kerak bo'lmasin).
//
//  MUHIM: IndexedDB shaxsiy oynada yoki sayt ma'lumoti o'chirilganda
//  ochilmasligi mumkin. Shunda ilova YIQILMASLIGI kerak — `tanla.ts`
//  xotira omboriga o'tadi.
// =============================================================

import type { Amal, Jadval, Ombor, Ziddiyat } from './turi';

const BAZA = 'kassa';
const VERSIYA = 1;

type Ombor2 = IDBDatabase;

function sorov<T>(s: IDBRequest<T>): Promise<T> {
  return new Promise((bajar, rad) => {
    s.onsuccess = () => bajar(s.result);
    s.onerror = () => rad(s.error);
  });
}

export function indexeddbOmbori(): Ombor {
  let db: Ombor2 | null = null;
  let tartib = Date.now();

  const baza = () => {
    if (!db) throw new Error('Ombor ochilmagan');
    return db;
  };

  function dokon(nom: string, yozish = false) {
    return baza().transaction(nom, yozish ? 'readwrite' : 'readonly').objectStore(nom);
  }

  return {
    async ochil() {
      db = await new Promise<Ombor2>((bajar, rad) => {
        const s = indexedDB.open(BAZA, VERSIYA);
        s.onupgradeneeded = () => {
          const d = s.result;
          if (!d.objectStoreNames.contains('qatorlar')) {
            // Kalit "jadval|id" — ikkalasi birga
            d.createObjectStore('qatorlar');
          }
          if (!d.objectStoreNames.contains('navbat')) {
            const n = d.createObjectStore('navbat', { keyPath: 'id' });
            n.createIndex('tartib', 'tartib');
          }
          if (!d.objectStoreNames.contains('ziddiyat')) d.createObjectStore('ziddiyat', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('sozlama')) d.createObjectStore('sozlama');
        };
        s.onsuccess = () => bajar(s.result);
        s.onerror = () => rad(s.error);
      });

      const navbat = await sorov(dokon('navbat').getAll());
      for (const a of navbat as { tartib?: number }[]) {
        if (a.tartib && a.tartib >= tartib) tartib = a.tartib + 1;
      }
    },

    async royxat<T>(jadval: Jadval) {
      const hammasi = await sorov(
        dokon('qatorlar').getAll(IDBKeyRange.bound(`${jadval}|`, `${jadval}|￿`)),
      );
      return hammasi as T[];
    },

    async saqla(jadval: Jadval, qatorlar: Record<string, unknown>[]) {
      if (!qatorlar.length) return;
      const t = baza().transaction('qatorlar', 'readwrite');
      const d = t.objectStore('qatorlar');
      for (const q of qatorlar) {
        const kalit = `${jadval}|${String(q.id)}`;
        const eski = await sorov(d.get(kalit));
        d.put({ ...(eski ?? {}), ...q }, kalit);
      }
      await new Promise<void>((bajar, rad) => {
        t.oncomplete = () => bajar();
        t.onerror = () => rad(t.error);
      });
    },

    async bitta<T>(jadval: Jadval, id: string) {
      const q = await sorov(dokon('qatorlar').get(`${jadval}|${id}`));
      return (q ?? null) as T | null;
    },

    async kursorOl() {
      const q = await sorov(dokon('sozlama').get('kursor'));
      return Number(q ?? 0) || 0;
    },

    async kursorQoy(kursor: number) {
      const hozir = await this.kursorOl();
      await sorov(dokon('sozlama', true).put(Math.max(hozir, kursor), 'kursor'));
    },

    async navbat() {
      const hammasi = (await sorov(dokon('navbat').getAll())) as (Amal & { tartib?: number })[];
      return hammasi
        .sort((a, b) => (a.tartib ?? 0) - (b.tartib ?? 0))
        .map(({ tartib: _t, ...amal }) => amal as Amal);
    },

    async navbatQosh(amal: Amal) {
      await sorov(dokon('navbat', true).put({ ...amal, tartib: tartib++ }));
    },

    async navbatYangila(amal: Amal) {
      const d = dokon('navbat', true);
      const eski = (await sorov(d.get(amal.id))) as { tartib?: number } | undefined;
      await sorov(d.put({ ...amal, tartib: eski?.tartib ?? tartib++ }));
    },

    async navbatOchir(amalId: string) {
      await sorov(dokon('navbat', true).delete(amalId));
    },

    async ziddiyatlar() {
      return (await sorov(dokon('ziddiyat').getAll())) as Ziddiyat[];
    },

    async ziddiyatQosh(z: Ziddiyat) {
      await sorov(dokon('ziddiyat', true).put(z));
    },

    async ziddiyatOchir(id: string) {
      await sorov(dokon('ziddiyat', true).delete(id));
    },

    async tozala() {
      for (const nom of ['qatorlar', 'navbat', 'ziddiyat', 'sozlama']) {
        await sorov(dokon(nom, true).clear());
      }
    },
  };
}
