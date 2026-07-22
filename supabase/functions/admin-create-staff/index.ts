// Ikkinchi admin (xodim) hisobini yaratish — tenant o'z ichida qo'shadi.
// Faqat 'admin' chaqira oladi (super_admin emas — u tenant'ga tegishli emas,
// yangi tenant ochish uchun super-admin-create-org bor).
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

    const { data: prof } = await caller.from('profiles').select('role, org_id').eq('id', user.id).single();
    if (!prof || (prof as any).role !== 'admin') {
      return json({ error: "RUXSAT_YOQ: faqat tenant admin xodim qo'sha oladi" }, 403);
    }
    const orgId = (prof as any).org_id;
    if (!orgId) return json({ error: 'ORG_TOPILMADI' }, 400);

    const body = await req.json();
    const { email, password, full_name } = body;
    if (!email?.trim() || !password || password.length < 6) {
      return json({ error: 'MAJBURIY_MAYDONLAR: email, parol(6+)' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    // role va org_id metadata orqali darhol o'rnatiladi — follow-up UPDATE shart emas
    const { error: uErr } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name?.trim() || '', role: 'admin', org_id: orgId },
    });
    if (uErr) return json({ error: 'LOGIN: ' + uErr.message }, 400);

    return json({ ok: true, email: email.trim() });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
