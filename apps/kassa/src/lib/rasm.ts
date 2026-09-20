// =============================================================
//  MIJOZ RASMI
//
//  Rasm SERVERDA saqlanadi (Supabase Storage, `kassa-rasm`):
//  telefon almashsa ham, ilova qayta o'rnatilsa ham joyida
//  qoladi. Qurilmada saqlash tez edi, lekin do'kondor telefonini
//  almashtirgan kuni yuzlab mijoz rasmi yo'qolardi.
//
//  YO'L: `<org_id>/<klient_id>.jpg`. Birinchi bo'lak org_id
//  bo'lgani uchun Storage siyosati uni to'g'ridan-to'g'ri
//  tekshiradi — bir tashkilot boshqasining rasmini ocholmaydi.
//
//  OMBOR OCHIQ EMAS: mijoz rasmi shaxsiy ma'lumot. Ko'rsatish
//  uchun imzolangan havola olinadi va u bir soatdan keyin o'ladi.
//
//  INTERNETSIZ ISHLAMAYDI va bu ataylab: rasmni navbatga qo'yish
//  uchun uni qurilmada nusxalab, keyin yuborish kerak bo'lardi —
//  daftarning o'zi uchun bu ortiqcha murakkablik. Mijoz rasmsiz
//  ham saqlanadi, rasm keyinroq qo'shiladi.
// =============================================================

import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { tr } from './til';

const OMBOR = 'kassa-rasm';

/** Yuklaydi va bazaga yoziladigan YO'LNI qaytaradi */
export async function rasmYukla(orgId: string, klientId: string, uri: string): Promise<string> {
  const bayt = await new File(uri).bytes();
  const yol = `${orgId}/${klientId}.jpg`;

  const { error } = await supabase.storage.from(OMBOR).upload(yol, bayt, {
    contentType: 'image/jpeg',
    // Mijoz rasmi almashtirilsa eskisi ustiga yoziladi: har
    // safar yangi fayl yasasak, ombor tashlandiq rasmlarga
    // to'lib ketardi va ularni hech kim tozalamasdi.
    upsert: true,
  });
  if (error) throw error;
  return yol;
}

/**
 * Ko'rsatish uchun imzolangan havola.
 *
 * Xato YUTILADI va null qaytadi: rasm ochilmasa ro'yxat harfli
 * doiracha bilan chiziladi. Butun ekranni yiqitish rasm uchun
 * juda qimmat.
 */
export async function rasmHavola(yol: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(OMBOR).createSignedUrl(yol, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function rasmOchir(yol: string): Promise<void> {
  await supabase.storage.from(OMBOR).remove([yol]);
}

/** Ism va familyadan bosh harflar — rasmsiz mijoz uchun */
export function boshHarflar(ism: string, familya?: string | null): string {
  const a = (ism ?? '').trim();
  const b = (familya ?? '').trim();
  const h = (x: string) => (x ? x[0].toUpperCase() : '');
  return (h(a) + h(b)) || tr('M')[0];
}
