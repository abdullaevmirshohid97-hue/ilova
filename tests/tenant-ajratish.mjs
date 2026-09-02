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
  // Hujjat sozlamasi: ichida biznesning rekvizitlari (manzil, STIR,
  // bank hisobi) turadi - mijoz ro'yxatidan kam maxfiy emas.
  {
    nom: 'org_hujjat_sozlama',
    pk: 'org_id',
    egasi: 'select org_id from org_hujjat_sozlama where org_id = t.id',
  },
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

// ---------- Fayllar ----------
// 2026-09-02: avatars bucket'i OCHIQ edi. Ro'yxati olinardi, keyin
// o'sha yo'l bilan mijozning surati hech qanday login'siz yuklab
// olindi (86 KB, boshqa tenantning haqiqiy mijozi). Mahsulot rasmlari
// ro'yxati ham ochiq edi - raqobatchi butun katalogni ko'chirib
// olishi mumkin edi. O'chirish siyosati esa org_id ni tekshirmasdi.
console.log('\n  fayllar:');

const bucketlar = await sql("select id, public from storage.buckets where id in ('avatars','product-images')");
const avatarB = bucketlar.find((b) => b.id === 'avatars');
tekshir(
  'avatars bucket yopiq',
  avatarB?.public === false,
  avatarB?.public === false ? 'public=false' : 'OCHIQ — surat internetda',
);

async function royxat(tok, bucket) {
  const r = await fetch(`${URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: K.anon_key,
      ...(tok ? { Authorization: 'Bearer ' + tok } : {}),
    },
    body: JSON.stringify({ prefix: '', limit: 100, offset: 0 }),
  });
  const j = await r.json();
  return Array.isArray(j) ? j.length : 0;
}

for (const b of ['avatars', 'product-images']) {
  const n = await royxat(null, b);
  tekshir(`${b}: anon ro‘yxat ololmaydi`, n === 0, n ? `${n} ta fayl ko‘rindi` : 'bo‘sh');
}

// Begona tenantning suratiga havola so'raymiz
const begonaAvatar = await sql(`
  select c.photo_path from customers c
  where c.photo_path is not null and c.org_id <> '${orgId}' limit 1
`);
if (begonaAvatar[0]?.photo_path) {
  const yol = begonaAvatar[0].photo_path;
  const imzo = await fetch(`${URL}/storage/v1/object/sign/avatars/${encodeURI(yol)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  tekshir('begona tenant surati imzolanmaydi', imzo.status !== 200, 'HTTP ' + imzo.status);

  const ochiq = await fetch(`${URL}/storage/v1/object/public/avatars/${encodeURI(yol)}?t=${Date.now()}`);
  tekshir('surat ochiq havola bilan ochilmaydi', ochiq.status !== 200, 'HTTP ' + ochiq.status);
} else {
  console.log('  \x1b[33m!\x1b[0m begona tenantda suratli mijoz yo‘q — o‘tkazib yuborildi');
}

// Logo bucket'i: yo'l tenant id bilan boshlanadi, ya'ni begona yo'lga
// fayl qo'yib bo'lmasligi kerak. Bu sinov yozadi - shuning uchun
// oxirida o'zidan keyin tozalaydi.
const begonaOrg = await sql(`select id from organizations where id <> '${orgId}' limit 1`);
if (begonaOrg[0]?.id) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  async function yukla(yol) {
    const r = await fetch(`${URL}/storage/v1/object/org-logos/${yol}`, {
      method: 'POST',
      headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token, 'Content-Type': 'image/png' },
      body: png,
    });
    return r.status;
  }

  const begonaYol = `${begonaOrg[0].id}/__sinov__.png`;
  tekshir('logo: begona tenant yo‘liga yozib bo‘lmaydi', (await yukla(begonaYol)) !== 200);
  tekshir('logo: tenantsiz yo‘lga yozib bo‘lmaydi', (await yukla('__sinov__.png')) !== 200);

  const ozYol = `${orgId}/__sinov__.png`;
  const ozHolat = await yukla(ozYol);
  tekshir('logo: o‘z yo‘liga yozadi', ozHolat === 200, 'HTTP ' + ozHolat);

  if (ozHolat === 200) {
    const ochiq = await fetch(`${URL}/storage/v1/object/public/org-logos/${ozYol}?t=${Date.now()}`);
    tekshir('logo: ochiq havola bilan ochilmaydi', ochiq.status !== 200, 'HTTP ' + ochiq.status);
    // Sinov bazada iz qoldirmasin
    await fetch(`${URL}/storage/v1/object/org-logos/${ozYol}`, {
      method: 'DELETE',
      headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token },
    });
  }
}

// Begona tenantning mahsulot rasmini o'chirib ko'ramiz
const begonaRasm = await sql(`
  select s.name from storage.objects s
  join products p on p.id::text = split_part(s.name, '/', 1)
  where s.bucket_id = 'product-images' and p.org_id <> '${orgId}' limit 1
`);
if (begonaRasm[0]?.name) {
  const ochir = await fetch(`${URL}/storage/v1/object/product-images/${encodeURI(begonaRasm[0].name)}`, {
    method: 'DELETE',
    headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token },
  });
  tekshir('begona tenant rasmi o‘chirilmaydi', ochir.status !== 200, 'HTTP ' + ochir.status);
}

// ---------- Har bir view security_invoker bilanmi ----------
// Yuqoridagi sinov sizishni ANIQ ushlaydi, lekin faqat ma'lumot mavjud
// bo'lsa: yangi, hali bo'sh jadval ustidagi view sinovdan o'tib ketadi.
// Shuning uchun sababning o'zini ham tekshiramiz - bu arzon va yangi
// view qo'shilgan kunning o'zida ogohlantiradi.
console.log('\n  view sozlamalari:');
const viewlar = await sql(`
  select c.relname as nom,
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'yo''q') as si
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
  order by 1
`);
for (const v of viewlar) {
  const yoqilgan = v.si === 'true' || v.si === 'on';
  tekshir(
    `${v.nom}: security_invoker`,
    yoqilgan,
    yoqilgan ? v.si : 'YO‘Q — view RLS ni chetlab o‘tadi',
  );
}

console.log(
  '\n' + (yiqildi === 0 ? '\x1b[32mTENANTLAR AJRATILGAN\x1b[0m' : `\x1b[31m${yiqildi} TA JOYDAN SIZMOQDA\x1b[0m`) + '\n',
);
process.exit(yiqildi === 0 ? 0 : 1);
