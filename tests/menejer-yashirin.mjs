// =============================================================
//  MENEJER MIJOZLARINI YASHIRISH SINOVI
//
//  Model: menejer erkin sotuvchi, mijoz uniki. Yashirganda korxona
//  uchun XARIDOR menejerning o'zi bo'ladi:
//
//    mijoz --buyurtma--> menejer --sotib olish--> korxona
//    (menejer narxi)                  (baza narxi)
//
//  Sinov nimani qo'riqlaydi:
//    - admin/direktor yashirin mijozni, uning telefonini, qarzini
//      va to'lovini KO'RMASIN
//    - lekin BUYURTMA yo'qolmasin: tovarni korxona jo'natadi, u
//      menejer nomidan ko'rinishi kerak
//    - korxona qarzi BAZA narxda, menejerning ustamasi sizmasin
//    - menejer va mijozning o'zi hech narsa yo'qotmasin
//
//  NEGA SQL SIMULYATSIYASI: kalitlar.json dagi admin boshqa
//  tenantda (u yerda menejer yo'q). Shuning uchun sinov haqiqiy
//  hisoblarning JWT da'vosini qo'yib so'rov yuboradi — RLS aynan
//  o'sha odam uchun ishlaydi, ya'ni tekshiruv haqiqiy.
//
//  Sinov jonli holatni o'zgartiradi va OXIRIDA AYNAN TIKLAYDI:
//  boshlang'ich qarz yig'indisi, ko'rinish belgisi va buyurtma
//  yozilishi qaytarilgani alohida tekshiriladi.
//
//  Ishga tushirish:  node tests/menejer-yashirin.mjs
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

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${K.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// Aynan shu odam sifatida so'rov: RLS to'liq ishlaydi
async function kimdir(uid, q) {
  return sql(
    `set local role authenticated;` +
      ` select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',true);` +
      ` ${q}`
  );
}

async function son(q) {
  const [r] = await sql(q);
  return Number(Object.values(r)[0]);
}

console.log('\n\x1b[1mMENEJER MIJOZLARINI YASHIRISH\x1b[0m');

// ---------- Ishtirokchilarni topamiz ----------
const [mgr] = await sql(`
  select m.id, m.name, m.org_id, m.mijoz_korinsin,
         (select px.id from customers px where px.proxy_manager_id = m.id) as proxy_id,
         (select count(*)::int from customers c where c.manager_id = m.id) as mijozlar
  from managers m
  where exists (select 1 from customers c where c.manager_id = m.id)
  order by mijozlar desc
  limit 1
`);

if (!mgr) {
  console.error('\n  Mijozi bor menejer topilmadi — sinov bo\'shga ishlaydi, to\'xtatildi.\n');
  process.exit(1);
}

const [admin] = await sql(
  `select p.id as pid from profiles p where p.org_id = '${mgr.org_id}' and p.role = 'admin' limit 1`
);
const [mijoz] = await sql(`
  select p.id as pid, p.customer_id
  from profiles p join customers c on c.id = p.customer_id
  where c.manager_id = '${mgr.id}' limit 1
`);
const [menejerProfil] = await sql(
  `select p.id as pid from profiles p where p.manager_id = '${mgr.id}' limit 1`
);

tekshir('menejer topildi', Boolean(mgr.id), mgr.name + ', ' + mgr.mijozlar + ' mijoz');
tekshir('menejer-xaridor kartochkasi bor', Boolean(mgr.proxy_id));
tekshir('shu tenantda admin bor', Boolean(admin?.pid));
tekshir('menejerning profili bor', Boolean(menejerProfil?.pid));
tekshir('mijozning profili bor', Boolean(mijoz?.pid));

if (!admin?.pid || !mgr.proxy_id || !menejerProfil?.pid) {
  console.error('\n  Ishtirokchilar to\'liq emas — to\'xtatildi.\n');
  process.exit(1);
}

// ---------- Boshlang'ich holat ----------
const BOSH = {
  korinsin: mgr.mijoz_korinsin,
  qarz: await son('select coalesce(sum(amount),0) from ledger_entries'),
  yozuv: await son('select count(*)::int from ledger_entries'),
  kochgan: await son('select count(*)::int from orders where bill_customer_id <> customer_id'),
};
console.log(
  `\n  boshlang'ich: ko'rinsin=${BOSH.korinsin}, qarz=${BOSH.qarz}, ` +
    `yozuv=${BOSH.yozuv}, ko'chgan buyurtma=${BOSH.kochgan}`
);

let tiklandi = false;
async function tikla() {
  if (tiklandi) return;
  tiklandi = true;
  await sql(
    `update managers set mijoz_korinsin = ${BOSH.korinsin} where id = '${mgr.id}';` +
      ` select menejer_hisobini_moslash('${mgr.id}')`
  );
}

try {
  // ---------- 1. Yashirishni yoqamiz ----------
  console.log('\n1. Yashirish yoqiladi');

  const quruq = await kimdir(admin.pid, `select * from menejer_yashirish('${mgr.id}', false)`);
  const oldingiQarz = await son('select coalesce(sum(amount),0) from ledger_entries');
  tekshir(
    'quruq sinov hech narsa yozmaydi',
    oldingiQarz === BOSH.qarz,
    'qarz: ' + oldingiQarz
  );
  const kutilgan = Number(quruq[0]?.korxonaga_yoziladi ?? 0);
  tekshir('quruq sinov summa qaytardi', kutilgan > 0, kutilgan + ' so\'m');

  await kimdir(admin.pid, `select * from menejer_yashirish('${mgr.id}', true)`);
  const [holat] = await sql(`select mijoz_korinsin from managers where id = '${mgr.id}'`);
  tekshir('menejer yashirin holatga o\'tdi', holat.mijoz_korinsin === false);

  // ---------- 2. Admin nimani ko'radi ----------
  console.log('\n2. Admin ko\'rmasligi kerak');

  {
    const r = await kimdir(
      admin.pid,
      `select count(*)::int as n from customers where manager_id = '${mgr.id}'`
    );
    tekshir('menejer mijozlari admindan yashirin', Number(r[0].n) === 0, r[0].n + ' ta ko\'rindi');
  }
  {
    const r = await kimdir(
      admin.pid,
      `select count(*)::int as n from customers where id = '${mgr.proxy_id}'`
    );
    tekshir('menejer-xaridor kartochkasi adminga ko\'rinadi', Number(r[0].n) === 1);
  }
  {
    // customers_masked ham teshik bo'lmasin: u alohida view
    const r = await kimdir(
      admin.pid,
      `select count(*)::int as n from customers_masked where manager_id = '${mgr.id}'`
    );
    tekshir('niqoblangan ko\'rinishda ham yo\'q', Number(r[0].n) === 0, r[0].n + ' ta');
  }
  {
    const r = await kimdir(
      admin.pid,
      `select coalesce(sum(le.amount),0) as s from ledger_entries le
       join customers c on c.id = le.customer_id where c.manager_id = '${mgr.id}'`
    );
    tekshir('yashirin mijozning qarzi admindan yopiq', Number(r[0].s) === 0, r[0].s);
  }

  // ---------- 3. Buyurtma yo'qolmasin ----------
  console.log('\n3. Buyurtma korxonada qoladi');

  const [jamiBuyurtma] = await sql(
    `select count(*)::int as n from orders o join customers c on c.id = o.customer_id where c.org_id = '${mgr.org_id}'`
  );
  {
    const r = await kimdir(admin.pid, 'select count(*)::int as n from orders');
    tekshir(
      'admin buyurtmalarni yo\'qotmadi',
      Number(r[0].n) === Number(jamiBuyurtma.n),
      `ko'rgani ${r[0].n}, bazada ${jamiBuyurtma.n}`
    );
  }
  {
    // Buyurtma menejer nomidan ko'rinishi kerak (Orders.tsx shu
    // bog'lanishdan foydalanadi)
    const r = await kimdir(
      admin.pid,
      `select count(*)::int as n from orders o
       join customers x on x.id = o.bill_customer_id
       where x.proxy_manager_id = '${mgr.id}'`
    );
    tekshir('buyurtmalar menejer nomiga o\'tdi', Number(r[0].n) > 0, r[0].n + ' ta');
  }
  {
    const r = await kimdir(
      admin.pid,
      `select count(*)::int as n from order_items oi
       join orders o on o.id = oi.order_id
       join customers x on x.id = o.bill_customer_id
       where x.proxy_manager_id = '${mgr.id}'`
    );
    tekshir('buyurtma qatorlari ham ko\'rinadi', Number(r[0].n) > 0, r[0].n + ' ta');
  }

  // ---------- 4. Pul to'g'ri tomonda ----------
  console.log('\n4. Qarz');

  const [proxyBalans] = await sql(
    `select coalesce(sum(amount),0) as s from ledger_entries where customer_id = '${mgr.proxy_id}'`
  );
  const [bazaJami] = await sql(`
    select coalesce(sum(o.base_total),0) as s from orders o
    where o.customer_id in (select id from customers where manager_id = '${mgr.id}')
      and o.status in ('confirmed','picking','done')
  `);
  const [ustamaliJami] = await sql(`
    select coalesce(sum(o.total),0) as s from orders o
    where o.customer_id in (select id from customers where manager_id = '${mgr.id}')
      and o.status in ('confirmed','picking','done')
  `);
  tekshir(
    'korxona qarzi = BAZA narx',
    Number(proxyBalans.s) === Number(bazaJami.s),
    `${proxyBalans.s} / kutilgan ${bazaJami.s}`
  );
  tekshir(
    'ustama korxonaga sizmadi',
    Number(proxyBalans.s) < Number(ustamaliJami.s),
    `ustama ${Number(ustamaliJami.s) - Number(bazaJami.s)} so'm menejerda qoldi`
  );
  {
    const r = await sql(`
      select coalesce(sum(le.amount),0) as s from ledger_entries le
      join customers c on c.id = le.customer_id where c.manager_id = '${mgr.id}'
    `);
    tekshir(
      'mijozning menejer oldidagi qarzi tegilmadi',
      Number(r[0].s) === Number(ustamaliJami.s),
      `${r[0].s} / kutilgan ${ustamaliJami.s}`
    );
  }

  // ---------- 5. Menejer va mijoz hech narsa yo'qotmadi ----------
  console.log('\n5. Menejer va mijoz');

  {
    const r = await kimdir(
      menejerProfil.pid,
      `select count(*)::int as n from customers where manager_id = '${mgr.id}'`
    );
    tekshir('menejer o\'z mijozlarini ko\'rmoqda', Number(r[0].n) === mgr.mijozlar, r[0].n + ' ta');
  }
  {
    const r = await kimdir(
      menejerProfil.pid,
      `select count(*)::int as n from customers where id = '${mgr.proxy_id}'`
    );
    tekshir('menejer o\'z xaridor kartochkasini ko\'radi', Number(r[0].n) === 1);
  }
  {
    const r = await kimdir(
      menejerProfil.pid,
      `select coalesce(sum(amount),0) as s from ledger_entries where customer_id = '${mgr.proxy_id}'`
    );
    tekshir(
      'menejer korxona oldidagi qarzini ko\'radi',
      Number(r[0].s) === Number(bazaJami.s),
      r[0].s
    );
  }
  if (mijoz?.pid) {
    const r = await kimdir(mijoz.pid, 'select count(*)::int as n from orders');
    tekshir('mijoz o\'z buyurtmalarini ko\'rmoqda', Number(r[0].n) > 0, r[0].n + ' ta');
    const b = await kimdir(mijoz.pid, 'select coalesce(sum(amount),0) as s from ledger_entries');
    tekshir('mijozning qarzi joyida', Number(b[0].s) !== 0 || Number(r[0].n) === 0, b[0].s);
  }

  // ---------- 6. Ikki marta qo'llash qarzni ikkilantirmasin ----------
  console.log('\n6. Takror qo\'llash');

  await kimdir(admin.pid, `select * from menejer_yashirish('${mgr.id}', true)`);
  const [ikki] = await sql(
    `select coalesce(sum(amount),0) as s from ledger_entries where customer_id = '${mgr.proxy_id}'`
  );
  tekshir(
    'qayta chaqirilsa qarz ikkilanmaydi',
    Number(ikki.s) === Number(proxyBalans.s),
    `${ikki.s} / ${proxyBalans.s}`
  );
} finally {
  // ---------- 7. Aynan tiklash ----------
  console.log('\n7. Boshlang\'ich holatga qaytarish');
  await tikla();

  const oxir = {
    korinsin: (await sql(`select mijoz_korinsin from managers where id = '${mgr.id}'`))[0]
      .mijoz_korinsin,
    qarz: await son('select coalesce(sum(amount),0) from ledger_entries'),
    yozuv: await son('select count(*)::int from ledger_entries'),
    kochgan: await son('select count(*)::int from orders where bill_customer_id <> customer_id'),
  };

  tekshir('ko\'rinish belgisi tiklandi', oxir.korinsin === BOSH.korinsin);
  tekshir('qarz yig\'indisi tiklandi', oxir.qarz === BOSH.qarz, `${oxir.qarz} / ${BOSH.qarz}`);
  tekshir('ortiqcha yozuv qolmadi', oxir.yozuv === BOSH.yozuv, `${oxir.yozuv} / ${BOSH.yozuv}`);
  tekshir(
    'buyurtma yozilishi tiklandi',
    oxir.kochgan === BOSH.kochgan,
    `${oxir.kochgan} / ${BOSH.kochgan}`
  );
}

console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
