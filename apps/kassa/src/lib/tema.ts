// =============================================================
//  RANG, O'LCHAM VA TUNGI REJIM — TELEGRAM RANGLARI
//
//  2026-09-27 QARORI: ilovaning ranglari Telegram messenjeri bilan
//  BIR XIL. Foydalanuvchi kun bo'yi Telegram'da o'tiradi — daftar
//  unga begona ilova emas, tanish ekran bo'lib ko'rinsin.
//
//  MANBA — Telegram Android'ning o'z kodi (DrKLO/Telegram, master):
//    kunduzgi → `ThemeColors.java` dagi `defaultColors`
//    tungi    → `assets/night.attheme`
//  Har rang yonida Telegram'dagi kaliti yozilgan. Xotiradan
//  taxmin qilinmagan: fayl yuklab olinib, imzoli ARGB son hex ga
//  o'girilgan. `tests/kassa-dizayn.mjs` shu qiymatlarni qotirib
//  tekshiradi — kimdir «biroz chiroyliroq» qilib o'zgartirsa,
//  sinov aytadi.
//
//  ATAYLAB QILINGAN BITTA CHETLANISH: kunduzgi `kirim`.
//  Telegram ko'ki oq fonda hech qayerda 4.5:1 ga yetmaydi
//  (`#229AF0` — 3.0, `#298ACF` — 3.7). Summa esa quyoshda, ko'chada
//  o'qiladi va noto'g'ri o'qilgan raqam pul demakdir. Shuning uchun
//  kirim — Telegram'ning `#298ACF` tusining o'zi, faqat 12% to'qroq
//  (`#2479B6`, 4.7:1). Rang oilasi o'sha, ko'z uni Telegram ko'ki deb
//  taniydi.
//
//  KIRIM KO'K, CHIQIM QIZIL (21.09 qarori) o'zgarmadi — Telegram'da
//  ham aynan shu ikki rang bor. Kirim/chiqim farqi FAQAT rangda
//  emas: har doim ishora ham bor (+ / −).
//
//  «SHIFO» REJIMI OLIB TASHLANDI: Telegram ranglari uning o'rnini
//  egalladi. Uning asosiy g'oyasi esa qoldi — karta fondan QIYMAT
//  bilan ajraladi (Telegram'da ham: kulrang fon, oq bo'limlar).
// =============================================================

import { createContext, useContext } from 'react';

export type Ranglar = {
  fon: string;
  karta: string;
  karta2: string;
  chegara: string;
  ajratgich: string;

  matn: string;
  matn2: string;
  xira: string;

  tun: string;
  tunMatn: string;
  tunXira: string;

  kirim: string;
  kirimYumshoq: string;
  chiqim: string;
  chiqimYumshoq: string;

  ogoh: string;
  ogohYumshoq: string;

  /** Tanlangan element (chip, tab) va asosiy tugma */
  faol: string;
  faolMatn: string;

  // ---------- OVERLAY: ATAYLAB TEMAGA BOG‘LIQ EMAS ----------
  //
  // Modal ortidagi qorayish va rasm ko‘rish oynasi HAR IKKI
  // temada to‘q bo‘lishi kerak: oq parda modalni ajratmaydi,
  // rasmni esa oq fonda ko‘rish uni buzadi.

  /** Modal ortidagi yengil qorayish */
  parda: string;
  /** Rasm/video ko‘rish oynasi — quyuqroq */
  pardaQuyuq: string;
  /** Parda USTIDAGI matn — har ikki temada oq */
  pardaMatn: string;
};

