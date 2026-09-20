// =============================================================
//  OGOHLANTIRISH — brauzerda ham ishlaydigan Alert
//
//  `react-native-web` da Alert BO'SH FUNKSIYA:
//
//      class Alert { static alert() {} }
//
//  Ya'ni brauzerda u hech narsa qilmaydi. Natijasi ikki xil va
//  ikkalasi ham yomon:
//
//   1. TASDIQ SO'RAYDIGAN joyda amal BUTUNLAY BAJARILMAYDI —
//      chunki ish `onPress` ichida turadi va u hech qachon
//      chaqirilmaydi. Valyuta tanlash aynan shunday yo'qolgan
//      edi: tugma bosiladi, hech narsa bo'lmaydi.
//   2. XATO KO'RSATADIGAN joyda xato JIM YO'QOLADI — odam
//      «ishlamadi» deb o'ylaydi, sabab esa hech qayerda yo'q.
//
//  Shuning uchun bu yerda platformaga qarab ikki yo'l:
//  telefonda haqiqiy Alert, brauzerda `confirm`/`alert`.
//
//  Tugmalar mosligi:
//    · 0-1 ta tugma  -> `alert`, keyin o'sha tugmaning onPress i
//    · 2+ ta tugma   -> `confirm`; «ha» bo'lsa amal tugmasi,
//                       «yo'q» bo'lsa `cancel` tugmasi ishlaydi
//
//  Uchtadan ortiq tugma brauzerda ko'rsatib bo'lmaydi — o'shanda
//  BIRINCHI amal tugmasi olinadi. Hozir ilovada uchtalik yo'q;
//  paydo bo'lsa, bu yerga alohida oyna kerak bo'ladi.
// =============================================================

import { Alert, Platform } from 'react-native';

export type OgohTugma = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type OgohSozlama = { cancelable?: boolean; onDismiss?: () => void };

function brauzerda(
  sarlavha: string,
  matn?: string,
  tugmalar?: OgohTugma[],
  sozlama?: OgohSozlama,
) {
  const yozuv = [sarlavha, matn].filter(Boolean).join('\n\n');
  const t = tugmalar ?? [];

  if (t.length <= 1) {
    // `alert` ba'zi ichki brauzerlarda bloklangan bo'lishi mumkin —
    // o'shanda ham amal bajarilishi kerak, xabar ko'rinmasa ham.
    try {
      globalThis.alert?.(yozuv);
    } catch {
      /* ko'rsatib bo'lmadi */
    }
    t[0]?.onPress?.();
    return;
  }

  const bekor = t.find((x) => x.style === 'cancel');
  const amal = t.find((x) => x !== bekor) ?? t[t.length - 1];

  let ha = true;
  try {
    ha = globalThis.confirm?.(yozuv) ?? true;
  } catch {
    /* so'ray olmadik — xavfsiz tomoni: hech narsa qilmaymiz */
    ha = false;
  }

  if (ha) {
    amal?.onPress?.();
    return;
  }

  // Brauzerda «bekor» va «oynani yopish» bir xil javob beradi.
  // Shuning uchun ikkalasi ham chaqirilmaydi — aks holda
  // cheklov oynasida `javob(false)` ikki marta ketardi.
  if (bekor) bekor.onPress?.();
  else sozlama?.onDismiss?.();
}

/**
 * `Alert.alert` o'rniga. Imzosi bir xil, shuning uchun mavjud
 * chaqiruvlarni o'zgartirmasdan almashtirish mumkin.
 */
export function ogohlantir(
  sarlavha: string,
  matn?: string,
  tugmalar?: OgohTugma[],
  sozlama?: OgohSozlama,
): void {
  if (Platform.OS === 'web') {
    brauzerda(sarlavha, matn, tugmalar, sozlama);
    return;
  }
  Alert.alert(sarlavha, matn, tugmalar, sozlama);
}

/** Eski kodga o'xshab tursin: `Ogoh.alert(...)`. */
export const Ogoh = { alert: ogohlantir };
