// =============================================================
//  SOTUV VARAQALARI
//
//  Talab: sotuv ekranida beshta mustaqil varaq bo'lsin va ma'lumot
//  YO'QOLMASIN — boshqa modulga o'tilsa ham, sklad almashtirilsa ham,
//  ekrandan chiqib ketilsa ham. Varaq faqat sotuv yakunlangach yoki
//  operator o'zi tozalagach bo'shaydi.
//
//  Uch qism:
//   1. Xotira mantiqi — muddat, buzilgan ma'lumot (brauzersiz)
//   2. Ekran qoidalari — manba kodi
//   3. Baza — sklad almashganda narx qayta olinadi
//
//  Ishga tushirish:  node tests/sotuv-varaq.mjs
// =============================================================

import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mSOTUV VARAQALARI\x1b[0m');

// ---------- 1. Xotira mantiqi ----------
console.log('\n1. Xotiradan o‘qish');

const ish = join(ROOT, 'node_modules', '.cache', 'varaq-sinov');
mkdirSync(ish, { recursive: true });
const chiqish = join(ish, 'varaqlar.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/admin/src/lib/varaqlar.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  // React kerak emas: bu yerda faqat toza funksiya sinaladi
  plugins: [
    {
      name: 'react-qogirchoq',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, (a) => ({ path: a.path, namespace: 'qq' }));
        build.onLoad({ filter: /.*/, namespace: 'qq' }, () => ({
          contents:
            'export const useState=()=>[];export const useEffect=()=>{};' +
            'export const useRef=()=>({current:null});export const useCallback=(f)=>f;',
        }));
      },
    },
  ],
  outfile: chiqish,
  logLevel: 'error',
});
const V = await import('file://' + chiqish.replace(/\\/g, '/'));

const HOZIR = 1_800_000_000_000;
const SOAT = 60 * 60 * 1000;
const namuna = (n) => ({ sklad: 'w' + n, savat: [{ id: 'd', qty: n }], mijoz: null, izoh: '' });

const uch = V.tozalabOqi(
  {
    faol: 2,
    varaqlar: [namuna(1), null, namuna(3), namuna(4), null],
    vaqt: [HOZIR - SOAT, 0, HOZIR - 2 * SOAT, HOZIR - 40 * SOAT, 0],
  },
  5,
  HOZIR,
);

tekshir('faol varaq saqlanadi', uch.faol === 2, uch.faol);
tekshir('yangi varaqlar qoladi', uch.varaqlar[0] != null && uch.varaqlar[2] != null);
tekshir(
  'muddati o‘tgan varaq tushadi',
  uch.varaqlar[3] === null,
  '40 soat oldingi — kechagi savat ochilmasin',
);
tekshir('bo‘sh joy bo‘sh qoladi', uch.varaqlar[1] === null && uch.varaqlar[4] === null);
tekshir('uzunlik doim beshta', uch.varaqlar.length === 5, uch.varaqlar.length);

// Buzilgan yoki begona ma'lumot butun ekranni yiqitmasin
for (const [nom, xom] of [
  ['null', null],
  ['satr', 'shunchaki matn'],
  ['bo‘sh obyekt', {}],
  ['massivsiz', { faol: 1, varaqlar: 'yo‘q', vaqt: null }],
  ['vaqtsiz varaq', { faol: 0, varaqlar: [namuna(1)], vaqt: [] }],
]) {
  const r = V.tozalabOqi(xom, 5, HOZIR);
  tekshir(
    `buzilgan holat: ${nom}`,
    r.varaqlar.length === 5 && r.faol === 0 && r.varaqlar.every((x) => x === null),
    'bo‘sh holatga qaytadi',
  );
}

const chetda = V.tozalabOqi({ faol: 99, varaqlar: [], vaqt: [] }, 5, HOZIR);
tekshir('chegaradan tashqari faol tuzatiladi', chetda.faol === 0, chetda.faol);

const kelajak = V.tozalabOqi(
  { faol: 0, varaqlar: [namuna(1)], vaqt: [HOZIR + 100 * SOAT] },
  5,
  HOZIR,
);
tekshir(
  'kelajakdagi vaqt ishonchsiz',
  kelajak.varaqlar[0] === null,
  'soat o‘zgargan bo‘lishi mumkin',
);