// =============================================================
//  KUNDUZGI — Telegram Android, standart tema
// =============================================================
export const YORUG: Ranglar = {
  fon: '#F1F1F3', //         windowBackgroundGray — kulrang fon
  karta: '#FFFFFF', //       windowBackgroundWhite — oq bo'lim
  karta2: '#F1F1F3', //      windowBackgroundGray — maydon ichi
  chegara: '#DBDBDB', //     windowBackgroundWhiteInputField
  ajratgich: '#D9D9D9', //   divider

  matn: '#1A1D21', //        DEFAULT_BLACK_TEXT
  matn2: '#75787A', //       chats_message
  xira: '#808384', //        windowBackgroundWhiteGrayText

  tun: '#FFFFFF', //         actionBarDefault
  tunMatn: '#1A1D21', //     actionBarDefaultTitle
  tunXira: '#79817E', //     actionBarDefaultSubtitle

  kirim: '#2479B6', //       TELEGRAM_COLOR_TEXT (#298ACF), 12% to'qroq — yuqoridagi izoh
  kirimYumshoq: '#E9F5FE', // TELEGRAM_COLOR ning 10% i oq ustida
  chiqim: '#CC2929', //      text_RedRegular
  chiqimYumshoq: '#FAECEC', // text_RedRegular ning 9% i oq ustida

  ogoh: '#AD601C', //        avatar_nameInMessageOrange (#D67722), matn uchun to'qroq
  ogohYumshoq: '#FFF4E5', // avatar_backgroundOrange ning 16% i

  faol: '#229AF0', //        TELEGRAM_COLOR — tugma, switch, belgi
  faolMatn: '#FFFFFF', //    featuredStickers_buttonText
  parda: '#00000080',
  pardaQuyuq: '#000000E6',
  pardaMatn: '#FFFFFF',
};

// =============================================================
//  TUNGI — Telegram Android, «Night» temasi
// =============================================================
export const QORONGI: Ranglar = {
  fon: '#000000', //         windowBackgroundGray
  karta: '#181819', //       windowBackgroundWhite
  karta2: '#1E1E1E', //      dialogBackground
  chegara: '#505050', //     windowBackgroundWhiteInputField
  ajratgich: '#000000', //   divider

  matn: '#FFFFFF', //        windowBackgroundWhiteBlackText
  matn2: '#828282', //       chats_message
  xira: '#7D7D7D', //        windowBackgroundWhiteHintText

  tun: '#232326', //         actionBarDefault
  tunMatn: '#FFFFFF', //     actionBarDefaultTitle
  tunXira: '#808082', //     actionBarDefaultSubtitle (#F2F2F2, 45%) sarlavha ustida

  kirim: '#64B5EF', //       windowBackgroundWhiteBlueText
  kirimYumshoq: '#212B33', // kirim ning 12% i karta ustida
  chiqim: '#EE686F', //      text_RedRegular
  chiqimYumshoq: '#322223', // chiqim ning 12% i karta ustida

  ogoh: '#FEBB5B', //        avatar_backgroundOrange
  ogohYumshoq: '#342C21', // ogoh ning 12% i karta ustida

  // Tungi temada Telegram tugma rangini O'ZGARTIRMAYDI:
  // `featuredStickers_addButton` night.attheme da yo'q, ya'ni
  // standart TELEGRAM_COLOR qoladi.
  faol: '#229AF0', //        featuredStickers_addButton (standart)
  faolMatn: '#FFFFFF', //    featuredStickers_buttonText
  parda: '#00000080',
  pardaQuyuq: '#000000E6',
  pardaMatn: '#FFFFFF',
};

export const O = {
  chekka: 16,
  radius: 14,
  radiusKichik: 10,
} as const;

export type TemaRejimi = 'tizim' | 'yorug' | 'qorongi';

export type TemaHolati = {
  C: Ranglar;
  rejim: TemaRejimi;
  qorongi: boolean;
  qoy: (r: TemaRejimi) => void;
};

export const TemaKontekst = createContext<TemaHolati>({
  C: YORUG,
  rejim: 'tizim',
  qorongi: false,
  qoy: () => {},
});

export function useTema(): TemaHolati {
  return useContext(TemaKontekst);
}

/** Eski kod uchun: rang kerak bo'lgan, lekin hook chaqirib bo'lmaydigan joylar */
export const C = YORUG;
