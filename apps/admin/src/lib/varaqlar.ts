import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// SOTUV VARAQALARI — bir vaqtda bir nechta tugallanmagan sotuv
//
// Dorixonada operator navbatdagi mijozni kutib qolmasin: birinchisi
// qog'ozini qidirayotganda ikkinchisiniki terilaveradi. Shuning uchun
// bitta savat emas, bir nechta VARAQ.
//
// Har varaq to'liq mustaqil: o'z skladi, savati, mijozi va izohi.
// Varaq almashtirish hech narsani yo'qotmaydi.
//
// ---------------------------------------------------------------------------
// NEGA localStorage, sessionStorage EMAS
//
// `qoralama.ts` ataylab sessionStorage ishlatadi: bir hafta oldingi
// yarim savat ochilib turishi chalkashlik. Bu yerda tanlov boshqacha —
// beshta tugallanmagan sotuvni ilova yopilgani uchun yo'qotib bo'lmaydi.
// Chalkashlikdan MUDDAT bilan qutulamiz: 24 soatdan eski varaq
// o'qilmaydi. Ya'ni smena ichida hech narsa yo'qolmaydi, ertasiga
// kechagi savat chiqib kelmaydi.
//
// localStorage butun brauzerga umumiy — ikki oynada ochilsa ikkalasi
// bir xil varaqlarni ko'radi va oxirgi yozgani yutardi. `storage`
// hodisasiga obuna bo'lamiz: ikkinchi oyna o'zgarishni darrov oladi.
// ============================================================================

export const VARAQ_SONI = 5;

/** Qoralama umri. Undan eskisi o'qilmaydi — kechagi savat ochilmasin. */
export const VARAQ_MUDDATI = 24 * 60 * 60 * 1000;

export type Saqlangan<T> = {
  faol: number;
  /** null = bo'sh varaq */
  varaqlar: (T | null)[];
  /** har varaq oxirgi marta qachon tegilgan (ms) */
  vaqt: number[];
};

/**
 * Xotiradan kelgan narsani ISHONCHSIZ deb ko'rib tozalaydi.
 *
 * Alohida funksiya bo'lgani sinov uchun: muddat va buzilgan ma'lumot
 * mantiqini brauzersiz tekshirib bo'ladi.
 */
export function tozalabOqi<T>(xom: unknown, soni: number, hozir: number): Saqlangan<T> {
  const bosh: Saqlangan<T> = {
    faol: 0,
    varaqlar: Array(soni).fill(null),
    vaqt: Array(soni).fill(0),
  };
  if (!xom || typeof xom !== 'object') return bosh;

  const x = xom as Partial<Saqlangan<T>>;
  // Tuzilma umuman bizniki emas — ichidagi `faol` ham ishonchsiz.
  // Uni saqlab qolsak, operator sababsiz ikkinchi varaqda ochilardi.
  if (!Array.isArray(x.varaqlar)) return bosh;

  const varaqlar = x.varaqlar;
  const vaqt = Array.isArray(x.vaqt) ? x.vaqt : [];

  for (let i = 0; i < soni; i++) {
    const v = varaqlar[i];
    const t = Number(vaqt[i]) || 0;
    // Muddati o'tgan yoki vaqtsiz varaq tashlanadi. Kelajakdagi vaqt ham
    // ishonchsiz (soat o'zgargan): uni ham eski deb hisoblaymiz.
    if (v == null || t <= 0 || hozir - t > VARAQ_MUDDATI || t > hozir + VARAQ_MUDDATI) continue;
    bosh.varaqlar[i] = v as T;
    bosh.vaqt[i] = t;
  }

  const f = Number(x.faol);
  bosh.faol = Number.isInteger(f) && f >= 0 && f < soni ? f : 0;
  return bosh;
}

function oqi<T>(kalit: string, soni: number): Saqlangan<T> {
  try {
    const xom = localStorage.getItem(kalit);
    return tozalabOqi<T>(xom ? JSON.parse(xom) : null, soni, Date.now());
  } catch {
    // Buzilgan qoralama yoki yopiq xotira butun ekranni yiqitmasin
    return tozalabOqi<T>(null, soni, Date.now());
  }
}

/**
 * N ta mustaqil qoralama varaqasi.
 *
 * `joriy` hech qachon null emas: bo'sh varaqda `boshlangich` qaytadi —
 * ekran har joyda "bormi yo'qmi" deb tekshirib o'tirmasin.
 */
