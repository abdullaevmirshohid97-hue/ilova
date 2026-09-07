// =============================================================
//  DONAGA SOTUV VA FAKTURANI TAHRIRLASH
//
//  Ikkalasi ham PULGA va QOLDIQQA tegadi, shuning uchun sinov
//  haqiqiy sotuv qilib ko'radi: soxta sklad, soxta dori, soxta
//  mijoz yaratiladi va oxirida hammasi o'chiriladi.
//
//  Tekshiriladigan asosiy narsalar:
//   · dona narxi = pachka narxi / dona soni, YUQORIGA yaxlitlangan
//   · qoldiq ulushiga qarab kamayadi (10 dona = 0.111 pachka)
//   · tahrir sababsiz o'tmaydi va iz qoldiradi
//   · tahrirda qoldiq ikki qadamda to'g'rilanadi
//
//  Ishga tushirish:  node tests/dona-tahrir.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mDONAGA SOTUV VA TAHRIR\x1b[0m');

let K = null;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}
if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kalitlar yo‘q — sinov o‘tkazib yuborildi\n');
  process.exit(0);
}

const sql = async (q) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
};
// RPC'lar ichida is_super_admin() va auth.uid() bor
const admin = (q) =>
  sql(
    `select set_config('request.jwt.claims',
       json_build_object('sub', (select id from profiles where role = 'super_admin' limit 1))::text,
       true) as x;
     ${q}`,
  );

const NOM = 'SINOV DONA ДОРИ пор.4.5г.№90';
const n = (x) => Number(x);

async function tozala() {
  await sql(`
    delete from dori_sale_items where sale_id in (
      select id from dori_sales where warehouse_id in (
        select id from dori_warehouses where name like 'SINOV-DONA%'));
    delete from dori_sale_edits where sale_id in (
      select id from dori_sales where warehouse_id in (
        select id from dori_warehouses where name like 'SINOV-DONA%'));
    delete from dori_sales where warehouse_id in (
      select id from dori_warehouses where name like 'SINOV-DONA%');
    delete from dori_offers where product_id in (select id from dori_products where name = '${NOM}');
    delete from dori_products where name = '${NOM}';
    delete from dori_customers where phone_norm = '998000009090';
    delete from dori_warehouses where name like 'SINOV-DONA%';
  `);
}

