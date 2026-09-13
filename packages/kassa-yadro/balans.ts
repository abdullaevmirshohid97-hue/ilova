// =============================================================
//  QOLDIQ VA YIG'INDI
//
//  Qoldiq hech qayerda saqlanmaydi — har safar yozuvlardan
//  hisoblanadi. Shuning uchun bu fayl ilovaning eng ko'p
//  chaqiriladigan joyi va eng ko'p sinaladigan joyi.
//
//  Uch qoida shu yerda kod bo'lib turibdi:
//
//   1. BEKOR QILINGAN yozuv hisobga kirmaydi (o'chirilmaydi, lekin
//      yig'indida qatnashmaydi).
//   2. O'TKAZMA daromad ham, xarajat ham emas. Hisob qoldig'iga ta'sir
//      qiladi (pul chiqdi), lekin "Kirim/Chiqim" hisobotida
//      ko'rinmaydi — aks holda bir million o'zidan o'ziga o'tkazilsa
//      oborot ikki million bo'lib ko'rinardi.
//   3. VALYUTALAR QO'SHILMAYDI. Har valyuta alohida yig'iladi; ekran
//      ularni alohida ko'rsatadi.
// =============================================================

import type { Valyuta } from './pul';
import type { Hisob, Yozuv } from './turi';

export type Yigindi = { kirim: number; chiqim: number; farq: number };

const hisobga_kiradi = (y: Yozuv) => !y.bekor_at;

/** Bitta hisobning qoldig'i (tiyinda). O'tkazmalar HAM qatnashadi. */
export function hisobQoldiq(hisob: Hisob, yozuvlar: Yozuv[]): number {
  let q = hisob.boshlangich;
  for (const y of yozuvlar) {
    if (y.hisob_id !== hisob.id || !hisobga_kiradi(y)) continue;
    q += y.turi === 'kirim' ? y.summa : -y.summa;
  }
  return q;
}

/**
 * Davr yig'indisi — pastdagi panel uchun.
 * O'tkazmalar standart holatda chiqarib tashlanadi (2-qoida).
 */
export function davrYigindi(
  yozuvlar: Yozuv[],
  imkon: { kochirmalarHam?: boolean } = {},
): Yigindi {
  let kirim = 0;
  let chiqim = 0;
  for (const y of yozuvlar) {
    if (!hisobga_kiradi(y)) continue;
    if (y.kochirma_id && !imkon.kochirmalarHam) continue;
    if (y.turi === 'kirim') kirim += y.summa;
    else chiqim += y.summa;
  }
  return { kirim, chiqim, farq: kirim - chiqim };
}

/** Valyuta bo'yicha alohida yig'indi (3-qoida) */
export function valyutaBoyicha(yozuvlar: Yozuv[]): Record<string, Yigindi> {
  const natija: Record<string, Yigindi> = {};
  for (const y of yozuvlar) {
    if (!hisobga_kiradi(y)) continue;
    if (y.kochirma_id) continue;
    const v = y.valyuta ?? 'UZS';
    const n = (natija[v] ??= { kirim: 0, chiqim: 0, farq: 0 });
    if (y.turi === 'kirim') n.kirim += y.summa;
    else n.chiqim += y.summa;
    n.farq = n.kirim - n.chiqim;
  }
  return natija;
}

/**
 * Yozuvlarni tartiblaydi va har qator uchun YURUVCHI QOLDIQ beradi
 * (rasmlardagi "Balance -6,200" ustuni).
 *
 * Tartib faqat `sana` bo'yicha bo'lishi YETARLI EMAS: offline ilovada
 * ikki qurilma bir soniyada yozuv qo'shadi va ular serverga teskari
 * tartibda tushadi. Shunda ro'yxat har ochilganda boshqacha ko'rinardi.
 * Shuning uchun tenglikda `o_raqam`, u ham teng bo'lsa `id` bo'yicha
 * saralanadi — natija hamma qurilmada bir xil.
 */
export function yuruvchiQoldiq(
  yozuvlar: Yozuv[],
  boshlangich = 0,
): { yozuv: Yozuv; qoldiq: number }[] {
  const tartibli = [...yozuvlar].filter(hisobga_kiradi).sort(solishtir);
  let q = boshlangich;
  return tartibli.map((yozuv) => {
    q += yozuv.turi === 'kirim' ? yozuv.summa : -yozuv.summa;
    return { yozuv, qoldiq: q };
  });
}

export function solishtir(a: Yozuv, b: Yozuv): number {
  const sa = Date.parse(a.sana);
  const sb = Date.parse(b.sana);
  if (sa !== sb) return sa - sb;
  const oa = a.o_raqam ?? Number.MAX_SAFE_INTEGER;
  const ob = b.o_raqam ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Klient qoldig'i: musbat — BIZGA qarzi bor (Due),
 * manfiy — oldindan to'lagan (Advance).
 *
 * Kassa nuqtai nazaridan: tovar berildi = pul hali kelmagan (chiqim
 * emas, qarz), pul keldi = kirim. Shuning uchun qarz = chiqim - kirim.
 */
export function klientQoldiq(klientId: string, yozuvlar: Yozuv[]): number {
  let qarz = 0;
  for (const y of yozuvlar) {
    if (y.klient_id !== klientId || !hisobga_kiradi(y)) continue;
    qarz += y.turi === 'chiqim' ? y.summa : -y.summa;
  }
  return qarz;
}

/** Kalendar ekrani: kun → {kirim, chiqim} */
export function kunlarBoyicha(yozuvlar: Yozuv[]): Record<string, Yigindi> {
  const natija: Record<string, Yigindi> = {};
  for (const y of yozuvlar) {
    if (!hisobga_kiradi(y) || y.kochirma_id) continue;
    const kun = (y.sana ?? '').slice(0, 10);
    if (!kun) continue;
    const n = (natija[kun] ??= { kirim: 0, chiqim: 0, farq: 0 });
    if (y.turi === 'kirim') n.kirim += y.summa;
    else n.chiqim += y.summa;
    n.farq = n.kirim - n.chiqim;
  }
  return natija;
}

/** Hisobni valyutasi bo'yicha guruhlash — umumiy balans paneli uchun */
export function umumiyBalans(
  hisoblar: Hisob[],
  yozuvlar: Yozuv[],
): { valyuta: Valyuta; qoldiq: number }[] {
  const jam: Record<string, number> = {};
  for (const h of hisoblar) {
    if (!h.faol) continue;
    jam[h.valyuta] = (jam[h.valyuta] ?? 0) + hisobQoldiq(h, yozuvlar);
  }
  return Object.entries(jam).map(([valyuta, qoldiq]) => ({
    valyuta: valyuta as Valyuta,
    qoldiq,
  }));
}
