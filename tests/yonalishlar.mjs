// =============================================================
//  YO'NALISHLAR SINOVI
//
//  Tenant qaysi tizimni ko'rishi shu yerda hal bo'ladi. Ikki xavf bor:
//
//   1) Tenant o'ziga qo'shimcha tizim qo'shib olishi. Panelda tugma
//      yo'q, lekin RPC to'g'ridan-to'g'ri chaqirilsa? Shuni bosib
//      ko'ramiz - haqiqiy mijoz/tenant hisobi bilan.
//
//   2) Nomlar ikki joyda alohida yozilgani uchun ajralib ketishi:
//      bazadagi ruxsat etilgan kalitlar (check constraint) va
//      paneldagi ro'yxat (lib/yonalishlar.ts). Ajralsa - tenantga
//      berilgan yo'nalish panelda umuman ko'rinmaydi.
//
//  Ishga tushirish:  node tests/yonalishlar.mjs
// =============================================================

import { readdirSync, readFileSync } from 'node:fs';
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

const URL = `https://${K.ref}.supabase.co`;
const MGMT = 'https://api.supabase.com/v1/projects/' + K.ref + '/database/query';

async function sql(q) {
  const r = await fetch(MGMT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
}

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mYO‘NALISHLAR\x1b[0m');

// ---------- 1. Baza ----------
console.log('\n1. Baza');

const ustun = await sql(`
  select data_type, column_default, is_nullable
  from information_schema.columns
  where table_name = 'organizations' and column_name = 'yonalishlar'
`);
tekshir('organizations.yonalishlar bor', ustun.length === 1, ustun[0]?.data_type);
tekshir('bo‘sh bo‘lolmaydi', ustun[0]?.is_nullable === 'NO');

const orglar = await sql('select name, yonalishlar from organizations');
tekshir(
  'mavjud tenantlar yo‘nalishsiz qolmadi',
  orglar.every((o) => Array.isArray(o.yonalishlar) && o.yonalishlar.length > 0),
  orglar.map((o) => `${o.name}=${o.yonalishlar}`).join(', '),
);

// Noto'g'ri kalit yozilmasin
let xatoQabul = false;
try {
  await sql(`update organizations set yonalishlar = array['yolgon_tizim'] where false`);
  // where false — hech qatorga tegmaydi, constraint tekshirilmaydi.
  // Shuning uchun haqiqiy urinish: vaqtinchalik qator.
  await sql(`
    do $$
    begin
      insert into organizations (name, yonalishlar) values ('__sinov__', array['yolgon_tizim']);
    end $$;
  `);
  xatoQabul = true;
  await sql(`delete from organizations where name = '__sinov__'`);
} catch {
  /* kutilgan: check constraint to'sdi */
}
tekshir('noma’lum yo‘nalish qabul qilinmaydi', !xatoQabul, xatoQabul ? 'CHECK ISHLAMADI' : 'check constraint to‘sdi');

// ---------- 2. Ruxsatlar ----------
console.log('\n2. Ruxsatlar');

async function rpc(token, nom, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: K.anon_key,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(args ?? {}),
  });
  return { status: r.status, body: (await r.text()).slice(0, 120) };
}

const anonQoy = await rpc(null, 'org_yonalish_qoy', {
  p_org_id: '00000000-0000-0000-0000-000000000000',
  p_yonalishlar: ['dorixona'],
});
tekshir('anon yo‘nalish qo‘yolmaydi', anonQoy.status >= 400, 'HTTP ' + anonQoy.status);

const anonOqi = await rpc(null, 'org_yonalishlarim', {});
tekshir('anon o‘qiyolmaydi', anonOqi.status >= 400, 'HTTP ' + anonOqi.status);

// Haqiqiy mijoz hisobi bilan
const kirish = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
  body: JSON.stringify({ email: K.customer?.email ?? '', password: K.customer?.password ?? '' }),
});
const token = (await kirish.json()).access_token ?? null;

