// Sklad xodimiga LOGIN yaratadi (email + parol).
//
// Nega edge funksiya: auth foydalanuvchisini yaratish service_role
// talab qiladi, uni esa brauzerga berib bo'lmaydi.
//
// XAVFSIZLIK:
//   * verify_jwt = TRUE — darvoza yaroqsiz tokenni o'tkazmaydi
//   * ustiga chaqiruvchi SUPER ADMIN ekani tekshiriladi
//   * yaratilgan foydalanuvchi metama'lumotida sklad_user = true:
//     handle_new_user unga profil ochmaydi, ya'ni u admin panelga
//     kira olmaydi. Uning yagona huquqi - o'z skladi.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'content-type, authorization, apikey, x-client-info, x-supabase-api-version',
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // ---------- chaqiruvchi super adminmi ----------
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!auth) return json({ error: 'TOKEN_YOQ' }, 401);

  const { data: u } = await supabase.auth.getUser(auth);
  const uid = u?.user?.id;
  if (!uid) return json({ error: 'RUXSAT_YOQ' }, 403);

  const { data: p } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', uid)
    .maybeSingle();
  if ((p as any)?.role !== 'super_admin') return json({ error: 'RUXSAT_YOQ' }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'BAD_JSON' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const parol = String(body.parol ?? '');
  const warehouseId = String(body.warehouse_id ?? '');
  const fullName = body.full_name ? String(body.full_name).trim() : null;

  if (!email.includes('@')) return json({ error: 'EMAIL_NOTOGRI' }, 400);
  if (parol.length < 8) return json({ error: 'PAROL_QISQA' }, 400);
  if (!warehouseId) return json({ error: 'SKLAD_YOQ' }, 400);

  const { data: wh } = await supabase
    .from('dori_warehouses')
    .select('id, name')
    .eq('id', warehouseId)
    .maybeSingle();
  if (!wh) return json({ error: 'SKLAD_TOPILMADI' }, 404);

  // ---------- auth foydalanuvchisi ----------
  let userId: string | null = null;

  const { data: yaratildi, error: xato } = await supabase.auth.admin.createUser({
    email,
    password: parol,
    email_confirm: true,
    user_metadata: { sklad_user: true, warehouse_id: warehouseId, full_name: fullName },
  });

  if (xato) {
    // Email allaqachon bor bo'lsa - parolni yangilaymiz va bog'laymiz.
    // Bu ataylab: super admin xodimning parolini tiklay olishi kerak.
    const { data: royxat } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const bor = royxat?.users?.find((x: any) => (x.email ?? '').toLowerCase() === email);
    if (!bor) return json({ error: xato.message }, 400);

    userId = bor.id;
    await supabase.auth.admin.updateUserById(userId, {
      password: parol,
      user_metadata: { ...(bor.user_metadata ?? {}), sklad_user: true, warehouse_id: warehouseId },
    });
  } else {
    userId = yaratildi?.user?.id ?? null;
  }

  if (!userId) return json({ error: 'YARATILMADI' }, 500);

  // ---------- sklad bilan bog'lash ----------
  const { error: xato2 } = await supabase
    .from('dori_warehouse_users')
    .upsert(
      {
        warehouse_id: warehouseId,
        email,
        user_id: userId,
        full_name: fullName,
        is_active: true,
        created_by: uid,
      },
      { onConflict: 'email' }
    );

  if (xato2) return json({ error: xato2.message }, 500);

  return json({ ok: true, user_id: userId, sklad: (wh as any).name });
});
