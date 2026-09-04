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
  // Sinov qoldiq cheklovini yoqib-o'chirib ko'radi. Oxirida HAR DOIM
  // YOQIQ holatda qoldiramiz: "asl qiymatni qaytarish" ikki yurish
  // bir-birining ustiga tushganda buzilardi va jonli bazada cheklov
  // o'chiq qolib ketardi (uch marta takrorlandi). Yoqiq - xavfsiz holat.
  await sql('update dori_settings set qoldiq_cheklovi = true where id;');
  await sql(`delete from dori_orders where pharmacy = 'SINOV TAQSIM';`);
  await sql(`delete from dori_warehouses where name like 'SINOV-%';`);
  await sql(`delete from dori_price_rules where note = 'sinov';`);
  await sql(`delete from dori_warehouse_telegram where chat_id in (555000222, 555000333, 555000444);`);
  await sql("delete from dori_warehouse_users where email like 'sinov-k%';");
  await sql("delete from dori_products where name in ('SINOV TAHRIR DORI', 'SINOV ARZON DORI', 'SINOV SOTUV DORI');");
  await sql("delete from dori_customers where phone in ('998000000003','998000000007','998000000008','998000000010');");
  await sql("delete from dori_warehouse_telegram where chat_id in (555000999, 555000888);");
  await sql("delete from dori_products where name = 'SINOV TERISH DORI';");
  await sql("delete from dori_products where name in ('SINOV BUYURTMA DORI', 'SINOV ARXIV DORI');");
  await sql("delete from dori_invoices where supplier = 'SINOV';");
  await sql("delete from dori_customers where chat_id = 999000444 or phone = '998000000002';");
  await sql(`delete from dori_cart where chat_id = 999000333;`);
  await sql(`delete from dori_customers where chat_id = 999000333 or phone = '998000000001';`);
  await sql(`delete from dori_products where name in ('SINOV TUGAGAN DORI', 'SINOV YOLGIZ DORI') or name like 'SINOVDORIN%';`);
  // Sinov haqiqiy dorining qoldig'iga tegadi - katalog takliflardan
  // qayta yig'ilsin, aks holda sinovdan keyin narx/qoldiq buzuq qoladi
  await sql(`select dori_katalog_yigish(null);`);
}

