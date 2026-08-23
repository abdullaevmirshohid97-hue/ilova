// Dori fakturasi — mijozga PDF va Excel qilib yuboradi.
//
// Chaqiriladi: telegram-dori boti, "Buyurtmalarim" ro'yxatidagi tugma
// bosilganda. Body: { order_id, chat_id }
//
// KIRILL MUAMMOSI: pdf-lib'ning standart shriftlari (Helvetica) WinAnsi
// kodlashda — kirill harflari umuman chiqmaydi, dori nomlari esa deyarli
// hammasi kirillcha. Shuning uchun kirillni biladigan shrift (DejaVuSans)
// yuklab olinib PDF ichiga joylanadi. Shrift bir marta yuklanadi va
// keyingi chaqiruvlarda xotiradan olinadi.
//
// Shrift yuklanmasa faktura BEKOR QILINMAYDI — lotin yozuviga o'girilib
// chiqadi (nomlar o'qilishi qiyinroq bo'ladi, lekin summalar to'g'ri).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import * as XLSX from 'npm:xlsx@0.18.5';

const SHRIFT_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';
const SHRIFT_BOLD_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf';

// Sovuq startdan keyin bir marta yuklanadi
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

// Shrift yuklanmagan holat uchun: kirillni lotinga o'girish
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

const HOLAT: Record<string, string> = {
  new: 'Yangi',
  confirmed: 'Qabul qilingan',
  done: 'Yopilgan',
  cancelled: 'Bekor qilingan',
};

// ---------------------------------------------------------------- PDF
async function pdfYasa(inv: any): Promise<{ bayt: Uint8Array; kirill: boolean }> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595, 842]);

  let font: any;
  let bold: any;
  let kirill = true;
  try {
    doc.registerFontkit(fontkit);
    const sh = await shriftlarniOl();
    font = await doc.embedFont(sh.oddiy, { subset: true });
    bold = await doc.embedFont(sh.qalin, { subset: true });
  } catch {
    // Shrift yuklanmadi — lotin yozuviga o'tamiz, faktura baribir chiqadi
    kirill = false;
    font = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  const M = 42;
  const brand = rgb(0.05, 0.49, 0.42);
  const grey = rgb(0.42, 0.42, 0.46);
  let y = 842 - M;

  const T = (s: unknown) => (kirill ? String(s ?? '') : lotinga(String(s ?? '')));
  const t = (s: unknown, x: number, yy: number, size = 10, f = font, color = rgb(0, 0, 0)) =>
    page.drawText(T(s), { x, y: yy, size, font: f, color });

  // sarlavha
  t('IDAA FARM', M, y, 20, bold, brand);
  t('FAKTURA', 595 - M - 90, y, 16, bold);
  y -= 16;
  t('Dori vositalari', M, y, 9, font, grey);
  t(`No ${inv.order_no}`, 595 - M - 90, y, 12, bold);
  y -= 13;
  t(new Date(inv.created_at).toLocaleDateString('ru-RU'), 595 - M - 90, y, 9, font, grey);
  y -= 10;
  page.drawRectangle({ x: M, y, width: 595 - M * 2, height: 2.5, color: brand });
  y -= 24;

  // mijoz
  t('Mijoz:', M, y, 9, font, grey);
  t(inv.customer?.name ?? '-', M + 44, y, 11, bold);
  t('Holat:', 350, y, 9, font, grey);
  t(HOLAT[inv.status] ?? inv.status, 392, y, 10, bold);
  y -= 15;
  t('Telefon:', M, y, 9, font, grey);
  t(inv.customer?.phone ?? '-', M + 44, y, 10);
  y -= 24;

  // jadval sarlavhasi
  const cols = { n: M, name: M + 22, qty: 355, price: 415, sum: 500 };
  page.drawRectangle({ x: M, y: y - 5, width: 595 - M * 2, height: 19, color: rgb(0.93, 0.97, 0.96) });
  t('#', cols.n, y, 8, bold);
  t('MAHSULOT', cols.name, y, 8, bold);
  t('MIQDOR', cols.qty, y, 8, bold);
  t('NARX', cols.price, y, 8, bold);
  t('SUMMA', cols.sum, y, 8, bold);
  y -= 22;

  for (const [i, it] of (inv.items ?? []).entries()) {
    if (y < 90) {
      page = doc.addPage([595, 842]);
      y = 842 - M;
    }
    // Uzun dori nomlari ikki qatorga bo'linadi
    const nomi = String(it.name ?? '');
    const birinchi = nomi.slice(0, 52);
    const ikkinchi = nomi.length > 52 ? nomi.slice(52, 104) : '';

    t(String(i + 1), cols.n, y, 9, font, grey);
    t(birinchi, cols.name, y, 9);
    t(miqdor(it.qty), cols.qty, y, 9);
    t(raqam(it.price), cols.price, y, 9);
    t(raqam(it.sum), cols.sum, y, 9, bold);
    if (ikkinchi) {
      y -= 10;
      t(ikkinchi, cols.name, y, 9);
    }

    y -= 16;
    page.drawLine({
      start: { x: M, y: y + 6 },
      end: { x: 595 - M, y: y + 6 },
      thickness: 0.4,
      color: rgb(0.88, 0.9, 0.9),
    });
  }

  y -= 6;
  page.drawRectangle({ x: 340, y: y - 8, width: 595 - M - 340, height: 26, color: rgb(0.93, 0.97, 0.96) });
  t('JAMI:', 350, y, 11, bold);
  t(`${raqam(inv.total)} som`, cols.sum - 45, y, 13, bold, brand);

  y -= 50;
  t('Topshirdi: ______________________', M, y, 9, font, grey);
  t('Qabul qildi: ______________________', 320, y, 9, font, grey);

  return { bayt: await doc.save(), kirill };
}

