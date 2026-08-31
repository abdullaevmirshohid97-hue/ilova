// Dori fakturasi — mijozga PDF va Excel qilib yuboradi.
//
// Chaqiriladi: telegram-dori boti, "Buyurtmalarim" ro'yxatidagi tugma
// bosilganda. Body: { order_id, chat_id }
//
// Fakturada dorixona hisoboti uchun zarur ustunlar: nomi, ishlab
// chiqaruvchi, seriya, ishlab chiqarilgan sana, yaroqlilik muddati,
// soni, narxi, summasi. Pastda izoh va imzo o'rni.
//
// KIRILL: pdf-lib'ning standart shriftlari (Helvetica) WinAnsi kodlashda —
// kirill umuman chiqmaydi, dori nomlari esa deyarli hammasi kirillcha.
// Shuning uchun DejaVuSans yuklab olinib joylanadi va sovuq startdan
// keyin xotirada qoladi. Yuklanmasa faktura bekor qilinmaydi — lotin
// yozuviga o'girilib chiqadi.
//
// PDF gorizontal (albom) yo'nalishda: to'qqizta ustun tik A4 ga sig'maydi,
// nomlar qisqarib ketardi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import ExcelJS from 'npm:exceljs@4.4.0';

const SHRIFT_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';
const SHRIFT_BOLD_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf';

let shriftKesh: { oddiy: Uint8Array; qalin: Uint8Array } | null = null;

