import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// QORALAMA — tugallanmagan ish yo'qolmasin
//
// Muammo: sotuv ekranida savat to'ldirilgan, mijoz tanlangan — keyin
// boshqa modulga o'tilsa hammasi yo'qoladi. Sabab oddiy: panel modulni
// shart bilan chizadi (`bolim === 'sotuv' && <DoriSotuv />`), shart
// yolg'on bo'lgan zahoti React komponentni yo'q qiladi va uning ichidagi
// holat ham o'ladi. Tenant panelida yo'l almashganda ham shunday.
//
// NEGA KOMPONENTNI TIRIK QOLDIRMADIK: eng oson yo'l uni yashirib qo'yish
// bo'lardi (`display:none`), lekin u ikki narsani hal qilmaydi —
// F5 bosilsa baribir yo'qoladi, va ko'rilgan har modul obunalari bilan
// xotirada qolib ketadi.
//
// Shuning uchun yozilgan narsa sessionStorage'ga tushadi. Sessiya
// tanlangani ataylab: brauzer yopilsa qoralama ham ketadi — bir hafta
// oldingi yarim savat ochilib turishi chalkashlik.
// ============================================================================

/**
 * `useState` kabi ishlaydi, lekin qiymat sessiyada saqlanadi.
 *
 * `tozala()` — sotuv tugagach chaqiriladi, aks holda saqlangan savat
 * keyingi safar yana ochilib qolardi.
 *
 * `tiklandi` — qiymat xotiradan kelganini bildiradi. Ekranda buni
 * aytish kerak: savat o'zi to'lib turgani odamni chalkashtirmasin.
 */
export function useQoralama<T>(
  kalit: string,
  boshlangich: T,
): [T, (yangi: T | ((eski: T) => T)) => void, { tiklandi: boolean; tozala: () => void }] {
  const toliqKalit = 'qoralama.' + kalit;

  const [tiklandi, setTiklandi] = useState(false);
  const [qiymat, setQiymatXom] = useState<T>(() => {
    try {
      const xom = sessionStorage.getItem(toliqKalit);
      if (xom == null) return boshlangich;
      return JSON.parse(xom) as T;
    } catch {
      // Buzilgan yoki eski formatdagi qoralama butun ekranni
      // yiqitmasin — shunchaki e'tiborga olinmaydi
      return boshlangich;
    }
  });

  // Birinchi renderda "tiklandi" ni aniqlaymiz. useState ichida
  // setState chaqirib bo'lmaydi, shuning uchun effekt bilan.
  const birinchi = useRef(true);
  useEffect(() => {
    if (!birinchi.current) return;
    birinchi.current = false;
    try {
      setTiklandi(sessionStorage.getItem(toliqKalit) != null);
    } catch {
      /* shaxsiy oyna */
    }
  }, [toliqKalit]);

  const setQiymat = useCallback(
    (yangi: T | ((eski: T) => T)) => {
      setQiymatXom((eski) => {
        const natija = typeof yangi === 'function' ? (yangi as (e: T) => T)(eski) : yangi;
        try {
          sessionStorage.setItem(toliqKalit, JSON.stringify(natija));
        } catch {
          // Joy tugagan yoki xotira yopiq — ish to'xtamasin, faqat
          // qoralama saqlanmaydi
        }
        return natija;
      });
      setTiklandi(false);
    },
    [toliqKalit],
  );

  const tozala = useCallback(() => {
    try {
      sessionStorage.removeItem(toliqKalit);
    } catch {
      /* xotira yopiq */
    }
    setQiymatXom(boshlangich);
    setTiklandi(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toliqKalit]);

  return [qiymat, setQiymat, { tiklandi, tozala }];
}

/** Bir nechta qoralamani birdan o'chirish — sotuv tugagach */
export function qoralamalarniTozala(...kalitlar: string[]) {
  for (const k of kalitlar) {
    try {
      sessionStorage.removeItem('qoralama.' + k);
    } catch {
      /* xotira yopiq */
    }
  }
}
