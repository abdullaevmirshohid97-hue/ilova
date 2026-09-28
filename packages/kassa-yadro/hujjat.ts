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

// ---------------------------------------------------------------------------
// XLSX — USLUBLAR
//
// 2026-09-28: «barcha ma'lumot uchun kataklar yetarli bo'lsin, ranglar
// ham alohida e'tiborga olinsin». Ilgari faqat qalin/oddiy bor edi:
// rang yo'q, chegara yo'q, matn o'ralmasdi va ustun eni qo'lda
// berilgan son edi — uzun izoh ko'rinmas, katta summa «####» bo'lardi.
//
// ESKI CHAQIRUVLAR O'ZGARMAYDI. Oddiy matn, son va `{ matn, qalin }`
// avvalgidek birinchi to'rtta uslubga tushadi — qarzdorlik boti
// (`supabase/functions/telegram-qarz`) shu dvigatelni ishlatadi va
// uning hujjati o'z-o'zidan buzilmasligi kerak. Yangi imkoniyatlar
// faqat so'ralganda ishlaydi.
//
// RANGLAR — ilova temasi bilan BIR XIL (Telegram ranglari,
// `apps/kassa/src/lib/tema.ts`): kirim ko'k, chiqim qizil, sarlavha
// Telegram ko'ki. Hujjat ilovadan chiqqanini ko'z darhol taniydi.
// ---------------------------------------------------------------------------

export type KatakRang = 'kirim' | 'chiqim' | 'xira' | 'oq' | 'urgu';
export type KatakFon = 'sarlavha' | 'jami' | 'zebra' | 'kirim' | 'chiqim';

export type KatakStil = {
  qalin?: boolean;
  rang?: KatakRang;
  fon?: KatakFon;
  /** Ingichka chegara — jadval kataklari uchun */
  chegara?: boolean;
  /** Uzun matn keyingi qatorga o'raladi */
  orash?: boolean;
  /** Son ikki kasr xonasi bilan */
  kasr?: boolean;
  /** Matnni o'ngga tekislash */
  ong?: boolean;
  /** Shrift o'lchami (standart 11) */
  olcham?: number;
};

export type Katak =
  | string
  | number
  | null
  | ({ matn: string } & KatakStil)
  | ({ son: number } & KatakStil);

export type XlsxSozlama = {
  /** Shuncha qator tepada muzlatiladi (odatda jadval sarlavhasigacha) */
  muzlat?: number;
  /** Ustun eni KONTENTGA QARAB hisoblanadi; `enlar` — eng kam en */
  avtoEn?: boolean;
  /** Filtr qo'yiladigan sarlavha qatori (1 dan). Ustun eni shu qatordan
   *  boshlab hisoblanadi: tepadagi sarlavha va xulosa uni kengaytirmasin. */
  filtr?: number;
};

const XLSX_RANG: Record<KatakRang, string> = {
  kirim: 'FF2479B6',
  chiqim: 'FFCC2929',
  xira: 'FF808384',
  oq: 'FFFFFFFF',
  urgu: 'FF229AF0',
};
const XLSX_FON: Record<KatakFon, string> = {
  sarlavha: 'FF229AF0',
  jami: 'FFE9F5FE',
  zebra: 'FFF7F7F9',
  kirim: 'FFE9F5FE',
  chiqim: 'FFFAECEC',
};

/** Katakdagi uslub so'ralganmi (eski `{ matn, qalin }` dan tashqari) */
function yangiUslub(k: Record<string, unknown>): boolean {
  return (
    'son' in k ||
    k.rang !== undefined ||
    k.fon !== undefined ||
    k.chegara !== undefined ||
    k.orash !== undefined ||
    k.kasr !== undefined ||
    k.ong !== undefined ||
    k.olcham !== undefined
  );
}

