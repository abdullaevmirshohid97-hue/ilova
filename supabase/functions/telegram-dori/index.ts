// Dori boti (@Idaa_dori_bot) — mijoz uchun qidiruv va buyurtma.
//
// Oqim:
//   /start        -> telefon so'raladi (bir marta)
//   nom yoziladi  -> topilganlar narxi bilan chiqadi
//   tugma bosiladi-> miqdor so'raladi -> savatga tushadi
//   🛒 Savat      -> ro'yxat, jami, "Buyurtma berish"
//   🧾 Buyurtmalarim -> oxirgi buyurtmalar
//
// XAVFSIZLIK:
//  * verify_jwt = FALSE (chaqiruvchi Telegram serveri), himoya —
//    `x-telegram-bot-api-secret-token` sarlavhasi.
//  * Kontakt kelganda `contact.user_id === from.id` tekshiriladi:
//    Telegramda boshqa odamning kontakt kartochkasini yuborish mumkin.
//  * Narxni bot HISOBLAMAYDI va mijozdan qabul qilmaydi — u faqat
//    katalogdan olinadi (RPC ichida), aks holda buyurtmaga o'z narxini
//    yozib yuborish mumkin bo'lardi.

import { createClient } from 'npm:@supabase/supabase-js@2';

const TG = 'https://api.telegram.org/bot';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

function pul(n: unknown): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

