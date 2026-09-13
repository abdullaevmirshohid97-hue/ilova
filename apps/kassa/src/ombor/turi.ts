// =============================================================
//  MAHALLIY OMBOR — interfeys
//
//  Ilova ma'lumotni AVVAL shu yerga yozadi, keyin serverga yuboradi.
//  Shuning uchun ekran internetni kutmaydi: yozuv darhol ko'rinadi.
//
//  Interfeys ataylab kichik: har platforma uchun alohida amalga
//  oshirish yoziladi (telefon — SQLite, brauzer — IndexedDB, sinov —
//  xotira) va ularning har birida nechta usul bo'lsa, shuncha xato
//  joyi bor.
// =============================================================

export type Jadval = 'hisoblar' | 'turkumlar' | 'klientlar' | 'yozuvlar';

export const JADVALLAR: Jadval[] = ['hisoblar', 'turkumlar', 'klientlar', 'yozuvlar'];

/** Bazadagi jadval nomi — mahalliy nom qisqa, serverniki prefiksli */
export const BAZA_NOMI: Record<Jadval, string> = {
  hisoblar: 'kassa_hisoblar',
  turkumlar: 'kassa_turkumlar',
  klientlar: 'kassa_klientlar',
  yozuvlar: 'kassa_yozuvlar',
};

export type AmalTuri = 'qosh' | 'tahrir';

/**
 * Navbatdagi amal — serverga yuborilishi kerak bo'lgan o'zgarish.
 *
 * `yozuv_id` mijozda yaratiladi (uuid). Shuning uchun bir amal ikki
 * marta yuborilsa ham dubl bo'lmaydi: server uni id bo'yicha taniydi.
 */
export type Amal = {
  /** Amalning o'z id'si — navbatdan o'chirish uchun */
  id: string;
  tur: AmalTuri;
  jadval: Jadval;
  yozuv_id: string;
  /** Serverga yuboriladigan maydonlar */
  qiymat: Record<string, unknown>;
  /** `tahrir` uchun: mijoz ko'rgan versiya. Server mos kelmasa rad etadi */
  versiya?: number;
  urinish: number;
  oxirgi_xato?: string | null;
  yaratilgan: string;
};

/**
 * Ziddiyat — yozuv boshqa qurilmada o'zgargan.
 *
 * Jimgina bosib o'tilmaydi: foydalanuvchi nima qo'llanmaganini
 * ko'rishi kerak. Pul masalasida "oxirgi yozgan yutadi" — yo'qolgan
 * ishonch degani.
 */
export type Ziddiyat = {
  id: string;
  jadval: Jadval;
  yozuv_id: string;
  sabab: string;
  vaqt: string;
};

export interface Ombor {
  ochil(): Promise<void>;

  royxat<T = Record<string, unknown>>(jadval: Jadval): Promise<T[]>;
  /** id bo'yicha ustiga yozadi (upsert) */
  saqla(jadval: Jadval, qatorlar: Record<string, unknown>[]): Promise<void>;
  bitta<T = Record<string, unknown>>(jadval: Jadval, id: string): Promise<T | null>;

  kursorOl(): Promise<number>;
  kursorQoy(kursor: number): Promise<void>;

  navbat(): Promise<Amal[]>;
  navbatQosh(amal: Amal): Promise<void>;
  navbatYangila(amal: Amal): Promise<void>;
  navbatOchir(amalId: string): Promise<void>;

  ziddiyatlar(): Promise<Ziddiyat[]>;
  ziddiyatQosh(z: Ziddiyat): Promise<void>;
  ziddiyatOchir(id: string): Promise<void>;

  /** Chiqishda: boshqa odam kirsa, oldingisining ma'lumoti qolmasin */
  tozala(): Promise<void>;
}

/** Serverga yuborish va olish — sinxronizatsiya dvigateli shu orqali ishlaydi */
export interface Server {
  ozgarishlar(kursor: number): Promise<{
    kursor: number;
    yana: boolean;
    hisoblar: Record<string, unknown>[];
    turkumlar: Record<string, unknown>[];
    klientlar: Record<string, unknown>[];
    yozuvlar: Record<string, unknown>[];
  }>;
  yubor(amal: Amal): Promise<{ holat: 'ok' | 'ziddiyat' | 'rad'; sabab?: string }>;
  kursorSaqla(kursor: number): Promise<void>;
}

export type SinxHolat = 'sinxron' | 'navbatda' | 'oflayn' | 'ziddiyat';
