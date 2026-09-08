// Yangi tenant (biznes) yaratish — faqat super_admin chaqira oladi.
// organizations qatori + birinchi admin login'ini bir vaqtda yaratadi.
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
      return json({ error: "RUXSAT_YOQ: faqat super_admin yangi tenant yarata oladi" }, 403);
    }

    const body = await req.json();
    const {
      org_name, contact_name, contact_phone, owner_email,
      admin_email, admin_password, admin_full_name, yonalishlar,
    } = body;

    // OWNER majburiy bo'ldi. Avval faqat tenant nomi va admin emaili
    // talab qilinardi — natijada bazada egasi noma'lum tenantlar paydo
    // bo'ldi va favqulodda holatda kimga qo'ng'iroq qilishni bilib
    // bo'lmasdi.
    if (!org_name?.trim()) return json({ error: 'Biznes nomi majburiy' }, 400);
    if (!contact_name?.trim()) return json({ error: 'Owner ismi majburiy' }, 400);
    if (!contact_phone?.trim()) return json({ error: 'Owner telefoni majburiy' }, 400);
    if (!admin_full_name?.trim()) return json({ error: 'Admin ism-familyasi majburiy' }, 400);
    if (!admin_email?.trim()) return json({ error: 'Admin email majburiy' }, 400);
    // 6 emas, 8: sakkiz belgi hozirgi eng kam talab
    if (!admin_password || admin_password.length < 8) {
      return json({ error: "Parol kamida 8 ta belgi bo'lishi kerak" }, 400);
    }
    if (!Array.isArray(yonalishlar) || yonalishlar.length === 0) {
      return json({ error: "Kamida bitta yo'nalish tanlang" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Tenant (organizations qatori)
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({
        name: org_name.trim(),
        contact_name: contact_name.trim(),
        contact_phone: contact_phone.trim(),
        owner_email: owner_email?.trim()?.toLowerCase() || null,
        // Tenant qaysi tizimda ishlashi. Yuborilmasa - ulgurji savdo:
        // hozircha to'liq qurilgan yagona tizim shu.
        yonalishlar: Array.isArray(yonalishlar) && yonalishlar.length ? yonalishlar : ['b2b'],
      })
      .select('id')
      .single();
    if (orgErr) return json({ error: 'TENANT: ' + orgErr.message }, 400);

    // 2. Birinchi admin login'i — role va org_id metadata orqali darhol o'rnatiladi
    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email: admin_email.trim(),
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: admin_full_name?.trim() || '', role: 'admin', org_id: org.id },
    });
    if (uErr) {
      await admin.from('organizations').delete().eq('id', org.id);
      // Eng ko'p uchraydigan holat - email allaqachon band. Supabase buni
      // ingliz tilida va texnik atama bilan aytadi; panelda odam nima
      // qilishini bilishi uchun sababni ochiq yozamiz.
      const m = (uErr.message ?? '').toLowerCase();
      const band = m.includes('already been registered') || m.includes('already registered') || m.includes('duplicate');
      return json(
        {
          error: band
            ? `Bu email allaqachon band: ${admin_email.trim()}. Boshqa email kiriting yoki eski hisobni o'chiring.`
            : 'LOGIN: ' + uErr.message,
        },
        400,
      );
    }

    // Birinchi admin — tenantning EGASI. Alohida rol emas, ko'rsatkich:
    // kartochkada birinchi turadi va «tenant admini sifatida» kirishda
    // aynan shu hisob tanlanadi.
    await admin
      .from('organizations')
      .update({ owner_user_id: created?.user?.id ?? null })
      .eq('id', org.id);

    return json({ ok: true, org_id: org.id, admin_email: admin_email.trim() });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
