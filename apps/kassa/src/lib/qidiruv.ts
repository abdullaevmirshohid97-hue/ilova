// =============================================================
//  QIDIRUV — hamkor daftarida topish
//
//  To'rt yo'l bilan, va ular BIRGA ishlaydi (VA mantiqi):
//
//    kalit so'z  — izoh va tovar nomidan
//    miqdor      — «500 mingdan katta» kabi
//    sana        — bitta kun
//    oraliq      — boshdan oxirgacha
//
//  Nega mantiq alohida faylda: uni sinov to'g'ridan to'g'ri
//  chaqirishi kerak. Ekran ichida yozilsa, faqat qo'lda bosib
//  tekshirish qolardi — va «500000 dan katta» aslida «katta yoki
//  teng» ekanini hech kim payqamasdi.
//
//  MIQDOR ABSOLYUT QIYMAT BO'YICHA solishtiriladi. Daftarda
//  o'zgarish ishorali (+ qarz, − to'lov), lekin odam «500 mingdan
//  katta» deyganda ishorani o'ylamaydi — u summani o'ylaydi.
// =============================================================

import type { HamkorQator } from '@ilova/kassa-yadro';

export type MiqdorTuri = 'yoq' | 'katta' | 'kichik' | 'teng';

export type Qidiruv = {
  matn: string;
  miqdorTuri: MiqdorTuri;
  /** So'mda, matn sifatida — maydondan qanday kelsa shunday */
  miqdor: string;
  /** ISO sana (`2026-09-20`) yoki bo'sh */
  sanaBosh: string;
  sanaOxir: string;
};

export const BOSH_QIDIRUV: Qidiruv = {
  matn: '',
  miqdorTuri: 'yoq',
  miqdor: '',
  sanaBosh: '',
  sanaOxir: '',
};

/** Bittasi ham to'ldirilmagan bo'lsa qidiruv YO'Q — ro'yxat to'liq. */
export function qidiruvBormi(q: Qidiruv): boolean {
  return (
    q.matn.trim() !== '' ||
    (q.miqdorTuri !== 'yoq' && q.miqdor.trim() !== '') ||
    q.sanaBosh !== '' ||
    q.sanaOxir !== ''
  );
}

/** Qatordan izlanadigan matn: izoh va tovar nomi. */
function matnlar(q: HamkorQator): string {
  if (q.tur === 'bitim') {
    return [q.bitim.tovar_nom ?? '', q.bitim.izoh ?? ''].join(' ');
  }
  if (q.tur === 'tolov') return q.tolov.izoh ?? '';
  return q.yozuv.izoh ?? '';
}

/**
 * Qator qidiruvga mos keladimi.
 *
 * `ozgarish` — shu qatorning qarzga ta'siri (tiyinda). Uni
 * `hamkorYuruvchi` beradi.
 */
export function qidiruvMos(
  qator: HamkorQator,
  ozgarish: number,
  q: Qidiruv,
): boolean {
  // --- Kalit so'z ---
  const kalit = q.matn.trim().toLowerCase();
  if (kalit && !matnlar(qator).toLowerCase().includes(kalit)) return false;

  // --- Miqdor ---
  if (q.miqdorTuri !== 'yoq' && q.miqdor.trim()) {
    const som = Number(q.miqdor.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(som)) {
      const tiyin = Math.round(som * 100);
      const bu = Math.abs(ozgarish);
      // «katta» — QAT'IY katta. Odam «500 mingdan katta» deganda
      // 500 mingning o'zini kutmaydi; teng kerak bo'lsa «teng» bor.
      if (q.miqdorTuri === 'katta' && !(bu > tiyin)) return false;
      if (q.miqdorTuri === 'kichik' && !(bu < tiyin)) return false;
      if (q.miqdorTuri === 'teng' && bu !== tiyin) return false;
    }
  }

  // --- Sana ---
  //
  // Faqat KUN solishtiriladi, vaqt emas: odam 20-sentabrni
  // tanlaganda o'sha kunning hammasini kutadi. ISO satrning
  // birinchi 10 belgisi — aynan kun, va u mahalliy vaqt
  // zonasiga bog'liq emas.
  const kun = String(qator.sana).slice(0, 10);
  if (q.sanaBosh && kun < q.sanaBosh) return false;
  if (q.sanaOxir && kun > q.sanaOxir) return false;

  return true;
}
