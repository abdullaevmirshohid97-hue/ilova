// =============================================================
//  XATO KUZATUVI
//
//  Serverdagi xatoni biz ko'ramiz, TELEFONDAGINI yo'q. Ilova oq
//  ekran bo'lib qolsa, odam "ishlamayapti" deb yozadi, biz esa
//  nima bo'lganini topa olmaymiz — va u qaytib kelmaydi.
//
//  Bu yerda yig'iladigan narsa faqat XATONING O'ZI: matn, qayerda
//  bo'lgani, qurilma turi va ilova versiyasi. Ekran ochilishi,
//  bosilgan tugma, summa — hech biri yozilmaydi.
//
//  Ikki joyda saqlanadi:
//    · qurilmada (oxirgi 20 ta) — internetsiz ham yo'qolmasin va
//      foydalanuvchi o'zi ko'ra olsin;
//    · serverda (`kassa_xato_yoz`) — biz tuzatishimiz uchun.
//
//  Server yozuvi YIQILSA JIM O'TADI: xato haqida xabar berishning
//  o'zi yana bir xato chiqarib, ilovani halqaga tushirib qo'ymasin.
// =============================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import ilovaSozlama from '../../app.json';

const KALIT = 'kassa.xatolar';
const CHEGARA = 20;

/**
 * Ilova versiyasi — tuzatilgan xato qaytib kelganini shundan bilamiz.
 *
 * app.json dan O'QILADI, qo'lda yozilmaydi: aks holda versiya
 * ko'tarilganda bu yer eskirib qolar va xatolar noto'g'ri versiyaga
 * yozilardi.
 */
export const ILOVA_VERSIYA: string = ilovaSozlama.expo.version;

export type MahalliyXato = {
  joy: string;
  xabar: string;
  vaqt: string;
  yuborildi: boolean;
};

let jurnal: MahalliyXato[] = [];
let yuklandi = false;

// Bir xil xato sekundiga o'nlab marta kelishi mumkin (render halqasi).
// Oxirgi barmoq izini eslab, takrorini tashlab yuboramiz.
let oxirgiBarmoq = '';
let oxirgiVaqt = 0;

function qurilmaNomi(): string {
  if (Platform.OS === 'web') return 'web';
  return `${Platform.OS} ${String(Platform.Version)}`;
}

/** Stack'ning faqat birinchi 5 qatori — qolgani foydasiz shovqin */
function izQisqa(xato: unknown): string | null {
  const iz = xato instanceof Error ? xato.stack : null;
  if (!iz) return null;
  return iz.split('\n').slice(0, 5).join('\n');
}

function xabarMatni(xato: unknown): string {
  if (xato instanceof Error) return xato.message || xato.name;
  if (typeof xato === 'string') return xato;
  try {
    return JSON.stringify(xato).slice(0, 300);
  } catch {
    return String(xato);
  }
}

async function jurnalniYukla(): Promise<void> {
  if (yuklandi) return;
  yuklandi = true;
  try {
    const x = await AsyncStorage.getItem(KALIT);
    if (x) jurnal = JSON.parse(x) as MahalliyXato[];
  } catch {
    jurnal = [];
  }
}

async function jurnalniSaqla(): Promise<void> {
  try {
    await AsyncStorage.setItem(KALIT, JSON.stringify(jurnal.slice(0, CHEGARA)));
  } catch {
    /* shaxsiy oynada saqlash yo'q — zarari yo'q */
  }
}

/**
 * Xatoni yozib qo'yadi.
 *
 * @param joy  qayerda bo'lgani: "YozuvOynasi.yubor", "sinx.yubor"
 */
export async function xatoYoz(joy: string, xato: unknown): Promise<void> {
  const xabar = xabarMatni(xato);
  const barmoq = joy + '|' + xabar;
  const hozir = Date.now();

  // Bir xil xato 10 soniya ichida takrorlansa — bir marta hisoblanadi
  if (barmoq === oxirgiBarmoq && hozir - oxirgiVaqt < 10_000) return;
  oxirgiBarmoq = barmoq;
  oxirgiVaqt = hozir;

  await jurnalniYukla();
  jurnal.unshift({ joy, xabar, vaqt: new Date().toISOString(), yuborildi: false });
  jurnal = jurnal.slice(0, CHEGARA);
  await jurnalniSaqla();

  try {
    const { error } = await supabase.rpc('kassa_xato_yoz', {
      p_joy: joy,
      p_xabar: xabar,
      p_iz: izQisqa(xato),
      p_qurilma: qurilmaNomi(),
      p_versiya: ILOVA_VERSIYA,
    });
    if (!error && jurnal[0]) {
      jurnal[0].yuborildi = true;
      await jurnalniSaqla();
    }
  } catch {
    // Internet yo'q yoki funksiya hali qo'llanmagan — jurnal
    // qurilmada qoladi, keyingi safar yana urinamiz.
  }
}

/**
 * Yuborilmay qolgan xatolarni serverga uzatadi.
 *
 * Eng qimmat xatolar aynan internetsiz paytda bo'ladi (sinx, ombor,
 * navbat) — o'sha payt yuborib bo'lmaydi. Ular qurilmada turadi va
 * ilova keyingi ochilganda yuboriladi.
 */
async function yuborilmaganlarniYubor(): Promise<void> {
  await jurnalniYukla();
  const qolgan = jurnal.filter((x) => !x.yuborildi);
  if (qolgan.length === 0) return;

  let ozgardi = false;
  for (const x of qolgan) {
    try {
      const { error } = await supabase.rpc('kassa_xato_yoz', {
        p_joy: x.joy,
        p_xabar: x.xabar,
        p_iz: null,
        p_qurilma: qurilmaNomi(),
        p_versiya: ILOVA_VERSIYA,
      });
      if (error) break; // internet yo'q yoki huquq yo'q — keyin urinamiz
      x.yuborildi = true;
      ozgardi = true;
    } catch {
      break;
    }
  }
  if (ozgardi) await jurnalniSaqla();
}

/**
 * Tutilmagan xatolarni ushlaydi.
 *
 * React Native va brauzer bu ishni har xil qiladi, shuning uchun
 * ikkisi ham ochiq yozilgan — "ishlasa kerak" degan taxmin bilan
 * emas.
 */
export function xatolarniTut(): void {
  // Oldingi seansda internetsiz qolgan xatolar
  void yuborilmaganlarniYubor();

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (h) => {
      void xatoYoz('web.error', h.error ?? h.message);
    });
    window.addEventListener('unhandledrejection', (h) => {
      void xatoYoz('web.rejection', h.reason);
    });
    return;
  }

  // ErrorUtils — React Native'ning global tutqichi. Tiplarda yo'q,
  // shuning uchun qo'lda e'lon qilinadi.
  const G = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (x: unknown, halokat?: boolean) => void;
      setGlobalHandler: (f: (x: unknown, halokat?: boolean) => void) => void;
    };
  };
  if (!G.ErrorUtils) return;

  const oldingi = G.ErrorUtils.getGlobalHandler();
  G.ErrorUtils.setGlobalHandler((xato, halokat) => {
    void xatoYoz(halokat ? 'halokat' : 'tutilmagan', xato);
    // Standart tutqich ham ishlashi SHART: usiz xato ekranga
    // chiqmaydi va dasturchi tuzatishda ko'r bo'lib qoladi.
    oldingi(xato, halokat);
  });
}
