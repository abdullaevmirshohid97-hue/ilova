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
  // Qarzdorlik yo'nalishi — jadval qo'shilgan kunning o'zida bu ro'yxatga
  // tushdi. Keyinroq qo'shilsa, oradagi vaqtda hech kim tekshirmasdi.
  { nom: 'qarz_agents', pk: 'id', egasi: 'select org_id from qarz_agents where id = t.id' },
  { nom: 'qarz_clients', pk: 'id', egasi: 'select org_id from qarz_clients where id = t.id' },
  {
    nom: 'qarz_transactions',
    pk: 'id',
    egasi: 'select org_id from qarz_transactions where id = t.id',
  },
  { nom: 'qarz_audit', pk: 'id', egasi: 'select org_id from qarz_audit where id = t.id' },
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
  // Xodim ma'lumoti - maosh, telefon, KPI shartlari
  { nom: 'xodimlar', pk: 'id', egasi: 'select org_id from xodimlar where id = t.id' },
  { nom: 'pos_sotuvlar', pk: 'id', egasi: 'select org_id from pos_sotuvlar where id = t.id' },
  {
    // Qatorda org_id yo'q - sotuv orqali bog'lanadi. Aynan shunday
    // bog'lanishlarda filtr unutiladi.
    nom: 'pos_qatorlar',
    pk: 'id',
    egasi:
      'select s.org_id from pos_qatorlar q join pos_sotuvlar s on s.id = q.sotuv_id where q.id = t.id',
  },
  { nom: 'maosh_amallari', pk: 'id', egasi: 'select org_id from maosh_amallari where id = t.id' },
  // Credit Debit (kassa) yo'nalishi — jadvallar qo'shilgan kunning
  // o'zida ro'yxatga tushdi. Bu yerda pul turibdi: qaysi hisobda
  // qancha borligi mijoz ro'yxatidan kam maxfiy emas.
  { nom: 'kassa_hisoblar', pk: 'id', egasi: 'select org_id from kassa_hisoblar where id = t.id' },
  { nom: 'kassa_turkumlar', pk: 'id', egasi: 'select org_id from kassa_turkumlar where id = t.id' },
  { nom: 'kassa_klientlar', pk: 'id', egasi: 'select org_id from kassa_klientlar where id = t.id' },
  { nom: 'kassa_yozuvlar', pk: 'id', egasi: 'select org_id from kassa_yozuvlar where id = t.id' },
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

// ---------- Bo'sh jadval hech narsani isbotlamaydi ----------
// Yangi jadvalda ma'lumot yo'q bo'lsa, "0 qator" javobi sizish yo'qligini
// KO'RSATMAYDI - shunchaki ko'rsatadigan narsa yo'q. Shuning uchun begona
// tenantga vaqtincha yozuv qo'yamiz va u ko'rinmasligini tekshiramiz.
console.log('\n  begona tenant ma’lumoti bilan:');

