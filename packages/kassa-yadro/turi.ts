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
export type KlientTuri = 'mijoz' | 'taminotchi' | 'hamkor';

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
  /** Oldi-berdi qatlami: hamkor profili */
  telegram_id?: number | null;
  telegram_nom?: string | null;
  kompaniya?: string | null;
  stir?: string | null;
  manzil?: string | null;
  valyuta?: Valyuta | null;
  /** Storage dagi yo‘l: `<org_id>/<klient_id>.jpg`, URL emas */
  rasm_path?: string | null;
  familya?: string | null;
  kategoriya?: string | null;
  /** Jonli joylashuv — ikkalasi birga bo‘ladi yoki ikkalasi bo‘sh */
  lat?: number | null;
  lng?: number | null;
  /**
   * Qarz chegarasi TIYINDA. null = cheklov yo‘q.
   *
   * Ilova buni QAT’IY to‘smaydi, ogohlantiradi va tasdiqlatadi:
   * savdo o‘rtasida ilova to‘sib qo‘ysa, odam yozuvni umuman
   * yozmay qo‘yardi va daftar yolg‘on bo‘lardi.
   */
  cheklov?: number | null;
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
  /** Kelishilgan muddat (kun) — hamkorli yozuvda */
  muddat?: string | null;
  izoh?: string | null;
  /** Foydalanuvchi qo'ygan sana (ISO) */
  sana: string;
  tolov_usuli: TolovUsuli;
  /** Hisoblararo o'tkazma juftligi */
  kochirma_id?: string | null;
  /** Qaysi bitimdan chiqqani — oldi-berdi qatlami */
  bitim_id?: string | null;
  bekor_at?: string | null;
  bekor_sabab?: string | null;
  versiya: number;
  o_raqam?: number | null;
  qurilma_id?: string | null;
  created_at?: string;
};

// =============================================================
//  OLDI-BERDI: bitim va to‘lov
//
//  ISHORA QOIDASI (baza bilan AYNAN bir xil):
//    berdim -> +summa  (hamkor menga qarzdor)
//    oldim  -> -summa  (men hamkorga qarzdorman)
//
//  Ikkala jadvalda ham shu bitta qoida. Ikki xil qoida bo'lsa,
//  qoldiq ilovada va bazada boshqacha chiqardi — va buni faqat
//  mijoz sezardi.
// =============================================================

export type BitimYonalish = 'oldim' | 'berdim';
export type BitimNima = 'tovar' | 'qarz';
export type BitimHolat = 'kutilmoqda' | 'tasdiqlangan' | 'rad' | 'yopilgan' | 'bekor';
export type TolovUsuliB = 'naqd' | 'karta' | 'bank' | 'tovar';

export type Bitim = {
  id: string;
  /** HAMKORSIZ BITIM YO‘Q — daftar hamkor ismi bo‘yicha yuritiladi */
  klient_id: string;
  yonalish: BitimYonalish;
  nima: BitimNima;
  tovar_nom?: string | null;
  birlik?: string | null;
  /** Dona soni — kasr bo‘lishi mumkin (1000.5 metr) */
  miqdor?: number | null;
  /** Bir dona narxi, TIYINDA */
  narx?: number | null;
  /** Jami, TIYINDA va har doim musbat */
  summa: number;
  valyuta: Valyuta;
  kurs: number;
  /** ISO sana (kun) yoki null */
  muddat?: string | null;
  izoh?: string | null;
  sana: string;
  holat: BitimHolat;
  tasdiq_at?: string | null;
  tasdiq_kim?: number | null;
  bekor_sabab?: string | null;
  versiya: number;
  o_raqam?: number | null;
  qurilma_id?: string | null;
  created_at?: string;
};

/**
 * To'lov — bitimga tushadigan pul.
 *
 * `muddat` bitimnikidan BOSHQA narsa: bitim muddati butun
 * qarzniki, to'lov muddati esa o'sha kelishuvniki — «500
 * mingni oldim, qolganini 5-oktabrga».
 */
export type Tolov = {
  id: string;
  klient_id: string;
  /** Ixtiyoriy: «Tonirokka 500 ming berdim» — qaysi bitimga ekani aytilmaydi */
  bitim_id?: string | null;
  yonalish: BitimYonalish;
  summa: number;
  valyuta: Valyuta;
  kurs: number;
  usuli: TolovUsuliB;
  yozuv_id?: string | null;
  /** Kelishilgan muddat (kun). Bitim muddatidan alohida. */
  muddat?: string | null;
  izoh?: string | null;
  sana: string;
  holat: 'kutilmoqda' | 'tasdiqlangan' | 'rad' | 'bekor';
  tasdiq_at?: string | null;
  tasdiq_kim?: number | null;
  bekor_sabab?: string | null;
  versiya: number;
  o_raqam?: number | null;
  qurilma_id?: string | null;
  created_at?: string;
};

/** Sinxronizatsiya holati — ekranda belgisi ko'rinadi */
export type SinxHolat = 'sinxron' | 'navbatda' | 'oflayn' | 'ziddiyat';