const jsonQator = (o) => JSON.stringify(o).replace(/'/g, "''");

(async () => {

  await tozala();
  // Cheklovni tozalashdan KEYIN yoqamiz: tozala() asl qiymatni qaytaradi,
  // shuning uchun undan oldin yoqilsa darhol bekor bo'lardi
  await sql('update dori_settings set qoldiq_cheklovi = true where id;');
  console.log('\n\x1b[1mSKLADLAR\x1b[0m');

  // ================================================== 1. NARX
  console.log('\n1. Narx darajalari (tannarx 100 000)');

  // Sinov jonli katalogga bog'lanmasin: bir marta katalogdagi hamma
  // dori nofaol bo'lib qolganda (takliflar o'chgani uchun) sinov birinchi
  // qadamdayoq yiqilgan edi. Faol dori bo'lsa - o'shani olamiz, bo'lmasa
  // istalganini; umuman bo'lmasa - o'zimiz yaratamiz.
  let [sinovDori] = await sql(
    "select id, name from dori_products where is_active order by name limit 1;"
  );
  if (!sinovDori) [sinovDori] = await sql('select id, name from dori_products order by name limit 1;');
  if (!sinovDori) {
    [sinovDori] = await sql(
      "insert into dori_products (name, name_norm) values ('SINOV DORI', 'sinov dori') returning id, name;"
    );
  }
  const pid = sinovDori.id;
  const dnom = sinovDori.name;

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

  // ================================================== 7. MOSLASHTIRISH
  console.log('\n7. Skladlar orasida dorini tanish');

  // Ikki sklad bir xil dorini boshqacha yozadi. Ilgari ikkinchisi
  // YANGI dori bo'lib tushardi va skladlar bir-birini ko'rmasdi.
  const [{ id: wM1 }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-M1', 70) returning id;"
  );
  const [{ id: wM2 }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-M2', 71) returning id;"
  );

  await admin(`select dori_import_apply('${wM1}',
    '${jsonQator([{ name: 'SINOVDORIN 0,5 г №10', manufacturer: 'Sinov ZMP/Rossiya', price: 1000, stock: 10 }])}'::jsonb,
    'm1', null, true, 'm1.xlsx');`);

  // Ayni dori, boshqacha yozilgan: 500мг = 0,5 г
  await admin(`select dori_import_apply('${wM2}',
    '${jsonQator([{ name: 'SINOVDORIN 500мг №10', manufacturer: 'Sinov ZMP/Uzbekistan', price: 900, stock: 5 }])}'::jsonb,
    'm2', null, true, 'm2.xlsx');`);

  const [{ n: nDori }] = await sql(
    "select count(*)::int as n from dori_products where name like 'SINOVDORIN%';"
  );
  tekshir('bir xil dori bitta kartochkada birlashdi', nDori === 1, nDori + ' ta kartochka');

  if (nDori === 1) {
    const [{ id: mId, price: mNarx }] = await sql(
      "select id, price from dori_products where name like 'SINOVDORIN%';"
    );
    const [{ n: nTaklif }] = await sql(
      `select count(*)::int as n from dori_offers where product_id = '${mId}';`
    );
    tekshir('ikkala skladning taklifi ham bor', nTaklif === 2, nTaklif);
    // Aniq raqamga bog'lanmaymiz: ustama va yaxlitlash JONLI sozlama,
    // ular o'zgarganda sinov yiqilib, kod buzilgandek ko'rinardi.
    // Tekshiriladigan narsa - katalogda AYNAN eng arzon taklif turishi.
    const [{ mn }] = await sql(
      `select min(price) as mn from dori_offers where product_id = '${mId}';`
    );
    tekshir('katalogda ARZONI ko‘rinadi', Number(mNarx) === Number(mn),
      `katalog ${mNarx}, eng arzon taklif ${mn}`);
  }

  // Kalit: 0,5 г va 500мг bir xil bo‘lishi shart
  const [{ a: k1, b: k2 }] = await sql(
    "select dori_kalit('SINOVDORIN 0,5 г №10') as a, dori_kalit('SINOVDORIN 500мг №10') as b;"
  );
  tekshir('0,5 г va 500 мг bir xil kalit beradi', k1 === k2, k1 + ' / ' + k2);

  // Ishlab chiqaruvchisi butunlay boshqa bo'lsa - navbatga tushsin
  const [{ id: wM3 }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-M3', 72) returning id;"
  );
  await admin(`select dori_import_apply('${wM3}',
    '${jsonQator([{ name: 'SINOVDORIN 500 мг №10', manufacturer: 'Boshqa Farm/Turkiya', price: 800, stock: 3 }])}'::jsonb,
    'm3', null, true, 'm3.xlsx');`);

  const [{ n: nNavbat }] = await sql(
    "select count(*)::int as n from dori_moslik_navbat n join dori_products p on p.id = n.product_id where p.name like 'SINOVDORIN%' and n.holat = 'kutilmoqda';"
  );
  tekshir('ishonchsiz juftlik navbatga tushdi', nNavbat >= 1, nNavbat);

  await sql("delete from dori_warehouses where name like 'SINOV-M%';");
  await sql("delete from dori_products where name like 'SINOVDORIN%';");

  // ================================================== 8. KABINET RUXSATLARI
  console.log('\n8. Sklad kabineti ruxsatlari');

  const [{ id: wK }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-K', 80) returning id;"
  );
  const [{ id: wK2 }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-K2', 81) returning id;"
  );

  // Ikki sklad xodimi (auth foydalanuvchisisiz - faqat email bo'yicha)
  await sql(`insert into dori_warehouse_users (warehouse_id, email, full_name)
             values ('${wK}', 'sinov-k@sklad.test', 'Sinov K');`);
  await sql(`insert into dori_warehouse_users (warehouse_id, email, full_name)
             values ('${wK2}', 'sinov-k2@sklad.test', 'Sinov K2');`);

  const [{ n: bogsiz }] = await sql(
    "select count(*)::int as n from dori_warehouse_users where email like 'sinov-k%' and user_id is null;"
  );
  tekshir('email oldindan ro‘yxatga olindi (Google uchun)', bogsiz === 2, bogsiz);

  // Sklad xodimi nomidan chaqiruv: hali bog'lanmagan bo'lsa - hech narsa
  const [{ j: yoqSklad }] = await sql(
    `select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true) as x,
            dori_sklad_men() as j;`
  );
  tekshir('ro‘yxatda yo‘q foydalanuvchiga sklad ochilmaydi', yoqSklad === null, JSON.stringify(yoqSklad));

  // Kabinet RPC'lari sklad xodimi bo'lmaganga ishlamasin
  let rad = false;
  try {
    await sql(`select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true) as x;
               select dori_kabinet_sorovlar(10);`);
  } catch (e) {
    rad = /RUXSAT_YOQ/.test(e.message);
  }
  tekshir('begona kabinet so‘rovlarini ocholmaydi', rad, rad ? 'RUXSAT_YOQ' : 'ochildi');

  let rad2 = false;
  try {
    await sql(`select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true) as x;
               select dori_kabinet_narxlar(null, 0, 10);`);
  } catch (e) {
    rad2 = /RUXSAT_YOQ/.test(e.message);
  }
  tekshir('begona praysni ocholmaydi', rad2, rad2 ? 'RUXSAT_YOQ' : 'ochildi');

  // Sklad xodimiga profil OCHILMAYDI (u tenant emas)
  const [{ n: profil }] = await sql(
    "select count(*)::int as n from profiles p join dori_warehouse_users u on u.user_id = p.id;"
  );
  tekshir('sklad xodimiga profil ochilmagan', profil === 0, profil);

  await sql("delete from dori_warehouse_users where email like 'sinov-k%';");
  await sql("delete from dori_products where name in ('SINOV TAHRIR DORI', 'SINOV ARZON DORI', 'SINOV SOTUV DORI');");
  await sql("delete from dori_customers where phone in ('998000000003','998000000007','998000000008','998000000010');");
  await sql("delete from dori_warehouse_telegram where chat_id in (555000999, 555000888);");
  await sql("delete from dori_products where name = 'SINOV TERISH DORI';");
  await sql("delete from dori_products where name in ('SINOV BUYURTMA DORI', 'SINOV ARXIV DORI');");
  await sql("delete from dori_invoices where supplier = 'SINOV';");
  await sql("delete from dori_customers where chat_id = 999000444 or phone = '998000000002';");
  await sql("delete from dori_warehouses where name like 'SINOV-K%';");

  // ================================================== 9. TAHRIR, CHEKLOV, FAKTURA
  console.log('\n9. Sklad boshqaruvi');

  const [{ id: wT }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-T', 90) returning id;"
  );
  const [{ id: dT }] = await sql(
    `insert into dori_products (name, name_norm, is_active)
     values ('SINOV TAHRIR DORI', dori_norm('SINOV TAHRIR DORI'), true) returning id;`
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
             values ('${wT}', '${dT}', 5000, 5000, 7, 'sinov');`);
  await sql(`insert into dori_batches (warehouse_id, product_id, series, expiry, qty, last_import)
             values ('${wT}', '${dT}', 'S1', '2028-01-31', 7, 'sinov');`);

  // Taklifni o'chirish: dorining O'ZI qolishi kerak
  await admin(`select dori_taklif_ochir('${wT}', array['${dT}']::uuid[]);`);
  const [{ n: taklifQoldi }] = await sql(
    `select count(*)::int as n from dori_offers where warehouse_id = '${wT}';`
  );
  const [{ n: doriQoldi }] = await sql(
    `select count(*)::int as n from dori_products where id = '${dT}';`
  );
  const [{ faol9 }] = await sql(`select is_active as faol9 from dori_products where id = '${dT}';`);
  tekshir('skladdagi taklif o‘chdi', taklifQoldi === 0, taklifQoldi);
  tekshir('dorining O‘ZI katalogda qoldi', doriQoldi === 1, doriQoldi);
  tekshir('hech qayerda yo‘q dori sotuvdan chiqdi', faol9 === false, faol9);
  const [{ n: partiyaQoldi }] = await sql(
    `select count(*)::int as n from dori_batches where warehouse_id = '${wT}';`
  );
  tekshir('partiyalari ham o‘chdi', partiyaQoldi === 0, partiyaQoldi);

  // Asosiy skladni almashtirish
  const [{ id: asosiyEski }] = await sql("select id from dori_warehouses where is_default;");
  await admin(`select dori_sklad_asosiy_qil('${wT}');`);
  const [{ n: asosiySoni }] = await sql("select count(*)::int as n from dori_warehouses where is_default;");
  const [{ id: asosiyYangi }] = await sql("select id from dori_warehouses where is_default;");
  tekshir('asosiy sklad bittaligicha qoldi', asosiySoni === 1, asosiySoni);
  tekshir('asosiylik ko‘chdi', asosiyYangi === wT, asosiyYangi === wT ? 'SINOV-T' : asosiyYangi);

  // Asosiy skladni o'chirish: asosiylik keyingisiga o'tishi kerak
  await admin(`select dori_sklad_ochir('${wT}');`);
  const [{ n: asosiyKeyin }] = await sql("select count(*)::int as n from dori_warehouses where is_default;");
  tekshir('asosiy sklad ham o‘chiriladi', asosiyKeyin === 1, asosiyKeyin);
  await sql(`update dori_warehouses set is_default = false where is_default;`);
  await sql(`update dori_warehouses set is_default = true where id = '${asosiyEski}';`);

  // Qoldiq cheklovi
  const [{ id: wC }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-C', 91) returning id;"
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
             values ('${wC}', '${dT}', 5000, 5000, 2, 'sinov');`);
  await sql(`update dori_products set is_active = true, price = 5000, stock = 2 where id = '${dT}';`);

  await sql(`delete from dori_cart where chat_id = 999000444;`);
  await sql(`delete from dori_customers where chat_id = 999000444 or phone = '998000000002';`);
  await sql(`insert into dori_customers (chat_id, phone, phone_norm, name, pharmacy)
             values (999000444, '998000000002', '998000000002', 'Sinov C', 'SINOV TAQSIM');`);

  await admin("select dori_sozlama_qoy(true, null);");
  const [{ j: chekOn }] = await sql(`select dori_bot_cart_add(999000444, '${dT}', 50) as j;`);
  tekshir('cheklov yoqilganda qoldiqqacha kesiladi', Number(chekOn.qty) === 2, chekOn.qty);

  await sql(`delete from dori_cart where chat_id = 999000444;`);
  await admin("select dori_sozlama_qoy(false, null);");
  const [{ j: chekOff }] = await sql(`select dori_bot_cart_add(999000444, '${dT}', 50) as j;`);
  tekshir('cheklov o‘chirilganda kesilmaydi', Number(chekOff.qty) === 50 && chekOff.cheklandi === false, chekOff.qty);

  // Qolmagan dori ham cheklov o'chiq bo'lsa savatga tushadi
  await sql(`update dori_offers set stock = 0 where product_id = '${dT}';`);
  await sql(`select dori_katalog_yigish(array['${dT}']::uuid[]);`);
  await sql(`delete from dori_cart where chat_id = 999000444;`);
  const [{ j: nolChek }] = await sql(`select dori_bot_cart_add(999000444, '${dT}', 5) as j;`);
  tekshir('cheklov o‘chiq: "qolmadi" deb to‘xtatmaydi', nolChek.ok === true, nolChek.error ?? nolChek.qty);

  const [{ j: sahifa2 }] = await sql("select dori_catalog_page(null, 0, 3) as j;");
  tekshir('katalog cheklov holatini aytadi', sahifa2.cheklov === false, sahifa2.cheklov);

  await admin("select dori_sozlama_qoy(true, null);");
  const { j: qaytdi } = await admin("select dori_sozlama() as j;");
  tekshir('sozlama qaytarildi', qaytdi.qoldiq_cheklovi === true, qaytdi.qoldiq_cheklovi);

  await sql(`delete from dori_cart where chat_id = 999000444;`);
  await sql(`delete from dori_customers where chat_id = 999000444;`);
  await sql(`delete from dori_warehouses where name = 'SINOV-C';`);
  await sql(`delete from dori_products where id = '${dT}';`);

  // ================================================== 10. SUMMALI USTAMA
  console.log('\n10. Ustamani summada qo\'yish');

  // Foiz kichik summalarda yo'qoladi: 900 so'mning 5% i = 45, yaxlitlash
  // 100 so'mgacha bo'lsa natija 900 - foyda YO'Q. Summa esa aniq.
  const [{ id: wS }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-S', 95) returning id;"
  );
  const [{ id: dS }] = await sql(
    `insert into dori_products (name, name_norm, is_active)
     values ('SINOV ARZON DORI', dori_norm('SINOV ARZON DORI'), true) returning id;`
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, stock, last_import)
             values ('${wS}', '${dS}', 900, 10, 'sinov');`);

  const narxS = async () => {
    await sql(`select dori_offer_narx('${wS}', null);`);
    const [{ p }] = await sql(`select price as p from dori_offers where warehouse_id = '${wS}';`);
    return Number(p);
  };

  // Foiz bilan: 900 * 1.05 = 945 -> yaxlitlash 100 -> 900. Foyda 0.
  await admin(`select dori_price_rule_bulk(array['${dS}']::uuid[], 5, null, 'sinov', null, null);`);
  tekshir('foiz arzon dorida yo‘qoladi (foyda 0)', (await narxS()) === 900, await narxS());

  // Summa bilan: 900 + 2000 = 2900. Foyda aniq 2000.
  await admin(`select dori_price_rule_bulk(array['${dS}']::uuid[], null, null, 'sinov', 2000, null);`);
  const narxSum = await narxS();
  tekshir('summali ustama aniq ishlaydi (900 + 2000)', narxSum === 2900, narxSum);

  const [{ foyda }] = await sql(
    `select (price - base_price) as foyda from dori_products where id = '${dS}';`
  );
  tekshir('katalogda foyda yaxlit ko‘rinadi', Number(foyda) === 2000, foyda);

  // Foiz va summa birga: 900 * 1.05 + 2000 = 2945 -> 2900
  await admin(`select dori_price_rule_bulk(array['${dS}']::uuid[], 5, null, 'sinov', 2000, null);`);
  tekshir('foiz va summa birga qo‘shiladi', (await narxS()) === 2900, await narxS());

  // Umumiy darajada ham summa qo'yish mumkin
  await admin("select dori_price_rule_bulk(array[]::uuid[], null, null, 'sinov', null, null);");
  await sql("delete from dori_price_rules where note = 'sinov';");
  await admin(`select dori_price_rule_set('product', '${dS}', null, null, 'sinov', 500, null);`);
  tekshir('dori qoidasi summada (900 + 500)', (await narxS()) === 1400, await narxS());

  // Bo'sh qiymatlar qoidani o'chiradi
  await admin(`select dori_price_rule_set('product', '${dS}', null, null, null, null, null);`);
  const [{ n: qoidaQoldi }] = await sql(
    `select count(*)::int as n from dori_price_rules where is_active and target_key = '${dS}';`
  );
  tekshir('bo‘sh qiymat qoidani o‘chiradi', qoidaQoldi === 0, qoidaQoldi);

  await sql("delete from dori_price_rules where note = 'sinov';");
  await sql(`delete from dori_warehouses where name = 'SINOV-S';`);
  await sql(`delete from dori_products where id = '${dS}';`);

  // ================================================== 11. SOTUV
  console.log('\n11. Sotuv moduli');

  const [{ id: wSot }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-SOT', 96) returning id;"
  );
  const [{ id: dSot }] = await sql(
    `insert into dori_products (name, name_norm, is_active)
     values ('SINOV SOTUV DORI', dori_norm('SINOV SOTUV DORI'), true) returning id;`
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
             values ('${wSot}', '${dSot}', 5000, 6000, 10, 'sinov');`);

  await sql("delete from dori_customers where phone in ('998000000003','998000000007','998000000008','998000000010');");
  await sql("delete from dori_warehouse_telegram where chat_id in (555000999, 555000888);");
  await sql("delete from dori_products where name = 'SINOV TERISH DORI';");
  await sql("delete from dori_products where name in ('SINOV BUYURTMA DORI', 'SINOV ARXIV DORI');");
  await sql("delete from dori_invoices where supplier = 'SINOV';");
  const [{ id: mSot }] = await sql(
    `insert into dori_customers (phone, phone_norm, name, pharmacy)
     values ('998000000003', '998000000003', 'Sinov mijoz', 'SINOV DORIXONA') returning id;`
  );

  // Qidiruv skladga bog'langan bo'lishi kerak
  const { j: topilgan } = await admin(
    `select dori_sotuv_qidir('${wSot}', 'SINOV SOTUV', 10) as j;`
  );
  tekshir('skladdan dori topildi', topilgan.length === 1 && Number(topilgan[0].price) === 6000,
    topilgan.length ? topilgan[0].price : 'topilmadi');

  // Sotuv
  const { j: sotuv } = await admin(
    `select dori_sotuv_yarat('${wSot}', '${mSot}',
       '[{"product_id":"${dSot}","qty":3}]'::jsonb, 'sinov') as j;`
  );
  tekshir('sotuv rasmiylashtirildi', sotuv.ok === true, '№' + sotuv.sale_no);
  tekshir('mijoz to‘laydigan summa', Number(sotuv.total) === 18000, sotuv.total);
  tekshir('skladga tegishli summa', Number(sotuv.base_total) === 15000, sotuv.base_total);
  tekshir('foyda hisoblandi', Number(sotuv.foyda) === 3000, sotuv.foyda);

  const [{ qoldiq: qoldiqKeyin }] = await sql(
    `select stock as qoldiq from dori_offers where warehouse_id = '${wSot}';`
  );
  tekshir('qoldiq kamaydi (10 -> 7)', Number(qoldiqKeyin) === 7, qoldiqKeyin);

  // Narx MIJOZDAN olinmaydi: yuborilgan narx e'tiborga olinmaydi
  const { j: sotuv2 } = await admin(
    `select dori_sotuv_yarat('${wSot}', '${mSot}',
       '[{"product_id":"${dSot}","qty":1,"price":1}]'::jsonb, null) as j;`
  );
  tekshir('narx skladdan olinadi, so‘rovdan emas', Number(sotuv2.total) === 6000, sotuv2.total);

  // Qoldiqdan ortiq sotib bo'lmaydi
  const { j: kop } = await admin(
    `select dori_sotuv_yarat('${wSot}', '${mSot}',
       '[{"product_id":"${dSot}","qty":999}]'::jsonb, null) as j;`
  );
  tekshir('qoldiqdan ortiq sotilmaydi', kop.ok === false && kop.error === 'QOLDIQ_YETMAYDI', kop.error);

  // Faktura
  const [{ j: fakt }] = await sql(`select dori_sotuv_faktura_srv('${sotuv.sale_id}') as j;`);
  tekshir('faktura shakllandi', fakt.items.length === 1 && Number(fakt.total) === 18000,
    'jami ' + fakt.total);
  tekshir('fakturada sotuv sarlavhasi', fakt.sarlavha === 'SOTUV FAKTURASI', fakt.sarlavha);

  // Bekor qilish qoldiqni qaytaradi
  await admin(`select dori_sotuv_bekor('${sotuv.sale_id}');`);
  const [{ qoldiq: qoldiqBekor }] = await sql(
    `select stock as qoldiq from dori_offers where warehouse_id = '${wSot}';`
  );
  tekshir('bekor qilishda qoldiq qaytdi (6 -> 9)', Number(qoldiqBekor) === 9, qoldiqBekor);

  const [{ st: sotuvHolat }] = await sql(
    `select status as st from dori_sales where id = '${sotuv.sale_id}';`
  );
  tekshir('bekor qilingan sotuv tarixda qoladi', sotuvHolat === 'cancelled', sotuvHolat);

  await sql(`delete from dori_sales where warehouse_id = '${wSot}';`);
  await sql(`delete from dori_customers where id = '${mSot}';`);
  await sql(`delete from dori_warehouses where id = '${wSot}';`);
  await sql(`delete from dori_products where id = '${dSot}';`);

  // ============================ 12. ARXIV, BUYURTMA TAHRIRI, PUSH
  console.log('\n12. Arxiv, buyurtma tahriri va push');

  // ---- arxiv o'chirish katalogga tegmasligi kerak
  const [{ id: arxiv }] = await sql(
    `insert into dori_invoices (file_name, supplier, rows_count)
     values ('sinov-arxiv.xlsx', 'SINOV', 1) returning id;`
  );
  await sql(`insert into dori_invoice_items (invoice_id, line_no, name, sum)
             values ('${arxiv}', 1, 'SINOV ARXIV DORI', 0);`);
  const [{ n: doriOldin }] = await sql('select count(*)::int as n from dori_products;');
  await admin(`select dori_invoice_ochir(array['${arxiv}']::uuid[]);`);
  const [{ n: arxivQoldi }] = await sql(
    `select count(*)::int as n from dori_invoices where id = '${arxiv}';`
  );
  const [{ n: doriKeyin }] = await sql('select count(*)::int as n from dori_products;');
  tekshir('arxiv yozuvi o‘chdi', arxivQoldi === 0, arxivQoldi);
  tekshir('arxiv o‘chishi katalogga tegmadi', doriOldin === doriKeyin, doriOldin + ' -> ' + doriKeyin);

  // ---- buyurtma tahriri va o'chirish
  const [{ id: wB12 }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-B2', 98) returning id;"
  );
  const [{ id: dB }] = await sql(
    `insert into dori_products (name, name_norm, is_active)
     values ('SINOV BUYURTMA DORI', dori_norm('SINOV BUYURTMA DORI'), true) returning id;`
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
             values ('${wB12}', '${dB}', 4000, 5000, 100, 'sinov');`);

  const [{ id: oB }] = await sql(
    `insert into dori_orders (chat_id, name, phone, pharmacy, total)
     values (999000555, 'Sinov', '998000000009', 'SINOV TAQSIM', 50000) returning id;`
  );
  const [{ id: iB }] = await sql(
    `insert into dori_order_items (order_id, product_id, name, price, qty, sum)
     values ('${oB}', '${dB}', 'SINOV BUYURTMA DORI', 5000, 10, 50000) returning id;`
  );

  // Miqdorni o'zgartirish: summa qayta hisoblanadi
  await admin(`select dori_buyurtma_qator(${iB}, 4);`);
  const [{ jami: jamiYangi }] = await sql(`select total as jami from dori_orders where id = '${oB}';`);
  tekshir('miqdor o‘zgarganda summa qayta hisoblandi', Number(jamiYangi) === 20000, jamiYangi);

  const [{ n: taqsim }] = await sql(
    `select count(*)::int as n from dori_split_items si
      join dori_order_splits s on s.id = si.split_id
      where s.order_id = '${oB}' and si.qty = 4;`
  );
  tekshir('taqsimot yangi miqdorga qayta qurildi', taqsim === 1, taqsim);

  // Pozitsiya id'si panelga qaytadimi
  const { j: royxat } = await admin("select dori_buyurtmalar(30, null) as j;");
  const buyurtmaB = royxat.find((x) => x.id === oB);
  tekshir('pozitsiyada item_id bor', Number(buyurtmaB?.pozitsiyalar?.[0]?.item_id) === Number(iB),
    buyurtmaB?.pozitsiyalar?.[0]?.item_id);

  // Qaysi skladlarda bor
  const { j: joylar } = await admin(`select dori_buyurtma_skladlar('${oB}') as j;`);
  tekshir('dori qaysi skladda ekani ko‘rinadi',
    joylar[0]?.skladlar?.some((w) => w.sklad === 'SINOV-B2'),
    JSON.stringify(joylar[0]?.skladlar?.[0] ?? {}));

  // Yig'ish varaqasi: sklad ustuni bilan, narxsiz
  const [{ j: yigish }] = await sql(`select dori_yigish_faktura_srv('${oB}') as j;`);
  tekshir('yig‘ish varaqasi sklad ustuni bilan', yigish.ustunlar === 'yigish', yigish.ustunlar);
  tekshir('yig‘ish qatorida sklad nomi bor', yigish.items?.[0]?.sklad === 'SINOV-B2',
    yigish.items?.[0]?.sklad);
  tekshir('yig‘ish varaqasida narx yo‘q', yigish.items?.[0]?.price === undefined,
    yigish.items?.[0]?.price ?? 'yo‘q');

  // Pozitsiyani 0 qilib olib tashlash
  await admin(`select dori_buyurtma_qator(${iB}, 0);`);
  const [{ n: pozQoldi }] = await sql(
    `select count(*)::int as n from dori_order_items where order_id = '${oB}';`
  );
  tekshir('0 miqdor pozitsiyani olib tashladi', pozQoldi === 0, pozQoldi);

  // Buyurtmani o'chirish
  await admin(`select dori_buyurtma_ochir('${oB}');`);
  const [{ n: buyurtmaQoldi }] = await sql(
    `select count(*)::int as n from dori_orders where id = '${oB}';`
  );
  tekshir('buyurtma o‘chdi', buyurtmaQoldi === 0, buyurtmaQoldi);

  // ---- push xabar
  await sql("delete from dori_customers where phone in ('998000000007', '998000000008');");
  const [{ id: pm1 }] = await sql(
    `insert into dori_customers (phone, phone_norm, name, chat_id)
     values ('998000000007', '998000000007', 'Ulangan mijoz', 777000111) returning id;`
  );
  await sql(`insert into dori_customers (phone, phone_norm, name)
             values ('998000000008', '998000000008', 'Ulanmagan mijoz');`);

  const { j: pushRoyxat } = await admin("select dori_push_mijozlar('mijoz') as j;");
  const ulangan = pushRoyxat.filter((x) => x.ulangan).length;
  tekshir('push ro‘yxatida ulanish holati ko‘rinadi', ulangan >= 1, ulangan + ' ta ulangan');

  const { j: tayyor } = await admin(
    `select dori_push_tayyorla('Sinov xabari', array['${pm1}']::uuid[], true) as j;`
  );
  tekshir('xabar tayyorlandi', tayyor.ok === true && Number(tayyor.jami) === 1, tayyor.jami);

  // Ulanmaganlar nishonga tushmasligi kerak
  let radEtildi = false;
  try {
    await admin(
      `select dori_push_tayyorla('Sinov 2', array[(select id from dori_customers where phone = '998000000008')]::uuid[], true) as j;`
    );
  } catch (e) {
    radEtildi = /MIJOZ_YOQ/.test(e.message);
  }
  tekshir('botga ulanmaganga xabar tayyorlanmaydi', radEtildi, radEtildi ? 'MIJOZ_YOQ' : 'tayyorlandi');

  await sql(`delete from dori_broadcasts where matn like 'Sinov%';`);
  await sql("delete from dori_customers where phone in ('998000000007', '998000000008');");
  await sql(`delete from dori_warehouses where name = 'SINOV-B2';`);
  await sql(`delete from dori_products where id = '${dB}';`);

  // ============================ 13. SOTUV SKLADGA TERISH UCHUN BORADI
  console.log('\n13. Sotuv skladga terish uchun boradi');

  const [{ id: wTer }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-TER', 99) returning id;"
  );
  const [{ id: dTer }] = await sql(
    `insert into dori_products (name, name_norm, manufacturer, is_active)
     values ('SINOV TERISH DORI', dori_norm('SINOV TERISH DORI'), 'Sinov zavod', true) returning id;`
  );
  await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
             values ('${wTer}', '${dTer}', 3000, 4000, 50, 'sinov');`);
  await sql(`insert into dori_batches (warehouse_id, product_id, series, expiry, qty, last_import)
             values ('${wTer}', '${dTer}', 'TER-1', '2029-05-31', 50, 'sinov');`);

  await sql("delete from dori_customers where phone = '998000000010';");
  const [{ id: mTer }] = await sql(
    `insert into dori_customers (phone, phone_norm, name, pharmacy)
     values ('998000000010', '998000000010', 'Terish mijoz', 'TERISH DORIXONA') returning id;`
  );

  // Sklad xodimi botga ulangan
  await sql(`delete from dori_warehouse_telegram where chat_id = 555000999;`);
  await sql(`insert into dori_warehouse_telegram (chat_id, warehouse_id, phone, name)
             values (555000999, '${wTer}', '998000000011', 'Omborchi');`);

  const { j: sot13 } = await admin(
    `select dori_sotuv_yarat('${wTer}', '${mTer}',
       '[{"product_id":"${dTer}","qty":5}]'::jsonb, 'terish sinovi') as j;`
  );
  tekshir('sotuv yaratildi', sot13.ok === true, '№' + sot13.sale_no);

  // Terish fakturasi: chat, seriya, muddat, ishlab chiqaruvchi
  const [{ j: yub13 }] = await sql(`select dori_sotuv_yuborilsin('${sot13.sale_id}') as j;`);
  tekshir('skladning chati topildi', (yub13.chatlar ?? []).includes('555000999'),
    JSON.stringify(yub13.chatlar));
  const poz = yub13.pozitsiyalar[0];
  tekshir('terish uchun seriya bor', poz.series === 'TER-1', poz.series);
  tekshir('terish uchun muddat bor', String(poz.expiry).startsWith('2029'), poz.expiry);
  tekshir('ishlab chiqaruvchi bor', poz.manufacturer === 'Sinov zavod', poz.manufacturer);
  tekshir('dona to‘g‘ri', Number(poz.qty) === 5, poz.qty);
  tekshir('mijoz narxi YO‘Q (faqat tannarx)', poz.price === undefined,
    poz.price ?? 'yo‘q');

  // Omborchi Telegramdan "terib bo'ldim" bosadi
  const [{ j: tayyor13 }] = await sql(
    `select dori_sotuv_tayyor(555000999, '${sot13.sale_id}') as j;`
  );
  tekshir('omborchi terildi deb belgiladi', tayyor13.ok === true, '№' + tayyor13.sale_no);

  const [{ yig }] = await sql(
    `select yigildi_at is not null as yig from dori_sales where id = '${sot13.sale_id}';`
  );
  tekshir('bazada terilgan deb yozildi', yig === true, yig);

  // BEGONA sklad xodimi bu sotuvni yopa olmasligi kerak
  await sql(`delete from dori_warehouse_telegram where chat_id = 555000888;`);
  const [{ id: wBegona }] = await sql(
    "insert into dori_warehouses (name, priority) values ('SINOV-BEGONA', 99) returning id;"
  );
  await sql(`insert into dori_warehouse_telegram (chat_id, warehouse_id, phone, name)
             values (555000888, '${wBegona}', '998000000012', 'Begona');`);
  const [{ j: begona13 }] = await sql(
    `select dori_sotuv_tayyor(555000888, '${sot13.sale_id}') as j;`
  );
  tekshir('BEGONA sklad sotuvni yopolmaydi', begona13.ok === false, begona13.error);

  // Skladning o'z sotuvlari ro'yxati
  const [{ j: royxatSot }] = await sql(`select dori_sklad_sotuvlar(555000999, 10) as j;`);
  tekshir('sklad o‘z sotuvlarini ko‘radi',
    royxatSot.ok === true && royxatSot.sotuvlar.length >= 1,
    royxatSot.sotuvlar?.length);

  await sql(`delete from dori_warehouse_telegram where chat_id in (555000999, 555000888);`);
  await sql(`delete from dori_sales where warehouse_id = '${wTer}';`);
  await sql(`delete from dori_customers where id = '${mTer}';`);
  await sql(`delete from dori_warehouses where name in ('SINOV-TER', 'SINOV-BEGONA');`);
  await sql(`delete from dori_products where id = '${dTer}';`);

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
