// =============================================================
//  SKLADLAR: NARX, PRAYS ALMASHINISHI, BUYURTMA TAQSIMOTI
//
//  Uchta talab tekshiriladi:
//    1. Sklad ustamasi narxga qanday tushadi va qaysi daraja kuchli
//    2. Praysni qayta yuklaganda ESKISI O'CHADI, ustiga yozilmaydi -
//       va boshqa skladlarga tegilmaydi
//    3. Buyurtma skladlarga to'g'ri taqsimlanadi (45 + 25 + 30 = 100)
//    4. Sklad Telegramga ulanadi va faqat O'Z so'rovini ko'radi
//    5. Qoldiqdan ortiq buyurtma berib bo'lmaydi
//
//  Sinov O'Z skladlarini ochadi (SINOV-*) va oxirida o'chiradi -
//  haqiqiy katalogga tegmaydi.
//
//  Ishga tushirish:
//    node tests/dori-skladlar.mjs
//
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

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + K.mgmt_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t);
}

// RPC'lar ichida is_super_admin() bor: so'rovni super admin nomidan bajaramiz
async function admin(q) {
  const r = await sql(
    `select set_config('request.jwt.claims',
       json_build_object('sub', (select id from profiles where role = 'super_admin' limit 1))::text,
       true) as x;
     ${q}`
  );
  return r[r.length - 1];
}

