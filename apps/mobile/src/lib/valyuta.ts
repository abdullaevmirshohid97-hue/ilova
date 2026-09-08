// =============================================================
//  VALYUTA FORMATLASH — mijoz ko'radigan narx SHU YERDA yasaladi.
//
//  XATO (2026-09-09 da topilgan):
//    Avvalgi formatlash sonni Math.round bilan BUTUN songa
//    yaxlitlardi. Menejerning dollar narxlari esa $1 dan kichik
//    ($0.33, $0.37, $0.26, $0.42). Natijada mijoz katalogda,
//    savatda va buyurtmalarida HAR BIR narxni "$0" ko'rardi.
//    Bazadagi ma'lumot to'g'ri edi — faqat ko'rsatish buzuq.
//
//  DIQQAT: Intl / toLocaleString ATAYLAB ishlatilmaydi. Ilova
//  Telegram Mini App sifatida eski Android WebView'da ochilishi
//  mumkin — u yerda ICU ma'lumotlari kesilgan va 'uz-UZ' kabi
//  locale RangeError tashlaydi. Xato render ichida yuz bergani
//  uchun butun ekran oq bo'lib qolardi (ikki marta bo'lgan).
// =============================================================

export type Valyuta = 'UZS' | 'USD';

/** Dollarda tiyin muhim, so'mda emas. */
export function kasrXonasi(valyuta: string): number {
  return valyuta === 'USD' ? 2 : 0;
}

function minglarniAjrat(butun: string): string {
  return butun.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Sonni qo'lda formatlaydi — hech qanday muhitga bog'liq emas. */
export function son(qiymat: number | null | undefined, kasr: number): string {
  if (qiymat == null) return '—';
  const n = Number(qiymat);
  if (!Number.isFinite(n)) return '—';
  // toFixed manfiy nolni ham beradi ("-0.00") — abs bilan olib, belgini
  // o'zimiz qo'yamiz.
  const matn = Math.abs(n).toFixed(kasr);
  const [butun, ulush] = matn.split('.');
  const belgi = n < 0 && Number(matn) !== 0 ? '-' : '';
  return belgi + minglarniAjrat(butun) + (ulush ? '.' + ulush : '');
}

/**
 * Narxni mijoz ko'radigan valyutada yozadi.
 * Valyutani baza hal qiladi (order_items.disp_currency,
 * my_effective_prices().disp_currency) — ilova o'zi taxmin qilmaydi.
 */
export function formatNarx(
  qiymat: number | null | undefined,
  valyuta: string
): string {
  if (qiymat == null) return '—';
  const matn = son(qiymat, kasrXonasi(valyuta));
  if (matn === '—') return matn;
  if (valyuta !== 'USD') return matn + " so'm";
  // Minus dollar belgisidan OLDIN: "$-12.50" emas, "-$12.50"
  return matn.startsWith('-') ? '-$' + matn.slice(1) : '$' + matn;
}

/**
 * So'mdagi summani mijoz ko'radigan valyutaga o'giradi.
 *
 * Buyurtma summasidan farqi: qarz/balans JONLI raqam, u muzlatilmaydi
 * va joriy kurs bo'yicha o'giriladi. Buyurtma esa berilgan paytdagi
 * summani saqlaydi (order_items.disp_price) — kurs o'zgarsa eski
 * buyurtma o'zgarmasligi kerak.
 */
export function somdan(
  som: number,
  valyuta: string,
  kurs: number | null | undefined
): number {
  if (valyuta !== 'USD' || kurs == null || !(kurs > 0)) return som;
  return som / kurs;
}

/** Eski nomlar — ekranlarda hali ishlatilyapti. Mantiq bitta joyda. */
export function formatSum(n: number | null | undefined): string {
  return formatNarx(n, 'UZS');
}

export function formatUsd(n: number | null | undefined): string {
  return formatNarx(n, 'USD');
}

/** Miqdor va shunga o'xshash sonlar uchun (valyutasiz) */
export function formatQty(n: number | null | undefined): string {
  return son(n, 0);
}
