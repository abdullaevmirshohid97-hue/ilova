// QARZDORLIK boti — agentlar uchun.
//
// Oqim: Klient -> Tovar chiqimi (+qarz) -> Pul kirimi (-qarz) -> SVERKA
//
// Boshqa botlar bilan aralashtirmaslik kerak:
//   telegram-bot        — mijozlar katalogi
//   telegram-staff      — admin/menejer buyurtmalari
//   telegram-dori       — dorixona skladlari
//   telegram-qarz       — SHU: agentlarning qarzdorlik hisobi
//
// XAVFSIZLIK:
//  * verify_jwt = FALSE bo'lishi SHART (chaqiruvchi Telegram serveri),
//    himoya — `x-telegram-bot-api-secret-token` sarlavhasi.
//  * Kontakt kelganda `contact.user_id === from.id` tekshiriladi:
//    Telegramda BOSHQA odamning kontakt kartochkasini yuborish mumkin,
//    ya'ni bu tekshiruvsiz begona odam birovning raqami bilan agent
//    bo'lib kirib olardi.
//  * Bot HECH QACHON o'zi ruxsat hisoblamaydi. Har bir ro'yxat va har
//    bir yozuv chat_id -> agent -> org zanjirini bazada qaytadan
//    quradigan RPC orqali o'tadi. Agent faqat O'Z klientini ko'radi.
//  * qarz_bot_* funksiyalari faqat service_role uchun ochiq: chat_id
//    maxfiy emas, uni bilgan odam boshqa agent nomidan yozib yuborardi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { davrOraliq, kunKaliti, kunYorligi, oraliqOqi, sanaOqi } from './davr.ts';
import {
  faylNomi,
  hisobotPdf,
  hisobotXlsx,
  sverkaPdf,
  sverkaXlsx,
} from './hujjat.ts';

const TG = 'https://api.telegram.org/bot';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
}