export function useVaraqlar<T>(kalit: string, boshlangich: T, soni = VARAQ_SONI) {
  const toliqKalit = 'qoralama.' + kalit;
  const [holat, setHolat] = useState<Saqlangan<T>>(() => oqi<T>(toliqKalit, soni));

  const saqla = useCallback(
    (h: Saqlangan<T>) => {
      try {
        localStorage.setItem(toliqKalit, JSON.stringify(h));
      } catch {
        // Joy tugadi yoki xotira yopiq — ish to'xtamasin, faqat
        // qoralama saqlanmaydi
      }
    },
    [toliqKalit],
  );

  // Boshqa oyna o'zgartirsa — biz ham ko'ramiz. Bo'lmasa ikki oyna
  // bir-birining ustiga yozib, oxirgisi yutardi.
  useEffect(() => {
    function tingla(e: StorageEvent) {
      if (e.key !== toliqKalit) return;
      try {
        setHolat(tozalabOqi<T>(e.newValue ? JSON.parse(e.newValue) : null, soni, Date.now()));
      } catch {
        /* boshqa oyna buzuq yozdi — e'tiborsiz */
      }
    }
    window.addEventListener('storage', tingla);
    return () => window.removeEventListener('storage', tingla);
  }, [toliqKalit, soni]);

  const yoz = useCallback(
    (yangi: T | ((eski: T) => T)) => {
      setHolat((h) => {
        const eski = h.varaqlar[h.faol] ?? boshlangich;
        const qiymat = typeof yangi === 'function' ? (yangi as (e: T) => T)(eski) : yangi;
        const varaqlar = [...h.varaqlar];
        const vaqt = [...h.vaqt];
        varaqlar[h.faol] = qiymat;
        vaqt[h.faol] = Date.now();
        const y = { ...h, varaqlar, vaqt };
        saqla(y);
        return y;
      });
    },
    [boshlangich, saqla],
  );

  const tanla = useCallback(
    (i: number) => {
      setHolat((h) => {
        if (i < 0 || i >= soni || i === h.faol) return h;
        const y = { ...h, faol: i };
        saqla(y);
        return y;
      });
    },
    [saqla, soni],
  );

  /** Varaqni bo'shatadi. Indeks berilmasa — joriysini. */
  const tozala = useCallback(
    (i?: number) => {
      setHolat((h) => {
        const n = i ?? h.faol;
        if (n < 0 || n >= soni) return h;
        const varaqlar = [...h.varaqlar];
        const vaqt = [...h.vaqt];
        varaqlar[n] = null;
        vaqt[n] = 0;
        const y = { ...h, varaqlar, vaqt };
        saqla(y);
        return y;
      });
    },
    [saqla, soni],
  );

  // Ochilganda nimadir tiklanganini bir marta aytamiz
  const birinchi = useRef(true);
  const [tiklandi, setTiklandi] = useState(false);
  useEffect(() => {
    if (!birinchi.current) return;
    birinchi.current = false;
    setTiklandi(holat.varaqlar.some((v) => v != null));
  }, [holat.varaqlar]);

  return {
    faol: holat.faol,
    varaqlar: holat.varaqlar,
    joriy: holat.varaqlar[holat.faol] ?? boshlangich,
    /** Varaqda ish boshlanganmi (bo'sh varaq null bo'lib turadi) */
    boshlangan: (i: number) => holat.varaqlar[i] != null,
    yoz,
    tanla,
    tozala,
    tiklandi,
    bekorQil: () => setTiklandi(false),
  };
}

/**
 * Eski bitta savatli qoralamani birinchi varaqqa ko'chiradi.
 *
 * Deploy aynan operator savat terib turganda tushishi mumkin. Ko'chirish
 * bo'lmasa o'sha savat yo'qolardi — bu esa xuddi shu ish hal qilmoqchi
 * bo'lgan muammoning o'zi. Bir marta ishlaydi: eski kalitlar o'chadi.
 */
export function eskiQoralamaniKochir<T>(
  kalit: string,
  eskiKalitlar: Record<keyof T & string, string>,
  boshlangich: T,
): void {
  const toliqKalit = 'qoralama.' + kalit;
  try {
    if (localStorage.getItem(toliqKalit)) return; // yangi format allaqachon bor

    const yigilgan: any = { ...boshlangich };
    let bormi = false;
    for (const [maydon, eski] of Object.entries(eskiKalitlar) as [string, string][]) {
      const xom = sessionStorage.getItem('qoralama.' + eski);
      if (xom == null) continue;
      yigilgan[maydon] = JSON.parse(xom);
      bormi = true;
      sessionStorage.removeItem('qoralama.' + eski);
    }
    if (!bormi) return;

    const soni = VARAQ_SONI;
    const holat: Saqlangan<T> = {
      faol: 0,
      varaqlar: Array(soni).fill(null),
      vaqt: Array(soni).fill(0),
    };
    holat.varaqlar[0] = yigilgan as T;
    holat.vaqt[0] = Date.now();
    localStorage.setItem(toliqKalit, JSON.stringify(holat));
  } catch {
    // Ko'chirish qo'shimcha qulaylik — u yiqilsa ekran baribir ochilsin
  }
}
