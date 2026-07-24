// Admin tomonidan mijoz + login yaratish.
// Faqat admin roli chaqira oladi; parol server tomonida o'rnatiladi.
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
    const { name, phone, email, address, region, price_group_id, password, photo_path, manager_id, display_currency } = body;
    if (!name?.trim() || !phone?.trim() || !price_group_id || !password || password.length < 6) {
      return json({ error: 'MAJBURIY_MAYDONLAR: ism, telefon, tarif, parol(6+)' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Mijoz kartochkasi (chaqiruvchi adminning o'z org'iga)
    const { data: cust, error: cErr } = await admin
      .from('customers')
      .insert({
        org_id: orgId,
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address?.trim() || null,
        region: region?.trim() || null,
        price_group_id,
        photo_path: photo_path || null,
        manager_id: manager_id || null,
        display_currency: display_currency === 'USD' ? 'USD' : 'UZS',
      })
      .select('id')
      .single();
    if (cErr) return json({ error: 'MIJOZ: ' + cErr.message }, 400);

    // 2. Telefon-login auth akkaunti (ilova shu bilan kiradi)
    const loginEmail = phone.replace(/\D/g, '') + '@mijoz.ilova';
    const { error: uErr } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name.trim(), customer_id: cust.id, org_id: orgId },
    });
    if (uErr) {
      await admin.from('customers').delete().eq('id', cust.id);
      return json({ error: 'LOGIN: ' + uErr.message }, 400);
    }

    // 3. Gmail berilgan bo'lsa — taklif havolasini yuboramiz
    let invite: string = 'gmail_kiritilmagan';
    if (email?.trim()) {
      const { error: iErr } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
        data: { full_name: name.trim(), customer_id: cust.id },
      });
      invite = iErr ? 'xato: ' + iErr.message : 'yuborildi';
    }

    return json({ ok: true, customer_id: cust.id, login_phone: phone, invite });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
