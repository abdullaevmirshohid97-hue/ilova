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
import type { Bitim, Hisob, Tolov, Yozuv } from './turi';

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

// =============================================================
//  OLDI-BERDI QOLDIG‘I
//
//  Bu funksiyalar bazadagi `kassa_hamkor_qoldiq` va
//  `kassa_bitim_qoldiq` bilan AYNAN bir xil hisoblaydi. Ikkisi
//  bir xil bo‘lishi shart: ilova internetsiz ishlaydi va
//  qoldiqni o‘zi ko‘rsatadi. Farq bo‘lsa, internet kelganda
//  raqam o‘zgarib ketardi — bu esa ishonchni bir zumda yo‘qotadi.
// =============================================================

/** Bekor qilingani hisobga kirmaydi; TASDIQLANMAGANI KIRADI */
const hisobga = (h: string) => h !== 'bekor';

/** Ishora qoidasi: berdim +, oldim − */
const ishora = (y: 'oldim' | 'berdim') => (y === 'berdim' ? 1 : -1);

/**
 * Hamkor qoldig‘i.
 *
 * Musbat — u menga qarzdor, manfiy — men unga.
 *
 * `yozuvlar` — ESKI oqimda yozilgan, bitimsiz daftar yozuvlari.
 * Ular ham qarz: bitim tushunchasi paydo bo‘lgunicha hamma qarz
 * shunday yozilardi. Bitimga BOG‘LANGANI olinmaydi — u bitim va
 * to‘lov orqali allaqachon sanalgan, ikki marta sanalsa qarz
 * ikki barobar ko‘rinardi.
 */
export function hamkorQoldiq(
  klientId: string,
  bitimlar: Bitim[],
  tolovlar: Tolov[],
  yozuvlar: Yozuv[] = [],
): number {
  let q = 0;
  for (const b of bitimlar) {
    if (b.klient_id !== klientId || !hisobga(b.holat)) continue;
    q += ishora(b.yonalish) * b.summa;
  }
  for (const t of tolovlar) {
    if (t.klient_id !== klientId || !hisobga(t.holat)) continue;
    q += ishora(t.yonalish) * t.summa;
  }
  q += eskiQarz(klientId, yozuvlar);
  return q;
}

/**
 * Bitimsiz daftar yozuvlaridan chiqadigan qarz.
 *
 * Ishora `klientQoldiq` dagi bilan bir xil: chiqim = tovar/pul
 * berildi = u menga qarzdor (+).
 */
function eskiQarz(klientId: string, yozuvlar: Yozuv[]): number {
  let q = 0;
  for (const y of yozuvlar) {
    if (y.klient_id !== klientId || y.bitim_id) continue;
    if (!hisobga_kiradi(y) || y.kochirma_id) continue;
    q += y.turi === 'chiqim' ? y.summa : -y.summa;
  }
  return q;
}

/** Bitta bitimning to‘lanmagan qoldig‘i (manfiy bo‘lmaydi) */
export function bitimQoldiq(bitim: Bitim, tolovlar: Tolov[]): number {
  if (bitim.holat === 'bekor') return 0;
  let tolangan = 0;
  for (const t of tolovlar) {
    if (t.bitim_id !== bitim.id || !hisobga(t.holat)) continue;
    tolangan += t.summa;
  }
  return Math.max(0, bitim.summa - tolangan);
}

/**
 * Hamma hamkorlar bo‘yicha jami: kim bizga qarzdor, biz kimga.
 *
 * Bosh ekrandagi ikki katta raqam shu yerdan chiqadi.
 */
export type QarzJami = { olamiz: number; beramiz: number };

export function qarzYigindi(
  bitimlar: Bitim[],
  tolovlar: Tolov[],
  yozuvlar: Yozuv[] = [],
): QarzJami {
  const boyicha = new Map<string, number>();
  for (const b of bitimlar) {
    if (!hisobga(b.holat)) continue;
    boyicha.set(b.klient_id, (boyicha.get(b.klient_id) ?? 0) + ishora(b.yonalish) * b.summa);
  }
  for (const t of tolovlar) {
    if (!hisobga(t.holat)) continue;
    boyicha.set(t.klient_id, (boyicha.get(t.klient_id) ?? 0) + ishora(t.yonalish) * t.summa);
  }
  // Eski, bitimsiz yozuvlar ham shu xaritaga tushadi — aks holda
  // bosh ekrandagi jami hamkorlar kartochkalari yig‘indisiga teng
  // chiqmasdi.
  for (const y of yozuvlar) {
    if (!y.klient_id || y.bitim_id) continue;
    if (!hisobga_kiradi(y) || y.kochirma_id) continue;
    const d = y.turi === 'chiqim' ? y.summa : -y.summa;
    boyicha.set(y.klient_id, (boyicha.get(y.klient_id) ?? 0) + d);
  }

  let olamiz = 0;
  let beramiz = 0;
  for (const q of boyicha.values()) {
    if (q > 0) olamiz += q;
    else beramiz += -q;
  }
  return { olamiz, beramiz };
}

