// =============================================================
//  BIRIKTIRMA — RASM VA 10 SONIYALIK VIDEO
//
//  Bitim yoki to'lovga dalil qo'shiladi: tovar rasmi, tarozi
//  ko'rsatkichi, qo'l bilan yozilgan qog'oz.
//
//  FAYLLAR SERVERGA CHIQMAYDI. Ular telefonning o'z ichki
//  xotirasida, ilovaning hujjatlar papkasida turadi. Sabab
//  oddiy: bir do'kon kuniga o'nlab rasm va video qo'shsa,
//  server bir necha oyda to'lib qoladi va hamma tenant uchun
//  sekinlashadi. Dalil esa deyarli har doim FAQAT qo'yган
//  odamga kerak bo'ladi.
//
//  BUNING OQIBATI BOR va u yashirilmaydi: biriktirma FAQAT
//  o'sha telefonda ko'rinadi. Boshqa qurilmada, brauzerda yoki
//  ilova o'chirib qayta o'rnatilganda u yo'q. Shuning uchun
//  ekranda ham shu yozib qo'yilgan.
//
//  VIDEO 10 SONIYA. `videoMaxDuration` tanlagichning o'zida
//  cheklaydi, ya'ni uzun videoni kesish kerak emas — odam
//  uzunini tanlay olmaydi.
//
//  INDEKS AsyncStorage da. Nega sinxronlanadigan jadvalga
//  ustun qo'shilmadi: u serverga ketardi va boshqa qurilmada
//  "rasm bor" deb ko'rsatib, ochib bo'lmaydigan holat yasardi.
// =============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Tanlagich from 'expo-image-picker';

const KALIT = 'kassa.biriktirma';
const PAPKA = 'biriktirma';

/** Video uzunligi chegarasi — soniyada. */
export const VIDEO_SONIYA = 10;

export type Biriktirma = { rasm?: string; video?: string };
type Indeks = Record<string, Biriktirma>;

