// CREDIT DEBIT — BITIM TASDIQLASH boti.
//
// Boshqa botlar bilan aralashtirmaslik kerak:
//   telegram-bot        — mijozlar katalogi
//   telegram-staff      — admin/menejer buyurtmalari
//   telegram-dori       — dorixona skladlari
//   telegram-qarz       — agentlarning qarzdorlik hisobi
//   kassa-telegram      — SHU: oldi-berdi bitimini TASDIQLASH
//
// NEGA ALOHIDA BOT. `telegram-qarz` sizning AGENTINGIZ uchun: u
// kirib, klient qo'shib, hisobot oladi. Bu yerdagi odam esa
// HAMKOR — u sizning xodimingiz emas, ilovangizni ko'rmaydi va
// menyuga umuman kirmasligi kerak. Bitta botga ikkovini qo'ysak,
// Tonirok «Klientlarim» tugmasini ko'rib turardi.
//
// OQIM:
//   1. Siz ilovada bitimni saqlaysiz -> `kassa_tasdiq_havola`
//   2. Ilova havola beradi: t.me/<bot>?start=T_<token>
//   3. Siz uni istalgan yo'l bilan yuborasiz
//   4. Hamkor bosadi -> bot kartochkani ko'rsatadi
//   5. Hamkor tugmani bosadi -> holat o'zgaradi
//
// XAVFSIZLIK:
//  * verify_jwt = FALSE bo'lishi SHART (chaqiruvchi Telegram serveri),
//    himoya — `x-telegram-bot-api-secret-token` sarlavhasi.
//  * Bot HECH QACHON o'zi ruxsat hisoblamaydi. `bitim_id` ni bot
//    umuman qabul qilmaydi: zanjir bazada token'dan qaytadan
//    quriladi (`kassa_tasdiq_bajar`).
//  * Token callback ichida ketadi. Telegram callback_data 64 baytdan
//    oshmasligini talab qiladi: "t:" + 34 = 36 bayt, sig'adi.
//  * Token BIR MARTALIK va 7 kunlik. Kartochkani ko'rish tokenni
//    SARFLAMAYDI — odam o'ylab turib qaytishi mumkin.

import { createClient } from 'npm:@supabase/supabase-js@2';

const TG = 'https://api.telegram.org/bot';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

