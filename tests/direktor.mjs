// =============================================================
//  DIREKTOR ROLI SINOVI
//
//  Direktor — KUZATUVCHI. U buyurtma, sotuv, tahlil, hisobot va
//  moliyani ko'radi, lekin hech narsani o'zgartira olmaydi.
//
//  Nega HTTP bilan sinaladi: "kodda tugma yo'q" degani "huquq yo'q"
//  degani emas. Panelni chetlab o'tib to'g'ridan-to'g'ri PostgREST'ga
//  so'rov yuborish mumkin. Shuning uchun sinov haqiqiy direktor hisobi
//  ochadi, uning nomidan yozishga urinadi va natijani tekshiradi.
//
//  Nozik joy: RLS bilan to'silgan UPDATE xato BERMAYDI — u 200 va
//  BO'SH ro'yxat qaytaradi. Shuning uchun har yozishda "nechta qator
//  o'zgardi" tekshiriladi, xato bor-yo'qligi emas.
//
//  Sinov o'zidan keyin tozalaydi: ochgan hisobini o'chiradi.
//
//  Ishga tushirish:  node tests/direktor.mjs
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
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

async function kir(email, parol) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ email, password: parol }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('kirib bo\'lmadi: ' + JSON.stringify(j));
  return j.access_token;
}

function sarlavha(token) {
  return { apikey: K.anon_key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function oq(token, yol) {
  const r = await fetch(`${URL}/rest/v1/${yol}`, { headers: sarlavha(token) });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* xato matni JSON bo'lmasligi mumkin */
  }
  return { status: r.status, body: j, xom: t };
}

async function rpc(token, nom, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: sarlavha(token),
    body: JSON.stringify(args ?? {}),
  });
  return { status: r.status, xom: await r.text() };
}

// Yozishga urinish. RLS to'sganda 200 + bo'sh ro'yxat keladi, shuning
// uchun natija "nechta qator qaytdi" bo'yicha baholanadi.
async function yozishgaUrin(token, usul, yol, tana) {
  const r = await fetch(`${URL}/rest/v1/${yol}`, {
    method: usul,
    headers: { ...sarlavha(token), Prefer: 'return=representation' },
    body: tana ? JSON.stringify(tana) : undefined,
  });
  const t = await r.text();
  let qatorlar = [];
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) qatorlar = j;
  } catch {
    /* xato javobi */
  }
  return { status: r.status, tegdi: r.ok && qatorlar.length > 0, xom: t.slice(0, 120) };
}

