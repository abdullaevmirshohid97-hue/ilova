// =============================================================
//  KUN YAKUNI — qachon so'raladi
//
//  Taklif KUNIGA BIR MARTA va faqat kechqurun chiqadi. Sabab
//  oddiy: ertalab kassani sanashning ma'nosi yo'q, kun bo'yi
//  turaversa esa u shunchaki bezovta qiladigan qizil nuqtaga
//  aylanadi va odam uni ko'rmaydigan bo'lib qoladi.
//
//  Yopilgan kun QURILMADA saqlanadi, serverda emas: bu shaxsiy
//  odat, boshqa qurilmaga ko'chirishning keragi yo'q va u uchun
//  jadval ochish ortiqcha.
// =============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { kunKaliti } from './davr';

const KALIT = 'kassa.yakun';

/** Kechqurun shu soatdan keyin taklif qilinadi */
const SOAT = 17;

let oxirgi: string | null = null;
let yuklandi = false;

export async function yakunniYukla(): Promise<string | null> {
  if (yuklandi) return oxirgi;
  yuklandi = true;
  try {
    oxirgi = await AsyncStorage.getItem(KALIT);
  } catch {
    oxirgi = null;
  }
  return oxirgi;
}

export async function yakunniBelgila(): Promise<void> {
  oxirgi = kunKaliti(new Date());
  yuklandi = true;
  try {
    await AsyncStorage.setItem(KALIT, oxirgi);
  } catch {
    /* saqlanmasa ertaga yana so'raladi — zarari yo'q */
  }
}

/**
 * Bugun yakunlanganmi?
 *
 * @param hozir sinov uchun vaqtni tashqaridan berish mumkin
 */
export function bugunYakunlandi(hozir: Date = new Date()): boolean {
  return oxirgi === kunKaliti(hozir);
}

/** Taklif ko'rsatiladimi */
export function yakunSorash(yozuvBormi: boolean, hozir: Date = new Date()): boolean {
  if (!yozuvBormi) return false;
  if (bugunYakunlandi(hozir)) return false;
  return hozir.getHours() >= SOAT;
}
