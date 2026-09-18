// ============================================================================
// HUJJAT DVIGATELI — XLSX va PDF, KUTUBXONASIZ
//
// Manba: `supabase/functions/telegram-qarz/hujjat.ts` (qarzdorlik boti).
// U yerda kutubxona ishlatib bo'lmasdi — ExcelJS ham, pdfkit ham Node
// oqimlariga tayanadi va Deno'da sinadi. Endi AYNI muammo mobil ilovada:
// React Native'da ham u kutubxonalar yo'q.
//
// Shuning uchun dvigatel shu yerga — umumiy paketga — ko'chirildi.
// Bot ham, ilova ham SHU faylni ishlatadi: ikki nusxa bo'lsa biri
// tuzatilganda ikkinchisi eskirib qolardi.
//
//   XLSX — ZIP ichidagi XML, yozuvlar siqilmagan (store), CRC32 qo'lda
//   PDF  — obyektlar ro'yxati + xref jadvali, latin1 satr sifatida
//
// PDF standart Helvetica shriftidan foydalanadi, u faqat WinAnsi
// belgilarni biladi: kirill matn LOTINGA o'giriladi (`winansi`).
// Excel'da bunday cheklov yo'q — u UTF-8.
//
// `tests/qarz-fayl.mjs` yasalgan faylni QAYTA OCHIB tekshiradi:
// ZIP CRC32, xref siljishlari, /Length va sahifalash.
// ============================================================================

/**
 * UTF-8 ga o'girish. `TextEncoder` React Native'ning eski
 * versiyalarida yo'q — shuning uchun bo'lmasa qo'lda kodlanadi.
 * Busiz Excel fayli telefonda yasalmay, sabab ham ko'rinmasdi.
 */
export function matnBayt(matn: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(matn);
  const bayt: number[] = [];
  for (let i = 0; i < matn.length; i++) {
    let kod = matn.codePointAt(i) as number;
    if (kod > 0xffff) i++; // surrogat juftlik
    if (kod < 0x80) bayt.push(kod);
    else if (kod < 0x800) bayt.push(0xc0 | (kod >> 6), 0x80 | (kod & 0x3f));
    else if (kod < 0x10000) bayt.push(0xe0 | (kod >> 12), 0x80 | ((kod >> 6) & 0x3f), 0x80 | (kod & 0x3f));
    else bayt.push(0xf0 | (kod >> 18), 0x80 | ((kod >> 12) & 0x3f), 0x80 | ((kod >> 6) & 0x3f), 0x80 | (kod & 0x3f));
  }
  return new Uint8Array(bayt);
}

const OYLAR = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

