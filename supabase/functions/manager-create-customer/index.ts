// Menejer tomonidan O'ZIGA mijoz + login yaratish.
// Faqat 'manager' roli chaqira oladi; manager_id/org_id client'dan
// OLINMAYDI — chaqiruvchining o'z profilidan majburan olinadi (boshqa
// menejerga mijoz "yozib qo'yish" imkoni bo'lmasin uchun).
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

    const { data: prof } = await caller
      .from('profiles')
      .select('role, org_id, manager_id')
      .eq('id', user.id)
      .single();
    if (!prof || (prof as any).role !== 'manager') {
      return json({ error: 'RUXSAT_YOQ: faqat menejer chaqira oladi' }, 403);
    }
    const orgId = (prof as any).org_id;
    const managerId = (prof as any).manager_id;
    if (!orgId || !managerId) return json({ error: 'MENEJER_PROFIL_TOPILMADI' }, 400);

    const body = await req.json();
    const { name, phone, price_group_id, password, display_currency } = body;
    if (!name?.trim() || !phone?.trim() || !price_group_id || !password || password.length < 6) {
      return json({ error: 'MAJBURIY_MAYDONLAR: ism, telefon, tarif, parol(6+)' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Mijoz kartochkasi — manager_id majburan chaqiruvchining o'zi
    const { data: cust, error: cErr } = await admin
      .from('customers')
      .insert({
        org_id: orgId,
        name: name.trim(),
        phone: phone.trim(),
        price_group_id,
        manager_id: managerId,
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

    return json({ ok: true, customer_id: cust.id, login_phone: phone });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
