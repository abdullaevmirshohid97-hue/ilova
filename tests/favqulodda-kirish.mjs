// =============================================================
//  FAVQULODDA KIRISH — tenant kartochkasi va «eshiklar»
//
//  Bu funksiya kuchli: super admin obunachining hisobiga kirib,
//  uning hamma ma'lumotini ko'radi va tuzatadi. Shuning uchun
//  sinov ASOSAN CHEKLOVLARNI tekshiradi:
//
//   1. Sababsiz kirib bo'lmaydi — 10 belgidan qisqa sabab BAZADA
//      rad etiladi. Ekrandagi tekshiruvni chetlab o'tish mumkin,
//      bunisini yo'q.
//   2. Izni o'chirib bo'lmaydi — jadvalda select siyosati bor,
//      update/delete siyosati YO'Q.
//   3. Super admin bo'lmagan hech kim kira olmaydi — RPC ham,
//      chekka funksiya ham yopiq.
//   4. Mijoz hisobi «o'zi sifatida» eshik bo'lolmaydi: mijoz roli
//      admin paneliga umuman kira olmaydi va ekran bo'sh chiqardi.
//
//  Sinov O'Z tenantini va hisoblarini yaratadi (SINOV-ESHIK-*) va
//  oxirida o'chiradi.
//
//  Ishga tushirish:
//    node tests/favqulodda-kirish.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let K;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  console.error('\n  kodchi/kalitlar.json topilmadi — bu skript shaxsiy kompyuterda ishlaydi.\n');
  process.exit(1);
}

const URL_BASE = `https://${K.ref}.supabase.co`;

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + K.mgmt_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 400));
  return JSON.parse(t);
}

/** Super admin nomidan (RPC ichida is_super_admin() bor) */
async function admin(q) {
  const r = await sql(
    `select set_config('request.jwt.claims',
       json_build_object('sub', (select id from profiles where role = 'super_admin' limit 1))::text,
       true) as x;
     ${q}`
  );
  return r[r.length - 1];
}

async function kir(email, parol) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ email, password: parol }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.access_token ?? null;
}

async function rpc(token, nom, args) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: K.anon_key,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(args ?? {}),
  });
  return { status: r.status, body: (await r.text()).slice(0, 160) };
}

