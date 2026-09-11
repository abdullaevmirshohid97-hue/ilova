// ============================================================================
// QARZDORLIK HUJJATLARI — sverka va umumiy hisobot
//
// Alohida faylda turishi ataylab: shu tufayli hujjatni sinovda HAQIQATAN
// yasab, qayta o'qib tekshirish mumkin. Komponent ichida qolsa, uni
// faqat "kodda shunday yozilganmi" deb tekshirish qolardi — bu esa
// katak noto'g'ri ustunga tushganini yoki jadval varaqdan chiqib
// ketganini USHLAMAYDI.
//
// Excel — ExcelJS (rang, ramka, formula kerak). PDF esa brauzerning
// chop etish oynasi orqali: panelda bu allaqachon ishlatiladi va
// mijozning kompyuterida qo'shimcha kutubxona talab qilmaydi.
// ============================================================================

export type QarzAmal = {
  id?: string;
  tur: string;
  summa: number;
  sana: string;
  izoh?: string | null;
  manba?: string | null;
  usul?: string | null;
  bekor?: boolean;
  bekor_sabab?: string | null;
};

export type QarzSverka = {
  klient: {
    ism?: string | null;
    familiya?: string | null;
    apteka?: string | null;
    telefon?: string | null;
    agent?: string | null;
  };
  boshlangich: number;
  chiqim: number;
  kirim: number;
  usullar?: Record<string, number> | null;
  qoldiq: number;
  amallar: QarzAmal[];
};

export const USUL_NOM: Record<string, string> = {
  naqd: 'Naqd',
  plastik: 'Plastik',
  klik: 'Click',
};

export const SVERKA_USTUNLAR = [
  '№',
  'Sana',
  'Amal',
  'Usul',
  'Chiqim',
  'Kirim',
  'Qoldiq',
  'Izoh',
];

const KOK = 'FFE8F1F8';
const TUQ = 'FF2F5D7C';
const OQ = 'FFFFFFFF';
const QORA = 'FF111827';
const KUL_MATN = 'FF6B7280';
const QIZIL_MATN = 'FFB91C1C';
const QIZIL_OCH = 'FFFDECEC';
const YASHIL_MATN = 'FF047857';
const ZEBRA = 'FFFAFAFA';
const CHIZIQ = 'FFD9DEE3';
const KULRANG = 'FFD9D9D9';
const QIZIL = 'FFFFC7CE';

const OYLAR = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