async function shriftlarniOl() {
  if (shriftKesh) return shriftKesh;
  const [a, b] = await Promise.all([fetch(SHRIFT_URL), fetch(SHRIFT_BOLD_URL)]);
  if (!a.ok || !b.ok) throw new Error('SHRIFT_YUKLANMADI');
  shriftKesh = {
    oddiy: new Uint8Array(await a.arrayBuffer()),
    qalin: new Uint8Array(await b.arrayBuffer()),
  };
  return shriftKesh;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'i', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function lotinga(s: string): string {
  return String(s ?? '')
    .split('')
    .map((c) => {
      const past = c.toLowerCase();
      const t = TRANSLIT[past];
      if (t === undefined) return c;
      return c === past ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('')
    .replace(/[^\x20-\xFF]/g, '?');
}

function raqam(n: unknown): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function miqdor(n: unknown): string {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function sana(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
}

const HOLAT: Record<string, string> = {
  new: 'Yangi',
  confirmed: 'Qabul qilingan',
  done: 'Yopilgan',
  cancelled: 'Bekor qilingan',
};

// Ustunlar: kengligi bilan (gorizontal A4 = 842pt)
const USTUN = [
  { kalit: 'n',     nom: '№',                 w: 26,  tik: 'chap' },
  { kalit: 'name',  nom: 'Dori nomi',         w: 232, tik: 'chap' },
  { kalit: 'manuf', nom: 'Ishlab chiqaruvchi', w: 132, tik: 'chap' },
  { kalit: 'ser',   nom: 'Seriya',            w: 62,  tik: 'chap' },
  { kalit: 'made',  nom: 'Ishlab chiq.',      w: 64,  tik: 'chap' },
  { kalit: 'exp',   nom: 'Yaroqlilik',        w: 64,  tik: 'chap' },
  { kalit: 'qty',   nom: 'Soni',              w: 42,  tik: 'ong'  },
  { kalit: 'price', nom: 'Narxi',             w: 68,  tik: 'ong'  },
  { kalit: 'sum',   nom: 'Summasi',           w: 78,  tik: 'ong'  },
];

// ---------------------------------------------------------------- PDF
async function pdfYasa(inv: any): Promise<{ bayt: Uint8Array; kirill: boolean }> {
  const doc = await PDFDocument.create();

  let font: any;
  let bold: any;
  let kirill = true;
  try {
    doc.registerFontkit(fontkit);
    const sh = await shriftlarniOl();
    font = await doc.embedFont(sh.oddiy, { subset: true });
    bold = await doc.embedFont(sh.qalin, { subset: true });
  } catch {
    kirill = false;
    font = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  const EN = 842;   // albom yo'nalish
  const BO = 595;
  const M = 30;
  const brand = rgb(0.05, 0.49, 0.42);
  const grey = rgb(0.42, 0.42, 0.46);
  const chiziq = rgb(0.62, 0.66, 0.68);

  const T = (s: unknown) => (kirill ? String(s ?? '') : lotinga(String(s ?? '')));

  // Ustun x koordinatalari
  const jamiEn = USTUN.reduce((a, u) => a + u.w, 0);
  const boshX = M + Math.max(0, (EN - M * 2 - jamiEn) / 2);
  const x: number[] = [];
  let acc = boshX;
  for (const u of USTUN) {
    x.push(acc);
    acc += u.w;
  }
  const oxirX = acc;

  let page = doc.addPage([EN, BO]);
  let y = 0;
  let jadvalBoshi = 0;

  const yoz = (
    s: unknown,
    xx: number,
    yy: number,
    size = 8.5,
    f = font,
    color = rgb(0, 0, 0)
  ) => page.drawText(T(s), { x: xx, y: yy, size, font: f, color });

  // Matnni ustun kengligiga sig'diradi (kerak bo'lsa ikki qatorga bo'ladi)
  function boglar(matn: string, en: number, size: number, f: any): string[] {
    const s = T(matn);
    if (f.widthOfTextAtSize(s, size) <= en) return [s];
    const sozlar = s.split(' ');
    const qatorlar: string[] = [];
    let joriy = '';
    for (const soz of sozlar) {
      const sinov = joriy ? joriy + ' ' + soz : soz;
      if (f.widthOfTextAtSize(sinov, size) <= en) {
        joriy = sinov;
      } else {
        if (joriy) qatorlar.push(joriy);
        joriy = soz;
        if (qatorlar.length >= 2) break;
      }
    }
    if (joriy && qatorlar.length < 3) qatorlar.push(joriy);
    return qatorlar.slice(0, 3);
  }

  function sarlavhaChiz() {
    y = BO - M;
    yoz('IDAA FARM', M, y - 4, 16, bold, brand);
    yoz(`${inv.sarlavha ?? 'FAKTURA'} № ${inv.faktura_no ?? inv.order_no}`, EN - M - 150, y - 4, 13, bold);
    y -= 18;
    yoz('Dori vositalari ulgurji savdosi', M, y - 2, 8, font, grey);
    yoz(`Sana: ${sana(inv.created_at)}`, EN - M - 150, y - 2, 8.5, font, grey);
    y -= 12;
    page.drawRectangle({ x: M, y: y - 2, width: EN - M * 2, height: 2, color: brand });
    y -= 16;

    yoz(inv.taraf_nom ?? 'Mijoz:', M, y, 8, font, grey);
    yoz(inv.customer?.name ?? '—', M + 34, y, 9.5, bold);
    yoz('Telefon:', M + 210, y, 8, font, grey);
    yoz(inv.customer?.phone ?? '—', M + 252, y, 9);
    yoz('Holat:', EN - M - 150, y, 8, font, grey);
    yoz(HOLAT[inv.status] ?? inv.status, EN - M - 118, y, 9, bold);
    y -= 18;
  }

  function jadvalSarlavha() {
    const balandlik = 22;
    page.drawRectangle({
      x: boshX,
      y: y - balandlik + 6,
      width: oxirX - boshX,
      height: balandlik,
      color: rgb(0.93, 0.97, 0.96),
    });
    USTUN.forEach((u, i) => {
      const qatorlar = boglar(u.nom, u.w - 8, 7.5, bold);
      qatorlar.forEach((q, j) => {
        const w = bold.widthOfTextAtSize(q, 7.5);
        const xx = u.tik === 'ong' ? x[i] + u.w - 4 - w : x[i] + 4;
        yoz(q, xx, y - 2 - j * 8, 7.5, bold);
      });
    });
    y -= balandlik;
    jadvalBoshi = y + balandlik + 6;
  }

  // Ustunlar orasidagi tik chiziqlar — qatorlar aniq ajralib tursin
  function tikChiziqlar(pastY: number) {
    for (let i = 0; i <= USTUN.length; i++) {
      const xx = i === USTUN.length ? oxirX : x[i];
      page.drawLine({
        start: { x: xx, y: jadvalBoshi },
        end: { x: xx, y: pastY },
        thickness: 0.6,
        color: chiziq,
      });
    }
    page.drawLine({
      start: { x: boshX, y: jadvalBoshi },
      end: { x: oxirX, y: jadvalBoshi },
      thickness: 0.8,
      color: chiziq,
    });
  }

  sarlavhaChiz();
  jadvalSarlavha();

  for (const [i, it] of (inv.items ?? []).entries()) {
    const nomQatorlari = boglar(String(it.name ?? ''), USTUN[1].w - 8, 8, font);
    const ishQatorlari = boglar(String(it.manufacturer ?? '—'), USTUN[2].w - 8, 8, font);
    const qatorSoni = Math.max(nomQatorlari.length, ishQatorlari.length);
    const balandlik = 8 + qatorSoni * 10;

    // Sahifa tugadimi?
    if (y - balandlik < M + 90) {
      tikChiziqlar(y);
      page = doc.addPage([EN, BO]);
      sarlavhaChiz();
      jadvalSarlavha();
    }

    const yuqori = y;
    const past = y - balandlik;
    const qiymat: Record<string, string> = {
      n: String(i + 1),
      ser: it.series ? String(it.series) : '—',
      made: sana(it.made_at),
      exp: sana(it.expiry),
      qty: miqdor(it.qty),
      price: raqam(it.price),
      sum: raqam(it.sum),
    };

    USTUN.forEach((u, ci) => {
      if (u.kalit === 'name' || u.kalit === 'manuf') {
        const qatorlar = u.kalit === 'name' ? nomQatorlari : ishQatorlari;
        qatorlar.forEach((q, j) => yoz(q, x[ci] + 4, yuqori - 12 - j * 10, 8));
      } else {
        const s = qiymat[u.kalit] ?? '';
        const w = font.widthOfTextAtSize(T(s), 8);
        const xx = u.tik === 'ong' ? x[ci] + u.w - 4 - w : x[ci] + 4;
        yoz(s, xx, yuqori - 12, 8, u.kalit === 'sum' ? bold : font);
      }
    });

    page.drawLine({
      start: { x: boshX, y: past },
      end: { x: oxirX, y: past },
      thickness: 0.5,
      color: chiziq,
    });
    y = past;
  }

  // JAMI qatori
  const jamiBal = 20;
  if (y - jamiBal < M + 90) {
    tikChiziqlar(y);
    page = doc.addPage([EN, BO]);
    sarlavhaChiz();
    jadvalSarlavha();
  }
  page.drawRectangle({
    x: boshX,
    y: y - jamiBal,
    width: oxirX - boshX,
    height: jamiBal,
    color: rgb(0.93, 0.97, 0.96),
  });
  yoz('JAMI:', x[6] - 60, y - 14, 10, bold);
  const jamiMatn = `${raqam(inv.total)} so'm`;
  const jamiEni = bold.widthOfTextAtSize(T(jamiMatn), 11);
  yoz(jamiMatn, oxirX - 4 - jamiEni, y - 14, 11, bold, brand);
  y -= jamiBal;
  page.drawLine({ start: { x: boshX, y }, end: { x: oxirX, y }, thickness: 0.8, color: chiziq });
  tikChiziqlar(y);

  // ---------- izoh va imzo ----------
  y -= 26;
  const izohBal = 44;
  const izohEn = (oxirX - boshX) * 0.58;

  page.drawRectangle({
    x: boshX,
    y: y - izohBal,
    width: izohEn,
    height: izohBal,
    borderColor: chiziq,
    borderWidth: 0.6,
  });
  yoz('Izoh:', boshX + 6, y - 12, 8, bold, grey);
  if (inv.comment) {
    boglar(String(inv.comment), izohEn - 16, 8, font).forEach((q, j) =>
      yoz(q, boshX + 6, y - 24 - j * 10, 8)
    );
  }

  const imzoX = boshX + izohEn + 16;
  page.drawRectangle({
    x: imzoX,
    y: y - izohBal,
    width: oxirX - imzoX,
    height: izohBal,
    borderColor: chiziq,
    borderWidth: 0.6,
  });
  yoz('Rahbar imzosi:', imzoX + 8, y - 14, 8, font, grey);
  page.drawLine({
    start: { x: imzoX + 80, y: y - 17 },
    end: { x: oxirX - 10, y: y - 17 },
    thickness: 0.6,
    color: chiziq,
  });
  yoz('Qabul qildi:', imzoX + 8, y - 34, 8, font, grey);
  page.drawLine({
    start: { x: imzoX + 80, y: y - 37 },
    end: { x: oxirX - 10, y: y - 37 },
    thickness: 0.6,
    color: chiziq,
  });

  return { bayt: await doc.save(), kirill };
}

// ---------------------------------------------------------------- Excel
// SheetJS'ning bepul versiyasi katak bezaklarini (chegara, rang) yozmaydi,
// shuning uchun ExcelJS ishlatiladi — to'r chiziqlari va imzo bloki kerak.
async function excelYasa(inv: any): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Idaa Farm';
  const ws = wb.addWorksheet('Faktura', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { width: 5 },   // №
    { width: 44 },  // nomi
    { width: 26 },  // ishlab chiqaruvchi
    { width: 12 },  // seriya
    { width: 14 },  // ishlab chiqarilgan
    { width: 14 },  // yaroqlilik
    { width: 8 },   // soni
    { width: 14 },  // narxi
    { width: 16 },  // summasi
  ];

  const chegara = {
    top: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
    left: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
    right: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
  };

  // ---------- sarlavha ----------
  ws.mergeCells('A1:I1');
  const s1 = ws.getCell('A1');
  s1.value = 'IDAA FARM — ' + (inv.sarlavha ?? 'FAKTURA');
  s1.font = { size: 16, bold: true, color: { argb: 'FF0D7D6B' } };
  s1.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 24;

  ws.mergeCells('A2:I2');
  const s2 = ws.getCell('A2');
  s2.value = `Buyurtma № ${inv.order_no}    ·    Sana: ${sana(inv.created_at)}    ·    Holat: ${HOLAT[inv.status] ?? inv.status}`;
  s2.alignment = { horizontal: 'center' };
  s2.font = { size: 10, color: { argb: 'FF555F63' } };

  ws.mergeCells('A3:I3');
  const s3 = ws.getCell('A3');
  s3.value = `${(inv.taraf_nom ?? 'Mijoz:').replace(':', '')}: ${inv.customer?.name ?? '—'}    ·    Telefon: ${inv.customer?.phone ?? '—'}` +
             (inv.customer?.pharmacy ? `    ·    ${inv.customer.pharmacy}` : '');
  s3.alignment = { horizontal: 'center' };
  s3.font = { size: 10 };

  ws.addRow([]);

  // ---------- jadval sarlavhasi ----------
  const sarlavha = ws.addRow([
    '№', 'Dori nomi', 'Ishlab chiqaruvchi', 'Seriya',
    'Ishlab chiqarilgan', 'Yaroqlilik muddati', 'Soni', 'Narxi', 'Summasi',
  ]);
  sarlavha.height = 30;
  sarlavha.eachCell((c: any) => {
    c.font = { bold: true, size: 10 };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5F2' } };
    c.border = chegara;
  });

  // ---------- qatorlar ----------
  for (const [i, it] of (inv.items ?? []).entries()) {
    const r = ws.addRow([
      i + 1,
      it.name ?? '',
      it.manufacturer ?? '—',
      it.series ?? '—',
      it.made_at ? sana(it.made_at) : '—',
      it.expiry ? sana(it.expiry) : '—',
      Number(it.qty) || 0,
      Number(it.price) || 0,
      Number(it.sum) || 0,
    ]);
    r.eachCell((c: any, n: number) => {
      c.border = chegara;
      c.font = { size: 10 };
      c.alignment = {
        vertical: 'top',
        wrapText: n === 2 || n === 3,
        horizontal: n === 1 || (n >= 4 && n <= 6) ? 'center' : n >= 7 ? 'right' : 'left',
      };
      if (n >= 8) c.numFmt = '#,##0';
      if (n === 7) c.numFmt = '#,##0.###';
    });
  }

  // ---------- jami ----------
  const jami = ws.addRow(['', 'JAMI', '', '', '', '', '', '', Number(inv.total) || 0]);
  jami.eachCell((c: any, n: number) => {
    c.border = chegara;
    c.font = { bold: true, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5F2' } };
    if (n === 9) {
      c.numFmt = '#,##0';
      c.alignment = { horizontal: 'right' };
    }
  });

  ws.addRow([]);

  // ---------- izoh va imzo ----------
  const izohQator = ws.rowCount + 1;
  ws.mergeCells(`A${izohQator}:E${izohQator + 2}`);
  const izoh = ws.getCell(`A${izohQator}`);
  izoh.value = inv.comment ? `Izoh: ${inv.comment}` : 'Izoh:';
  izoh.alignment = { vertical: 'top', wrapText: true };
  izoh.font = { size: 10 };
  izoh.border = chegara;

  ws.mergeCells(`F${izohQator}:I${izohQator + 2}`);
  const imzo = ws.getCell(`F${izohQator}`);
  imzo.value = 'Rahbar imzosi: ______________________\n\nQabul qildi: ______________________';
  imzo.alignment = { vertical: 'top', wrapText: true };
  imzo.font = { size: 10 };
  imzo.border = chegara;

  ws.getRow(izohQator).height = 22;
  ws.getRow(izohQator + 1).height = 22;
  ws.getRow(izohQator + 2).height = 22;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ---------------------------------------------------------------- yuborish
async function hujjatYubor(
  token: string,
  chatId: number,
  bayt: Uint8Array,
  nom: string,
  tur: string,
  caption?: string
) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  form.append('document', new Blob([bayt], { type: tur }), nom);

  const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const j = await r.json().catch(() => ({ ok: false }));
  // Yuborilmasa jim qolmaymiz: chaqiruvchi (bot) buni bilishi kerak
  if (!j.ok) throw new Error('TELEGRAM: ' + (j.description ?? 'yuborilmadi'));
  return j;
}

const CORS_JSON = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'content-type, authorization, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Fayl brauzerga JSON ichida qaytadi: panel uni yuklab olib chop etadi.
// Katta massivni spread bilan String.fromCharCode ga berish stek
// to'lib ketishiga olib keladi - bo'lak-bo'lak o'giriladi.
function base64ga(b: Uint8Array): string {
  let s = '';
  const bolak = 0x8000;
  for (let i = 0; i < b.length; i += bolak) {
    s += String.fromCharCode(...b.subarray(i, i + bolak));
  }
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_JSON });

  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });

  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }

  // ================================================== SOTUV REJIMI
  // Operator paneldan sotdi - faktura brauzerga qaytadi (chop etish
  // yoki PDF saqlash uchun). Telegram bu yerda qatnashmaydi.
  if (body?.rejim === 'sotuv') {
    if (!auth) return new Response('FORBIDDEN', { status: 403 });

    let ruxsat2 = auth === serviceKey;
    if (!ruxsat2) {
      const { data: u2 } = await supabase.auth.getUser(auth);
      const uid2 = u2?.user?.id;
      if (uid2) {
        const { data: p2 } = await supabase.from('profiles').select('role').eq('id', uid2).maybeSingle();
        ruxsat2 = (p2 as any)?.role === 'super_admin';
      }
    }
    if (!ruxsat2) return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: CORS_JSON });

    const saleId = String(body?.sale_id ?? '');
    if (!saleId) return new Response(JSON.stringify({ error: 'SALE_YOQ' }), { status: 400, headers: CORS_JSON });

    const { data: inv3, error: xato3 } = await supabase.rpc('dori_sotuv_faktura_srv', { p_sale_id: saleId });
    if (xato3) return new Response(JSON.stringify({ error: xato3.message }), { status: 500, headers: CORS_JSON });
    if (!inv3) return new Response(JSON.stringify({ error: 'TOPILMADI' }), { status: 404, headers: CORS_JSON });

    try {
      const pdf3 = await pdfYasa(inv3 as any);
      const xls3 = await excelYasa(inv3 as any);
      return new Response(
        JSON.stringify({
          ok: true,
          nom: `sotuv-${(inv3 as any).order_no}`,
          pdf: base64ga(pdf3.bayt),
          xlsx: base64ga(xls3),
        }),
        { headers: CORS_JSON }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
        status: 500, headers: CORS_JSON,
      });
    }
  }

  // ================================================== SKLAD REJIMI
  // Super admin sklad nomidan kirim fakturasini oladi. Telegramga
  // yuborilmaydi - fayllar brauzerga qaytadi (chop etish uchun).
  if (body?.rejim === 'sklad') {
    if (!auth) return new Response('FORBIDDEN', { status: 403 });

    // service_role kaliti yoki super admin JWT'si
    let ruxsat = auth === serviceKey;
    if (!ruxsat) {
      const { data: u } = await supabase.auth.getUser(auth);
      const uid = u?.user?.id;
      if (uid) {
        const { data: p } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
        ruxsat = (p as any)?.role === 'super_admin';
      }
    }
    if (!ruxsat) return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: CORS_JSON });

    const splitId = String(body?.split_id ?? '');
    if (!splitId) return new Response(JSON.stringify({ error: 'SPLIT_YOQ' }), { status: 400, headers: CORS_JSON });

    const { data: inv2, error: xato2 } = await supabase.rpc('dori_sklad_faktura_srv', { p_split_id: splitId });
    if (xato2) return new Response(JSON.stringify({ error: xato2.message }), { status: 500, headers: CORS_JSON });
    if (!inv2) return new Response(JSON.stringify({ error: 'TOPILMADI' }), { status: 404, headers: CORS_JSON });

    try {
      const pdf = await pdfYasa(inv2 as any);
      const xls = await excelYasa(inv2 as any);
      const nom = `kirim-${(inv2 as any).faktura_no ?? (inv2 as any).order_no}`;
      return new Response(
        JSON.stringify({
          ok: true,
          nom,
          pdf: base64ga(pdf.bayt),
          xlsx: base64ga(xls),
        }),
        { headers: CORS_JSON }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
        status: 500, headers: CORS_JSON,
      });
    }
  }

  // ================================================== MIJOZ REJIMI
  if (auth !== serviceKey) return new Response('FORBIDDEN', { status: 403 });

  const order_id: string | undefined = body?.order_id;
  const chat_id: number | undefined = Number(body?.chat_id);
  if (!order_id || !chat_id) return new Response('PARAM_YOQ', { status: 400 });

  // Buyurtma AYNAN shu chatniki ekanini baza tekshiradi
  const { data, error } = await supabase.rpc('dori_invoice_for_chat', {
    p_order_id: order_id,
    p_chat_id: chat_id,
  });
  if (error) return new Response('RPC: ' + error.message, { status: 500 });
  if (!data) return new Response('BUYURTMA_TOPILMADI', { status: 404 });

  const inv = data as any;
  const kun = sana(inv.created_at).replace(/\./g, '-');

  let kirill = false;
  try {
    const yasandi = await pdfYasa(inv);
    kirill = yasandi.kirill;
    const xls = await excelYasa(inv);

    await hujjatYubor(
      token,
      chat_id,
      yasandi.bayt,
      `faktura-${inv.order_no}-${kun}.pdf`,
      'application/pdf',
      `🧾 <b>Faktura №${inv.order_no}</b>\n` +
        `Sana: ${sana(inv.created_at)}\n` +
        `Jami: <b>${raqam(inv.total)} so'm</b>`
    );

    await hujjatYubor(
      token,
      chat_id,
      xls,
      `faktura-${inv.order_no}-${kun}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    return new Response(JSON.stringify({ ok: true, kirill }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, kirill, error: String((e as any)?.message ?? e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
