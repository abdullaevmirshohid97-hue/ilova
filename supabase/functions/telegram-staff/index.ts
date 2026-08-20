// Xodimlar telegram boti (@yukchibolla_bot) — admin va menejer uchun.
//
// Mijozlar boti (telegram-bot) bilan aralashtirmaslik kerak: u mijozga
// katalog ochadi, bu esa XODIMGA ish quroli beradi:
//   /start KOD     -> panelda olingan yoki admin yuborgan kod bilan ulanish
//   kontakt        -> telefon orqali tasdiqlash
//   🆕 / 🧾        -> buyurtmalar; kartochkadan turib qabul/bekor/faktura
//   👥 / 💰 / 🔎   -> mijozlarim, qarzdorlar, narx so'rash (menejer uchun)
//
// Yangi buyurtma xabarini `telegram-staff-notify` yuboradi (uni bazadagi
// trigger chaqiradi), kunlik yakunni esa o'sha funksiya pg_cron orqali.
//
// XAVFSIZLIK:
//  * verify_jwt = FALSE bo'lishi SHART (chaqiruvchi Telegram serveri),
//    himoya — `x-telegram-bot-api-secret-token` sarlavhasi.
//  * Kontakt kelganda `contact.user_id === from.id` tekshiriladi:
//    Telegramda boshqa odamning kontakt kartochkasini yuborish mumkin,
//    ya'ni bu tekshiruvsiz begona odam birovning raqami bilan ulanib
//    olardi.
//  * Bot hech qachon o'zi ruxsat hisoblamaydi — har bir amal va har bir
//    ro'yxat bazadagi chat_id bog'lanishiga tayanadigan RPC orqali.

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

// Menejer dollarda sotgan bo'lsa summa dollarda. Qaysi valyuta ekanini
// baza hal qiladi (order_usd_total qoidasi) — bu yer faqat yozadi.
function pul(n: unknown, valyuta?: string): string {
  const x = Number(n) || 0;
  return valyuta === 'USD' ? '$' + x.toFixed(2) : raqam(x) + " so'm";
}

function sana(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU');
}

const HOLAT_BELGI: Record<string, string> = {
  new: '🆕',
  confirmed: '✅',
  picking: '📦',
  done: '🏁',
  cancelled: '❌',
};

const HOLAT_MATN: Record<string, string> = {
  new: 'Yangi — tasdiqlanmagan',
  confirmed: 'Qabul qilingan',
  picking: "Yig'ilmoqda",
  done: 'Yopilgan',
  cancelled: 'Bekor qilingan',
};

const ROL_MATN: Record<string, string> = {
  admin: 'Administrator',
  super_admin: 'Super admin',
  manager: 'Menejer',
};