/** "12000" (tiyin) -> "120.00". Intl ISHLATILMAYDI. */
function pul(tiyin: unknown, valyuta: string): string {
  const n = Number(tiyin ?? 0);
  const manfiy = n < 0;
  const x = Math.abs(Math.round(n));
  const butun = Math.floor(x / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const kasr = (x % 100).toString().padStart(2, '0');
  // So'mda tiyin ko'rsatilmaydi: 2 500 000,00 deb yozish odamni
  // chalg'itadi, bozorda tiyin yo'q.
  const matn = valyuta === 'UZS' && x % 100 === 0 ? butun : `${butun}.${kasr}`;
  return (manfiy ? '-' : '') + matn + ' ' + valyuta;
}

/** Miqdorni ortiqcha nolsiz ko'rsatadi: "1200.000" emas, "1200" */
function miqdor(x: unknown): string {
  const n = Number(x ?? 0);
  if (!Number.isFinite(n) || n === 0) return '';
  return String(Number(n.toFixed(3)));
}

// Sana qo'lda formatlanadi: toLocaleDateString ICU qirqilgan
// muhitda RangeError beradi va butun javob yiqilardi.
function sanaQisqa(iso: unknown): string {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return '—';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const XATO_MATNI: Record<string, string> = {
  TOKEN_YOQ: 'Havola bo‘sh.',
  TOKEN_NOTOGRI: 'Bu havola ishlamaydi. Yuborgan odamdan yangisini so‘rang.',
  TOKEN_ISHLATILGAN: 'Bu havola allaqachon ishlatilgan.',
  TOKEN_MUDDATI_OTGAN: 'Havola muddati o‘tgan (7 kun). Yangisini so‘rang.',
  BITIM_TOPILMADI: 'Bitim topilmadi — ehtimol o‘chirilgan.',
  HOLAT_MOS_EMAS: 'Bu bitim endi tasdiq kutmayapti.',
  JAVOB_NOTOGRI: 'Tushunmadim.',
};

/** Bitim kartochkasi — hamkor shuni ko'radi va shunga qarab bosadi */
function kartochka(b: Record<string, unknown>): string {
  const valyuta = String(b.valyuta ?? 'UZS');
  const qatorlar = [
    '<b>OLDI-BERDI TASDIQLASH</b>',
    '',
    `👤 ${esc(b.biznes)}`,
  ];

  // Yo'nalish HAMKOR tomonidan yoziladi: bazada «berdim/oldim» —
  // bu DAFTAR EGASINING ko'zi bilan. Hamkorga xuddi shunday
  // ko'rsatsak, u «men bermadim-ku» deb o'ylardi.
  const nomi = String(b.tovar_nom ?? '') || (b.nima === 'qarz' ? 'Qarz' : 'Tovar');
  qatorlar.push(b.yonalish === 'berdim' ? `📦 Sizga berildi: ${esc(nomi)}` : `📦 Sizdan olindi: ${esc(nomi)}`);

  const m = miqdor(b.miqdor);
  if (m) {
    const narx = b.narx && Number(b.narx) > 0 ? ` × ${pul(b.narx, valyuta)}` : '';
    qatorlar.push(`     ${m} ${esc(b.birlik ?? 'dona')}${narx}`);
  }

  qatorlar.push(`💰 Jami: <b>${pul(b.summa, valyuta)}</b>`);
  qatorlar.push(`📅 ${sanaQisqa(b.sana)}${b.muddat ? ` · muddat ${sanaQisqa(b.muddat)}` : ''}`);
  if (b.izoh) qatorlar.push(`📝 ${esc(b.izoh)}`);
  qatorlar.push('', 'To‘g‘rimi?');
  return qatorlar.join('\n');
}

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_KASSA_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_KASSA_WEBHOOK_SECRET');
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

  async function yubor(chat: number, matn: string, qoshimcha: Record<string, unknown> = {}) {
    return tg('sendMessage', { chat_id: chat, text: matn, parse_mode: 'HTML', ...qoshimcha });
  }

  // ---------- /start T_<token> ----------
  const xabar = update?.message;
  if (xabar?.text) {
    const chat = Number(xabar.chat?.id);
    const matn = String(xabar.text).trim();

    if (!matn.startsWith('/start')) {
      await yubor(chat, 'Bu bot bitimlarni tasdiqlash uchun. Sherigingiz yuborgan havolani bosing.');
      return new Response('ok');
    }

    const nishon = matn.slice('/start'.length).trim();
    if (!nishon) {
      await yubor(
        chat,
        'Salom! Bu bot <b>oldi-berdi bitimlarini tasdiqlash</b> uchun.\n\n' +
          'Sherigingiz sizga havola yuboradi, siz uni bosasiz va bitimni ' +
          'tasdiqlaysiz yoki rad etasiz. Boshqa hech narsa qilish shart emas.',
      );
      return new Response('ok');
    }

    const { data, error } = await supabase.rpc('kassa_tasdiq_korish', { p_token: nishon });
    if (error) {
      await yubor(chat, 'Xatolik yuz berdi. Keyinroq urinib ko‘ring.');
      return new Response('ok');
    }
    const b = data as Record<string, unknown> | null;
    if (!b || b.xato) {
      await yubor(chat, XATO_MATNI[String(b?.xato ?? '')] ?? 'Havola ishlamadi.');
      return new Response('ok');
    }

    await yubor(chat, kartochka(b), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Tasdiqlayman', callback_data: `t:${nishon}` },
            { text: '❌ Rozi emasman', callback_data: `r:${nishon}` },
          ],
        ],
      },
    });
    return new Response('ok');
  }

  // ---------- Tugma bosildi ----------
  const cb = update?.callback_query;
  if (cb) {
    const chat = Number(cb.message?.chat?.id);
    const xom = String(cb.data ?? '');
    const javob = xom.startsWith('t:') ? 'tasdiq' : xom.startsWith('r:') ? 'rad' : null;
    const nishon = xom.slice(2);

    if (!javob) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Tushunmadim' });
      return new Response('ok');
    }

    const { data, error } = await supabase.rpc('kassa_tasdiq_bajar', {
      p_token: nishon,
      p_chat_id: chat,
      p_javob: javob,
    });

    if (error) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Xatolik' });
      return new Response('ok');
    }

    const n = data as Record<string, unknown>;
    if (n?.xato) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Bo‘lmadi', show_alert: true });
      await yubor(chat, XATO_MATNI[String(n.xato)] ?? 'Bo‘lmadi.');
      return new Response('ok');
    }

    // Tugmalarni OLIB TASHLAYMIZ: qolsa odam yana bosib ko'rardi va
    // «ishlatilgan» degan javob olardi — bu esa xato bo'lgandek
    // tuyulardi.
    await tg('editMessageReplyMarkup', {
      chat_id: chat,
      message_id: cb.message?.message_id,
      reply_markup: { inline_keyboard: [] },
    });
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    await yubor(
      chat,
      javob === 'tasdiq'
        ? '✅ Tasdiqladingiz. Rahmat!'
        : '❌ Rad etdingiz. Sherigingiz buni ko‘radi va siz bilan bog‘lanadi.',
    );
    return new Response('ok');
  }

  return new Response('ok');
});
