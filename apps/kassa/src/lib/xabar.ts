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
//  SMS da JADVAL YO'Q — faqat bo'shliq. Shuning uchun ustunlar
//  bo'shliq bilan tekislanadi, `\t` bilan emas: tab har ilovada
//  har xil kenglikda chiziladi va ustun qiyshayib ketardi.
// =============================================================

import { formatla, operatsiyaNomi, type HamkorQator } from '@ilova/kassa-yadro';
import type { Valyuta } from '@ilova/kassa-yadro';
import { sanaQisqa } from './davr';
import { tr } from './til';

export type XabarManba = {
  ism: string;
  biznes: string;
  valyuta: Valyuta;
  qatorlar: { qator: HamkorQator; ozgarish: number }[];
  qoldiq: number;
};

/**
 * Ustunni tekislaydi.
 *
 * IKKALA ustun ham tekislanishi shart. Avval faqat o‘ng ustun
 * tekislangan edi va sinov ushladi: chap tomon uzunligi har xil
 * («Tovar berdim» / «Pul oldim») bo‘lgani uchun summalar baribir
 * qiyshiq turardi.
 */
function tekisla(matnlar: string[], tomon: 'chap' | 'ong'): string[] {
  const en = Math.max(...matnlar.map((m) => m.length), 0);
  return matnlar.map((m) => {
    const bosh = ' '.repeat(Math.max(0, en - m.length));
    return tomon === 'ong' ? bosh + m : m + bosh;
  });
}

export function xabarMatni(m: XabarManba): string {
  const chap: string[] = [];
  const ong: string[] = [];

  for (const { qator, ozgarish } of m.qatorlar) {
    chap.push(sanaQisqa(qator.sana) + '  ' + tr(operatsiyaNomi(qator)));
    ong.push(
      (ozgarish >= 0 ? '+' : '−') +
        formatla(Math.abs(ozgarish), m.valyuta, { belgisiz: true, kasrsiz: true }),
    );
  }

  const chapTekis = tekisla(chap, 'chap');
  const ongTekis = tekisla(ong, 'ong');
  const satrlar = chapTekis.map((c, i) => c + '  ' + ongTekis[i]);

  // Qoldiq ISHORASI bilan: manfiy bo'lsa MEN qarzdorman va uni
  // mijozga «siz qarzdorsiz» deb yuborish xato bo'lardi.
  const yorliq = m.qoldiq >= 0 ? tr('Sizdan olamiz:') : tr('Sizga beramiz:');

  return [
    `${m.ism}, ${tr('hisobingiz:')}`,
    '',
    ...satrlar,
    '—'.repeat(24),
    `${yorliq} ${formatla(Math.abs(m.qoldiq), m.valyuta, { belgisiz: true, kasrsiz: true })}`,
    '',
    m.biznes,
  ].join('\n');
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