function miqdor(n: unknown): string {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

// Mini App — katalogni varaqlab, savatga qo'shib, buyurtma berish uchun.
// Manzili secret'da: bir joydan boshqarilsin, kod o'zgartirmasdan almashsin.
const MINI_APP = Deno.env.get('DORI_MINI_APP_URL') ?? '';

const MENYU = {
  keyboard: [
    MINI_APP
      ? [{ text: '🛍 Katalog', web_app: { url: MINI_APP } }, { text: '🛒 Savat' }]
      : [{ text: '🔎 Qidirish' }, { text: '🛒 Savat' }],
    [{ text: '🔎 Qidirish' }, { text: '🧾 Buyurtmalarim' }],
  ],
  resize_keyboard: true,
};

// Sklad xodimi uchun boshqa menyu: u dori qidirmaydi, so'rov oladi
const SKLAD_MENYU = {
  keyboard: [
    [{ text: '📥 So‘rovlar' }, { text: '🧾 Sotuvlar' }],
    [{ text: 'ℹ️ Sklad' }],
  ],
  resize_keyboard: true,
};

const TELEFON_SORASH = {
  keyboard: [[{ text: '📞 Telefon raqamni yuborish', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_DORI_WEBHOOK_SECRET');
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

  // Taqsimot va skladlarga xabar - alohida funksiyada, chunki webhook
  // tez javob qaytarishi kerak. Natijasini kutmaymiz.
  function skladlargaYubor(orderId: string) {
    if (!orderId) return;
    const url = `${supabaseUrl}/functions/v1/dori-sklad-yubor`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ order_id: orderId }),
    }).catch(() => {});
  }

  async function mijoz(chatId: number) {
    const { data } = await supabase
      .from('dori_customers')
      .select('chat_id, phone, name, is_blocked')
      .eq('chat_id', chatId)
      .maybeSingle();
    return data as any;
  }

  // Qidiruv holati: "miqdor kutilyapti" — qaysi dori uchun
  async function holatQoy(chatId: number, state: string, data: unknown = {}) {
    await supabase.rpc('staff_bot_state_set', { p_chat_id: chatId, p_state: state, p_data: data });
  }
  async function holatOl(chatId: number) {
    const { data } = await supabase.rpc('staff_bot_state_get', { p_chat_id: chatId });
    return (data as any) ?? { state: 'idle', data: {} };
  }

  async function qidir(chatId: number, soz: string) {
    const { data, error } = await supabase.rpc('dori_search', { p_q: soz, p_limit: 10 });
    if (error) {
      await yubor(chatId, '❌ Qidiruvda xatolik.');
      return;
    }
    const topildi = (data ?? []) as any[];
    if (topildi.length === 0) {
      // Katalog umuman bo'shmi yoki shu nom yo'qmi — bu ikki boshqa holat.
      // Farqini aytmasak, foydalanuvchi o'zini aybdor his qiladi va
      // nomni qayta-qayta boshqacha yozib ovora bo'ladi.
      const { count } = await supabase
        .from('dori_products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (!count) {
        await yubor(
          chatId,
          `📭 <b>Katalog hali yuklanmagan.</b>\n\n` +
            `Dorilar ro‘yxati tizimga kiritilgach, qidiruv ishlay boshlaydi. ` +
            `Iltimos, keyinroq urinib ko‘ring.`
        );
      } else {
        await yubor(
          chatId,
          `🔍 «${esc(soz)}» bo‘yicha hech narsa topilmadi.\n\n` +
            `Nomning bir qismini yozib ko‘ring — masalan «азитро».`
        );
      }
      return;
    }

    const matn = topildi
      .map(
        (d, i) =>
          `${i + 1}. <b>${esc(d.name)}</b>\n` +
          `   ${esc(d.manufacturer ?? '')}${d.manufacturer ? ' · ' : ''}<b>${pul(d.price)}</b>` +
          (d.stock === null || d.stock === undefined
            ? ''
            : Number(d.stock) > 0
              ? ` · omborda ${miqdor(d.stock)} ta`
              : ' · <i>omborda qolmadi</i>')
      )
      .join('\n\n');

    // Omborda qolmagan doriga tugma qo'yilmaydi: bosilsa baribir
    // "qolmadi" deyilardi - bekorga umid bermaymiz
    // Qoldiq NOMA'LUM bo'lsa (prays faylida ustun yo'q) - sotiladi.
    // Faqat aniq nol bo'lganiga tugma qo'yilmaydi.
    const olsaBoladi = topildi.filter((d) => d.stock === null || d.stock === undefined || Number(d.stock) > 0);

    await yubor(
      chatId,
      `🔎 <b>Topildi: ${topildi.length}</b>\n\n${matn}` +
        (olsaBoladi.length ? '\n\nQo‘shish uchun tanlang 👇' : '\n\n<i>Topilganlarning hammasi omborda tugagan.</i>'),
      olsaBoladi.length
        ? {
            reply_markup: {
              inline_keyboard: olsaBoladi.map((d) => [
                { text: `${String(d.name).slice(0, 30)}`, callback_data: `add:${d.id}` },
              ]),
            },
          }
        : {}
    );
  }

  // Terish uchun sotuv: omborchiga nom, ishlab chiqaruvchi, seriya,
  // muddat va DONA kerak. Mijoz narxi bu yerda ham yo'q.
  async function sotuvniKorsat(chatId: number, sot: any) {
    const p = (sot.pozitsiyalar ?? []) as any[];
    const matn = p
      .map((it, i) => {
        const qism = [
          it.manufacturer ? esc(it.manufacturer) : null,
          it.series ? 'seriya ' + esc(it.series) : null,
          it.expiry ? 'muddat ' + esc(String(it.expiry).split('-').reverse().join('.')) : null,
        ].filter(Boolean).join(' · ');
        return `${i + 1}. <b>${esc(it.name)}</b> — <b>${miqdor(it.qty)} dona</b>` +
               (qism ? `\n   ${qism}` : '');
      })
      .join('\n\n');

    await yubor(
      chatId,
      `🧾 <b>Sotuv №${esc(sot.sale_no)}</b>${sot.yigildi ? ' · ✅ terilgan' : ''}\n` +
        `Mijoz: ${esc(sot.mijoz)}\n\n${matn}\n\nJami: <b>${pul(sot.base_total)}</b>` +
        (sot.izoh ? `\n\nIzoh: ${esc(sot.izoh)}` : ''),
      sot.yigildi
        ? {}
        : { reply_markup: { inline_keyboard: [[{ text: '✅ Terib bo‘ldim', callback_data: `st:${sot.sale_id}` }]] } }
    );
  }

  // Skladga ko'rinadigan so'rov. DIQQAT: bu yerda faqat TANNARX bor -
  // mijozga qo'yilgan ustama skladga ko'rinmasligi kerak.
  async function sorovniKorsat(chatId: number, sor: any) {
    const p = (sor.pozitsiyalar ?? []) as any[];
    const matn = p
      .map((it, i) => `${i + 1}. <b>${esc(it.name)}</b>\n   ${miqdor(it.qty)} × ${pul(it.base_price)} = <b>${pul(it.base_sum)}</b>`)
      .join('\n\n');

    const holatNomi: Record<string, string> = {
      new: 'yangi', sent: 'yuborildi', accepted: 'qabul qilingan',
      rejected: 'rad etilgan', done: 'bajarilgan',
    };

    const tugmalar: any[][] = [];
    if (sor.status === 'new' || sor.status === 'sent') {
      tugmalar.push([
        { text: '✅ Qabul qilaman', callback_data: `wa:${sor.split_id}` },
        { text: '❌ Yo‘q', callback_data: `wr:${sor.split_id}` },
      ]);
    } else if (sor.status === 'accepted') {
      tugmalar.push([{ text: '📦 Bajarildi', callback_data: `wd:${sor.split_id}` }]);
    }

    await yubor(
      chatId,
      `📥 <b>So‘rov №${esc(sor.order_no)}</b> · ${esc(holatNomi[sor.status] ?? sor.status)}\n` +
        (sor.pharmacy ? `${esc(sor.pharmacy)}\n` : '') +
        `\n${matn}\n\nJami: <b>${pul(sor.base_total)}</b>` +
        (sor.comment ? `\n\nIzoh: ${esc(sor.comment)}` : ''),
      tugmalar.length ? { reply_markup: { inline_keyboard: tugmalar } } : {}
    );
  }

  async function savatKorsat(chatId: number) {
    const { data } = await supabase.rpc('dori_bot_cart', { p_chat_id: chatId });
    const savat = (data ?? { items: [], total: 0 }) as any;
    const items = savat.items as any[];

    if (items.length === 0) {
      await yubor(chatId, '🛒 Savat bo‘sh.\n\nDori nomini yozing — topib beraman.', {
        reply_markup: MENYU,
      });
      return;
    }

    const matn = items
      .map((it, i) => `${i + 1}. <b>${esc(it.name)}</b>\n   ${miqdor(it.qty)} × ${pul(it.price)} = <b>${pul(it.sum)}</b>`)
      .join('\n\n');

    await yubor(chatId, `🛒 <b>Savat</b>\n\n${matn}\n\nJami: <b>${pul(savat.total)}</b>`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Buyurtma berish', callback_data: 'order' }],
          ...items.map((it) => [
            { text: `✕ ${String(it.name).slice(0, 28)}`, callback_data: `del:${it.product_id}` },
          ]),
          [{ text: '🗑 Savatni tozalash', callback_data: 'clear' }],
        ],
      },
    });
  }

  // ================================================== tugma bosildi
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId: number = cq.message?.chat?.id;
    const data: string = cq.data ?? '';
    // Ikki nuqta bo'lmasa (masalan "order") — butun matn amal nomi.
    // slice(0, -1) qilib qo'ysak "order" -> "orde" bo'lib ketadi.
    const nuqta = data.indexOf(':');
    const amal = nuqta === -1 ? data : data.slice(0, nuqta);
    const id = nuqta === -1 ? '' : data.slice(nuqta + 1);

    // ---------- sotuv: terib bo'ldim / ochish ----------
    // Tekshiruv RPC ichida: chat_id -> sklad bog'lanishi qayta o'qiladi,
    // ya'ni begona skladning sotuvini yopib bo'lmaydi.
    if (amal === 'st' || amal === 'ss') {
      if (amal === 'ss') {
        const { data: sot } = await supabase.rpc('dori_sklad_sotuv', {
          p_chat_id: chatId,
          p_sale_id: id,
        });
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        if ((sot as any)?.ok) await sotuvniKorsat(chatId, sot as any);
        else await yubor(chatId, '❌ Sotuv topilmadi.');
        return new Response('ok');
      }

      const { data: jav } = await supabase.rpc('dori_sotuv_tayyor', {
        p_chat_id: chatId,
        p_sale_id: id,
      });
      const ok = (jav as any)?.ok;
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: ok ? 'Terildi deb belgilandi' : 'Bajarilmadi',
      });
      if (ok) {
        await yubor(
          chatId,
          `✅ Sotuv №${esc((jav as any).sale_no)} — <b>terib bo‘lindi</b>. Rahmat!`,
          { reply_markup: SKLAD_MENYU }
        );
      }
      return new Response('ok');
    }

    // ---------- sklad javobi ----------
    // Bu tugmalar SKLAD xodimiga tegishli, mijozga emas. Tekshiruv RPC
    // ichida: chat_id -> sklad bog'lanishi qayta o'qiladi, ya'ni split_id
    // ni qo'lda almashtirib boshqa skladning so'roviga javob berib
    // bo'lmaydi.
    if (amal === 'wa' || amal === 'wr' || amal === 'wd' || amal === 'ws') {
      const holat = amal === 'wa' ? 'accepted' : amal === 'wr' ? 'rejected' : amal === 'wd' ? 'done' : null;

      if (amal === 'ws') {
        const { data: sor } = await supabase.rpc('dori_sklad_sorov', {
          p_chat_id: chatId,
          p_split_id: id,
        });
        await tg('answerCallbackQuery', { callback_query_id: cq.id });
        if ((sor as any)?.ok) await sorovniKorsat(chatId, sor as any);
        else await yubor(chatId, '❌ So‘rov topilmadi.');
        return new Response('ok');
      }

      const { data: jav } = await supabase.rpc('dori_split_javob', {
        p_chat_id: chatId,
        p_split_id: id,
        p_status: holat,
      });
      const ok = (jav as any)?.ok;
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: ok
          ? holat === 'accepted' ? 'Qabul qilindi' : holat === 'done' ? 'Bajarildi' : 'Rad etildi'
          : 'Bajarilmadi',
      });
      if (ok) {
        await yubor(
          chatId,
          holat === 'accepted'
            ? `✅ So‘rov №${esc((jav as any).order_no)} <b>qabul qilindi</b>.\n\nYig‘ib bo‘lgach «Bajarildi» deb belgilang.`
            : holat === 'done'
              ? `📦 So‘rov №${esc((jav as any).order_no)} <b>bajarildi</b>. Rahmat!`
              : `❌ So‘rov №${esc((jav as any).order_no)} rad etildi.`,
          holat === 'accepted'
            ? { reply_markup: { inline_keyboard: [[{ text: '📦 Bajarildi', callback_data: `wd:${id}` }]] } }
            : {}
        );
      }
      return new Response('ok');
    }

    const m = await mijoz(chatId);
    if (!m?.phone) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Avval telefon raqamingizni yuboring' });
      return new Response('ok');
    }

    // Faktura: PDF va Excel alohida funksiyada yasaladi (bu yerda emas —
    // webhook tez javob qaytarishi kerak, PDF esa shrift yuklaydi)
    if (amal === 'inv') {
      await tg('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Faktura tayyorlanmoqda...',
      });
      const r = await fetch(`${supabaseUrl}/functions/v1/dori-faktura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ order_id: id, chat_id: chatId }),
      });
      if (!r.ok) {
        await yubor(chatId, '❌ Faktura tayyorlanmadi. Birozdan keyin urinib ko‘ring.');
      }
      return new Response('ok');
    }

    if (amal === 'add') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id });
      await holatQoy(chatId, 'miqdor', { product_id: id });
      await yubor(chatId, 'Nechta kerak? Raqam bilan yozing (masalan: <b>10</b>)');
      return new Response('ok');
    }

    if (amal === 'del') {
      await supabase.rpc('dori_bot_cart_clear', { p_chat_id: chatId, p_product_id: id });
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Olib tashlandi' });
      await savatKorsat(chatId);
      return new Response('ok');
    }

    if (amal === 'clear') {
      await supabase.rpc('dori_bot_cart_clear', { p_chat_id: chatId, p_product_id: null });
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Savat tozalandi' });
      await yubor(chatId, '🛒 Savat bo‘sh.', { reply_markup: MENYU });
      return new Response('ok');
    }

    if (amal === 'order') {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Yuborilmoqda...' });
      const { data: n } = await supabase.rpc('dori_bot_order_create', { p_chat_id: chatId });
      const r = (n ?? {}) as any;
      if (r.ok) {
        // Qoldiq savat ochiq turganda kamayib qolishi mumkin: server
        // nimani kesgani va nimani tashlaganini aytadi
        const tushdi = (r.tushdi ?? []) as any[];
        const cheklangan = (r.cheklangan ?? []) as any[];
        if (tushdi.length || cheklangan.length) {
          await yubor(
            chatId,
            '⚠️ <b>Buyurtma biroz o‘zgardi</b>\n\n' +
              tushdi.map((x: any) => `• ${esc(x.name)} — tugab qolgan, chiqarildi`).join('\n') +
              (tushdi.length && cheklangan.length ? '\n' : '') +
              cheklangan
                .map((x: any) => `• ${esc(x.name)} — ${miqdor(x.soralgan)} emas, ${miqdor(x.berildi)} ta`)
                .join('\n')
          );
        }

        // Buyurtma skladlarga taqsimlanadi va har sklad o'z so'rovini
        // Telegramda oladi. Xato bo'lsa ham mijozga bildirmaymiz -
        // buyurtma qabul qilingan, taqsimotni panelda qayta yuborsa
        // bo'ladi.
        skladlargaYubor(r.order_id);
        await yubor(
          chatId,
          `✅ <b>Buyurtma №${r.order_no}</b> qabul qilindi.\n\n` +
            `Jami: <b>${pul(r.total)}</b>\n\nTez orada siz bilan bog‘lanamiz.`,
          { reply_markup: MENYU }
        );
      } else {
        await yubor(
          chatId,
          r.error === 'SAVAT_BOSH' ? '🛒 Savat bo‘sh.' : '❌ Buyurtma yaratilmadi.',
          { reply_markup: MENYU }
        );
      }
      return new Response('ok');
    }

    await tg('answerCallbackQuery', { callback_query_id: cq.id });
    return new Response('ok');
  }

  // ================================================== xabar
  const msg = update.message ?? update.edited_message;
  if (!msg) return new Response('ok');

  const chatId: number = msg.chat.id;
  const text: string = (msg.text ?? '').trim();
  const from = msg.from ?? {};
  const m = await mijoz(chatId);

  // Chat SKLADGA bog'langanmi? Bog'langan bo'lsa - u mijoz emas,
  // dori qidirmaydi: unga butunlay boshqa menyu ko'rsatiladi.
  const { data: skladData } = await supabase.rpc('dori_sklad_kim', { p_chat_id: chatId });
  const sklad = (skladData as any) ?? null;

  if (sklad?.warehouse_id && !msg.contact) {
    if (text.startsWith('/start') || text.includes('Sklad')) {
      await yubor(
        chatId,
        `🏬 <b>${esc(sklad.sklad)}</b>\n\nSiz shu sklad xodimi sifatida ulangansiz.\n` +
          `Buyurtma tushganda so‘rov shu yerga keladi.`,
        { reply_markup: SKLAD_MENYU }
      );
      return new Response('ok');
    }

    if (text.includes('So‘rovlar') || text.includes("So'rovlar") || text.startsWith('/sorovlar')) {
      const { data } = await supabase.rpc('dori_sklad_sorovlar', { p_chat_id: chatId, p_limit: 10 });
      const r = (data as any) ?? {};
      const list = (r.sorovlar ?? []) as any[];
      if (!r.ok || list.length === 0) {
        await yubor(chatId, '📭 Hozircha so‘rov yo‘q.', { reply_markup: SKLAD_MENYU });
        return new Response('ok');
      }
      const holatBelgi: Record<string, string> = {
        new: '🆕', sent: '📤', accepted: '✅', rejected: '❌', done: '📦',
      };
      await yubor(
        chatId,
        `📥 <b>So‘rovlar</b>\n\n` +
          list
            .map((x) => `${holatBelgi[x.status] ?? '•'} №${esc(x.order_no)} · ${x.pozitsiya} pozitsiya · <b>${pul(x.base_total)}</b>`)
            .join('\n'),
        {
          reply_markup: {
            inline_keyboard: list.slice(0, 8).map((x) => [
              { text: `№${x.order_no} — ochish`, callback_data: `ws:${x.id}` },
            ]),
          },
        }
      );
      return new Response('ok');
    }

    if (text.includes('Sotuvlar') || text.startsWith('/sotuvlar')) {
      const { data } = await supabase.rpc('dori_sklad_sotuvlar', { p_chat_id: chatId, p_limit: 10 });
      const r = (data as any) ?? {};
      const list = (r.sotuvlar ?? []) as any[];
      if (!r.ok || list.length === 0) {
        await yubor(chatId, '📭 Hozircha sotuv yo‘q.', { reply_markup: SKLAD_MENYU });
        return new Response('ok');
      }
      await yubor(
        chatId,
        `🧾 <b>Sotuvlar</b>\n\n` +
          list
            .map((x) => `${x.yigildi ? '✅' : '🆕'} №${esc(x.sale_no)} · ${esc(x.mijoz)} · ${x.pozitsiya} pozitsiya · <b>${pul(x.base_total)}</b>`)
            .join('\n'),
        {
          reply_markup: {
            inline_keyboard: list.slice(0, 8).map((x) => [
              { text: `${x.yigildi ? '✅' : '🧾'} №${x.sale_no} — ochish`, callback_data: `ss:${x.id}` },
            ]),
          },
        }
      );
      return new Response('ok');
    }

    await yubor(chatId, 'Pastdagi tugmalardan foydalaning 👇', { reply_markup: SKLAD_MENYU });
    return new Response('ok');
  }

  // ---------- sklad taklif kodi ----------
  // Kod telefon raqamga bog'langan: kodni ushlab qolgan odam boshqa
  // raqamli akkaunt bilan ulanolmaydi.
  if (/^SKL-[A-Z0-9]{8}$/i.test(text)) {
    await holatQoy(chatId, 'sklad_kod', { code: text.toUpperCase() });
    await yubor(
      chatId,
      '🏬 Sklad kodi qabul qilindi.\n\nEndi <b>o‘z</b> telefon raqamingizni yuboring — ' +
        'kod aynan shu raqamga berilgan.',
      { reply_markup: TELEFON_SORASH }
    );
    return new Response('ok');
  }

  // ---------- kontakt ----------
  if (msg.contact) {
    // Boshqa odamning kontakt kartochkasini yuborib bo'lmasin
    if (Number(msg.contact.user_id) !== Number(from.id)) {
      await yubor(chatId, '❌ Faqat <b>o‘z</b> raqamingizni yuboring — pastdagi tugma orqali.', {
        reply_markup: TELEFON_SORASH,
      });
      return new Response('ok');
    }

    // Sklad kodi kutilyaptimi?
    const holat = await holatOl(chatId);
    if ((holat as any)?.state === 'sklad_kod') {
      const kod = (holat as any)?.data?.code ?? '';
      const { data: ul } = await supabase.rpc('dori_sklad_ulash', {
        p_code: kod,
        p_chat_id: chatId,
        p_phone: msg.contact.phone_number,
        p_name: [from.first_name, from.last_name].filter(Boolean).join(' ') || null,
        p_username: from.username ?? null,
      });
      await holatQoy(chatId, 'idle', {});

      if ((ul as any)?.ok) {
        await yubor(
          chatId,
          `✅ <b>${esc((ul as any).sklad)}</b> skladiga ulandingiz.\n\n` +
            `Buyurtma tushganda so‘rov shu yerga keladi.`,
          { reply_markup: SKLAD_MENYU }
        );
      } else {
        const xat: Record<string, string> = {
          KOD_TOPILMADI: 'Bunday kod yo‘q.',
          KOD_ISHLATILGAN: 'Bu kod allaqachon ishlatilgan.',
          KOD_MUDDATI_TUGAGAN: 'Kod muddati tugagan — administratordan yangisini so‘rang.',
          RAQAM_MOS_EMAS: 'Bu kod boshqa raqamga berilgan.',
        };
        await yubor(chatId, '❌ ' + (xat[(ul as any)?.error] ?? 'Ulanmadi.'));
      }
      return new Response('ok');
    }

    const { data: bogl } = await supabase.rpc('dori_bot_link', {
      p_chat_id: chatId,
      p_phone: msg.contact.phone_number,
      p_name: [from.first_name, from.last_name].filter(Boolean).join(' ') || null,
      p_username: from.username ?? null,
    });

    // Mijozni admin ro'yxatga oladi — ro'yxatda bo'lmagan raqam kira olmaydi
    if (!(bogl as any)?.ok) {
      await yubor(
        chatId,
        `❌ <b>${esc(msg.contact.phone_number)}</b> raqami ro‘yxatda topilmadi.\n\n` +
          `Idaa Farm ulgurji savdo qiladi — mijozlarni administrator ro‘yxatga oladi. ` +
          `Iltimos, biz bilan bog‘laning.`
      );
      return new Response('ok');
    }

    await yubor(
      chatId,
      `✅ Xush kelibsiz${(bogl as any).name ? ', <b>' + esc((bogl as any).name) + '</b>' : ''}!\n\n` +
        `Dori nomini yozing — narxi bilan topib beraman.\n` +
        `Masalan: <b>азитромицин</b> yoki <b>aspirin</b>`,
      { reply_markup: MENYU }
    );
    return new Response('ok');
  }

  // ---------- /start ----------
  if (text.startsWith('/start')) {
    if (m?.phone) {
      await yubor(chatId, 'Salom! 👋\n\nDori nomini yozing — narxi bilan topib beraman.', {
        reply_markup: MENYU,
      });
    } else {
      await yubor(
        chatId,
        `Assalomu alaykum! 👋\n\nBu <b>Idaa farm</b> boti — dori qidirasiz, narxini ko‘rasiz ` +
          `va shu yerdan buyurtma berasiz.\n\nBoshlash uchun telefon raqamingizni yuboring 👇`,
        { reply_markup: TELEFON_SORASH }
      );
    }
    return new Response('ok');
  }

  // ---------- tanishtirilmagan ----------
  if (!m?.phone) {
    await yubor(chatId, 'Avval telefon raqamingizni yuboring 👇', { reply_markup: TELEFON_SORASH });
    return new Response('ok');
  }

  if (m.is_blocked) {
    await yubor(chatId, 'Hisobingiz vaqtincha to‘xtatilgan. Iltimos, biz bilan bog‘laning.');
    return new Response('ok');
  }

  // ---------- menyu ----------
  if (text.startsWith('/savat') || text.includes('Savat')) {
    await holatQoy(chatId, 'idle', {});
    await savatKorsat(chatId);
    return new Response('ok');
  }

  if (text.includes('Qidirish')) {
    await holatQoy(chatId, 'idle', {});
    await yubor(chatId, '🔎 Dori nomini yozing.');
    return new Response('ok');
  }

  // Klaviatura tugmasi chatda SAQLANIB qoladi: manzil o'zgarsa ham eski
  // tugma eskisini ochaveradi. Shuning uchun "Katalog" so'zi kelganda
  // (yoki /katalog) yangi manzil bilan inline tugma yuboramiz — u har
  // safar joriy manzilni oladi.
  if (text.startsWith('/katalog') || text.includes('Katalog')) {
    await holatQoy(chatId, 'idle', {});
    if (MINI_APP) {
      await yubor(chatId, '🛍 <b>Katalog</b> — dorilar ro‘yxati, narxi bilan.', {
        reply_markup: { inline_keyboard: [[{ text: '🛍 Katalogni ochish', web_app: { url: MINI_APP } }]] },
      });
      // Pastdagi klaviatura ham yangilansin
      await yubor(chatId, "Pastdagi tugmalar yangilandi.", { reply_markup: MENYU });
    } else {
      await yubor(chatId, 'Katalog hozircha mavjud emas — dori nomini yozib qidiring.');
    }
    return new Response('ok');
  }

  if (text.includes('Buyurtmalarim')) {
    await holatQoy(chatId, 'idle', {});
    const { data } = await supabase.rpc('dori_bot_orders', { p_chat_id: chatId, p_limit: 10 });
    const list = (data ?? []) as any[];
    if (list.length === 0) {
      await yubor(chatId, 'Hali buyurtmangiz yo‘q.', { reply_markup: MENYU });
      return new Response('ok');
    }
    const HOLAT: Record<string, string> = {
      new: '🆕 Yangi',
      confirmed: '✅ Qabul qilindi',
      done: '🏁 Yopildi',
      cancelled: '❌ Bekor',
    };

    // Sana bo'yicha guruhlab ko'rsatamiz — mijoz "o'tgan hafta bergan
    // buyurtmam" deb qidirganda shu ko'rinish qulay
    const guruh = new Map<string, any[]>();
    for (const o of list) {
      const kun = new Date(o.created_at).toLocaleDateString('ru-RU');
      if (!guruh.has(kun)) guruh.set(kun, []);
      guruh.get(kun)!.push(o);
    }

    const matn = [...guruh.entries()]
      .map(
        ([kun, lar]) =>
          `📅 <b>${kun}</b>\n` +
          lar
            .map(
              (o) =>
                `   №${o.order_no} · ${HOLAT[o.status] ?? o.status} · ${o.items_count} xil · <b>${pul(o.total)}</b>`
            )
            .join('\n')
      )
      .join('\n\n');

    await yubor(
      chatId,
      `🧾 <b>Buyurtmalaringiz</b>\n\n${matn}\n\n` +
        `<i>Fakturani PDF va Excel ko‘rinishida olish uchun tanlang 👇</i>`,
      {
        reply_markup: {
          inline_keyboard: list.map((o) => [
            {
              text: `📄 №${o.order_no} · ${new Date(o.created_at).toLocaleDateString('ru-RU')} · ${pul(o.total)}`,
              callback_data: `inv:${o.id}`,
            },
          ]),
        },
      }
    );
    return new Response('ok');
  }

  // ---------- miqdor kutilyaptimi? ----------
  const holat = await holatOl(chatId);
  if (holat?.state === 'miqdor' && holat?.data?.product_id) {
    const n = Number(text.replace(',', '.').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      await yubor(chatId, 'Miqdorni raqam bilan yozing (masalan: <b>10</b>).');
      return new Response('ok');
    }

    const { data } = await supabase.rpc('dori_bot_cart_add', {
      p_chat_id: chatId,
      p_product_id: holat.data.product_id,
      p_qty: n,
    });
    const r = (data ?? {}) as any;
    await holatQoy(chatId, 'idle', {});

    if (r.ok) {
      // Server qoldiqqacha kesgan bo'lishi mumkin - jim qolmaymiz,
      // aks holda mijoz 500 so'rab, 100 olgani buyurtmada bilinardi
      await yubor(
        chatId,
        (r.cheklandi
          ? `⚠️ Omborda faqat <b>${miqdor(r.qoldiq)}</b> ta bor — shuncha qo‘shildi.\n\n`
          : '') +
          `✅ Savatga qo‘shildi:\n<b>${esc(r.name)}</b> — ${miqdor(r.qty)} × ${pul(r.price)}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Savatni ko‘rish', callback_data: 'cart' }]],
          },
        }
      );
      await savatKorsat(chatId);
    } else if (r.error === 'QOLMADI') {
      await yubor(
        chatId,
        `😔 <b>${esc(r.name ?? 'Bu dori')}</b> omborda qolmadi.\n\nBoshqa nom bilan qidirib ko‘ring.`,
        { reply_markup: MENYU }
      );
    } else {
      await yubor(chatId, '❌ Qo‘shilmadi.', { reply_markup: MENYU });
    }
    return new Response('ok');
  }

  // ---------- qolgani: qidiruv ----------
  if (text.length >= 2) {
    await qidir(chatId, text);
    return new Response('ok');
  }

  await yubor(chatId, 'Dori nomini yozing — kamida 2 ta harf.', { reply_markup: MENYU });
  return new Response('ok');
});
