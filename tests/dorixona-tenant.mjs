// =============================================================
//  DORIXONA — ALOHIDA BIZNES (TENANT)
//
//  Dorixona super admin konsolining ichida turardi. Endi u
//  boshqa tenantlar bilan bir qatorda turadigan biznes.
//
//  Bu ko'chirish 71 ta funksiya va 26 ta RLS siyosatiga tegdi —
//  ular `is_super_admin()` o'rniga `dori_ruxsat()` ni chaqiradi.
//  Shuning uchun sinov UCH narsani tekshiradi:
//
//   1. ALMASHTIRISH TO'LIQ. Bitta funksiya yoki siyosat eski
//      tekshiruvda qolsa, dorixona admini uni ocholmaydi va
//      buni faqat foydalanuvchi topardi.
//
//   2. RUXSAT AYNAN KERAKLI ODAMDA. Dorixona tenantining admini
//      kiradi; BOSHQA tenant admini, menejer, mijoz va anon —
//      yo'q. Bu loyihada tenantlararo sizish uch marta shunday
//      joydan chiqqan.
//
//   3. KENGAYTIRISH, TORAYTIRISH EMAS. `dori_ruxsat()` ichida
//      `is_super_admin()` bor, ya'ni avval o'tgan chaqiruv keyin
//      ham o'tadi. Telegram botlari (ular `auth.uid()` null
//      bilan keladi) sinmasligi shunga bog'liq.
//
//  Ishga tushirish:
//    node tests/dorixona-tenant.mjs
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

