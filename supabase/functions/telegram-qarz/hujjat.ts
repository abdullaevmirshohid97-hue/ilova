// ============================================================================
// QARZDORLIK — BOT HUJJATLARI (Excel va PDF)
//
// Agent dorixonada turib sverkani KO'RSATISHI kerak, ekrandagi xabarni
// emas. Shuning uchun hujjat shu yerda — chekka funksiyada — yasaladi.
//
// DVIGATEL endi bu yerda EMAS: XLSX/PDF yig'uvchi kod umumiy paketga
// ko'chirildi (packages/kassa-yadro/hujjat.ts), chunki Credit Debit
// ilovasi ham aynan shu narsani qiladi. Ikki nusxa bo'lsa, biri
// tuzatilganda ikkinchisi eskirib qolardi.
//
// Bu faylda faqat QARZDORLIKKA xos qism qoldi: sverka va klientlar
// hisobotining tuzilishi.
//
// Eslatma: kutubxona ishlatilmaydi (ExcelJS ham, pdfkit ham Deno'da
// sinadi) va PDF'da kirill lotinga o'giriladi — sabab paketdagi
// izohda batafsil yozilgan.
// ============================================================================

import {
  faylNomi,
  pdf,
  raqam,
  sanaVaqt,
  sanaYozuv,
  winansi,
  xlsx,
  type Katak,
  type PdfHujjat,
  type PdfUstun,
} from '../../../packages/kassa-yadro/hujjat.ts';

// Eski chaqiruvchilar (index.ts va sinovlar) shu fayldan olardi —
// yo'l o'zgarmasin uchun qayta eksport qilinadi.
export { faylNomi, pdf, raqam, sanaVaqt, sanaYozuv, winansi, xlsx };
export type { Katak, PdfHujjat, PdfUstun };

export type Amal = {
  tur: string;
  summa: number;
  sana: string;
  izoh?: string | null;
  usul?: string | null;
  bekor?: boolean;
  bekor_sabab?: string | null;
};

export type Sverka = {
  klient: {
    ism?: string | null;
    familiya?: string | null;
    apteka?: string | null;
    telefon?: string | null;
  };
  boshlangich: number;
  chiqim: number;
  kirim: number;
  usullar?: Record<string, number> | null;
  qoldiq: number;
  amallar: Amal[];
};

export type Hisobot = {
  chiqim: number;
  kirim: number;
  naqd: number;
  plastik: number;
  klik: number;
  qarz: number;
  klientlar: number;
};

export type KlientQator = {
  ism: string;
  familiya?: string | null;
  apteka?: string | null;
  telefon?: string | null;
  // Davrdagi harakat. Qarz esa BUGUNGI holat — u davrga bog'liq emas.
  chiqim?: number | null;
  kirim?: number | null;
  naqd?: number | null;
  plastik?: number | null;
  klik?: number | null;
  qarz: number;
};

const USUL_NOM: Record<string, string> = {
  naqd: 'Naqd',
  plastik: 'Plastik',
  klik: 'Click',
};

export function klientNomi(k: Sverka['klient'] | KlientQator): string {
  return (
    (k.apteka || '') ||
    [k.ism, k.familiya].filter(Boolean).join(' ') ||
    '-'
  );
}

/**
 * Yugurib boradigan qoldiq.
 *
 * Bekor qilingan amal qoldiqni O'ZGARTIRMAYDI: u hisobdan chiqqan,
 * lekin qatori ko'rinib turishi kerak — sababi bilan.
 */
export function qoldiqlar(boshlangich: number, amallar: Amal[]): number[] {
  let q = Number(boshlangich) || 0;
  return amallar.map((a) => {
    if (!a.bekor) q += a.tur === 'chiqim' ? Number(a.summa) : -Number(a.summa);
    return q;
  });
}



// ---------------------------------------------------------------------------
// Sverka hujjatlari
// ---------------------------------------------------------------------------

const SVERKA_USTUNLAR = ['№', 'Sana', 'Amal', 'Usul', 'Chiqim', 'Kirim', 'Qoldiq', 'Izoh'];