tekshir('beshta varaq', V.VARAQ_SONI === 5, V.VARAQ_SONI);
tekshir('muddat 24 soat', V.VARAQ_MUDDATI === 24 * SOAT, V.VARAQ_MUDDATI / SOAT + ' soat');

// ---------- 2. Ekran qoidalari ----------
console.log('\n2. Ekran');

const lib = readFileSync(join(ROOT, 'apps/admin/src/lib/varaqlar.ts'), 'utf8');
const src = readFileSync(join(ROOT, 'apps/admin/src/pages/DoriSotuv.tsx'), 'utf8');

tekshir(
  'localStorage — ilova yopilsa ham qolsin',
  /localStorage/.test(lib),
  'sessionStorage varaq yopilganda yo‘qotardi',
);
tekshir(
  'boshqa oynadagi o‘zgarish ko‘rinadi',
  /addEventListener\('storage'/.test(lib),
  'localStorage butun brauzerga umumiy',
);
tekshir('eski qoralama ko‘chiriladi', /eskiQoralamaniKochir/.test(lib) && /eskiQoralamaniKochir/.test(src),
  'deploy savat terilayotganda tushishi mumkin');

tekshir('ekran varaqlarni ishlatadi', /useVaraqlar<Qoralama>/.test(src));
tekshir('beshta tugma chiziladi', /length: VARAQ_SONI/.test(src));
tekshir('«YANGI SOTUV» yozuvi bor', /YANGI SOTUV/.test(src));

// Eng muhimi: varaq FAQAT sotuv yakunlangach yoki qo'lda bo'shasin
const tozalashSoni = (src.match(/V\.tozala\(\)/g) ?? []).length;
tekshir(
  'varaq faqat ikki joyda bo‘shaydi',
  tozalashSoni === 3,
  'sot() da 1 ta, varaqniTozala() da 2 ta (bo‘sh va tasdiqdan keyin)',
);
tekshir(
  'eski qoralama tozalagichi olib tashlandi',
  !/qoralamalarniTozala/.test(src),
  'u boshqa varaqlarga ham tegib ketardi',
);
tekshir(
  'tozalashdan oldin tasdiq so‘raladi',
  /async function varaqniTozala[\s\S]{0,400}tasdiqlaSoz/.test(src),
);

// Sklad almashganda savat SAQLANSIN
tekshir(
  'sklad almashganda savat tozalanmaydi',
  !/onChange=\{\(e\) => \{ setSklad\(e\.target\.value\); setSavat\(\[\]\)/.test(src),
  'avval butun savat yo‘qolardi',
);
tekshir('sklad almashtirish alohida funksiyada', /async function skladAlmash/.test(src));
tekshir(
  'narxlar yangi skladdan olinadi',
  /dori_sotuv_narxlar/.test(src),
  'aks holda ekranda bir narx, hujjatda boshqasi',
);
tekshir(
  'narx olinmasa sklad almashmaydi',
  /Narxlar olinmadi, sklad almashtirilmadi/.test(src),
  'eski narx bilan yangi skladda sotilib ketardi',
);
tekshir(
  'skladda yo‘q dori o‘chirilmaydi, belgilanadi',
  /BU SKLADDA YO/.test(src) && /yoq: true/.test(src),
);
tekshir(
  'yo‘q pozitsiya summaga kirmaydi',
  /const sotiladi = savat\.filter\(\(x\) => !x\.yoq/.test(src) &&
    /const jami = sotiladi\.reduce/.test(src),
);
tekshir(
  'yo‘q pozitsiya bilan sotib bo‘lmaydi',
  /if \(yoqPozitsiya > 0\) \{[\s\S]{0,200}return setXato/.test(src),
);

// ---------- 3. Baza ----------
console.log('\n3. Baza');

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
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
    return j;
  };
  const admin = (q) =>
    sql(
      `select set_config('request.jwt.claims',
         json_build_object('sub', (select id from profiles where role = 'super_admin' limit 1))::text,
         true) as x;
       ${q}`,
    );

  // Tekshiruv qat'iy "is_super_admin" nomini qidirardi. Dorixona
  // alohida biznesga chiqarilgach kirish qoidasi dori_ruxsat() ga
  // o'tdi — kod to'g'ri edi, sinov esa eskirib yolg'on xato berardi.
  // Endi savol nomga emas, MAQSADGA bog'langan: funksiyada umuman
  // ruxsat tekshiruvi bormi.
  const fn = await sql(`
    select p.prosecdef as definer,
           (pg_get_functiondef(p.oid) like '%dori_ruxsat%'
            or pg_get_functiondef(p.oid) like '%is_super_admin%') as tekshiruv,
           has_function_privilege('anon', p.oid, 'execute') as anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'dori_sotuv_narxlar'
  `);
  tekshir('dori_sotuv_narxlar mavjud', fn.length === 1);
  if (fn.length === 1) {
    tekshir('security definer', fn[0].definer === true);
    tekshir('ruxsat tekshiruvi bor', fn[0].tekshiruv === true);
    tekshir('anon chaqirolmaydi', fn[0].anon === false);
  }

  const anon = await fetch(`https://${K.ref}.supabase.co/rest/v1/rpc/dori_sotuv_narxlar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ p_warehouse_id: '00000000-0000-0000-0000-000000000000', p_ids: [] }),
  });
  tekshir('anon HTTP orqali ham ololmaydi', anon.status >= 400, 'HTTP ' + anon.status);

  // Haqiqiy tekshiruv: bitta skladda bor, ikkinchisida yo'q dori
  let tozalash = null;
  try {
    const [{ id: wA }] = await sql(
      "insert into dori_warehouses (name, priority) values ('SINOV-VARAQ-A', 97) returning id;",
    );
    const [{ id: wB }] = await sql(
      "insert into dori_warehouses (name, priority) values ('SINOV-VARAQ-B', 98) returning id;",
    );
    const [{ id: d1 }] = await sql(
      `insert into dori_products (name, name_norm, is_active)
       values ('SINOV VARAQ DORI', dori_norm('SINOV VARAQ DORI'), true) returning id;`,
    );
    tozalash = { wA, wB, d1 };

    await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
               values ('${wA}', '${d1}', 1000, 1500, 9, 'sinov');`);
    await sql(`insert into dori_offers (warehouse_id, product_id, base_price, price, stock, last_import)
               values ('${wB}', '${d1}', 1000, 2400, 4, 'sinov');`);

    const [{ j: aRes }] = await admin(
      `select dori_sotuv_narxlar('${wA}', array['${d1}']::uuid[]) as j;`,
    );
    tekshir('A skladda narx to‘g‘ri', Number(aRes[0]?.price) === 1500, aRes[0]?.price);

    const [{ j: bRes }] = await admin(
      `select dori_sotuv_narxlar('${wB}', array['${d1}']::uuid[]) as j;`,
    );
    tekshir('B skladda BOSHQA narx', Number(bRes[0]?.price) === 2400, bRes[0]?.price);
    tekshir('qoldiq ham B skladniki', Number(bRes[0]?.stock) === 4, bRes[0]?.stock);
    tekshir('bor = true', bRes[0]?.bor === true);

    // Taklifni olib tashlaymiz: dori endi B skladda yo'q
    await sql(`delete from dori_offers where warehouse_id = '${wB}' and product_id = '${d1}';`);
    const [{ j: yoqRes }] = await admin(
      `select dori_sotuv_narxlar('${wB}', array['${d1}']::uuid[]) as j;`,
    );
    tekshir(
      'skladda yo‘q dori QATORDA qoladi',
      yoqRes.length === 1,
      'jimgina yo‘qolib ketmasin',
    );
    tekshir('bor = false', yoqRes[0]?.bor === false, String(yoqRes[0]?.bor));
    tekshir('nomi baribir qaytadi', yoqRes[0]?.name === 'SINOV VARAQ DORI', yoqRes[0]?.name);
  } finally {
    if (tozalash) {
      await sql(`delete from dori_offers where product_id = '${tozalash.d1}';`);
      await sql(`delete from dori_products where id = '${tozalash.d1}';`);
      await sql("delete from dori_warehouses where name in ('SINOV-VARAQ-A', 'SINOV-VARAQ-B');");
    }
    const [{ n: qoldi }] = await sql(
      "select count(*)::int as n from dori_warehouses where name like 'SINOV-VARAQ-%';",
    );
    tekshir('sinov ma’lumotlari tozalandi', qoldi === 0, qoldi);
  }
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
rmSync(ish, { recursive: true, force: true });
process.exit(yiqildi === 0 ? 0 : 1);
