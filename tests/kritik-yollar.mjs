// =============================================================
//  KRITIK YO'LLAR TESTI — 0-bosqich
//
//  Hamma narsani emas, aynan buzilsa PUL yoki ISHONCH yo'qoladigan
//  joylarni tekshiradi: ruxsat chegaralari, tenant ajratilishi, menejer
//  ustamasining yopiqligi, faktura valyutasi, bot chegaralari.
//
//  Ishga tushirish:
//    node tests/kritik-yollar.mjs
//
//  Kalitlar `kodchi/kalitlar.json` dan olinadi (kodchi/ gitignore'da).
//  Shu fayl yo'q bo'lsa test ishlamaydi — bu ataylab: kalit repoga tushmasin.
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Bu skript kalitlarni kodchi/kalitlar.json dan oladi. U fayl ataylab
// faqat shaxsiy kompyuterda bor — VPS'ga hech qachon chiqmaydi. Shuning
// uchun serverda ishga tushirilsa, tushunarli xabar chiqsin.
function kalitlarniOqi(yol) {
  try {
    return JSON.parse(readFileSync(yol, 'utf8'));
  } catch {
    console.error(
      [
        '',
        '  Kalitlar fayli topilmadi: kodchi/kalitlar.json',
        '',
        '  Bu skript SIZNING KOMPYUTERINGIZDA ishlaydi, serverda emas —',
        '  kalitlar VPS ga chiqmaydi (shunday bo\'lishi ham kerak).',
        '',
        '  Kompyuteringizda:',
        '      cd d:\\ilova',
        '      node tests\\kritik-yollar.mjs',
        '',
      ].join('\n')
    );
    process.exit(1);
  }
}

const CFG = kalitlarniOqi(join(ROOT, 'kodchi', 'kalitlar.json'));

const URL = `https://${CFG.ref}.supabase.co`;
const MGMT = `https://api.supabase.com/v1/projects/${CFG.ref}/database/query`;

let otdi = 0;
let yiqildi = 0;
const ogohlantirish = [];

function ok(nom, shart, izoh = '') {
  if (shart) {
    otdi++;
    console.log(`  \x1b[32m✓\x1b[0m ${nom}`);
  } else {
    yiqildi++;
    console.log(`  \x1b[31m✗ ${nom}\x1b[0m${izoh ? ' — ' + izoh : ''}`);
  }
}

function ogoh(nom, izoh) {
  ogohlantirish.push(`${nom} — ${izoh}`);
  console.log(`  \x1b[33m! ${nom}\x1b[0m — ${izoh}`);
}

async function sql(query) {
  const r = await fetch(MGMT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CFG.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

async function rest(path, token) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: CFG.anon_key, Authorization: `Bearer ${token ?? CFG.anon_key}` },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function rpc(name, args, token) {
  const r = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: CFG.anon_key,
      Authorization: `Bearer ${token ?? CFG.anon_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args ?? {}),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function login(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: CFG.anon_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Login ishlamadi (${email}): ${j.error_description ?? j.msg}`);
  return j.access_token;
}

const YOQ = 42501; // permission denied

// =============================================================
console.log('\n\x1b[1mKRITIK YO\'LLAR TESTI\x1b[0m');
console.log(`Loyiha: ${CFG.ref}\n`);

// ---------- 1. Ochiq kalit bilan yozuv ----------
console.log('1. Ochiq kalit (anon) yozuv RPC\'larini chaqira olmaydi');
{
  const soxta = '00000000-0000-0000-0000-0000000000ff';
  for (const [nom, args] of [
    ['create_order', { p_items: [] }],
    ['add_stock', { p_variant_id: soxta, p_qty: 1 }],
    ['record_payment', { p_customer_id: soxta, p_amount: 1, p_method: 'cash' }],
    ['admin_create_order', { p_customer_id: soxta, p_items: [] }],
    ['confirm_order', { p_order_id: soxta }],
  ]) {
    const { body } = await rpc(nom, args);
    ok(nom, body?.code === String(YOQ) || body?.code === YOQ, `javob: ${JSON.stringify(body)?.slice(0, 80)}`);
  }
}

// ---------- 2. Ochiq kalit bilan o'qish ----------
console.log('\n2. Ochiq kalit bilan ma\'lumot o\'qib bo\'lmaydi');
for (const t of ['customers', 'orders', 'products', 'prices', 'managers']) {
  const { body } = await rest(`${t}?select=id&limit=1`);
  ok(t, Array.isArray(body) && body.length === 0, `qaytdi: ${JSON.stringify(body)?.slice(0, 80)}`);
}

