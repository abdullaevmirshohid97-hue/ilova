// Yangi buyurtma haqida XODIMLARGA xabar (@yukchibolla_bot orqali).
//
// Chaqiruvchi — bazadagi `orders_staff_notify` trigger'i (pg_net).
// Body: { order_id: uuid }. Kimga yuborish kerakligini `staff_chats_for_order`
// RPC hal qiladi: shu tenant adminlari + mijozning menejeri (+ ulangan
// bo'lsa super_admin). Summa har kim uchun O'ZI ko'rishi kerak bo'lgan
// narxda qaytadi — admin baza narxni, menejer o'z narxini.
//
// verify_jwt = FALSE: trigger JWT yubormaydi. Himoya — `x-internal-secret`
// sarlavhasi (qiymati bazadagi app_secrets jadvalida va funksiya
// secret'ida bir xil turadi).

import { createClient } from 'npm:@supabase/supabase-js@2';

const TG = 'https://api.telegram.org/bot';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

function raqam(n: number): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_STAFF_BOT_TOKEN');
  const secret = Deno.env.get('INTERNAL_NOTIFY_SECRET');

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return new Response('FORBIDDEN', { status: 403 });
  }

  let order_id: string | undefined;
  try {
    order_id = (await req.json())?.order_id;
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }
  if (!order_id) return new Response('ORDER_ID_YOQ', { status: 400 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase.rpc('staff_chats_for_order', { p_order_id: order_id });
  if (error) return new Response('RPC: ' + error.message, { status: 500 });

  const chats = (data ?? []) as any[];
  let yuborildi = 0;

  for (const ch of chats) {
    const matn =
      `🆕 <b>Yangi buyurtma №${ch.order_number}</b>\n\n` +
      `👤 ${esc(ch.customer)}\n` +
      `📞 ${esc(ch.phone ?? '—')}\n` +
      `📦 ${ch.items_count} xil mahsulot\n` +
      `💰 <b>${raqam(ch.total)} so'm</b>\n` +
      `🕒 ${new Date(ch.created_at).toLocaleString('ru-RU')}`;

    const r = await fetch(`${TG}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ch.chat_id,
        text: matn,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '📄 Faktura (PDF)', callback_data: `inv:${ch.order_id}` }]],
        },
      }),
    });
    const j = await r.json().catch(() => ({ ok: false }));
    if (j.ok) yuborildi++;

    await supabase.from('telegram_notifications').insert({
      order_id,
      chat_id: ch.chat_id,
      kind: 'staff_new_order',
      ok: !!j.ok,
      error: j.ok ? null : JSON.stringify(j).slice(0, 500),
    });
  }

  return new Response(JSON.stringify({ ok: true, jami: chats.length, yuborildi }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
