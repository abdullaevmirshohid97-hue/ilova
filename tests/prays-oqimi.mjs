// =============================================================
//  PRAYS YUKLASH OQIMI
//
//  Nega kerak: mavjud dori-skladlar.mjs bazadagi funksiyalarni
//  tekshiradi va ular ishlayotgan edi — lekin EKRANDA prays saqlash
//  tugmasi yo'q edi. Foydalanuvchi "saqlash tugmasi yo'q" deb aytdi,
//  sinovlar esa yashil turardi.
//
//  Sabab: sklad ichida yashil tugma "KATALOG FARQINI KO'RSATISH"
//  deb turardi (u saqlamaydi), "saqlash" so'zi bor yagona tugma esa
//  praysni ARXIVGA yozardi va skladga tegmasdi.
//
//  Shuning uchun bu sinov ikki narsani tekshiradi:
//    1. Ekranda saqlash yo'li BOR va u to'g'ri funksiyaga boradi
//    2. Ustama shu yerda kiritiladi va bazaga yetib boradi
//
//  Ishga tushirish:  node tests/prays-oqimi.mjs
// =============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KOMP = join(ROOT, 'apps/admin/src/components/PraysYuklash.tsx');
const src = readFileSync(KOMP, 'utf8');

let yiqildi = 0;
function tekshir(nom, shart, izoh) {
  console.log((shart ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗\x1b[0m ') + nom + (izoh ? '  → ' + izoh : ''));
  if (!shart) yiqildi++;
}

console.log('\n\x1b[1mPRAYS YUKLASH OQIMI\x1b[0m');

// ---------- 1. Ekrandagi amallar ----------
console.log('\n1. Ekranda');

tekshir('«SKLADGA SAQLASH» tugmasi bor', /SKLADGA SAQLASH/.test(src));
tekshir(
  'tugma nechta qator yozilishini aytadi',
  /SKLADGA SAQLASH · \{natija\.qatorlar\.length\}/.test(src),
  'odam nima saqlanayotganini bilsin',
);
tekshir(
  'saqlash to‘g‘ri funksiyaga boradi',
  /onClick=\{skladgaSaqla\}/.test(src),
);
tekshir(
  'skladgaSaqla praysni skladga yozadi',
  /async function skladgaSaqla[\s\S]{0,1600}kataloggaYukla\(\)/.test(src),
);

// Arxivga yozadigan tugma sklad ichida ko'rinmasin — u chalkashtirgan edi
tekshir(
  '«FAKTURA SIFATIDA SAQLASH» olib tashlandi',
  !/FAKTURA SIFATIDA SAQLASH/.test(src),
  'u skladga tegmasdi',
);

tekshir('farq ko‘rish ixtiyoriy bo‘ldi', /AVVAL FARQINI KO/.test(src));

// ---------- 2. Ustama ----------
console.log('\n2. Ustama');

tekshir('foiz maydoni bor', /USTAMA — FOIZ/.test(src));
tekshir('summa maydoni bor', /YOKI SUMMA/.test(src));
tekshir('skladning hozirgi ustamasi yuklanadi', /markup_pct != null \? String/.test(src));
tekshir('saqlashda bazaga yoziladi', /dori_sklad_ustama/.test(src));
tekshir(
  'ustama praysdan OLDIN yoziladi',
  src.indexOf('dori_sklad_ustama') < src.indexOf('await kataloggaYukla()'),
  'narx shunga qarab hisoblanadi',
);

// Jonli misol formulasi bazadagi bilan bir xil bo'lishi shart
tekshir('jonli misol bor', /const namuna = \(\(\) => \{/.test(src));
tekshir(
  'yaxlitlash tannarxdan past tushirmaydi',
  /past < tannarx \? Math\.ceil/.test(src),
  'bazadagi qoida bilan bir xil',
);

// ---------- 3. Xavfsizlik to'siqlari ----------
console.log('\n3. To‘siqlar');

tekshir(
  'katta yo‘qotishda tasdiq so‘raladi',
  /pozitsiyaBor \/ 2[\s\S]{0,400}tasdiqlaSoz/.test(src),
  'skladlar shunday bo‘shab qolgan bo‘lishi mumkin',
);
tekshir('sklad pozitsiyasi oldindan o‘qiladi', /dori_sklad_pozitsiya/.test(src));

// ---------- 4. Boshi berk ko'cha ----------
console.log('\n4. Sarlavha topilmagan holat');

tekshir(
  'varaq almashtirish taklif qilinadi',
  /sarlavhaQatori < 0 &&[\s\S]{0,2000}varaqRoyxat\.map/.test(src),
  'avval faqat qizil xato chiqardi',
);

// ---------- 5. Baza tomoni ----------
console.log('\n5. Baza');

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

  for (const fn of ['dori_sklad_ustama', 'dori_sklad_pozitsiya']) {
    const r = await sql(`
      select count(*)::int as n,
             bool_or(p.prosecdef) as definer,
             bool_or(position('is_super_admin' in pg_get_functiondef(p.oid)) > 0) as tekshiruv
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = '${fn}'
    `);
    tekshir(`${fn}: mavjud`, r[0].n > 0);
    tekshir(`${fn}: super admin tekshiruvi bor`, r[0].tekshiruv === true);
  }

  // Anon chaqira olmasin
  const anon = await fetch(`https://${K.ref}.supabase.co/rest/v1/rpc/dori_sklad_ustama`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ p_warehouse_id: '00000000-0000-0000-0000-000000000000', p_markup_pct: 99 }),
  });
  tekshir('anon ustama qo‘yolmaydi', anon.status >= 400, 'HTTP ' + anon.status);

  // Manfiy ustama - narxni jimgina buzadi
  const manfiy = await sql(`
    select position('USTAMA_MANFIY' in pg_get_functiondef(oid)) > 0 as bor
    from pg_proc where proname = 'dori_sklad_ustama'
  `);
  tekshir('manfiy ustama to‘siladi', manfiy[0].bor === true);
}


// ---------- 6. Narxli praysni yuklab olish ----------
// Mijozga yuboriladigan ro'yxat: hamma sklad bitta ro'yxatga yig'iladi,
// sklad nomi chiqmaydi.
console.log('\n6. Prays eksporti');

const dori = readFileSync(join(ROOT, 'apps/admin/src/pages/DoriModuli.tsx'), 'utf8');

tekshir('yuklab olish tugmasi bor', /NARXLI PRAYSNI YUKLAB OLISH/.test(dori));
tekshir('ekrandagi qidiruv filtri qo‘llanadi', /p_q: q \|\| null/.test(dori));

// PostgREST javobni 1000 qatorda kesadi. Bitta so'rov yuborilsa,
// 4 828 dorining 1 000 tasi tushib, qolgani JIMGINA yo'qolardi.
tekshir(
  'bo‘lak-bo‘lak so‘raladi',
  /p_offset: ofs/.test(dori) && /b\.length < BOLAK/.test(dori),
  'PostgREST 1000 qatorda kesadi',
);
tekshir('cheksiz aylanishdan himoya', /ofs \/ BOLAK > 100/.test(dori));

tekshir(
  'ustunlar: nom, narx, seriya, srok, ishlab chiqaruvchi',
  /'Dori nomi'[\s\S]{0,300}Narxi[\s\S]{0,120}Seriya[\s\S]{0,160}Ishlab chiqaruvchi/.test(dori),
);
tekshir('sklad nomi ustuni yo‘q', !/Sklad['":]/.test(dori.slice(dori.indexOf('json_to_sheet'), dori.indexOf('book_new'))));

if (K?.mgmt_token) {
  const sqlE = async (q) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
      body: JSON.stringify({ query: q }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 200));
    return j;
  };

  const imzo = await sqlE(`
    select pg_get_function_identity_arguments(oid) as args
    from pg_proc where proname = 'dori_prays_eksport'
  `);
  tekshir('funksiya ofset qabul qiladi', /p_offset/.test(imzo[0]?.args ?? ''), imzo[0]?.args);
  tekshir(
    'eski ikki argumentli imzo qolmadi',
    imzo.length === 1,
    imzo.length + ' ta imzo',
  );

  const tartib = await sqlE(`
    select position('order by p.name, p.id' in pg_get_functiondef(oid)) > 0 as bor
    from pg_proc where proname = 'dori_prays_eksport'
  `);
  tekshir(
    'tartib barqaror (nom + id)',
    tartib[0]?.bor === true,
    'aks holda bo‘laklar chegarasida qator yo‘qolardi',
  );

  const anonE = await fetch(`https://${K.ref}.supabase.co/rest/v1/rpc/dori_prays_eksport`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: '{}',
  });
  tekshir('anon eksport qilolmaydi', anonE.status >= 400, 'HTTP ' + anonE.status);
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