/** Uslublar ro'yxati — faylda faqat ISHLATILGANLARI yoziladi */
class Uslublar {
  private shriftlar = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>'];
  private fonlar = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private chegaralar = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right>' +
      '<top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>',
  ];
  // Birinchi to'rttasi ESKI tartibda — eski chaqiruvlar shu indekslarni oladi
  private xflar = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>',
  ];
  private kesh = new Map<string, number>();

  private qosh(royxat: string[], xml: string): number {
    const i = royxat.indexOf(xml);
    if (i >= 0) return i;
    royxat.push(xml);
    return royxat.length - 1;
  }

  indeks(s: KatakStil, son: boolean): number {
    const kalit = JSON.stringify([son, s.qalin, s.rang, s.fon, s.chegara, s.orash, s.kasr, s.ong, s.olcham]);
    const bor = this.kesh.get(kalit);
    if (bor !== undefined) return bor;

    const rang = s.rang ? `<color rgb="${XLSX_RANG[s.rang]}"/>` : '';
    const shrift = this.qosh(
      this.shriftlar,
      `<font>${s.qalin ? '<b/>' : ''}<sz val="${s.olcham ?? 11}"/>${rang}<name val="Calibri"/></font>`,
    );
    const fon = s.fon
      ? this.qosh(
          this.fonlar,
          `<fill><patternFill patternType="solid"><fgColor rgb="${XLSX_FON[s.fon]}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const chegara = s.chegara ? 1 : 0;
    const format = son ? (s.kasr ? 165 : 164) : 0;
    const tekis = [
      s.orash ? 'wrapText="1"' : '',
      'vertical="top"',
      s.ong || son ? 'horizontal="right"' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const xf =
      `<xf numFmtId="${format}" fontId="${shrift}" fillId="${fon}" borderId="${chegara}" xfId="0"` +
      `${format ? ' applyNumberFormat="1"' : ''} applyFont="1"${fon ? ' applyFill="1"' : ''}` +
      `${chegara ? ' applyBorder="1"' : ''} applyAlignment="1"><alignment ${tekis}/></xf>`;
    const i = this.qosh(this.xflar, xf);
    this.kesh.set(kalit, i);
    return i;
  }

  xml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="${this.shriftlar.length}">${this.shriftlar.join('')}</fonts>
<fills count="${this.fonlar.length}">${this.fonlar.join('')}</fills>
<borders count="${this.chegaralar.length}">${this.chegaralar.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${this.xflar.length}">${this.xflar.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }
}

/** Katak ekranda qancha belgi egallaydi — ustun enini hisoblash uchun */
function katakUzunligi(k: Katak): number {
  if (k === null || k === undefined || k === '') return 0;
  if (typeof k === 'number') return sonUzunligi(k, false);
  if (typeof k === 'string') return engUzunQator(k);
  if ('son' in k) return sonUzunligi(k.son, !!k.kasr);
  return engUzunQator(k.matn) * (k.qalin ? 1.1 : 1);
}
function sonUzunligi(n: number, kasr: boolean): number {
  if (!Number.isFinite(n)) return 0;
  const butun = String(Math.trunc(Math.abs(n))).length;
  return butun + Math.floor((butun - 1) / 3) + (kasr ? 3 : 0) + (n < 0 ? 1 : 0);
}
function engUzunQator(s: string): number {
  return Math.max(0, ...String(s).split('\n').map((q) => q.length));
}

const EN_KAM = 6;
const EN_KOP = 48;

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

/** Bir varaqli XLSX yasaydi */
export function xlsx(varaq: string, qatorlar: Katak[][], enlar: number[] = [], sozlama: XlsxSozlama = {}): Uint8Array {
  const kod = { encode: matnBayt };
  const uslub = new Uslublar();

  // ---- Ustun enlari ----
  const ustunSoni = Math.max(enlar.length, ...qatorlar.map((q) => q.length));
  const en: number[] = [];
  for (let i = 0; i < ustunSoni; i++) {
    let w = enlar[i] ?? 0;
    if (sozlama.avtoEn) {
      // Faqat JADVAL qatorlari: bitta katakli qator — sarlavha, u
      // qo'shni bo'sh kataklarga o'zi yoyiladi va ustunni kengaytirmasin.
      let eng = 0;
      const boshi = Math.max(0, (sozlama.filtr ?? 1) - 1);
      for (const q of qatorlar.slice(boshi)) {
        const band = q.filter((k) => k !== null && k !== undefined && k !== '').length;
        if (band < 2) continue;
        eng = Math.max(eng, katakUzunligi(q[i] ?? null));
      }
      w = Math.min(EN_KOP, Math.max(w, EN_KAM, Math.ceil(eng) + 2));
    }
    en.push(w);
  }
  const cols = en.some((w) => w > 0)
    ? '<cols>' +
      en
        .map((w, i) => (w > 0 ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : ''))
        .join('') +
      '</cols>'
    : '';

  // ---- Qatorlar ----
  const satrlar = qatorlar
    .map((q, ri) => {
      const r = ri + 1;
      let qatorSoni = 1; // o'ralgan matn nechta qator egallaydi
      const kataklar = q
        .map((k, ci) => {
          if (k === null || k === undefined || k === '') return '';
          const ref = ustunHarfi(ci + 1) + r;
          if (typeof k === 'number') {
            if (!Number.isFinite(k)) return '';
            return `<c r="${ref}" s="2"><v>${k}</v></c>`;
          }
          if (typeof k === 'string') {
            return `<c r="${ref}" s="0" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(k)}</t></is></c>`;
          }
          const o = k as Record<string, unknown>;
          if (!yangiUslub(o)) {
            // ESKI shakl: { matn, qalin }
            return `<c r="${ref}" s="${o.qalin ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(o.matn ?? ''))}</t></is></c>`;
          }
          const stil = k as KatakStil;
          if ('son' in k) {
            if (!Number.isFinite(k.son)) return '';
            return `<c r="${ref}" s="${uslub.indeks(stil, true)}"><v>${k.son}</v></c>`;
          }
          const matn = String((k as { matn: string }).matn ?? '');
          // Qator ichida \n bo'lsa, o'ramasdan ko'rsatib bo'lmaydi
          const orash = stil.orash || matn.includes('\n');
          if (orash) {
            const w = Math.max(1, (en[ci] || 10) - 1);
            const n = matn.split('\n').reduce((s, bolak) => s + Math.max(1, Math.ceil(bolak.length / w)), 0);
            qatorSoni = Math.max(qatorSoni, n);
          }
          return `<c r="${ref}" s="${uslub.indeks({ ...stil, orash }, false)}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(matn)}</t></is></c>`;
        })
        .join('');
      // O'ralgan qatorning BALANDLIGI qo'lda: Excel faylni ochganda uni
      // har doim ham o'zi moslamaydi va matnning pastki qismi yashirinib
      // qolardi.
      const ht = qatorSoni > 1 ? ` ht="${Math.min(409, qatorSoni * 15)}" customHeight="1"` : '';
      return `<row r="${r}"${ht}>${kataklar}</row>`;
    })
    .join('');

  const muzlat =
    sozlama.muzlat && sozlama.muzlat > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sozlama.muzlat}" topLeftCell="A${sozlama.muzlat + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '';
  const filtr =
    sozlama.filtr && qatorlar.length > sozlama.filtr
      ? `<autoFilter ref="A${sozlama.filtr}:${ustunHarfi(Math.max(1, (qatorlar[sozlama.filtr - 1] ?? []).length))}${qatorlar.length}"/>`
      : '';

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${muzlat}${cols}<sheetData>${satrlar}</sheetData>${filtr}</worksheet>`;

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
    { nom: 'xl/styles.xml', bayt: kod.encode(uslub.xml()) },
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
    // WinAnsi'da strelka yo'q: tashlansa «Biznes → Hamkor» dan «Biznes  Hamkor» qolardi
    .replace(/→/g, '->')
    .replace(/•/g, '-');
  let n = '';
  for (const c of s) {
    const k = c.codePointAt(0)!;
    if (k === 0x2019) n += String.fromCharCode(0x92); // WinAnsi: o'ng apostrof
    else if (k === 0x201c || k === 0x201d) n += '"';
    else if (k >= 0x20 && k <= 0x7e) n += c;
    else if (k >= 0xa0 && k <= 0xff) n += c;
    // Allaqachon o‘girilgan apostrof. Ilgari u IKKINCHI chaqiruvda
    // tashlanardi va hujjatda «To‘lov» — «Tolov» bo‘lib chiqardi.
    else if (k === 0x92) n += c;
    else if (k === 0x9) n += ' ';
    // qolgani tashlanadi
  }
  return n;
}

function pdfMatn(x: string): string {
  return winansi(x).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// ---------------------------------------------------------------------------
// PDF — HARF ENI, O'RASH VA RANG
//
// Ilgari: har harf bir xil enli deb hisoblanardi (`uzunlik × 0.52`) va
// sig'magan matn «..» bilan KESILARDI — uzun izohning oxiri hujjatda
// umuman yo'q edi. Rang ham yo'q edi.
//
// Endi:
//   · harf eni Helvetica'ning HAQIQIY o'lchovidan (AFM, 1000 birlikda)
//   · matn ustunlari QATORGA O'RALADI, qator balandligi matnga moslashadi
//   · son ustuni hech qachon kesilmaydi: sig'masa, matn ustunlaridan
//     joy olinadi; baribir sig'masa shrift kichrayadi
//   · sarlavha tasmasi, ranglangan summalar, yo'l-yo'l qatorlar
//
// API ESKISIGA MOS: `qatorlar` da oddiy satr ham, `{ matn, rang }` ham
// bo'lishi mumkin; `xulosa` ga uchinchi element (rang) ixtiyoriy.
// ---------------------------------------------------------------------------

/** Helvetica, 32..126 belgilar eni (1000 birlikda) */
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Helvetica kengligi (pt). Qalin shrift ~6% kengroq — ehtiyot uchun ortig'i bilan. */
function eni(s: string, olcham: number, qalin: boolean): number {
  let w = 0;
  for (const c of s) {
    const k = c.charCodeAt(0);
    w += k >= 32 && k <= 126 ? HELV[k - 32] : k === 0x92 ? 222 : 556;
  }
  return (w / 1000) * olcham * (qalin ? 1.06 : 1);
}

function qirq(s: string, kenglik: number, olcham: number, qalin = false): string {
  const m = winansi(s);
  if (eni(m, olcham, qalin) <= kenglik) return m;
  let x = m;
  while (x.length > 1 && eni(x + '..', olcham, qalin) > kenglik) x = x.slice(0, -1);
  return x + '..';
}

/**
 * Matnni berilgan enga O'RAYDI. So'z bo'yicha bo'linadi; bitta so'z
 * enidan uzun bo'lsa (masalan telefon yoki uzun raqam) harf bo'yicha.
 * `\n` — majburiy yangi qator.
 */
function ora(s: string, kenglik: number, olcham: number, qalin = false, engKop = 30): string[] {
  const natija: string[] = [];
  // AVVAL bo'linadi, KEYIN o'giriladi: `winansi` `\n` ni tashlab yuboradi
  // va teskari tartibda izohning qatorlari bir-biriga yopishib qolardi
  // («13440000» + «350somdan» → «13440000350somdan»).
  for (const abzas of String(s ?? '').replace(/\r/g, '').split('\n').map(winansi)) {
    let joriy = '';
    for (const soz of abzas.split(/ +/)) {
      if (!soz) continue;
      const sinov = joriy ? joriy + ' ' + soz : soz;
      if (eni(sinov, olcham, qalin) <= kenglik) {
        joriy = sinov;
        continue;
      }
      if (joriy) natija.push(joriy);
      // So'zning o'zi sig'masa — bo'lib yuboriladi
      let qoldi = soz;
      while (eni(qoldi, olcham, qalin) > kenglik && qoldi.length > 1) {
        let n = qoldi.length - 1;
        while (n > 1 && eni(qoldi.slice(0, n), olcham, qalin) > kenglik) n--;
        natija.push(qoldi.slice(0, n));
        qoldi = qoldi.slice(n);
      }
      joriy = qoldi;
    }
    natija.push(joriy);
  }
  // Chegara 30 qator (~300pt): amalda hamma izoh sig‘adi, lekin bitta
  // katak sahifadan balandroq bo‘lib sahifalashni buzmaydi
  if (natija.length > engKop) {
    const kesilgan = natija.slice(0, engKop);
    kesilgan[engKop - 1] = qirq(kesilgan[engKop - 1] + ' ...', kenglik, olcham, qalin);
    return kesilgan;
  }
  return natija.length ? natija : [''];
}

export type PdfRang = 'kirim' | 'chiqim' | 'xira' | 'urgu';
export type PdfKatak = string | { matn: string; rang?: PdfRang; qalin?: boolean };
export type PdfUstun = {
  nom: string;
  en: number;
  /** Son ustuni: o'ngga tekislanadi va HECH QACHON kesilmaydi */
  ong?: boolean;
};

export type PdfHujjat = {
  sarlavha: string;
  qator2?: string;
  qator3?: string;
  /** [yorliq, qiymat] yoki [yorliq, qiymat, rang] */
  xulosa?: ([string, string] | [string, string, PdfRang])[];
  ustunlar: PdfUstun[];
  qatorlar: PdfKatak[][];
};

/** Ilova temasi bilan bir xil ranglar (PDF: 0..1 RGB) */
const PDF_RANG: Record<PdfRang | 'matn' | 'tasma' | 'zebra' | 'quti' | 'chiziq', [number, number, number]> = {
  matn: [0.102, 0.114, 0.129], //  #1A1D21
  kirim: [0.141, 0.475, 0.714], // #2479B6
  chiqim: [0.8, 0.161, 0.161], //  #CC2929
  xira: [0.502, 0.514, 0.518], //  #808384
  urgu: [0.133, 0.604, 0.941], //  #229AF0 — Telegram
  tasma: [0.133, 0.604, 0.941], // jadval sarlavhasi
  zebra: [0.969, 0.969, 0.976], // #F7F7F9
  quti: [0.945, 0.945, 0.953], //  #F1F1F3
  chiziq: [0.851, 0.851, 0.851], // #D9D9D9
};
const rgb = (r: [number, number, number]) => r.map((x) => x.toFixed(3)).join(' ');

const EN = 595;
const BOY = 842;
const CHAP = 40;
const KENGLIK = EN - CHAP * 2;
const SHRIFT = 8;
const QATOR_ORALIQ = 10; // o'ralgan matnning bir qatori
const KATAK_ICHI = 5; // katak ichidagi tepa-past bo'shliq

const katakMatn = (k: PdfKatak | undefined) => (k === undefined || k === null ? '' : typeof k === 'string' ? k : k.matn);
const katakRang = (k: PdfKatak | undefined): PdfRang | undefined => (k && typeof k === 'object' ? k.rang : undefined);
const katakQalin = (k: PdfKatak | undefined) => !!(k && typeof k === 'object' && k.qalin);

/**
 * Ustun enlari. Avval `en` ulushlari bo'yicha, keyin SON ustunlariga
 * eng uzun qiymati sig'adigan joy beriladi — u joy matn ustunlaridan
 * (ular baribir o'raladi) olinadi.
 */
function ustunEnlari(h: PdfHujjat): number[] {
  const jami = h.ustunlar.reduce((s, u) => s + u.en, 0) || 1;
  const enlar = h.ustunlar.map((u) => (u.en / jami) * KENGLIK);
  let kamomad = 0;
  h.ustunlar.forEach((u, i) => {
    if (!u.ong) return;
    let kerak = eni(winansi(u.nom), 8.5, true);
    for (const q of h.qatorlar) kerak = Math.max(kerak, eni(winansi(katakMatn(q[i])), SHRIFT, katakQalin(q[i])));
    kerak += 10;
    if (kerak > enlar[i]) {
      kamomad += kerak - enlar[i];
      enlar[i] = kerak;
    }
  });
  if (kamomad > 0) {
    const ENG_KAM = 36;
    const matnli = h.ustunlar.map((u, i) => (!u.ong ? Math.max(0, enlar[i] - ENG_KAM) : 0));
    const bor = matnli.reduce((s, x) => s + x, 0);
    if (bor > 0) {
      const ulush = Math.min(1, kamomad / bor);
      matnli.forEach((x, i) => {
        enlar[i] -= x * ulush;
      });
    }
  }
  return enlar;
}

/**
 * Bir jadvalli PDF.
 *
 * Sahifalash HAQIQIY: qatorlar sig'masa yangi sahifa ochiladi va
 * sarlavha qayta chiziladi. Qator balandligi endi o'zgaruvchan
 * (o'ralgan matn), shuning uchun sahifa BALANDLIK bo'yicha to'ladi.
 */
export function pdf(h: PdfHujjat): Uint8Array {
  const enlar = ustunEnlari(h);
  const x0: number[] = [];
  let acc = CHAP;
  for (const e of enlar) {
    x0.push(acc);
    acc += e;
  }

  // Har qatorning o'ralgan ko'rinishi va balandligi — oldindan
  type Tayyor = { bolaklar: string[][]; olcham: number[]; boy: number };
  const tayyor: Tayyor[] = h.qatorlar.map((q) => {
    const bolaklar: string[][] = [];
    const olcham: number[] = [];
    h.ustunlar.forEach((u, i) => {
      const matn = katakMatn(q[i]);
      const qalin = katakQalin(q[i]);
      const joy = enlar[i] - 8;
      if (u.ong) {
        const m = winansi(matn);
        const w = eni(m, SHRIFT, qalin);
        // Son KESILMAYDI: sig'masa shrift kichrayadi
        olcham.push(w > joy && w > 0 ? Math.max(5.5, (SHRIFT * joy) / w) : SHRIFT);
        bolaklar.push([m]);
      } else {
        olcham.push(SHRIFT);
        bolaklar.push(ora(matn, joy, SHRIFT, qalin));
      }
    });
    const qatorlarSoni = Math.max(1, ...bolaklar.map((b) => b.length));
    return { bolaklar, olcham, boy: qatorlarSoni * QATOR_ORALIQ + KATAK_ICHI };
  });

  // ---- Sahifalash ----
  const xulosaBoy = (h.xulosa?.length ?? 0) * 15 + (h.xulosa?.length ? 16 : 0);
  const PAST = 50; // sahifa raqami uchun joy
  const birinchiTepa = BOY - 50 - 20 - (h.qator2 ? 14 : 0) - (h.qator3 ? 14 : 0) - 14 - xulosaBoy - 22;
  const keyingiTepa = BOY - 50 - 20 - 22;
  const sahifalar: number[][] = [];
  let joriy: number[] = [];
  let joy = birinchiTepa - PAST;
  tayyor.forEach((t, i) => {
    if (joriy.length > 0 && t.boy > joy) {
      sahifalar.push(joriy);
      joriy = [];
      joy = keyingiTepa - PAST;
    }
    joriy.push(i);
    joy -= t.boy;
  });
  sahifalar.push(joriy);

  const oqimlar: string[] = [];
  sahifalar.forEach((indekslar, si) => {
    let s = '';
    let y = BOY - 50;

    const yoz = (matn: string, x: number, yy: number, olcham: number, qalin = false, rang = PDF_RANG.matn) => {
      s += `BT ${rgb(rang)} rg /${qalin ? 'F2' : 'F1'} ${olcham.toFixed(1)} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pdfMatn(matn)}) Tj ET\n`;
    };
    const tortburchak = (x: number, yy: number, w: number, hh: number, rang: [number, number, number]) => {
      s += `${rgb(rang)} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${hh.toFixed(1)} re f\n`;
    };
    const chiziq = (yy: number, qalinlik: number, rang: [number, number, number]) => {
      s += `${rgb(rang)} RG ${qalinlik} w ${CHAP} ${yy.toFixed(1)} m ${(EN - CHAP).toFixed(1)} ${yy.toFixed(1)} l S\n`;
    };

    if (si === 0) {
      yoz(h.sarlavha, CHAP, y, 15, true);
      y -= 8;
      // Sarlavha ostidagi urg'u chizig'i — Telegram ko'ki
      chiziq(y, 1.5, PDF_RANG.urgu);
      y -= 14;
      if (h.qator2) {
        yoz(h.qator2, CHAP, y, 10, false, PDF_RANG.matn);
        y -= 14;
      }
      if (h.qator3) {
        yoz(h.qator3, CHAP, y, 9, false, PDF_RANG.xira);
        y -= 14;
      }
      if (h.xulosa?.length) {
        y -= 4;
        const boy = h.xulosa.length * 15 + 8;
        tortburchak(CHAP, y - boy + 11, KENGLIK, boy, PDF_RANG.quti);
        y -= 2;
        for (const [nom, qiy, rang] of h.xulosa) {
          const katta = nom === nom.toUpperCase() || !!rang;
          yoz(nom, CHAP + 8, y, 10, katta);
          const q = winansi(qiy);
          yoz(q, EN - CHAP - 8 - eni(q, 10, true), y, 10, true, rang ? PDF_RANG[rang] : PDF_RANG.matn);
          y -= 15;
        }
        y -= 12;
      } else {
        y -= 6;
      }
    } else {
      yoz(h.sarlavha + ' (davomi)', CHAP, y, 11, true);
      y -= 8;
      chiziq(y, 1, PDF_RANG.urgu);
      y -= 14;
    }

    // ---- Jadval sarlavhasi: rangli tasma, oq matn ----
    tortburchak(CHAP, y - 5, KENGLIK, 17, PDF_RANG.tasma);
    h.ustunlar.forEach((u, i) => {
      const nom = qirq(u.nom, enlar[i] - 6, 8.5, true);
      const x = u.ong ? x0[i] + enlar[i] - 4 - eni(nom, 8.5, true) : x0[i] + 3;
      yoz(nom, x, y, 8.5, true, [1, 1, 1]);
    });
    y -= 17;

    // ---- Qatorlar ----
    indekslar.forEach((qi, tartib) => {
      const t = tayyor[qi];
      const q = h.qatorlar[qi];
      const tepasi = y + 11;
      if (tartib % 2 === 1) tortburchak(CHAP, tepasi - t.boy, KENGLIK, t.boy, PDF_RANG.zebra);
      h.ustunlar.forEach((u, i) => {
        const r = katakRang(q[i]);
        const rang = r ? PDF_RANG[r] : PDF_RANG.matn;
        const qalin = katakQalin(q[i]);
        t.bolaklar[i].forEach((bolak, li) => {
          const yy = y - li * QATOR_ORALIQ;
          const x = u.ong ? x0[i] + enlar[i] - 4 - eni(bolak, t.olcham[i], qalin) : x0[i] + 3;
          yoz(bolak, x, yy, t.olcham[i], qalin, rang);
        });
      });
      y -= t.boy;
      s += `${rgb(PDF_RANG.chiziq)} RG 0.3 w ${CHAP} ${(y + 10).toFixed(1)} m ${(EN - CHAP).toFixed(1)} ${(y + 10).toFixed(1)} l S\n`;
    });

    const oyoq = `${si + 1} / ${sahifalar.length}`;
    yoz(oyoq, EN / 2 - eni(oyoq, 8, false) / 2, 28, 8, false, PDF_RANG.xira);
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

