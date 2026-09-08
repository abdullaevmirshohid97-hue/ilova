// =============================================================
//  TENANTGA HISOB YARATISH — super admin uchun
//
//  Ikki holat uchun kerak:
//
//   1. Tenantda umuman hisob yo'q. Bunday tenant «eshiksiz» —
//      super admin unga kira olmaydi va obunachi ham kira
//      olmaydi. Bazadagi `idaa print` aynan shunday turibdi.
//
//   2. Xodim yaratilgan, lekin login berilmagan
//      (`xodimlar.profile_id` bo'sh). U ishlay olmaydi.
//
//  Parol JAVOBDA bir marta qaytadi va boshqa hech qayerda
//  saqlanmaydi: Supabase uni bcrypt hash qilib qo'yadi. Super
//  admin uni obunachiga aytadi, obunachi o'zgartiradi.
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
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

    const { data: prof } = await caller.from('profiles').select('role').eq('id', user.id).single();
    if (!prof || (prof as any).role !== 'super_admin') {
      return json({ error: 'RUXSAT_YOQ: faqat super admin' }, 403);
    }

    const body = await req.json();
    const orgId = String(body?.org_id ?? '');
    const email = String(body?.email ?? '').trim().toLowerCase();
    const parol = String(body?.password ?? '');
    const nom = String(body?.full_name ?? '').trim();
    const rol = String(body?.role ?? 'admin');
    const xodimId = body?.xodim_id ? String(body.xodim_id) : null;
    const egasiMi = body?.egasi === true;

    if (!orgId) return json({ error: 'TENANT_MAJBURIY' }, 400);
    if (!email) return json({ error: 'EMAIL_MAJBURIY' }, 400);
    if (parol.length < 8) return json({ error: "Parol kamida 8 ta belgi bo'lishi kerak" }, 400);
    if (rol !== 'admin' && rol !== 'manager') return json({ error: 'ROL_NOTOGRI' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: org } = await admin
      .from('organizations').select('id, name, owner_user_id').eq('id', orgId).single();
    if (!org) return json({ error: 'TENANT_TOPILMADI' }, 404);

    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email,
      password: parol,
      email_confirm: true,
      user_metadata: { full_name: nom, role: rol, org_id: orgId },
    });
    if (uErr) {
      const m = (uErr.message ?? '').toLowerCase();
      const band = m.includes('already been registered') || m.includes('already registered') || m.includes('duplicate');
      return json(
        {
          error: band
            ? `Bu email allaqachon band: ${email}. Boshqa email kiriting.`
            : 'LOGIN: ' + uErr.message,
        },
        400,
      );
    }

    const yangiId = created!.user!.id;

    // Profil trigger orqali yaratiladi (`auth.users` ga after insert),
    // lekin org_id/rol metadata'dan to'g'ri ko'chganini KAFOLATLAMAYMIZ —
    // shuning uchun ustidan aniq yozamiz. Aks holda hisob "org'siz"
    // bo'lib qolib, panelda ko'rinmasdi.
    const { error: pErr } = await admin
      .from('profiles')
      .upsert({ id: yangiId, org_id: orgId, role: rol, full_name: nom || null }, { onConflict: 'id' });
    if (pErr) {
      await admin.auth.admin.deleteUser(yangiId);
      return json({ error: 'PROFIL: ' + pErr.message }, 400);
    }

    // Xodimga login berilyapti — bog'lab qo'yamiz
    if (xodimId) {
      const { error: xErr } = await admin
        .from('xodimlar').update({ profile_id: yangiId }).eq('id', xodimId).eq('org_id', orgId);
      if (xErr) return json({ error: 'XODIM: ' + xErr.message }, 400);
    }

    // Egasi belgilanmagan bo'lsa va bu admin bo'lsa — egasi shu bo'ladi
    if ((egasiMi || !(org as any).owner_user_id) && rol === 'admin') {
      await admin
        .from('organizations')
        .update({ owner_user_id: yangiId, owner_email: email })
        .eq('id', orgId);
    }

    return json({ ok: true, user_id: yangiId, email, password: parol, role: rol });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