if (!token) {
  console.log('  \x1b[33m!\x1b[0m mijoz hisobi bilan kirib bo‘lmadi — bo‘lim o‘tkazib yuborildi');
} else {
  const orgId = (await sql('select id from organizations limit 1'))[0].id;
  const qoy = await rpc(token, 'org_yonalish_qoy', {
    p_org_id: orgId,
    p_yonalishlar: ['dorixona', 'b2b', 'sklad', 'marketplace'],
  });
  tekshir(
    'mijoz o‘ziga tizim qo‘sholmaydi',
    qoy.status >= 400 || /RUXSAT_YOQ/.test(qoy.body),
    'HTTP ' + qoy.status,
  );

  // Haqiqatan o'zgarmaganini bazadan tasdiqlaymiz — HTTP javobi
  // "muvaffaqiyatli" ko'rinib, ichkarida yozib yuborgan bo'lishi mumkin.
  const keyin = await sql(`select yonalishlar from organizations where id = '${orgId}'`);
  tekshir(
    'baza o‘zgarmadi',
    !(keyin[0].yonalishlar ?? []).includes('marketplace'),
    String(keyin[0].yonalishlar),
  );
}

// ---------- 3. Panel va baza ro'yxati bir xilmi ----------
console.log('\n3. Panel va baza mosligi');

const lib = readFileSync(join(ROOT, 'apps/admin/src/lib/yonalishlar.ts'), 'utf8');
const panelKalit = [...lib.matchAll(/^\s*(?:\{\s*)?key: '([a-z0-9_]+)'/gm)].map((m) => m[1]);

const chk = await sql(`
  select pg_get_constraintdef(oid) as d
  from pg_constraint where conname = 'organizations_yonalishlar_chk'
`);
const bazaKalit = [...(chk[0]?.d ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

tekshir('check constraint topildi', bazaKalit.length > 0, bazaKalit.join(', '));
for (const k of panelKalit) {
  tekshir(`panel «${k}» — bazada ruxsat etilgan`, bazaKalit.includes(k));
}
for (const k of bazaKalit) {
  tekshir(`baza «${k}» — panelda bor`, panelKalit.includes(k));
}

// ---------- 4. Panel kodi ----------
console.log('\n4. Panel kodi');

const app = readFileSync(join(ROOT, 'apps/admin/src/App.tsx'), 'utf8');
tekshir('4020 — faqat super admin', /superManzil/.test(app) && /const SUPER_HOST = '4020/.test(app));
tekshir('admin.* — super admin konsoli ochilmaydi', /tenantManzil/.test(app));
tekshir('localhost cheklanmaydi', !/superManzil = host !==/.test(app));
tekshir('tenant yo‘nalishi RPC orqali olinadi', /org_yonalishlarim/.test(app));

const layout = readFileSync(join(ROOT, 'apps/admin/src/components/Layout.tsx'), 'utf8');
tekshir('menyu yo‘nalishdan quriladi', /yonalish\.modullar\.map/.test(layout));
tekshir('eski qattiq NAV ro‘yxati olib tashlandi', !/^const NAV = \[/m.test(layout));

const sa = readFileSync(join(ROOT, 'apps/admin/src/pages/SuperAdminPanel.tsx'), 'utf8');
tekshir('tenant yaratishda yo‘nalish tanlanadi', /<YonalishTanlagich/.test(sa));
tekshir('yo‘nalish alohida RPC bilan saqlanadi', /org_yonalish_qoy/.test(sa));
tekshir('oxirgi yo‘nalishni olib tashlab bo‘lmaydi', /oxirgisi/.test(sa));

// ---------- 5. Edge funksiya xatosi yo'qolmasin ----------
// Panel har qanday xatoda bitta quruq gap ko'rsatardi: "Edge Function
// returned a non-2xx status code". Sabab javob tanasida qolib ketardi,
// ya'ni "email band" ham, "ruxsat yo'q" ham bir xil ko'rinardi va odam
// nima qilishni bilmasdi. fnXato javobni ochib asl xabarni oladi.
console.log('\n5. Edge funksiya xatolari');

const libSb = readFileSync(join(ROOT, 'apps/admin/src/lib/supabase.ts'), 'utf8');
tekshir('fnXato yordamchisi bor', /export async function fnXato/.test(libSb));

const sahifalar = readdirSync(join(ROOT, 'apps/admin/src/pages')).filter((f) => f.endsWith('.tsx'));
const xomJoy = [];
for (const f of sahifalar) {
  const t = readFileSync(join(ROOT, 'apps/admin/src/pages', f), 'utf8');
  if (!/functions\.invoke/.test(t)) continue;
  if (!/fnXato/.test(t)) xomJoy.push(f);
}
tekshir(
  'invoke ishlatgan hamma sahifa fnXato bilan',
  xomJoy.length === 0,
  xomJoy.length ? 'xato matni yo‘qoladi: ' + xomJoy.join(', ') : 'hammasi',
);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