// Menyu roldan kelib chiqadi: narx so'rash faqat menejerda bo'ladi,
// chunki menejer narxi adminga ko'rinmasligi kerak.
function menyu(rol: string) {
  const qatorlar: { text: string }[][] = [
    [{ text: '🆕 Yangi buyurtmalar' }, { text: '🧾 Oxirgi 10 ta' }],
    [{ text: '👥 Mijozlarim' }, { text: '💰 Qarzdorlar' }],
  ];
  if (rol === 'manager') qatorlar.push([{ text: '🔎 Narx so‘rash' }]);
  return { keyboard: qatorlar, resize_keyboard: true };
}

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

  async function tg(method: string, body: unknown) {
    const r = await fetch(`${TG}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  }

  const yubor = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
    tg('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

  async function xodim(chatId: number) {
    const { data } = await supabase
      .from('staff_telegram')
      .select('profile_id, profiles ( role, full_name )')
      .eq('chat_id', chatId)
      .maybeSingle();
    return data as any;
  }

  const holatOl = async (chatId: number) => {
    const { data } = await supabase.rpc('staff_bot_state_get', { p_chat_id: chatId });
    return (data as any) ?? { state: 'idle', data: {} };
  };
  const holatQoy = (chatId: number, state: string, data: unknown = {}) =>
    supabase.rpc('staff_bot_state_set', { p_chat_id: chatId, p_state: state, p_data: data });

  // ---------------------------------------------------- buyurtma kartochkasi
  function kartaMatni(k: any): string {
    return (
      `${HOLAT_BELGI[k.status] ?? ''} <b>Buyurtma №${k.order_number}</b>\n\n` +
      `👤 ${esc(k.customer)}\n` +
      `📞 ${esc(k.phone ?? '—')}\n` +
      `📦 ${k.items_count} xil mahsulot\n` +
      `💰 <b>${pul(k.total, k.currency)}</b>\n` +
      `🕒 ${new Date(k.created_at).toLocaleString('ru-RU')}\n\n` +
      `Holat: <b>${HOLAT_MATN[k.status] ?? k.status}</b>`
    );
  }

  function kartaTugmalari(k: any) {
    const id = k.order_id;
    const qatorlar: any[][] = [];

    if (k.can_act) {
      if (k.status === 'new') {
        qatorlar.push([
          { text: '✓ Qabul qilish', callback_data: `ok:${id}` },
          { text: '✕ Bekor qilish', callback_data: `cx:${id}` },
        ]);
      } else if (k.status === 'confirmed') {
        qatorlar.push([{ text: "📦 Yig'ishga berish", callback_data: `pick:${id}` }]);
      } else if (k.status === 'picking') {
        qatorlar.push([{ text: '🏁 Yopish (topshirildi)', callback_data: `done:${id}` }]);
      }
    }

    const pastki: any[] = [{ text: '📄 Faktura (PDF)', callback_data: `inv:${id}` }];
    if (k.customer_linked) pastki.push({ text: '📤 Mijozga', callback_data: `snd:${id}` });
    qatorlar.push(pastki);

    return { inline_keyboard: qatorlar };
  }

  async function kartaYubor(chatId: number, orderId: string, messageId?: number) {
    const { data } = await supabase.rpc('staff_order_card', {
      p_order_id: orderId,
      p_chat_id: chatId,
    });
    if (!data) {
      await yubor(chatId, '❌ Buyurtma topilmadi yoki sizga tegishli emas.');
      return;
    }
    const k = data as any;
    if (messageId) {
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: kartaMatni(k),
        parse_mode: 'HTML',
        reply_markup: kartaTugmalari(k),
      });
    } else {
      await yubor(chatId, kartaMatni(k), { reply_markup: kartaTugmalari(k) });
    }
  }

  // ---------------------------------------------------------- ro'yxatlar
  async function royxatYubor(chatId: number, status: string | null, sarlavha: string) {
    const { data, error } = await supabase.rpc('staff_orders_for_chat', {
      p_chat_id: chatId,
      p_status: status,
      p_limit: 10,
    });
    if (error) {
      await yubor(chatId, '❌ Xatolik: ' + esc(error.message));
      return;
    }
    const orders = (data ?? []) as any[];
    if (orders.length === 0) {
      await yubor(chatId, `${sarlavha}\n\nHozircha buyurtma yo'q.`);
      return;
    }

    const matn = orders
      .map(
        (o) =>
          `${HOLAT_BELGI[o.status] ?? ''} <b>№${o.order_number}</b> · ${sana(o.created_at)}\n` +
          `${esc(o.customer)}\n` +
          `${HOLAT_MATN[o.status] ?? o.status} · <b>${pul(o.total, o.currency)}</b>`
      )
      .join('\n\n');

    const tugmalar = orders.map((o) => [
      {
        text: `${HOLAT_BELGI[o.status] ?? ''} №${o.order_number} — ${String(o.customer).slice(0, 18)}`,
        callback_data: `crd:${o.id}`,
      },
    ]);

    await yubor(chatId, `${sarlavha}\n\n${matn}\n\n<i>Buyurtmani ochish uchun bosing 👇</i>`, {
      reply_markup: { inline_keyboard: tugmalar },
    });
  }

  async function mijozlarYubor(chatId: number, qidiruv: string | null) {
    const { data, error } = await supabase.rpc('staff_customers_for_chat', {
      p_chat_id: chatId,
      p_search: qidiruv,
      p_limit: 10,
    });
    if (error) {
      await yubor(chatId, '❌ Xatolik: ' + esc(error.message));
      return;
    }
    const list = (data ?? []) as any[];
    if (list.length === 0) {
      await yubor(chatId, qidiruv ? `🔍 "${esc(qidiruv)}" bo'yicha mijoz topilmadi.` : "Mijoz yo'q.");
      return;
    }
    const matn = list
      .map(
        (c) =>
          `👤 <b>${esc(c.name)}</b>\n` +
          `📞 ${esc(c.phone ?? '—')}\n` +
          (Number(c.balance) > 0
            ? `🔴 Qarz: <b>${raqam(c.balance)} so'm</b>`
            : Number(c.balance) < 0
              ? `🟢 Oldindan to'lov: <b>${raqam(Math.abs(Number(c.balance)))} so'm</b>`
              : '🟢 Qarz yo‘q') +
          (c.last_order_at ? `\n🕒 Oxirgi buyurtma: ${sana(c.last_order_at)}` : '')
      )
      .join('\n\n');

    await yubor(chatId, `👥 <b>Mijozlar</b>\n\n${matn}\n\n<i>Qidirish uchun ism yoki telefon yozing.</i>`);
  }

  async function qarzdorlarYubor(chatId: number) {
    const { data, error } = await supabase.rpc('staff_debtors_for_chat', {
      p_chat_id: chatId,
      p_limit: 10,
    });
    if (error) {
      await yubor(chatId, '❌ Xatolik: ' + esc(error.message));
      return;
    }
    const list = (data ?? []) as any[];
    if (list.length === 0) {
      await yubor(chatId, "💰 Qarzdor yo'q — hammasi hisob-kitob qilingan. 👏");
      return;
    }
    const jami = list.reduce((s, c) => s + Number(c.balance), 0);
    const matn = list
      .map((c, i) => `${i + 1}. <b>${esc(c.name)}</b> — ${raqam(c.balance)} so'm\n   📞 ${esc(c.phone ?? '—')}`)
      .join('\n');

    await yubor(chatId, `💰 <b>Qarzdorlar</b>\n\n${matn}\n\nJami: <b>${raqam(jami)} so'm</b>`);
  }

  async function narxYubor(chatId: number, qidiruv: string) {
    const { data, error } = await supabase.rpc('staff_price_lookup_for_chat', {
      p_chat_id: chatId,
      p_query: qidiruv,
      p_limit: 8,
    });
    if (error) {
      await yubor(chatId, '❌ Xatolik: ' + esc(error.message));
      return;
    }
    const res = (data ?? {}) as any;
    if (res.error === 'FAQAT_MENEJER_UCHUN') {
      await yubor(chatId, 'Bu bo‘lim menejerlar uchun.');
      return;
    }
    const items = (res.items ?? []) as any[];
    if (items.length === 0) {
      await yubor(chatId, `🔍 "${esc(qidiruv)}" bo'yicha mahsulot topilmadi.`);
      return;
    }
    const matn = items
      .map((it) => {
        const olcham = [it.size, it.color].filter(Boolean).join(' / ');
        const narx = it.currency === 'USD' ? pul(it.orig_price, 'USD') : pul(it.price);
        return (
          `<b>${esc(it.name)}</b>${olcham ? ` · ${esc(olcham)}` : ''}\n` +
          `<code>${esc(it.sku)}</code>\n` +
          `💵 <b>${narx}</b>${it.customer_price ? ' (mijozga alohida)' : ''}\n` +
          `📦 Omborda: ${raqam(it.available)} dona`
        );
      })
      .join('\n\n');

    await yubor(chatId, `🔎 <b>Narxlar</b>\n\n${matn}\n\n<i>Boshqa mahsulot uchun nomini yozing.</i>`);
  }

  // ================================================== tugma bosildi (callback)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId: number = cq.message?.chat?.id;
    const messageId: number | undefined = cq.message?.message_id;
    const data: string = cq.data ?? '';
    const [amal, id] = [data.slice(0, data.indexOf(':')), data.slice(data.indexOf(':') + 1)];

    // Faktura — PDF telegram-notify'da yasaladi (bitta manba)
    if (amal === 'inv') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Faktura tayyorlanmoqda...' });
      const r = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          'x-staff-chat-id': String(chatId),
        },
        body: JSON.stringify({ order_id: id }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        await yubor(chatId, `❌ Faktura yuborilmadi.\n${esc((j as any)?.message ?? (j as any)?.error ?? '')}`);
      }
      return new Response('ok');
    }

    // Fakturani mijozning o'z Telegramiga yuborish.
    // Bot mijozning chat_id'sini bilmaydi va bilishi ham shart emas —
    // tekshiruvni ham, manzilni ham telegram-notify tomonidagi RPC hal
    // qiladi (x-staff-sender sarlavhasi bo'yicha).
    if (amal === 'snd') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Mijozga yuborilmoqda...' });
      const r = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          'x-staff-sender': String(chatId),
        },
        body: JSON.stringify({ order_id: id }),
      });
      const j = await r.json().catch(() => ({}));
      await yubor(
        chatId,
        r.ok
          ? '✅ Faktura mijozga yuborildi.'
          : `❌ Yuborilmadi.\n${esc((j as any)?.message ?? (j as any)?.error ?? '')}`
      );
      return new Response('ok');
    }

    // Kunlik yakundagi "tasdiqlanmaganlarni ko'rish"
    if (amal === 'lst') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      await royxatYubor(chatId, 'new', '🆕 <b>Tasdiqlanmagan buyurtmalar</b>');
      return new Response('ok');
    }

    // Kartochkani ochish
    if (amal === 'crd') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      await kartaYubor(chatId, id);
      return new Response('ok');
    }

    // Bekor qilish — ikki bosqichli: tasodifan bosib yuborilmasin
    if (amal === 'cx') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      await tg('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚠️ Ha, bekor qilinsin', callback_data: `cxy:${id}` }],
            [{ text: '← Yo‘q, qaytish', callback_data: `crd2:${id}` }],
          ],
        },
      });
      return new Response('ok');
    }

    if (amal === 'crd2') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      await kartaYubor(chatId, id, messageId);
      return new Response('ok');
    }

    // Holatni o'zgartiruvchi amallar — ruxsatni bazadagi RPC hal qiladi
    const AMALLAR: Record<string, string> = {
      ok: 'confirm',
      cxy: 'cancel',
      pick: 'picking',
      done: 'done',
    };
    if (AMALLAR[amal]) {
      const { data: natija, error } = await supabase.rpc('staff_order_action', {
        p_order_id: id,
        p_chat_id: chatId,
        p_action: AMALLAR[amal],
      });
      const n = (natija ?? {}) as any;
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: n.ok ? 'Bajarildi ✓' : (n.error ?? error?.message ?? 'Xatolik'),
        show_alert: !n.ok,
      });
      await kartaYubor(chatId, id, messageId);
      return new Response('ok');
    }

    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    return new Response('ok');
  }

  // ========================================================== xabar keldi
  const msg = update.message ?? update.edited_message;
  if (!msg) return new Response('ok');

  const chatId: number = msg.chat.id;
  const text: string = msg.text ?? '';
  const from = msg.from ?? {};
  const bogliq = await xodim(chatId);

  // ------------------------------------------------------------- kontakt
  if (msg.contact) {
    // MUHIM: Telegramda boshqa odamning kontaktini ham yuborish mumkin.
    // Faqat O'ZINING raqamini yuborgan bo'lsa qabul qilamiz.
    if (Number(msg.contact.user_id) !== Number(from.id)) {
      await yubor(
        chatId,
        '❌ Faqat <b>o‘z</b> raqamingizni yuboring — pastdagi tugma orqali.'
      );
      return new Response('ok');
    }

    const holat = await holatOl(chatId);
    const kutilayotganKod = (holat as any)?.data?.code as string | undefined;

    if (kutilayotganKod) {
      // Admin yuborgan taklif: kod + telefon birga tekshiriladi
      const { data } = await supabase.rpc('staff_telegram_link_code_phone', {
        p_code: kutilayotganKod,
        p_phone: msg.contact.phone_number,
        p_chat_id: chatId,
        p_username: from.username ?? null,
        p_first_name: from.first_name ?? null,
      });
      await holatQoy(chatId, 'idle', {});
      const d = (data ?? {}) as any;
      if (d.ok) {
        const rol = ROL_MATN[d.role] ?? d.role;
        await yubor(
          chatId,
          `✅ Ulandingiz, <b>${esc(d.name || rol)}</b> (${rol}).\n\n` +
            `Endi yangi buyurtmalar shu yerga keladi va ularni shu yerdan boshqarasiz.`,
          { reply_markup: menyu(d.role) }
        );
      } else if (d.error === 'TELEFON_MOS_EMAS') {
        await yubor(
          chatId,
          '❌ Bu raqam taklif yuborilgan menejerning raqami emas.\n\n' +
            'Admin havolani boshqa raqamga yuborgan bo‘lishi mumkin — u bilan bog‘laning.'
        );
      } else {
        await yubor(chatId, "❌ Kod noto'g'ri yoki muddati o'tgan. Admindan yangi havola so'rang.");
      }
      return new Response('ok');
    }

    // Kodsiz: menejerning o'zi telefoni bilan ulanmoqchi
    const { data } = await supabase.rpc('staff_telegram_link_phone', {
      p_phone: msg.contact.phone_number,
      p_chat_id: chatId,
      p_username: from.username ?? null,
      p_first_name: from.first_name ?? null,
    });
    const d = (data ?? {}) as any;
    if (d.ok) {
      await yubor(
        chatId,
        `✅ Ulandingiz, <b>${esc(d.name)}</b> (menejer).\n\n` +
          `Endi yangi buyurtmalar shu yerga keladi va ularni shu yerdan boshqarasiz.`,
        { reply_markup: menyu('manager') }
      );
    } else {
      await yubor(
        chatId,
        `❌ Bu raqam menejerlar ro'yxatida topilmadi.\n\n` +
          `Administrator bo‘lsangiz, panelga kiring: <b>Sozlamalar → Telegram bot</b>.`
      );
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
      const d = (data ?? {}) as any;

      if (d.ok) {
        const rol = ROL_MATN[d.role] ?? d.role;
        await yubor(
          chatId,
          `✅ Ulandingiz, <b>${esc(d.name || rol)}</b> (${rol}).\n\n` +
            `Endi yangi buyurtma tushishi bilan shu yerga xabar keladi.`,
          { reply_markup: menyu(d.role) }
        );
      } else if (d.need_phone) {
        // Admin yuborgan taklif — kodning o'zi yetarli emas
        await holatQoy(chatId, 'await_phone', { code: kod });
        await yubor(
          chatId,
          `🔐 Tasdiqlash kerak.\n\nBu havolani administrator yuborgan. Ulanish uchun ` +
            `<b>o‘z telefon raqamingizni</b> yuboring — u bazadagi raqamingizga mos kelishi kerak.`,
          {
            reply_markup: {
              keyboard: [[{ text: '📞 Telefon raqamni yuborish', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
      } else {
        await yubor(
          chatId,
          `❌ Kod noto'g'ri yoki muddati o'tgan.\n\nPaneldan yangi havola oling: ` +
            `<b>Sozlamalar → Telegram bot</b>, yoki admindan so'rang.`
        );
      }
      return new Response('ok');
    }

    if (bogliq) {
      const rol = bogliq.profiles?.role;
      await yubor(chatId, `Salom, <b>${esc(bogliq.profiles?.full_name || ROL_MATN[rol] || '')}</b>! 👋`, {
        reply_markup: menyu(rol),
      });
    } else {
      await yubor(
        chatId,
        `Assalomu alaykum! 👋\n\nBu <b>xodimlar</b> boti — yangi buyurtmalar shu yerga ` +
          `tushadi, ularni shu yerdan qabul qilasiz va fakturasini olasiz.\n\n` +
          `Ulanish uchun panelga kiring: <b>Sozlamalar → Telegram bot</b>.\n\n` +
          `Menejer bo‘lsangiz, telefon raqamingizni yuborsangiz ham bo‘ladi 👇`,
        {
          reply_markup: {
            keyboard: [[{ text: '📞 Telefon raqamni yuborish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    }
    return new Response('ok');
  }

  // ------------------------------------------------------------ ulanmagan
  if (!bogliq) {
    await yubor(chatId, "Avval ulanishingiz kerak — /start bosing.");
    return new Response('ok');
  }

  const rol = bogliq.profiles?.role;

  // -------------------------------------------------------------- /uzish
  if (text.startsWith('/uzish')) {
    await supabase.from('staff_telegram').delete().eq('chat_id', chatId);
    await supabase.from('staff_bot_state').delete().eq('chat_id', chatId);
    await yubor(chatId, '🔌 Uzildi. Qayta ulanish uchun paneldan havola oling.', {
      reply_markup: { remove_keyboard: true },
    });
    return new Response('ok');
  }

  // ------------------------------------------------------- menyu tugmalari
  // Menyu bosilsa qidiruv holati bekor bo'ladi — aks holda tugma matni
  // qidiruv so'zi bo'lib ketardi
  if (text.includes('Yangi buyurtmalar')) {
    await holatQoy(chatId, 'idle', {});
    await royxatYubor(chatId, 'new', '🆕 <b>Yangi buyurtmalar</b>');
    return new Response('ok');
  }
  if (text.includes('Oxirgi 10')) {
    await holatQoy(chatId, 'idle', {});
    await royxatYubor(chatId, null, '🧾 <b>Oxirgi buyurtmalar</b>');
    return new Response('ok');
  }
  if (text.includes('Mijozlarim')) {
    await holatQoy(chatId, 'search_customer', {});
    await mijozlarYubor(chatId, null);
    return new Response('ok');
  }
  if (text.includes('Qarzdorlar')) {
    await holatQoy(chatId, 'idle', {});
    await qarzdorlarYubor(chatId);
    return new Response('ok');
  }
  if (text.includes('Narx')) {
    if (rol !== 'manager') {
      await yubor(chatId, 'Bu bo‘lim menejerlar uchun.', { reply_markup: menyu(rol) });
      return new Response('ok');
    }
    await holatQoy(chatId, 'search_price', {});
    await yubor(chatId, '🔎 Mahsulot nomini yoki SKU’ni yozing.');
    return new Response('ok');
  }

  // ------------------------------------------------------- qidiruv holati
  const holat = await holatOl(chatId);
  const bosqich = (holat as any)?.state ?? 'idle';

  if (text.trim() && !text.startsWith('/')) {
    if (bosqich === 'search_customer') {
      await mijozlarYubor(chatId, text.trim());
      return new Response('ok');
    }
    if (bosqich === 'search_price' && rol === 'manager') {
      await narxYubor(chatId, text.trim());
      return new Response('ok');
    }
    // Raqam yozilsa — buyurtma raqami deb qaraymiz
    if (/^\d{1,7}$/.test(text.trim())) {
      const { data } = await supabase.rpc('staff_orders_for_chat', {
        p_chat_id: chatId,
        p_status: null,
        p_limit: 30,
      });
      const topildi = ((data ?? []) as any[]).find(
        (o) => String(o.order_number) === text.trim()
      );
      if (topildi) {
        await kartaYubor(chatId, topildi.id);
        return new Response('ok');
      }
    }
  }

  await yubor(chatId, 'Pastdagi tugmalardan foydalaning 👇\n\nUlanishni uzish: /uzish', {
    reply_markup: menyu(rol),
  });

  return new Response('ok');
});
