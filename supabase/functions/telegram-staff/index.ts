// Xodimlar telegram boti (@yukchibolla_bot) — admin va menejer uchun.
//
// Mijozlar boti (telegram-bot) bilan aralashtirmaslik kerak: u mijozga
// katalog ochadi, bu esa XODIMGA ish quroli beradi:
//   /start KOD        -> panelda olingan kod bo'yicha ulanadi
//   kontakt           -> menejer uchun qulay yo'l (raqami bazada bor)
//   "🆕 Yangi"        -> tasdiqlanmagan buyurtmalar ro'yxati
//   "🧾 Oxirgi 10"    -> so'nggi buyurtmalar
//   tugma bosilsa     -> o'sha buyurtma fakturasi PDF bo'lib keladi
//
// Yangi buyurtma haqidagi xabarni bu fayl EMAS, `telegram-staff-notify`
// yuboradi (uni bazadagi trigger chaqiradi).
//
// verify_jwt = FALSE bo'lishi SHART: chaqiruvchi Telegram serveri, unda
// Supabase JWT yo'q. Himoya — URL'dagi maxfiy `secret_token` sarlavhasi.

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

async function tg(token: string, method: string, body: unknown) {
  const r = await fetch(`${TG}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await r.json();
}

const HOLAT_BELGI: Record<string, string> = {
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

const KLAVIATURA = {
  keyboard: [[{ text: '🆕 Yangi buyurtmalar' }, { text: '🧾 Oxirgi 10 ta' }]],
  resize_keyboard: true,
};

const ROL_MATN: Record<string, string> = {
  admin: 'Administrator',
  super_admin: 'Super admin',
  manager: 'Menejer',
};

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_STAFF_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_STAFF_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });

  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('FORBIDDEN', { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Shu chat qaysi xodimga bog'langan? (bog'lanmagan bo'lsa null)
  async function xodim(chatId: number) {
    const { data } = await supabase
      .from('staff_telegram')
      .select('profile_id, profiles ( role, full_name )')
      .eq('chat_id', chatId)
      .maybeSingle();
    return data as any;
  }

  // Buyurtmalar ro'yxati + har biriga faktura tugmasi
  async function royxatYubor(chatId: number, status: string | null, sarlavha: string) {
    const { data, error } = await supabase.rpc('staff_orders_for_chat', {
      p_chat_id: chatId,
      p_status: status,
      p_limit: 10,
    });
    if (error) {
      await tg(token!, 'sendMessage', { chat_id: chatId, text: '❌ Xatolik: ' + error.message });
      return;
    }
    const orders = (data ?? []) as any[];
    if (orders.length === 0) {
      await tg(token!, 'sendMessage', {
        chat_id: chatId,
        text: `${sarlavha}\n\nHozircha buyurtma yo'q.`,
        parse_mode: 'HTML',
        reply_markup: KLAVIATURA,
      });
      return;
    }

    const matn = orders
      .map(
        (o) =>
          `${HOLAT_BELGI[o.status] ?? ''} <b>№${o.order_number}</b> · ${new Date(
            o.created_at
          ).toLocaleDateString('ru-RU')}\n` +
          `${esc(o.customer)} · ${esc(o.phone ?? '')}\n` +
          `${HOLAT_MATN[o.status] ?? o.status} · <b>${raqam(o.total)} so'm</b>`
      )
      .join('\n\n');

    const tugmalar = orders.map((o) => [
      { text: `📄 №${o.order_number} — ${esc(o.customer).slice(0, 20)}`, callback_data: `inv:${o.id}` },
    ]);

    await tg(token!, 'sendMessage', {
      chat_id: chatId,
      text: `${sarlavha}\n\n${matn}\n\n<i>Faktura PDF olish uchun pastdagi tugmani bosing 👇</i>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: tugmalar },
    });
  }

  // ------------------------------------------------ tugma bosildi (faktura)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId: number = cq.message?.chat?.id;
    const data: string = cq.data ?? '';

    if (data.startsWith('inv:')) {
      await tg(token, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Faktura tayyorlanmoqda...',
      });

      // PDF bitta joyda — telegram-notify'da yasaladi. x-staff-chat-id
      // sarlavhasi "fakturani mijozga emas, shu xodimga yubor" degani.
      const r = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          'x-staff-chat-id': String(chatId),
        },
        body: JSON.stringify({ order_id: data.slice(4) }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        await tg(token, 'sendMessage', {
          chat_id: chatId,
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
  const bogliq = await xodim(chatId);

  // ----------------------------------------------------- kontakt (menejer)
  if (msg.contact) {
    const { data } = await supabase.rpc('staff_telegram_link_phone', {
      p_phone: msg.contact.phone_number,
      p_chat_id: chatId,
      p_username: from.username ?? null,
      p_first_name: from.first_name ?? null,
    });
    if ((data as any)?.ok) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `✅ Ulandingiz, <b>${esc((data as any).name)}</b> (menejer).\n\n` +
          `Endi yangi buyurtmalar shu yerga keladi va istalgan buyurtmaning ` +
          `fakturasini PDF qilib olasiz.`,
        parse_mode: 'HTML',
        reply_markup: KLAVIATURA,
      });
    } else {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `❌ Bu raqam menejerlar ro'yxatida topilmadi.\n\n` +
          `Agar siz administrator bo'lsangiz, panelga kiring: ` +
          `<b>Sozlamalar → Telegram bot</b> bo'limidan ulanish havolasini oling.`,
        parse_mode: 'HTML',
      });
    }
    return new Response('ok');
  }

  // --------------------------------------------------------------- /start
  if (text.startsWith('/start')) {
    const kod = text.slice(6).trim();

    if (kod) {
      const { data } = await supabase.rpc('staff_telegram_link', {
        p_code: kod,
        p_chat_id: chatId,
        p_username: from.username ?? null,
        p_first_name: from.first_name ?? null,
      });
      if ((data as any)?.ok) {
        const rol = ROL_MATN[(data as any).role] ?? (data as any).role;
        await tg(token, 'sendMessage', {
          chat_id: chatId,
          text:
            `✅ Ulandingiz, <b>${esc((data as any).name || rol)}</b> (${rol}).\n\n` +
            `Endi yangi buyurtma tushishi bilan shu yerga xabar keladi. ` +
            `Fakturani PDF qilib olish uchun pastdagi tugmalardan foydalaning.`,
          parse_mode: 'HTML',
          reply_markup: KLAVIATURA,
        });
      } else {
        await tg(token, 'sendMessage', {
          chat_id: chatId,
          text:
            `❌ Kod noto'g'ri yoki muddati o'tgan (kod 30 daqiqa amal qiladi).\n\n` +
            `Paneldan yangi havola oling: <b>Sozlamalar → Telegram bot</b>.`,
          parse_mode: 'HTML',
        });
      }
      return new Response('ok');
    }

    if (bogliq) {
      const rol = ROL_MATN[bogliq.profiles?.role] ?? bogliq.profiles?.role;
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: `Salom, <b>${esc(bogliq.profiles?.full_name || rol)}</b>! 👋\n\nPastdagi tugmalardan foydalaning.`,
        parse_mode: 'HTML',
        reply_markup: KLAVIATURA,
      });
    } else {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `Assalomu alaykum! 👋\n\nBu <b>xodimlar</b> boti — bu yerga yangi ` +
          `buyurtmalar tushadi va fakturalarni PDF qilib olasiz.\n\n` +
          `Ulanish uchun panelga kiring: <b>Sozlamalar → Telegram bot</b> — ` +
          `u yerdagi havolani bosing.\n\n` +
          `Menejer bo'lsangiz, telefon raqamingizni yuborsangiz ham bo'ladi 👇`,
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

  // ------------------------------------------------------------ ulanmagan
  if (!bogliq) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: "Avval ulanishingiz kerak — /start bosing.",
    });
    return new Response('ok');
  }

  // ------------------------------------------------------------- /uzish
  if (text.startsWith('/uzish')) {
    await supabase.from('staff_telegram').delete().eq('chat_id', chatId);
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: "🔌 Uzildi. Qayta ulanish uchun paneldan havola oling.",
      reply_markup: { remove_keyboard: true },
    });
    return new Response('ok');
  }

  // --------------------------------------------------------- buyurtmalar
  if (text.includes('Yangi')) {
    await royxatYubor(chatId, 'new', '🆕 <b>Yangi buyurtmalar</b>');
    return new Response('ok');
  }
  if (text.includes('Oxirgi')) {
    await royxatYubor(chatId, null, '🧾 <b>Oxirgi buyurtmalar</b>');
    return new Response('ok');
  }

  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: "Pastdagi tugmalardan foydalaning 👇\n\nUlanishni uzish: /uzish",
    reply_markup: KLAVIATURA,
  });

  return new Response('ok');
});