async function fn(token, slug, body) {
  const r = await fetch(`${URL_BASE}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: K.anon_key,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
}

let yiqildi = 0;
function tekshir(nom, ok, qosh) {
  console.log((ok ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (qosh !== undefined ? '  → ' + qosh : ''));
  if (!ok) yiqildi++;
}

const ORG = 'SINOV-ESHIK TENANT';
const EMAIL_A = 'sinov-eshik-admin@sinov.local';
const EMAIL_M = 'sinov-eshik-mijoz@sinov.local';

async function tozala() {
  // Iz avval o'chadi: unda org_id bor va `set null` bo'lsa ham sinov
  // yozuvi jurnalda qolib, keyingi yurishda sanoqni chalg'itardi
  await sql(`delete from admin_kirish_sessiyalari where org_nom = '${ORG}' or sabab like 'SINOV %';`);
  await sql(`delete from auth.users where email in ('${EMAIL_A}', '${EMAIL_M}');`);
  await sql(`delete from organizations where name = '${ORG}';`);
}

(async () => {
  await tozala();
  console.log('\n\x1b[1mFAVQULODDA KIRISH\x1b[0m');

  // ================================================== 0. Tayyorlash
  const [{ id: orgId }] = await sql(
    `insert into organizations (name, contact_name, contact_phone)
     values ('${ORG}', 'Sinov Egasi', '+998900000000') returning id;`
  );

  // Hisoblar. `auth.users` ga yozilganda trigger profiles qatorini o'zi
  // yasaydi — metadata'dagi rol va org_id bilan.
  //
  // TOKEN USTUNLARI BO'SH SATR BO'LISHI SHART, null emas. Auth xizmati
  // (GoTrue) ularni Go satriga o'qiydi va null'da butun so'rov HTTP 500
  // bilan yiqiladi — «generate_link» aynan shu sababdan ishlamagan edi.
  // Panelda bu muammo yo'q: u hisobni Admin API orqali yaratadi.
  async function hisob(email, rol) {
    const [{ id }] = await sql(`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        '${email}', extensions.crypt('sinov-parol-123', extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        json_build_object('full_name', 'Sinov ${rol}', 'role', '${rol}', 'org_id', '${orgId}')::jsonb,
        '', '', '', '', '', '', '', ''
      ) returning id;`);
    // Trigger metadata'ni o'qiydi, lekin unga tayanmaymiz: rol/org
    // aniq yozilsin, aks holda sinov "eshik yo'q" deb yiqilardi
    await sql(`insert into profiles (id, org_id, role, full_name)
               values ('${id}', '${orgId}', '${rol}', 'Sinov ${rol}')
               on conflict (id) do update set org_id = excluded.org_id,
                 role = excluded.role, full_name = excluded.full_name;`);
    return id;
  }

  const adminId = await hisob(EMAIL_A, 'admin');
  const mijozId = await hisob(EMAIL_M, 'customer');
  await sql(`update organizations set owner_user_id = '${adminId}' where id = '${orgId}';`);

  // ================================================== 1. SXEMA
  console.log('\n1. Sxema cheklovlari');

  const [{ n: chek }] = await sql(`
    select count(*)::int n from pg_constraint
    where conrelid = 'public.admin_kirish_sessiyalari'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) like '%sabab%';`);
  tekshir('sabab uzunligi BAZADA cheklangan', chek === 1, chek + ' ta cheklov');

  const siyosat = await sql(`
    select cmd, count(*)::int n from pg_policies
    where schemaname = 'public' and tablename = 'admin_kirish_sessiyalari'
    group by cmd;`);
  const xarita = Object.fromEntries(siyosat.map((s) => [s.cmd, s.n]));
  tekshir('o‘qish siyosati bor', (xarita.SELECT ?? 0) >= 1, JSON.stringify(xarita));
  tekshir(
    'o‘chirish/tahrirlash siyosati YO‘Q',
    !xarita.DELETE && !xarita.UPDATE && !xarita.ALL,
    'iz panel orqali tozalanmasin',
  );

  const [{ rls }] = await sql(`
    select relrowsecurity as rls from pg_class where oid = 'public.admin_kirish_sessiyalari'::regclass;`);
  tekshir('RLS yoqilgan', rls === true);

  // ================================================== 2. IZ
  console.log('\n2. Kirish izi');

  let qisqaRad = false;
  try {
    await sql(`insert into admin_kirish_sessiyalari (org_id, org_nom, rejim, sabab)
               values ('${orgId}', '${ORG}', 'ozi', 'qisqa');`);
  } catch (e) {
    qisqaRad = /sabab|check/i.test(String(e.message));
  }
  tekshir('10 belgidan qisqa sabab RAD ETILADI', qisqaRad, 'ekran chetlab o‘tilsa ham');

  await sql(`
    insert into admin_kirish_sessiyalari
      (super_admin_id, super_admin_nom, org_id, org_nom,
       eshik_user_id, eshik_nom, eshik_rol, kirgan_user_id, kirgan_nom, kirgan_rol, rejim, sabab)
    values (
      (select id from profiles where role = 'super_admin' limit 1), 'Sinov super',
      '${orgId}', '${ORG}',
      '${mijozId}', 'Sinov customer', 'customer',
      '${adminId}', 'Sinov admin', 'admin',
      'admin', 'SINOV izoh: owner parolni unutdi');`);

  const jurnal = (await admin(`select admin_kirishlar(7, 50) as j;`)).j;
  const iz = (jurnal ?? []).find((x) => x.org_nom === ORG);
  tekshir('iz jurnalga tushdi', !!iz, iz ? iz.sabab : 'topilmadi');
  tekshir('eshik va kirgan hisob alohida yozilgan',
    iz?.eshik_rol === 'customer' && iz?.kirgan_rol === 'admin',
    `${iz?.eshik_rol} → ${iz?.kirgan_rol}`);
  tekshir('rejim yozilgan', iz?.rejim === 'admin', iz?.rejim);

  // ================================================== 3. KARTOCHKA
  console.log('\n3. Tenant kartochkasi');

  const kk = (await admin(`select tenant_kartochka('${orgId}') as j;`)).j;
  tekshir('tenant ma’lumoti keldi', kk?.org?.name === ORG, kk?.org?.name);
  tekshir('owner ismi va telefoni bor',
    kk?.org?.contact_name === 'Sinov Egasi' && !!kk?.org?.contact_phone,
    `${kk?.org?.contact_name} · ${kk?.org?.contact_phone}`);

  const eshiklar = kk?.eshiklar ?? [];
  tekshir('ikkala hisob ham eshik bo‘ldi', eshiklar.length === 2, eshiklar.length + ' ta');

  const eAdmin = eshiklar.find((e) => e.role === 'admin');
  const eMijoz = eshiklar.find((e) => e.role === 'customer');
  tekshir('email ko‘rinadi', eAdmin?.email === EMAIL_A, eAdmin?.email);
  tekshir('egasi belgilangan va birinchi turadi',
    eAdmin?.egasi === true && eshiklar[0]?.role === 'admin', String(eAdmin?.egasi));
  tekshir('admin panelga kira oladi', eAdmin?.panelga_kiradi === true);
  tekshir('mijoz panelga KIRA OLMAYDI', eMijoz?.panelga_kiradi === false,
    'mijoz roli admin panelidan darhol chiqarib yuboriladi');

  // Parol hech qayerda qaytmasligi kerak — ochib ham bo'lmaydi (bcrypt),
  // lekin javobda tasodifan hash chiqib qolmasin
  const xom = JSON.stringify(kk);
  tekshir('javobda parol yoki hash yo‘q',
    !/encrypted_password|\$2[aby]\$/.test(xom), 'bcrypt hash ham chiqmaydi');

  tekshir('shu tenantga kirishlar kartochkada', (kk?.kirishlar ?? []).length === 1,
    (kk?.kirishlar ?? []).length + ' ta');

  // ================================================== 4. MEXANIZM
  //
  // Eng muhim yo'l: bir martalik token HAQIQATAN o'sha hisobning
  // sessiyasiga aylanadimi. Kod o'qish buni ko'rsatmaydi — Supabase
  // `magiclink` turini qabul qilmasa, panel bo'sh ekran berardi va
  // sabab faqat brauzerda ma'lum bo'lardi.
  console.log('\n4. Mexanizm — token sessiyaga aylanadi');

  const kalitlar = await (
    await fetch(`https://api.supabase.com/v1/projects/${K.ref}/api-keys?reveal=true`, {
      headers: { Authorization: 'Bearer ' + K.mgmt_token },
    })
  ).json();
  const maxfiy = (kalitlar ?? []).find((x) => x.type === 'secret')?.api_key;

  if (!maxfiy) {
    console.log('  \x1b[33m!\x1b[0m maxfiy kalit olinmadi — bo‘lim o‘tkazildi');
  } else {
    const g = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: maxfiy, Authorization: 'Bearer ' + maxfiy },
      body: JSON.stringify({ type: 'magiclink', email: EMAIL_A }),
    });
    const gj = await g.json().catch(() => ({}));
    tekshir('bir martalik token yaratildi', !!gj?.hashed_token, 'HTTP ' + g.status);
    tekshir('tur `magiclink`', gj?.verification_type === 'magiclink', gj?.verification_type);

    const v = await fetch(`${URL_BASE}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
      body: JSON.stringify({ type: gj?.verification_type ?? 'magiclink', token_hash: gj?.hashed_token }),
    });
    const vj = await v.json().catch(() => ({}));
    tekshir('token sessiyaga aylandi', !!vj?.access_token, 'HTTP ' + v.status);

    if (vj?.access_token) {
      const yuk = JSON.parse(Buffer.from(vj.access_token.split('.')[1], 'base64').toString());
      tekshir('sessiya AYNAN o‘sha hisobniki', yuk.sub === adminId, yuk.email);

      // Kirgan hisob o'z tenantining ma'lumotini ko'radi — favqulodda
      // kirishning butun maqsadi shu
      const kim = await rpc(vj.access_token, 'org_yonalishlarim', {});
      tekshir('kirgan hisob o‘z tenantida ishlaydi', kim.status === 200, 'HTTP ' + kim.status);

      // Va super admin funksiyalari unga baribir YOPIQ: impersonatsiya
      // huquq bermaydi, u faqat o'sha odamning huquqini beradi
      const yopiq = await rpc(vj.access_token, 'admin_kirishlar', { p_days: 7, p_limit: 5 });
      tekshir('kirgan hisob super admin funksiyasini ocholmaydi',
        yopiq.status >= 400 || /RUXSAT_YOQ/.test(yopiq.body), 'HTTP ' + yopiq.status);
    }

    // Token BIR MARTALIK: ikkinchi marta ishlatilmasin
    const v2 = await fetch(`${URL_BASE}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
      body: JSON.stringify({ type: gj?.verification_type ?? 'magiclink', token_hash: gj?.hashed_token }),
    });
    tekshir('token ikkinchi marta ishlamaydi', v2.status >= 400, 'HTTP ' + v2.status);
  }

  // ================================================== 5. RUXSAT (SQL)
  console.log('\n5. Ruxsat — baza');

  for (const chaqiruv of [`tenant_kartochka('${orgId}')`, 'admin_kirishlar(7, 10)']) {
    let radMi = false;
    try {
      await sql(
        `select set_config('request.jwt.claims',
           json_build_object('sub', (select id from profiles where role <> 'super_admin' limit 1))::text,
           true) as x;
         select ${chaqiruv} as j;`
      );
    } catch (e) {
      radMi = /RUXSAT_YOQ/.test(String(e.message));
    }
    tekshir('super admin bo‘lmaganga yopiq: ' + chaqiruv.split('(')[0], radMi);
  }

  // ================================================== 6. RUXSAT (HTTP)
  console.log('\n6. Ruxsat — HTTP');

  const rad = (r) => r.status >= 400 || /RUXSAT_YOQ/.test(r.body);

  for (const nom of ['tenant_kartochka', 'admin_kirishlar']) {
    const r = await rpc(null, nom, nom === 'tenant_kartochka' ? { p_org_id: orgId } : { p_days: 7 });
    tekshir('anon → ' + nom, rad(r), 'HTTP ' + r.status);
  }

  const tokensiz = await fn(null, 'super-admin-kirish', {});
  tekshir('chekka funksiya tokensiz yopiq', tokensiz.status === 401 || tokensiz.status === 403,
    'HTTP ' + tokensiz.status);

  // Tenant admini — super admin EMAS. U boshqa tenantga (yoki o'ziga)
  // kira olmasligi kerak: aks holda har admin butun platformani ochardi.
  const adminToken = await kir(K.admin?.email ?? '', K.admin?.password ?? '');
  if (!adminToken) {
    console.log('  \x1b[33m!\x1b[0m tenant admini bilan kirib bo‘lmadi — bo‘lim o‘tkazildi');
  } else {
    const r1 = await fn(adminToken, 'super-admin-kirish', {
      org_id: orgId, eshik_user_id: adminId, rejim: 'admin', sabab: 'SINOV izoh uzunligi yetarli',
    });
    tekshir('tenant admini kira olmaydi', r1.status === 403, 'HTTP ' + r1.status);

    const r2 = await fn(adminToken, 'super-admin-hisob', {
      org_id: orgId, email: 'yolgon@sinov.local', password: 'parol12345', full_name: 'X', role: 'admin',
    });
    tekshir('tenant admini hisob yarata olmaydi', r2.status === 403, 'HTTP ' + r2.status);

    const r3 = await rpc(adminToken, 'tenant_kartochka', { p_org_id: orgId });
    tekshir('tenant admini kartochkani ko‘rmaydi', rad(r3), 'HTTP ' + r3.status);

    // Iz yozilmaganini tasdiqlaymiz: rad etilgan urinish jurnalni
    // ifloslantirmasligi kerak
    const [{ n: izlar }] = await sql(
      `select count(*)::int n from admin_kirish_sessiyalari where org_id = '${orgId}';`
    );
    tekshir('rad etilgan urinishdan iz qolmadi', izlar === 1, izlar + ' ta iz');
  }

  // ================================================== 7. TOZALASH
  await tozala();
  const [{ n: qoldi }] = await sql(
    `select (select count(*) from organizations where name = '${ORG}')
          + (select count(*) from auth.users where email in ('${EMAIL_A}', '${EMAIL_M}'))
          + (select count(*) from admin_kirish_sessiyalari where org_nom = '${ORG}') as n;`
  );
  tekshir('sinov ma’lumoti o‘zidan keyin tozalandi', Number(qoldi) === 0, qoldi + ' qator qoldi');

  console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
  process.exit(yiqildi === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\n\x1b[31mSINOV YIQILDI:\x1b[0m ' + e.message + '\n');
  try { await tozala(); } catch { /* qo'lda o'chiriladi */ }
  process.exit(1);
});
