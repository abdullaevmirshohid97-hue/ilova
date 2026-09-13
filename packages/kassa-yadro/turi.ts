// =============================================================
//  TIPLAR — baza jadvallarining aksi
//
//  Summalar bu yerda TIYINDA (butun son). Bazadan kelgan
//  `numeric(18,2)` qiymat `pul.tiyinga()` orqali o'giriladi.
// =============================================================

import type { Valyuta } from './pul';

export type HisobTuri = 'naqd' | 'bank' | 'karta' | 'boshqa';
export type YozuvTuri = 'kirim' | 'chiqim';
export type TolovUsuli = 'naqd' | 'karta' | 'otkazma';
export type KlientTuri = 'mijoz' | 'taminotchi';

export type Hisob = {
  id: string;
  nom: string;
  turi: HisobTuri;
  valyuta: Valyuta;
  /** Opening Balance — tiyinda */
  boshlangich: number;
  rang?: string | null;
  belgi?: string | null;
  tartib: number;
  faol: boolean;
  versiya: number;
  o_raqam?: number | null;
};

export type Turkum = {
  id: string;
  nom: string;
  turi: YozuvTuri;
  ota_id?: string | null;
  rang?: string | null;
  belgi?: string | null;
  tartib: number;
  faol: boolean;
  versiya: number;
  o_raqam?: number | null;
};

export type Klient = {
  id: string;
  ism: string;
  telefon?: string | null;
  turi: KlientTuri;
  rasm_path?: string | null;
  izoh?: string | null;
  faol: boolean;
  versiya: number;
  o_raqam?: number | null;
};

export type Yozuv = {
  id: string;
  hisob_id: string;
  turi: YozuvTuri;
  /** Tiyinda, HAR DOIM musbat — yo'nalishni `turi` beradi */
  summa: number;
  valyuta: Valyuta;
  kurs: number;
  turkum_id?: string | null;
  klient_id?: string | null;
  izoh?: string | null;
  /** Foydalanuvchi qo'ygan sana (ISO) */
  sana: string;
  tolov_usuli: TolovUsuli;
  /** Hisoblararo o'tkazma juftligi */
  kochirma_id?: string | null;
  bekor_at?: string | null;
  bekor_sabab?: string | null;
  versiya: number;
  o_raqam?: number | null;
  qurilma_id?: string | null;
  created_at?: string;
};

/** Sinxronizatsiya holati — ekranda belgisi ko'rinadi */
export type SinxHolat = 'sinxron' | 'navbatda' | 'oflayn' | 'ziddiyat';
