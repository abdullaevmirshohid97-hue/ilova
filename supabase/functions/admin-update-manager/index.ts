// Admin tomonidan menejerning login ma'lumotlarini boshqarish:
// bloklash (auth ban), parol tiklash. Ism/telefon o'zgartirish kerak bo'lsa
// keyinroq qo'shiladi — hozircha faqat shu ikkita amal yetarli.
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

const BAN_FOREVER = '876000h'; // ~100 yil — Supabase'da haqiqiy "doimiy" variant yo'q

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

    const { data: prof } = await caller
      .from('profiles')
      .select('role, org_id')
      .eq('id', user.id)
      .single();
    if (!prof || !['admin', 'super_admin'].includes((prof as any).role)) {
      return json({ error: 'RUXSAT_YOQ' }, 403);
    }
    const callerOrgId = (prof as any).org_id;

    const body = await req.json();
    const { manager_id, action } = body;
    if (!manager_id || !action) return json({ error: 'manager_id va action majburiy' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // service-role RLS'ni chetlab o'tadi — nishon menejer chaqiruvchining
    // o'z org'iga tegishli ekanini bu yerda qo'lda tekshiramiz
    const { data: targetMgr, error: targetErr } = await admin
      .from('managers')
      .select('org_id, phone, name')
      .eq('id', manager_id)
      .maybeSingle();
    if (targetErr) return json({ error: 'MENEJER: ' + targetErr.message }, 400);
    if (!targetMgr || !callerOrgId || (targetMgr as any).org_id !== callerOrgId) {
      return json({ error: 'RUXSAT_YOQ' }, 403);
    }

    const { data: linkProf, error: linkErr } = await admin
      .from('profiles')
      .select('id')
      .eq('manager_id', manager_id)
      .maybeSingle();
    if (linkErr) return json({ error: 'PROFIL: ' + linkErr.message }, 400);
    const authUserId: string | null = linkProf ? (linkProf as any).id : null;

    if (action === 'set_active') {
      const isActive = Boolean(body.is_active);
      const { error: mErr } = await admin
        .from('managers')
        .update({ is_active: isActive })
        .eq('id', manager_id);
      if (mErr) return json({ error: 'MENEJER: ' + mErr.message }, 400);

      if (authUserId) {
        await admin.auth.admin.updateUserById(authUserId, {
          ban_duration: isActive ? 'none' : BAN_FOREVER,
        });
      }
      return json({ ok: true });
    }

    if (action === 'reset_password') {
      const newPassword = String(body.new_password ?? '');
      if (newPassword.length < 6) return json({ error: "Parol kamida 6 belgi bo'lsin" }, 400);

      if (!authUserId) {
        const loginEmail = (targetMgr as any).phone.replace(/\D/g, '') + '@menejer.ilova';
        const { error: cErr } = await admin.auth.admin.createUser({
          email: loginEmail,
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            full_name: (targetMgr as any).name ?? '',
            manager_id,
            org_id: callerOrgId,
            role: 'manager',
          },
        });
        if (cErr) return json({ error: 'LOGIN: ' + cErr.message }, 400);
        return json({ ok: true, created: true });
      }

      const { error: uErr } = await admin.auth.admin.updateUserById(authUserId, {
        password: newPassword,
      });
      if (uErr) return json({ error: 'PAROL: ' + uErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'NOMALUM_ACTION: ' + action }, 400);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