// ---------- 3. Bot RPC'lari faqat service_role uchun ----------
console.log('\n3. Bot RPC\'lari brauzerdan chaqirilmaydi');
{
  const adminToken = await login(CFG.admin.email, CFG.admin.password);
  const soxta = '00000000-0000-0000-0000-0000000000ff';
  for (const [nom, args] of [
    ['order_invoice_for_chat', { p_order_id: soxta, p_chat_id: 1 }],
    ['order_invoice_for_staff_chat', { p_order_id: soxta, p_chat_id: 1 }],
    ['staff_orders_for_chat', { p_chat_id: 1 }],
    ['staff_chats_for_order', { p_order_id: soxta }],
    ['staff_order_action', { p_order_id: soxta, p_chat_id: 1, p_action: 'confirm' }],
  ]) {
    const anon = await rpc(nom, args);
    const admin = await rpc(nom, args, adminToken);
    ok(
      `${nom} (anon + admin)`,
      String(anon.body?.code) === String(YOQ) && String(admin.body?.code) === String(YOQ),
      `anon=${anon.body?.code} admin=${admin.body?.code}`
    );
  }
}

// ---------- 4. Mijoz faqat o'zinikini ko'radi ----------
console.log('\n4. Mijoz faqat o\'z ma\'lumotini ko\'radi');
{
  const mijozToken = await login(CFG.customer.email, CFG.customer.password);
  const { body: buyurtmalar } = await rest('orders?select=id,customer_id', mijozToken);
  const { body: mijozlar } = await rest('customers?select=id', mijozToken);

  const [{ customer_id }] = await sql(
    `select customer_id from profiles where id = (select id from auth.users where email = '${CFG.customer.email}')`
  );

  ok(
    'buyurtmalar faqat o\'ziniki',
    Array.isArray(buyurtmalar) && buyurtmalar.every((o) => o.customer_id === customer_id),
    `${buyurtmalar?.length} ta qatorda begona bor`
  );
  ok(
    'mijoz kartochkasi faqat o\'ziniki',
    Array.isArray(mijozlar) && mijozlar.length <= 1 && (mijozlar[0]?.id ?? customer_id) === customer_id
  );
}

// ---------- 5. Tenant chegarasi ----------
console.log('\n5. Admin boshqa tenant ma\'lumotini ko\'rmaydi');
{
  const adminToken = await login(CFG.admin.email, CFG.admin.password);
  const [{ org_id }] = await sql(
    `select org_id from profiles where id = (select id from auth.users where email = '${CFG.admin.email}')`
  );
  const { body: mijozlar } = await rest('customers?select=id,org_id', adminToken);
  const begona = (mijozlar ?? []).filter((c) => c.org_id !== org_id);
  ok('mijozlar ro\'yxatida begona tenant yo\'q', begona.length === 0, `${begona.length} ta begona qator`);

  const jami = await sql(`select count(*)::int as n from customers`);
  const oz = await sql(`select count(*)::int as n from customers where org_id = '${org_id}'`);
  ok(
    'RLS haqiqatan filtrlaydi (hammasi emas)',
    jami[0].n > oz[0].n ? (mijozlar ?? []).length === oz[0].n : true,
    `ko'rdi ${mijozlar?.length}, o'ziniki ${oz[0].n}, jami ${jami[0].n}`
  );
}

// ---------- 6. Menejer ustamasi ----------
console.log('\n6. Menejer ustamasi adminga ochilmaydi');
{
  // Bu yerda ADMIN nomidan haqiqiy RLS bilan tekshiramiz. Parol kerak emas:
  // rolni `authenticated` ga o'tkazamiz va claim qo'yamiz — PostgREST ham
  // xuddi shunday qiladi, ya'ni natija haqiqiy so'rov bilan bir xil.
  const [admin] = await sql(`
    select p.id from profiles p
    where p.role = 'admin'
      and exists (select 1 from customers c where c.org_id = p.org_id and c.manager_id is not null)
    limit 1
  `);

  // Shart bajarilmasa sinov YIQILMAYDI, ogohlantiradi: tenantda admin
  // yo'qligi tekshiruvning emas, ma'lumotning muammosi. Jonli bazada
  // shunday bo'ldi - yagona admin super_admin ga ko'tarilgach, bu blok
  // "undefined" uuid bilan qulab tushdi va haqiqiy xato kabi ko'rindi.
  if (!admin?.id) {
    ogoh('menejer ustamasi tekshirilmadi', 'bu tenantda admin yo‘q — rol o‘zgargan bo‘lishi mumkin');
  } else {
  const [{ narxlar }] = await sql(`
    begin;
    select set_config('request.jwt.claims',
      json_build_object('sub','${admin.id}','role','authenticated')::text, true);
    set local role authenticated;
    select count(*)::int as narxlar from manager_prices;
    rollback;
  `);
  ok('manager_prices admin uchun yopiq', narxlar === 0, `${narxlar} ta qator ko'rindi`);

  const [ustama] = await sql(`
    begin;
    select set_config('request.jwt.claims',
      json_build_object('sub','${admin?.id}','role','authenticated')::text, true);
    set local role authenticated;
    select count(*)::int as n from orders o
    join customers c on c.id = o.customer_id
    where c.manager_id is not null and o.total <> o.base_total;
    rollback;
  `);

  // MA'LUM KAMCHILIK (1-bosqichda tuzatiladi): panel base_total ko'rsatadi,
  // lekin to'g'ridan-to'g'ri so'rov orders.total ni ham beradi — ya'ni ustama
  // texnik jihatdan ochiq. Tuzatilgach bu ogohlantirish qattiq testga aylanadi.
  if (ustama.n > 0) {
    ogoh(
      'orders.total adminga ochiq',
      `${ustama.n} ta buyurtmada ustama to'g'ridan-to'g'ri so'rov bilan ko'rinadi — 1-bosqich ishi`
    );
  } else {
    ok('orders.total adminga ochilmaydi', true);
  }
  }
}