/** Ming ajratgichli son. Intl ISHLATILMAYDI — muhitga bog'liq bo'lardi. */
export function raqam(n: unknown): string {
  const x = Math.round(Number(n) || 0);
  const belgi = x < 0 ? '-' : '';
  return belgi + Math.abs(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function sanaVaqt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()} ${ik(d.getHours())}:${ik(d.getMinutes())}`;
}

export function sanaYozuv(d: Date): string {
  return `${d.getDate()} ${OYLAR[d.getMonth()]} ${d.getFullYear()}`;
}



/** Fayl nomi uchun xavfsiz matn */
export function faylNomi(x: string): string {
  return (x || 'hujjat')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}
// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

const CRC_JADVAL = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_JADVAL[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type ZipFayl = { nom: string; bayt: Uint8Array };

/**
 * Eng sodda ZIP: siqilmagan (store) yozuvlar.
 *
 * Siqish ataylab yo'q — sverka fayli o'nlab kilobayt, siqish esa
 * CompressionStream'ni async qilib, xatoning yangi turini olib kelardi.
 */
function zip(fayllar: ZipFayl[]): Uint8Array {
  const kod = { encode: matnBayt };
  const bolaklar: Uint8Array[] = [];
  const markaz: Uint8Array[] = [];
  let siljish = 0;

  for (const f of fayllar) {
    const nom = kod.encode(f.nom);
    const c = crc32(f.bayt);

    const lfh = new Uint8Array(30 + nom.length);
    const d1 = new DataView(lfh.buffer);
    d1.setUint32(0, 0x04034b50, true);
    d1.setUint16(4, 20, true);
    d1.setUint16(6, 0x0800, true); // nom UTF-8
    d1.setUint16(8, 0, true); // store
    d1.setUint16(10, 0, true); // vaqt
    d1.setUint16(12, 0x5a21, true); // sana
    d1.setUint32(14, c, true);
    d1.setUint32(18, f.bayt.length, true);
    d1.setUint32(22, f.bayt.length, true);
    d1.setUint16(26, nom.length, true);
    d1.setUint16(28, 0, true);
    lfh.set(nom, 30);

    const cd = new Uint8Array(46 + nom.length);
    const d2 = new DataView(cd.buffer);
    d2.setUint32(0, 0x02014b50, true);
    d2.setUint16(4, 20, true);
    d2.setUint16(6, 20, true);
    d2.setUint16(8, 0x0800, true);
    d2.setUint16(10, 0, true);
    d2.setUint16(12, 0, true);
    d2.setUint16(14, 0x5a21, true);
    d2.setUint32(16, c, true);
    d2.setUint32(20, f.bayt.length, true);
    d2.setUint32(24, f.bayt.length, true);
    d2.setUint16(28, nom.length, true);
    d2.setUint16(30, 0, true);
    d2.setUint16(32, 0, true);
    d2.setUint16(34, 0, true);
    d2.setUint16(36, 0, true);
    d2.setUint32(38, 0, true);
    d2.setUint32(42, siljish, true);
    cd.set(nom, 46);

    bolaklar.push(lfh, f.bayt);
    markaz.push(cd);
    siljish += lfh.length + f.bayt.length;
  }

  const markazHajm = markaz.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array(22);
  const d3 = new DataView(eocd.buffer);
  d3.setUint32(0, 0x06054b50, true);
  d3.setUint16(4, 0, true);
  d3.setUint16(6, 0, true);
  d3.setUint16(8, fayllar.length, true);
  d3.setUint16(10, fayllar.length, true);
  d3.setUint32(12, markazHajm, true);
  d3.setUint32(16, siljish, true);
  d3.setUint16(20, 0, true);

  const hammasi = [...bolaklar, ...markaz, eocd];
  const jami = hammasi.reduce((s, b) => s + b.length, 0);
  const natija = new Uint8Array(jami);
  let p = 0;
  for (const b of hammasi) {
    natija.set(b, p);
    p += b.length;
  }
  return natija;
}

function xmlEsc(x: unknown): string {
  return String(x ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 ruxsat bermaydigan boshqaruv belgilari: qolsa Excel
    // faylni umuman ochmaydi ("unreadable content")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export type Katak = string | number | null | { matn: string; qalin?: boolean };

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

const STILLAR = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Bir varaqli XLSX yasaydi */
export function xlsx(varaq: string, qatorlar: Katak[][], enlar: number[] = []): Uint8Array {
  const kod = { encode: matnBayt };

  const cols = enlar.length
    ? '<cols>' +
      enlar
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('') +
      '</cols>'
    : '';

  const satrlar = qatorlar
    .map((q, ri) => {
      const r = ri + 1;
      const kataklar = q
        .map((k, ci) => {
          if (k === null || k === undefined || k === '') return '';
          const ref = ustunHarfi(ci + 1) + r;
          if (typeof k === 'number') {
            if (!Number.isFinite(k)) return '';
            return `<c r="${ref}" s="2"><v>${k}</v></c>`;
          }
          const obyekt = typeof k === 'object';
          const matn = obyekt ? (k as any).matn : k;
          const qalin = obyekt && (k as any).qalin;
          return `<c r="${ref}" s="${qalin ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(matn)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r}">${kataklar}</row>`;
    })
    .join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${satrlar}</sheetData></worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(varaq).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zip([
    {
      nom: '[Content_Types].xml',
      bayt: kod.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    },
    {
      nom: '_rels/.rels',
      bayt: kod.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    { nom: 'xl/workbook.xml', bayt: kod.encode(workbook) },
    {
      nom: 'xl/_rels/workbook.xml.rels',
      bayt: kod.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    { nom: 'xl/styles.xml', bayt: kod.encode(STILLAR) },
    { nom: 'xl/worksheets/sheet1.xml', bayt: kod.encode(sheet) },
  ]);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

// Kirilldan lotinga. Helvetica kirillni bilmaydi — o'girilmasa
// hujjatda bo'sh joy qolardi va buni faqat mijoz sezardi.
const KIRILL: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'J', З: 'Z',
  И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'X', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh',
  Щ: 'Sh', Ъ: "'", Ы: 'I', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  Ў: "O'", ў: "o'", Қ: 'Q', қ: 'q', Ғ: "G'", ғ: "g'", Ҳ: 'H', ҳ: 'h',
  '№': 'No ',
};

/** WinAnsi'ga sig'adigan matnga keltiradi */
export function winansi(x: unknown): string {
  let s = String(x ?? '');
  s = s.replace(/[Ѐ-ӿ№]/g, (c) => KIRILL[c] ?? '');
  // Turli apostrof va tirelar -> WinAnsi'da bori
  s = s
    .replace(/[ʻʼ‘’']/g, '’')
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/•/g, '-');
  let n = '';
  for (const c of s) {
    const k = c.codePointAt(0)!;
    if (k === 0x2019) n += String.fromCharCode(0x92); // WinAnsi: o'ng apostrof
    else if (k === 0x201c || k === 0x201d) n += '"';
    else if (k >= 0x20 && k <= 0x7e) n += c;
    else if (k >= 0xa0 && k <= 0xff) n += c;
    else if (k === 0x9) n += ' ';
    // qolgani tashlanadi
  }
  return n;
}

function pdfMatn(x: string): string {
  return winansi(x).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Helvetica kengligi — taxminiy, faqat qirqish uchun kerak */
function eni(s: string, olcham: number, qalin: boolean): number {
  return s.length * olcham * (qalin ? 0.56 : 0.52);
}

function qirq(s: string, kenglik: number, olcham: number, qalin = false): string {
  const m = winansi(s);
  if (eni(m, olcham, qalin) <= kenglik) return m;
  let x = m;
  while (x.length > 1 && eni(x + '..', olcham, qalin) > kenglik) x = x.slice(0, -1);
  return x + '..';
}

export type PdfUstun = { nom: string; en: number; ong?: boolean };

export type PdfHujjat = {
  sarlavha: string;
  qator2?: string;
  qator3?: string;
  xulosa?: [string, string][];
  ustunlar: PdfUstun[];
  qatorlar: string[][];
};

const EN = 595;
const BOY = 842;
const CHAP = 40;
const KENGLIK = EN - CHAP * 2;

/**
 * Sodda, bir jadvalli PDF.
 *
 * Sahifalash HAQIQIY: qatorlar sig'masa yangi sahifa ochiladi va
 * sarlavha qayta chiziladi. Aks holda uzun sverka varaqdan chiqib
 * ketardi va buni faqat chop etgandan keyin bilinardi.
 */
export function pdf(h: PdfHujjat): Uint8Array {
  const jamiEn = h.ustunlar.reduce((s, u) => s + u.en, 0) || 1;
  const enlar = h.ustunlar.map((u) => (u.en / jamiEn) * KENGLIK);
  const x0: number[] = [];
  let acc = CHAP;
  for (const e of enlar) {
    x0.push(acc);
    acc += e;
  }

  const QATOR_BOY = 15;
  const sahifalar: string[][] = [];
  let joriy: string[][] = [];

  // Birinchi sahifada sarlavha va xulosa ham bor — unga kamroq qator sig'adi
  const xulosaBoy = (h.xulosa?.length ?? 0) * 14;
  const birinchiJoy = Math.max(1, Math.floor((BOY - 150 - xulosaBoy - 60) / QATOR_BOY));
  const keyingiJoy = Math.max(1, Math.floor((BOY - 90 - 60) / QATOR_BOY));

  let qoldi = [...h.qatorlar];
  let birinchi = true;
  do {
    const n = birinchi ? birinchiJoy : keyingiJoy;
    joriy = qoldi.slice(0, n);
    qoldi = qoldi.slice(n);
    sahifalar.push(joriy as any);
    birinchi = false;
  } while (qoldi.length > 0);

  const oqimlar: string[] = [];
  sahifalar.forEach((qatorlar, si) => {
    let s = '';
    let y = BOY - 50;

    const yoz = (matn: string, x: number, yy: number, olcham: number, qalin = false) => {
      s += `BT /${qalin ? 'F2' : 'F1'} ${olcham} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pdfMatn(matn)}) Tj ET\n`;
    };
    const chiziq = (yy: number, qalinlik = 0.6) => {
      s += `${qalinlik} w ${CHAP} ${yy.toFixed(1)} m ${(EN - CHAP).toFixed(1)} ${yy.toFixed(1)} l S\n`;
    };

    if (si === 0) {
      yoz(h.sarlavha, CHAP, y, 15, true);
      y -= 20;
      if (h.qator2) {
        yoz(h.qator2, CHAP, y, 10);
        y -= 14;
      }
      if (h.qator3) {
        yoz(h.qator3, CHAP, y, 10);
        y -= 14;
      }
      y -= 6;
      for (const [nom, qiy] of h.xulosa ?? []) {
        yoz(nom, CHAP, y, 10, nom === nom.toUpperCase());
        const q = winansi(qiy);
        yoz(q, EN - CHAP - eni(q, 10, true), y, 10, true);
        y -= 14;
      }
      y -= 8;
    } else {
      yoz(h.sarlavha + ' (davomi)', CHAP, y, 11, true);
      y -= 20;
    }

    // Jadval sarlavhasi
    chiziq(y + 11, 0.8);
    h.ustunlar.forEach((u, i) => {
      const nom = qirq(u.nom, enlar[i] - 6, 8.5, true);
      const x = u.ong ? x0[i] + enlar[i] - 4 - eni(nom, 8.5, true) : x0[i] + 2;
      yoz(nom, x, y, 8.5, true);
    });
    y -= 4;
    chiziq(y, 0.8);
    y -= 11;

    for (const q of qatorlar) {
      h.ustunlar.forEach((u, i) => {
        const matn = qirq(q[i] ?? '', enlar[i] - 6, 8);
        const x = u.ong ? x0[i] + enlar[i] - 4 - eni(matn, 8, false) : x0[i] + 2;
        yoz(matn, x, y, 8);
      });
      y -= QATOR_BOY;
      s += `0.9 G 0.2 w ${CHAP} ${(y + 10).toFixed(1)} m ${(EN - CHAP).toFixed(1)} ${(y + 10).toFixed(1)} l S 0 G\n`;
    }

    const oyoq = `${si + 1} / ${sahifalar.length}`;
    yoz(oyoq, EN / 2 - eni(oyoq, 8, false) / 2, 28, 8);
    oqimlar.push(s);
  });

  // ---- obyektlarni yig'ish ----
  const N = sahifalar.length;
  const obyektlar: string[] = [];
  const kids = sahifalar.map((_, i) => `${5 + i * 2} 0 R`).join(' ');

  obyektlar.push('<< /Type /Catalog /Pages 2 0 R >>');
  obyektlar.push(`<< /Type /Pages /Kids [${kids}] /Count ${N} >>`);
  obyektlar.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obyektlar.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  oqimlar.forEach((oqim, i) => {
    obyektlar.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${EN} ${BOY}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`,
    );
    obyektlar.push(`<< /Length ${oqim.length} >>\nstream\n${oqim}endstream`);
  });

  let hujjat = '%PDF-1.4\n';
  const siljishlar: number[] = [];
  obyektlar.forEach((o, i) => {
    siljishlar.push(hujjat.length);
    hujjat += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const xref = hujjat.length;
  hujjat += `xref\n0 ${obyektlar.length + 1}\n0000000000 65535 f \n`;
  for (const s of siljishlar) {
    hujjat += String(s).padStart(10, '0') + ' 00000 n \n';
  }
  hujjat += `trailer\n<< /Size ${obyektlar.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // Latin1: har belgi bitta bayt — shu sabab yuqoridagi siljishlar
  // (belgi hisobida) bayt siljishiga aynan teng
  const bayt = new Uint8Array(hujjat.length);
  for (let i = 0; i < hujjat.length; i++) bayt[i] = hujjat.charCodeAt(i) & 0xff;
  return bayt;
}

