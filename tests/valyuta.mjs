// =============================================================
//  VALYUTA SINOVI
//
//  XATO (2026-09-09):
//    Mijoz "dollarda ko'rsin" qilib qo'yilgan, menejer narxlarni
//    dollarda kiritgan — lekin ilovada narxlar noto'g'ri chiqardi.
//
//    Ikki sabab topildi:
//
//    1. formatUsd() sonni BUTUN songa yaxlitlardi
//       (Math.round(Math.abs(n))). Menejerning narxlari $1 dan
//       kichik: $0.33, $0.37, $0.26, $0.42. Mijoz katalogda,
//       savatda va buyurtmalarida HAR BIR narxni "$0" ko'rardi.
//
//    2. Dollar faqat "mijoz USD + SHU variant USD + asl summa bor"
//       bo'lsagina ko'rsatilardi. Menejer narx qo'ymagan variant
//       baza narxidan keladi va so'mda bo'ladi — natijada bitta
//       katalogda narxlar aralash chiqardi va buyurtma butunlay
//       so'mga tushib ketardi.
//
//    3. order_usd_total() `sum(oi.orig_price)` qilardi — NULL
//       qatorlar jimgina tushib qolib, faktura summasi KAM chiqardi.
//
//  Sinov ikki qismdan: formatlash mantiqini haqiqatan chaqirib
//  ko'rish, va jonli bazadagi disp_* ustunlarining izchilligi.
//
//  Ishga tushirish:  node tests/valyuta.mjs
// =============================================================

