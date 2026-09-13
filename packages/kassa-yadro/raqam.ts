// =============================================================
//  RAQAM TAHLILI — "ikki million" → 200 000 000 tiyin
//
//  Bu funksiya ROBOT uchun: odam gapirgan yoki yozgan matndan summani
//  ajratadi. Nega alohida modul, nega modelga topshirilmaydi:
//
//    Model raqamni "taxminan" tushunadi. Bir kun 2 000 000 o'rniga
//    2 000 yozib qo'yadi va buni HECH KIM sezmaydi — hisobot to'g'ri
//    ko'rinadi, shunchaki pul kam. Shuning uchun raqam deterministik
//    kod bilan o'giriladi va o'z sinovi bor (tests/kassa-raqam.mjs).
//
//  NOANIQLIK YASHIRILMAYDI. "Ahmadga ikkiga berdim" — bu 2 so'mmi,
//  2 mingmi, 2 millionmi? Funksiya taxmin qilmaydi: `aniq: false`
//  qaytaradi va nomzodlarni beradi, robot esa SO'RAYDI.
//
//  Klaviaturada terilgan summa bu yerdan o'tmaydi — u `pul.ts`
//  dagi `ifodaHisobla` bilan hisoblanadi ("1200+300").
// =============================================================

import type { Valyuta } from './pul';

export type RaqamNatija = {
  /** Tiyinda. Topilmasa null */
  qiymat: number | null;
  /** false bo'lsa — robot so'rashi kerak, yozmasligi kerak */
  aniq: boolean;
  /** Noaniq bo'lsa: mumkin bo'lgan variantlar (tiyinda) */
  nomzodlar?: number[];
  /** Matnda valyuta aytilgan bo'lsa */
  valyuta?: Valyuta;
  /** Nega noaniq / nega topilmadi */
  sabab?: string;
};

const BIRLIK: Record<string, number> = {
  nol: 0, bir: 1, ikki: 2, uch: 3, "to'rt": 4, besh: 5,
  olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9,
};

const ONLIK: Record<string, number> = {
  "o'n": 10, yigirma: 20, "o'ttiz": 30, qirq: 40, ellik: 50,
  oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90,
};

// Qo'shimchalar: "mingga", "millionlik", "ikkita" — ildizni topish uchun
// olib tashlanadi. Uzunidan boshlab, aks holda "ta" "taga" ni buzadi.
const QOSHIMCHA = [
  'taga', 'talab', 'tasi', 'lik', 'lab', 'gacha', 'ning', 'dan', 'ga', 'da', 'ni', 'ta', 'cha',
];

/** Apostrof va bosh harf farqini yo'qotadi: "To‘rt" → "to'rt" */
function normal(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/−/g, '-')
    .trim();
}

/** Qo'shimchani olib tashlab lug'atdan qidiradi */
function ildiz(soz: string, lugat: Record<string, number>): number | undefined {
  if (soz in lugat) return lugat[soz];
  for (const q of QOSHIMCHA) {
    if (soz.length > q.length && soz.endsWith(q)) {
      const asos = soz.slice(0, -q.length);
      if (asos in lugat) return lugat[asos];
    }
  }
  return undefined;
}

function shkala(soz: string): number | undefined {
  const s = soz;
  if (s === 'k') return 1e3;
  if (s.startsWith('milliard') || s === 'mlrd' || s.startsWith('mld')) return 1e9;
  if (s.startsWith('million') || s === 'mln' || s === 'mn') return 1e6;
  if (s.startsWith('ming')) return 1e3;
  if (s.startsWith('yuz')) return 100;
  return undefined;
}

