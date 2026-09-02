// =============================================================
//  TENANT AJRATILISHI SINOVI
//
//  2026-09-02 da jonli bazada tenantlar orasida mijoz ma'lumoti
//  sizgani topildi: Mary Collection admini o'z panelida boshqa
//  tenantning mijozlarini ko'rgan.
//
//  Sabab customers_masked VIEW'ida edi. Postgres'da view standart
//  holatda o'z EGASI nomidan bajariladi va asosidagi jadvalning RLS
//  siyosatlari umuman ishlamaydi. Siyosatlar to'g'ri yozilgan edi -
//  ular shunchaki chaqirilmagan.
//
//  Shuning uchun bu sinov SIYOSAT MATNINI o'qimaydi. U haqiqiy tenant
//  admini bilan tizimga kiradi, har bir jadvaldan o'qiydi va qaytgan
//  HAR QATOR haqiqatan o'shaniki ekanini bazadan tasdiqlaydi.
//  Qanday yo'l bilan sizishidan qat'i nazar (view, RPC, unutilgan
//  siyosat) - sinov ushlaydi.
//
//  Ishga tushirish:  node tests/tenant-ajratish.mjs
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
const MGMT = `https://api.supabase.com/v1/projects/${K.ref}/database/query`;

async function sql(q) {
  const r = await fetch(MGMT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
  return j;
}

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ SIZMOQDA\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

// Har jadval uchun: qatorning HAQIQIY egasi qaysi tenant ekanini
// aniqlaydigan SQL. org_id ustuni bo'lmagan jadvallar bog'lanish
// orqali tekshiriladi - aynan shu yerda xato yashirinadi, chunki
// "org_id yo'q" degani "tenantsiz" degani emas.
const JADVALLAR = [
  { nom: 'customers_masked', pk: 'id', egasi: 'select org_id from customers where id = t.id' },
  { nom: 'customers', pk: 'id', egasi: 'select org_id from customers where id = t.id' },
  { nom: 'products', pk: 'id', egasi: 'select org_id from products where id = t.id' },
  { nom: 'categories', pk: 'id', egasi: 'select org_id from categories where id = t.id' },
  { nom: 'price_groups', pk: 'id', egasi: 'select org_id from price_groups where id = t.id' },
  { nom: 'managers', pk: 'id', egasi: 'select org_id from managers where id = t.id' },
  { nom: 'design_orders', pk: 'id', egasi: 'select org_id from design_orders where id = t.id' },
  {
    nom: 'orders',
    pk: 'id',
    egasi: 'select c.org_id from orders o join customers c on c.id = o.customer_id where o.id = t.id',
  },
  {
    nom: 'order_items',
    pk: 'id',
    egasi:
      'select c.org_id from order_items oi join orders o on o.id = oi.order_id ' +
      'join customers c on c.id = o.customer_id where oi.id = t.id',
  },
  {
    // prices -> variant -> product -> org: uch bo'g'inli yo'l.
    // Aynan shunday uzun yo'llarda org filtri unutiladi.
    nom: 'prices',
    pk: 'id',
    egasi:
      'select p.org_id from prices pr join product_variants v on v.id = pr.variant_id ' +
      'join products p on p.id = v.product_id where pr.id = t.id',
  },
  {
    nom: 'product_variants',
    pk: 'id',
    egasi: 'select p.org_id from product_variants v join products p on p.id = v.product_id where v.id = t.id',
  },
  {
    nom: 'stock_levels',
    pk: 'variant_id',
    egasi:
      'select p.org_id from stock_levels s join product_variants v on v.id = s.variant_id ' +
      'join products p on p.id = v.product_id where s.variant_id = t.id',
  },
  {
    nom: 'ledger_entries',
    pk: 'id',
    egasi: 'select c.org_id from ledger_entries l join customers c on c.id = l.customer_id where l.id = t.id',
  },
  {
    nom: 'payments',
    pk: 'id',
    egasi: 'select c.org_id from payments pm join customers c on c.id = pm.customer_id where pm.id = t.id',
  },
  { nom: 'organizations', pk: 'id', egasi: 'select id from organizations where id = t.id' },
];

console.log('\n\x1b[1mTENANT AJRATILISHI\x1b[0m');

// ---------- Kim bo'lib kiramiz ----------
const kirish = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
  body: JSON.stringify({ email: K.admin?.email ?? '', password: K.admin?.password ?? '' }),
});
const token = (await kirish.json()).access_token ?? null;
if (!token) {
  console.error('\n  Tenant admini bilan kirib bo‘lmadi — kalitlar.json dagi admin tekshirilsin.\n');
  process.exit(1);
}

const meniki = await sql(`
  select p.org_id, o.name
  from profiles p join organizations o on o.id = p.org_id
  where p.id = (select id from auth.users where email = '${K.admin.email}')
`);
const orgId = meniki[0]?.org_id;
const orgNomi = meniki[0]?.name;
console.log(`\n  hisob: ${K.admin.email}  ·  tenant: ${orgNomi}\n`);

const jamiOrg = (await sql('select count(*) as n from organizations'))[0].n;
if (Number(jamiOrg) < 2) {
  console.log('  \x1b[33m!\x1b[0m Bazada bitta tenant bor — sizish sinovi mazmunsiz.\n');
  process.exit(0);
}

// ---------- Har jadvalni bosib ko'ramiz ----------
for (const j of JADVALLAR) {
  const r = await fetch(`${URL}/rest/v1/${j.nom}?select=${j.pk}&limit=1000`, {
    headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token },
  });
  const rows = await r.json();

  if (!Array.isArray(rows)) {
    // O'qish taqiqlangan bo'lsa - bu ham to'g'ri holat (sizish yo'q)
    tekshir(j.nom, true, 'o‘qib bo‘lmadi (yopiq)');
    continue;
  }
  if (rows.length === 0) {
    tekshir(j.nom, true, '0 qator');
    continue;
  }

  const idlar = rows.map((x) => `'${x[j.pk]}'`).join(',');
  const begona = await sql(`
    select count(*) as n
    from (select unnest(array[${idlar}]::uuid[]) as id) t
    where coalesce((${j.egasi})::text, '') <> '${orgId}'
  `);

  const n = Number(begona[0].n);
  tekshir(
    j.nom,
    n === 0,
    n === 0 ? `${rows.length} qator, hammasi o‘ziniki` : `${n} ta BEGONA qator ${rows.length} tadan`,
  );
}

console.log(
  '\n' + (yiqildi === 0 ? '\x1b[32mTENANTLAR AJRATILGAN\x1b[0m' : `\x1b[31m${yiqildi} TA JADVALDAN SIZMOQDA\x1b[0m`) + '\n',
);
process.exit(yiqildi === 0 ? 0 : 1);
