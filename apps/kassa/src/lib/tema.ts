// =============================================================
//  RANG, O'LCHAM VA TUNGI REJIM
//
//  Palitra ataylab TINCH. Play Market'dagi hisob-kitob ilovalari
//  baland ko'k, chinni-qizil va o't-yashildan foydalanadi — ular
//  ekranda "qichqiradi" va kun bo'yi qaralganda ko'z charchaydi.
//  Yashil va terakota logotipdagi ranglarning aynan o'zi.
//
//  Kirim/chiqim farqi FAQAT rangda emas: har doim ishora ham bor
//  (+ / −). Rang ajratmaydigan odam ham o'qiy olishi kerak.
//
//  Tungi rejim shart: daftar ko'pincha kechqurun, do'kon yopilgandan
//  keyin yuritiladi.
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

  /** Tanlangan element (chip, tab) */
  faol: string;
  faolMatn: string;
};

export const YORUG: Ranglar = {
  fon: '#F4F6F8',
  karta: '#FFFFFF',
  karta2: '#FAFBFC',
  chegara: '#E4E9EF',
  ajratgich: '#EFF2F6',

  matn: '#16202E',
  matn2: '#46556A',
  xira: '#8A97A8',

  tun: '#16202E',
  tunMatn: '#F2F4F7',
  tunXira: '#8A97A8',

  kirim: '#3E8E68',
  kirimYumshoq: '#E9F3EE',
  chiqim: '#B9615A',
  chiqimYumshoq: '#F8EDEC',

  ogoh: '#B7791F',
  ogohYumshoq: '#FBF3E3',

  faol: '#16202E',
  faolMatn: '#FFFFFF',
};

export const QORONGI: Ranglar = {
  // Sof qora emas: OLED'da kontrast juda keskin bo'lib, oq matn
  // "qaltiraydi". Ko'k-kulrang fon yumshoqroq.
  fon: '#0F1720',
  karta: '#16202E',
  karta2: '#1B2736',
  chegara: '#24323F',
  ajratgich: '#1E2A38',

  matn: '#ECF1F6',
  matn2: '#B3C0CE',
  xira: '#7C8CA1',

  tun: '#0B121A',
  tunMatn: '#ECF1F6',
  tunXira: '#7C8CA1',

  // Qorong'ida to'yingan rang porlab ketadi — ochroq va kamroq
  // to'yingan variant olinadi.
  kirim: '#5CAC85',
  kirimYumshoq: '#172A22',
  chiqim: '#D08078',
  chiqimYumshoq: '#2B1E1D',

  ogoh: '#D9A441',
  ogohYumshoq: '#2A2316',

  faol: '#ECF1F6',
  faolMatn: '#16202E',
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
