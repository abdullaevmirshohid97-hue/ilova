// Ikkinchi admin (xodim) hisobini yaratish — faqat super_admin chaqira oladi.
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

    const { data: prof } = await caller.from('profiles').select('role').eq('id', user.id).single();
    if (!prof || (prof as any).role !== 'super_admin') {
      return json({ error: 'RUXSAT_YOQ: faqat super_admin xodim qo\'sha oladi' }, 403);
    }

    const body = await req.json();
    const { email, password, full_name } = body;
    if (!email?.trim() || !password || password.length < 6) {
      return json({ error: 'MAJBURIY_MAYDONLAR: email, parol(6+)' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name?.trim() || '' },
    });
    if (uErr) return json({ error: 'LOGIN: ' + uErr.message }, 400);

    const { error: profErr } = await admin
      .from('profiles')
      .update({ role: 'admin', full_name: full_name?.trim() || '' })
      .eq('id', created.user.id);
    if (profErr) return json({ error: 'ROL: ' + profErr.message }, 400);

    return json({ ok: true, email: email.trim() });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
