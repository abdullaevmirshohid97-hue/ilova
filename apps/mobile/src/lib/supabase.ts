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
    detectSessionInUrl: false,
  },
});

// Telefon raqamdan ichki login-email yasaymiz (SMS provayder shart emas).
// Admin mijozni shu format bilan yaratadi: 998901112233@mijoz.ilova
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@mijoz.ilova`;
}

// Storage'dagi mahsulot rasmining to'liq URL manzili
export function imageUrl(storagePath: string): string {
  return `${url}/storage/v1/object/public/product-images/${storagePath}`;
}

// Narx formatlash lib/valyuta.ts da — bitta manba. Bu yerda faqat qayta
// eksport: ekranlar avvalgidek '../lib/supabase' dan import qilaveradi.
// Ikki joyda saqlansa biri o'zgarganda ikkinchisi eskirib qolardi.
export { formatNarx, formatSum, formatUsd, formatQty, son, kasrXonasi, somdan } from './valyuta';
export type { Valyuta } from './valyuta';

const ikki = (n: number) => String(n).padStart(2, '0');

/** 20.08.2026 — o'zbek va rus tilida format bir xil, shuning uchun til kerak emas */
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${ikki(x.getDate())}.${ikki(x.getMonth() + 1)}.${x.getFullYear()}`;
}

/** 20.08.2026 14:35 */
export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${formatDate(x)} ${ikki(x.getHours())}:${ikki(x.getMinutes())}`;
}