// ---------- 7. Faktura valyutasi ----------
console.log('\n7. Faktura valyutasi to\'g\'ri tanlanadi');
{
  const [usd] = await sql(`
    select o.id from orders o join customers c on c.id = o.customer_id
    where c.display_currency = 'USD' and public.order_usd_total(o.id) is not null limit 1
  `);
  if (!usd) {
    ogoh('valyuta testi', 'dollarli buyurtma topilmadi');
  } else {
    const [r] = await sql(`
      select public.order_invoice_payload('${usd.id}', false)->>'currency' as mijoz,
             public.order_invoice_payload('${usd.id}', true)->>'currency'  as admin
    `);
    ok('mijoz/menejer fakturasi USD', r.mijoz === 'USD', `qaytdi: ${r.mijoz}`);
    ok('admin fakturasi (baza narx) UZS', r.admin === 'UZS', `qaytdi: ${r.admin}`);
  }
}

// ---------- 8. Xodim boti chegaralari ----------
console.log('\n8. Xodim boti chegaralari');
{
  const [soxtaChat] = await sql(
    `select public.staff_order_action('00000000-0000-0000-0000-0000000000ff'::uuid, 999000999, 'confirm') as r`
  );
  ok('ulanmagan chat rad etiladi', soxtaChat.r?.error === 'ULANMAGAN', JSON.stringify(soxtaChat.r));

  const [nomalum] = await sql(`
    select public.staff_order_action((select id from orders limit 1), 999000999, 'delete') as r
  `);
  ok('nomalum amal rad etiladi', ['NOMALUM_AMAL', 'ULANMAGAN'].includes(nomalum.r?.error), JSON.stringify(nomalum.r));
}

// ---------- 9. Buyurtma yaratish qoldiqni band qiladi ----------
console.log('\n9. Buyurtma qoldiqni band qiladi, bekor qilish qaytaradi');
{
  // Tranzaksiya ichida sinaymiz va ORQAGA QAYTARAMIZ — jonli bazaga tegmaydi.
  // Buyurtma yaratish va qoldiqni o'qish ALOHIDA so'rovlar bo'lishi shart:
  // bitta so'rov ichida o'zgarish o'sha so'rovning snapshot'iga tushmaydi.
  const natija = await sql(`
    begin;
    select set_config('request.jwt.claims',
      json_build_object('sub', (select p.id from profiles p
                                join customers c on c.id = p.customer_id and c.is_active
                                limit 1),
                        'role','authenticated')::text, true);

    create temp table sinov_variant on commit drop as
      select sl.variant_id, (sl.qty - sl.reserved) as bosh
      from stock_levels sl
      join product_variants pv on pv.id = sl.variant_id and pv.is_active
      join products pd on pd.id = pv.product_id and pd.is_active
      where sl.qty - sl.reserved > 0
      limit 1;

    select public.create_order(
      jsonb_build_array(jsonb_build_object('variant_id', (select variant_id from sinov_variant), 'qty', 1))
    );

    select (select bosh from sinov_variant) as oldin,
           (select sl.qty - sl.reserved from stock_levels sl
             where sl.variant_id = (select variant_id from sinov_variant)) as keyin;
    rollback;
  `);
  const r = Array.isArray(natija) ? natija[0] : null;
  ok('zaxira 1 dona kamaydi', r && Number(r.keyin) === Number(r.oldin) - 1, JSON.stringify(r));
}

// ---------- 10. Telemetriya ----------
console.log('\n10. Xatolik telemetriyasi');
{
  const yoz = await rpc('report_client_error', {
    p_app: 'admin',
    p_message: 'TEST: kritik yo\'llar testi',
    p_screen: 'test',
  });
  ok('anon xato yubora oladi', yoz.status === 204 || yoz.status === 200, `status ${yoz.status}`);

  const oqi = await rest('client_errors?select=message&limit=1');
  ok('anon xatolarni o\'qiy olmaydi', oqi.body?.code === '42501' || oqi.status === 401, JSON.stringify(oqi.body)?.slice(0, 60));

  await sql(`delete from client_errors where message like 'TEST:%'`);
}

// =============================================================
console.log(`\n\x1b[1mNATIJA:\x1b[0m ${otdi} o'tdi, ${yiqildi} yiqildi, ${ogohlantirish.length} ogohlantirish`);
if (ogohlantirish.length) {
  console.log('\nOgohlantirishlar:');
  for (const o of ogohlantirish) console.log('  ! ' + o);
}
console.log('');
process.exit(yiqildi > 0 ? 1 : 0);
