// =============================================================
//  ZAXIRA — barcha jadvallarni mahalliy kompyuterga nusxalaydi
//
//  NEGA KERAK: loyiha bepul tarifda va Supabase tomonda tiklab
//  bo'ladigan zaxira YO'Q (pitr_enabled: false, backups: []). Ya'ni
//  hozir baza yo'qolsa, qaytarib bo'lmaydi.
//
//  NIMA QILADI: har bir jadvalni JSON qilib `D:\ilova-zaxira\<sana>\`
//  ichiga yozadi. Sxema esa `supabase/migrations/` da (git'da) turibdi —
//  ikkalasi birga to'liq tiklash uchun yetarli.
//
//  TIKLASH TARTIBI (yangi loyihada):
//    1. Migratsiyalarni qo'llash (kodchi\migratsiya-qollash.ps1)
//    2. JSON fayllarni quyidagi tartibda yuklash: organizations,
//       price_groups, categories, managers, customers, products,
//       product_variants, prices, product_images, stock_levels,
//       orders, order_items, ledger_entries, payments, qolganlari
//    3. auth.users alohida: parollar bu zaxirada YO'Q (ular Supabase
//       auth sxemasida) — foydalanuvchilar qayta yaratiladi.
//
//  Ishga tushirish:  node scripts/zaxira.mjs
//  Kunlik qilish:    Windows Task Scheduler -> shu buyruq
// =============================================================

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'kodchi', 'kalitlar.json'), 'utf8'));
const MGMT = `https://api.supabase.com/v1/projects/${CFG.ref}/database/query`;

// Zaxira REPO ICHIDA EMAS — tasodifan git'ga tushib ketmasin
const CHIQISH = process.env.ZAXIRA_YOLI ?? 'D:\\ilova-zaxira';

const QATOR_CHEGARASI = 50000;   // bundan katta jadval bo'laklab olinadi

async function sql(query) {
  const r = await fetch(MGMT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CFG.mgmt_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

const sana = new Date().toISOString().slice(0, 10);
const papka = join(CHIQISH, sana);
mkdirSync(papka, { recursive: true });

console.log(`\nZAXIRA — ${CFG.ref}`);
console.log(`Papka: ${papka}\n`);

const jadvallar = await sql(`
  select c.relname as nom, c.reltuples::bigint as taxminiy
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`);

let jamiQator = 0;
const hisobot = [];

for (const { nom } of jadvallar) {
  try {
    const [{ n }] = await sql(`select count(*)::int as n from public."${nom}"`);
    if (n === 0) {
      hisobot.push({ nom, qator: 0, holat: 'bo\'sh' });
      console.log(`  ${nom.padEnd(26)} 0`);
      continue;
    }
    if (n > QATOR_CHEGARASI) {
      hisobot.push({ nom, qator: n, holat: 'katta — bo\'lib olinmadi' });
      console.log(`  ${nom.padEnd(26)} ${n}  \x1b[33m(chegaradan katta, o'tkazib yuborildi)\x1b[0m`);
      continue;
    }

    // json_agg bilan bitta so'rovda: qiymatlar turini saqlaydi
    const [{ data }] = await sql(
      `select coalesce(json_agg(t), '[]'::json) as data from public."${nom}" t`
    );
    writeFileSync(join(papka, `${nom}.json`), JSON.stringify(data, null, 1), 'utf8');
    jamiQator += n;
    hisobot.push({ nom, qator: n, holat: 'ok' });
    console.log(`  ${nom.padEnd(26)} ${n}`);
  } catch (e) {
    hisobot.push({ nom, qator: -1, holat: 'XATO: ' + e.message.slice(0, 80) });
    console.log(`  \x1b[31m${nom.padEnd(26)} XATO\x1b[0m — ${e.message.slice(0, 80)}`);
  }
}

writeFileSync(
  join(papka, '_hisobot.json'),
  JSON.stringify({ ref: CFG.ref, sana: new Date().toISOString(), jamiQator, hisobot }, null, 2),
  'utf8'
);

console.log(`\nJami: ${jamiQator} qator, ${hisobot.filter((h) => h.holat === 'ok').length} jadval`);
console.log(`Sxema: supabase/migrations/ (git'da) — tiklashda ikkalasi kerak\n`);
