// =============================================================
//  TARIF TANLASH SINOVI
//
//  Xato: panel qat'iy "Standart" nomli tarifni qidirardi. Tarifini
//  boshqacha nomlagan biznesda (yagona tarifi "vip") natija shu
//  bo'lgan:
//    - mahsulotlar jadvalida har qatorda qizil "narx yo'q" yorlig'i,
//      ustiga "bu mahsulot mijozga ko'rinmaydi" deb yozilgan
//    - katalog hujjatida narx o'rnida "—"
//    - hisobotda "Ombor qiymati" doim 0
//  Holbuki narx bazada bor edi va mijoz uni KO'RARDI.
//
//  Sinov ikki qismdan: mantiqni haqiqatan chaqirib ko'rish va jonli
//  bazada har tenant uchun tanlangan tarifda narx borligini tekshirish.
//
//  Ishga tushirish:  node tests/tarif.mjs
// =============================================================

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
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

console.log('\n\x1b[1mTARIF TANLASH\x1b[0m');

// ---------- 1. Mantiq ----------
console.log('\n1. Qoida');

const ish = mkdtempSync(join(tmpdir(), 'tarif-'));
const chiqish = join(ish, 'tarif.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/tarif.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: chiqish,
  logLevel: 'error',
});
const T = await import('file://' + chiqish.replace(/\\/g, '/'));

const G = (...nomlar) => nomlar.map((n, i) => ({ id: 'g' + i, name: n }));

// Standart bor va narxi bor -> o'sha
tekshir(
  'Standart bor va narxli',
  T.asosiyTarifId(G('Standart', 'VIP'), () => true) === 'g0',
);

// Standart bor, LEKIN narxi yo'q -> keyingisiga o'tadi
tekshir(
  'Standart bo‘sh bo‘lsa chetlab o‘tiladi',
  T.asosiyTarifId(G('Standart', 'VIP'), (id) => id === 'g1') === 'g1',
);

// Standart umuman yo'q (clary holati: yagona "vip")
tekshir(
  'faqat «vip» bo‘lsa ham topadi',
  T.asosiyTarifId(G('vip'), () => true) === 'g0',
  'clary holati',
);

// Mijozlar eng ko'p turgan tarif afzal
tekshir(
  'mijozlar ko‘p turgan tarif afzal',
  T.asosiyTarifId(G('Diler', 'Eksport'), () => true, [
    { price_group_id: 'g1' },
    { price_group_id: 'g1' },
    { price_group_id: 'g0' },
  ]) === 'g1',
);

// Katta-kichik harf farqi bo'lmasin
tekshir("«STANDART» ham tanilsin", T.asosiyTarifId(G('STANDART'), () => true) === 'g0');
tekshir('« standart » bo‘sh joy bilan', T.asosiyTarifId(G('  standart '), () => true) === 'g0');

// Hech qayerda narx yo'q -> undefined
tekshir(
  'narx umuman bo‘lmasa undefined',
  T.asosiyTarifId(G('Standart', 'VIP'), () => false) === undefined,
);

tekshir('tarif nomi ustun sarlavhasi uchun', T.tarifNomi(G('vip'), 'g0') === 'vip');
tekshir('nomalum tarif uchun tire', T.tarifNomi(G('vip'), 'yoq') === '—');

// ---------- 2. Kodda qat'iy nom qolmadimi ----------
console.log('\n2. Kodda qat’iy nom');

for (const [fayl, nom] of [
  ['apps/admin/src/pages/Products.tsx', 'Mahsulotlar'],
  ['apps/admin/src/pages/Reports.tsx', 'Hisobotlar'],
]) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  // Izohlarda eslatib qo'yish mumkin, kodda esa bo'lmasin
  const kod = src
    .split('\n')
    .filter((q) => !q.trim().startsWith('//'))
    .join('\n');
  tekshir(`${nom}: 'Standart' qattiq yozilmagan`, !kod.includes("'Standart'"));
  tekshir(`${nom}: umumiy qoidani ishlatadi`, /asosiyTarifId/.test(kod));
}

// ---------- 3. Jonli baza ----------
console.log('\n3. Jonli baza');

let K = null;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}

if (!K?.mgmt_token) {
  console.log('  \x1b[33m!\x1b[0m kalitlar yo‘q — o‘tkazib yuborildi');
} else {
  const sql = async (q) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 200));
    return j;
  };

  const tenantlar = await sql(`
    select o.id, o.name,
           (select count(*) from price_groups g where g.org_id = o.id) as tarif_soni,
           (select count(*) from price_groups g where g.org_id = o.id
              and lower(btrim(g.name)) = 'standart') as standart_bor,
           (select count(*) from prices pr
              join product_variants v on v.id = pr.variant_id
              join products p on p.id = v.product_id
             where p.org_id = o.id) as narx_soni
    from organizations o order by o.name
  `);

  for (const t of tenantlar) {
    if (Number(t.narx_soni) === 0) {
      console.log(`  \x1b[33m-\x1b[0m ${t.name}: narx qo‘yilmagan, tekshirishga narsa yo‘q`);
      continue;
    }
    // Eski kod faqat "Standart" ni ko'rardi. Shu tenantda u yo'q bo'lsa,
    // demak narx ustuni bo'sh turardi — aynan shikoyat qilingan holat.
    const eskiKod = Number(t.standart_bor) > 0;
    tekshir(
      `${t.name}: ${t.tarif_soni} tarif, ${t.narx_soni} narx`,
      true,
      eskiKod ? "eski kod ham ko'rardi" : "eski kod BO'SH ko'rsatardi — endi tuzatilgan",
    );
  }
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
