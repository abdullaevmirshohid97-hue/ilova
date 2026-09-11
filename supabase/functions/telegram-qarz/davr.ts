// ============================================================================
// QARZDORLIK BOTI — DAVR
//
// Alohida faylda turishi ataylab: index.ts ichida Deno.serve bor, uni
// sinovdan import qilib bo'lmaydi. Sana mantiqi esa aynan sinov
// kerak bo'ladigan joy — "30-kun kirdimi", "teskari yozilsa nima
// bo'ladi", "callback 64 baytga sig'dimi" degan savollar shu yerda
// hal bo'ladi.
// ============================================================================

const OYLAR = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const ik = (n: number) => String(n).padStart(2, '0');

export type Davr = { dan: string | null; gacha: string | null; nom: string };

/**
 * Davr kalitidan oraliq.
 *
 * Ixtiyoriy oraliq kaliti: dYYYYMMDDYYYYMMDD (17 belgi).
 * Sana KALIT ICHIDA turadi, suhbat holatida emas: "Excel" tugmasi
 * ancha keyin bosilishi mumkin, o'sha payt holat allaqachon boshqa
 * amalga o'tgan bo'lardi. Telegram callback_data uchun 64 bayt
 * beradi — shuning uchun sana qisqa yozilgan.
 */
export function davrOraliq(kalit: string, hozir: Date = new Date()): Davr {
  const h = hozir;
  if (kalit === 'bugun') {
    const k = `${h.getFullYear()}-${ik(h.getMonth() + 1)}-${ik(h.getDate())}`;
    return {
      dan: `${k}T00:00:00`,
      gacha: `${k}T23:59:59`,
      nom: `${ik(h.getDate())}.${ik(h.getMonth() + 1)}.${h.getFullYear()}`,
    };
  }
  if (kalit === 'oy') {
    return {
      dan: `${h.getFullYear()}-${ik(h.getMonth() + 1)}-01T00:00:00`,
      gacha: null,
      nom: `${OYLAR[h.getMonth()]} ${h.getFullYear()}`,
    };
  }
  if (kalit === 'yil') {
    return { dan: `${h.getFullYear()}-01-01T00:00:00`, gacha: null, nom: String(h.getFullYear()) };
  }
  if (kalit.startsWith('d') && kalit.length === 17) {
    const a = kalit.slice(1, 9);
    const b = kalit.slice(9);
    const f = (x: string) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;
    const kun = (x: string) => `${x.slice(6, 8)}.${x.slice(4, 6)}.${x.slice(0, 4)}`;
    return {
      dan: `${f(a)}T00:00:00`,
      // Oxirgi kun ICHIGA kiradi: aks holda "1—30" deb tanlagan odam
      // 30-kunning yozuvlarini ko'rmasdi
      gacha: `${f(b)}T23:59:59`,
      nom: `${kun(a)} — ${kun(b)}`,
    };
  }
  return { dan: null, gacha: null, nom: 'Butun davr' };
}

/** 'YYYY-MM-DD' — mahalliy kun kaliti */
export function kunKaliti(d: Date): string {
  return `${d.getFullYear()}-${ik(d.getMonth() + 1)}-${ik(d.getDate())}`;
}

/** "Bugun" / "Kecha" / "09.09.2026" */
export function kunYorligi(kalit: string, hozir: Date = new Date()): string {
  const kecha = new Date(hozir);
  kecha.setDate(kecha.getDate() - 1);
  if (kalit === kunKaliti(hozir)) return 'Bugun';
  if (kalit === kunKaliti(kecha)) return 'Kecha';
  const [y, o, k] = kalit.split('-');
  return `${k}.${o}.${y}`;
}

/**
 * Bitta sana: "09.09.2026" yoki "9.9.26" -> "2026-09-09".
 *
 * Kelajak sana RAD ETILADI. Baza ham uni to'xtatadi (SANA_KELAJAKDA),
 * lekin agent buni yozgan zahoti bilsin — saqlashga urinib, keyin
 * tushunarsiz xato olgandan ko'ra yaxshiroq.
 */
export function sanaOqi(matn: string, hozir: Date = new Date()): string | null {
  const m = String(matn ?? '').match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (!m) return null;
  const k = Number(m[1]);
  const o = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (k < 1 || k > 31 || o < 1 || o > 12) return null;

  const d = new Date(y, o - 1, k);
  // "31.02" ni Date jimgina 1-martga surib yuborardi
  if (d.getFullYear() !== y || d.getMonth() !== o - 1 || d.getDate() !== k) return null;

  const kalit = kunKaliti(d);
  if (kalit > kunKaliti(hozir)) return null;
  return kalit;
}

/**
 * "01.09.2026 - 30.09.2026" -> "d2026090120260930"
 *
 * Ajratgich har xil bo'lishi mumkin (tire, "dan", bo'sh joy), shuning
 * uchun matndan shunchaki sanalar ajratib olinadi. Boshi oxiridan
 * keyin bo'lsa o'rni almashtiriladi: bu xato emas, odam shunchaki
 * teskari yozgan.
 */
export function oraliqOqi(matn: string): string | null {
  const topilgan = String(matn ?? '').match(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/g);
  if (!topilgan || topilgan.length < 2) return null;

  const kalitla = (x: string): string | null => {
    const [k, o, y] = x.split(/[.\-/]/);
    const kk = Number(k);
    const oo = Number(o);
    const yy = Number(y);
    if (kk < 1 || kk > 31 || oo < 1 || oo > 12) return null;
    // Sana haqiqatan mavjudmi: 31.02 kabi kunni Date "1-mart" qilib
    // yuboradi va oraliq jimgina siljib ketardi
    const d = new Date(yy, oo - 1, kk);
    if (d.getFullYear() !== yy || d.getMonth() !== oo - 1 || d.getDate() !== kk) return null;
    return y + ik(oo) + ik(kk);
  };

  let a = kalitla(topilgan[0]);
  let b = kalitla(topilgan[1]);
  if (!a || !b) return null;
  if (a > b) [a, b] = [b, a];
  return 'd' + a + b;
}
