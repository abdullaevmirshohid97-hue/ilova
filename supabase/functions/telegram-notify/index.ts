// Buyurtma fakturasini Telegram orqali yuborish (PDF fayl bilan).
//
// Uchta chaqiruvchi bor va uchalasi ham SHU YERDAGI bitta PDF yasovchidan
// foydalanadi — faktura ko'rinishi hamma joyda bir xil bo'lsin:
//   1. Panel (admin/menejer) "📤 Telegramga yuborish" — mijozning chatiga
//   2. Mijoz boti (telegram-bot)  — x-bot-chat-id sarlavhasi bilan
//   3. Xodim boti (telegram-staff) — x-staff-chat-id sarlavhasi bilan,
//      faktura xodimning O'ZIGA yuboriladi (xodim boti tokeni bilan)
//
// Body: { order_id: uuid }
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

// Mahsulot rasmini storage'dan olib PDF ichiga joylash uchun tayyorlaymiz.
// Bitta rasm bir necha qatorda takrorlanishi mumkin, shuning uchun natija
// keshlanadi. Rasm yuklanmasa faktura RASMSIZ chiqadi — bu butun yuborishni
// to'xtatishdan afzal.
async function embedImages(doc: any, inv: any, baseUrl: string) {
  const kesh = new Map<string, any>();
  const yollar = [
    ...new Set(
      (inv.items ?? [])
        .map((it: any) => it.image_path)
        .filter((p: unknown): p is string => typeof p === 'string' && p.length > 0)
    ),
  ];

  await Promise.all(
    yollar.map(async (yol) => {
      try {
        const url = `${baseUrl}/storage/v1/object/public/product-images/${yol}`;
        const r = await fetch(url);
        if (!r.ok) return;
        const bytes = new Uint8Array(await r.arrayBuffer());
        // Turini baytlardan aniqlaymiz: PNG sarlavhasi 0x89 'P' 'N' 'G'
        const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        kesh.set(yol, png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
      } catch {
        // rasm bo'lmasa shunchaki tashlab ketamiz
      }
    })
  );
  return kesh;
}

async function makePdf(inv: any, baseUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const rasmlar = await embedImages(doc, inv, baseUrl);

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

  // jadval sarlavhasi — rasm ustuni qo'shilgani uchun nom o'ngga surildi
  const IMG = 30; // rasm tomoni, pt
  const cols = { n: M, img: M + 18, name: M + 18 + IMG + 8, qty: 350, price: 415, sum: 495 };
  page.drawRectangle({ x: M, y: y - 5, width: 595 - M * 2, height: 20, color: rgb(0.96, 0.94, 1) });
  t('#', cols.n, y, 8, bold);
  t('MAHSULOT', cols.name, y, 8, bold);
  t('MIQDOR', cols.qty, y, 8, bold);
  t('NARX', cols.price, y, 8, bold);
  t('SUMMA', cols.sum, y, 8, bold);
  y -= 26;

  for (const [i, it] of (inv.items ?? []).entries()) {
    // Rasm bilan qator balandroq — sahifa chegarasini shunga qarab tekshiramiz
    if (y < 130) {
      page = doc.addPage([595, 842]);
      y = 842 - M;
    }
    const nomi = wa(it.name).slice(0, 34);
    const olcham = wa([it.size, it.color].filter(Boolean).join(' / ')).slice(0, 34);
    const rasm = it.image_path ? rasmlar.get(it.image_path) : null;

    // Matn rasmning o'rtasiga to'g'ri kelsin
    const matnY = rasm ? y - 8 : y;

    if (rasm) {
      page.drawImage(rasm, { x: cols.img, y: y - IMG + 4, width: IMG, height: IMG });
    }
    t(String(i + 1), cols.n, matnY, 9);
    t(nomi, cols.name, matnY, 10);
    if (olcham) t(olcham, cols.name, matnY - 10, 8, font, grey);
    t(raqam(it.qty), cols.qty, matnY, 10);
    t(raqam(it.unit_price), cols.price, matnY, 10);
    t(raqam(it.line_total), cols.sum, matnY, 10, bold);

    y -= rasm ? IMG + 10 : olcham ? 26 : 18;
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const botChatId = req.headers.get('x-bot-chat-id');
    const staffChatId = req.headers.get('x-staff-chat-id');
    const xizmatChaqiruvi = authHeader.includes(serviceKey);
    const admin = createClient(supabaseUrl, serviceKey);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'ORDER_ID_YOQ' }, 400);

    let inv: any = null;
    // Kimga va qaysi bot orqali ketishi shu ikki o'zgaruvchida hal bo'ladi
    let chatId: number | null = null;
    let token = Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (staffChatId && xizmatChaqiruvi) {
      // Chaqiruvchi — xodim boti. Faktura mijozga emas, XODIMNING o'ziga
      // ketadi va narx turi uning roliga qarab tanlanadi (admin baza narxni,
      // menejer o'z narxini ko'radi) — buni RPC hal qiladi.
      token = Deno.env.get('TELEGRAM_STAFF_BOT_TOKEN');
      if (!token) return json({ error: 'TELEGRAM_STAFF_BOT_TOKEN_YOQ' }, 500);

      const { data, error } = await admin.rpc('order_invoice_for_staff_chat', {
        p_order_id: order_id,
        p_chat_id: Number(staffChatId),
      });
      if (error) return json({ error: error.message }, 400);
      inv = data;
      if (!inv) return json({ error: 'BUYURTMA_TOPILMADI_YOKI_RUXSAT_YOQ' }, 404);
      chatId = Number(staffChatId);
    } else if (botChatId && xizmatChaqiruvi) {
      // Chaqiruvchi — bot (telegram-bot funksiyasi). Unda auth.uid() yo'q,
      // shuning uchun order_invoice ishlamaydi; o'rniga chat_id bog'lanishi
      // bo'yicha tekshiradigan alohida RPC ishlatiladi.
      const { data, error } = await admin.rpc('order_invoice_for_chat', {
        p_order_id: order_id,
        p_chat_id: Number(botChatId),
      });
      if (error) return json({ error: error.message }, 400);
      inv = data;
      if (!inv) return json({ error: 'BUYURTMA_SIZGA_TEGISHLI_EMAS' }, 404);
    } else {
      // Odatdagi yo'l: admin/menejer/mijoz o'z JWT'si bilan. Ruxsatni
      // order_invoice RPC'ning o'zi hal qiladi — RLS mantiqi takrorlanmaydi.
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await caller.auth.getUser();
      if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

      const { data, error } = await caller.rpc('order_invoice', { p_order_id: order_id });
      if (error) return json({ error: error.message }, 400);
      inv = data;
      if (!inv) return json({ error: 'BUYURTMA_TOPILMADI_YOKI_RUXSAT_YOQ' }, 404);
    }

    // Xodim yo'lida manzil yuqorida aniqlangan; qolgan ikkisida faktura
    // mijozning o'z chatiga ketadi
    if (chatId === null) {
      chatId = (inv as any).customer?.telegram_chat_id ?? null;
      if (!chatId) {
        return json(
          {
            error: 'TELEGRAM_ULANMAGAN',
            message: `${(inv as any).customer?.name ?? 'Mijoz'} hali botga ulanmagan. Mijoz botda /start bosib telefon raqamini yuborishi kerak.`,
          },
          409
        );
      }
    }

    if (!token) return json({ error: 'TELEGRAM_BOT_TOKEN_YOQ' }, 500);

    const pdf = await makePdf(inv, supabaseUrl);

    const holat = HOLAT[(inv as any).status] ?? (inv as any).status;
    const xodimga = !!staffChatId && xizmatChaqiruvi;
    const caption =
      `🧾 <b>Faktura №${(inv as any).order_number}</b>\n` +
      (xodimga ? `Mijoz: ${(inv as any).customer?.name ?? '-'}\n` : '') +
      `Holat: ${holat}\n` +
      `Jami: <b>${raqam((inv as any).total)} so'm</b>` +
      // Admin baza (rasmiy) narxni ko'radi — chalkashmasin uchun aytib qo'yamiz
      ((inv as any).price_kind === 'base' ? ' <i>(rasmiy narx)</i>' : '') +
      `\n\n${(inv as any).org_name ?? ''}`;

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
    await admin.from('telegram_notifications').insert({
      order_id,
      chat_id: chatId,
      kind: xodimga ? 'invoice_staff' : 'invoice',
      ok: !!tgJson.ok,
      error: tgJson.ok ? null : JSON.stringify(tgJson).slice(0, 500),
    });

    if (!tgJson.ok) return json({ error: 'TELEGRAM: ' + (tgJson.description ?? 'xato') }, 502);
    return json({ ok: true, chat_id: chatId });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
