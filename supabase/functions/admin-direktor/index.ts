// Admin tomonidan DIREKTOR (kuzatuvchi) hisobini boshqarish.
//
// Direktor korxonaning ishini ko'radi, lekin hech narsani o'zgartira
// olmaydi — huquq bazada, RLS bilan cheklangan (is_direktor()).
// Bu funksiya faqat hisob yaratadi/o'chiradi/parolini almashtiradi.
//
// Faqat admin/super_admin chaqira oladi; parol server tomonida
// o'rnatiladi va javobda hech qachon qaytarilmaydi.
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

// Direktor ham menejer kabi TELEFON bilan kiradi — korxonada hammaning
// haqiqiy emaili bo'lavermaydi. Qo'shimcha boshqa: bir odam ham menejer,
// ham direktor bo'lib qolmasin.
function loginEmail(phone: string): string {
  return phone.replace(/\D/g, '') + '@direktor.ilova';
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

    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const action = body?.action ?? 'create';

    // ---------- Ro'yxat ----------
    if (action === 'list') {
      const { data, error } = await admin
        .from('profiles')
        .select('id, full_name')
        .eq('org_id', orgId)
        .eq('role', 'director')
        .order('full_name');
      if (error) return json({ error: error.message }, 400);

      // Telefonni auth'dan olamiz: profiles'da u saqlanmaydi
      const rows = [];
      for (const p of data ?? []) {
        const { data: u } = await admin.auth.admin.getUserById(p.id);
        const email = u?.user?.email ?? '';
        rows.push({
          id: p.id,
          name: p.full_name,
          phone: email.endsWith('@direktor.ilova') ? '+' + email.split('@')[0] : email,
        });
      }
      return json({ ok: true, rows });
    }

    // Quyidagi amallar uchun direktor SHU org'niki bo'lishi shart —
    // aks holda bir tenant admini boshqasining direktorini o'chira olardi
    async function ozOrgdami(id: string): Promise<boolean> {
      const { data } = await admin
        .from('profiles')
        .select('org_id, role')
        .eq('id', id)
        .single();
      return (data as any)?.org_id === orgId && (data as any)?.role === 'director';
    }

    // ---------- Yaratish ----------
    if (action === 'create') {
      const { name, phone, password } = body;
      if (!name?.trim() || !phone?.trim() || !password || password.length < 6) {
        return json({ error: 'MAJBURIY_MAYDONLAR: ism, telefon, parol(6+)' }, 400);
      }
      if (phone.replace(/\D/g, '').length < 9) {
        return json({ error: "TELEFON_TOLIQ_EMAS" }, 400);
      }

      const { data: created, error: uErr } = await admin.auth.admin.createUser({
        email: loginEmail(phone),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name.trim(),
          org_id: orgId,
          role: 'director',
        },
      });
      if (uErr) return json({ error: 'LOGIN: ' + uErr.message }, 400);

      return json({ ok: true, id: created.user?.id, login_phone: phone });
    }

    // ---------- Parolni almashtirish ----------
    if (action === 'password') {
      const { id, password } = body;
      if (!id || !password || password.length < 6) {
        return json({ error: 'MAJBURIY_MAYDONLAR: id, parol(6+)' }, 400);
      }
      if (!(await ozOrgdami(id))) return json({ error: 'RUXSAT_YOQ' }, 403);

      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ---------- O'chirish ----------
    if (action === 'delete') {
      const { id } = body;
      if (!id) return json({ error: 'ID_YOQ' }, 400);
      if (!(await ozOrgdami(id))) return json({ error: 'RUXSAT_YOQ' }, 403);

      // profiles yozuvi auth foydalanuvchisiga bog'langan (on delete
      // cascade) — auth'dan o'chirish yetarli
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'NOMALUM_AMAL: ' + action }, 400);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
