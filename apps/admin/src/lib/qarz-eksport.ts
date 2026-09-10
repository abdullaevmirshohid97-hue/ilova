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

const KOK = 'FFB8D9EC';
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