// ---------------------------------------------------------------- Excel
function excelYasa(inv: any): Uint8Array {
  const qatorlar = (inv.items ?? []).map((it: any, i: number) => ({
    '№': i + 1,
    Nomi: it.name,
    Miqdor: Number(it.qty),
    Narx: Number(it.price),
    Summa: Number(it.sum),
  }));

  qatorlar.push({ '№': '', Nomi: 'JAMI', Miqdor: '', Narx: '', Summa: Number(inv.total) });

  const ws = XLSX.utils.json_to_sheet(qatorlar, { origin: 'A6' });

  // Yuqoriga faktura ma'lumotlari
  XLSX.utils.sheet_add_aoa(
    ws,
    [
      ['IDAA FARM — FAKTURA'],
      [`Buyurtma № ${inv.order_no}`],
      [`Sana: ${new Date(inv.created_at).toLocaleString('ru-RU')}`],
      [`Mijoz: ${inv.customer?.name ?? '-'} · ${inv.customer?.phone ?? ''}`],
      [`Holat: ${HOLAT[inv.status] ?? inv.status}`],
    ],
    { origin: 'A1' }
  );

  ws['!cols'] = [{ wch: 5 }, { wch: 58 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Faktura');
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
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

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });

  // Faqat ichkaridan (bot) chaqiriladi
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.includes(serviceKey)) return new Response('FORBIDDEN', { status: 403 });

  let order_id: string | undefined;
  let chat_id: number | undefined;
  try {
    const b = await req.json();
    order_id = b?.order_id;
    chat_id = Number(b?.chat_id);
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }
  if (!order_id || !chat_id) return new Response('PARAM_YOQ', { status: 400 });

  const supabase = createClient(supabaseUrl, serviceKey);

  // Buyurtma AYNAN shu chatniki ekanini baza tekshiradi
  const { data, error } = await supabase.rpc('dori_invoice_for_chat', {
    p_order_id: order_id,
    p_chat_id: chat_id,
  });
  if (error) return new Response('RPC: ' + error.message, { status: 500 });
  if (!data) return new Response('BUYURTMA_TOPILMADI', { status: 404 });

  const inv = data as any;
  const sana = new Date(inv.created_at).toLocaleDateString('ru-RU').replace(/\./g, '-');

  // Yasash va yuborish alohida: yuborish xato bersa ham, hujjat
  // yasalgan-yasalmagani (va kirill shrifti ulangani) javobda ko'rinsin —
  // aks holda "nega ishlamadi" degan savolga javob topib bo'lmaydi
  let kirill = false;
  try {
    const yasandi = await pdfYasa(inv);
    kirill = yasandi.kirill;
    const pdf = yasandi.bayt;
    const xls = excelYasa(inv);

    await hujjatYubor(
      token,
      chat_id,
      pdf,
      `faktura-${inv.order_no}-${sana}.pdf`,
      'application/pdf',
      `🧾 <b>Faktura №${inv.order_no}</b>\n` +
        `Sana: ${new Date(inv.created_at).toLocaleDateString('ru-RU')}\n` +
        `Jami: <b>${raqam(inv.total)} so'm</b>`
    );

    await hujjatYubor(
      token,
      chat_id,
      xls,
      `faktura-${inv.order_no}-${sana}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    return new Response(JSON.stringify({ ok: true, kirill }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, kirill, error: String((e as any)?.message ?? e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
