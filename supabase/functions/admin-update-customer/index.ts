// Admin tomonidan mijozning MAXFIY/LOGIN ma'lumotlarini o'zgartirish:
// telefon (login-email ham o'zgaradi), bloklash (auth ban), parol tiklash.
// Oddiy maydonlar (ism, manzil...) to'g'ridan-to'g'ri jadvaldan tahrirlanadi — bu yerga kerak emas.
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
      .select('role')
      .eq('id', user.id)
      .single();
    if (!prof || !['admin', 'super_admin'].includes((prof as any).role)) {
      return json({ error: 'RUXSAT_YOQ' }, 403);
    }

    const body = await req.json();
    const { customer_id, action } = body;
    if (!customer_id || !action) return json({ error: 'customer_id va action majburiy' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Mijozga bog'langan auth foydalanuvchisini topamiz (profiles orqali)
    const { data: linkProf, error: linkErr } = await admin
      .from('profiles')
      .select('id')
      .eq('customer_id', customer_id)
      .maybeSingle();
    if (linkErr) return json({ error: 'PROFIL: ' + linkErr.message }, 400);
    const authUserId: string | null = (linkProf as any)?.id ?? null;

    if (action === 'change_phone') {
      const newPhone = String(body.phone ?? '').trim();
      if (newPhone.replace(/\D/g, '').length < 12) {
        return json({ error: "Telefon raqam to'liq emas" }, 400);
      }
      const newLoginEmail = newPhone.replace(/\D/g, '') + '@mijoz.ilova';

      if (authUserId) {
        const { error: uErr } = await admin.auth.admin.updateUserById(authUserId, {
          email: newLoginEmail,
          email_confirm: true,
        });
        if (uErr) return json({ error: 'LOGIN: ' + uErr.message }, 400);
      }

      const { error: cErr } = await admin
        .from('customers')
        .update({ phone: newPhone })
        .eq('id', customer_id);
      if (cErr) {
        // Auth email allaqachon o'zgargan bo'lsa — orqaga qaytarib qo'yamiz
        if (authUserId) {
          const { data: oldCust } = await admin
            .from('customers')
            .select('phone')
            .eq('id', customer_id)
            .single();
          if (oldCust) {
            await admin.auth.admin.updateUserById(authUserId, {
              email: (oldCust as any).phone.replace(/\D/g, '') + '@mijoz.ilova',
            });
          }
        }
        return json({ error: 'MIJOZ: ' + cErr.message }, 400);
      }

      return json({ ok: true });
    }

    if (action === 'set_active') {
      const isActive = Boolean(body.is_active);
      const { error: cErr } = await admin
        .from('customers')
        .update({ is_active: isActive })
        .eq('id', customer_id);
      if (cErr) return json({ error: 'MIJOZ: ' + cErr.message }, 400);

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
      if (!authUserId) return json({ error: 'MIJOZNING LOGIN AKKAUNTI TOPILMADI' }, 400);

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
