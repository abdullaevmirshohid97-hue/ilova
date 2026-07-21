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

export const LEDGER_KIND_LABEL: Record<string, string> = {
  order_debt: '📦 Buyurtma (qarz)',
  payment: "💵 To'lov",
  discount: '🎁 Chegirma',
  adjustment: '✏️ Tuzatish',
  cancel_reversal: '↩️ Bekor qilindi',
};

export function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p + '#' + Math.floor(Math.random() * 90 + 10);
}

// Katalog rasmini brauzerda (canvas) kichraytiradi — sekin internetda mobil
// katalog og'ir asl faylni emas, shu kichik nusxani yuklaydi.
export async function resizeImage(file: File, maxWidth: number, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context yaratib bo\'lmadi');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Rasmni siqib bo'lmadi"))),
      'image/jpeg',
      quality
    );
  });
}
