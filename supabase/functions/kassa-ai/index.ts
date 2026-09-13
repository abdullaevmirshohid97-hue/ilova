// =============================================================
//  CREDIT DEBIT — MIJOZNING O'Z AI'si
//
//  Mijoz xohlagan modelni tanlaydi (Claude, GPT, Gemini) va o'z
//  API kalitini ulaydi. Token puli uning hisobidan ketadi —
//  bizda xarajat qolmaydi.
//
//  Ikkita amal bor:
//   · `sina`  — kalit ishlayaptimi: modelga bitta qisqa so'rov
//               yuboriladi va javob kelishi tekshiriladi;
//   · `sora`  — robotga savol (keyingi bosqichda asboblar bilan
//               kengaytiriladi).
//
//  KALIT QAYERDA: bazada shifrlangan holda. Uni faqat shu funksiya
//  `service_role` bilan ochadi (`kassa_ai_kalit_ochiq`) va DARHOL
//  provayderga yuboradi — hech qayerda saqlanmaydi, logga
//  tushmaydi va javobda qaytmaydi.
//
//  verify_jwt = TRUE: bu funksiyani ILOVA chaqiradi, ya'ni
//  foydalanuvchining Supabase sessiyasi bor.
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { narxHisobla, sora, STANDART_MODEL, type Provayder } from './provayder.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, serviceKey);

const TIZIM =
  'Sen — Credit Debit ilovasidagi hisob-kitob yordamchisisan. Qisqa va aniq ' +
  'javob ber, o‘zbek tilida. Pul summalarini ming ajratgich bilan yoz.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  try {
    // ---------- Kim so'rayapti ----------
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

    const { data: profil } = await admin
      .from('profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .maybeSingle();
    const org = (profil as { org_id?: string })?.org_id;
    if (!org) return json({ error: 'TASHKILOT_YOQ' }, 400);

    const tana = await req.json().catch(() => ({}));
    const amal = String(tana?.amal ?? 'sina');

    // ---------- Kalitni ochamiz ----------
    const { data: kalitJson } = await admin.rpc('kassa_ai_kalit_ochiq', { p_org: org });
    const kalit = kalitJson as { provayder: Provayder; model: string; kalit: string } | null;
    if (!kalit?.kalit) {
      return json(
        { error: 'KALIT_YOQ: avval «AI modeli» bo‘limida o‘z kalitingizni ulang' },
        400,
      );
    }

    // ---------- So'rovni yig'amiz ----------
    const xabarlar =
      amal === 'sina'
        ? [{ rol: 'odam' as const, matn: 'Aloqa sinovi. Faqat «TAYYOR» deb javob ber.' }]
        : [{ rol: 'odam' as const, matn: String(tana?.savol ?? '').slice(0, 2000) }];

    if (amal !== 'sina' && !String(tana?.savol ?? '').trim()) {
      return json({ error: 'SAVOL_YOQ' }, 400);
    }

    let natija;
    try {
      natija = await sora({
        provayder: kalit.provayder,
        model: kalit.model || STANDART_MODEL[kalit.provayder],
        kalit: kalit.kalit,
        tizim: TIZIM,
        xabarlar,
        max_token: amal === 'sina' ? 32 : 1024,
      });
    } catch (e) {
      const sabab = String((e as Error)?.message ?? e).slice(0, 300);
      // Natijani yozib qo'yamiz: ilova «kalit ishlamayapti» deb
      // ko'rsatsin va odam sababini bilsin.
      await admin.rpc('kassa_ai_kalit_natija', { p_org: org, p_xato: sabab });
      return json({ error: sabab }, 400);
    }

    await admin.rpc('kassa_ai_kalit_natija', { p_org: org, p_xato: null });

    // ---------- Sarfni yozamiz ----------
    // Pul mijozning hisobidan ketgan bo'lsa ham, u «qancha
    // ishlatdim?» deb ko'ra olishi kerak.
    await admin.from('kassa_ai_sarf').insert({
      org_id: org,
      model: kalit.model,
      kirish_token: natija.kirish_token,
      kesh_token: natija.kesh_token,
      chiqish_token: natija.chiqish_token,
      narx_usd: narxHisobla(kalit.model, natija),
      manba: 'robot',
    });

    return json({
      ok: true,
      javob: natija.matn,
      provayder: kalit.provayder,
      model: kalit.model,
      token: {
        kirish: natija.kirish_token,
        kesh: natija.kesh_token,
        chiqish: natija.chiqish_token,
      },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
