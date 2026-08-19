// Buyurtma fakturasini mijozga Telegram orqali yuborish (PDF fayl bilan).
//
// Chaqiriladi: admin panelidagi "📤 Telegramga yuborish" tugmasi, yoki
// buyurtma tasdiqlangan paytda. Body: { order_id: uuid }
//
// PDF pdf-lib bilan shu yerda yasaladi — server tomonda kutubxona yo'q
// degan cheklov faqat OGIR (puppeteer kabi) yechimlarga tegishli; pdf-lib
// sof JS va Deno'da muammosiz ishlaydi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// pdf-lib standart shriftlari WinAnsi kodlashda — o'zbek matnidagi
// "aqlli" tirnoqlar va tire'lar shunga tushmaydi va xato beradi.
function wa(s: unknown): string {
  return String(s ?? '')
    .replace(/[‘’ʻʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\xFF]/g, '?');
}

function raqam(n: number): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const HOLAT: Record<string, string> = {
  new: 'YANGI - TASDIQLANMAGAN',
  confirmed: 'QABUL QILINGAN',
  picking: 'YIGILMOQDA',
  done: 'YOPILGAN',
  cancelled: 'BEKOR QILINGAN',
};

async function makePdf(inv: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 45;
  const brand = rgb(0.44, 0, 1);
  const grey = rgb(0.42, 0.42, 0.46);
  let y = 842 - M;

  const t = (s: string, x: number, yy: number, size = 10, f = font, color = rgb(0, 0, 0)) =>
    page.drawText(wa(s), { x, y: yy, size, font: f, color });

  // sarlavha
  t(inv.org_name || 'YUKCHIBOLLA', M, y, 20, bold, brand);
  t('FAKTURA', 595 - M - 70, y, 16, bold);
  y -= 16;
  t('Ulgurji savdo', M, y, 9, font, grey);
  t(`No ${inv.order_number}`, 595 - M - 70, y, 11, bold);
  y -= 12;
  t(new Date(inv.created_at).toLocaleDateString('ru-RU'), 595 - M - 70, y, 9, font, grey);
  y -= 10;
  page.drawRectangle({ x: M, y, width: 595 - M * 2, height: 2.5, color: brand });
  y -= 26;

  // mijoz
  t('Mijoz:', M, y, 9, font, grey);
  t(inv.customer?.name ?? '-', M + 42, y, 11, bold);
  t('Holat:', 340, y, 9, font, grey);
  t(HOLAT[inv.status] ?? inv.status, 380, y, 10, bold);
  y -= 15;
  t('Telefon:', M, y, 9, font, grey);
  t(inv.customer?.phone ?? '-', M + 42, y, 10);
  y -= 26;

  // jadval sarlavhasi
  const cols = { n: M, name: M + 24, qty: 350, price: 415, sum: 495 };
  page.drawRectangle({ x: M, y: y - 5, width: 595 - M * 2, height: 20, color: rgb(0.96, 0.94, 1) });
  t('#', cols.n, y, 8, bold);
  t('MAHSULOT', cols.name, y, 8, bold);
  t('MIQDOR', cols.qty, y, 8, bold);
  t('NARX', cols.price, y, 8, bold);
  t('SUMMA', cols.sum, y, 8, bold);
  y -= 22;

  for (const [i, it] of (inv.items ?? []).entries()) {
    if (y < 120) {
      page = doc.addPage([595, 842]);
      y = 842 - M;
    }
    const nomi = wa(it.name).slice(0, 40);
    const olcham = wa([it.size, it.color].filter(Boolean).join(' / ')).slice(0, 40);
    t(String(i + 1), cols.n, y, 9);
    t(nomi, cols.name, y, 10);
    if (olcham) t(olcham, cols.name, y - 10, 8, font, grey);
    t(raqam(it.qty), cols.qty, y, 10);
    t(raqam(it.unit_price), cols.price, y, 10);
    t(raqam(it.line_total), cols.sum, y, 10, bold);
    y -= olcham ? 26 : 18;
    page.drawLine({
      start: { x: M, y: y + 6 },
      end: { x: 595 - M, y: y + 6 },
      thickness: 0.4,
      color: rgb(0.87, 0.87, 0.9),
    });
  }

  // jami
  y -= 8;
  page.drawRectangle({ x: 330, y: y - 8, width: 595 - M - 330, height: 26, color: rgb(0.96, 0.94, 1) });
  t('JAMI:', 340, y, 11, bold);
  t(`${raqam(inv.total)} som`, cols.sum - 40, y, 13, bold, brand);

  y -= 60;
  t('Topshirdi: ______________________', M, y, 9, font, grey);
  t('Qabul qildi: ______________________', 320, y, 9, font, grey);

  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN_YOQ' }, 500);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Chaqiruvchi shu buyurtmani ko'rish huquqiga egami — order_invoice
    // RPC'ning o'zi RLS mantiqini yuritadi, ya'ni ruxsatni ikki marta
    // yozib qo'yishning hojati yo'q.
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'ORDER_ID_YOQ' }, 400);

    const { data: inv, error: invErr } = await caller.rpc('order_invoice', { p_order_id: order_id });
    if (invErr) return json({ error: invErr.message }, 400);
    if (!inv) return json({ error: 'BUYURTMA_TOPILMADI_YOKI_RUXSAT_YOQ' }, 404);

    const chatId = (inv as any).customer?.telegram_chat_id;
    if (!chatId) {
      return json(
        {
          error: 'TELEGRAM_ULANMAGAN',
          message: `${(inv as any).customer?.name ?? 'Mijoz'} hali botga ulanmagan. Mijoz botda /start bosib telefon raqamini yuborishi kerak.`,
        },
        409
      );
    }

    const pdf = await makePdf(inv);

    const holat = HOLAT[(inv as any).status] ?? (inv as any).status;
    const caption =
      `🧾 <b>Faktura №${(inv as any).order_number}</b>\n` +
      `Holat: ${holat}\n` +
      `Jami: <b>${raqam((inv as any).total)} so'm</b>\n\n` +
      `${(inv as any).org_name ?? ''}`;

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append(
      'document',
      new Blob([pdf], { type: 'application/pdf' }),
      `faktura-${(inv as any).order_number}.pdf`
    );

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const tgJson = await tgRes.json();

    // Yuborilgan xabarlar tarixi — service_role bilan yoziladi, chunki
    // telegram_notifications'da authenticated uchun insert policy yo'q
    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from('telegram_notifications').insert({
      order_id,
      chat_id: chatId,
      kind: 'invoice',
      ok: !!tgJson.ok,
      error: tgJson.ok ? null : JSON.stringify(tgJson).slice(0, 500),
    });

    if (!tgJson.ok) return json({ error: 'TELEGRAM: ' + (tgJson.description ?? 'xato') }, 502);
    return json({ ok: true, chat_id: chatId });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