function valyutaTop(matn: string): Valyuta | undefined {
  if (/\$|dollar|usd|ko'k|kok\b/.test(matn)) return 'USD';
  if (/€|yevro|evro|eur/.test(matn)) return 'EUR';
  if (/₽|rubl|rub\b/.test(matn)) return 'RUB';
  if (/so'm|som\b|sum\b|uzs/.test(matn)) return 'UZS';
  return undefined;
}

/**
 * Raqamli bo'lakni o'qiydi: "2000", "2 000", "2.000.000", "12,5"
 * Ajratgich bilan yozilgan minglik va kasrni farqlaydi.
 */
function sondan(soz: string): number | undefined {
  // 500k / 2mln — raqam va shkala yopishib kelgan
  const yopishgan = soz.match(/^(\d+(?:[.,]\d+)?)(k|mln|mlrd|million|ming|milliard)$/);
  if (yopishgan) {
    const asos = Number(yopishgan[1].replace(',', '.'));
    const s = shkala(yopishgan[2]) ?? 1;
    return asos * s;
  }

  if (!/^\d/.test(soz)) return undefined;

  // 2.000.000 yoki 2,000,000 — ajratgich (uch xonali guruhlar)
  if (/^\d{1,3}([.,]\d{3})+$/.test(soz)) return Number(soz.replace(/[.,]/g, ''));

  // 12.5 yoki 12,5 — kasr
  if (/^\d+[.,]\d{1,2}$/.test(soz)) return Number(soz.replace(',', '.'));

  if (/^\d+$/.test(soz)) return Number(soz);
  return undefined;
}

export function raqamTahlil(matn: string): RaqamNatija {
  const toza = normal(matn);
  const valyuta = valyutaTop(toza);

  // "2 000 000" — probel bilan ajratilgan minglik bitta son sifatida
  // o'qilishi kerak, aks holda 2 + 0 + 0 bo'lib ketadi.
  const birlashgan = toza.replace(/(\d)[  ](?=\d{3}\b)/g, '$1');
  const sozlar = birlashgan.split(/[^0-9a-z'.,$€₽]+/).filter(Boolean);

  let jami = 0;
  let joriy = 0;
  let korildi = false;
  let shkalaKorildi = false;
  let raqamdanKeldi = false;

  for (const xom of sozlar) {
    const soz = xom.replace(/[.,]$/, '');
    if (!soz) continue;

    const son = sondan(soz);
    if (son !== undefined) {
      // "500k" ichida shkala bor — uni qayta ko'paytirmaymiz
      if (/[a-z]/.test(soz)) {
        jami += son;
        shkalaKorildi = true;
      } else {
        joriy += son;
        if (son >= 1000) shkalaKorildi = true;
      }
      korildi = true;
      raqamdanKeldi = true;
      continue;
    }

    if (soz === 'yarim' || soz === 'yarimta') {
      joriy += 0.5;
      korildi = true;
      continue;
    }

    const b = ildiz(soz, BIRLIK);
    if (b !== undefined) {
      joriy += b;
      korildi = true;
      continue;
    }

    const o = ildiz(soz, ONLIK);
    if (o !== undefined) {
      joriy += o;
      korildi = true;
      continue;
    }

    const sh = shkala(soz);
    if (sh !== undefined) {
      if (sh === 100) {
        // "besh yuz" → 500, yolg'iz "yuz" → 100
        joriy = (joriy || 1) * 100;
      } else {
        jami += (joriy || 1) * sh;
        joriy = 0;
        shkalaKorildi = true;
      }
      korildi = true;
      continue;
    }
  }

  jami += joriy;

  if (!korildi) {
    return { qiymat: null, aniq: false, valyuta, sabab: 'summa topilmadi' };
  }

  const tiyin = Math.round(jami * 100);

  // Noaniqlik: shkala aytilmagan va son kichik. Og'zaki nutqda hech kim
  // "ikki million"ni "ikki" deb aytmaydi, lekin "ikki ming"ni "ikki"
  // deyishi mumkin — shuning uchun taxmin qilmay so'raymiz.
  if (!shkalaKorildi && jami > 0 && jami < 1000) {
    return {
      qiymat: tiyin,
      aniq: false,
      nomzodlar: [tiyin, tiyin * 1000, tiyin * 1000000],
      valyuta,
      sabab: raqamdanKeldi
        ? "shkala aytilmadi: so'mmi, mingmi, millionmi?"
        : "shkala aytilmadi (ming / million?)",
    };
  }

  return { qiymat: tiyin, aniq: true, valyuta };
}
