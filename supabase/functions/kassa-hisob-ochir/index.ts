// =============================================================
//  CREDIT DEBIT — HISOBNI BUTUNLAY O'CHIRISH
//
//  Google Play talabi: ilova ichida va veb orqali foydalanuvchi o'z
//  hisobini va ma'lumotini o'chira olishi SHART. Busiz ilova do'konga
//  qabul qilinmaydi.
//
//  Bu — loyihadagi eng xavfli chekka funksiya: u ma'lumotni butunlay
//  yo'q qiladi va qaytarib bo'lmaydi. Shuning uchun to'rt qavat
//  chegara qo'yilgan:
//
//   1. FAQAT O'ZINI. Foydalanuvchi id'si tanadan olinmaydi — JWT dan
//      olinadi. Boshqa odamning id'sini yuborib bo'lmaydi.
//   2. FAQAT `kassa` TENANTI. Tashkilotning yo'nalishlari orasida
//      `kassa` bo'lishi shart. B2B zavodi yoki dorixona tenanti
//      shu yo'l bilan o'chirilmaydi — u yerda o'nlab odam ishlaydi.
//   3. FAQAT YAKKA HISOB. Tashkilotda boshqa profil bo'lsa — rad
//      etiladi: bir xodim butun korxonani o'chirib yuborolmasin.
//   4. TASDIQ MATNI. Ilova `tasdiq: "OCHIRISH"` yuborishi kerak —
//      tasodifiy so'rov o'tib ketmasin.
//
//  O'CHIRISH TARTIBI MUHIM (sinovda ushlangan): `profiles.org_id`
//  FK'sida kaskad YO'Q, ya'ni profil turgan tashkilotni o'chirib
//  bo'lmaydi — so'rov jimgina yiqiladi va tashkilot yetim qoladi.
//  To'g'ri ketma-ketlik: auth.users -> uzvliklar -> organizations
//  (kassa_* jadvallar tashkilot bilan kaskadda ketadi).
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

    const tana = await req.json().catch(() => ({}));
    if (tana?.tasdiq !== 'OCHIRISH') {
      return json({ error: 'TASDIQ_YOQ: tasdiq matni yuborilmadi' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ---------- Kim va qayerda ----------
    const { data: profil } = await admin
      .from('profiles')
      .select('id, role, org_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profil) {
      // Profil yo'q: ro'yxatdan o'tish ikkinchi qadamga yetmagan.
      // Bunday holatda o'chiriladigan ma'lumot ham yo'q — faqat
      // auth yozuvini olib tashlaymiz.
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) return json({ error: 'AUTH_OCHMADI: ' + error.message }, 500);
      return json({ ok: true, ochirildi: { tashkilot: null, yozuvlar: 0 } });
    }

    const orgId = (profil as { org_id: string | null }).org_id;
    if (!orgId) return json({ error: 'TASHKILOT_YOQ' }, 400);

    const { data: org } = await admin
      .from('organizations')
      .select('id, name, yonalishlar')
      .eq('id', orgId)
      .maybeSingle();
    if (!org) return json({ error: 'TASHKILOT_TOPILMADI' }, 404);

    const yonalishlar = ((org as { yonalishlar: string[] }).yonalishlar ?? []);
    if (!yonalishlar.includes('kassa')) {
      return json(
        { error: "RUXSAT_YOQ: bu tashkilot Credit Debit tenanti emas — o'chirish administrator orqali" },
        403,
      );
    }

    // Tashkilotda boshqa odam bormi
    const { count: profilSoni } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    if ((profilSoni ?? 0) > 1) {
      return json(
        { error: "RUXSAT_YOQ: tashkilotda boshqa foydalanuvchilar bor, yakka hisob emas" },
        403,
      );
    }

    // ---------- Nima yo'qolishini sanab qo'yamiz (javobda ko'rsatiladi) ----------
    const { count: yozuvSoni } = await admin
      .from('kassa_yozuvlar')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);

    // ---------- O'chirish ----------
    // 1) auth foydalanuvchisi — `profiles` kaskad bilan ketadi
    const { error: authXato } = await admin.auth.admin.deleteUser(user.id);
    if (authXato) return json({ error: 'AUTH_OCHMADI: ' + authXato.message }, 500);

    // 2) a'zoliklar (organizations ga FK bor, kaskad yo'q)
    await admin.from('uzvliklar').delete().eq('org_id', orgId);

    // 3) tashkilot — kassa_hisoblar / turkumlar / klientlar / yozuvlar
    //    shu yerda kaskad bilan ketadi
    const { error: orgXato } = await admin.from('organizations').delete().eq('id', orgId);
    if (orgXato) {
      // Auth allaqachon o'chgan, ya'ni odam qaytib kira olmaydi —
      // lekin ma'lumot qolib ketdi. Buni JIM qoldirmaymiz.
      return json(
        {
          error: 'YARIM_OCHDI: hisob o‘chdi, lekin ma’lumot qoldi — qo‘llab-quvvatlashga murojaat qiling',
          tafsilot: orgXato.message,
          org_id: orgId,
        },
        500,
      );
    }

    return json({
      ok: true,
      ochirildi: {
        tashkilot: (org as { name: string }).name,
        yozuvlar: yozuvSoni ?? 0,
      },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
