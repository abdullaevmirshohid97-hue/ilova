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

// OQ VARIANT (20.09). Fon ham, karta ham sof oq: ular endi
// chegara bilan ajraladi, rang bilan emas. `tun` — sarlavha
// zolining rangi — ham oq, ya’ni tepadagi ko‘k chiziq yo‘qoldi.
export const YORUG: Ranglar = {
  fon: '#FFFFFF',
  karta: '#FFFFFF',
  karta2: '#FAFAFA',
  // Fon va karta bir xil bo‘lgani uchun chegara TO‘QROQ:
  // avvalgi ochiq kulrang bilan kartalar ko‘rinmay qolardi.
  chegara: '#E2E2E2',
  ajratgich: '#EFEFEF',

  matn: '#000000',
  matn2: '#3C3C3C',
  xira: '#8A8A8A',

  tun: '#FFFFFF',
  tunMatn: '#000000',
  tunXira: '#8A8A8A',

  kirim: '#3E8E68',
  kirimYumshoq: '#E9F3EE',
  chiqim: '#B9615A',
  chiqimYumshoq: '#F8EDEC',

  ogoh: '#B7791F',
  ogohYumshoq: '#FBF3E3',

  faol: '#000000',
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