function sverkaQatorlar(s: Sverka): (string | number | null)[][] {
  const q = qoldiqlar(s.boshlangich, s.amallar ?? []);
  return (s.amallar ?? []).map((a, i) => {
    // Amalga tegishli bo'lmagan ustun BO'SH qoladi, nol emas: nol
    // yozilsa har qatorda ikkita raqam turib, ko'z qaysi biri
    // haqiqiy summa ekanini ajrata olmasdi
    const chiqim = a.tur === 'chiqim' ? Number(a.summa) || 0 : null;
    const kirim = a.tur === 'kirim' ? Number(a.summa) || 0 : null;
    const izoh = a.bekor
      ? 'BEKOR QILINGAN: ' + (a.bekor_sabab ?? '')
      : a.izoh ?? '';
    return [i + 1, sanaVaqt(a.sana), a.tur === 'chiqim' ? 'Tovar chiqimi' : 'Pul kirimi',
            a.usul ? USUL_NOM[a.usul] ?? a.usul : '', chiqim, kirim, q[i], izoh];
  });
}

function sverkaXulosa(s: Sverka): [string, number][] {
  const u = s.usullar ?? {};
  const xulosa: [string, number][] = [
    ['Boshlang’ich qoldiq', Number(s.boshlangich) || 0],
    ['Tovar chiqimi', Number(s.chiqim) || 0],
    ['Pul kirimi', Number(s.kirim) || 0],
  ];
  for (const k of ['naqd', 'plastik', 'klik']) {
    const v = Number((u as any)[k]) || 0;
    if (v > 0) xulosa.push(['   ' + (USUL_NOM[k] ?? k), v]);
  }
  xulosa.push(['QOLDIQ (QARZ)', Number(s.qoldiq) || 0]);
  return xulosa;
}

export function sverkaXlsx(s: Sverka, firma: string, davr: string): Uint8Array {
  const qatorlar: Katak[][] = [
    [{ matn: firma, qalin: true }],
    [{ matn: 'SVERKA — ' + klientNomi(s.klient), qalin: true }],
    [davr + '   ·   Hujjat sanasi: ' + sanaYozuv(new Date())],
    [s.klient.telefon ? 'Tel: ' + s.klient.telefon : ''],
    [],
  ];
  for (const [nom, qiy] of sverkaXulosa(s)) {
    qatorlar.push([{ matn: nom, qalin: nom === nom.toUpperCase() }, null, null, null, null, null, qiy]);
  }
  qatorlar.push([]);
  qatorlar.push(SVERKA_USTUNLAR.map((u) => ({ matn: u, qalin: true })));
  for (const q of sverkaQatorlar(s)) {
    qatorlar.push(q.map((x, i) => (i >= 4 && i <= 6 && x !== null ? Number(x) : (x as Katak))));
  }
  return xlsx('Sverka', qatorlar, [5, 17, 15, 10, 14, 14, 14, 30]);
}

export function sverkaPdf(s: Sverka, firma: string, davr: string): Uint8Array {
  return pdf({
    sarlavha: 'SVERKA — ' + klientNomi(s.klient),
    qator2: firma + '   ·   ' + davr,
    qator3:
      (s.klient.telefon ? 'Tel: ' + s.klient.telefon + '   ·   ' : '') +
      'Hujjat sanasi: ' + sanaYozuv(new Date()),
    xulosa: sverkaXulosa(s).map(([n, v]) => [n, raqam(v)] as [string, string]),
    ustunlar: [
      { nom: '№', en: 4 },
      { nom: 'Sana', en: 16 },
      { nom: 'Amal', en: 16 },
      { nom: 'Usul', en: 10 },
      { nom: 'Chiqim', en: 13, ong: true },
      { nom: 'Kirim', en: 13, ong: true },
      { nom: 'Qoldiq', en: 13, ong: true },
      { nom: 'Izoh', en: 22 },
    ],
    qatorlar: sverkaQatorlar(s).map((q) =>
      q.map((x, i) => (i >= 4 && i <= 6 ? (x === null ? '' : raqam(x)) : String(x ?? ''))),
    ),
  });
}

// ---------------------------------------------------------------------------
// Hisobot hujjatlari
// ---------------------------------------------------------------------------

const HISOBOT_USTUNLAR = [
  '№',
  'Klient',
  'Apteka',
  'Tovar chiqimi',
  'Pul kirimi',
  "To'lov turi",
  'Qarzdorlik',
];

function hisobotXulosa(r: Hisobot): [string, number][] {
  return [
    ['Tovar chiqimi', Number(r.chiqim) || 0],
    ['Pul kirimi', Number(r.kirim) || 0],
    ['   Naqd', Number(r.naqd) || 0],
    ['   Plastik', Number(r.plastik) || 0],
    ['   Click', Number(r.klik) || 0],
    ['QARZDORLIK (bugungi holat)', Number(r.qarz) || 0],
    ['Klientlar', Number(r.klientlar) || 0],
  ];
}

