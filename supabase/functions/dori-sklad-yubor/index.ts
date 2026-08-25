// Buyurtmani skladlarga taqsimlab, har biriga Telegramda so'rov yuboradi.
//
// Ikki joydan chaqiriladi:
//   * telegram-dori / dori-miniapp — mijoz buyurtma bergan zahoti
//     (service_role kaliti bilan)
//   * super admin paneli — "SKLADLARGA YUBORISH" tugmasi (foydalanuvchi
//     JWT'si bilan)
//
// XAVFSIZLIK: verify_jwt = TRUE, ya'ni Supabase darvozasi yaroqsiz
// tokenni bu yergacha o'tkazmaydi. Ustiga chaqiruvchi kimligi
// tekshiriladi: service_role kaliti yoki super_admin. Oddiy mijoz
// (u ham authenticated bo'lishi mumkin) boshqa odamning buyurtmasini
// skladlarga yuborib yubormasin.
//
// SKLAD MIJOZ NARXINI KO'RMAYDI: xabarda faqat tannarx bo'ladi.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

function pul(n: unknown): string {
  return (
    Math.round(Number(n) || 0)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm"
  );
}

function miqdor(n: unknown): string {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  if (!token) return json({ error: 'TOKEN_YOQ' }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  // ---------- chaqiruvchi kim ----------
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let ruxsat = false;

  if (auth && auth === serviceKey) {
    // Ichki chaqiruv: bot yoki boshqa edge funksiya
    ruxsat = true;
  } else if (auth) {
    // Foydalanuvchi JWT'si: super admin bo'lishi shart
    const { data: user } = await supabase.auth.getUser(auth);
    const uid = user?.user?.id;
    if (uid) {
      const { data: p } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .maybeSingle();
      ruxsat = (p as any)?.role === 'super_admin';
    }
  }

  if (!ruxsat) return json({ error: 'RUXSAT_YOQ' }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_JSON' }, 400);
  }

  const orderId = String(body.order_id ?? '');
  if (!orderId) return json({ error: 'ORDER_ID_YOQ' }, 400);

  // ---------- taqsimlash ----------
  const { data: taqsim, error: xato1 } = await supabase.rpc('dori_order_split_srv', {
    p_order_id: orderId,
    p_apply: true,
  });
  if (xato1) return json({ error: xato1.message }, 500);

  const { data: sorovlar, error: xato2 } = await supabase.rpc('dori_split_yuborilsin', {
    p_order_id: orderId,
  });
  if (xato2) return json({ error: xato2.message }, 500);

  // ---------- yuborish ----------
  async function tg(method: string, payload: unknown) {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  }

  let yuborildi = 0;
  let chatsiz = 0;

  for (const s of (sorovlar ?? []) as any[]) {
    const chatlar = (s.chatlar ?? []) as string[];
    if (chatlar.length === 0) {
      // Sklad hali Telegramga ulanmagan — so'rov panelda turaveradi
      chatsiz++;
      continue;
    }

    const poz = (s.pozitsiyalar ?? []) as any[];
    const matn =
      `📥 <b>Yangi so‘rov №${esc(s.order_no)}</b>\n` +
      (s.pharmacy ? `${esc(s.pharmacy)}\n` : '') +
      `\n` +
      poz
        .map(
          (it, i) =>
            `${i + 1}. <b>${esc(it.name)}</b>\n   ${miqdor(it.qty)} × ${pul(it.base_price)} = <b>${pul(it.base_sum)}</b>`
        )
        .join('\n\n') +
      `\n\nJami: <b>${pul(s.base_total)}</b>` +
      (s.comment ? `\n\nIzoh: ${esc(s.comment)}` : '');

    const tugmalar = {
      inline_keyboard: [
        [
          { text: '✅ Qabul qilaman', callback_data: `wa:${s.split_id}` },
          { text: '❌ Yo‘q', callback_data: `wr:${s.split_id}` },
        ],
      ],
    };

    let birortasiKetdi = false;
    for (const chat of chatlar) {
      const r = await tg('sendMessage', {
        chat_id: Number(chat),
        text: matn,
        parse_mode: 'HTML',
        reply_markup: tugmalar,
      });
      if ((r as any)?.ok) birortasiKetdi = true;
    }

    if (birortasiKetdi) {
      await supabase.rpc('dori_split_holat_srv', { p_split_id: s.split_id, p_status: 'sent' });
      yuborildi++;
    }
  }

  return json({
    ok: true,
    taqsimot: taqsim,
    yuborildi,
    ulanmagan_sklad: chatsiz,
  });
});
