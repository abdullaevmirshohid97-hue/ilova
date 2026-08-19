// Telegram bot webhook — mijozlar uchun.
//
// Oqim:
//   /start          -> salom + "📞 Telefon yuborish" tugmasi
//   kontakt keldi   -> telefon bo'yicha mijoz topiladi va chat_id bog'lanadi
//   "🛍 Katalog"    -> Mini App (mijoz web-ilovasi) ochiladi
//   "🧾 Buyurtmalarim" -> oxirgi buyurtmalar ro'yxati
//
// Faktura buyurtma tasdiqlanganda `telegram-notify` funksiyasi orqali
// yuboriladi — bu fayl faqat foydalanuvchi bilan muloqotni boshqaradi.
//
// verify_jwt = FALSE bo'lishi SHART: chaqiruvchi Telegram serveri, unda
// Supabase JWT yo'q. O'rniga URL'dagi maxfiy `secret` tekshiriladi
// (Telegram'ning setWebhook secret_token mexanizmi).

import { createClient } from 'npm:@supabase/supabase-js@2';

const TG = 'https://api.telegram.org/bot';

function esc(s: string): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

function raqam(n: number): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function tg(token: string, method: string, body: unknown) {
  const r = await fetch(`${TG}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await r.json();
}

// Telefonni taqqoslash uchun faqat raqamlar (+998 90 111-22-33 -> 998901112233)
function faqatRaqam(s: string): string {
  return String(s ?? '').replace(/\D/g, '');
}

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const miniAppUrl = Deno.env.get('MINI_APP_URL') ?? 'https://app.yukchibolla.com';

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });

  // Telegram har so'rovda shu sarlavhani yuboradi — begona so'rovlarni kesamiz
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('FORBIDDEN', { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // ---------------------------------------------- tugma bosildi (callback)
  // "Buyurtmalarim" ro'yxatidagi tugma bosilsa shu yerga tushadi va
  // telegram-notify funksiyasi fakturani PDF qilib yuboradi.
  if (update.callback_query) {
    const cq = update.callback_query;
    const cqChat: number = cq.message?.chat?.id;
    const data: string = cq.data ?? '';

    if (data.startsWith('inv:')) {
      const orderId = data.slice(4);
      await tg(token, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Faktura tayyorlanmoqda...',
      });

      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Bot service_role bilan murojaat qiladi; telegram-notify esa
          // fakturani AYNAN shu chat egasiga tegishli ekanini tekshiradi
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'x-bot-chat-id': String(cqChat),
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        await tg(token, 'sendMessage', {
          chat_id: cqChat,
          text: `❌ Faktura yuborilmadi.\n${esc((j as any)?.message ?? (j as any)?.error ?? '')}`,
          parse_mode: 'HTML',
        });
      }
    } else {
      await tg(token, 'answerCallbackQuery', { callback_query_id: cq.id });
    }
    return new Response('ok');
  }

  const msg = update.message ?? update.edited_message;
  if (!msg) return new Response('ok');

  const chatId: number = msg.chat.id;
  const text: string = msg.text ?? '';
  const from = msg.from ?? {};

  // Sessiyani doim yangilab boramiz (kim yozgani ko'rinib tursin)
  await supabase.from('telegram_sessions').upsert(
    {
      chat_id: chatId,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'chat_id' }
  );

  // Shu chat allaqachon mijozga bog'langanmi?
  const { data: bogliq } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  const asosiyKlaviatura = {
    keyboard: [[{ text: '🛍 Katalog', web_app: { url: miniAppUrl } }], [{ text: '🧾 Buyurtmalarim' }]],
    resize_keyboard: true,
  };

  // ------------------------------------------------------------- kontakt
  if (msg.contact) {
    const tel = faqatRaqam(msg.contact.phone_number);
    // Mijozlar bazasidagi telefon turli formatda saqlangan bo'lishi mumkin,
    // shuning uchun oxirgi 9 raqam bo'yicha solishtiramiz
    const oxirgi9 = tel.slice(-9);
    const { data: hammasi } = await supabase.from('customers').select('id, name, phone').eq('is_active', true);
    const topildi = (hammasi ?? []).find((c: any) => faqatRaqam(c.phone).slice(-9) === oxirgi9);

    if (!topildi) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `❌ <b>${esc(msg.contact.phone_number)}</b> raqami bazada topilmadi.\n\n` +
          `Iltimos, do'kon administratoriga murojaat qiling — u sizni tizimga qo'shadi.`,
        parse_mode: 'HTML',
      });
      return new Response('ok');
    }

    await supabase
      .from('customers')
      .update({ telegram_chat_id: chatId, telegram_username: from.username ?? null })
      .eq('id', topildi.id);
    await supabase
      .from('telegram_sessions')
      .update({ phone: msg.contact.phone_number, customer_id: topildi.id, state: 'linked' })
      .eq('chat_id', chatId);

    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        `✅ Xush kelibsiz, <b>${esc(topildi.name)}</b>!\n\n` +
        `Endi katalogdan buyurtma bera olasiz. Buyurtmangiz tasdiqlanganda ` +
        `fakturasi shu yerga avtomatik keladi.`,
      parse_mode: 'HTML',
      reply_markup: asosiyKlaviatura,
    });
    return new Response('ok');
  }

  // --------------------------------------------------------------- /start
  if (text.startsWith('/start')) {
    if (bogliq) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: `Salom, <b>${esc(bogliq.name)}</b>! 👋\n\nKatalogni ochish uchun pastdagi tugmani bosing.`,
        parse_mode: 'HTML',
        reply_markup: asosiyKlaviatura,
      });
    } else {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `Assalomu alaykum! 👋\n\nBu <b>ulgurji savdo</b> boti.\n\n` +
          `Sizni tanishimiz uchun telefon raqamingizni yuboring — ` +
          `pastdagi tugmani bosing.`,
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [[{ text: '📞 Telefon raqamni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
    return new Response('ok');
  }

  // ------------------------------------------------------- buyurtmalarim
  if (text.includes('Buyurtmalarim')) {
    if (!bogliq) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Avval telefon raqamingizni yuboring — /start',
      });
      return new Response('ok');
    }

    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, total, created_at')
      .eq('customer_id', bogliq.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!orders || orders.length === 0) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: "Hali buyurtmangiz yo'q. 🛍 Katalog tugmasi orqali birinchi buyurtmani bering.",
        reply_markup: asosiyKlaviatura,
      });
      return new Response('ok');
    }

    const HOLAT: Record<string, string> = {
      new: '🆕',
      confirmed: '✅',
      picking: '📦',
      done: '🏁',
      cancelled: '❌',
    };
    const HOLAT_MATN: Record<string, string> = {
      new: 'Yangi',
      confirmed: 'Qabul qilingan',
      picking: "Yig'ilmoqda",
      done: 'Yopilgan',
      cancelled: 'Bekor qilingan',
    };

    // Har bir buyurtma — alohida tugma. Bosilganda fakturasi PDF bo'lib
    // keladi (yuqoridagi callback_query bo'limiga tushadi).
    const tugmalar = orders.map((o: any) => {
      const sana = new Date(o.created_at).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
      return [
        {
          text: `${HOLAT[o.status] ?? ''} №${o.order_number} · ${sana} · ${raqam(o.total)} so'm`,
          callback_data: `inv:${o.id}`,
        },
      ];
    });

    const royxat = orders
      .map(
        (o: any) =>
          `<b>№${o.order_number}</b> · ${new Date(o.created_at).toLocaleDateString('ru-RU')}\n` +
          `${HOLAT[o.status] ?? ''} ${HOLAT_MATN[o.status] ?? o.status} · <b>${raqam(o.total)} so'm</b>`
      )
      .join('\n\n');

    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        `🧾 <b>Buyurtmalaringiz</b>\n\n${royxat}\n\n` +
        `<i>Fakturani PDF ko'rinishida olish uchun pastdagi tugmalardan birini bosing 👇</i>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: tugmalar },
    });
    return new Response('ok');
  }

  // ------------------------------------------------------------- boshqasi
  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: bogliq
      ? 'Pastdagi tugmalardan foydalaning 👇'
      : 'Boshlash uchun /start yozing.',
    reply_markup: bogliq ? asosiyKlaviatura : undefined,
  });

  return new Response('ok');
});
