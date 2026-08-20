// Xodimlarga xabar yuborish (@yukchibolla_bot orqali). Ikki turi bor:
//
//   { }                 -> yangi buyurtma (bazadagi orders_staff_notify trigger'i)
//   { kind: "digest" }  -> kunlik yakun (pg_cron -> staff_send_daily_digest)
//
// Kimga yuborish va qaysi summani ko'rsatish kerakligini BAZA hal qiladi:
// admin baza narxni, menejer o'z narxini (dollarli savdoda dollarda).
//
// verify_jwt = FALSE: chaqiruvchi bazaning o'zi, JWT yubormaydi. Himoya —
// `x-internal-secret` sarlavhasi (qiymati app_secrets va funksiya
// secret'ida bir xil turadi).

import { createClient } from 'npm:@supabase/supabase-js@2';

const TG = 'https://api.telegram.org/bot';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

function raqam(n: unknown): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function pul(n: unknown, valyuta?: string): string {
  const x = Number(n) || 0;
  return valyuta === 'USD' ? '$' + x.toFixed(2) : raqam(x) + " so'm";
}

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_STAFF_BOT_TOKEN');
  const secret = Deno.env.get('INTERNAL_NOTIFY_SECRET');

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return new Response('FORBIDDEN', { status: 403 });
  }

  let body: any = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  async function yubor(chat_id: number, text: string, reply_markup?: unknown) {
    const r = await fetch(`${TG}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup }),
    });
    return await r.json().catch(() => ({ ok: false }));
  }

  // ------------------------------------------------------- kunlik yakun
  if (body.kind === 'digest') {
    const { data, error } = await supabase.rpc('staff_daily_digest');
    if (error) return new Response('RPC: ' + error.message, { status: 500 });

    const rows = (data ?? []) as any[];
    let yuborildi = 0;

    for (const d of rows) {
      const matn =
        `🌙 <b>Kun yakuni</b>\n\n` +
        `📦 Bugungi buyurtmalar: <b>${d.orders_count}</b>\n` +
        `💰 Summa: <b>${pul(d.total, d.currency)}</b>\n` +
        (Number(d.pending_count) > 0
          ? `\n⚠️ <b>${d.pending_count} ta</b> buyurtma hali tasdiqlanmagan.`
          : `\n✅ Tasdiqlanmagan buyurtma qolmadi.`);

      const j = await yubor(
        d.chat_id,
        matn,
        Number(d.pending_count) > 0
          ? { inline_keyboard: [[{ text: '🆕 Tasdiqlanmaganlarni ko‘rish', callback_data: 'lst:new' }]] }
          : undefined
      );
      if (j.ok) yuborildi++;
    }

    return new Response(JSON.stringify({ ok: true, jami: rows.length, yuborildi }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---------------------------------------------------- yangi buyurtma
  const order_id: string | undefined = body.order_id;
  if (!order_id) return new Response('ORDER_ID_YOQ', { status: 400 });

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
      `💰 <b>${pul(ch.total, ch.currency)}</b>\n` +
      `🕒 ${new Date(ch.created_at).toLocaleString('ru-RU')}`;

    // Amal tugmalari darhol shu yerda — panelga o'tish shart emas.
    // Ruxsatni tugma emas, bosilganda chaqiriladigan RPC tekshiradi.
    const j = await yubor(ch.chat_id, matn, {
      inline_keyboard: [
        [
          { text: '✓ Qabul qilish', callback_data: `ok:${ch.order_id}` },
          { text: '✕ Bekor qilish', callback_data: `cx:${ch.order_id}` },
        ],
        [{ text: '📄 Faktura (PDF)', callback_data: `inv:${ch.order_id}` }],
      ],
    });
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