function papka(): Directory {
  const d = new Directory(Paths.document, PAPKA);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

async function indeksOl(): Promise<Indeks> {
  try {
    const x = await AsyncStorage.getItem(KALIT);
    return x ? (JSON.parse(x) as Indeks) : {};
  } catch {
    return {};
  }
}

async function indeksQoy(i: Indeks): Promise<void> {
  await AsyncStorage.setItem(KALIT, JSON.stringify(i));
}

/**
 * Tanlagichdan kelgan faylni O'ZIMIZNING papkaga ko'chiradi.
 *
 * Nega darhol ko'chiriladi: tanlagich faylni tizimning KESH
 * papkasiga qo'yadi va uni Android xohlagan payt o'chirib
 * tashlashi mumkin. Keshdagi yo'lni saqlab qo'ysak, biriktirma
 * bir kundan keyin yo'qolardi va sababi tushunarsiz bo'lardi.
 */
function kochir(manba: string, nom: string): string {
  const f = new File(manba);
  const nishon = new File(papka(), nom);
  if (nishon.exists) nishon.delete();
  f.copy(nishon);
  return nishon.uri;
}

function nomYasa(tur: 'rasm' | 'video', kalit: string): string {
  return `${kalit}-${tur}.${tur === 'rasm' ? 'jpg' : 'mp4'}`;
}

/** Galereyadan yoki kameradan rasm. Bekor qilinsa `null`. */
export async function rasmTanla(kamera: boolean): Promise<string | null> {
  const r = kamera
    ? await Tanlagich.requestCameraPermissionsAsync()
    : await Tanlagich.requestMediaLibraryPermissionsAsync();
  if (!r.granted) return null;

  const n = kamera
    ? await Tanlagich.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
    : await Tanlagich.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (n.canceled || !n.assets?.[0]) return null;
  return n.assets[0].uri;
}

/** Video — 10 soniyadan uzunini tanlagich o'zi bermaydi. */
export async function videoTanla(kamera: boolean): Promise<string | null> {
  const r = kamera
    ? await Tanlagich.requestCameraPermissionsAsync()
    : await Tanlagich.requestMediaLibraryPermissionsAsync();
  if (!r.granted) return null;

  const sozlama = {
    mediaTypes: ['videos'] as Tanlagich.MediaType[],
    videoMaxDuration: VIDEO_SONIYA,
    quality: 0.7,
  };
  const n = kamera
    ? await Tanlagich.launchCameraAsync(sozlama)
    : await Tanlagich.launchImageLibraryAsync(sozlama);
  if (n.canceled || !n.assets?.[0]) return null;
  return n.assets[0].uri;
}

/**
 * Yozuv saqlangandan KEYIN chaqiriladi.
 *
 * Tartib ataylab shunday: bitim saqlanmasa, biriktirma ham
 * qolmaydi. Aks holda bekor qilingan oynalardan chiqindi fayl
 * yig'ilib borardi va uni hech kim tozalamasdi.
 */
export async function biriktir(kalit: string, b: Biriktirma): Promise<void> {
  if (!b.rasm && !b.video) return;
  const i = await indeksOl();
  const yozuv: Biriktirma = { ...(i[kalit] ?? {}) };

  if (b.rasm) yozuv.rasm = kochir(b.rasm, nomYasa('rasm', kalit));
  if (b.video) yozuv.video = kochir(b.video, nomYasa('video', kalit));

  i[kalit] = yozuv;
  await indeksQoy(i);
}

/** Yo'q bo'lsa bo'sh obyekt. Fayl o'chirilgan bo'lsa ham bo'sh. */
export async function biriktirmaOl(kalit: string): Promise<Biriktirma> {
  const i = await indeksOl();
  const y = i[kalit];
  if (!y) return {};
  const natija: Biriktirma = {};
  // Faylni TEKSHIRAMIZ: indeksda bor, diskda yo'q bo'lishi
  // mumkin (odam telefon xotirasini tozalagan).
  if (y.rasm && new File(y.rasm).exists) natija.rasm = y.rasm;
  if (y.video && new File(y.video).exists) natija.video = y.video;
  return natija;
}

export async function biriktirmaOchir(kalit: string, tur?: 'rasm' | 'video'): Promise<void> {
  const i = await indeksOl();
  const y = i[kalit];
  if (!y) return;

  for (const t of ['rasm', 'video'] as const) {
    if (tur && tur !== t) continue;
    const yol = y[t];
    if (!yol) continue;
    try {
      const f = new File(yol);
      if (f.exists) f.delete();
    } catch {
      /* fayl allaqachon yo'q */
    }
    delete y[t];
  }

  if (!y.rasm && !y.video) delete i[kalit];
  else i[kalit] = y;
  await indeksQoy(i);
}

/**
 * Biriktirmalar jami qancha joy egallagani.
 *
 * Sozlamada ko'rsatiladi: fayllar telefonda turgani uchun
 * odam ularning o'sib borishini KO'RIB turishi kerak, aks
 * holda bir kun xotira to'lib qolardi va sababi topilmasdi.
 */
export async function jamiHajm(): Promise<{ soni: number; bayt: number }> {
  const i = await indeksOl();
  let soni = 0;
  let bayt = 0;
  for (const y of Object.values(i)) {
    for (const yol of [y.rasm, y.video]) {
      if (!yol) continue;
      try {
        const f = new File(yol);
        if (!f.exists) continue;
        soni++;
        bayt += f.size ?? 0;
      } catch {
        /* o'qib bo'lmadi */
      }
    }
  }
  return { soni, bayt };
}

/** Hammasini o'chirish — sozlamadagi tugma uchun. */
export async function hammasiniOchir(): Promise<void> {
  const i = await indeksOl();
  for (const kalit of Object.keys(i)) await biriktirmaOchir(kalit);
  await AsyncStorage.removeItem(KALIT);
}