/**
 * Qarz tasdiq holati bo‘yicha ikkiga bo‘linadi.
 *
 * Reja 7.4: tasdiq shart emas, lekin DALIL. Nizoda qaysi raqamga
 * suyanish mumkinligi shundan bilinadi — shuning uchun hisobotda
 * ikkisi alohida turadi.
 *
 * Eski, bitimsiz daftar yozuvlari TASDIQLANMAGAN deb sanaladi:
 * ularni hech kim tasdiqlamagan, chunki tasdiq tushunchasi
 * ular yozilganda yo‘q edi.
 */
export function qarzTasdiqBoyicha(
  bitimlar: Bitim[],
  tolovlar: Tolov[],
  yozuvlar: Yozuv[] = [],
): { tasdiqlangan: QarzJami; tasdiqlanmagan: QarzJami } {
  const tasdiqli = (h: string) => h === 'tasdiqlangan' || h === 'yopilgan';
  return {
    tasdiqlangan: qarzYigindi(
      bitimlar.filter((b) => tasdiqli(b.holat)),
      tolovlar.filter((t) => tasdiqli(t.holat)),
    ),
    tasdiqlanmagan: qarzYigindi(
      bitimlar.filter((b) => !tasdiqli(b.holat)),
      tolovlar.filter((t) => !tasdiqli(t.holat)),
      yozuvlar,
    ),
  };
}

/**
 * Bitta bitim necha KUN kechikkan. Kechikmagan bo‘lsa 0.
 *
 * `muddatiOtgan` ro‘yxat qaytaradi, bu esa bitta qator uchun:
 * ekranda har bitim yonida «3 kun kechikdi» deb turishi kerak,
 * ro‘yxatni qidirib o‘tirmasdan.
 *
 * Ikkalasi BIR XIL shartga tayanadi — biri qizil, ikkinchisi
 * oq ko‘rsatsa odam qaysi biriga ishonishni bilmasdi.
 */
export function kechikkanKun(bitim: Bitim, tolovlar: Tolov[], hozir = new Date()): number {
  if (!muddatiOtgan([bitim], tolovlar, hozir).length) return 0;
  const bugun = new Date(hozir.getFullYear(), hozir.getMonth(), hozir.getDate()).getTime();
  const kun = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((bugun - Date.parse(bitim.muddat as string)) / kun));
}

/** Muddati o‘tgan va hali yopilmagan bitimlar */
export function muddatiOtgan(bitimlar: Bitim[], tolovlar: Tolov[], hozir = new Date()): Bitim[] {
  const bugun = new Date(hozir.getFullYear(), hozir.getMonth(), hozir.getDate()).getTime();
  return bitimlar.filter((b) => {
    if (!b.muddat || b.holat === 'bekor' || b.holat === 'yopilgan') return false;
    if (bitimQoldiq(b, tolovlar) <= 0) return false;
    return Date.parse(b.muddat) < bugun;
  });
}

/**
 * Balans cheklovi buzildimi.
 *
 * Cheklov — hamkorga berilishi mumkin bo'lgan eng katta QARZ,
 * ya'ni uning qoldig'i shu sondan oshmasligi kerak. Manfiy
 * tomonga (men unga qarzdorman) cheklov qo'yilmaydi: o'z qarzim
 * mening ishim.
 *
 * Bu QAT'IY TO'SIQ EMAS, ogohlantirish uchun (qaror 20.09):
 * savdo o'rtasida ilova to'sib qo'ysa, odam yozuvni umuman
 * yozmay qo'yardi va daftar yolg'on bo'lardi.
 */
export function cheklovTekshir(
  cheklov: number | null | undefined,
  joriyQoldiq: number,
  /** Bitimning ishorali qiymati: berdim +, oldim − */
  ozgarish: number,
): { oshdi: boolean; yangi: number; oshgan: number; cheklov: number } | null {
  if (!cheklov || cheklov <= 0) return null;
  const yangi = joriyQoldiq + ozgarish;
  return { oshdi: yangi > cheklov, yangi, oshgan: yangi - cheklov, cheklov };
}
