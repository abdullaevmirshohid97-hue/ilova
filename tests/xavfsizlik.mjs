// =============================================================
//  XAVFSIZLIK SINOVI
//
//  Bu sinov "kod to'g'ri yozilganmi" degan savolga emas, "tashqaridan
//  nima ochiq" degan savolga javob beradi. Shuning uchun u HAQIQIY
//  HTTP so'rov yuboradi: kirmagan foydalanuvchi va oddiy mijoz
//  nomidan xavfli chaqiruvlarni bosib ko'radi.
//
//  Nega kerak: funksiyaga `grant execute to authenticated` yozib
//  yuborish juda oson va u hech qanday xatoga sabab bo'lmaydi -
//  faqat eshik ochiq qoladi. Auditda aynan shunday beshta funksiya
//  topildi (narx hisoblagichlari har qanday mijozga ochiq edi).
//
//  Ishga tushirish:  node tests/xavfsizlik.mjs
//  Kalitlar kodchi/kalitlar.json dan (u gitignore'da).
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

const URL = `https://${K.ref}.supabase.co`;

let yiqildi = 0;
function tekshir(nom, xavfsiz, izoh) {
  console.log((xavfsiz ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ OCHIQ\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!xavfsiz) yiqildi++;
}

async function kir(email, parol) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ email, password: parol }),
  });
  const j = await r.json();
  return j.access_token ?? null;
}

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

const radMi = (r) => r.status >= 400 || /RUXSAT_YOQ/.test(r.body);

console.log('\n\x1b[1mXAVFSIZLIK\x1b[0m');

// ---------- 1. Kirmagan foydalanuvchi ----------
console.log('\n1. Kirmagan foydalanuvchi (anon)');
for (const [nom, args] of [
  ['dori_catalog_page', { p_group: null, p_offset: 0, p_limit: 5 }],
  ['dori_search', { p_q: 'ana', p_limit: 5 }],
  ['dori_skladlar', {}],
  ['dori_sotuvlar', { p_limit: 5 }],
  ['dori_push_mijozlar', { p_q: null }],
  ['dori_narx_hisobla', { p_ids: null }],
  ['dori_katalog_royxat', { p_warehouse_id: null, p_q: null, p_offset: 0, p_limit: 5 }],
  ['dori_narx_solishtir', { p_q: null, p_faqat_umumiy: true, p_saralash: 'nom', p_offset: 0, p_limit: 5 }],
  ['dori_sotuv_qidir_skladlar', { p_warehouse_id: null, p_q: 'ana', p_limit: 5 }],
  ['tenant_kartochka', { p_org_id: '00000000-0000-0000-0000-000000000000' }],
  ['admin_kirishlar', { p_days: 7, p_limit: 5 }],
  ['dori_buyurtmalar', { p_limit: 5 }],
]) {
  const r = await rpc(null, nom, args);
  tekshir(nom, radMi(r), 'HTTP ' + r.status);
}

// ---------- 2. Oddiy mijoz ----------
console.log('\n2. Oddiy mijoz (kirgan, lekin super admin emas)');
const token = await kir(K.customer?.email ?? '', K.customer?.password ?? '');
if (!token) {
  console.log('  \x1b[33m!\x1b[0m mijoz hisobi bilan kirib bo‘lmadi — bo‘lim o‘tkazib yuborildi');
} else {
  for (const [nom, args, izoh] of [
    ['dori_skladlar', {}, 'skladlar'],
    ['dori_sotuvlar', { p_limit: 5 }, 'sotuv va foyda'],
    ['dori_buyurtmalar', { p_limit: 5 }, 'buyurtmalar'],
    ['dori_push_mijozlar', { p_q: null }, 'mijozlar bazasi'],
    ['dori_sklad_narxlar', { p_warehouse_id: '00000000-0000-0000-0000-000000000000' }, 'TANNARX'],
    ['dori_price_overview', {}, 'ustama va foyda'],
    ['dori_price_rules_list', {}, 'narx qoidalari'],
    ['dori_narx_hisobla', { p_ids: null }, 'narxni qayta hisoblash'],
    ['dori_offer_narx', { p_warehouse: null, p_ids: null }, 'og‘ir hisoblash'],
    ['dori_katalog_yigish', { p_ids: null }, 'katalogni yig‘ish'],
    ['dori_cheklov_yoqilganmi', {}, 'sozlama'],
    ['dori_asosiy_sklad', {}, 'asosiy sklad'],
    ['dori_sklad_telegram_royxat', { p_warehouse_id: null }, 'sklad xodimlari'],
    ['dori_sotuv_mijozlar', { p_q: null, p_limit: 5 }, 'mijoz qidiruvi'],
    ['dori_invoice_list', { p_limit: 5 }, 'arxiv'],
    ['dori_narx_solishtir', { p_q: null, p_faqat_umumiy: true, p_saralash: 'nom', p_offset: 0, p_limit: 5 }, 'skladlar aro TANNARX'],
    ['dori_sotuv_qidir_skladlar', { p_warehouse_id: null, p_q: 'ana', p_limit: 5 }, 'hamma skladdagi narx'],
    ['tenant_kartochka', { p_org_id: '00000000-0000-0000-0000-000000000000' }, 'tenant eshiklari va emaillari'],
    ['admin_kirishlar', { p_days: 7, p_limit: 5 }, 'favqulodda kirish jurnali'],
  ]) {
    const r = await rpc(token, nom, args);
    tekshir('mijoz → ' + nom, radMi(r), izoh + ' · HTTP ' + r.status);
  }
}

