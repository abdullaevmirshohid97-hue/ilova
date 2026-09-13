import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('.env faylida EXPO_PUBLIC_SUPABASE_URL va EXPO_PUBLIC_SUPABASE_ANON_KEY bo`lishi shart');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Brauzerda ham bir xil ishlashi uchun: manzilda token qidirilmaydi
    detectSessionInUrl: false,
  },
});

const ikki = (n: number) => String(n).padStart(2, '0');

/** 13.09.2026 */
export function sanaMatn(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${ikki(x.getDate())}.${ikki(x.getMonth() + 1)}.${x.getFullYear()}`;
}

/** 13.09.2026 14:35 */
export function sanaVaqtMatn(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${sanaMatn(x)} ${ikki(x.getHours())}:${ikki(x.getMinutes())}`;
}

/**
 * Supabase xatosini ODAM O'QIYDIGAN gapga aylantiradi.
 *
 * Avvalgi ilovada har xato "noma'lum xatolik" bo'lib chiqardi va odam
 * parolini qayta-qayta terardi, sabab esa internet edi. Shuning uchun
 * tarmoq xatosi alohida ajratiladi.
 */
export function xatoMatn(e: unknown): string {
  const xabar = (e as { message?: string })?.message ?? String(e ?? '');
  if (/fetch|network|failed to|timeout|abort/i.test(xabar)) {
    return 'Internet bilan aloqa yo‘q. Ulanishni tekshiring.';
  }
  if (/invalid login|invalid credential/i.test(xabar)) return 'Email yoki parol noto‘g‘ri.';
  if (/already registered|already been registered/i.test(xabar)) return 'Bu email allaqachon ro‘yxatdan o‘tgan.';
  if (/email.*confirm|not confirmed/i.test(xabar)) return 'Email hali tasdiqlanmagan — pochtangizni tekshiring.';
  if (/password.*at least|weak/i.test(xabar)) return 'Parol kamida 6 ta belgi bo‘lishi kerak.';
  if (/HISOB_BOR/.test(xabar)) return 'Bu hisobda allaqachon biznes ochilgan.';
  if (/NOM_QISQA/.test(xabar)) return 'Biznes nomi kamida 2 ta belgi bo‘lsin.';
  if (/KIRISH_YOQ/.test(xabar)) return 'Avval tizimga kiring.';
  return xabar || 'Noma’lum xatolik';
}
