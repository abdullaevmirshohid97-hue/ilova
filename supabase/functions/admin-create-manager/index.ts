// Admin tomonidan menejer + login yaratish.
// Faqat admin/super_admin chaqira oladi; parol server tomonida o'rnatiladi.
//
// KO'P TASHKILOT: menejer erkin sotuvchi — bitta telefon bilan bir necha
// korxonada ishlashi mumkin. Avval bu ishlamasdi: login emaili
// (`998...@menejer.ilova`) GLOBAL unikal, ikkinchi tashkilot
// "already been registered" olardi va endigina yaratilgan menejer
// qatorini o'chirib tashlardi.
//
// Endi hisob bor bo'lsa u QAYTA YARATILMAYDI, shu tashkilotga
// BIRIKTIRILADI: `managers` qatori + `uzvliklar` yozuvi. Menejer
// kirgandan keyin tashkilotni tanlaydi (`tashkilotni_tanla`).
//
// PAROLGA TEGILMAYDI. Aks holda ikkinchi tashkilot admini formaga
// parol yozib, begona odamning hisobini egallab olardi. Odam o'z
// eski paroli bilan kiraveradi — bu panelda ham yoziladi.
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

    // Chaqiruvchi admin ekanini tekshiramiz
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await caller.auth.getUser();
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

    const { data: prof } = await caller
      .from('profiles')
      .select('role, org_id')
      .eq('id', user.id)
      .single();
    if (!prof || !['admin', 'super_admin'].includes((prof as any).role)) {
      return json({ error: 'RUXSAT_YOQ' }, 403);
    }
    const orgId = (prof as any).org_id;
    if (!orgId) return json({ error: 'ORG_TOPILMADI' }, 400);

    const body = await req.json();
    const { name, phone, password } = body;
    if (!name?.trim() || !phone?.trim() || !password || password.length < 6) {
      return json({ error: 'MAJBURIY_MAYDONLAR: ism, telefon, parol(6+)' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const loginEmail = phone.replace(/\D/g, '') + '@menejer.ilova';

    // 1. Shu tashkilotda bu raqam allaqachon menejermi?
    //    `managers` unikali (org_id, phone) — tekshirmasak baza
    //    "duplicate key ..." deb texnik xato berardi, admin esa
    //    nima qilishini bilmasdi.
    const { data: bor } = await admin
      .from('managers')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('phone', phone.trim())
      .maybeSingle();
    if (bor) {
      return json(
        { error: `Bu raqam bu tashkilotda allaqachon menejer: ${(bor as any).name}` },
        400,
      );
    }

    // 2. Bu telefonda hisob bormi. createUser xatosiga tayanib
    //    bo'lmaydi: unga qadar menejer qatori yaratilgan bo'ladi.
    const { data: mavjudId, error: hErr } = await admin.rpc('hisob_id_email', {
      p_email: loginEmail,
    });
    if (hErr) return json({ error: 'HISOB_TEKSHIRUV: ' + hErr.message }, 400);

    // Begona rolni tortib olmaymiz: bu email menejerniki bo'lishi shart.
    // Aks holda admin boshqa rolning hisobini o'z tashkilotiga ulab
    // olardi.
    let mavjudProfil: any = null;
    if (mavjudId) {
      const { data: p } = await admin
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', mavjudId)
        .maybeSingle();
      mavjudProfil = p;
      if (!p || (p as any).role !== 'manager') {
        return json(
          {
            error:
              `Bu raqam tizimda band, lekin menejer hisobi emas ` +
              `(${(p as any)?.role ?? 'noma\'lum'}). Boshqa raqam kiriting.`,
          },
          400,
        );
      }
    }

    // 3. Menejer kartochkasi
    const { data: mgr, error: mErr } = await admin
      .from('managers')
      .insert({ org_id: orgId, name: name.trim(), phone: phone.trim() })
      .select('id')
      .single();
    if (mErr) return json({ error: 'MENEJER: ' + mErr.message }, 400);

    // 4a. Hisob bor — biriktiramiz, parolga TEGMAYMIZ
    if (mavjudId) {
      const { error: uzvErr } = await admin.from('uzvliklar').insert({
        user_id: mavjudId,
        org_id: orgId,
        manager_id: (mgr as any).id,
        role: 'manager',
        qoshgan_user_id: user.id,
      });
      if (uzvErr) {
        await admin.from('managers').delete().eq('id', (mgr as any).id);
        return json({ error: 'AZOLIK: ' + uzvErr.message }, 400);
      }
      return json({
        ok: true,
        manager_id: (mgr as any).id,
        login_phone: phone,
        mavjud_hisob: true,
        xabar:
          `Bu raqam tizimda bor edi (${mavjudProfil?.full_name || phone}) — ` +
          `mavjud hisobga ulandi. Menejer O'Z eski paroli bilan kiradi, ` +
          `siz kiritgan parol o'rnatilmadi. U kirgach tashkilotni tanlaydi.`,
      });
    }

    // 4b. Yangi hisob. `handle_new_user` profil va birinchi a'zolikni
    //     o'zi yozadi.
    const { error: uErr } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim(), manager_id: (mgr as any).id, org_id: orgId, role: 'manager' },
    });
    if (uErr) {
      await admin.from('managers').delete().eq('id', (mgr as any).id);
      return json({ error: 'LOGIN: ' + uErr.message }, 400);
    }

    return json({ ok: true, manager_id: (mgr as any).id, login_phone: phone });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
