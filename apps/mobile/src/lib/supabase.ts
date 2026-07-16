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