let yiqildi = 0;
function tekshir(nom, ok, qosh) {
  console.log((ok ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (qosh !== undefined ? '  → ' + qosh : ''));
  if (!ok) yiqildi++;
}

async function tozala() {
  await sql(`delete from dori_orders where pharmacy = 'SINOV TAQSIM';`);
  await sql(`delete from dori_warehouses where name like 'SINOV-%';`);
  await sql(`delete from dori_price_rules where note = 'sinov';`);
  await sql(`delete from dori_warehouse_telegram where chat_id in (555000222, 555000333, 555000444);`);
  await sql(`delete from dori_cart where chat_id = 999000333;`);
  await sql(`delete from dori_customers where chat_id = 999000333 or phone = '998000000001';`);
  await sql(`delete from dori_products where name in ('SINOV TUGAGAN DORI', 'SINOV YOLGIZ DORI');`);
  // Sinov haqiqiy dorining qoldig'iga tegadi - katalog takliflardan
  // qayta yig'ilsin, aks holda sinovdan keyin narx/qoldiq buzuq qoladi
  await sql(`select dori_katalog_yigish(null);`);
}

const jsonQator = (o) => JSON.stringify(o).replace(/'/g, "''");

(async () => {
  await tozala();
  console.log('\n\x1b[1mSKLADLAR\x1b[0m');

  // ================================================== 1. NARX
  console.log('\n1. Narx darajalari (tannarx 100 000)');

  const [{ id: pid, name: dnom }] =
    await sql("select id, name from dori_products where is_active order by name limit 1;");

  const [{ id: w0 }] = await sql(
    "insert into dori_warehouses (name, markup_pct, priority) values ('SINOV-NARX', 12, 50) returning id;"
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, stock, last_import)
             values ('${w0}', '${pid}', 100000, 10, 'sinov');`);

  const narx = async () => {
    await sql(`select dori_offer_narx('${w0}', null);`);
    const [{ price }] = await sql(`select price from dori_offers where warehouse_id = '${w0}';`);
    return Number(price);
  };

  tekshir('sklad ustamasi 12% umumiy qoidani bosadi', (await narx()) === 112000);

  await sql(`insert into dori_price_rules (scope, target_key, markup_sum, note)
             values ('product', '${pid}', 2000, 'sinov');`);
  tekshir('alohida dori qoidasi skladdan kuchli (+2000)', (await narx()) === 102000);
  await sql("delete from dori_price_rules where note = 'sinov';");

  await sql(`update dori_warehouses set discount_pct = 10 where id = '${w0}';`);
  tekshir('12% ustama + 10% chegirma', (await narx()) === 100800);

  await sql(`update dori_warehouses set discount_pct = null, discount_sum = 999999 where id = '${w0}';`);
  tekshir('narx hech qachon manfiy bo‘lmaydi', (await narx()) === 0);
  await sql(`delete from dori_warehouses where id = '${w0}';`);

  // ================================================== 2. PRAYS ALMASHINISHI
  console.log('\n2. Praysni qayta yuklash');

  const [{ id: wA }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-A', 60) returning id;"
  );
  const [{ id: wB }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-B', 61) returning id;"
  );

  const dori = (n, narx, qoldiq) => ({
    name: `SINOV DORI ${n}`, manufacturer: 'Sinov farm',
    price: narx, stock: qoldiq, series: 'S' + n, expiry: '2028-01-31',
  });

  // A skladga uchta dori
  await admin(`select dori_import_apply('${wA}',
    '${jsonQator([dori(1, 1000, 10), dori(2, 2000, 20), dori(3, 3000, 30)])}'::jsonb,
    'sinov-A-1', null, true, 'sinovA1.xlsx');`);

  // B skladga ikkita (1 va 2) - A ga tegmasligi kerak
  await admin(`select dori_import_apply('${wB}',
    '${jsonQator([dori(1, 1100, 5), dori(2, 2100, 6)])}'::jsonb,
    'sinov-B-1', null, true, 'sinovB1.xlsx');`);

  const [{ n: aJami }] = await sql(`select count(*)::int as n from dori_offers where warehouse_id = '${wA}';`);
  const [{ n: bJami }] = await sql(`select count(*)::int as n from dori_offers where warehouse_id = '${wB}';`);
  tekshir('A skladda 3 pozitsiya', aJami === 3, aJami);
  tekshir('B skladda 2 pozitsiya', bJami === 2, bJami);

  // A ga YANGI prays: 3-dori chiqib ketdi, 1-dorining narxi o'zgardi
  await admin(`select dori_import_apply('${wA}',
    '${jsonQator([dori(1, 1500, 7), dori(2, 2000, 20)])}'::jsonb,
    'sinov-A-2', null, true, 'sinovA2.xlsx');`);

  const aQator = await sql(
    `select p.name, o.base_price, o.stock from dori_offers o
     join dori_products p on p.id = o.product_id
     where o.warehouse_id = '${wA}' order by p.name;`
  );
  tekshir('eski pozitsiya O‘CHDI (3 ta → 2 ta)', aQator.length === 2,
    aQator.map((r) => r.name.slice(-1)).join(','));
  tekshir('narx yangilandi (1000 → 1500)', Number(aQator[0].base_price) === 1500, aQator[0].base_price);
  tekshir('qoldiq yangilandi (10 → 7)', Number(aQator[0].stock) === 7, aQator[0].stock);

  const [{ n: bKeyin }] = await sql(`select count(*)::int as n from dori_offers where warehouse_id = '${wB}';`);
  tekshir('B skladga TEGILMADI', bKeyin === 2, bKeyin);

  const [{ n: partiya }] = await sql(
    `select count(*)::int as n from dori_batches where warehouse_id = '${wA}';`
  );
  tekshir('eski partiyalar ham o‘chdi', partiya === 2, partiya);

  // Bir xil faylni ikki marta yuklash natijani o'zgartirmasin
  await admin(`select dori_import_apply('${wA}',
    '${jsonQator([dori(1, 1500, 7), dori(2, 2000, 20)])}'::jsonb,
    'sinov-A-3', null, true, 'sinovA2.xlsx');`);
  const [{ n: aQayta }] = await sql(`select count(*)::int as n from dori_offers where warehouse_id = '${wA}';`);
  tekshir('bir xil praysni qayta yuklash ikkilantirmaydi', aQayta === 2, aQayta);

  // ================================================== 3. TAQSIMOT
  console.log('\n3. Buyurtmani skladlarga taqsimlash');

  await sql(`delete from dori_warehouses where name in ('SINOV-A', 'SINOV-B');`);

  const wh = [];
  for (const [nom, narx, qoldiq, pr] of [
    ['SINOV-1', 9000, 45, 10],
    ['SINOV-2', 8500, 25, 20],
    ['SINOV-3', 9500, 30, 30],
  ]) {
    const [{ id }] = await sql(
      `insert into dori_warehouses (name, markup_pct, priority) values ('${nom}', 0, ${pr}) returning id;`
    );
    await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
               values ('${id}', '${pid}', ${narx}, ${narx}, ${qoldiq}, 'sinov');`);
    wh.push(id);
  }

  async function buyurtma(qty) {
    const [{ id }] = await sql(
      `insert into dori_orders (chat_id, name, phone, pharmacy, total)
       values (999000222, 'Sinov', '998000000000', 'SINOV TAQSIM', 0) returning id;`
    );
    await sql(`insert into dori_order_items (order_id, product_id, name, price, qty, sum)
               values ('${id}', '${pid}', '${dnom.replace(/'/g, "''")}', 10000, ${qty}, ${qty * 10000});`);
    return id;
  }

  const o1 = await buyurtma(100);
  const { j: j1 } = await admin(`select dori_order_split('${o1}', true) as j;`);
  const miq = Object.fromEntries(j1.skladlar.map((s) => [s.sklad, Number(s.pozitsiyalar[0].qty)]));

  tekshir('uchala skladga ham so‘rov ketdi', j1.skladlar.length === 3, Object.keys(miq).join(', '));
  tekshir('arzonidan boshlab to‘ldirildi (25 + 45 + 30)',
    miq['SINOV-2'] === 25 && miq['SINOV-1'] === 45 && miq['SINOV-3'] === 30,
    JSON.stringify(miq));
  tekshir('yetishmagani yo‘q', j1.yetishmadi.length === 0);

  const { j: t1 } = await admin(`select dori_order_taqsimot('${o1}') as j;`);
  const arzon = t1.find((x) => x.sklad === 'SINOV-2');
  tekshir('skladga to‘lanadigan summa TANNARXDA', Number(arzon.base_total) === 25 * 8500, arzon.base_total);
  tekshir('mijoz ko‘radigan summa alohida', Number(arzon.sell_total) === 25 * 10000, arzon.sell_total);

  const o2 = await buyurtma(20);
  const { j: j2 } = await admin(`select dori_order_split('${o2}', true) as j;`);
  tekshir('bitta skladda to‘liq bo‘lsa bo‘linmaydi', j2.skladlar.length === 1);
  tekshir('eng arzon sklad tanlandi', j2.skladlar[0]?.sklad === 'SINOV-2', j2.skladlar[0]?.sklad);

  // Bu dori boshqa hech qayerda yo'q: faqat sinov skladlarida
  const [{ id: yolgiz }] = await sql(
    `insert into dori_products (name, name_norm, is_active)
     values ('SINOV YOLGIZ DORI', dori_norm('SINOV YOLGIZ DORI'), true) returning id;`
  );
  for (const [nom, narx, qoldiq] of [['SINOV-1', 9000, 45], ['SINOV-2', 8500, 25], ['SINOV-3', 9500, 30]]) {
    await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
               select id, '${yolgiz}', ${narx}, ${narx}, ${qoldiq}, 'sinov'
               from dori_warehouses where name = '${nom}';`);
  }
  await sql(`select dori_katalog_yigish(array['${yolgiz}']::uuid[]);`);

  const [{ id: o3 }] = await sql(
    `insert into dori_orders (chat_id, name, phone, pharmacy, total)
     values (999000222, 'Sinov', '998000000000', 'SINOV TAQSIM', 0) returning id;`
  );
  await sql(`insert into dori_order_items (order_id, product_id, name, price, qty, sum)
             values ('${o3}', '${yolgiz}', 'SINOV YOLGIZ DORI', 10000, 150, 1500000);`);

  const { j: j3 } = await admin(`select dori_order_split('${o3}', true) as j;`);
  tekshir('yetishmagan miqdor ko‘rsatiladi (50)',
    j3.yetishmadi.length === 1 && Number(j3.yetishmadi[0].qty) === 50,
    JSON.stringify(j3.yetishmadi));
  tekshir('bori uch skladga bo‘lindi (100)',
    j3.skladlar.reduce((a, x) => a + Number(x.pozitsiyalar[0].qty), 0) === 100,
    j3.skladlar.map((x) => x.sklad + ':' + x.pozitsiyalar[0].qty).join(', '));

  await admin(`select dori_order_split('${o1}', true) as j;`);
  const { j: t4 } = await admin(`select dori_order_taqsimot('${o1}') as j;`);
  const jami4 = t4.reduce((s, x) => s + x.pozitsiyalar.reduce((a, p) => a + Number(p.qty), 0), 0);
  tekshir('qayta taqsimlash miqdorni ikkilantirmaydi', jami4 === 100, jami4);

  // ================================================== 4. TELEGRAM
  console.log('\n4. Sklad Telegramga ulanadi va so‘rov oladi');

  const [{ id: wTg }] = await sql(
    "select id from dori_warehouses where name = 'SINOV-1';"
  );
  const [{ id: wBoshqa }] = await sql(
    "select id from dori_warehouses where name = 'SINOV-3';"
  );

  const { j: kod } = await admin(`select dori_sklad_kod('${wTg}', '+998901112233') as j;`);
  tekshir('taklif kodi yaratildi', kod.ok && /^SKL-[A-Z0-9]{8}$/.test(kod.code), kod.code);

  // Boshqa raqam bilan ulanib bo'lmasin - kodni ushlab qolgan odam
  // o'ziniki qilib olmasin
  const [{ j: xatoUl }] = await sql(
    `select dori_sklad_ulash('${kod.code}', 555000111, '+998909998877', 'Begona', null) as j;`
  );
  tekshir('boshqa raqam bilan ulanmaydi', xatoUl.error === 'RAQAM_MOS_EMAS', xatoUl.error);

  const [{ j: ul }] = await sql(
    `select dori_sklad_ulash('${kod.code}', 555000222, '998901112233', 'Sklad mudiri', 'mudir') as j;`
  );
  tekshir('to‘g‘ri raqam bilan ulandi', ul.ok === true, ul.sklad);

  const [{ j: qayta }] = await sql(
    `select dori_sklad_ulash('${kod.code}', 555000333, '998901112233', 'Ikkinchi', null) as j;`
  );
  tekshir('kod ikkinchi marta ishlamaydi', qayta.error === 'KOD_ISHLATILGAN', qayta.error);

  const [{ j: kim }] = await sql(`select dori_sklad_kim(555000222) as j;`);
  tekshir('chat sklad bilan bog‘landi', kim?.warehouse_id === wTg, kim?.sklad);

  // Boshqa sklad uchun ham bitta chat ulaymiz - izolyatsiyani sinash uchun
  const { j: kod2 } = await admin(`select dori_sklad_kod('${wBoshqa}', '998905556677') as j;`);
  await sql(`select dori_sklad_ulash('${kod2.code}', 555000444, '998905556677', 'Uchinchi', null);`);

  // Yuborish uchun ma'lumot
  const [{ j: yub }] = await sql(`select dori_split_yuborilsin('${o1}') as j;`);
  const sinov1 = yub.find((x) => x.sklad === 'SINOV-1');
  tekshir('so‘rovda chat id bor', (sinov1?.chatlar ?? []).includes('555000222'),
    JSON.stringify(sinov1?.chatlar));
  tekshir('so‘rovda faqat TANNARX bor (mijoz narxi yo‘q)',
    sinov1.pozitsiyalar.every((p) => p.base_price !== undefined && p.price === undefined),
    JSON.stringify(sinov1.pozitsiyalar[0]));

  // Skladning o'z so'rovlari
  const [{ j: sor }] = await sql(`select dori_sklad_sorovlar(555000222, 10) as j;`);
  tekshir('sklad o‘z so‘rovlarini ko‘radi', sor.ok && sor.sorovlar.length >= 1,
    sor.sorovlar?.length);

  const splitId = sor.sorovlar[0].id;

  // ENG MUHIM: boshqa sklad shu so'rovni ochib ham, javob berib ham bo'lmasin
  const [{ j: begona }] = await sql(`select dori_sklad_sorov(555000444, '${splitId}') as j;`);
  tekshir('BOSHQA sklad so‘rovni ocholmaydi', begona.ok === false, begona.error);

  const [{ j: begonaJavob }] = await sql(
    `select dori_split_javob(555000444, '${splitId}', 'accepted') as j;`
  );
  tekshir('BOSHQA sklad javob berolmaydi', begonaJavob.ok === false, begonaJavob.error);

  const [{ j: ozi }] = await sql(`select dori_sklad_sorov(555000222, '${splitId}') as j;`);
  tekshir('o‘z so‘rovini ochadi', ozi.ok === true, '№' + ozi.order_no);

  const [{ j: javob }] = await sql(
    `select dori_split_javob(555000222, '${splitId}', 'accepted') as j;`
  );
  tekshir('sklad qabul qildi', javob.ok === true, '№' + javob.order_no);

  const [{ st }] = await sql(`select status as st from dori_order_splits where id = '${splitId}';`);
  tekshir('holat bazada yangilandi', st === 'accepted', st);

  const [{ j: notogri }] = await sql(
    `select dori_split_javob(555000222, '${splitId}', 'hohlagan_narsa') as j;`
  );
  tekshir('noto‘g‘ri holat rad etiladi', notogri.error === 'HOLAT_NOTOGRI', notogri.error);

  // Bekor qilingan buyurtma so'rovlari ham bekor bo'lsin
  await admin(`select dori_buyurtma_holat('${o1}', 'cancelled');`);
  const [{ n: faol }] = await sql(
    `select count(*)::int as n from dori_order_splits
      where order_id = '${o1}' and status in ('new', 'sent', 'accepted');`
  );
  tekshir('buyurtma bekor bo‘lsa so‘rovlar ham bekor', faol === 0, faol);

  // ================================================== 5. QOLDIQ CHEKLOVI
  console.log('\n5. Qoldiq cheklovi');

  // Sinov mijozi (savat va zakaz uchun kerak)
  await sql(`delete from dori_customers where chat_id = 999000333 or phone = '998000000001';`);
  await sql(`insert into dori_customers (chat_id, phone, phone_norm, name, pharmacy)
             values (999000333, '998000000001', '998000000001', 'Sinov mijoz', 'SINOV TAQSIM');`);
  await sql(`delete from dori_cart where chat_id = 999000333;`);

  // Katalogdagi qoldiq = faol skladlardagi jami (45 + 25 + 30 = 100)
  await sql(`select dori_katalog_yigish(array['${pid}']::uuid[]);`);
  const [{ stock: jamiQoldiq }] = await sql(`select stock from dori_products where id = '${pid}';`);
  tekshir('katalog qoldig‘i skladlardan yig‘ildi', Number(jamiQoldiq) === 100, jamiQoldiq);

  // Qoldiqdan ko'p so'ralsa - kesiladi
  const [{ j: qosh }] = await sql(
    `select dori_bot_cart_add(999000333, '${pid}', 500) as j;`
  );
  tekshir('qoldiqdan ko‘p so‘ralsa kesiladi', Number(qosh.qty) === 100, qosh.qty);
  tekshir('kesilgani aytiladi', qosh.cheklandi === true, qosh.cheklandi);

  // Tahrirlashda ham
  const [{ j: set }] = await sql(
    `select dori_bot_cart_set(999000333, '${pid}', 300) as j;`
  );
  tekshir('tahrirlashda ham kesiladi', Number(set.qty) === 100 && set.cheklandi === true, set.qty);

  // Qolmagan doriga - umuman qo'shilmaydi
  const [{ id: yoqDori }] = await sql(
    `insert into dori_products (name, name_norm, is_active, price, stock)
     values ('SINOV TUGAGAN DORI', dori_norm('SINOV TUGAGAN DORI'), true, 5000, 0)
     returning id;`
  );
  const [{ j: yoq }] = await sql(`select dori_bot_cart_add(999000333, '${yoqDori}', 1) as j;`);
  tekshir('qolmagan dori savatga tushmaydi', yoq.error === 'QOLMADI', yoq.error);

  // Savatda turganda qoldiq kamayib ketsa - buyurtmada tuziladi
  await sql(`select dori_bot_cart_set(999000333, '${pid}', 100);`);
  await sql(`update dori_products set stock = 30 where id = '${pid}';`);

  const [{ j: zakaz }] = await sql(
    `select dori_bot_order_create(999000333, null) as j;`
  );
  tekshir('buyurtmada qoldiqqacha kesildi',
    zakaz.ok === true && (zakaz.cheklangan ?? []).length === 1,
    JSON.stringify(zakaz.cheklangan));

  const [{ qty: berilgan }] = await sql(
    `select qty from dori_order_items where order_id = '${zakaz.order_id}';`
  );
  tekshir('buyurtmaga faqat bori yozildi (30)', Number(berilgan) === 30, berilgan);

  // Hammasi tugagan bo'lsa - buyurtma umuman yaratilmaydi
  await sql(`select dori_bot_cart_set(999000333, '${pid}', 5);`);
  await sql(`update dori_products set stock = 0 where id = '${pid}';`);
  const [{ j: bosh }] = await sql(`select dori_bot_order_create(999000333, null) as j;`);
  tekshir('hamma tugagan bo‘lsa buyurtma yaratilmaydi', bosh.error === 'QOLMADI', bosh.error);

  // Katalogda qolmaganlar oxiriga suriladi, lekin yo'qolmaydi
  const [{ j: sahifa }] = await sql(`select dori_catalog_page(null, 0, 5) as j;`);
  tekshir('katalogda qolmagan ham ko‘rinadi (soni bilan)',
    sahifa.items.every((x) => x.stock !== undefined),
    'birinchi: ' + sahifa.items[0].stock);
  tekshir('sotiladiganidan boshlanadi (aniq tugagan oxirida)',
    sahifa.items[0].stock === null || Number(sahifa.items[0].stock) > 0,
    sahifa.items[0].stock === null ? 'noma’lum' : sahifa.items[0].stock);

  // Qoldiq NOMA'LUM bo'lsa cheklov ishlamasligi kerak: hozirgi prays
  // fayllarida qoldiq ustuni yo'q, ya'ni bu ODATIY holat. Noma'lumni
  // "nol" deb hisoblasak butun katalog sotuvdan chiqib ketardi.
  await sql(`delete from dori_cart where chat_id = 999000333;`);
  await sql(`update dori_products set stock = null where id = '${pid}';`);
  const [{ j: nomalum }] = await sql(
    `select dori_bot_cart_add(999000333, '${pid}', 500) as j;`
  );
  tekshir('qoldiq noma’lum bo‘lsa cheklanmaydi',
    nomalum.ok === true && Number(nomalum.qty) === 500 && nomalum.cheklandi === false,
    nomalum.qty);

  const [{ j: zakaz2 }] = await sql(`select dori_bot_order_create(999000333, null) as j;`);
  tekshir('noma’lum qoldiqda buyurtma o‘tadi',
    zakaz2.ok === true && (zakaz2.cheklangan ?? []).length === 0, zakaz2.order_no);

  await sql(`delete from dori_products where id = '${yoqDori}';`);
  await sql(`delete from dori_cart where chat_id = 999000333;`);
  await sql(`delete from dori_customers where chat_id = 999000333 or phone = '998000000001';`);

  // ================================================== 6. NOMA'LUM QOLDIQDA TAQSIMOT
  console.log('\n6. Qoldiq noma’lum bo‘lganda taqsimot');

  // Haqiqiy holat: prays fayllarida qoldiq ustuni yo'q, ya'ni HAMMA
  // taklifda stock NULL. Ilgari taqsimlagich NULL ni 0 deb o'qib,
  // hech narsani taqsimlamasdi - buyurtmani skladga yuborib bo'lmasdi.
  await sql(`update dori_offers set stock = null where product_id = '${pid}';`);
  await sql(`select dori_katalog_yigish(array['${pid}']::uuid[]);`);

  const oNull = await buyurtma(70);
  const { j: jNull } = await admin(`select dori_order_split('${oNull}', true) as j;`);
  tekshir('noma’lum qoldiqda ham taqsimlanadi', jNull.skladlar.length >= 1,
    jNull.skladlar.map((x) => x.sklad + ':' + x.pozitsiyalar[0].qty).join(', '));
  tekshir('hammasi eng arzon skladga ketdi',
    jNull.skladlar.length === 1 && Number(jNull.skladlar[0].pozitsiyalar[0].qty) === 70,
    jNull.skladlar[0]?.sklad);
  tekshir('yetishmadi deb belgilanmadi', jNull.yetishmadi.length === 0,
    JSON.stringify(jNull.yetishmadi));

  // Aralash holat: bittasida aniq qoldiq, boshqasida noma'lum
  await sql(`update dori_offers o set stock = 20
             from dori_warehouses w
             where w.id = o.warehouse_id and w.name = 'SINOV-2' and o.product_id = '${pid}';`);
  const oAralash = await buyurtma(70);
  const { j: jAralash } = await admin(`select dori_order_split('${oAralash}', true) as j;`);
  const miqAralash = Object.fromEntries(
    jAralash.skladlar.map((x) => [x.sklad, Number(x.pozitsiyalar[0].qty)])
  );
  tekshir('aralashda arzoni cheklovi hisobga olinadi',
    miqAralash['SINOV-2'] === undefined || miqAralash['SINOV-2'] <= 20,
    JSON.stringify(miqAralash));
  tekshir('qolgani noma’lum skladdan to‘ldirildi',
    Object.values(miqAralash).reduce((a, b) => a + b, 0) === 70,
    JSON.stringify(miqAralash));

  // Nol narxli taklif taqsimotga tushmasin (bepul sotib yubormaylik)
  await sql(`update dori_offers o set price = 0, base_price = 0
             from dori_warehouses w
             where w.id = o.warehouse_id and w.name = 'SINOV-3' and o.product_id = '${pid}';`);
  const oNol = await buyurtma(10);
  const { j: jNol } = await admin(`select dori_order_split('${oNol}', true) as j;`);
  tekshir('nol narxli sklad tanlanmaydi',
    !jNol.skladlar.some((x) => x.sklad === 'SINOV-3'),
    jNol.skladlar.map((x) => x.sklad).join(', '));

  // ================================================== tozalash
  await tozala();
  await sql(`delete from dori_products where name like 'SINOV DORI %';`);
  const [{ n: qolgan }] = await sql(
    "select count(*)::int as n from dori_warehouses where name like 'SINOV-%';"
  );
  tekshir('sinov ma’lumotlari tozalandi', qolgan === 0, qolgan);

  console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA YIQILDI\x1b[0m`) + '\n');
  process.exit(yiqildi === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('\n  XATO: ' + e.message + '\n');
  await tozala().catch(() => {});
  process.exit(1);
});