import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mVALYUTA\x1b[0m');

// ---------- 1. Formatlash ----------
console.log('\n1. Formatlash (apps/mobile/src/lib/valyuta.ts)');

const ish = mkdtempSync(join(tmpdir(), 'valyuta-'));
const chiqish = join(ish, 'valyuta.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/mobile/src/lib/valyuta.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const V = await import('file://' + chiqish.replace(/\\/g, '/'));

// Aynan shu qiymatlar jonli bazada turibdi (manager_prices, USD)
const JONLI_NARXLAR = [0.26, 0.28, 0.33, 0.36, 0.37, 0.42, 0.44];

for (const n of JONLI_NARXLAR) {
  const s = V.formatNarx(n, 'USD');
  tekshir(`$${n} → "${s}"`, s !== '$0' && s.includes('.'), s === '$0' ? 'YAXLITLANIB KETDI' : '');
}

tekshir('dollarda ikki xona', V.formatNarx(0.3, 'USD') === '$0.30', V.formatNarx(0.3, 'USD'));
tekshir('so\'mda kasr yo\'q', V.formatNarx(3960, 'UZS') === "3 960 so'm", V.formatNarx(3960, 'UZS'));
tekshir('minglar ajratiladi', V.formatNarx(19800000, 'UZS') === "19 800 000 so'm", V.formatNarx(19800000, 'UZS'));
tekshir('katta dollar summasi', V.formatNarx(1650, 'USD') === '$1 650.00', V.formatNarx(1650, 'USD'));
tekshir('null → chiziqcha', V.formatNarx(null, 'USD') === '—');
tekshir('manfiy belgi dollardan oldin', V.formatNarx(-12.5, 'USD') === '-$12.50', V.formatNarx(-12.5, 'USD'));

// Intl ishlatilmasligi — Telegram WebView'da ICU kesilgan bo'lishi mumkin.
// IZOHLAR olib tashlanadi: fayl boshidagi ogohlantirishda bu so'zlar
// ataylab yozilgan va ular kod emas (sinov shu sababdan yolg'on
// yiqilgan edi).
const fsMod = await import('node:fs');
function izohsiz(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
for (const yol of [
  'apps/mobile/src/lib/valyuta.ts',
  'apps/mobile/src/lib/supabase.ts',
]) {
  const kod = izohsiz(fsMod.readFileSync(join(ROOT, yol), 'utf8'));
  tekshir(
    yol.split('/').pop() + " — Intl/toLocaleString yo'q",
    !/toLocaleString|Intl\./.test(kod),
    "Telegram WebView eski Android'da RangeError beradi"
  );
}

// ---------- 2. So'mdan o'girish ----------
console.log('\n2. So\'mdan o\'girish');

tekshir('so\'m → dollar', V.somdan(12000, 'USD', 12000) === 1);
tekshir('so\'mda qoladi', V.somdan(12000, 'UZS', 12000) === 12000);
tekshir('kurs 0 → so\'mda qoladi', V.somdan(12000, 'USD', 0) === 12000, 'nolga bo\'linish bo\'lmasin');
tekshir('kurs null → so\'mda qoladi', V.somdan(12000, 'USD', null) === 12000);
tekshir(
  'kurs 0 da Infinity chiqmaydi',
  Number.isFinite(V.somdan(12000, 'USD', 0)) && V.formatNarx(V.somdan(12000, 'USD', 0), 'UZS') !== '—'
);

// ---------- 3. Ekranlarda eski shart qolmaganini tekshirish ----------
console.log('\n3. Ekranlar');


const EKRANLAR = [
  'apps/mobile/src/screens/CatalogScreen.tsx',
  'apps/mobile/src/screens/CartScreen.tsx',
  'apps/mobile/src/screens/OrdersScreen.tsx',
];
for (const yol of EKRANLAR) {
  const kod = fsMod.readFileSync(join(ROOT, yol), 'utf8');
  // Aynan shu naqsh xatoga sabab bo'lgan: "mijoz USD VA shu qator USD"
  const eskiShart = /displayCurrency\s*===\s*'USD'\s*&&[\s\S]{0,80}?currency\s*===\s*'USD'/.test(kod);
  tekshir(yol.split('/').pop() + ' — eski "har qator USD" sharti yo\'q', !eskiShart);
}

// ---------- 4. Jonli baza: disp_* izchilligi ----------
console.log('\n4. Jonli baza');

const REF = 'gnuddryjsmcrjchrbvyz';
const TOKEN = process.env.ILOVA_SB_TOKEN ?? 'sbp_v0_84f093fc9847b1c397f1c69a880e9376e6bc7244';

async function sql(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

try {
  // Har qator to'ldirilgan bo'lishi shart — bo'sh qolsa ilovada "—" chiqadi
  const [bosh] = await sql(
    "select count(*)::int as n from order_items where disp_price is null"
  );
  tekshir('disp_price bo\'sh qator yo\'q', bosh.n === 0, bosh.n + ' ta bo\'sh');

  // Buyurtma jami qatorlar yig'indisiga teng bo'lishi kerak
  const farq = await sql(`
    select o.order_number, o.disp_total,
           coalesce(sum((oi.disp_price - oi.disp_discount) * oi.qty), 0) as qatorlar
    from orders o left join order_items oi on oi.order_id = o.id
    group by o.id, o.order_number, o.disp_total
    having abs(o.disp_total - coalesce(sum((oi.disp_price - oi.disp_discount) * oi.qty), 0)) > 0.01
  `);
  tekshir(
    'buyurtma jami = qatorlar yig\'indisi',
    farq.length === 0,
    farq.length ? farq.map((r) => '#' + r.order_number).join(', ') : ''
  );

  // Buyurtma va qatorlar valyutasi bir xil bo'lsin
  const aralash = await sql(`
    select distinct o.order_number
    from orders o join order_items oi on oi.order_id = o.id
    where oi.disp_currency <> o.disp_currency
  `);
  tekshir(
    'buyurtma ichida valyuta aralashmagan',
    aralash.length === 0,
    aralash.length ? aralash.map((r) => '#' + r.order_number).join(', ') : ''
  );

  // Mijozning sozlamasi bilan mos: kurs bor USD mijozda buyurtma USD bo'lsin
  const nomos = await sql(`
    select o.order_number, c.name, c.display_currency, m.usd_rate, o.disp_currency
    from orders o
    join customers c on c.id = o.customer_id
    left join managers m on m.id = c.manager_id
    where o.disp_currency <> korinish_valyutasi(c.display_currency, m.usd_rate)
  `);
  tekshir(
    'buyurtma valyutasi mijoz sozlamasiga mos',
    nomos.length === 0,
    nomos.length ? nomos.map((r) => '#' + r.order_number + ' ' + r.name).join(', ') : ''
  );

  // Dollarga o'girilgan narx qaytarib so'mga to'g'ri kelsin
  const teskari = await sql(`
    select o.order_number, oi.unit_price, oi.disp_price, m.usd_rate
    from order_items oi
    join orders o on o.id = oi.order_id
    join customers c on c.id = o.customer_id
    join managers m on m.id = c.manager_id
    where oi.disp_currency = 'USD'
      and abs(oi.disp_price * m.usd_rate - oi.unit_price) > m.usd_rate * 0.01
  `);
  tekshir(
    'dollar narxi kursga mos (disp_price × kurs ≈ unit_price)',
    teskari.length === 0,
    teskari.length ? teskari.length + ' ta qator farq qiladi' : ''
  );

  // order_usd_total endi NULL qatorlarni tushirib qoldirmaydi
  const usd = await sql(`
    select o.order_number, order_usd_total(o.id) as usd, o.disp_total, o.disp_currency
    from orders o where o.disp_currency = 'USD'
  `);
  const notogri = usd.filter((r) => Math.abs(Number(r.usd) - Number(r.disp_total)) > 0.01);
  tekshir(
    'order_usd_total = disp_total',
    notogri.length === 0,
    notogri.length ? notogri.map((r) => '#' + r.order_number).join(', ') : ''
  );
} catch (e) {
  tekshir('jonli bazaga ulanish', false, e.message);
}

console.log(
  yiqildi === 0
    ? '\n\x1b[32mHammasi joyida\x1b[0m\n'
    : `\n\x1b[31m${yiqildi} ta tekshiruv yiqildi\x1b[0m\n`
);
process.exit(yiqildi === 0 ? 0 : 1);
