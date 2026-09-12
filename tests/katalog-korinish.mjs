// =============================================================
//  KATALOGDA MIJOZ NIMANI KO'RADI
//
//  Nega bu sinov bor: admin panelda mahsulot tavsifini yozadi,
//  baza uni saqlaydi, mijoz esa HECH QACHON ko'rmagan — katalog
//  so'rovi `description` ustunini umuman olmasdi. Xato hech qayerda
//  chiqmaydi: ustun so'ralmasa, ekranda shunchaki bo'sh joy qoladi.
//
//  Shu sababli "ma'lumot bor, lekin ekranga yetib bormaydi" turidagi
//  uzilish alohida tekshiriladi:
//   · katalog so'rovi tavsifni OLADI
//   · mahsulot sahifasi uni CHIZADI
//   · rasm balandligi ekran kengligidan hisoblanadi (qat'iy 320px
//     emas — katta telefonda rasm kichkina bo'lib qolardi)
//   · kartochkadagi rasm kvadratdan baland
//   · mijoz RLS ostida tavsifni o'qiy oladi (jonli baza, faqat o'qish)
//
//  Ishga tushirish:  node tests/katalog-korinish.mjs
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

console.log('\n\x1b[1mKATALOGDA MIJOZ NIMANI KO‘RADI\x1b[0m');

const kod = readFileSync(join(ROOT, 'apps/mobile/src/screens/CatalogScreen.tsx'), 'utf8');

console.log('\n1. Tavsif');

// So'rov — `product_images` bor shablon satri aynan katalog so'rovi
const sorov = kod.match(/\.select\(\s*`([\s\S]*?product_images[\s\S]*?)`/);
tekshir('katalog so‘rovi topildi', sorov != null);
tekshir(
  'so‘rov `description` ustunini oladi',
  sorov != null && /\bdescription\b/.test(sorov[1]),
  'aks holda tavsif hech qachon ekranga yetib bormaydi',
);
tekshir('mahsulot sahifasi tavsifni chizadi', /product\.description/.test(kod));
tekshir('Product turida `description` bor', /description:\s*string \| null/.test(kod));

console.log('\n2. Rasm o‘lchami');

tekshir(
  'galereya balandligi qat‘iy emas',
  !/image:\s*\{[^}]*height:\s*320/.test(kod),
  'avval 320px yozilgan edi — katta telefonda ham kichkina ko‘rinardi',
);
tekshir('galereya balandligi kenglikdan hisoblanadi', /galleryHeight/.test(kod) && /galleryWidth\s*\*/.test(kod));

const kartochka = kod.match(/cardWidth\s*\*\s*([\d.]+)/);
tekshir(
  'kartochka rasmi kvadratdan baland',
  kartochka != null && parseFloat(kartochka[1]) > 1,
  kartochka ? `kenglikning ${kartochka[1]} barobari` : 'koeffitsiyent topilmadi',
);

console.log('\n3. Brend va minimal partiya');

tekshir(
  'so‘rov `brand` va `min_order_qty` ni oladi',
  sorov != null && /\bbrand\b/.test(sorov[1]) && /\bmin_order_qty\b/.test(sorov[1]),
);
tekshir('kartochkada minimal partiya ko‘rinadi', /item\.minMiqdor > 1/.test(kod));
tekshir('mahsulot sahifasida brend ko‘rinadi', /product\.brand/.test(kod));
tekshir(
  'minimaldan kam miqdorda savat tugmasi o‘chiq',
  /qty >= minMiqdor/.test(kod),
  'serverda ham tekshiriladi (create_order → MIN_MIQDOR)',
);

console.log('\n4. Katalog filtri');

tekshir(
  'saralash, material, o‘lcham va qoldiq filtri bor',
  /saralash/.test(kod) && /material/.test(kod) && /olcham/.test(kod) && /faqatQoldiq/.test(kod),
);
tekshir(
  'o‘lcham filtri `!inner` bilan qo‘shiladi',
  /product_variants!inner/.test(kod),
  'aks holda mos kelmaydigan variantlar ham qaytardi',
);
tekshir(
  'narx bo‘yicha saralash sahifalash bilan aralashmaydi',
  /ozimizFiltrlaymiz/.test(kod) && /range\(0, TOLIQ_CHEK - 1\)/.test(kod),
  'birinchi 20 talik ichidagi arzoni "eng arzon" bo‘lib ko‘rinardi',
);
tekshir(
  'kesh filtrlangan ro‘yxatni saqlamaydi',
  /isDefaultView[\s\S]{0,200}faqatQoldiq/.test(kod),
  'oflayn holatda filtrlangan ro‘yxat butun katalog bo‘lib ko‘rinardi',
);
// Izohda "localeCompare" so'zi turishi mumkin (nega ishlatilmagani
// yozilgan) — shuning uchun CHAQIRUV qidiriladi, so'z emas
tekshir(
  'localeCompare chaqirilmagan',
  !/\.localeCompare\s*\(/.test(kod),
  'Telegram WebView’da Intl yo‘q — RangeError beradi',
);

// ---------- Jonli baza: mijoz tavsifni o'qiy oladimi ----------

console.log('\n5. Jonli baza (RLS)');

let K = null;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q */
}

if (!K?.mgmt_token) {
  console.log('  \x1b[33m-\x1b[0m kalitlar yo‘q — jonli tekshiruv o‘tkazib yuborildi');
} else {
  const r = await fetch(`https://api.supabase.com/v1/projects/${K.ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
    // Faqat O'QISH: mijoz nomidan RLS ostida nechta tavsifli mahsulot
    // ko'rinishini sanaydi
    body: JSON.stringify({
      query: `
        select set_config('request.jwt.claims',
                 json_build_object('sub', (select p.id from public.profiles p
                                           where p.role = 'customer' and p.customer_id is not null
                                           limit 1))::text, true) as x;
        set local role authenticated;
        select count(*)::int as tavsifli
        from public.products
        where description is not null and length(trim(description)) > 0;`,
    }),
  });
  const matn = await r.text();
  let soni = null;
  try {
    const j = JSON.parse(matn);
    soni = Array.isArray(j) ? (j.at(-1)?.tavsifli ?? null) : null;
  } catch {
    /* javob JSON emas */
  }
  tekshir(
    'mijoz RLS ostida tavsifni o‘qiy oladi',
    soni != null,
    soni != null ? soni + ' ta tavsifli mahsulot ko‘rinadi' : matn.slice(0, 200),
  );
}

console.log(
  yiqildi === 0 ? '\n\x1b[32mHAMMASI O‘TDI\x1b[0m\n' : `\n\x1b[31m${yiqildi} ta yiqildi\x1b[0m\n`,
);
process.exit(yiqildi === 0 ? 0 : 1);