/**
 * To'lov turlari bitta katakda: "Naqd 500 000 · Click 200 000".
 *
 * Faqat BO'LGAN usullar yoziladi — uchta nol qator har qatorni
 * uzaytirib, ko'z haqiqiy raqamni topa olmasdi.
 */
export function usulMatni(k: KlientQator): string {
  const qism: string[] = [];
  if (Number(k.naqd) > 0) qism.push('Naqd ' + raqam(k.naqd));
  if (Number(k.plastik) > 0) qism.push('Plastik ' + raqam(k.plastik));
  if (Number(k.klik) > 0) qism.push('Click ' + raqam(k.klik));
  return qism.join(' · ');
}

export function hisobotXlsx(
  r: Hisobot,
  klientlar: KlientQator[],
  firma: string,
  davr: string,
): Uint8Array {
  const qatorlar: Katak[][] = [
    [{ matn: firma, qalin: true }],
    [{ matn: 'QARZDORLIK HISOBOTI', qalin: true }],
    [davr + '   ·   Hujjat sanasi: ' + sanaYozuv(new Date())],
    [],
  ];
  for (const [nom, qiy] of hisobotXulosa(r)) {
    qatorlar.push([{ matn: nom, qalin: nom === nom.toUpperCase() }, null, null, null, null, null, qiy]);
  }
  qatorlar.push([]);
  qatorlar.push(HISOBOT_USTUNLAR.map((u) => ({ matn: u, qalin: true })));

  klientlar.forEach((k, i) => {
    qatorlar.push([
      i + 1,
      [k.ism, k.familiya].filter(Boolean).join(' '),
      k.apteka ?? '',
      // Nol yozilmaydi: har qatorda ikkita nol turib, ko'z haqiqiy
      // summani ajrata olmasdi
      Number(k.chiqim) ? Number(k.chiqim) : null,
      Number(k.kirim) ? Number(k.kirim) : null,
      usulMatni(k),
      Number(k.qarz) || 0,
    ]);
  });

  if (klientlar.length) {
    const j = (f: (k: KlientQator) => number) =>
      klientlar.reduce((s, k) => s + (Number(f(k)) || 0), 0);
    qatorlar.push([
      { matn: 'JAMI', qalin: true },
      null,
      null,
      j((k) => Number(k.chiqim) || 0),
      j((k) => Number(k.kirim) || 0),
      null,
      j((k) => Number(k.qarz) || 0),
    ]);
  }
  return xlsx('Hisobot', qatorlar, [5, 24, 26, 16, 16, 30, 18]);
}

export function hisobotPdf(
  r: Hisobot,
  klientlar: KlientQator[],
  firma: string,
  davr: string,
): Uint8Array {
  const qatorlar = klientlar.map((k, i) => [
    String(i + 1),
    [k.ism, k.familiya].filter(Boolean).join(' '),
    k.apteka ?? '',
    Number(k.chiqim) ? raqam(k.chiqim) : '',
    Number(k.kirim) ? raqam(k.kirim) : '',
    usulMatni(k),
    raqam(k.qarz),
  ]);
  if (klientlar.length) {
    const j = (f: (k: KlientQator) => number) =>
      klientlar.reduce((s, k) => s + (Number(f(k)) || 0), 0);
    qatorlar.push([
      '',
      'JAMI',
      '',
      raqam(j((k) => Number(k.chiqim) || 0)),
      raqam(j((k) => Number(k.kirim) || 0)),
      '',
      raqam(j((k) => Number(k.qarz) || 0)),
    ]);
  }
  return pdf({
    sarlavha: 'QARZDORLIK HISOBOTI',
    qator2: firma + '   ·   ' + davr,
    qator3: 'Hujjat sanasi: ' + sanaYozuv(new Date()),
    xulosa: hisobotXulosa(r).map(([n, v]) => [n, raqam(v)] as [string, string]),
    ustunlar: [
      { nom: '№', en: 4 },
      { nom: 'Klient', en: 19 },
      { nom: 'Apteka', en: 20 },
      { nom: 'Tovar chiqimi', en: 13, ong: true },
      { nom: 'Pul kirimi', en: 13, ong: true },
      { nom: "To'lov turi", en: 18 },
      { nom: 'Qarzdorlik', en: 13, ong: true },
    ],
    qatorlar,
  });
}
