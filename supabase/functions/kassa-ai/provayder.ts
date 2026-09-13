// =============================================================
//  PROVAYDERLAR — Claude, GPT, Gemini
//
//  Mijoz qaysi AI'ga obuna bo'lsa, o'shani ulaydi. Uchala
//  provayderning so'rov shakli har xil, javobi ham har xil —
//  shuning uchun bu yerda BITTA interfeys bor va farqlar shu
//  faylda yopiladi. Robot esa qaysi model ishlayotganini
//  bilmaydi.
//
//  KALIT LOGGA TUSHMASIN. Xato matnida provayder javobi bo'ladi
//  va u ba'zan so'rovni qaytaradi — shuning uchun xato matni
//  kesiladi va kalit hech qachon `console.log` ga chiqmaydi.
//
//  Bu fayl BAZAGA TEGMAYDI: sof HTTP. Shuning uchun uni sinovdan
//  ham chaqirib ko'rish mumkin.
// =============================================================

export type Provayder = 'anthropic' | 'openai' | 'google';

export type Xabar = { rol: 'odam' | 'robot'; matn: string };

export type Natija = {
  matn: string;
  kirish_token: number;
  chiqish_token: number;
  kesh_token: number;
};

export type Sorov = {
  provayder: Provayder;
  model: string;
  kalit: string;
  tizim: string;
  xabarlar: Xabar[];
  max_token?: number;
};

/** Har provayder uchun standart model — mijoz o'zi ham kiritishi mumkin */
export const STANDART_MODEL: Record<Provayder, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  google: 'gemini-2.5-pro',
};

export const PROVAYDER_NOMI: Record<Provayder, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  google: 'Gemini (Google)',
};

/** Provayder javobidagi xatoni qisqa va tushunarli qiladi */
function xatoMatni(provayder: Provayder, holat: number, tana: string): string {
  const qisqa = tana.replace(/\s+/g, ' ').slice(0, 300);
  if (holat === 401 || holat === 403) {
    return 'Kalit qabul qilinmadi. Uni qayta ko‘chirib qo‘ying yoki obuna holatini tekshiring.';
  }
  if (holat === 404) {
    return 'Model topilmadi. Model nomini tekshiring (masalan: ' + STANDART_MODEL[provayder] + ').';
  }
  if (holat === 429) {
    return 'Provayder chegarasi: so‘rov juda ko‘p yoki hisobda mablag‘ tugagan.';
  }
  if (holat >= 500) {
    return 'Provayder javob bermayapti (' + holat + '). Birozdan keyin urinib ko‘ring.';
  }
  return `Xatolik (${holat}): ${qisqa}`;
}

export async function sora(s: Sorov): Promise<Natija> {
  const max = s.max_token ?? 1024;

  // ---------------- Anthropic ----------------
  if (s.provayder === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.kalit,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: s.model,
        max_tokens: max,
        system: s.tizim,
        messages: s.xabarlar.map((x) => ({
          role: x.rol === 'odam' ? 'user' : 'assistant',
          content: x.matn,
        })),
      }),
    });
    const tana = await r.text();
    if (!r.ok) throw new Error(xatoMatni('anthropic', r.status, tana));
    const j = JSON.parse(tana);
    return {
      matn: (j.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('\n'),
      kirish_token: j.usage?.input_tokens ?? 0,
      chiqish_token: j.usage?.output_tokens ?? 0,
      kesh_token: j.usage?.cache_read_input_tokens ?? 0,
    };
  }

  // ---------------- OpenAI ----------------
  if (s.provayder === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + s.kalit,
      },
      body: JSON.stringify({
        model: s.model,
        max_completion_tokens: max,
        messages: [
          { role: 'system', content: s.tizim },
          ...s.xabarlar.map((x) => ({
            role: x.rol === 'odam' ? 'user' : 'assistant',
            content: x.matn,
          })),
        ],
      }),
    });
    const tana = await r.text();
    if (!r.ok) throw new Error(xatoMatni('openai', r.status, tana));
    const j = JSON.parse(tana);
    return {
      matn: j.choices?.[0]?.message?.content ?? '',
      kirish_token: j.usage?.prompt_tokens ?? 0,
      chiqish_token: j.usage?.completion_tokens ?? 0,
      kesh_token: j.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
  }

  // ---------------- Google ----------------
  // Gemini'da tizim ko'rsatmasi alohida maydonda va kalit
  // sarlavhada (manzilda emas: manzil loglarga tushadi).
  const manzil =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(s.model) +
    ':generateContent';
  const r = await fetch(manzil, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': s.kalit },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: s.tizim }] },
      contents: s.xabarlar.map((x) => ({
        role: x.rol === 'odam' ? 'user' : 'model',
        parts: [{ text: x.matn }],
      })),
      generationConfig: { maxOutputTokens: max },
    }),
  });
  const tana = await r.text();
  if (!r.ok) throw new Error(xatoMatni('google', r.status, tana));
  const j = JSON.parse(tana);
  return {
    matn: (j.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('\n'),
    kirish_token: j.usageMetadata?.promptTokenCount ?? 0,
    chiqish_token: j.usageMetadata?.candidatesTokenCount ?? 0,
    kesh_token: j.usageMetadata?.cachedContentTokenCount ?? 0,
  };
}

// =============================================================
//  NARX
//
//  Faqat ANTHROPIC narxlari aniq ma'lum (2026-06-24 holati,
//  million token uchun). OpenAI va Google narxlari tez-tez
//  o'zgaradi va ularni taxmin qilib yozish — mijozga yolg'on
//  hisob ko'rsatish demak. Shuning uchun ular uchun narx 0
//  qoladi va ekranda TOKEN SONI ko'rsatiladi.
//
//  Baribir bu pul BIZDAN ketmaydi: kalit mijozniki, hisob ham
//  uniki. Bu raqam faqat «qancha ishlatdim» degan savol uchun.
// =============================================================
const NARX: Record<string, { kirish: number; chiqish: number; kesh: number }> = {
  'claude-opus-5': { kirish: 5, chiqish: 25, kesh: 0.5 },
  'claude-opus-4-8': { kirish: 5, chiqish: 25, kesh: 0.5 },
  'claude-sonnet-5': { kirish: 2, chiqish: 10, kesh: 0.2 },
  'claude-haiku-4-5': { kirish: 1, chiqish: 5, kesh: 0.1 },
};

export function narxHisobla(model: string, n: Natija): number {
  const narx = NARX[model];
  if (!narx) return 0;
  const yangiKirish = Math.max(0, n.kirish_token - n.kesh_token);
  return (
    (yangiKirish * narx.kirish + n.kesh_token * narx.kesh + n.chiqish_token * narx.chiqish) /
    1_000_000
  );
}