try {
  await tozala();

  // ---------- 1. Pachkani nomdan topish ----------
  console.log('\n1. Pachka nomdan topiladi');

  const [{ id: wh }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-DONA', 96) returning id;",
  );
  const [{ id: pid, pachka }] = await sql(
    `insert into dori_products (name, name_norm, is_active)
     values ('${NOM}', dori_norm('${NOM}'), true) returning id, pachka;`,
  );
  tekshir('trigger pachkani o‘zi qo‘ydi', n(pachka) === 90, pachka);

  const [{ p1 }] = await sql(`select dori_pachka_top('Момат рино спрей наз 60доз') as p1;`);
  tekshir('«60доз» pachka emas', p1 === null, String(p1), 'doza — dona soni emas');
  const [{ p2 }] = await sql(`select dori_pachka_top('Флуцинар N 15г Полша') as p2;`);
  tekshir('«N 15г» pachka emas', p2 === null, String(p2), 'gramm — dona soni emas');
  const [{ p3 }] = await sql(`select dori_pachka_top('Влажные салфетки SOVY №8х8') as p3;`);
  tekshir('ko‘paytma hisoblanadi', n(p3) === 64, p3);

  // Qo'ldagi qiymat ustidan yozilmasin
  await sql(`update dori_products set pachka = 12 where id = '${pid}';`);
  await sql(`update dori_products set name = name || ' ' where id = '${pid}';`);
  const [{ pachka: qolda }] = await sql(`select pachka from dori_products where id = '${pid}';`);
  tekshir('qo‘lda qo‘yilgan pachka saqlanadi', n(qolda) === 12, qolda, 'import uni buzmasin');
  await sql(`update dori_products set pachka = 90, name = '${NOM}' where id = '${pid}';`);

  // ---------- 2. Donaga sotuv ----------
  console.log('\n2. Donaga sotuv');

  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
             values ('${wh}', '${pid}', 2434740, 2605172, 10, 'sinov');`);
  const [{ id: mid }] = await sql(
    `insert into dori_customers (phone, phone_norm, name, pharmacy)
     values ('998000009090', '998000009090', 'Sinov Dona', 'SINOV DORIXONA') returning id;`,
  );

  const [{ j: sot }] = await admin(`
    select dori_sotuv_yarat('${wh}', '${mid}',
      '[{"product_id":"${pid}","qty":10,"birlik":"dona"}]'::jsonb, 'dona sinovi') as j;`);
  tekshir('sotuv yaratildi', sot?.ok === true, sot?.error ?? '№' + sot?.sale_no);

  const [q] = await sql(
    `select qty, price, sum, birlik, pachka from dori_sale_items
      where sale_id = '${sot.sale_id}';`,
  );
  // 2 605 172 / 90 = 28 946.35... -> yuqoriga 28 947
  tekshir('dona narxi yuqoriga yaxlitlandi', n(q.price) === 28947, q.price, '2 605 172 / 90');
  tekshir('miqdor donada qoldi', n(q.qty) === 10, q.qty);
  tekshir('summa = dona narxi × miqdor', n(q.sum) === 289470, q.sum);
  tekshir('birlik yozildi', q.birlik === 'dona', q.birlik);
  tekshir('pachka muzlatildi', n(q.pachka) === 90, q.pachka, 'nom keyin o‘zgarsa faktura o‘zgarmasin');

  const [{ stock: qoldiq1 }] = await sql(
    `select stock from dori_offers where warehouse_id = '${wh}' and product_id = '${pid}';`,
  );
  tekshir(
    'qoldiq ulushiga qarab kamaydi',
    Math.abs(n(qoldiq1) - (10 - 10 / 90)) < 0.001,
    qoldiq1 + ' (10 - 0.1111)',
  );

  // Pachkada sotuv eskicha ishlashi kerak
  const [{ j: sot2 }] = await admin(`
    select dori_sotuv_yarat('${wh}', '${mid}',
      '[{"product_id":"${pid}","qty":2}]'::jsonb, 'pachka sinovi') as j;`);
  const [q2] = await sql(
    `select qty, price, sum, birlik from dori_sale_items where sale_id = '${sot2.sale_id}';`,
  );
  tekshir('pachka narxi bo‘linmadi', n(q2.price) === 2605172, q2.price);
  tekshir('pachka summasi to‘g‘ri', n(q2.sum) === 5210344, q2.sum);
  tekshir('birlik standarti — pachka', q2.birlik === 'pachka', q2.birlik);

  // ---------- 3. Tahrir: quruq sinov ----------
  console.log('\n3. Tahrir — quruq sinov');

  const [{ j: quruq }] = await admin(`
    select dori_sotuv_tahrir('${sot.sale_id}',
      '[{"product_id":"${pid}","qty":20,"birlik":"dona"}]'::jsonb,
      null, null, null, false) as j;`);
  tekshir('quruq sinov o‘tdi', quruq?.ok === true, quruq?.error);
  tekshir('yozilmagani aytiladi', quruq?.qollandi === false);
  tekshir('eski summa ko‘rsatiladi', n(quruq?.eski?.total) === 289470, quruq?.eski?.total);
  tekshir('yangi summa ko‘rsatiladi', n(quruq?.yangi?.total) === 578940, quruq?.yangi?.total);
  tekshir(
    'qoldiq o‘zgarishi ko‘rsatiladi',
    Math.abs(n(quruq?.qoldiq_ozgarishi?.[0]?.farq) - 10 / 90) < 0.001,
    quruq?.qoldiq_ozgarishi?.[0]?.farq,
  );

  const [{ n: hali }] = await sql(
    `select count(*)::int as n from dori_sale_edits where sale_id = '${sot.sale_id}';`,
  );
  tekshir('quruq sinov iz qoldirmaydi', hali === 0, hali);
  const [{ sum: summaHali }] = await sql(
    `select sum from dori_sale_items where sale_id = '${sot.sale_id}';`,
  );
  tekshir('quruq sinov hujjatga tegmaydi', n(summaHali) === 289470, summaHali);

  // ---------- 4. Tahrir: sabab majburiy ----------
  console.log('\n4. Sabab majburiy');

  let sababXato = '';
  try {
    await admin(`
      select dori_sotuv_tahrir('${sot.sale_id}',
        '[{"product_id":"${pid}","qty":20,"birlik":"dona"}]'::jsonb,
        null, null, null, true) as j;`);
  } catch (e) {
    sababXato = String(e.message);
  }
  tekshir(
    'sababsiz tahrir o‘tmaydi',
    sababXato.includes('SABAB_KERAK'),
    sababXato.slice(0, 60) || 'xato bermadi',
  );

  // ---------- 5. Tahrir: qo'llash ----------
  console.log('\n5. Tahrir qo‘llanadi');

  const [{ j: tahrir }] = await admin(`
    select dori_sotuv_tahrir('${sot.sale_id}',
      '[{"product_id":"${pid}","qty":20,"birlik":"dona"}]'::jsonb,
      null, 'miqdor tuzatildi', 'Operator 10 o‘rniga 20 dona bergan', true) as j;`);
  tekshir('tahrir qo‘llandi', tahrir?.ok === true && tahrir?.qollandi === true, tahrir?.error);
  tekshir('yangi summa yozildi', n(tahrir?.total) === 578940, tahrir?.total);

  const [{ total: sTotal, comment: sIzoh }] = await sql(
    `select total, comment from dori_sales where id = '${sot.sale_id}';`,
  );
  tekshir('sotuv jamisi yangilandi', n(sTotal) === 578940, sTotal);
  tekshir('izoh yangilandi', sIzoh === 'miqdor tuzatildi', sIzoh);

  const [{ stock: qoldiq2 }] = await sql(
    `select stock from dori_offers where warehouse_id = '${wh}' and product_id = '${pid}';`,
  );
  // 10 - 2 (pachkada sotilgan) - 20/90 = 7.7778
  tekshir(
    'qoldiq farqigagina o‘zgardi',
    Math.abs(n(qoldiq2) - (10 - 2 - 20 / 90)) < 0.001,
    qoldiq2 + ' (10 - 2 - 0.2222)',
  );

  const iz = await sql(
    `select sabab, oldingi, yangi, edited_by from dori_sale_edits where sale_id = '${sot.sale_id}';`,
  );
  tekshir('iz qoldi', iz.length === 1, iz.length);
  tekshir('sabab yozildi', iz[0]?.sabab?.includes('20 dona'), iz[0]?.sabab);
  tekshir('kim tahrirlagani yozildi', iz[0]?.edited_by != null);
  tekshir('oldingi summa izda', n(iz[0]?.oldingi?.total) === 289470, iz[0]?.oldingi?.total);

  const [{ j: tarix }] = await admin(`select dori_sotuv_tahrirlari('${sot.sale_id}') as j;`);
  tekshir('tahrir tarixi o‘qiladi', Array.isArray(tarix) && tarix.length === 1, tarix?.length);

  // ---------- 6. Faktura birlikni ko'rsatadi ----------
  console.log('\n6. Faktura');

  const [{ j: fak }] = await sql(`select dori_sotuv_faktura_srv('${sot.sale_id}') as j;`);
  tekshir('faktura qatorida birlik bor', fak?.items?.[0]?.birlik === 'dona', fak?.items?.[0]?.birlik);
  tekshir('faktura pachka hajmini biladi', n(fak?.items?.[0]?.pachka) === 90, fak?.items?.[0]?.pachka);
  tekshir('faktura tahrirlanganini bildiradi', n(fak?.tahrirlar) === 1, fak?.tahrirlar);
  tekshir('faktura jamisi yangi', n(fak?.total) === 578940, fak?.total);

  // ---------- 7. Bekor qilingan sotuv tahrirlanmaydi ----------
  console.log('\n7. To‘siqlar');

  await admin(`select dori_sotuv_bekor('${sot2.sale_id}');`);
  let bekorXato = '';
  try {
    await admin(`
      select dori_sotuv_tahrir('${sot2.sale_id}',
        '[{"product_id":"${pid}","qty":1}]'::jsonb, null, null, 'sinov', true) as j;`);
  } catch (e) {
    bekorXato = String(e.message);
  }
  tekshir(
    'bekor qilingan sotuv tahrirlanmaydi',
    bekorXato.includes('FAQAT_YOPILGAN_SOTUV'),
    bekorXato.slice(0, 60) || 'xato bermadi',
    );

  const yozish = await sql(`
    select count(*)::int as n from pg_policies
    where tablename = 'dori_sale_edits' and cmd in ('INSERT', 'UPDATE', 'DELETE');`);
  tekshir(
    'izni panel orqali o‘zgartirib bo‘lmaydi',
    yozish[0].n === 0,
    'faqat funksiya yozadi',
  );

  for (const fn of ['dori_sotuv_tahrir', 'dori_sotuv_ochish', 'dori_sotuv_tahrirlari']) {
    const r = await sql(`
      select position('is_super_admin' in pg_get_functiondef(oid)) > 0 as tekshiruv,
             has_function_privilege('anon', oid, 'execute') as anon
      from pg_proc where proname = '${fn}' limit 1;`);
    tekshir(`${fn}: super admin tekshiruvi`, r[0]?.tekshiruv === true);
    tekshir(`${fn}: anon chaqirolmaydi`, r[0]?.anon === false);
  }
  // ---------- 8. Ekran ----------
  console.log('\n8. Ekran');

  const sotuv = readFileSync(join(ROOT, 'apps/admin/src/pages/DoriSotuv.tsx'), 'utf8');
  const modal = readFileSync(join(ROOT, 'apps/admin/src/components/SotuvTahrir.tsx'), 'utf8');
  const faktura = readFileSync(join(ROOT, 'supabase/functions/dori-faktura/index.ts'), 'utf8');

  tekshir('qidiruvda pachka ko‘rinadi', /1 pachka = \{d\.pachka\} dona/.test(sotuv));
  tekshir('savatda birlik tanlovi bor', /birlikQoy\(x\.id, b\)/.test(sotuv));
  tekshir(
    'pachka bo‘linmasa tanlov ko‘rsatilmaydi',
    /x\.pachka > 1 \? \(/.test(sotuv),
    'bosib bo‘lmaydigan tugma savol tug‘diradi',
  );
  tekshir(
    'ekrandagi yaxlitlash bazadagidek',
    /Math\.ceil\(x\.price \/ Math\.max\(x\.pachka \|\| 1, 1\)\)/.test(sotuv),
    'aks holda ekranda va fakturada har xil summa',
  );
  tekshir('sotuvga birlik yuboriladi', /birlik: x\.birlik/.test(sotuv));
  tekshir(
    'savatda pachka narxi saqlanadi',
    /`price` DOIM pachka narxi/.test(sotuv),
    'bo‘lingan narx saqlansa ikki marta bo‘linardi',
  );
  tekshir(
    'birlik almashganda miqdor qayta hisoblanmaydi',
    /Miqdor QAYTA HISOBLANMAYDI/.test(sotuv),
  );

  tekshir('tarixdan tahrir ochiladi', /setTahrir\(s\.id\)/.test(sotuv));
  tekshir(
    'tahrir faqat yopilgan sotuvga',
    /s\.status === 'done' && \(\s*<button onClick=\{\(\) => setTahrir/.test(sotuv),
  );
  tekshir('sabab bo‘lmasa saqlanmaydi', /!sabab\.trim\(\)/.test(modal));
  tekshir('avval quruq sinov tugmasi bor', /AVVAL KO/.test(modal));
  tekshir(
    'o‘zgarish quruq sinovni eskirtiradi',
    /function ozgardi[\s\S]{0,200}setQuruq\(null\)/.test(modal),
    'eski hisobga qarab tasdiqlab yubormasin',
  );
  tekshir('skladda yo‘q dori saqlashni to‘sadi', /yoq\.length > 0/.test(modal));
  tekshir(
    'narx o‘zgargani ko‘rsatiladi',
    /narx o‘zgargan/.test(modal),
    'tahrir yangi narx bilan hisoblanadi',
  );

  tekshir('fakturada birlik ustuni bor', /U_BIRLIK/.test(faktura));
  tekshir(
    'birlik ustuni faqat kerak bo‘lganda',
    /items\.some\(\(i\) => i\?\.birlik === 'dona'\)/.test(faktura),
  );
  tekshir(
    'faktura tuzatilganini bildiradi',
    /Tuzatilgan/.test(faktura),
    'mijozdagi nusxa eskirgan bo‘lishi mumkin',
  );
} finally {
  await tozala();
  const [{ n: qoldi }] = await sql(
    "select count(*)::int as n from dori_warehouses where name like 'SINOV-DONA%';",
  );
  tekshir('sinov ma’lumotlari tozalandi', qoldi === 0, qoldi);
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