/** 1250000 -> "1 250 000". Intl ishlatilmaydi — muhitga bog'liq bo'lmasin. */
function raqam(n: unknown): string {
  const x = Math.round(Number(n) || 0);
  return (x < 0 ? '-' : '') + Math.abs(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function pul(n: unknown): string {
  return raqam(n) + " so'm";
}

/** "1 250 000", "1250000", "1,250,000" -> 1250000 */
function summaOqi(s: string): number | null {
  const t = String(s ?? '').replace(/\D/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const OYLAR = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

// Sana qo'lda formatlanadi: toLocaleDateString ICU qirqilgan muhitda
// RangeError beradi va butun javob yiqilardi.
function sanaQisqa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const MENYU = {
  keyboard: [
    [{ text: '👤 Klientlarim' }, { text: '📦 Tovar chiqimi' }],
    [{ text: '💰 Pul kirimi' }, { text: '🔄 SVERKA' }],
    [{ text: '📊 Hisobotlar' }, { text: '➕ Yangi klient' }],
    [{ text: '✏️ Tuzatish' }, { text: '⚙️ Sozlamalar' }],
  ],
  resize_keyboard: true,
};

const KONTAKT = {
  keyboard: [[{ text: '📞 Telefon raqamni yuborish', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

// Pul kirimi uch xil bo'ladi. Bu shunchaki yorliq emas: oy oxirida
// "kassada qancha naqd bo'lishi kerak" degan savolga javob shundan
// chiqadi. Chiqimda usul YO'Q — u to'lov emas, qarz yozuvi.
const USUL_NOM: Record<string, string> = {
  naqd: '💵 Naqd',
  plastik: '💳 Plastik',
  klik: '🔵 Click',
};

const USUL_TUGMA = {
  inline_keyboard: [
    [
      { text: '💵 Naqd', callback_data: 'usul:naqd' },
      { text: '💳 Plastik', callback_data: 'usul:plastik' },
      { text: '🔵 Click', callback_data: 'usul:klik' },
    ],
  ],
};

/**
 * Yozuv sanasi tugmalari.
 *
 * Avval har yozuv "hozir" bo'lib tushardi: agent kechagi chiqimni
 * bugun kiritsa, u kechagi kunga emas, bugunga yozilardi va kunlar
 * kesimidagi hisob buzilardi.
 */
const SANA_TUGMA = (prefiks: string, tanlangan: string) => {
  const bugun = kunKaliti(new Date());
  const k = new Date();
  k.setDate(k.getDate() - 1);
  const kecha = kunKaliti(k);
  const belgi = (x: string, nom: string) => (tanlangan === x ? '✅ ' + nom : nom);
  return [
    { text: belgi(bugun, '📆 Bugun'), callback_data: `${prefiks}:${bugun}` },
    { text: belgi(kecha, '📅 Kecha'), callback_data: `${prefiks}:${kecha}` },
    { text: '🗓 Boshqa kun', callback_data: `${prefiks}:boshqa` },
  ];
};

/** Davr tugmalari — sverka va hisobot uchun bir xil */
const DAVR_TUGMA = (prefiks: string) => ({
  inline_keyboard: [
    [
      { text: '📆 Bugun', callback_data: `${prefiks}:bugun` },
      { text: '📅 Shu oy', callback_data: `${prefiks}:oy` },
    ],
    [
      { text: '📅 Shu yil', callback_data: `${prefiks}:yil` },
      { text: '🗓 Hammasi', callback_data: `${prefiks}:hammasi` },
    ],
    [{ text: '📆 Sanadan — sanagacha', callback_data: `${prefiks}:oraliq` }],
  ],
});

Deno.serve(async (req) => {
  const token = Deno.env.get('TELEGRAM_QARZ_BOT_TOKEN');
  const secret = Deno.env.get('TELEGRAM_QARZ_WEBHOOK_SECRET');
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
    return tg('sendMessage', {
      chat_id: chat,
      text: matn,
      parse_mode: 'HTML',
      ...qoshimcha,
    });
  }

  /**
   * Fayl yuborish — sendDocument JSON emas, multipart bo'lishi shart.
   * Shu sabab bu yerda tg() ishlatilmaydi.
   */
  async function faylYubor(chat: number, bayt: Uint8Array, nom: string, izoh: string) {
    const f = new FormData();
    f.append('chat_id', String(chat));
    f.append('caption', izoh);
    f.append('parse_mode', 'HTML');
    f.append('document', new Blob([bayt]), nom);
    const r = await fetch(`${TG}${token}/sendDocument`, { method: 'POST', body: f });
    return await r.json();
  }

  /**
   * Hujjat tugmalari.
   *
   * Kerakli hamma narsa callback ichida turadi (holatda emas): agent
   * sverkani ochib qo'yib, keyin boshqa amal boshlashi mumkin — holat
   * o'sha payt almashadi va tugma boshqa klientning faylini yasab
   * berardi.
   */
  const FAYL_TUGMA = (asos: string) => ({
    inline_keyboard: [
      [
        { text: '📊 Excel', callback_data: `${asos}:xlsx` },
        { text: '📄 PDF', callback_data: `${asos}:pdf` },
      ],
    ],
  });

  /**
   * Yozuvni tasdiqlash ekrani.
   *
   * Sana tugmalari shu yerda: agent SAQLASHDAN OLDIN qaysi kunga
   * yozayotganini ko'rsin va kerak bo'lsa o'zgartirsin.
   */
  async function tasdiqKorsat(chat: number, d: any) {
    const chiqimmi = d.tur === 'chiqim';
    const kun = d.sana ?? kunKaliti(new Date());
    const yangiQarz = chiqimmi
      ? Number(d.qarz || 0) + Number(d.summa)
      : Number(d.qarz || 0) - Number(d.summa);

    await yubor(
      chat,
      (chiqimmi ? '📋 <b>CHIQIM</b>' : '📋 <b>KIRIM</b>') +
        `\n\nKlient: ${esc(d.nom)}\n` +
        `Summa: <b>${pul(d.summa)}</b>\n` +
        (d.usul ? `Usul: <b>${USUL_NOM[d.usul] ?? d.usul}</b>\n` : '') +
        `📅 Sana: <b>${kunYorligi(kun)}</b>\n\n` +
        `${chiqimmi ? 'Qarz bo‘ladi' : 'Qolgan qarz'}: <b>${pul(yangiQarz)}</b>\n\n` +
        'Tasdiqlaysizmi?',
      {
        reply_markup: {
          inline_keyboard: [
            SANA_TUGMA('ysana', kun),
            [
              { text: '✅ SAQLASH', callback_data: 'saqla:1' },
              { text: '❌ BEKOR QILISH', callback_data: 'bekorla:1' },
            ],
          ],
        },
      },
    );
  }

  /** Tahrirni tasdiqlash ekrani */
  async function tahrirKorsat(chat: number, d: any) {
    const farq = Number(d.summa) - Number(d.eski_summa);
    await yubor(
      chat,
      '✏️ <b>TAHRIR</b>\n\n' +
        `👤 ${esc(d.nom)}\n` +
        `${d.tur === 'chiqim' ? '📦 Tovar chiqimi' : '💰 Pul kirimi'}\n\n` +
        `Eski summa: ${pul(d.eski_summa)}\n` +
        `Yangi summa: <b>${pul(d.summa)}</b>\n` +
        (farq !== 0 ? `Farq: <b>${farq > 0 ? '+' : '−'}${pul(Math.abs(farq))}</b>\n` : '') +
        `📅 Sana: <b>${kunYorligi(d.sana)}</b>\n\n` +
        'Davom etamizmi?',
      {
        reply_markup: {
          inline_keyboard: [
            SANA_TUGMA('tsana', d.sana),
            [
              { text: '✅ DAVOM ETISH', callback_data: 'tsaqla:1' },
              { text: '❌ VOZ KECHISH', callback_data: 'bekorla:1' },
            ],
          ],
        },
      },
    );
  }

  // ---------- suhbat holati ----------
  async function holatOl(chat: number): Promise<{ state: string; data: any }> {
    const { data } = await supabase
      .from('qarz_bot_state')
      .select('state, data')
      .eq('chat_id', chat)
      .maybeSingle();
    return { state: (data as any)?.state ?? 'idle', data: (data as any)?.data ?? {} };
  }

  async function holatQoy(chat: number, state: string, data: any = {}) {
    await supabase
      .from('qarz_bot_state')
      .upsert({ chat_id: chat, state, data, updated_at: new Date().toISOString() });
  }

  async function agentOl(chat: number): Promise<any | null> {
    const { data } = await supabase.rpc('qarz_agent_men', { p_chat_id: chat });
    return data ?? null;
  }

  /** Klientlarni inline tugma qilib beradi */
  async function klientTugmalari(chat: number, prefiks: string, q: string | null = null) {
    const { data, error } = await supabase.rpc('qarz_bot_klientlar', {
      p_chat_id: chat,
      p_q: q,
      p_limit: 40,
    });
    if (error) return null;
    const royxat = (data ?? []) as any[];
    if (royxat.length === 0) return { inline_keyboard: [] };
    return {
      inline_keyboard: royxat.map((k) => [
        {
          // Nom + qarz bitta tugmada: agent kimga yozayotganini
          // va uning qarzi qanchaligini birdan ko'radi
          text: `${k.apteka || k.ism} · ${raqam(k.qarz)}`.slice(0, 60),
          callback_data: `${prefiks}:${k.id}`,
        },
      ]),
    };
  }

  async function menyuniKorsat(chat: number, agent: any) {
    await holatQoy(chat, 'idle', {});
    await yubor(
      chat,
      `🏠 <b>BOSH MENYU</b>\n\n` +
        `👤 ${esc(agent.ism)}${agent.rayon ? ' · ' + esc(agent.rayon) : ''}\n` +
        `🏢 ${esc(agent.org)}`,
      { reply_markup: MENYU },
    );
  }

  // ---- sverka va hisobot ----
  //
  // Ikkalasiga IKKI YO'LDAN kelinadi: davr tugmasidan va qo'lda
  // yozilgan sana oralig'idan. Shuning uchun chizish shu yerda,
  // bitta joyda turadi.
  async function sverkaniKorsat(chat: number, cid: string, davrKalit: string) {
    const d = davrOraliq(davrKalit);
    const { data, error } = await supabase.rpc('qarz_bot_sverka', {
      p_chat_id: chat,
      p_client_id: cid,
      p_dan: d.dan,
      p_gacha: d.gacha,
    });
    if (error) {
      await yubor(chat, '❌ Sverka olinmadi: ' + esc(error.message));
      return;
    }
    const s = data as any;
    const k = s.klient ?? {};
    let matn =
      `🔄 <b>SVERKA</b>\n\n` +
      `👤 ${esc(k.apteka || k.ism)}\n` +
      `📅 ${esc(d.nom)}\n\n` +
      `📦 Tovar chiqimi:\n<b>${pul(s.chiqim)}</b>\n\n` +
      `💰 Pul kirimi:\n<b>${pul(s.kirim)}</b>`;

    // Kirim usullari — faqat bo'lganlari yoziladi, aks holda
    // uchta nol qator har sverkani uzaytirardi
    const usullar = (s.usullar ?? {}) as Record<string, number>;
    const usulYozuv = Object.entries(usullar)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `   ${USUL_NOM[k] ?? k}: ${pul(v)}`)
      .join('\n');
    if (usulYozuv) matn += `\n${usulYozuv}`;

    matn += `\n\n━━━━━━━━━━━━━━\n\n💳 Qoldiq:\n<b>${pul(s.qoldiq)}</b>`;

    const amallar = (s.amallar ?? []) as any[];
    if (amallar.length) {
      matn += '\n\n<b>Harakatlar:</b>';
      // Telegram xabari 4096 belgi — uzun ro'yxat kesiladi, aks
      // holda javob umuman yuborilmasdi
      const korinadi = amallar.slice(-25);

      // KUNLAR KESIMI. Avval har qatorda to'liq sana turardi va bir
      // kunda ikki chiqim bo'lsa, ular bir-biriga qo'shilib ketardi.
      // Endi kun bir marta sarlavha bo'lib chiqadi, o'z jami bilan.
      let oxirgiKun = '';
      for (const a of korinadi) {
        const kun = kunKaliti(new Date(a.sana));
        if (kun !== oxirgiKun) {
          oxirgiKun = kun;
          const kungi = korinadi.filter(
            (x) => kunKaliti(new Date(x.sana)) === kun && !x.bekor,
          );
          const kc = kungi
            .filter((x) => x.tur === 'chiqim')
            .reduce((z, x) => z + Number(x.summa), 0);
          const kk = kungi
            .filter((x) => x.tur === 'kirim')
            .reduce((z, x) => z + Number(x.summa), 0);
          matn +=
            `\n\n━━ <b>${esc(kunYorligi(kun))}</b> ━━` +
            (kc > 0 ? `\n📦 ${raqam(kc)}` : '') +
            (kk > 0 ? `${kc > 0 ? '   ·   ' : '\n'}💰 ${raqam(kk)}` : '');
        }
        const belgi = a.tur === 'chiqim' ? '📦 Chiqim' : '💰 Kirim';
        const ishora = a.tur === 'chiqim' ? '+' : '−';
        const d = new Date(a.sana);
        const ik = (n: number) => String(n).padStart(2, '0');
        matn +=
          `\n\n${ik(d.getHours())}:${ik(d.getMinutes())}   ${belgi}   ${ishora}${raqam(a.summa)}` +
          (a.usul ? `  ·  ${USUL_NOM[a.usul] ?? a.usul}` : '') +
          (a.bekor ? `\n<s>BEKOR QILINGAN</s> — ${esc(a.bekor_sabab ?? '')}` : '');
      }
      if (amallar.length > 25) matn += `\n\n<i>...va yana ${amallar.length - 25} ta</i>`;
    }

    await holatQoy(chat, 'idle', {});
    await yubor(chat, matn, { reply_markup: MENYU });
    await yubor(chat, '📎 Hujjat kerakmi?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📊 Excel', callback_data: `sf:${cid}:${davrKalit}:xlsx` },
            { text: '📄 PDF', callback_data: `sf:${cid}:${davrKalit}:pdf` },
          ],
          // Sverkada xato ko'rinsa, uni AYNI SHU YERDAN tuzatish
          // mumkin bo'lsin — menyuga qaytib, ro'yxatdan qidirish
          // shart emas
          [{ text: '✏️ Shu klientni tuzatish', callback_data: `tz:${cid}` }],
        ],
      },
    });
    return;
  }

  async function hisobotniKorsat(chat: number, agent: any, davrKalit: string) {
    const d = davrOraliq(davrKalit);
    const { data, error } = await supabase.rpc('qarz_bot_hisobot', {
      p_chat_id: chat,
      p_dan: d.dan,
      p_gacha: d.gacha,
    });
    if (error) {
      await yubor(chat, '❌ Hisobot olinmadi: ' + esc(error.message));
      return;
    }
    const r = data as any;
    await yubor(
      chat,
      `📊 <b>${esc(d.nom.toUpperCase())}</b>\n\n` +
        `📦 Jami tovar chiqimi:\n<b>${pul(r.chiqim)}</b>\n\n` +
        `💰 Jami pul kirimi:\n<b>${pul(r.kirim)}</b>\n` +
        `   💵 Naqd:    ${pul(r.naqd)}\n` +
        `   💳 Plastik: ${pul(r.plastik)}\n` +
        `   🔵 Click:   ${pul(r.klik)}\n\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `💳 Jami qarzdorlik:\n<b>${pul(r.qarz)}</b>\n` +
        `<i>(bugungi holat, davrga bog'liq emas)</i>\n\n` +
        `👥 Klientlar: <b>${r.klientlar}</b> ta`,
      { reply_markup: MENYU },
    );
    await yubor(chat, '📎 Hujjat kerakmi?', {
      reply_markup: FAYL_TUGMA(`hf:${davrKalit}`),
    });
  }

  // ============================================================ CALLBACK
  if (update.callback_query) {
    const cq = update.callback_query;
    const chat: number = cq.message?.chat?.id;
    const dat: string = cq.data ?? '';
    await tg('answerCallbackQuery', { callback_query_id: cq.id });

    const agent = await agentOl(chat);
    if (!agent) return new Response('ok');

    const [tur, qiymat] = [dat.slice(0, dat.indexOf(':')), dat.slice(dat.indexOf(':') + 1)];

    // ---- klient tanlandi: chiqim / kirim ----
    if (tur === 'chiqim' || tur === 'kirim') {
      const { data } = await supabase.rpc('qarz_bot_klientlar', { p_chat_id: chat, p_limit: 100 });
      const k = ((data ?? []) as any[]).find((x) => x.id === qiymat);
      if (!k) {
        await yubor(chat, '❌ Klient topilmadi.');
        return new Response('ok');
      }
      await holatQoy(chat, `${tur}_summa`, { client_id: qiymat, nom: k.apteka || k.ism, qarz: k.qarz });
      await yubor(
        chat,
        (tur === 'chiqim' ? '📦 <b>TOVAR CHIQIMI</b>' : '💰 <b>PUL KIRIMI</b>') +
          `\n\n👤 ${esc(k.apteka || k.ism)}\n💳 Hozirgi qarz: <b>${pul(k.qarz)}</b>\n\n` +
          `Summani kiriting:\n<i>masalan 1 250 000</i>`,
      );
      return new Response('ok');
    }

    // ---- klient tanlandi: sverka ----
    if (tur === 'sverka') {
      await holatQoy(chat, 'sverka_davr', { client_id: qiymat });
      await yubor(chat, '📅 <b>Davrni tanlang:</b>', { reply_markup: DAVR_TUGMA('sdavr') });
      return new Response('ok');
    }

    // ---- sverka davri ----
    if (tur === 'sdavr') {
      const h = await holatOl(chat);
      const cid = h.data?.client_id;
      if (!cid) {
        await menyuniKorsat(chat, agent);
        return new Response('ok');
      }
      if (qiymat === 'oraliq') {
        await holatQoy(chat, 'oraliq_sana', { prefiks: 'sverka', client_id: cid });
        await yubor(
          chat,
          '📆 <b>Sanadan — sanagacha</b>\n\n' +
            'Ikkita sanani yozing:\n<code>01.09.2026 - 30.09.2026</code>',
        );
        return new Response('ok');
      }
      await sverkaniKorsat(chat, cid, qiymat);
      return new Response('ok');
    }

    // ---- sverka fayli ----
    if (tur === 'sf') {
      const [cid, davrKalit, format] = qiymat.split(':');
      const d = davrOraliq(davrKalit);
      const { data, error } = await supabase.rpc('qarz_bot_sverka', {
        p_chat_id: chat,
        p_client_id: cid,
        p_dan: d.dan,
        p_gacha: d.gacha,
      });
      if (error) {
        await yubor(chat, '❌ Hujjat yasalmadi: ' + esc(error.message));
        return new Response('ok');
      }
      const s = data as any;
      const nom = faylNomi(s.klient?.apteka || s.klient?.ism || 'sverka');
      const firma = agent.org ?? '';
      const bayt =
        format === 'pdf' ? sverkaPdf(s, firma, d.nom) : sverkaXlsx(s, firma, d.nom);
      await faylYubor(
        chat,
        bayt,
        `sverka-${nom}-${sanaQisqa(new Date().toISOString()).replace(/\./g, '-')}.${format === 'pdf' ? 'pdf' : 'xlsx'}`,
        `🔄 <b>SVERKA</b> · ${esc(d.nom)}\n💳 Qoldiq: <b>${pul(s.qoldiq)}</b>`,
      );
      return new Response('ok');
    }

    // ---- hisobot fayli ----
    if (tur === 'hf') {
      const [davrKalit, format] = qiymat.split(':');
      const d = davrOraliq(davrKalit);
      // Klient qatorlari AYNI davrdan olinadi: xulosadagi jami bilan
      // qatorlar yig'indisi mos kelmasa, qaysi biri to'g'riligi bilinmasdi
      const [{ data: r, error: xato1 }, { data: kl, error: xato2 }] = await Promise.all([
        supabase.rpc('qarz_bot_hisobot', { p_chat_id: chat, p_dan: d.dan, p_gacha: d.gacha }),
        supabase.rpc('qarz_bot_hisobot_klientlar', {
          p_chat_id: chat,
          p_dan: d.dan,
          p_gacha: d.gacha,
        }),
      ]);
      if (xato1 || xato2) {
        await yubor(chat, '❌ Hujjat yasalmadi: ' + esc((xato1 ?? xato2)!.message));
        return new Response('ok');
      }
      // Qarzi katta klient tepada: hisobotni ochgan odam avval shuni qidiradi
      const klientlar = (kl ?? []) as any[];
      const firma = agent.org ?? '';
      const davrNomi = `${d.nom} · ${agent.ism ?? ''}`;
      const bayt =
        format === 'pdf'
          ? hisobotPdf(r as any, klientlar, firma, davrNomi)
          : hisobotXlsx(r as any, klientlar, firma, davrNomi);
      await faylYubor(
        chat,
        bayt,
        `hisobot-${sanaQisqa(new Date().toISOString()).replace(/\./g, '-')}.${format === 'pdf' ? 'pdf' : 'xlsx'}`,
        `📊 <b>HISOBOT</b> · ${esc(d.nom)}\n💳 Qarzdorlik: <b>${pul((r as any)?.qarz)}</b>`,
      );
      return new Response('ok');
    }

    // ---- hisobot davri ----
    if (tur === 'hdavr') {
      if (qiymat === 'oraliq') {
        await holatQoy(chat, 'oraliq_sana', { prefiks: 'hisobot' });
        await yubor(
          chat,
          '📆 <b>Sanadan — sanagacha</b>\n\n' +
            'Ikkita sanani yozing:\n<code>01.09.2026 - 30.09.2026</code>',
        );
        return new Response('ok');
      }
      await hisobotniKorsat(chat, agent, qiymat);
      return new Response('ok');
    }

    // ---- to'lov usuli tanlandi ----
    if (tur === 'usul') {
      const h = await holatOl(chat);
      const d = h.data ?? {};
      if (!d.client_id || !d.summa) {
        await menyuniKorsat(chat, agent);
        return new Response('ok');
      }
      const yangi = { ...d, usul: qiymat, tur: 'kirim', sana: d.sana ?? kunKaliti(new Date()) };
      await holatQoy(chat, 'kirim_tasdiq', yangi);
      await tasdiqKorsat(chat, yangi);
      return new Response('ok');
    }

    // ---- yozuv sanasini o'zgartirish ----
    if (tur === 'ysana') {
      const h = await holatOl(chat);
      const d = h.data ?? {};
      if (!d.client_id || !d.summa) {
        await menyuniKorsat(chat, agent);
        return new Response('ok');
      }
      if (qiymat === 'boshqa') {
        await holatQoy(chat, 'yozuv_sana', d);
        await yubor(
          chat,
          '🗓 <b>Qaysi kun uchun?</b>\n\nSanani yozing:\n<code>09.09.2026</code>',
        );
        return new Response('ok');
      }
      const yangi = { ...d, sana: qiymat };
      await holatQoy(chat, h.state, yangi);
      await tasdiqKorsat(chat, yangi);
      return new Response('ok');
    }

    // ---- yozuvni tasdiqlash ----
    if (tur === 'saqla') {
      const h = await holatOl(chat);
      const d = h.data ?? {};
      if (!d.client_id || !d.summa || !d.tur) {
        await menyuniKorsat(chat, agent);
        return new Response('ok');
      }
      // Bugun bo'lsa vaqt ham hozirgi bo'lsin (null = now()). O'tgan
      // kunga esa kun o'rtasi yoziladi: 00:00 bo'lsa soat mintaqasi
      // surilganda yozuv oldingi kunga tushib ketardi.
      const bugun = kunKaliti(new Date());
      const { data, error } = await supabase.rpc('qarz_bot_yozuv', {
        p_chat_id: chat,
        p_client_id: d.client_id,
        p_tur: d.tur,
        p_summa: d.summa,
        p_izoh: null,
        p_usul: d.usul ?? null,
        p_sana: !d.sana || d.sana === bugun ? null : `${d.sana}T12:00:00`,
      });
      if (error) {
        await yubor(chat, '❌ Saqlanmadi: ' + esc(error.message), { reply_markup: MENYU });
        await holatQoy(chat, 'idle', {});
        return new Response('ok');
      }
      const r = data as any;
      const chiqimmi = d.tur === 'chiqim';
      await holatQoy(chat, 'idle', {});
      await yubor(
        chat,
        (chiqimmi ? '📋 <b>CHIQIM SAQLANDI</b>' : '💰 <b>KIRIM SAQLANDI</b>') +
          `\n\n👤 ${esc(r.klient)}\n` +
          `${chiqimmi ? '+' : '−'}${pul(r.summa)}` +
          (r.usul ? `  ·  ${USUL_NOM[r.usul] ?? r.usul}` : '') +
          `\n\n` +
          `📅 ${kunYorligi(kunKaliti(new Date(r.sana)))}\n\n` +
          `Oldingi qarz:  ${pul(r.oldingi)}\n` +
          `${chiqimmi ? 'Chiqim:       ' : "To'lov:       "} ${pul(r.summa)}\n` +
          `<b>Qolgan qarz:  ${pul(r.qoldiq)}</b>`,
        { reply_markup: MENYU },
      );
      return new Response('ok');
    }

    if (tur === 'bekorla') {
      await holatQoy(chat, 'idle', {});
      await yubor(chat, '❌ Bekor qilindi.', { reply_markup: MENYU });
      return new Response('ok');
    }

    // ---- bitta klientning yozuvlari (sverkadan) ----
    if (tur === 'tz') {
      const { data, error } = await supabase.rpc('qarz_bot_yozuvlar', {
        p_chat_id: chat,
        p_client_id: qiymat,
        p_limit: 15,
      });
      if (error) {
        await yubor(chat, '❌ ' + esc(error.message), { reply_markup: MENYU });
        return new Response('ok');
      }
      const royxat = (data ?? []) as any[];
      if (royxat.length === 0) {
        await yubor(chat, '✏️ Bu klientda tuzatadigan yozuv yo‘q.', { reply_markup: MENYU });
        return new Response('ok');
      }
      await yubor(chat, '✏️ <b>Qaysi yozuvni tuzatamiz?</b>', {
        reply_markup: {
          inline_keyboard: royxat.flatMap((a) => [
            [
              {
                text: `${a.tur === 'chiqim' ? '📦' : '💰'} ${raqam(a.summa)} · ${kunYorligi(kunKaliti(new Date(a.sana)))}`.slice(0, 60),
                callback_data: `tah:${a.id}`,
              },
            ],
            [
              { text: '✏️ Tahrir', callback_data: `tah:${a.id}` },
              { text: '↩️ Bekor', callback_data: `bek:${a.id}` },
            ],
          ]),
        },
      });
      return new Response('ok');
    }

    // ---- tahrir: yozuv tanlandi ----
    if (tur === 'tah') {
      // Yozuv ID bo'yicha olinadi. Avval "oxirgi 30 ta" ro'yxatidan
      // qidirilardi: sverkadan eski yozuv tanlansa u ro'yxatga
      // tushmay, bot "topilmadi" derdi — holbuki yozuv bor edi.
      const { data, error } = await supabase.rpc('qarz_bot_yozuv_ol', {
        p_chat_id: chat,
        p_id: qiymat,
      });
      const a = data as any;
      if (error || !a) {
        await yubor(chat, '❌ Yozuv topilmadi.', { reply_markup: MENYU });
        return new Response('ok');
      }
      if (a.bekor) {
        await yubor(chat, '❌ Bekor qilingan yozuvni tahrirlab bo‘lmaydi.', {
          reply_markup: MENYU,
        });
        return new Response('ok');
      }
      await holatQoy(chat, 'tahrir_summa', {
        tx_id: a.id,
        tur: a.tur,
        nom: a.klient,
        eski_summa: Number(a.summa),
        sana: kunKaliti(new Date(a.sana)),
      });
      await yubor(
        chat,
        '✏️ <b>TAHRIR</b>\n\n' +
          `${a.tur === 'chiqim' ? '📦 Tovar chiqimi' : '💰 Pul kirimi'}\n` +
          `👤 ${esc(a.klient)}\n` +
          `Hozirgi summa: <b>${pul(a.summa)}</b>\n` +
          `📅 ${kunYorligi(kunKaliti(new Date(a.sana)))}\n\n` +
          'Yangi summani kiriting:\n<i>o‘zgarmasa ham ayni summani yozing</i>',
      );
      return new Response('ok');
    }

    // ---- tahrir: sana ----
    if (tur === 'tsana') {
      const h = await holatOl(chat);
      const d = h.data ?? {};
      if (!d.tx_id) {
        await menyuniKorsat(chat, agent);
        return new Response('ok');
      }
      if (qiymat === 'boshqa') {
        await holatQoy(chat, 'tahrir_sana', d);
        await yubor(chat, '🗓 Sanani yozing:\n<code>09.09.2026</code>');
        return new Response('ok');
      }
      const yangi = { ...d, sana: qiymat };
      await holatQoy(chat, 'tahrir_tasdiq', yangi);
      await tahrirKorsat(chat, yangi);
      return new Response('ok');
    }

    // ---- tahrir: sababni so'rash ----
    if (tur === 'tsaqla') {
      const h = await holatOl(chat);
      const d = h.data ?? {};
      if (!d.tx_id || !d.summa) {
        await menyuniKorsat(chat, agent);
        return new Response('ok');
      }
      await holatQoy(chat, 'tahrir_sabab', d);
      await yubor(
        chat,
        '✍️ <b>Nega o‘zgartiryapsiz?</b>\n\n' +
          '<i>Sabab audit jurnalida eski qiymat bilan birga qoladi.\n' +
          'Masalan: summa xato kiritilgan edi</i>',
      );
      return new Response('ok');
    }

    // ---- yozuvni bekor qilish: sabab so'raladi ----
    if (tur === 'bek') {
      await holatQoy(chat, 'bekor_sabab', { tx_id: qiymat });
      await yubor(
        chat,
        '↩️ <b>Bekor qilish</b>\n\nSababini yozing:\n<i>masalan: noto‘g‘ri summa</i>',
      );
      return new Response('ok');
    }

    return new Response('ok');
  }

  // ============================================================ XABAR
  const msg = update.message;
  if (!msg) return new Response('ok');

  const chat: number = msg.chat?.id;
  const matn: string = (msg.text ?? '').trim();
  const from = msg.from ?? {};
  if (!chat) return new Response('ok');

  // ---------- kontakt ----------
  if (msg.contact) {
    // MUHIM: Telegramda BOSHQA odamning kontaktini ham yuborish mumkin.
    // Faqat o'zining raqamini yuborgan bo'lsa qabul qilamiz.
    if (Number(msg.contact.user_id) !== Number(from.id)) {
      await yubor(chat, '❌ Faqat <b>o‘z</b> raqamingizni yuboring — pastdagi tugma orqali.');
      return new Response('ok');
    }

    const { data } = await supabase.rpc('qarz_agent_ulash', {
      p_phone: msg.contact.phone_number,
      p_chat_id: chat,
      p_username: from.username ?? null,
      p_first_name: from.first_name ?? null,
    });
    const d = (data ?? {}) as any;

    if (d.ok) {
      await yubor(
        chat,
        `✅ Xush kelibsiz, <b>${esc(d.ism)}</b>!\n\n` +
          `🏢 ${esc(d.org)}\n` +
          (d.rayon ? `📍 ${esc(d.rayon)}\n` : '') +
          `\nEndi klientlaringiz bilan ishlashingiz mumkin.`,
        { reply_markup: MENYU },
      );
    } else if (d.error === 'AGENT_BLOKLANGAN') {
      await yubor(chat, '❌ Sizning hisobingiz vaqtincha to‘xtatilgan. Administrator bilan bog‘laning.');
    } else {
      await yubor(
        chat,
        `❌ <b>${esc(msg.contact.phone_number)}</b> raqami ro‘yxatda topilmadi.\n\n` +
          'Administrator sizni agent sifatida qo‘shishi kerak. Raqamingizni unga ayting.',
      );
    }
    return new Response('ok');
  }

  const agent = await agentOl(chat);

  // ---------- ulanmagan ----------
  if (!agent) {
    await yubor(
      chat,
      '👋 <b>Qarzdorlik hisobi</b>\n\n' +
        'Boshlash uchun telefon raqamingizni yuboring — pastdagi tugmani bosing.\n\n' +
        '<i>Raqamingiz administrator ro‘yxatida bo‘lishi kerak.</i>',
      { reply_markup: KONTAKT },
    );
    return new Response('ok');
  }
  if (agent.faol === false) {
    await yubor(chat, '❌ Hisobingiz vaqtincha to‘xtatilgan. Administrator bilan bog‘laning.');
    return new Response('ok');
  }

  // ---------- buyruqlar ----------
  if (matn === '/start' || matn === '/menu' || matn === '🏠 Bosh menyu') {
    await menyuniKorsat(chat, agent);
    return new Response('ok');
  }

  const holat = await holatOl(chat);

  // ---------- holatga bog'liq javoblar ----------
  // Menyu tugmasi bosilsa suhbat uziladi: aks holda "summa kiriting"
  // holatida qolib, har bosishga "noto'g'ri summa" deyilardi
  const MENYU_MATNLARI = [
    '👤 Klientlarim', '📦 Tovar chiqimi', '💰 Pul kirimi', '🔄 SVERKA',
    '📊 Hisobotlar', '➕ Yangi klient', '✏️ Tuzatish', '↩️ Bekor qilish',
    '⚙️ Sozlamalar',
  ];
  const menyuBosildi = MENYU_MATNLARI.includes(matn);

  if (!menyuBosildi && holat.state !== 'idle') {
    // ---- yangi klient sehrgari ----
    if (holat.state === 'klient_ism') {
      await holatQoy(chat, 'klient_familiya', { ism: matn });
      await yubor(chat, '👤 <b>Familiyasi:</b>\n<i>yo‘q bo‘lsa — "-" yozing</i>');
      return new Response('ok');
    }
    if (holat.state === 'klient_familiya') {
      await holatQoy(chat, 'klient_apteka', { ...holat.data, familiya: matn === '-' ? null : matn });
      await yubor(chat, '🏪 <b>Apteka nomi:</b>\n<i>yo‘q bo‘lsa — "-" yozing</i>');
      return new Response('ok');
    }
    if (holat.state === 'klient_apteka') {
      await holatQoy(chat, 'klient_telefon', { ...holat.data, apteka: matn === '-' ? null : matn });
      await yubor(chat, '📞 <b>Telefon raqami:</b>\n<i>yo‘q bo‘lsa — "-" yozing</i>');
      return new Response('ok');
    }
    if (holat.state === 'klient_telefon') {
      const { data, error } = await supabase.rpc('qarz_bot_klient_qosh', {
        p_chat_id: chat,
        p_ism: holat.data.ism,
        p_familiya: holat.data.familiya ?? null,
        p_apteka: holat.data.apteka ?? null,
        p_telefon: matn === '-' ? null : matn,
      });
      await holatQoy(chat, 'idle', {});
      if (error) {
        await yubor(chat, '❌ Qo‘shilmadi: ' + esc(error.message), { reply_markup: MENYU });
        return new Response('ok');
      }
      const d = holat.data;
      await yubor(
        chat,
        `✅ <b>Klient qo‘shildi</b>\n\n` +
          `👤 ${esc(d.ism)}${d.familiya ? ' ' + esc(d.familiya) : ''}\n` +
          (d.apteka ? `🏪 ${esc(d.apteka)}\n` : '') +
          (matn !== '-' ? `📞 ${esc(matn)}\n` : '') +
          `💳 Qarzdorlik: 0 so‘m`,
        { reply_markup: MENYU },
      );
      return new Response('ok');
    }

    // ---- summa kiritildi ----
    if (holat.state === 'chiqim_summa' || holat.state === 'kirim_summa') {
      const summa = summaOqi(matn);
      if (summa === null) {
        await yubor(chat, '❌ Summani raqam bilan kiriting.\n<i>masalan 1 250 000</i>');
        return new Response('ok');
      }
      const tur = holat.state === 'chiqim_summa' ? 'chiqim' : 'kirim';

      // Kirimda avval TO'LOV USULI so'raladi — naqd, plastik yoki
      // Click. Usulsiz yozib bo'lmaydi (baza ham USUL_MAJBURIY beradi).
      if (tur === 'kirim') {
        await holatQoy(chat, 'kirim_usul', { ...holat.data, summa, tur });
        await yubor(
          chat,
          `💰 <b>PUL KIRIMI</b>\n\n` +
            `Klient: ${esc(holat.data.nom)}\n` +
            `Summa: <b>${pul(summa)}</b>\n\n` +
            `To‘lov qanday olindi?`,
          { reply_markup: USUL_TUGMA },
        );
        return new Response('ok');
      }

      const yangi = { ...holat.data, summa, tur, sana: kunKaliti(new Date()) };
      await holatQoy(chat, `${tur}_tasdiq`, yangi);
      await tasdiqKorsat(chat, yangi);
      return new Response('ok');
    }

    // ---- tahrir: yangi summa ----
    if (holat.state === 'tahrir_summa') {
      const summa = summaOqi(matn);
      if (summa === null) {
        await yubor(chat, '❌ Summani raqam bilan kiriting.\n<i>masalan 1 250 000</i>');
        return new Response('ok');
      }
      const d = { ...holat.data, summa };
      await holatQoy(chat, 'tahrir_tasdiq', d);
      await tahrirKorsat(chat, d);
      return new Response('ok');
    }

    // ---- tahrir: qo'lda yozilgan sana ----
    if (holat.state === 'tahrir_sana') {
      const kun = sanaOqi(matn);
      if (!kun) {
        await yubor(
          chat,
          '❌ Sanani tushunmadim yoki u kelajakda.\n\nShunday yozing:\n<code>09.09.2026</code>',
        );
        return new Response('ok');
      }
      const d = { ...holat.data, sana: kun };
      await holatQoy(chat, 'tahrir_tasdiq', d);
      await tahrirKorsat(chat, d);
      return new Response('ok');
    }

    // ---- tahrir: sabab va saqlash ----
    if (holat.state === 'tahrir_sabab') {
      if (matn.trim().length < 3) {
        await yubor(chat, '❌ Sababni to‘liqroq yozing (kamida 3 belgi).');
        return new Response('ok');
      }
      const d = holat.data ?? {};
      const bugun = kunKaliti(new Date());
      const { data, error } = await supabase.rpc('qarz_bot_tahrir', {
        p_chat_id: chat,
        p_id: d.tx_id,
        p_summa: d.summa,
        p_sana: !d.sana || d.sana === bugun ? null : `${d.sana}T12:00:00`,
        p_usul: null,
        p_sabab: matn.trim(),
      });
      await holatQoy(chat, 'idle', {});
      if (error) {
        await yubor(chat, '❌ O‘zgartirilmadi: ' + esc(error.message), { reply_markup: MENYU });
        return new Response('ok');
      }
      const r = data as any;
      await yubor(
        chat,
        '✅ <b>O‘ZGARTIRILDI</b>\n\n' +
          `👤 ${esc(d.nom)}\n` +
          `${pul(r.eski_summa)} → <b>${pul(r.summa)}</b>\n` +
          `📅 ${kunYorligi(kunKaliti(new Date(r.sana)))}\n\n` +
          `<b>Qolgan qarz: ${pul(r.qoldiq)}</b>\n\n` +
          `<i>Sabab jurnalda qoldi: ${esc(matn.trim())}</i>`,
        { reply_markup: MENYU },
      );
      return new Response('ok');
    }

    // ---- yozuv uchun qo'lda yozilgan sana ----
    if (holat.state === 'yozuv_sana') {
      const kun = sanaOqi(matn);
      if (!kun) {
        await yubor(
          chat,
          '❌ Sanani tushunmadim yoki u kelajakda.\n\nShunday yozing:\n<code>09.09.2026</code>',
        );
        return new Response('ok');
      }
      const d = { ...holat.data, sana: kun };
      await holatQoy(chat, d.tur === 'kirim' ? 'kirim_tasdiq' : 'chiqim_tasdiq', d);
      await tasdiqKorsat(chat, d);
      return new Response('ok');
    }

    // ---- bekor qilish sababi ----
    if (holat.state === 'bekor_sabab') {
      if (matn.length < 3) {
        await yubor(chat, '❌ Sababni to‘liqroq yozing (kamida 3 belgi).');
        return new Response('ok');
      }
      const { data, error } = await supabase.rpc('qarz_bot_bekor', {
        p_chat_id: chat,
        p_tx_id: holat.data.tx_id,
        p_sabab: matn,
      });
      await holatQoy(chat, 'idle', {});
      if (error) {
        await yubor(chat, '❌ Bekor qilinmadi: ' + esc(error.message), { reply_markup: MENYU });
        return new Response('ok');
      }
      await yubor(
        chat,
        `↩️ <b>Bekor qilindi</b>\n\nSabab: ${esc(matn)}\n` +
          `💳 Yangi qoldiq: <b>${pul((data as any).qoldiq)}</b>`,
        { reply_markup: MENYU },
      );
      return new Response('ok');
    }

    // ---- ixtiyoriy sana oralig'i ----
    if (holat.state === 'oraliq_sana') {
      const kalit = oraliqOqi(matn);
      if (!kalit) {
        await yubor(
          chat,
          '❌ Sanani tushunmadim.\n\nShunday yozing:\n<code>01.09.2026 - 30.09.2026</code>',
        );
        return new Response('ok');
      }
      await holatQoy(chat, 'idle', {});
      if (holat.data?.prefiks === 'sverka') {
        const cid = holat.data?.client_id;
        if (!cid) {
          await menyuniKorsat(chat, agent);
          return new Response('ok');
        }
        await sverkaniKorsat(chat, cid, kalit);
      } else {
        await hisobotniKorsat(chat, agent, kalit);
      }
      return new Response('ok');
    }

    // ---- klient qidiruvi ----
    if (holat.state === 'klient_qidir') {
      const tugma = await klientTugmalari(chat, holat.data.prefiks, matn);
      if (!tugma || tugma.inline_keyboard.length === 0) {
        await yubor(chat, '🔍 Topilmadi. Boshqacha yozib ko‘ring yoki menyudan tanlang.');
        return new Response('ok');
      }
      await yubor(chat, '👤 <b>Klientni tanlang:</b>', { reply_markup: tugma });
      return new Response('ok');
    }
  }

  // ---------- menyu ----------
  if (matn === '👤 Klientlarim') {
    const { data, error } = await supabase.rpc('qarz_bot_klientlar', { p_chat_id: chat, p_limit: 50 });
    if (error) {
      await yubor(chat, '❌ ' + esc(error.message));
      return new Response('ok');
    }
    const royxat = (data ?? []) as any[];
    if (royxat.length === 0) {
      await yubor(chat, '👤 Hali klientingiz yo‘q.\n\n«➕ Yangi klient» tugmasi bilan qo‘shing.', {
        reply_markup: MENYU,
      });
      return new Response('ok');
    }
    let t = `👤 <b>KLIENTLARIM</b> (${royxat.length} ta)\n`;
    let jami = 0;
    for (const k of royxat) {
      jami += Number(k.qarz) || 0;
      t +=
        `\n\n🏪 <b>${esc(k.apteka || k.ism)}</b>` +
        (k.apteka && k.ism ? `\n👤 ${esc(k.ism)} ${esc(k.familiya)}` : '') +
        (k.telefon ? `\n📞 ${esc(k.telefon)}` : '') +
        `\n💳 ${pul(k.qarz)}`;
    }
    t += `\n\n━━━━━━━━━━━━━━\n💳 <b>Jami qarz: ${pul(jami)}</b>`;
    await yubor(chat, t, { reply_markup: MENYU });
    return new Response('ok');
  }

  if (matn === '📦 Tovar chiqimi' || matn === '💰 Pul kirimi') {
    const prefiks = matn === '📦 Tovar chiqimi' ? 'chiqim' : 'kirim';
    const tugma = await klientTugmalari(chat, prefiks);
    if (!tugma || tugma.inline_keyboard.length === 0) {
      await yubor(chat, '👤 Avval klient qo‘shing — «➕ Yangi klient».', { reply_markup: MENYU });
      return new Response('ok');
    }
    await holatQoy(chat, 'klient_qidir', { prefiks });
    await yubor(chat, '👤 <b>Klientni tanlang:</b>\n<i>yoki nomini yozib qidiring</i>', {
      reply_markup: tugma,
    });
    return new Response('ok');
  }

  if (matn === '🔄 SVERKA') {
    const tugma = await klientTugmalari(chat, 'sverka');
    if (!tugma || tugma.inline_keyboard.length === 0) {
      await yubor(chat, '👤 Avval klient qo‘shing.', { reply_markup: MENYU });
      return new Response('ok');
    }
    await holatQoy(chat, 'klient_qidir', { prefiks: 'sverka' });
    await yubor(chat, '👤 <b>Klientni tanlang:</b>\n<i>yoki nomini yozib qidiring</i>', {
      reply_markup: tugma,
    });
    return new Response('ok');
  }

  if (matn === '📊 Hisobotlar') {
    await holatQoy(chat, 'idle', {});
    await yubor(chat, '📊 <b>HISOBOTLAR</b>\n\nDavrni tanlang:', {
      reply_markup: DAVR_TUGMA('hdavr'),
    });
    return new Response('ok');
  }

  if (matn === '➕ Yangi klient') {
    await holatQoy(chat, 'klient_ism', {});
    await yubor(chat, '➕ <b>Yangi klient</b>\n\n👤 <b>Ismi:</b>');
    return new Response('ok');
  }

  if (matn === '✏️ Tuzatish' || matn === '↩️ Bekor qilish') {
    await holatQoy(chat, 'idle', {});
    const { data, error } = await supabase.rpc('qarz_bot_oxirgi', { p_chat_id: chat, p_limit: 10 });
    if (error) {
      await yubor(chat, '❌ ' + esc(error.message));
      return new Response('ok');
    }
    const royxat = ((data ?? []) as any[]).filter((x) => !x.bekor);
    if (royxat.length === 0) {
      await yubor(chat, '✏️ Tuzatish uchun yozuv yo‘q.', { reply_markup: MENYU });
      return new Response('ok');
    }
    // Har yozuvda IKKI tugma: summani to'g'rilash va butunlay bekor
    // qilish. Avval faqat bekor bor edi — bitta xato summa uchun
    // sverkada uchta qator qolardi.
    await yubor(
      chat,
      '✏️ <b>Oxirgi yozuvlar</b>\n\n' +
        '<i>Tahrir — summa yoki sanani to‘g‘rilaydi.\n' +
        'Bekor — yozuvni hisobdan chiqaradi.</i>',
      {
        reply_markup: {
          inline_keyboard: royxat.flatMap((a) => [
            [
              {
                text: `${a.tur === 'chiqim' ? '📦' : '💰'} ${raqam(a.summa)} · ${a.klient} · ${kunYorligi(kunKaliti(new Date(a.sana)))}`.slice(0, 60),
                callback_data: `tah:${a.id}`,
              },
            ],
            [
              { text: '✏️ Tahrir', callback_data: `tah:${a.id}` },
              { text: '↩️ Bekor', callback_data: `bek:${a.id}` },
            ],
          ]),
        },
      },
    );
    return new Response('ok');
  }

  if (matn === '⚙️ Sozlamalar') {
    await holatQoy(chat, 'idle', {});
    await yubor(
      chat,
      `⚙️ <b>SOZLAMALAR</b>\n\n` +
        `👤 ${esc(agent.ism)}\n` +
        (agent.rayon ? `📍 ${esc(agent.rayon)}\n` : '') +
        `🏢 ${esc(agent.org)}\n\n` +
        `<i>Ma’lumotlaringizni administrator o‘zgartiradi.</i>`,
      { reply_markup: MENYU },
    );
    return new Response('ok');
  }

  // ---------- tushunilmadi ----------
  await menyuniKorsat(chat, agent);
  return new Response('ok');
});
