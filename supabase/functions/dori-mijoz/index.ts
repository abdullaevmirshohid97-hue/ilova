// Dori mijozini yaratish / parolini almashtirish.
//
// Nega edge funksiya: mijozga LOGIN kerak (telefon + parol), parol esa
// Supabase auth tomonida yaratiladi — buni bazadagi funksiya qila olmaydi.
//
// Login usuli Yukchibolla'dagi bilan bir xil: telefon raqamdan
// `<raqamlar>@dori.ilova` ko'rinishidagi ichki email yasaladi. Mijoz
// telefon va parol kiritadi, ilova esa shu emailga aylantirib yuboradi.
//
// XAVFSIZLIK: faqat super admin chaqira oladi — chaqiruvchining JWT'si
// tekshiriladi va profildagi roli ko'riladi. verify_jwt = TRUE.

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

const raqamlar = (s: string) => String(s ?? '').replace(/\D/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';

  // Chaqiruvchi kim?
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const {
    data: { user },
  } = await caller.auth.getUser();
  if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

  const admin = createClient(url, serviceKey);
  const { data: profil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if ((profil as any)?.role !== 'super_admin') return json({ error: 'RUXSAT_YOQ' }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_JSON' }, 400);
  }

  const amal = String(body.amal ?? 'yaratish');
  const tel = raqamlar(body.phone ?? '');
  if (tel.length < 9) return json({ error: 'TELEFON_NOTOGRI' }, 400);

  const email = `${tel}@dori.ilova`;
  const parol = String(body.password ?? '');

  try {
    // Shu telefonli auth foydalanuvchisi bormi?
    const { data: royxat } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const mavjud = (royxat?.users ?? []).find((u: any) => u.email === email);

    if (amal === 'parol') {
      if (!mavjud) return json({ error: 'LOGIN_YOQ' }, 404);
      if (parol.length < 6) return json({ error: 'PAROL_QISQA' }, 400);
      const { error } = await admin.auth.admin.updateUserById(mavjud.id, { password: parol });
      if (error) throw error;
      return json({ ok: true, email });
    }

    // ---------- yaratish ----------
    if (parol.length < 6) return json({ error: 'PAROL_QISQA' }, 400);

    let authId = mavjud?.id;
    if (!authId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: parol,
        email_confirm: true,
        user_metadata: { dori_mijoz: true, name: body.name ?? null },
      });
      if (error) throw error;
      authId = data.user?.id;
    } else {
      await admin.auth.admin.updateUserById(authId, { password: parol });
    }

    // Mijoz kartochkasi
    const { data: mavjudMijoz } = await admin
      .from('dori_customers')
      .select('id')
      .eq('phone_norm', tel.slice(-9))
      .maybeSingle();

    let mijozId = (mavjudMijoz as any)?.id as string | undefined;

    if (!mijozId) {
      const { data, error } = await admin
        .from('dori_customers')
        .insert({
          phone: body.phone,
          phone_norm: tel.slice(-9),
          name: body.name ?? null,
          pharmacy: body.pharmacy ?? null,
          address: body.address ?? null,
          note: body.note ?? null,
          auth_user_id: authId,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      mijozId = (data as any).id;
    } else {
      await admin
        .from('dori_customers')
        .update({
          name: body.name ?? null,
          pharmacy: body.pharmacy ?? null,
          address: body.address ?? null,
          auth_user_id: authId,
        })
        .eq('id', mijozId);
    }

    return json({ ok: true, id: mijozId, email });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