// ---------- 3. Chekka funksiyalar ----------
console.log('\n3. Chekka funksiyalar (tokensiz)');
for (const slug of ['dori-faktura', 'dori-push', 'dori-sklad-yubor', 'dori-sklad-user', 'dori-mijoz', 'super-admin-kirish', 'super-admin-hisob']) {
  const r = await fetch(`${URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejim: 'sotuv' }),
  });
  tekshir(slug, r.status === 401 || r.status === 403, 'HTTP ' + r.status);
}

// ---------- 4. Chekka funksiyalar: anon kalit bilan ----------
console.log('\n4. Chekka funksiyalar (anon kalit bilan)');
for (const slug of ['dori-push', 'dori-sklad-yubor', 'dori-sklad-user']) {
  const r = await fetch(`${URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + K.anon_key,
      apikey: K.anon_key,
    },
    body: JSON.stringify({ broadcast_id: '00000000-0000-0000-0000-000000000000' }),
  });
  const t = (await r.text()).slice(0, 60);
  tekshir(slug, r.status === 403 || /RUXSAT_YOQ/.test(t), 'HTTP ' + r.status);
}

// ---------- 5. YOZADIGAN funksiyalar anon uchun yopiqmi ----------
//
// Postgres YANGI funksiyaga EXECUTE ni PUBLIC ga STANDART holatda
// beradi. `drop function` + qayta yaratish ham eski revoke'ni yo'q
// qiladi. Ya'ni funksiya qo'shgan odam hech narsa qilmasa — u anon
// uchun ochiq bo'lib qoladi va bu hech qanday xato bermaydi.
//
// Bir sessiyada 16 ta yangi funksiya shunday ochiq qolgan, ikkitasi
// esa YOZARDI va ichida ruxsat tekshiruvi yo'q edi:
//   menejer_xaridori()         — customers ga qator qo'shadi
//   menejer_hisobini_moslash() — ledger_entries ga yozadi/o'chiradi
//
// Shuning uchun ro'yxat emas, QOIDA tekshiriladi: yozadigan har bir
// security definer funksiya anon uchun yopiq bo'lsin.
console.log('\n5. Yozadigan funksiyalar anon uchun yopiq');

async function sqlMgmt(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${K.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ANON YETARLI EMAS. Loyihada ALTER DEFAULT PRIVILEGES turibdi:
// postgres yaratgan har bir funksiya avtomatik `authenticated` ga
// beriladi. Mijoz ham, sklad xodimi ham `authenticated` — ya'ni
// anon yopilgani bilan ish tugamaydi.
//
// Shu sababdan uchta funksiya ochiq qolgan edi:
//   menejer_xaridori(uuid)          — customers ga yozadi
//   menejer_hisobini_moslash(uuid)  — ledger_entries ga yozadi
//   qarz_agent_ulash(text, bigint)  — "men shu agentman" deb bog'lanish
const ROLLAR = ['anon', 'authenticated'];

// Ichida kim chaqirayotgani tekshiriladigan naqshlar.
//
// auth.uid() ham SHU RO'YXATDA: create_order va staff_telegram_code
// aynan shu bilan himoyalangan (chaqiruvchining o'z yozuvini topadi)
// va ular ATAYLAB har bir kirgan foydalanuvchiga ochiq. Ularsiz
// tekshiruv shovqin berardi — shovqinli qo'riqchi esa e'tibordan
// qoladi va himoya qilishni to'xtatadi.
const TEKSHIRUV =
  '(is_admin|is_manager|is_direktor|is_super_admin|dori_ruxsat|' +
  'current_customer_id|current_manager_id|current_org_id)';

for (const rol of ROLLAR) {
  try {
    const ochiq = await sqlMgmt(`
      select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind = 'f'
        and p.prosecdef                     -- security definer: RLS'ni chetlab o'tadi
        -- Trigger funksiyasini PostgREST orqali chaqirib bo'lmaydi
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('${rol}', p.oid, 'execute')
        -- Tanasida yozish amali bormi
        and pg_get_functiondef(p.oid) ~* '(insert into|update [a-z_]+ +set|delete from)'
        -- Ichida chaqiruvchi tekshirilmaydimi.
        -- auth.uid() alohida: regexda qochirish oson chalkashadi,
        -- aniq matn tekshiruvi ishonchliroq.
        and pg_get_functiondef(p.oid) !~* '${TEKSHIRUV}'
        and position('auth.uid()' in pg_get_functiondef(p.oid)) = 0
        -- Telegram bot va mini-ilova ATAYLAB tokensiz ishlaydi: ular
        -- chaqiruvchini chat_id/kod bilan o'zi tekshiradi
        and p.proname not like 'dori_kabinet%'
        and p.proname not in (
          'dori_mijoz_ulash', 'dori_mijoz_kod', 'handle_new_user',
          'report_client_error', 'tg_set_updated_at',
          'dori_sklad_men', 'staff_telegram_unlink'
        )
      order by 1
    `);
    tekshir(
      `${rol}: tekshiruvsiz yozuvchi funksiya yo‘q`,
      ochiq.length === 0,
      ochiq.length ? ochiq.map((r) => r.proname).join(', ') : ''
    );
  } catch (e) {
    tekshir(`${rol}: funksiya huquqlarini tekshirish`, false, e.message);
  }
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI YOPIQ\x1b[0m' : `\x1b[31m${yiqildi} TA OCHIQ NUQTA\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
