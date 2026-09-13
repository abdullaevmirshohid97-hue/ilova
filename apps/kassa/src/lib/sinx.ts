// =============================================================
//  SINXRONIZATSIYA DVIGATELI
//
//  Ikki yo'nalish bor va tartibi MUHIM:
//
//   1. AVVAL YUBORISH (navbat -> server). Aks holda serverdan kelgan
//      eski nusxa mahalliy, hali yuborilmagan o'zgarishni bosib
//      ketardi.
//   2. KEYIN OLISH (server -> mahalliy), kursor bo'yicha.
//
//  Dvigatel qurilmani ham, Supabase'ni ham BILMAYDI: u `Ombor` va
//  `Server` interfeyslari bilan ishlaydi. Shuning uchun uni telefon
//  va brauzersiz, oddiy Node sinovida to'liq bosib ko'rish mumkin
//  (`tests/kassa-sinx.mjs`).
//
//  XATO BO'LSA NAVBAT TO'XTAMAYDI, lekin TARTIB SAQLANADI: bitta
//  amal tarmoq xatosi bilan qolsa, undan keyingilari ham kutadi.
//  Sabab: "hisob qo'shish" yiqilsa, o'sha hisobga tegishli "yozuv
//  qo'shish" serverda xatoga uchrardi va foydalanuvchi sababini
//  tushunmasdi.
// =============================================================

import type { Amal, Ombor, Server, SinxHolat, Ziddiyat } from '../ombor/turi';
import { JADVALLAR } from '../ombor/turi';

export type SinxNatija = {
  yuborildi: number;
  olindi: number;
  navbatda: number;
  ziddiyat: number;
  xato: string | null;
  holat: SinxHolat;
};

export function uuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Zaxira: eski Android WebView'da `randomUUID` yo'q
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Qancha kutib qayta urinish — urinish soniga qarab o'sadi */
export function kechikish(urinish: number): number {
  const jadval = [1_000, 5_000, 30_000, 120_000, 600_000];
  return jadval[Math.min(urinish, jadval.length - 1)];
}

export async function sinxronla(
  ombor: Ombor,
  server: Server,
  imkon: { hozir?: number } = {},
): Promise<SinxNatija> {
  const hozir = imkon.hozir ?? Date.now();
  let yuborildi = 0;
  let olindi = 0;
  let xato: string | null = null;

  // ---------- 1. Navbatni yuborish ----------
  const navbat = await ombor.navbat();
  for (const amal of navbat) {
    // Kechikish muddati to'lmagan bo'lsa — butun navbat kutadi
    // (tartib saqlanishi uchun).
    if (amal.urinish > 0) {
      const keyingi = Date.parse(amal.yaratilgan) + kechikish(amal.urinish - 1);
      if (Number.isFinite(keyingi) && hozir < keyingi) break;
    }

    let javob: { holat: 'ok' | 'ziddiyat' | 'rad'; sabab?: string };
    try {
      javob = await server.yubor(amal);
    } catch (e) {
      // Tarmoq xatosi — amal navbatda qoladi, urinish oshadi
      xato = (e as Error)?.message ?? String(e);
      await ombor.navbatYangila({
        ...amal,
        urinish: amal.urinish + 1,
        oxirgi_xato: xato,
        yaratilgan: new Date(hozir).toISOString(),
      });
      break;
    }

    if (javob.holat === 'ok') {
      await ombor.navbatOchir(amal.id);
      yuborildi++;
      continue;
    }

    // Ziddiyat yoki rad — amal navbatdan CHIQADI (aks holda u boshqa
    // hamma narsani to'sib qo'yardi), lekin izsiz yo'qolmaydi:
    // foydalanuvchi ro'yxatda ko'radi.
    const z: Ziddiyat = {
      id: amal.id,
      jadval: amal.jadval,
      yozuv_id: amal.yozuv_id,
      sabab:
        javob.holat === 'ziddiyat'
          ? 'Bu yozuv boshqa qurilmada o‘zgargan — sizning o‘zgarishingiz qo‘llanmadi'
          : (javob.sabab ?? 'Server qabul qilmadi'),
      vaqt: new Date(hozir).toISOString(),
    };
    await ombor.ziddiyatQosh(z);
    await ombor.navbatOchir(amal.id);
  }

  // ---------- 2. O'zgarishlarni olish ----------
  // Bir necha paket bo'lishi mumkin (server chegarasi 500 qator).
  try {
    let kursor = await ombor.kursorOl();
    let aylanish = 0;
    for (;;) {
      const javob = await server.ozgarishlar(kursor);
      for (const jadval of JADVALLAR) {
        const qatorlar = javob[jadval] ?? [];
        if (qatorlar.length) {
          await ombor.saqla(jadval, qatorlar);
          olindi += qatorlar.length;
        }
      }
      // Kursorni FAQAT saqlagandan keyin ko'chiramiz: o'rtada uzilsa,
      // o'sha paket keyingi safar qayta keladi (takror — zararsiz,
      // yo'qolish — balansni buzadi).
      kursor = javob.kursor;
      await ombor.kursorQoy(kursor);

      if (!javob.yana) break;
      // Cheksiz aylanishdan himoya: server "yana bor" deb turib,
      // kursorni surmasa ilova qotib qolardi.
      if (++aylanish > 50) break;
    }
    await server.kursorSaqla(kursor).catch(() => {
      /* kursorni serverda saqlash — qulaylik, majburiyat emas */
    });
  } catch (e) {
    xato = (e as Error)?.message ?? String(e);
  }

  const qolgan = (await ombor.navbat()).length;
  const ziddiyatlar = (await ombor.ziddiyatlar()).length;

  return {
    yuborildi,
    olindi,
    navbatda: qolgan,
    ziddiyat: ziddiyatlar,
    xato,
    holat: holatAniq(qolgan, ziddiyatlar, xato),
  };
}

export function holatAniq(navbatda: number, ziddiyat: number, xato: string | null): SinxHolat {
  if (ziddiyat > 0) return 'ziddiyat';
  if (xato) return 'oflayn';
  if (navbatda > 0) return 'navbatda';
  return 'sinxron';
}

/** Navbatga yangi amal qo'shish — ekranlar shuni chaqiradi */
export function amalYasa(
  tur: Amal['tur'],
  jadval: Amal['jadval'],
  yozuv_id: string,
  qiymat: Record<string, unknown>,
  versiya?: number,
): Amal {
  return {
    id: uuid(),
    tur,
    jadval,
    yozuv_id,
    qiymat,
    versiya,
    urinish: 0,
    oxirgi_xato: null,
    yaratilgan: new Date().toISOString(),
  };
}