// Sana qo'lda formatlanadi: toLocaleDateString ICU qirqilgan muhitda
// RangeError beradi va butun hujjat yasalmay qolardi.
export function sanaVaqt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()} ${ik(d.getHours())}:${ik(d.getMinutes())}`;
}

export function sanaYozuv(d: Date): string {
  return `${d.getDate()} ${OYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

export function klientNomi(k: QarzSverka['klient']): string {
  return k.apteka || [k.ism, k.familiya].filter(Boolean).join(' ') || '—';
}

/**
 * Yugurib boradigan qoldiq.
 *
 * Har qatorda "shu amaldan keyin qancha qarz qoldi" ko'rinadi — sverka
 * ayni shu ustun uchun qilinadi. Bekor qilingan amal qoldiqni
 * O'ZGARTIRMAYDI: u hisobdan chiqqan, lekin ko'rinib turishi kerak
 * (nima uchun bekor qilingani ham).
 */
export function qoldiqlar(boshlangich: number, amallar: QarzAmal[]): number[] {
  let q = Number(boshlangich) || 0;
  return amallar.map((a) => {
    if (!a.bekor) q += a.tur === 'chiqim' ? Number(a.summa) : -Number(a.summa);
    return q;
  });
}

function ustunHarfi(n: number): string {
  let s = '';
  let i = n;
  while (i > 0) {
    const q = (i - 1) % 26;
    s = String.fromCharCode(65 + q) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/** Sverka Excel kitobi */
export async function sverkaKitobi(
  s: QarzSverka,
  firma: string,
  davr: string,
  sana = new Date(),
): Promise<ArrayBuffer> {
  // Faqat kerak bo'lganda yuklanadi: kutubxona ~900 KB
  const ExcelJS = (await import('exceljs')).default;
  const kitob = new ExcelJS.Workbook();
  const v = kitob.addWorksheet('Sverka');

  // Qamrov qo'lda yozilmaydi — ustun qo'shilsa o'zi kengayadi
  const OXIRGI = ustunHarfi(SVERKA_USTUNLAR.length);

  const chegara = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  v.columns = [
    { width: 5 }, { width: 18 }, { width: 16 }, { width: 10 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 28 },
  ];

  v.mergeCells(`A1:${OXIRGI}1`);
  const a1 = v.getCell('A1');
  a1.value = firma;
  a1.font = { name: 'Arial', size: 18, bold: true };
  a1.alignment = { horizontal: 'center', vertical: 'middle' };
  a1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };
  v.getRow(1).height = 30;

  v.mergeCells(`A2:${OXIRGI}2`);
  const a2 = v.getCell('A2');
  a2.value = 'SVERKA';
  a2.font = { name: 'Arial', size: 14, bold: true };
  a2.alignment = { horizontal: 'center', vertical: 'middle' };
  a2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };

  const k = s.klient;
  v.mergeCells(`A3:${OXIRGI}3`);
  v.getCell('A3').value =
    `${klientNomi(k)}` +
    (k.telefon ? ` · ${k.telefon}` : '') +
    (k.agent ? ` · agent: ${k.agent}` : '');
  v.mergeCells(`A4:${OXIRGI}4`);
  v.getCell('A4').value = `Davr: ${davr}   ·   Hujjat sanasi: ${sanaYozuv(sana)}`;
  for (const c of ['A3', 'A4']) {
    v.getCell(c).alignment = { horizontal: 'center' };
    v.getCell(c).font = { italic: true };
  }

  // ---- xulosa ----
  const usullar = s.usullar ?? {};
  const usulMatn = Object.entries(usullar)
    .filter(([, x]) => Number(x) > 0)
    .map(([u, x]) => `${USUL_NOM[u] ?? u}: ${Number(x)}`)
    .join(', ');

  const xulosa: [string, number | string][] = [
    ['Boshlang‘ich qoldiq', Number(s.boshlangich) || 0],
    ['Tovar chiqimi', Number(s.chiqim) || 0],
    ['Pul kirimi', Number(s.kirim) || 0],
    ['Kirim usullari', usulMatn || '—'],
    ['QOLDIQ', Number(s.qoldiq) || 0],
  ];
  let qator = 6;
  for (const [nom, qiy] of xulosa) {
    v.getCell(`A${qator}`).value = nom;
    v.mergeCells(`A${qator}:C${qator}`);
    v.getCell(`D${qator}`).value = qiy;
    v.mergeCells(`D${qator}:${OXIRGI}${qator}`);
    const qalin = nom === 'QOLDIQ';
    for (const c of [`A${qator}`, `D${qator}`]) {
      v.getCell(c).border = chegara;
      v.getCell(c).font = { bold: qalin };
      if (qalin) {
        v.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KULRANG } };
      }
    }
    if (typeof qiy === 'number') v.getCell(`D${qator}`).numFmt = '#,##0';
    qator++;
  }

  // ---- harakatlar ----
  qator++;
  const BOSH = qator;
  const sarlavha = v.getRow(BOSH);
  sarlavha.values = SVERKA_USTUNLAR;
  sarlavha.height = 26;
  sarlavha.eachCell((c) => {
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KULRANG } };
    c.border = chegara;
  });

  const q = qoldiqlar(s.boshlangich, s.amallar);
  s.amallar.forEach((a, i) => {
    const r = v.getRow(BOSH + 1 + i);
    r.values = [
      i + 1,
      sanaVaqt(a.sana),
      a.tur === 'chiqim' ? 'Tovar chiqimi' : 'Pul kirimi',
      a.usul ? USUL_NOM[a.usul] ?? a.usul : '',
      a.tur === 'chiqim' ? Number(a.summa) : null,
      a.tur === 'kirim' ? Number(a.summa) : null,
      q[i],
      a.bekor ? `BEKOR: ${a.bekor_sabab ?? ''}` : a.izoh ?? '',
    ];
    r.eachCell({ includeEmpty: true }, (c, idx) => {
      c.border = chegara;
      if (idx >= 5 && idx <= 7) c.numFmt = '#,##0';
      // Bekor qilingan qator KO'RINIB turadi, lekin ajralib tursin:
      // uni yashirish "raqam nega to'g'ri kelmayapti" degan savolni
      // javobsiz qoldirardi
      if (a.bekor) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: QIZIL } };
        c.font = { strike: true };
      }
    });
  });

  v.views = [{ state: 'frozen', ySplit: BOSH }];
  return kitob.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export type QarzHisobot = {
  chiqim: number;
  kirim: number;
  naqd: number;
  plastik: number;
  klik: number;
  qarz: number;
  klientlar: number;
  agentlar: number;
};

