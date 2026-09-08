import { imperRejim, KIRISH_HASH, supabase } from './supabase';

// ============================================================================
// FAVQULODDA KIRISH — super admin obunachi hisobiga kiradi
//
// NEGA KERAK: obunachi qo'ng'iroq qiladi — «parolni unutdim», «bu yer
// nega ishlamayapti». Super admin uning ekranini ko'ra olmasdi va
// telefonda tushuntirish ko'pincha noto'g'ri tashxis bilan tugardi.
//
// PAROL ISHLATILMAYDI. Supabase parolni bcrypt hash qilib saqlaydi —
// ochib bo'lmaydi va bu to'g'ri. Chekka funksiya bir martalik token
// beradi, obunachining paroli o'zgarmaydi va oshkor bo'lmaydi.
//
// ---------------------------------------------------------------------------
// TOKEN QANDAY O'TADI
//
// Super admin konsoli (4020.yukchibolla.com) va tenant paneli
// (admin.yukchibolla.com) — IKKI XIL manzil, ya'ni ikki xil brauzer
// xotirasi. Shuning uchun token localStorage orqali uzatilmaydi, u
// YANGI TAB manzilining `#kirish=` qismida ketadi.
//
// URL'ning `#` qismi serverga YUBORILMAYDI (Supabase'ning o'z magic
// link'i ham shunday ishlaydi) va tab ochilishi bilan darhol
// tozalanadi — brauzer tarixida qolmasin.
// ============================================================================

export type ImperMalumot = {
  /** Kimning huquqi bilan kirilgan */
  nom: string;
  rol: string;
  /** Qaysi hisob ustiga bosilgan — u har doim ham nishon emas */
  eshik_nom: string | null;
  eshik_rol: string | null;
  org: string;
  rejim: 'ozi' | 'admin';
  sabab: string;
};

type Taklif = ImperMalumot & { token_hash: string; tur: string };

const MALUMOT_KEY = 'ilova.imper.malumot';

// ---------- base64: kirillcha va o'zbekcha harflar buzilmasin ----------
function yoz(o: unknown): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));
}
function oqi<T>(s: string): T | null {
  try {
    const bayt = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bayt)) as T;
  } catch {
    return null;
  }
}

// ---------- modul yuklanishida: hash'ni olib, darhol tozalash ----------
// Tozalash SHART: aks holda bir martalik token brauzer tarixida qolardi.
const taklif: Taklif | null = (() => {
  try {
    if (typeof location === 'undefined') return null;
    if (!location.hash.startsWith(KIRISH_HASH)) return null;
    const xom = location.hash.slice(KIRISH_HASH.length);
    history.replaceState(null, '', location.pathname + location.search);
    return oqi<Taklif>(decodeURIComponent(xom));
  } catch {
    return null;
  }
})();

/** Shu tab impersonatsiyadami */
export const imperda = imperRejim;

/** Token kelgan, lekin hali ishlatilmagan — App kirishni kutishi kerak */
export function kirishKutilyaptimi(): boolean {
  return taklif !== null;
}

/** Banner uchun ma'lumot. F5 bosilsa ham qoladi. */
export function imperMalumot(): ImperMalumot | null {
  if (!imperRejim) return null;
  try {
    const xom = sessionStorage.getItem(MALUMOT_KEY);
    return xom ? (JSON.parse(xom) as ImperMalumot) : null;
  } catch {
    return null;
  }
}

/**
 * Tokenni sessiyaga aylantiradi.
 *
 * `verifyOtp` sessiyani AYNAN shu klientga yozadi — klient esa
 * `sessionStorage` bilan yaratilgan (lib/supabase.ts). Ya'ni super
 * adminning o'z sessiyasi tegilmaydi.
 */
export async function imperKirish(): Promise<string | null> {
  if (!taklif) return 'Kirish ma’lumoti topilmadi';
  const { error } = await supabase.auth.verifyOtp({
    token_hash: taklif.token_hash,
    // Tur serverdan keladi: supabase-js versiyalari `magiclink` va
    // `email` ni har xil qabul qiladi
    type: (taklif.tur as 'magiclink') ?? 'magiclink',
  });
  if (error) return error.message;

  const m: ImperMalumot = {
    nom: taklif.nom,
    rol: taklif.rol,
    eshik_nom: taklif.eshik_nom,
    eshik_rol: taklif.eshik_rol,
    org: taklif.org,
    rejim: taklif.rejim,
    sabab: taklif.sabab,
  };
  try {
    sessionStorage.setItem(MALUMOT_KEY, JSON.stringify(m));
  } catch {
    // Banner ma'lumoti saqlanmasa ham kirish ishlaydi — lenta
    // umumiy matn bilan chiqadi
  }
  return null;
}

/** Impersonatsiyadan chiqish: sessiya o'chadi, tab yopiladi */
export async function imperChiqish(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    /* sessiya allaqachon yo'q bo'lsa ham davom etamiz */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* yopiq xotira */
  }
  // Tabni o'zimiz ochganmiz, shuning uchun yopish odatda ishlaydi.
  // Ishlamasa - bo'sh ekran o'rniga login sahifasi ochilsin.
  window.close();
  location.replace(location.origin);
}

// ---------------------------------------------------------------------------
// SUPER ADMIN KONSOLI TOMONI
// ---------------------------------------------------------------------------

const SUPER_HOST = '4020.yukchibolla.com';
const TENANT_HOST = 'admin.yukchibolla.com';

/**
 * Impersonatsiya tabini ochadi.
 *
 * `window.open` `await` dan OLDIN chaqirilishi kerak edi, lekin bu yerda
 * token allaqachon qo'lda: chaqiruvchi uni oldin oladi. Shunga qaramay
 * oyna bloklanishi mumkin — shuning uchun natija qaytariladi va ekran
 * «oyna bloklandi» deb ayta oladi.
 */
export function imperTabOch(t: {
  token_hash: string;
  tur: string;
  nom: string;
  rol: string;
  eshik_nom: string | null;
  eshik_rol: string | null;
  org: string;
  rejim: 'ozi' | 'admin';
  sabab: string;
}): boolean {
  const manzil =
    location.hostname === SUPER_HOST ? `https://${TENANT_HOST}` : location.origin;
  const w = window.open(
    `${manzil}/${KIRISH_HASH}${encodeURIComponent(yoz(t))}`,
    '_blank',
    'noopener,noreferrer',
  );
  return !!w;
}
