// =============================================================
//  BITIMNI TELEGRAM ORQALI TASDIQLATISH
//
//  Hamkorda ilova yo'q va bo'lmaydi ham: u bozordagi odam, hech
//  qachon ro'yxatdan o'tmaydi. Shuning uchun tasdiq BIR MARTALIK
//  HAVOLA orqali ishlaydi — siz havolani istalgan yo'l bilan
//  yuborasiz, u bosadi, bot kartochkani ko'rsatadi.
//
//  BU AMAL INTERNETSIZ ISHLAMAYDI va ishlamasligi KERAK: token
//  serverda yaratiladi va xeshlanib saqlanadi. Qurilmada yasalsa,
//  ikki telefon bitta tokenni ikki xil bitimga bog'lab yuborardi.
//  Shuning uchun bu yerda navbat (outbox) yo'q — xato ochiq
//  aytiladi.
// =============================================================

import { supabase } from './supabase';
import { tr } from './til';

/**
 * Bot nomi. Muhit o'zgaruvchisidan olinadi, chunki sinov boti va
 * jonli bot boshqa-boshqa bo'ladi va nomini kodga yozib qo'ysak
 * har safar tahrirlashga to'g'ri kelardi.
 */
export const BOT_NOM = process.env.EXPO_PUBLIC_KASSA_BOT ?? '';

export type Havola = { havola: string; amalQiladi: string };

/**
 * Bitimga tasdiqlash havolasini yaratadi.
 *
 * Xatolar YUTILMAYDI: odam havolani yubordim deb o'ylab qolsa,
 * hamkor hech narsa olmasdi va buni faqat bahs chiqqanda bilinardi.
 */
export async function tasdiqHavolasi(bitimId: string): Promise<Havola> {
  if (!BOT_NOM) {
    throw new Error(tr('Bot sozlanmagan — ishlab chiquvchiga ayting'));
  }

  const { data, error } = await supabase.rpc('kassa_tasdiq_havola', {
    p_bitim_id: bitimId,
  });
  if (error) throw error;

  const token = (data as { token?: string } | null)?.token;
  if (!token) throw new Error(tr('Havola olinmadi'));

  return {
    havola: `https://t.me/${BOT_NOM}?start=${token}`,
    amalQiladi: String((data as { amal_qiladi?: string }).amal_qiladi ?? ''),
  };
}

/** Hamkorga yuboriladigan matn: havola yolg'iz tushunarsiz bo'lardi */
export function taklifMatni(havola: string, biznes: string): string {
  return (
    `${biznes}: ${tr('oldi-berdimizni tasdiqlab bering.')}\n` +
    `${havola}\n\n` +
    tr('Havola 7 kun ishlaydi.')
  );
}
