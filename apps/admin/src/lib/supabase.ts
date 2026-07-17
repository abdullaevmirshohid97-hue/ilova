import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('.env: VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY shart');
}

export const supabase = createClient(url, anonKey);

export function imageUrl(storagePath: string): string {
  return `${url}/storage/v1/object/public/product-images/${storagePath}`;
}

export function formatSum(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Number(n).toLocaleString('ru-RU')} so'm`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'Yangi', cls: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'Qabul qilindi', cls: 'bg-emerald-100 text-emerald-700' },
  picking: { label: "Yig'ilmoqda", cls: 'bg-blue-100 text-blue-700' },
  done: { label: 'Yopilgan', cls: 'bg-gray-100 text-gray-500' },
  cancelled: { label: 'Bekor', cls: 'bg-red-100 text-red-600' },
};
