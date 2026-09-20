// =============================================================
//  RANG, O'LCHAM VA TUNGI REJIM
//
//  Palitra ataylab TINCH. Play Market'dagi hisob-kitob ilovalari
//  baland ko'k, chinni-qizil va o't-yashildan foydalanadi — ular
//  ekranda "qichqiradi" va kun bo'yi qaralganda ko'z charchaydi.
//
//  KIRIM KO‘K, CHIQIM QIZIL (21.09 qarori). Avval yashil va
//  terakota edi. Rang o‘zgardi, lekin qoida o‘zgarmadi: ular
//  to'yingan emas, bosiq olingan — oq fonda ham, tungi rejimda
//  ham ko‘zni qamashtirmaydi.
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

  // Ko‘k — pul KELDI. Sof «brend ko‘ki» emas, bir oz
  // kulrangga tortilgan: yorqinrog‘i oq fonda porlab, uzoq
  // qaralganda charchatardi.
  kirim: '#1F6FB2',
  kirimYumshoq: '#E8F1F9',
  // Qizil — pul KETDI. Ogohlantirish qizilidan bir pog‘ona
  // bosiqroq: ro‘yxatda o‘nlab qator qizil bo‘lishi mumkin va
  // ularning hammasi «xavf» bo‘lib ko‘rinmasligi kerak.
  chiqim: '#C23B32',
  chiqimYumshoq: '#FBECEA',

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
  // to'yingan variant olinadi. Ko'k ayniqsa nozik: to'q ko'k
  // qora fonda deyarli o'qilmaydi.
  kirim: '#6BA9E0',
  kirimYumshoq: '#132330',
  chiqim: '#E07B72',
  chiqimYumshoq: '#2C1A18',

  ogoh: '#D9A441',
  ogohYumshoq: '#2A2316',

  faol: '#ECF1F6',
  faolMatn: '#16202E',
};

// =============================================================
//  SHIFO — TIBBIYOT REJIMI
//
//  Sabab: oq variant (20.09) haddan tashqari yalang'och chiqdi.
//  `fon` ham, `karta` ham sof oq bo'lgani uchun kartalar fondan
//  QIYMAT bilan ajralmaydi — faqat ingichka chiziq bilan. Ekran
//  tekis va quruq ko'rinadi.
//
//  Shu yerda asosiy tuzatish: fon RANGLI, karta oq. Endi karta
//  fonning ustida turadi va chegara ikkilamchi bo'lib qoladi.
//  Bu eng arzon chuqurlik: soya ham, gradient ham kerak emas.
//
//  Ikkinchi farq — URG'U RANGI. Yorug' temada `faol` sof qora,
//  ya'ni ilovaning o'z rangi yo'q. Bu yerda u chuqur ko'k-yashil:
//  klinikaning tinch rangi, lekin to'yingan emas.
//
//  KIRIM KO'K, CHIQIM QIZIL qoidasi O'ZGARMAYDI (21.09 qarori) —
//  faqat ikkalasi shu palitraga moslab bir oz ko'k-yashilga
//  tortilgan.
// =============================================================
export const SHIFO: Ranglar = {
  // Yumshoq mint-kulrang. Oqdan sal to'qroq, lekin "rangli" deb
  // sezilmaydi — ko'z uni oq deb qabul qiladi, karta esa baribir
  // ajralib turadi.
  fon: '#F1F6F5',
  karta: '#FFFFFF',
  karta2: '#F8FBFA',
  // Karta endi qiymat bilan ajralgani uchun chegara YENGIL:
  // to'q chiziq bu yerda ortiqcha shovqin bo'lardi.
  chegara: '#DDE8E6',
  ajratgich: '#E8F0EE',

  // Sof qora emas: yashil ostki tonli deyarli qora. Rangli fonda
  // sof qora "kesilgan" bo'lib ko'rinadi.
  matn: '#0E1C1A',
  matn2: '#3A4E4B',
  xira: '#788C89',

  // Sarlavha zoli OQ: rangli tanadan ajralib, tepani tiniq
  // qiladi. Chuqurlik shundan ham chiqadi.
  tun: '#FFFFFF',
  tunMatn: '#0E1C1A',
  tunXira: '#788C89',

  kirim: '#176B8A',
  kirimYumshoq: '#E4F1F5',
  chiqim: '#BE4A42',
  chiqimYumshoq: '#FAECEA',

  ogoh: '#A97A1E',
  ogohYumshoq: '#FAF2E2',

  faol: '#0F6E63',
  faolMatn: '#FFFFFF',
};

export const SHIFO_TUN: Ranglar = {
  fon: '#0C1614',
  karta: '#132220',
  karta2: '#172926',
  chegara: '#22332F',
  ajratgich: '#1C2C29',

  matn: '#E8F1EF',
  matn2: '#B0C4C0',
  xira: '#7B908C',

  tun: '#08110F',
  tunMatn: '#E8F1EF',
  tunXira: '#7B908C',

  kirim: '#5FA9C4',
  kirimYumshoq: '#122630',
  chiqim: '#DE8A82',
  chiqimYumshoq: '#2A1A18',

  ogoh: '#D2A44A',
  ogohYumshoq: '#2A2417',

  faol: '#4EAE9E',
  faolMatn: '#0C1614',
};

export const O = {
  chekka: 16,
  radius: 14,
  radiusKichik: 10,
} as const;

export type TemaRejimi = 'tizim' | 'yorug' | 'qorongi' | 'shifo';

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