export type QarzKlientQator = {
  ism: string;
  familiya?: string | null;
  apteka?: string | null;
  telefon?: string | null;
  agent?: string | null;
  chiqim?: number | null;
  kirim?: number | null;
  naqd?: number | null;
  plastik?: number | null;
  klik?: number | null;
  qarz: number;
};

export const HISOBOT_USTUNLAR = [
  '№',
  'Klient',
  'Apteka',
  'Tovar chiqimi',
  'Pul kirimi',
  'To‘lov turi',
  'Qarzdorlik',
];

/**
 * To'lov turlari bitta katakda: "Naqd 500 000 · Click 200 000".
 *
 * Faqat BO'LGAN usullar yoziladi. Uchta nol qator har qatorni
 * uzaytirib, ko'z haqiqiy raqamni topa olmasdi.
 */
export function usulMatni(k: QarzKlientQator, son: (n: unknown) => string): string {
  const qism: string[] = [];
  if (Number(k.naqd) > 0) qism.push(`Naqd ${son(k.naqd)}`);
  if (Number(k.plastik) > 0) qism.push(`Plastik ${son(k.plastik)}`);
  if (Number(k.klik) > 0) qism.push(`Click ${son(k.klik)}`);
  return qism.join(' · ');
}

/** Ming ajratgichli son — hujjatlarda bir xil ko'rinsin */
function sonMatn(n: unknown): string {
  const x = Math.round(Number(n) || 0);
  return (x < 0 ? '-' : '') + Math.abs(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Umumiy hisobot Excel: yuqorida xulosa, pastida har bir klient qatori.
 *
 * Har qatorda davrdagi chiqim va kirim, to'lov turlari va BUGUNGI
 * qarzdorlik turadi. Qarz ustuni davrga bog'liq emas — u "shu oyning
 * farqi" emas, klient qancha qarzdorligi. Sarlavhada shunday yozilgan,
 * aks holda ikki xil ma'noni bir ustunda deb o'ylash oson edi.
 *
 * JAMI qatori FORMULA bilan yoziladi: qo'lda yozilsa qator
 * qo'shilganda eskirardi va qaysi biri to'g'riligi bilinmasdi.
 */
export async function hisobotKitobi(
  h: QarzHisobot,
  klientlar: QarzKlientQator[],
  firma: string,
  davr: string,
  sana = new Date(),
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const kitob = new ExcelJS.Workbook();
  const v = kitob.addWorksheet('Hisobot', {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const OXIRGI = ustunHarfi(HISOBOT_USTUNLAR.length);
  const chegara = {
    top: { style: 'thin' as const, color: { argb: CHIZIQ } },
    left: { style: 'thin' as const, color: { argb: CHIZIQ } },
    bottom: { style: 'thin' as const, color: { argb: CHIZIQ } },
    right: { style: 'thin' as const, color: { argb: CHIZIQ } },
  };
  const toldir = (argb: string) =>
    ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

  v.columns = [
    { width: 5 },
    { width: 24 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 30 },
    { width: 18 },
  ];

  // ---- sarlavha ----
  v.mergeCells(`A1:${OXIRGI}1`);
  const a1 = v.getCell('A1');
  a1.value = firma;
  a1.font = { name: 'Arial', size: 18, bold: true, color: { argb: OQ } };
  a1.alignment = { horizontal: 'center', vertical: 'middle' };
  a1.fill = toldir(TUQ);
  v.getRow(1).height = 32;

  v.mergeCells(`A2:${OXIRGI}2`);
  const a2 = v.getCell('A2');
  a2.value = `QARZDORLIK HISOBOTI — ${davr}`;
  a2.font = { name: 'Arial', size: 12, bold: true, color: { argb: OQ } };
  a2.alignment = { horizontal: 'center', vertical: 'middle' };
  a2.fill = toldir(TUQ);
  v.getRow(2).height = 22;

  v.mergeCells(`A3:${OXIRGI}3`);
  v.getCell('A3').value = `Hujjat sanasi: ${sanaYozuv(sana)}`;
  v.getCell('A3').alignment = { horizontal: 'center' };
  v.getCell('A3').font = { italic: true, size: 9, color: { argb: KUL_MATN } };

  // ---- xulosa: uchta ustunga yoyilgan ----
  const xulosa: { nom: string; qiy: number; asosiy?: boolean; ichki?: boolean }[] = [
    { nom: 'Tovar chiqimi', qiy: Number(h.chiqim) || 0, asosiy: true },
    { nom: 'Pul kirimi', qiy: Number(h.kirim) || 0, asosiy: true },
    { nom: 'Naqd', qiy: Number(h.naqd) || 0, ichki: true },
    { nom: 'Plastik', qiy: Number(h.plastik) || 0, ichki: true },
    { nom: 'Click', qiy: Number(h.klik) || 0, ichki: true },
    { nom: 'QARZDORLIK (bugungi holat)', qiy: Number(h.qarz) || 0, asosiy: true },
    { nom: 'Klientlar', qiy: Number(h.klientlar) || 0 },
    { nom: 'Agentlar', qiy: Number(h.agentlar) || 0 },
  ];

  let qator = 5;
  for (const x of xulosa) {
    const qarzmi = x.nom.startsWith('QARZDORLIK');
    v.mergeCells(`A${qator}:E${qator}`);
    v.mergeCells(`F${qator}:${OXIRGI}${qator}`);
    const nomKatak = v.getCell(`A${qator}`);
    const qiyKatak = v.getCell(`F${qator}`);
    nomKatak.value = (x.ichki ? '      ' : '') + x.nom;
    qiyKatak.value = x.qiy;
    qiyKatak.numFmt = '#,##0';
    qiyKatak.alignment = { horizontal: 'right' };
    for (const c of [nomKatak, qiyKatak]) {
      c.border = chegara;
      c.font = {
        bold: Boolean(x.asosiy),
        size: x.ichki ? 10 : 11,
        color: { argb: qarzmi ? QIZIL_MATN : x.ichki ? KUL_MATN : QORA },
      };
      if (qarzmi) c.fill = toldir(QIZIL_OCH);
      else if (x.asosiy) c.fill = toldir(KOK);
    }
    qator++;
  }

  // ---- jadval ----
  qator++;
  const BOSH = qator;
  const sarlavha = v.getRow(BOSH);
  sarlavha.values = HISOBOT_USTUNLAR;
  sarlavha.height = 28;
  sarlavha.eachCell((c) => {
    c.font = { bold: true, size: 10, color: { argb: OQ } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = toldir(TUQ);
    c.border = chegara;
  });

  klientlar.forEach((k, i) => {
    const r = v.getRow(BOSH + 1 + i);
    r.values = [
      i + 1,
      [k.ism, k.familiya].filter(Boolean).join(' '),
      k.apteka ?? '',
      // Nol yozilmaydi: har qatorda ikkita nol turib, ko'z haqiqiy
      // summani ajrata olmasdi. SUM bo'sh katakni baribir o'tkazadi.
      Number(k.chiqim) ? Number(k.chiqim) : null,
      Number(k.kirim) ? Number(k.kirim) : null,
      usulMatni(k, sonMatn),
      Number(k.qarz) || 0,
    ];
    const qarz = Number(k.qarz) || 0;
    r.eachCell({ includeEmpty: true }, (c, idx) => {
      c.border = chegara;
      if (idx === 4 || idx === 5 || idx === 7) {
        c.numFmt = '#,##0';
        c.alignment = { horizontal: 'right' };
      }
      // Zebra: uzun ro'yxatda ko'z qatorni adashtirmasin
      if (i % 2 === 1) c.fill = toldir(ZEBRA);
      if (idx === 7) {
        c.font = { bold: true, color: { argb: qarz > 0 ? QIZIL_MATN : YASHIL_MATN } };
      }
      if (idx === 6) c.font = { size: 9, color: { argb: KUL_MATN } };
    });
  });

  // ---- jami ----
  const oxirgi = BOSH + klientlar.length;
  if (klientlar.length > 0) {
    const j = v.getRow(oxirgi + 1);
    j.height = 22;
    j.getCell(1).value = 'JAMI';
    v.mergeCells(`A${oxirgi + 1}:C${oxirgi + 1}`);
    for (const [ustun, harf] of [[4, 'D'], [5, 'E'], [7, 'G']] as [number, string][]) {
      j.getCell(ustun).value = { formula: `SUM(${harf}${BOSH + 1}:${harf}${oxirgi})` };
      j.getCell(ustun).numFmt = '#,##0';
      j.getCell(ustun).alignment = { horizontal: 'right' };
    }
    for (let i = 1; i <= HISOBOT_USTUNLAR.length; i++) {
      j.getCell(i).font = { bold: true, size: 11 };
      j.getCell(i).border = chegara;
      j.getCell(i).fill = toldir(KOK);
    }
  }

  // Sarlavha qatori doim ko'rinib tursin
  v.views = [{ state: 'frozen', ySplit: BOSH }];
  v.autoFilter = { from: { row: BOSH, column: 1 }, to: { row: Math.max(BOSH, oxirgi), column: HISOBOT_USTUNLAR.length } };
  return kitob.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Umumiy hisobotning chop etiladigan ko'rinishi */
export function hisobotTanasi(
  h: QarzHisobot,
  klientlar: QarzKlientQator[],
  davr: string,
): string {
  const esc = (x: unknown) =>
    String(x ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const son = sonMatn;

  const jamiQarz = klientlar.reduce((s, k) => s + (Number(k.qarz) || 0), 0);
  const jamiChiqim = klientlar.reduce((s, k) => s + (Number(k.chiqim) || 0), 0);
  const jamiKirim = klientlar.reduce((s, k) => s + (Number(k.kirim) || 0), 0);

  const karta = (yorliq: string, qiymat: string, izoh = '', rang = '#111827') => `
    <div style="flex:1;min-width:150px;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px">
      <div style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">${esc(yorliq)}</div>
      <div style="font-size:17px;font-weight:800;color:${rang};margin-top:2px">${qiymat}</div>
      ${izoh ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">${izoh}</div>` : ''}
    </div>`;

  return `
    <h2 style="text-align:center;margin:6px 0 2px">QARZDORLIK HISOBOTI</h2>
    <p style="text-align:center;margin:0 0 12px;color:#4b5563"><b>${esc(davr)}</b></p>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${karta('Tovar chiqimi', son(h.chiqim), 'tanlangan davrda')}
      ${karta(
        'Pul kirimi',
        son(h.kirim),
        `Naqd ${son(h.naqd)} · Plastik ${son(h.plastik)} · Click ${son(h.klik)}`,
        '#047857',
      )}
      ${karta('Qarzdorlik', son(h.qarz), 'bugungi holat — davrga bog‘liq emas', '#b91c1c')}
      ${karta('Klient / Agent', `${h.klientlar} / ${h.agentlar}`)}
    </div>

    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${HISOBOT_USTUNLAR.map(
        (u, i) => `<th${i >= 3 && i !== 5 ? ' class="r"' : ''}>${esc(u)}</th>`,
      ).join('')}</tr></thead>
      <tbody>
        ${
          klientlar
            .map(
              (k, i) => `<tr${i % 2 === 1 ? ' style="background:#fafafa"' : ''}>
                <td>${i + 1}</td>
                <td>${esc([k.ism, k.familiya].filter(Boolean).join(' '))}</td>
                <td>${esc(k.apteka ?? '')}</td>
                <td class="r">${Number(k.chiqim) ? son(k.chiqim) : ''}</td>
                <td class="r">${Number(k.kirim) ? son(k.kirim) : ''}</td>
                <td style="font-size:10px;color:#4b5563">${esc(usulMatni(k, son))}</td>
                <td class="r" style="font-weight:700;color:${
                  (Number(k.qarz) || 0) > 0 ? '#b91c1c' : '#047857'
                }">${son(k.qarz)}</td>
              </tr>`,
            )
            .join('') || '<tr><td colspan="7">Klient yo‘q</td></tr>'
        }
      </tbody>
      ${
        klientlar.length
          ? `<tfoot><tr>
              <td colspan="3"><b>JAMI</b></td>
              <td class="r"><b>${son(jamiChiqim)}</b></td>
              <td class="r"><b>${son(jamiKirim)}</b></td>
              <td></td>
              <td class="r"><b>${son(jamiQarz)}</b></td>
            </tr></tfoot>`
          : ''
      }
    </table>
  `;
}

/** Sverkaning chop etiladigan (PDF) ko'rinishi */
export function sverkaTanasi(s: QarzSverka, davr: string): string {
  const esc = (x: unknown) =>
    String(x ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  const son = (n: unknown) =>
    (Math.round(Number(n) || 0) < 0 ? '-' : '') +
    Math.abs(Math.round(Number(n) || 0))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const q = qoldiqlar(s.boshlangich, s.amallar);
  const usullar = s.usullar ?? {};
  const usulMatn = Object.entries(usullar)
    .filter(([, x]) => Number(x) > 0)
    .map(([u, x]) => `${USUL_NOM[u] ?? u}: ${son(x)}`)
    .join(' · ');

  const qatorlar = s.amallar
    .map(
      (a, i) => `<tr${a.bekor ? ' style="opacity:.55;text-decoration:line-through"' : ''}>
        <td>${i + 1}</td>
        <td>${esc(sanaVaqt(a.sana))}</td>
        <td>${a.tur === 'chiqim' ? 'Tovar chiqimi' : 'Pul kirimi'}</td>
        <td>${esc(a.usul ? USUL_NOM[a.usul] ?? a.usul : '')}</td>
        <td class="r">${a.tur === 'chiqim' ? son(a.summa) : ''}</td>
        <td class="r">${a.tur === 'kirim' ? son(a.summa) : ''}</td>
        <td class="r"><b>${son(q[i])}</b></td>
        <td>${esc(a.bekor ? `BEKOR: ${a.bekor_sabab ?? ''}` : a.izoh ?? '')}</td>
      </tr>`,
    )
    .join('');

  return `
    <h2 style="text-align:center;margin:8px 0">SVERKA</h2>
    <p style="text-align:center;margin:0 0 12px">
      <b>${esc(klientNomi(s.klient))}</b>
      ${s.klient.telefon ? ' · ' + esc(s.klient.telefon) : ''}
      ${s.klient.agent ? ' · agent: ' + esc(s.klient.agent) : ''}
      <br><span style="font-size:12px">Davr: ${esc(davr)}</span>
    </p>
    <table class="xulosa" style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <tr><td>Boshlang‘ich qoldiq</td><td class="r">${son(s.boshlangich)}</td></tr>
      <tr><td>Tovar chiqimi</td><td class="r">${son(s.chiqim)}</td></tr>
      <tr><td>Pul kirimi</td><td class="r">${son(s.kirim)}</td></tr>
      ${usulMatn ? `<tr><td>Kirim usullari</td><td class="r">${esc(usulMatn)}</td></tr>` : ''}
      <tr><td><b>QOLDIQ</b></td><td class="r"><b>${son(s.qoldiq)}</b></td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>${SVERKA_USTUNLAR.map((u) => `<th>${esc(u)}</th>`).join('')}</tr></thead>
      <tbody>${qatorlar || '<tr><td colspan="8">Bu davrda harakat yo‘q</td></tr>'}</tbody>
    </table>
  `;
}
