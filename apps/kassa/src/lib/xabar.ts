// =============================================================
//  MIJOZGA XABAR — sverka matni
//
//  Do'kondor mijozga «qancha qarzing bor» deb yozadi. Buni qo'lda
//  terish uzoq va xatoga moyil, shuning uchun matn TAYYOR holda
//  chiqadi va odam uni ko'rib turib yuboradi.
//
//  MATN AVVAL KO'RINADI, keyin ketadi. Tayyor xabar to'g'ridan
//  to'g'ri jo'nab qolsa, xato raqam yoki noto'g'ri qoldiq mijozga
//  borardi va uni qaytarib bo'lmasdi.
//
//  HAR OPERATSIYA — ALOHIDA BLOK, bitta qator emas.
//
//  Avval hammasi bitta qatorga siqilgan edi (sana · nom · summa).
//  Lekin bahsda aynan tafsilot kerak bo'ladi: «qaysi tovar?»,
//  «nechta?», «nima deb kelishgandik?». Ular bitta qatorga
//  sig'masdi, sig'dirilsa esa SMS'da o'ralib, o'qib bo'lmas
//  holga kelardi.
//
//  SMS da JADVAL YO'Q — faqat bo'shliq va yangi qator. Tab
//  ishlatilmaydi: u har ilovada har xil kenglikda chiziladi.
// =============================================================

import { formatla, operatsiyaNomi, type HamkorQator } from '@ilova/kassa-yadro';
import type { Valyuta } from '@ilova/kassa-yadro';
import { sanaRaqam } from './davr';
import { xtr, type XabarTil } from './xabar-til';

export type XabarManba = {
  ism: string;
  telefon?: string | null;
  biznes: string;
  valyuta: Valyuta;
  /**
   * Xabar tili — ILOVA tilidan alohida. Mijoz boshqa tilda
   * gaplashishi mumkin, ilovani esa do'kondor o'zi uchun
   * sozlagan.
   */
  til?: XabarTil;
  qatorlar: { qator: HamkorQator; ozgarish: number }[];
  qoldiq: number;
  /** Muddati o'tgan va hali to'lanmagan summa */
  kechikkan?: number;
};

const CHIZIQ = '—'.repeat(26);

/** «1 200 dona», «12.5 kg» — ortiqcha nolsiz */
function miqdorMatni(miqdor: number | null | undefined, birlik: string | null | undefined, til: XabarTil): string | null {
  if (miqdor === null || miqdor === undefined || !Number.isFinite(miqdor) || miqdor === 0) return null;
  const son = String(Number(miqdor.toFixed(3)));
  return son + ' ' + xtr(til, birlik ?? 'dona');
}

/** Bitta operatsiya bloki */
function blok(
  x: { qator: HamkorQator; ozgarish: number },
  valyuta: Valyuta,
  til: XabarTil,
): string[] {
  const q = x.qator;
  const satr: string[] = [];
  const pul = (n: number) => formatla(Math.abs(n), valyuta, { belgisiz: true, kasrsiz: true });

  satr.push(sanaRaqam(q.sana) + '  ' + xtr(til, operatsiyaNomi(q)));

  if (q.tur === 'bitim') {
    // Tovar nomi va miqdori BIR QATORDA: ikkalasi ham qisqa va
    // birga o'qilganda «nima, nechta» degan savolga javob beradi.
    const tafsilot = [q.bitim.tovar_nom, miqdorMatni(q.bitim.miqdor, q.bitim.birlik, til)]
      .filter(Boolean)
      .join(' · ');
    if (tafsilot) satr.push(tafsilot);
  }

  const izoh = q.tur === 'bitim' ? q.bitim.izoh : q.tur === 'tolov' ? q.tolov.izoh : q.yozuv.izoh;
  if (izoh) satr.push(xtr(til, 'Izoh:') + ' ' + izoh);

  // KIRIM va SUMMA ataylab boshqa yorliq: mijoz uchun «summa»
  // qarz, «kirim» esa uning to'lagani. Bitta so'z bilan yozilsa
  // ikkalasi qo'shilib ketardi.
  satr.push((x.ozgarish >= 0 ? xtr(til, 'Summa:') : xtr(til, 'Kirim:')) + ' ' + pul(x.ozgarish));

  if (q.tur === 'bitim' && q.bitim.muddat) {
    satr.push(xtr(til, 'Muddat:') + ' ' + sanaRaqam(q.bitim.muddat));
  } else if (q.tur === 'tolov' && q.tolov.muddat) {
    satr.push(xtr(til, 'Muddat:') + ' ' + sanaRaqam(q.tolov.muddat));
  }

  return satr;
}

export function xabarMatni(m: XabarManba): string {
  const til: XabarTil = m.til ?? 'uz';
  const pul = (n: number) => formatla(Math.abs(n), m.valyuta, { belgisiz: true, kasrsiz: true });

  const satrlar: string[] = [m.ism];
  if (m.telefon?.trim()) satrlar.push(m.telefon.trim());
  satrlar.push(CHIZIQ);

  m.qatorlar.forEach((x, i) => {
    if (i > 0) satrlar.push('');
    satrlar.push(...blok(x, m.valyuta, til));
  });

  satrlar.push(CHIZIQ);

  if (m.kechikkan && m.kechikkan > 0) {
    satrlar.push(xtr(til, 'Muddati kelgan:') + ' ' + pul(m.kechikkan));
  }

  satrlar.push(m.biznes);

  // JAMI QARZDORLIK ENG PASTDA (foydalanuvchi qarori, 21.09).
  //
  // Bu — oxirgi kirim-chiqimdan keyingi qoldiq, ya’ni xabarning
  // asosiy javobi. Ro‘yxat uzun bo‘lsa odam uni oxirigacha
  // varaqlaydi va ko‘zi eng pastda to‘xtaydi — raqam o‘sha
  // yerda turishi kerak.
  //
  // Ishorasi bilan: manfiy bo‘lsa MEN qarzdorman va buni
  // mijozga «siz qarzdorsiz» deb yuborish xato bo‘lardi.
  satrlar.push(CHIZIQ);
  satrlar.push(
    (m.qoldiq >= 0 ? xtr(til, 'Umumiy qarz:') : xtr(til, 'Sizga beramiz:')) +
      ' ' +
      pul(m.qoldiq),
  );

  return satrlar.join('\n');
}

/**
 * Raqamdan faqat raqamlarni qoldiradi: `wa.me` va `sms:` uchun.
 *
 * WhatsApp `+` va bo'shliqni qabul qilmaydi, telefon ilovasi esa
 * qabul qiladi — lekin ikkalasiga bir xil tozalangan raqam
 * berilsa, ikki xil qoidani eslab yurish shart emas.
 */
export function raqamToza(telefon?: string | null): string {
  return (telefon ?? '').replace(/\D/g, '');
}
