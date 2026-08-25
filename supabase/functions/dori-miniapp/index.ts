// Dori Mini App uchun API.
//
// Mini App brauzerda ochiladi, ya'ni unda service_role kaliti bo'lishi
// MUMKIN EMAS. Shuning uchun u kim ekanini Telegram imzosi bilan
// isbotlaydi: Telegram har bir Mini App ochilishida `initData` beradi va
// uni bot tokeni bilan imzolaydi. Bu yerda o'sha imzo tekshiriladi va
// chat_id AYNAN imzodan olinadi — brauzerdan kelgan chat_id'ga
// ishonilmaydi, aks holda istalgan odam boshqa birovning savatini
// ochib yuborardi.
//
// Imzo tekshiruvi (Telegram hujjatiga ko'ra):
//   secret = HMAC_SHA256(key: "WebAppData", data: bot_token)
//   hash   = HMAC_SHA256(key: secret, data: tekshiruv_satri)
//
// verify_jwt = FALSE: chaqiruvchi brauzer, Supabase JWT yo'q.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function hmac(kalit: ArrayBuffer | Uint8Array, matn: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    kalit as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(matn)));
}

function hex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// initData'ni tekshirib, ichidagi foydalanuvchini qaytaradi
async function initDataniTekshir(initData: string, token: string): Promise<{ id: number; name: string } | null> {
  try {
    const p = new URLSearchParams(initData);
    const hash = p.get('hash');
    if (!hash) return null;
    p.delete('hash');

    // Tekshiruv satri: kalitlar alifbo tartibida, "kalit=qiymat", \n bilan
    const satr = [...p.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');

    const secret = await hmac(new TextEncoder().encode('WebAppData'), token);
    const kutilgan = hex(await hmac(secret, satr));
    if (kutilgan !== hash) return null;

    // Eskirgan initData qabul qilinmaydi (24 soat)
    const authDate = Number(p.get('auth_date') ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

    const user = JSON.parse(p.get('user') ?? '{}');
    if (!user?.id) return null;
    return { id: Number(user.id), name: [user.first_name, user.last_name].filter(Boolean).join(' ') };
  } catch {
    return null;
  }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  if (!token) return json({ error: 'TOKEN_YOQ' }, 500);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_JSON' }, 400);
  }

  const user = await initDataniTekshir(String(body.initData ?? ''), token);
  if (!user) return json({ error: 'IMZO_NOTOGRI' }, 401);

  const chatId = user.id;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Mijoz kartochkasi bo'lmasa ham katalogni ko'rsatamiz, lekin buyurtma
  // berish uchun telefon kerak — uni bot orqali beradi
  const { data: mijoz } = await supabase
    .from('dori_customers')
    .select('phone, name, is_blocked')
    .eq('chat_id', chatId)
    .maybeSingle();

  const amal = String(body.amal ?? '');

  try {
    if (amal === 'qidir') {
      const { data, error } = await supabase.rpc('dori_search', {
        p_q: String(body.q ?? ''),
        p_limit: 30,
      });
      if (error) throw error;
      return json({ ok: true, items: data ?? [] });
    }

    // Katalogni varaqlash — mijoz ochishi bilan ro'yxat ko'rinadi
    if (amal === 'katalog') {
      const { data, error } = await supabase.rpc('dori_catalog_page', {
        p_group: body.guruh ? String(body.guruh) : null,
        p_offset: Number(body.offset ?? 0),
        p_limit: 40,
      });
      if (error) throw error;
      return json({ ok: true, ...(data as any) });
    }

    if (amal === 'guruhlar') {
      const { data, error } = await supabase.rpc('dori_groups');
      if (error) throw error;
      return json({ ok: true, guruhlar: data ?? [] });
    }

    if (amal === 'savat') {
      const { data, error } = await supabase.rpc('dori_bot_cart', { p_chat_id: chatId });
      if (error) throw error;
      return json({ ok: true, savat: data, mijoz: { phone: (mijoz as any)?.phone ?? null } });
    }

    if (amal === 'qosh') {
      const { data, error } = await supabase.rpc('dori_bot_cart_add', {
        p_chat_id: chatId,
        p_product_id: String(body.product_id ?? ''),
        p_qty: Number(body.qty ?? 0),
      });
      if (error) throw error;
      return json({ ok: true, natija: data });
    }

    // Savatdagi miqdorni TAHRIRLASH - aniq qiymatga o'rnatiladi.
    // 'qosh' qo'shib boradi, shuning uchun u tahrir uchun yaramaydi:
    // "+" tugmasi ikki marta yuborilib qolsa miqdor ikki barobar oshardi.
    if (amal === 'ozgartir') {
      const { data, error } = await supabase.rpc('dori_bot_cart_set', {
        p_chat_id: chatId,
        p_product_id: String(body.product_id ?? ''),
        p_qty: Number(body.qty ?? 0),
      });
      if (error) throw error;
      return json({ ok: true, natija: data });
    }

    if (amal === 'ochir') {
      const { error } = await supabase.rpc('dori_bot_cart_clear', {
        p_chat_id: chatId,
        p_product_id: body.product_id ? String(body.product_id) : null,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (amal === 'buyurtma') {
      if (!(mijoz as any)?.phone) {
        return json({ ok: false, error: 'TELEFON_KERAK' });
      }
      const { data, error } = await supabase.rpc('dori_bot_order_create', {
        p_chat_id: chatId,
        p_comment: body.izoh ? String(body.izoh) : null,
      });
      if (error) throw error;

      // Buyurtma skladlarga taqsimlanadi va har sklad o'z so'rovini
      // Telegramda oladi. Javobini KUTMAYMIZ: mijoz "buyurtma qabul
      // qilindi" xabarini uch sklad javob berguncha kutib turmasin.
      const oid = (data as any)?.order_id;
      if (oid) {
        fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/dori-sklad-yubor', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
          },
          body: JSON.stringify({ order_id: oid }),
        }).catch(() => {});
      }

      return json({ ok: true, natija: data });
    }

    return json({ error: 'NOMALUM_AMAL' }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});