// Management API orqali SQL. Faqat sinovning O'Z hisobini boshqa
// tenantga vaqtincha ko'chirish uchun kerak — pastdagi izohga qarang.
async function sqlMgmt(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${K.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function fn(token, action, extra) {
  const r = await fetch(`${URL}/functions/v1/admin-direktor`, {
    method: 'POST',
    headers: sarlavha(token),
    body: JSON.stringify({ action, ...extra }),
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    /* bo'sh javob */
  }
  return { status: r.status, body: j, xom: t };
}

console.log('\n\x1b[1mDIREKTOR ROLI\x1b[0m');

const SINOV_TEL = '+998900000199';
const SINOV_PAROL = 'Direktor#Sinov9';
const SINOV_EMAIL = '998900000199@direktor.ilova';

let adminToken;
let direktorId = null;

try {
  adminToken = await kir(K.admin.email, K.admin.password);
} catch (e) {
  console.error('  admin sifatida kirib bo\'lmadi: ' + e.message);
  process.exit(1);
}

// ---------- 1. Hisob ochish ----------
console.log('\n1. Hisob ochish');

// Eski qoldiq bo'lsa tozalaymiz (oldingi sinov yarmida uzilgan bo'lishi mumkin)
{
  const r = await fn(adminToken, 'list');
  const eski = (r.body?.rows ?? []).find((x) => (x.phone ?? '').replace(/\D/g, '') === SINOV_TEL.replace(/\D/g, ''));
  if (eski) await fn(adminToken, 'delete', { id: eski.id });
}

{
  const r = await fn(adminToken, 'create', {
    name: 'SINOV Direktor',
    phone: SINOV_TEL,
    password: SINOV_PAROL,
  });
  tekshir('admin direktor yarata oladi', r.status === 200 && r.body?.ok === true, r.body?.error ?? '');
  direktorId = r.body?.id ?? null;
}

if (!direktorId) {
  console.error('\n  Hisob ochilmadi — davom etib bo\'lmaydi.\n');
  process.exit(1);
}

let dirToken;
try {
  dirToken = await kir(SINOV_EMAIL, SINOV_PAROL);
  tekshir('direktor telefon bilan kira oladi', true);
} catch (e) {
  tekshir('direktor telefon bilan kira oladi', false, e.message);
  await fn(adminToken, 'delete', { id: direktorId });
  process.exit(1);
}

try {
  // ---------- 2. Ko'rish ----------
  console.log('\n2. Ko\'radigan narsalari');

  const prof = await oq(dirToken, 'profiles?select=role,org_id');
  tekshir(
    'roli director',
    prof.status === 200 && prof.body?.[0]?.role === 'director',
    prof.body?.[0]?.role ?? prof.xom.slice(0, 80)
  );
  const orgId = prof.body?.[0]?.org_id ?? null;

  for (const [nom, yol] of [
    ['buyurtmalar', 'orders?select=id,status,base_total&limit=5'],
    ['buyurtma qatorlari', 'order_items?select=id,qty&limit=5'],
    ['mijozlar', 'customers?select=id,name&limit=5'],
    ['mahsulotlar', 'products?select=id,name&limit=5'],
    ['variantlar', 'product_variants?select=id,sku&limit=5'],
    ['narxlar', 'prices?select=variant_id,price&limit=5'],
    ['tariflar', 'price_groups?select=id,name&limit=5'],
    ['ombor qoldig\'i', 'stock_levels?select=variant_id,qty&limit=5'],
    ['ombor jurnali', 'stock_movements?select=id,qty&limit=5'],
    ['moliya — qarzlar', 'ledger_entries?select=id,amount&limit=5'],
    ['moliya — to\'lovlar', 'payments?select=id,amount&limit=5'],
    ['balanslar', 'customer_balances?select=customer_id,balance&limit=5'],
  ]) {
    const r = await oq(dirToken, yol);
    tekshir(nom + ' — o\'qiy oladi', r.status === 200, r.status !== 200 ? r.xom.slice(0, 80) : '');
  }

  // Bo'sh natija hech narsani isbotlamaydi: kamida bitta buyurtma
  // ko'rinishi kerak (bazada ular bor)
  {
    const r = await oq(dirToken, 'orders?select=id&limit=100');
    tekshir(
      'buyurtmalar ro\'yxati bo\'sh emas',
      Array.isArray(r.body) && r.body.length > 0,
      'ko\'rgani: ' + (r.body?.length ?? 0)
    );
  }

  // Boshqa tenant ko'rinmasin
  if (orgId) {
    const r = await oq(dirToken, 'customers?select=id,org_id&limit=1000');
    const begona = (r.body ?? []).filter((c) => c.org_id !== orgId);
    tekshir('begona tenant mijozi ko\'rinmaydi', begona.length === 0, begona.length + ' ta');
  }

  // ---------- 3. Ko'rmasligi kerak ----------
  //
  // DIQQAT: bu tekshiruvlar faqat MENEJERI BOR tenantda ma'noga ega.
  // Sinov admini boshqa tenantda bo'lishi mumkin — o'shanda "0 qator
  // keldi" hech narsani isbotlamaydi va sinov yashil turib, aslida
  // hech narsani tekshirmaydi (birinchi urinishda aynan shunday bo'ldi).
  //
  // Shuning uchun sinov O'ZINING vaqtinchalik hisobini menejeri bor
  // tenantga ko'chiradi va oxirida AYNAN tiklaydi. Bu faqat sinov
  // ochgan hisobga tegadi, jonli ma'lumotga emas.
  console.log('\n3. Ko\'rmasligi kerak');

  const [menejerliOrg] = await sqlMgmt(
    "select org_id from customers where manager_id is not null group by 1 order by count(*) desc limit 1"
  );
  const kochirilsinmi = menejerliOrg && menejerliOrg.org_id !== orgId;
  if (kochirilsinmi) {
    await sqlMgmt(
      `update profiles set org_id = '${menejerliOrg.org_id}' where id = '${direktorId}'`
    );
  }

  // Telefon niqobi FAQAT ko'rinadigan menejer mijozida ma'noga ega:
  // yashirin bo'lsa mijoz umuman berilmaydi va niqob sinalmay qoladi
  // (u holda sinov yashil turib, hech narsani tekshirmasdi).
  // Shuning uchun menejer vaqtincha "ochiq" qilinadi va tiklanadi.
  const [menejer] = await sqlMgmt(
    `select id, mijoz_korinsin from managers where org_id = '${menejerliOrg?.org_id ?? null}' limit 1`
  );
  const eskiKorinish = menejer?.mijoz_korinsin;
  if (menejer && eskiKorinish === false) {
    await sqlMgmt(
      `update managers set mijoz_korinsin = true where id = '${menejer.id}';` +
        ` select menejer_hisobini_moslash('${menejer.id}')`
    );
  }

  try {
    tekshir(
      'menejerli tenant topildi (sinov bo\'shga ishlamayapti)',
      Boolean(menejerliOrg?.org_id)
    );

    {
      const r = await oq(dirToken, 'customers?select=id,manager_id&manager_id=not.is.null&limit=20');
      tekshir(
        'ochiq menejerning mijozlari ko\'rinyapti',
        Array.isArray(r.body) && r.body.length > 0,
        (r.body?.length ?? 0) + ' ta'
      );
    }
    {
      const r = await oq(dirToken, 'manager_prices?select=id,price&limit=5');
      tekshir(
        'menejer ustamasi yopiq',
        r.status !== 200 || (Array.isArray(r.body) && r.body.length === 0),
        Array.isArray(r.body) ? r.body.length + ' ta qator keldi' : ''
      );
    }
    {
      const r = await oq(dirToken, 'manager_customer_prices?select=id,price&limit=5');
      tekshir(
        'menejerning mijozga qo\'ygan narxi yopiq',
        r.status !== 200 || (Array.isArray(r.body) && r.body.length === 0),
        Array.isArray(r.body) ? r.body.length + ' ta qator keldi' : ''
      );
    }
    {
      // customers_masked — menejer mijozining telefoni yashirin bo'lishi
      // kerak. Xato aynan shu yerda bo'lardi: niqob sharti "is_admin()"
      // edi va direktor uchun u FALSE qaytarardi, ya'ni yangi rol
      // qo'shilishi bilan telefon ochilib qolardi.
      const r = await oq(
        dirToken,
        'customers_masked?select=name,phone,manager_id&manager_id=not.is.null&limit=20'
      );
      const ochiq = (r.body ?? []).filter((c) => c.phone != null);
      tekshir(
        'menejer mijozlari niqoblangan ko\'rinishda ham bor',
        Array.isArray(r.body) && r.body.length > 0,
        (r.body?.length ?? 0) + ' ta'
      );
      tekshir(
        'menejer mijozining telefoni yashirin',
        r.status === 200 && ochiq.length === 0,
        ochiq.length ? ochiq.map((c) => c.name).join(', ') : ''
      );
    }
  } finally {
    if (menejer && eskiKorinish === false) {
      await sqlMgmt(
        `update managers set mijoz_korinsin = false where id = '${menejer.id}';` +
          ` select menejer_hisobini_moslash('${menejer.id}')`
      );
      const [m] = await sqlMgmt(
        `select mijoz_korinsin from managers where id = '${menejer.id}'`
      );
      tekshir('menejer ko\'rinishi tiklandi', m?.mijoz_korinsin === eskiKorinish, String(m?.mijoz_korinsin));
    }
    if (kochirilsinmi) {
      await sqlMgmt(`update profiles set org_id = '${orgId}' where id = '${direktorId}'`);
      const [q] = await sqlMgmt(`select org_id from profiles where id = '${direktorId}'`);
      tekshir('sinov hisobi o\'z tenantiga tiklandi', q?.org_id === orgId, q?.org_id ?? 'topilmadi');
    }
  }

  // ---------- 4. Yoza olmasligi ----------
  console.log('\n4. Yoza olmasligi');

  // Jadvalga to'g'ridan-to'g'ri
  {
    const r = await oq(dirToken, 'orders?select=id,status&limit=1');
    const id = r.body?.[0]?.id;
    if (id) {
      const u = await yozishgaUrin(dirToken, 'PATCH', `orders?id=eq.${id}`, { status: 'cancelled' });
      tekshir('buyurtma holatini o\'zgartira olmaydi', !u.tegdi, u.tegdi ? 'O\'ZGARDI!' : '');
    } else {
      tekshir('buyurtma holatini o\'zgartira olmaydi', false, 'sinov uchun buyurtma topilmadi');
    }
  }
  {
    const r = await oq(dirToken, 'customers?select=id,notes&limit=1');
    const id = r.body?.[0]?.id;
    if (id) {
      const u = await yozishgaUrin(dirToken, 'PATCH', `customers?id=eq.${id}`, {
        notes: 'SINOV — bu yozilmasligi kerak',
      });
      tekshir('mijozni tahrirlay olmaydi', !u.tegdi, u.tegdi ? 'O\'ZGARDI!' : '');
    }
  }
  {
    const r = await oq(dirToken, 'prices?select=variant_id,price_group_id,price&limit=1');
    const p = r.body?.[0];
    if (p) {
      const u = await yozishgaUrin(
        dirToken,
        'PATCH',
        `prices?variant_id=eq.${p.variant_id}&price_group_id=eq.${p.price_group_id}`,
        { price: 1 }
      );
      tekshir('narxni o\'zgartira olmaydi', !u.tegdi, u.tegdi ? 'O\'ZGARDI!' : '');
    }
  }
  {
    const u = await yozishgaUrin(dirToken, 'POST', 'categories', {
      name: 'SINOV kategoriya',
      sort_order: 999,
    });
    tekshir('kategoriya qo\'sha olmaydi', !u.tegdi, u.tegdi ? 'QO\'SHILDI!' : '');
  }
  {
    const r = await oq(dirToken, 'ledger_entries?select=id&limit=1');
    const id = r.body?.[0]?.id;
    if (id) {
      const u = await yozishgaUrin(dirToken, 'DELETE', `ledger_entries?id=eq.${id}`);
      tekshir('qarz yozuvini o\'chira olmaydi', !u.tegdi, u.tegdi ? 'O\'CHDI!' : '');
    }
  }

  // Funksiyalar orqali
  console.log('\n5. Funksiyalar RUXSAT_YOQ berishi');

  const buyurtma = await oq(dirToken, 'orders?select=id&status=eq.new&limit=1');
  const bId = buyurtma.body?.[0]?.id ?? '00000000-0000-0000-0000-000000000000';
  const mijoz = await oq(dirToken, 'customers?select=id&limit=1');
  const mId = mijoz.body?.[0]?.id ?? '00000000-0000-0000-0000-000000000000';

  for (const [nom, args] of [
    ['confirm_order', { p_order_id: bId }],
    ['cancel_order', { p_order_id: bId }],
    ['set_order_status', { p_order_id: bId, p_status: 'done' }],
    ['edit_order_items', { p_order_id: bId, p_items: [] }],
    ['admin_create_order', { p_customer_id: mId, p_items: [] }],
    ['record_payment', { p_customer_id: mId, p_amount: 1, p_method: 'cash' }],
    ['set_my_usd_rate', { p_rate: 1 }],
    ['set_my_default_currency', { p_currency: 'USD' }],
    ['adjust_stock', { p_variant_id: '00000000-0000-0000-0000-000000000000', p_qty: 1, p_note: 'sinov' }],
  ]) {
    const r = await rpc(dirToken, nom, args);
    // Ruxsat bo'lmasa RUXSAT_YOQ yoki HTTP xato bo'ladi. Muvaffaqiyat
    // (2xx) — teshik. Boshqa mantiqiy xato (masalan BOSH_BUYURTMA)
    // ham o'tib ketishi mumkin, shuning uchun aynan tekshiramiz.
    const toxtadi = r.status >= 400;
    const ruxsatXatosi = /RUXSAT_YOQ/.test(r.xom);
    tekshir(
      nom + ' — to\'silgan',
      toxtadi && ruxsatXatosi,
      toxtadi ? (ruxsatXatosi ? '' : 'boshqa xato: ' + r.xom.slice(0, 70)) : 'O\'TIB KETDI (' + r.status + ')'
    );
  }

  // Direktor boshqa direktor ocha olmasin
  {
    const r = await fn(dirToken, 'create', {
      name: 'SINOV 2',
      phone: '+998900000198',
      password: 'Sinov#12345',
    });
    tekshir(
      'direktor yangi hisob ocha olmaydi',
      r.status === 403 || r.body?.error === 'RUXSAT_YOQ',
      r.status + ' ' + (r.body?.error ?? '')
    );
  }
} finally {
  // ---------- Tozalash ----------
  console.log('\n6. Tozalash');
  const d = await fn(adminToken, 'delete', { id: direktorId });
  tekshir('sinov hisobi o\'chirildi', d.status === 200 && d.body?.ok === true, d.body?.error ?? '');

  const qoldi = await fn(adminToken, 'list');
  const bormi = (qoldi.body?.rows ?? []).some((x) => x.id === direktorId);
  tekshir('ro\'yxatda qolmadi', !bormi);
}

console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
