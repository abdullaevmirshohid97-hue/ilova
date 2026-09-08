// =============================================================
//  FAVQULODDA KIRISH — super admin tenant hisobiga kiradi
//
//  Obunachi qo'ng'iroq qiladi: «parolni unutdim», «bu yer nega
//  ishlamayapti». Super admin uning ekranini ko'ra olmasdi.
//
//  PAROL BU YERDA UMUMAN ISHLATILMAYDI. Supabase parolni bcrypt
//  hash qilib saqlaydi — ochib bo'lmaydi va bu to'g'ri. Kirish
//  bir martalik token bilan bo'ladi (`generateLink`), ya'ni
//  obunachining paroli hech kimga oshkor bo'lmaydi va o'zgarmaydi.
//
//  `generateLink` XAT YUBORMAYDI — u faqat tokenni qaytaradi.
//  Shuning uchun obunachiga «kimdir kirdi» degan xat bormaydi va
//  soxta domenli hisoblar (@mijoz.ilova) ham ishlaydi.
//
//  Ikki rejim:
//    ozi   — eshik egasining O'ZI sifatida. U ko'rgan ekranni
//            aynan ko'rish uchun («menda tugma chiqmayapti»)
//    admin — tenant ADMINI sifatida. To'liq huquq: sklad,
//            buyurtma, moliya, sozlama
//
//  Sabab kamida 10 belgi. Bu yerda ham, bazadagi cheklovda ham
//  tekshiriladi: chekka funksiya chetlab o'tilsa ham izsiz kirib
//  bo'lmaydi.
// =============================================================
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
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

    const { data: prof } = await caller
      .from('profiles').select('role, full_name').eq('id', user.id).single();
    if (!prof || (prof as any).role !== 'super_admin') {
      return json({ error: 'RUXSAT_YOQ: faqat super admin kira oladi' }, 403);
    }

    const body = await req.json();
    const orgId = String(body?.org_id ?? '');
    const eshikId = String(body?.eshik_user_id ?? '');
    const rejim = String(body?.rejim ?? 'ozi');
    const sabab = String(body?.sabab ?? '').trim();

    if (!orgId || !eshikId) return json({ error: 'TENANT_VA_ESHIK_MAJBURIY' }, 400);
    if (rejim !== 'ozi' && rejim !== 'admin') return json({ error: 'REJIM_NOTOGRI' }, 400);
    if (sabab.length < 10) {
      return json({ error: `Sabab kamida 10 ta belgi bo'lishi kerak (hozir ${sabab.length})` }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ---------- eshik ----------
    const { data: eshik } = await admin
      .from('profiles').select('id, role, full_name, org_id').eq('id', eshikId).single();
    if (!eshik) return json({ error: 'ESHIK_TOPILMADI' }, 404);

    // Eshik AYNAN shu tenantniki bo'lishi kerak. Bo'lmasa - panelda
    // ro'yxat eskirgan yoki so'rov qo'lda yasalgan; ikkalasida ham
    // boshqa tenantga kirib ketish xavfi bor.
    if ((eshik as any).org_id !== orgId) return json({ error: 'ESHIK_BOSHQA_TENANTDA' }, 403);
    if ((eshik as any).role === 'super_admin') return json({ error: 'SUPER_ADMIN_ESHIK_EMAS' }, 403);

    const { data: org } = await admin
      .from('organizations').select('id, name, owner_user_id').eq('id', orgId).single();
    if (!org) return json({ error: 'TENANT_TOPILMADI' }, 404);

    // ---------- kim sifatida kiriladi ----------
    let nishon = eshik as any;

    if (rejim === 'admin') {
      // Egasi admin bo'lsa - o'sha, aks holda tenantning istalgan
      // admini. Eng eskisi olinadi: u odatda asosiy hisob.
      const { data: adminlar } = await admin
        .from('profiles').select('id, role, full_name, org_id')
        .eq('org_id', orgId).eq('role', 'admin')
        .order('created_at', { ascending: true });
      const royxat = (adminlar ?? []) as any[];
      nishon = royxat.find((p) => p.id === (org as any).owner_user_id) ?? royxat[0];
      if (!nishon) {
        return json(
          { error: "Bu tenantda admin hisobi yo'q. Avval admin hisobi yarating." },
          400,
        );
      }
    } else if ((eshik as any).role !== 'admin' && (eshik as any).role !== 'manager') {
      // Mijoz hisobi bilan admin paneli OCHILMAYDI - App.tsx uni darhol
      // tizimdan chiqarib yuboradi. Jimgina kirgizsak, super admin bo'sh
      // ekran ko'rib "tizim buzuq" deb o'ylardi.
      return json(
        {
          error:
            "Mijoz hisobi bilan admin paneliga kirib bo'lmaydi. " +
            "«Tenant admini sifatida» rejimini tanlang.",
        },
        400,
      );
    }

    // ---------- email ----------
    const { data: nishonUser, error: uErr } = await admin.auth.admin.getUserById(nishon.id);
    const email = nishonUser?.user?.email;
    if (uErr || !email) return json({ error: "Hisobning email'i yo'q — kirib bo'lmaydi" }, 400);

    // ---------- iz ----------
    // Havoladan OLDIN yoziladi: token berilib, iz yozilmay qolishi
    // mumkin bo'lmasin. Yozuv yiqilsa kirish ham bo'lmaydi.
    const { data: sessiya, error: sErr } = await admin
      .from('admin_kirish_sessiyalari')
      .insert({
        super_admin_id: user.id,
        super_admin_nom: (prof as any).full_name ?? user.email ?? null,
        org_id: (org as any).id,
        org_nom: (org as any).name,
        eshik_user_id: (eshik as any).id,
        eshik_nom: (eshik as any).full_name ?? null,
        eshik_rol: (eshik as any).role,
        kirgan_user_id: nishon.id,
        kirgan_nom: nishon.full_name ?? null,
        kirgan_rol: nishon.role,
        rejim,
        sabab,
      })
      .select('id')
      .single();
    if (sErr) return json({ error: 'IZ_YOZILMADI: ' + sErr.message }, 400);

    // ---------- bir martalik token ----------
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (lErr) return json({ error: 'HAVOLA: ' + lErr.message }, 400);

    const props = (link as any)?.properties ?? {};
    if (!props.hashed_token) return json({ error: 'HAVOLA_BOSH' }, 500);

    return json({
      ok: true,
      sessiya_id: (sessiya as any).id,
      token_hash: props.hashed_token,
      // supabase-js versiyalari `magiclink` va `email` turlarini har xil
      // qabul qiladi - serverning o'zi aytgani ishonchliroq
      tur: props.verification_type ?? 'magiclink',
      nishon: {
        id: nishon.id,
        nom: nishon.full_name ?? email,
        rol: nishon.role,
        email,
      },
      eshik: {
        nom: (eshik as any).full_name ?? null,
        rol: (eshik as any).role,
      },
      org: { id: (org as any).id, name: (org as any).name },
      rejim,
      sabab,
    });
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
