// Mijozlarga Telegram orqali yangilik xabari.
//
// XAVFSIZLIK: chaqiruvchi SUPER ADMIN bo'lishi shart. Bu funksiya
// yuzlab odamga xabar yuboradi - noto'g'ri qo'lga tushsa spam quroliga
// aylanadi.
//
// TELEGRAM CHEKLOVI: sekundiga ~30 xabar. Undan tez yuborsak 429 keladi
// va bir qismi umuman yetib bormaydi. Shuning uchun har xabardan keyin
// kichik pauza va 429 kelganda kutib qayta urinish.
//
// HOLAT HAR XABARDAN KEYIN YOZILADI: yuborish yarim yo'lda uzilsa ham
// kimga ketgani ma'lum bo'lib qoladi va qayta yuborishda takrorlanmaydi
// (nishonlar faqat "kutmoqda" holatida olinadi).

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'content-type, authorization, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const kut = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD' }), { status: 405, headers: cors });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  if (!token) return new Response(JSON.stringify({ error: 'TOKEN_YOQ' }), { status: 500, headers: cors });

  const supabase = createClient(supabaseUrl, serviceKey);

  // ---------- chaqiruvchi super adminmi ----------
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!auth) return new Response(JSON.stringify({ error: 'TOKEN_YOQ' }), { status: 401, headers: cors });

  let ruxsat = auth === serviceKey;
  if (!ruxsat) {
    const { data: u } = await supabase.auth.getUser(auth);
    const uid = u?.user?.id;
    if (uid) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
      ruxsat = (p as any)?.role === 'super_admin';
    }
  }
  if (!ruxsat) return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: cors });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'BAD_JSON' }), { status: 400, headers: cors });
  }

  const bId = String(body.broadcast_id ?? '');
  if (!bId) return new Response(JSON.stringify({ error: 'BROADCAST_YOQ' }), { status: 400, headers: cors });

  const { data: reja, error: xato } = await supabase.rpc('dori_push_nishonlar', {
    p_broadcast_id: bId,
    p_limit: 500,
  });
  if (xato) return new Response(JSON.stringify({ error: xato.message }), { status: 500, headers: cors });

  const matn = String((reja as any)?.matn ?? '');
  const nishonlar = ((reja as any)?.nishonlar ?? []) as { id: number; chat_id: string }[];

  let yuborildi = 0;
  let xatolar = 0;

  for (const n of nishonlar) {
    let holat = 'xato';
    let sabab: string | null = null;

    for (let urinish = 0; urinish < 3; urinish++) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(n.chat_id),
          text: matn,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const j = await r.json().catch(() => ({}));

      if ((j as any)?.ok) {
        holat = 'yuborildi';
        sabab = null;
        break;
      }

      sabab = String((j as any)?.description ?? r.status);
      // 429: Telegram "shuncha kutib turing" deydi - aynan shuncha kutamiz
      const kutish = (j as any)?.parameters?.retry_after;
      if (r.status === 429 && kutish) {
        await kut((Number(kutish) + 1) * 1000);
        continue;
      }
      // Bloklagan yoki chat yo'q - qayta urinishning ma'nosi yo'q
      break;
    }

    await supabase.rpc('dori_push_belgila', {
      p_target_id: n.id,
      p_holat: holat,
      p_sabab: sabab,
    });

    if (holat === 'yuborildi') yuborildi++;
    else xatolar++;

    // Sekundiga ~25 xabar: Telegram chegarasidan pastda turamiz
    await kut(40);
  }

  return new Response(
    JSON.stringify({ ok: true, jami: nishonlar.length, yuborildi, xato: xatolar }),
    { headers: cors }
  );
});
