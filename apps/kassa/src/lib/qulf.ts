// =============================================================
//  QULF — PIN, CHIZMA, BARMOQ IZI
//
//  MUHIM TUSHUNCHA: bu KIRISH usuli emas, QULFNI OCHISH usuli.
//
//  Supabase barmoq izini bilmaydi — u parol, OTP yoki OAuth
//  biladi. Shuning uchun tartib shunday:
//
//    1-marta:  email + parol  -> sessiya olinadi va saqlanadi
//    Keyingi:  PIN / chizma / barmoq izi  -> o'sha sessiya OCHILADI
//
//  Foydalanuvchi uchun farqi sezilmaydi (u parol yozmaydi), lekin
//  loyihalashda bu farq hal qiluvchi: qulf sessiyani YARATMAYDI,
//  faqat ilovani ko'rsatadi.
//
//  `disableDeviceFallback: false` — butun ish shu bitta
//  parametrda. Android'da u `BiometricPrompt` ni
//  `DEVICE_CREDENTIAL` bilan ochadi:
//    · barmoq izi ro'yxatdan o'tgan bo'lsa — barmoq izi
//    · bo'lmasa — telefonning PIN yoki CHIZMASI
//    · Samsung'da Samsung Pass o'zi qo'shiladi
//  Ya'ni uchala usul ham bitta chaqiruvdan chiqadi.
//
//  QULF HECH QACHON YAGONA YO'L BO'LMASLIGI KERAK. Odam barmog'ini
//  shikastlantirsa, telefon chizmasini o'zgartirsa yoki sensor
//  buzilsa — u o'z daftaridan butunlay ajralib qolmasligi kerak.
//  Shuning uchun qulf ekranida har doim «parol bilan kirish»
//  chiqish yo'li turadi.
// =============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Qurilma from 'expo-local-authentication';
import { tr } from './til';

const KALIT = 'kassa.qulf';

/** Fonda shuncha daqiqadan ko'p turgan bo'lsa qayta so'raladi. */
export const KUTISH_DAQIQA = 2;

/**
 * Qurilmada umuman qulf bormi.
 *
 * `getEnrolledLevelAsync` uch xil javob beradi:
 *   NONE            — telefonda qulf yo'q, sozlamani ko'rsatmaymiz
 *   SECRET          — PIN, chizma yoki parol bor
 *   BIOMETRIC_*     — barmoq izi yoki yuz ham bor
 *
 * SECRET ham yetarli: bizga aynan chizma va PIN kerak edi.
 * Sozlamani NONE da ko'rsatsak, odam uni yoqardi-yu, keyin
 * ilova ochilmay qolardi.
 */
export async function qurilmaQulfiBormi(): Promise<boolean> {
  try {
    const daraja = await Qurilma.getEnrolledLevelAsync();
    return daraja !== Qurilma.SecurityLevel.NONE;
  } catch {
    // Modul yo'q (masalan brauzerda) — qulf taklif qilinmaydi
    return false;
  }
}

/** Foydalanuvchi qulfni yoqqanmi. */
export async function qulfYoqilganmi(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KALIT)) === '1';
  } catch {
    return false;
  }
}

export async function qulfniQoy(yoq: boolean): Promise<void> {
  await AsyncStorage.setItem(KALIT, yoq ? '1' : '0');
}

export type OchishNatija = 'ochildi' | 'bekor' | 'imkonsiz';

/**
 * Qulfni ochishni so'raydi.
 *
 * `bekor` — odam rad etdi yoki noto'g'ri kiritdi: qulf ekrani
 * qoladi va u qayta urinishi mumkin.
 * `imkonsiz` — qurilmada qulf yo'q yoki modul javob bermadi:
 * bu yerda ushlab qolish ZARAR, shuning uchun ichkariga
 * qo'yiladi. Aks holda qulfni yoqqan odam telefon qulfini
 * o'chirsa, ilovasiga umuman kira olmasdi.
 */
export async function ochishniSora(): Promise<OchishNatija> {
  try {
    if (!(await qurilmaQulfiBormi())) return 'imkonsiz';

    const natija = await Qurilma.authenticateAsync({
      promptMessage: tr('Daftarni ochish'),
      cancelLabel: tr('Bekor'),
      // ASOSIY QATOR: barmoq izi bo'lmasa PIN va chizma ishlaydi.
      disableDeviceFallback: false,
    });
    return natija.success ? 'ochildi' : 'bekor';
  } catch {
    return 'imkonsiz';
  }
}