const ozga = await sql(`select id from organizations where id <> '${orgId}' limit 1`);
if (ozga[0]?.id) {
  const ozgaOrg = ozga[0].id;
  const belgi = '__ajratish_sinovi__';

  const yaratilgan = await sql(`
    insert into xodimlar (org_id, ism, lavozim, oylik_stavka)
    values ('${ozgaOrg}', '${belgi}', 'sinov', 1)
    returning id
  `);
  const xodimId = yaratilgan[0].id;

  await sql(`
    insert into maosh_amallari (org_id, xodim_id, tur, summa, davr, izoh)
    values ('${ozgaOrg}', '${xodimId}', 'bonus', 1, current_date, '${belgi}')
  `);

  for (const [jadval, pk] of [
    ['xodimlar', 'id'],
    ['maosh_amallari', 'id'],
  ]) {
    const r = await fetch(`${URL}/rest/v1/${jadval}?select=${pk}&limit=100`, {
      headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token },
    });
    const rows = await r.json();
    const soni = Array.isArray(rows) ? rows.length : -1;
    tekshir(
      `${jadval}: begona tenant yozuvi ko‘rinmaydi`,
      soni === 0,
      soni === 0 ? 'ko‘rinmadi' : `${soni} qator KO‘RINDI`,
    );
  }

  // Begona xodimga maosh yozib ko'ramiz - RPC ni ham sinaymiz
  const amal = await fetch(`${URL}/rest/v1/rpc/maosh_amal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ p_xodim: xodimId, p_tur: 'bonus', p_summa: 100 }),
  });
  tekshir('begona xodimga maosh yozib bo‘lmaydi', amal.status >= 400, 'HTTP ' + amal.status);

  // ---- Qarzdorlik: begona tenantning agenti, klienti va yozuvi ----
  // Bo'sh jadvalda "0 qator" hech narsani isbotlamaydi, shuning uchun
  // begona tenantga vaqtincha yozuv qo'yiladi.
  const qAgent = await sql(`
    insert into qarz_agents (org_id, ism, rayon, telefon)
    values ('${ozgaOrg}', '${belgi}', 'sinov', '+998900000${Math.floor(Math.random() * 900 + 100)}')
    returning id
  `);
  const qAgentId = qAgent[0].id;
  const qClient = await sql(`
    insert into qarz_clients (org_id, agent_id, ism, apteka)
    values ('${ozgaOrg}', '${qAgentId}', '${belgi}', 'sinov apteka')
    returning id
  `);
  const qClientId = qClient[0].id;
  await sql(`
    insert into qarz_transactions (org_id, client_id, tur, summa, izoh)
    values ('${ozgaOrg}', '${qClientId}', 'chiqim', 1000, '${belgi}')
  `);
  await sql(`
    insert into qarz_audit (org_id, amal, jadval, yozuv_id, sabab)
    values ('${ozgaOrg}', 'qoshildi', 'qarz_transactions', '${qClientId}', '${belgi}')
  `);

  for (const [jadval, pk] of [
    ['qarz_agents', 'id'],
    ['qarz_clients', 'id'],
    ['qarz_transactions', 'id'],
    ['qarz_audit', 'id'],
  ]) {
    const r = await fetch(`${URL}/rest/v1/${jadval}?select=${pk}&limit=100`, {
      headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token },
    });
    const rows = await r.json();
    const soni = Array.isArray(rows) ? rows.length : -1;
    tekshir(
      `${jadval}: begona tenant yozuvi ko‘rinmaydi`,
      soni === 0,
      soni === 0 ? 'ko‘rinmadi' : `${soni} qator KO‘RINDI`,
    );
  }

  // Begona klientga yozuv qo'shib ko'ramiz — RPC ni ham sinaymiz
  const qYoz = await fetch(`${URL}/rest/v1/rpc/qarz_yozuv_qosh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ p_client_id: qClientId, p_tur: 'chiqim', p_summa: 100 }),
  });
  tekshir('begona klientga yozuv qo‘shib bo‘lmaydi', qYoz.status >= 400, 'HTTP ' + qYoz.status);

  const qSverka = await fetch(`${URL}/rest/v1/rpc/qarz_sverka`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ p_client_id: qClientId }),
  });
  tekshir('begona klient sverkasi ochilmaydi', qSverka.status >= 400, 'HTTP ' + qSverka.status);

  // ---- Credit Debit: begona tenantning hisobi va yozuvi ----
  // Yangi jadvalda "0 qator" hech narsani isbotlamaydi, shuning uchun
  // begona tenantga haqiqiy hisob va yozuv qo'yiladi.
  const kHisob = await sql(`
    insert into kassa_hisoblar (org_id, nom, turi, valyuta, boshlangich)
    values ('${ozgaOrg}', '${belgi}', 'naqd', 'UZS', 500)
    returning id
  `);
  const kHisobId = kHisob[0].id;
  const kTurkum = await sql(`
    insert into kassa_turkumlar (org_id, nom, turi)
    values ('${ozgaOrg}', '${belgi}', 'chiqim')
    returning id
  `);
  const kTurkumId = kTurkum[0].id;
  const kKlient = await sql(`
    insert into kassa_klientlar (org_id, ism, turi)
    values ('${ozgaOrg}', '${belgi}', 'mijoz')
    returning id
  `);
  const kKlientId = kKlient[0].id;
  await sql(`
    insert into kassa_yozuvlar (org_id, hisob_id, turkum_id, klient_id, turi, summa, izoh)
    values ('${ozgaOrg}', '${kHisobId}', '${kTurkumId}', '${kKlientId}', 'chiqim', 1000, '${belgi}')
  `);

  // Oldi-berdi va valyuta jadvallari keyin qo‘shilgan va uzoq vaqt shu
  // sinovdan tashqarida qolgan: siyosati migratsiyada bor edi, lekin uni
  // haqiqiy `authenticated` roli ostida hech kim tekshirmagan. Qarz
  // summasi va kurs — eng nozik ma’lumot, shuning uchun ular ham shu
  // yerda.
  const kBitim = await sql(`
    insert into kassa_bitimlar (org_id, klient_id, yonalish, nima, summa, valyuta, izoh)
    values ('${ozgaOrg}', '${kKlientId}', 'berdim', 'qarz', 777000, 'UZS', '${belgi}')
    returning id
  `);
  const kBitimId = kBitim[0].id;
  await sql(`
    insert into kassa_bitim_tolovlar (org_id, klient_id, bitim_id, yonalish, summa, valyuta)
    values ('${ozgaOrg}', '${kKlientId}', '${kBitimId}', 'oldim', 55000, 'UZS')
  `);
  // `ozgaOrg` — MAVJUD tashkilot, sinov yaratgani emas. Shuning uchun
  // bu yerga qo‘yilgan qator aynan `id` bo‘yicha o‘chiriladi: `org_id`
  // bo‘yicha o‘chirish o‘sha tashkilotning haqiqiy kurslarini ham olib
  // ketardi. TJS tanlandi — ro‘yxatdagi eng kam ishlatiladigani, ya’ni
  // bor qator bilan to‘qnashmaydi.
  const kVal0 = await sql(`
    insert into kassa_valyutalar (org_id, valyuta, kurs)
    values ('${ozgaOrg}', 'TJS', 1080.5)
    on conflict (org_id, valyuta) do nothing
    returning id
  `);
  const kValId = kVal0[0]?.id ?? null;

  for (const [jadval, pk] of [
    ['kassa_hisoblar', 'id'],
    ['kassa_turkumlar', 'id'],
    ['kassa_klientlar', 'id'],
    ['kassa_yozuvlar', 'id'],
    ['kassa_bitimlar', 'id'],
    ['kassa_bitim_tolovlar', 'id'],
    ['kassa_valyutalar', 'id'],
  ]) {
    const r = await fetch(`${URL}/rest/v1/${jadval}?select=${pk}&limit=100`, {
      headers: { apikey: K.anon_key, Authorization: 'Bearer ' + token },
    });
    const rows = await r.json();
    const soni = Array.isArray(rows) ? rows.length : -1;
    tekshir(
      `${jadval}: begona tenant yozuvi ko‘rinmaydi`,
      soni === 0,
      soni === 0 ? 'ko‘rinmadi' : `${soni} qator KO‘RINDI`,
    );
  }

  // Qoldiq funksiyalari SECURITY DEFINER emas — ya'ni RLS ular orqali
  // ham ishlashi kerak. Begona hisobning qoldig'i chiqsa, pul summasi
  // jadval yopiq bo'lsa ham sizib chiqqan bo'lardi.
  const kQoldiq = await fetch(`${URL}/rest/v1/rpc/kassa_hisob_qoldiq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ p_hisob_id: kHisobId }),
  });
  const kQoldiqJavob = await kQoldiq.text();
  tekshir(
    'begona hisob qoldig‘i ko‘rinmaydi',
    kQoldiq.status >= 400 || kQoldiqJavob.trim() === 'null' || kQoldiqJavob.trim() === '',
    'HTTP ' + kQoldiq.status + ' → ' + kQoldiqJavob.slice(0, 40),
  );

  const kBarcha = await fetch(`${URL}/rest/v1/rpc/kassa_qoldiqlar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({}),
  });
  const kBarchaRows = await kBarcha.json().catch(() => null);
  const begonaChiqdi =
    Array.isArray(kBarchaRows) && kBarchaRows.some((x) => x.hisob_id === kHisobId);
  tekshir(
    'kassa_qoldiqlar begona hisobni qaytarmaydi',
    !begonaChiqdi,
    Array.isArray(kBarchaRows) ? `${kBarchaRows.length} hisob` : 'ro‘yxat kelmadi',
  );

  // Begona hisobga yozuv yozib ko'ramiz: RLS `with check` ni sinaymiz
  const kYoz = await fetch(`${URL}/rest/v1/kassa_yozuvlar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ org_id: ozgaOrg, hisob_id: kHisobId, turi: 'kirim', summa: 100 }),
  });
  tekshir('begona hisobga yozuv yozib bo‘lmaydi', kYoz.status >= 400, 'HTTP ' + kYoz.status);

  // Begona tashkilotga kurs yozish: kurs qalbakilashtirilsa, o‘sha
  // tashkilotning bosh sahifadagi jami balansi butunlay boshqa raqam
  // bo‘lib ko‘rinardi.
  const kVal = await fetch(`${URL}/rest/v1/kassa_valyutalar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ org_id: ozgaOrg, valyuta: 'EUR', kurs: 1 }),
  });
  tekshir('begona tashkilotga kurs yozib bo‘lmaydi', kVal.status >= 400, 'HTTP ' + kVal.status);

  // `kassa_ozgarishlar` — ilova HAMMA ma’lumotni shu bitta funksiya
  // orqali oladi. U SECURITY DEFINER emas, ya’ni RLS unga ham
  // qo‘llanishi kerak. Sizsa, bitta chaqiruv butun boshqa
  // tashkilotning daftarini berib qo‘yardi.
  const kSinx = await fetch(`${URL}/rest/v1/rpc/kassa_ozgarishlar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ p_kursor: 0, p_chegara: 2000 }),
  });
  const kSinxJavob = await kSinx.json().catch(() => null);
  const begonaIz = JSON.stringify(kSinxJavob ?? {});
  const izlar = [kHisobId, kKlientId, kBitimId].filter((x) => begonaIz.includes(x));
  tekshir(
    'kassa_ozgarishlar begona tashkilot ma’lumotini bermaydi',
    izlar.length === 0,
    izlar.length === 0 ? 'iz yo‘q' : `${izlar.length} ta id CHIQDI`,
  );

  await sql(`delete from kassa_bitim_tolovlar where bitim_id = '${kBitimId}'`);
  await sql(`delete from kassa_bitimlar where id = '${kBitimId}'`);
  if (kValId) await sql(`delete from kassa_valyutalar where id = '${kValId}'`);
  await sql(`delete from kassa_yozuvlar where hisob_id = '${kHisobId}'`);
  await sql(`delete from kassa_klientlar where id = '${kKlientId}'`);
  await sql(`delete from kassa_turkumlar where id = '${kTurkumId}'`);
  await sql(`delete from kassa_hisoblar where id = '${kHisobId}'`);

  await sql(`delete from qarz_audit where sabab = '${belgi}'`);
  await sql(`delete from qarz_transactions where client_id = '${qClientId}'`);
  await sql(`delete from qarz_clients where id = '${qClientId}'`);
  await sql(`delete from qarz_agents where id = '${qAgentId}'`);

  await sql(`delete from maosh_amallari where izoh = '${belgi}' or xodim_id = '${xodimId}'`);
  await sql(`delete from xodimlar where id = '${xodimId}'`);
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