let yiqildi = 0;
function tekshir(nom, ok, qosh) {
  console.log((ok ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (qosh !== undefined ? '  → ' + qosh : ''));
  if (!ok) yiqildi++;
}

(async () => {
  console.log('\n\x1b[1mDORIXONA — ALOHIDA BIZNES\x1b[0m');

  // ================================================== 1. BOG'LANISH
  console.log('\n1. Dorixona qaysi tenantniki');

  const [bog] = await sql(`
    select s.org_id, o.name, o.yonalishlar::text as yonalishlar
    from dori_settings s left join organizations o on o.id = s.org_id;`);
  tekshir('dori_settings.org_id belgilangan', !!bog?.org_id, bog?.name ?? 'BO‘SH');
  tekshir(
    'o‘sha tenantda «dorixona» yo‘nalishi bor',
    String(bog?.yonalishlar ?? '').includes('dorixona'),
    bog?.yonalishlar,
    // Yo'nalish berilmagan bo'lsa tenant paneli dorixonani ko'rsatmaydi:
    // ruxsat bor, eshik yo'q
  );

  // ================================================== 2. ALMASHTIRISH
  console.log('\n2. Almashtirish to‘liqmi');

  const [q] = await sql(`
    select
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'dori%'
          and p.proname not in ('dori_ruxsat', 'dori_ruxsat_uid')
          and pg_get_functiondef(p.oid) like '%is_super_admin()%')::int as eski_funksiya,
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'dori%'
          and pg_get_functiondef(p.oid) like '%dori_ruxsat()%')::int as yangi_funksiya,
      (select count(*) from pg_policies where schemaname = 'public'
        and tablename like 'dori%' and coalesce(qual, '') like '%is_super_admin%')::int as eski_siyosat,
      (select count(*) from pg_policies where schemaname = 'public'
        and tablename like 'dori%' and coalesce(qual, '') like '%dori_ruxsat%')::int as yangi_siyosat;`);

  tekshir('eski tekshiruvli funksiya qolmadi', q.eski_funksiya === 0, q.eski_funksiya + ' ta');
  tekshir('funksiyalar yangi tekshiruvda', q.yangi_funksiya >= 70, q.yangi_funksiya + ' ta');
  tekshir('eski tekshiruvli siyosat qolmadi', q.eski_siyosat === 0, q.eski_siyosat + ' ta');
  tekshir('siyosatlar yangi tekshiruvda', q.yangi_siyosat >= 26, q.yangi_siyosat + ' ta');

  // Har dori jadvalida RLS yoqiq turishi kerak — ko'chirish paytida
  // biror jadvalning himoyasi tushib qolmasin
  const [{ n: rlssiz }] = await sql(`
    select count(*)::int n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname like 'dori%' and c.relkind = 'r'
      and not c.relrowsecurity;`);
  tekshir('hamma dori jadvalida RLS yoqiq', rlssiz === 0, rlssiz + ' ta himoyasiz');

  // ================================================== 3. RUXSAT MATRITSASI
  console.log('\n3. Kim kira oladi');

  async function ruxsat(shart) {
    const r = await sql(`
      select coalesce((
        select dori_ruxsat() from (
          select set_config('request.jwt.claims',
            json_build_object('sub', (${shart}))::text, true)
        ) _
      ), false) as j;`);
    return r[r.length - 1].j;
  }

  const dorixonaAdmin = `select p.id from profiles p where p.role = 'admin'
     and p.org_id = (select org_id from dori_settings) limit 1`;
  const begonaAdmin = `select p.id from profiles p where p.role = 'admin'
     and p.org_id is distinct from (select org_id from dori_settings) limit 1`;
  const menejer = `select p.id from profiles p where p.role = 'manager' limit 1`;
  const mijoz = `select p.id from profiles p where p.role = 'customer' limit 1`;
  const superAdmin = `select id from profiles where role = 'super_admin' limit 1`;

  tekshir('super admin — ha', (await ruxsat(superAdmin)) === true);
  tekshir('dorixona tenantining admini — ha', (await ruxsat(dorixonaAdmin)) === true);
  tekshir('BOSHQA tenant admini — yo‘q', (await ruxsat(begonaAdmin)) === false,
    'tenantlararo sizish shu yerdan chiqardi');
  tekshir('menejer — yo‘q', (await ruxsat(menejer)) === false);
  tekshir('mijoz — yo‘q', (await ruxsat(mijoz)) === false);

  // ================================================== 4. KENGAYTIRISH
  console.log('\n4. Kengaytirish, toraytirish emas');

  // `dori_ruxsat()` ichida `is_super_admin()` turishi SHART: shu sababdan
  // avval o'tgan har bir chaqiruv keyin ham o'tadi va botlar sinmaydi
  const [{ d }] = await sql(
    `select pg_get_functiondef('public.dori_ruxsat()'::regprocedure) d;`
  );
  tekshir('dori_ruxsat() ichida is_super_admin() bor', /is_super_admin\(\)/.test(d),
    'aks holda super admin dorixonadan chiqib qolardi');

  // Bot va cron `auth.uid()` null bilan keladi — ular uchun javob
  // AVVALGIDEK false bo'lishi kerak (ular boshqa yo'ldan o'tadi)
  const [{ j: uidsiz }] = await sql(
    `select coalesce((select dori_ruxsat() from (select set_config('request.jwt.claims','', true)) _), false) as j;`
  );
  tekshir('uid‘siz chaqiruvda javob o‘zgarmadi', uidsiz === false, String(uidsiz));

  // ================================================== 5. GRANT
  console.log('\n5. Chaqirish huquqi');

  const [g] = await sql(`
    select
      has_function_privilege('anon', 'public.dori_ruxsat()', 'execute') as anon_ruxsat,
      has_function_privilege('authenticated', 'public.dori_ruxsat()', 'execute') as auth_ruxsat,
      has_function_privilege('anon', 'public.dori_ruxsat_uid(uuid)', 'execute') as anon_uid,
      has_function_privilege('authenticated', 'public.dori_ruxsat_uid(uuid)', 'execute') as auth_uid,
      has_function_privilege('service_role', 'public.dori_ruxsat_uid(uuid)', 'execute') as srv_uid;`);
  tekshir('anon dori_ruxsat() ni chaqirolmaydi', g.anon_ruxsat === false);
  tekshir('kirgan foydalanuvchi chaqira oladi', g.auth_ruxsat === true);
  tekshir('dori_ruxsat_uid faqat service_role ga ochiq',
    g.anon_uid === false && g.auth_uid === false && g.srv_uid === true,
    'aks holda har kim boshqa odamning rolini sinab bilardi');

  // ================================================== 6. HTTP
  console.log('\n6. HTTP — begona tenant admini');

  const token = await kir(K.admin?.email ?? '', K.admin?.password ?? '');
  if (!token) {
    console.log('  \x1b[33m!\x1b[0m tenant admini bilan kirib bo‘lmadi — bo‘lim o‘tkazildi');
  } else {
    // K.admin dorixona tenantiniki EMASLIGIGA ishonch hosil qilamiz,
    // aks holda sinov hech narsani tekshirmayotgan bo'lardi
    const [{ begona }] = await sql(`
      select (p.org_id is distinct from (select org_id from dori_settings)) as begona
      from profiles p where p.id = (select id from auth.users where email = '${K.admin.email}');`);
    tekshir('sinov hisobi dorixona tenantiniki emas', begona === true, K.admin.email);

    for (const [nom, args] of [
      ['dori_skladlar', {}],
      ['dori_sotuvlar', { p_limit: 5 }],
      ['dori_katalog_royxat', { p_warehouse_id: null, p_q: null, p_offset: 0, p_limit: 5 }],
      ['dori_narx_solishtir', { p_q: null, p_faqat_umumiy: true, p_saralash: 'nom', p_offset: 0, p_limit: 5 }],
    ]) {
      const r = await rpc(token, nom, args);
      tekshir('begona admin → ' + nom, r.status >= 400 || /RUXSAT_YOQ/.test(r.body), 'HTTP ' + r.status);
    }
  }

  // ================================================== 7. EKRAN
  console.log('\n7. Ekran — modullar ko‘chdimi');

  // Ro'yxatlarning O'ZI (super admin konsolida dori qolmagani, tenant
  // yo'nalishida yettala modul borligi) `panel-yonalish.mjs` da
  // tekshiriladi — bir tekshiruv ikki faylda tursa, biri o'zgarganda
  // ikkinchisi eskirib yolg'on xato beradi.
  //
  // Bu yerda faqat ULANISH: ekranlar haqiqatan ochiladimi.
  const app = readFileSync(join(ROOT, 'apps/admin/src/App.tsx'), 'utf8');

  tekshir('tenant panelida dorixona marshrutlari bor',
    /path="\/dori\/sotuv"/.test(app) && /DorixonaQobiq/.test(app));
  tekshir('dorixona ekranlari o‘z qobig‘ida chiziladi',
    /ochiq\.key === 'dorixona'/.test(app),
    'konsol ranglari qolgan sahifalarga tegmasin');

  // Qobiqsiz ekran ochilsa hamma rang aniqlanmagan bo'lib qolardi —
  // buni faqat ko'z bilan sezish mumkin edi
  const qobiq = readFileSync(join(ROOT, 'apps/admin/src/components/DorixonaQobiq.tsx'), 'utf8');
  tekshir('qobiq tema CSS‘ini ulaydi', /temaCssniUlash/.test(qobiq));
  tekshir('tema atributi faqat qobiqda', /data-sa-tema=\{temaniOl\(\)\}/.test(qobiq),
    'butun sahifaga qo‘yilsa qolgan ekranlar ham qorayardi');

  console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
  process.exit(yiqildi === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n\x1b[31mSINOV YIQILDI:\x1b[0m ' + e.message + '\n');
  process.exit(1);
});
