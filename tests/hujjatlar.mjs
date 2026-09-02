// =============================================================
//  CHOP ETILADIGAN HUJJATLAR SINOVI
//
//  To'rtta hujjat (faktura, yig'ish varaqasi, katalog, hisobot)
//  endi bitta asosdan quriladi va tenantning sozlamasini o'qiydi.
//
//  Ikki xil tekshiruv bor:
//
//   1) HAQIQIY ISHLATIB KO'RISH - lib/hujjat.ts esbuild bilan
//      yig'iladi (supabase o'rniga qo'g'irchoq qo'yiladi) va uslub
//      haqiqiy sozlama bilan chaqiriladi. Ya'ni "A5 tanlansa
//      hujjatda A5 chiqadimi" degan savolga kod o'qib emas, natijani
//      ko'rib javob beriladi.
//
//   2) NAQSH TEKSHIRUVI - pop-up muammosi uchun. `window.open` ni
//      `await` dan KEYIN chaqirsa, brauzer uni bloklaydi va hujjat
//      umuman ochilmaydi. Bu xato hech qanday xato xabari bermaydi -
//      shunchaki hech narsa bo'lmaydi. Shuning uchun har to'rt
//      funksiyada oyna birinchi await'dan oldin ochilishini
//      tekshiramiz.
//
//  Ishga tushirish:  node tests/hujjatlar.mjs
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

console.log('\n\x1b[1mCHOP ETILADIGAN HUJJATLAR\x1b[0m');

// ---------- 1. Asosni haqiqatan ishlatib ko'ramiz ----------
console.log('\n1. Sozlama hujjatga yetib boradimi');

const ish = mkdtempSync(join(tmpdir(), 'hujjat-'));
const kirish = join(ish, 'kirish.ts');
const chiqish = join(ish, 'hujjat.mjs');

// supabase importini qo'g'irchoq bilan almashtiramiz: bu sinov tarmoqqa
// chiqmaydi, faqat uslub/blank/imzo funksiyalarini tekshiradi.
writeFileSync(
  kirish,
  `export * from ${JSON.stringify(join(ROOT, 'apps/admin/src/lib/hujjat.ts').replace(/\\/g, '/'))};`,
);

const qogirchoq = join(ish, 'supabase-qogirchoq.ts');
writeFileSync(qogirchoq, 'export const supabase = {} as any;\n');

// esbuild'ning JS API'si: .cmd faylini ishga tushirish Windows'da
// spawnSync EINVAL beradi, API esa hamma tizimda bir xil ishlaydi.
// `alias` nisbiy yo'lni qabul qilmaydi, shuning uchun kichik plagin.
await esbuild.build({
  entryPoints: [kirish],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: chiqish,
  logLevel: 'error',
  plugins: [
    {
      name: 'supabase-qogirchoq',
      setup(build) {
        build.onResolve({ filter: /(^|\/)supabase$/ }, () => ({ path: qogirchoq }));
      },
    },
  ],
});

const H = await import('file://' + chiqish.replace(/\\/g, '/'));

const SOZLAMA = {
  org_id: 'x',
  logo_path: null,
  manzil: "Andijon, Bobur ko'chasi 12",
  telefon: '+998 90 123 45 67',
  stir: '301234567',
  bank: 'Ipoteka Bank',
  hisob_raqam: '20208000900001234567',
  qogoz: 'A5',
  chekka_tepa: 8,
  chekka_past: 9,
  chekka_chap: 10,
  chekka_ong: 11,
  shrift: '"Times New Roman", Times, serif',
  olcham_matn: 13,
  olcham_sarlavha: 26,
  olcham_jadval: 9,
  rang: '#0B7A55',
  ustun_rasm: false,
  ustun_sku: true,
  ustun_razmer: true,
  imzo_topshirdi: 'Berdi',
  imzo_qabul: 'Oldi',
  altbilgi: 'Rahmat!',
  org_nomi: 'Mary Collection',
};

const css = H.uslub(SOZLAMA);

tekshir('qog‘oz o‘lchami', css.includes('size: A5'), 'A5');
// Chekka tartibi CSS'da: tepa o'ng past chap
tekshir('chekka to‘rt tomondan', css.includes('margin: 8mm 11mm 9mm 10mm'), '8/11/9/10 mm');
tekshir('shrift', css.includes('font-family: "Times New Roman"'));
tekshir('matn o‘lchami', css.includes('font-size: 13pt'));
tekshir('jadval o‘lchami', css.includes('font-size: 9pt'));
tekshir('sarlavha o‘lchami', css.includes('font-size: 26pt'));
tekshir('rang', css.includes('#0B7A55'));

const blank = H.blank(SOZLAMA, null, null, { turi: 'Faktura', raqam: 7, sana: '01.09.2026' });
tekshir('blankda biznes nomi', blank.includes('Mary Collection'));
tekshir('blankda manzil', blank.includes('Bobur'));
tekshir('blankda STIR', blank.includes('STIR: 301234567'));
tekshir('blankda bank va hisob', blank.includes('Ipoteka Bank · 20208000900001234567'));
tekshir('blankda raqam', blank.includes('№7'));
tekshir('logosiz ham ishlaydi', !blank.includes('<img'));

const imzo = H.imzo(SOZLAMA);
tekshir('imzo matnlari sozlamadan', imzo.includes('Berdi') && imzo.includes('Oldi'));
tekshir('altbilgi matni', H.altbilgi(SOZLAMA).includes('Rahmat!'));

// Bo'sh sozlama bilan ham yiqilmasin: qator hali yaratilmagan tenant
const bosh = H.uslub({});
tekshir('sozlamasiz ham hujjat quriladi', bosh.includes('size: A4') && bosh.includes('margin: 14mm'));

// XSS: biznes nomi bazadan keladi, ya'ni ishonchli emas
const yovuz = H.blank({ ...SOZLAMA, org_nomi: '<script>alert(1)</script>' }, null, null, { turi: 'T' });
tekshir('nom ekranlanadi (XSS)', !yovuz.includes('<script>'), 'html qochirildi');

// ---------- 2. Pop-up naqshi ----------
console.log('\n2. Oyna await’dan oldin ochiladimi');

const FUNKSIYALAR = [
  ['apps/admin/src/lib/invoice.ts', 'openInvoice', 'faktura'],
  ['apps/admin/src/pages/Orders.tsx', 'printPickList', 'yig‘ish varaqasi'],
  ['apps/admin/src/pages/Products.tsx', 'printCatalog', 'katalog'],
  ['apps/admin/src/pages/Reports.tsx', 'printReport', 'hisobot'],
];

for (const [fayl, fn, nom] of FUNKSIYALAR) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  const bosh = src.indexOf(`function ${fn}(`);
  const tana = src.slice(bosh, bosh + 2500);

  const oyna = tana.indexOf('oynaOch()');
  const kut = tana.indexOf('await ');

  tekshir(
    `${nom}: oyna await’dan oldin`,
    oyna > 0 && (kut < 0 || oyna < kut),
    oyna < 0 ? 'oynaOch topilmadi' : 'ok',
  );
}

// ---------- 3. Eski qattiq yozilgan ko'rinish qolmadimi ----------
console.log('\n3. Ko‘rinish faqat sozlamadan');

for (const [fayl, , nom] of FUNKSIYALAR) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  const yomon = [];
  if (/@page\s*\{/.test(src)) yomon.push('@page');
  if (/font-family:\s*(?!\$)/.test(src)) yomon.push('font-family');
  if (/margin:\s*\d+mm/.test(src)) yomon.push('mm chekka');
  tekshir(`${nom}: qattiq yozilgan qiymat yo‘q`, yomon.length === 0, yomon.join(', ') || 'toza');
}

// Locale nomi qattiq yozilmasin: ICU'si qirqilgan muhitda (Telegram
// WebView) RangeError berib ekranni butunlay bo'sh qoldirgan - bu ikki
// marta bo'lgan.
//
// Tekshiruv FAQAT hujjat yasaydigan funksiya ichida: sahifaning o'zida
// 'uz-UZ' ishlatilishi muammo emas, u oddiy brauzerda ishlaydi va
// hujjatga tegishi yo'q. Butun faylni tekshirganimda aynan shu yolg'on
// xato chiqdi.
for (const [fayl, fn, nom] of [...FUNKSIYALAR, ['apps/admin/src/lib/hujjat.ts', 'altbilgi', 'asos']]) {
  const src = readFileSync(join(ROOT, fayl), 'utf8');
  const bosh = src.indexOf(`function ${fn}(`);
  const tana = bosh < 0 ? '' : src.slice(bosh, bosh + 3000);
  const bor = /toLocale\w+\(\s*['"][a-z]{2}-[A-Z]{2}['"]/.test(tana);
  tekshir(`${nom}: locale nomi qattiq yozilmagan`, !bor, bor ? 'RangeError xavfi' : 'ok');
}

// ---------- 4. Jonli zanjir: panel -> baza -> hujjat ----------
// Yuqoridagi sinovlar sozlamani QO'LDA berib tekshirdi. Bu bo'lim esa
// haqiqiy yo'lni bosib ko'radi: panel saqlaydigan RPC chaqiriladi,
// keyin o'sha qiymatlar qaytib keladimi.
//
// EHTIYOT: bu jonli baza. Sinov mavjud sozlamani AVVAL SAQLAB OLADI va
// oxirida aynan tiklaydi - aks holda sinov ishlab turgan biznesning
// hujjat ko'rinishini o'zgartirib qo'yardi.
let K = null;
try {
  K = JSON.parse(readFileSync(join(ROOT, 'kodchi/kalitlar.json'), 'utf8'));
} catch {
  /* kalitlar yo'q - jonli bo'lim o'tkazib yuboriladi */
}

if (!K?.admin?.email) {
  console.log('\n4. Jonli zanjir\n  \x1b[33m!\x1b[0m kalitlar yo‘q — o‘tkazib yuborildi');
} else {
  console.log('\n4. Jonli zanjir: panel → baza → hujjat');
  const URL = `https://${K.ref}.supabase.co`;

  const kirish = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: K.anon_key },
    body: JSON.stringify({ email: K.admin.email, password: K.admin.password }),
  });
  const tok = (await kirish.json()).access_token;

  async function rpc(nom, args) {
    const r = await fetch(`${URL}/rest/v1/rpc/${nom}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: K.anon_key, Authorization: 'Bearer ' + tok },
      body: JSON.stringify(args ?? {}),
    });
    const t = await r.text();
    return { status: r.status, j: (() => { try { return JSON.parse(t); } catch { return t; } })() };
  }

  // 1) Hozirgi holatni saqlab qo'yamiz
  const oldingi = (await rpc('hujjat_sozlama')).j;
  const bordi = await fetch(`${URL}/rest/v1/org_hujjat_sozlama?select=org_id`, {
    headers: { apikey: K.anon_key, Authorization: 'Bearer ' + tok },
  });
  const qatorBorMi = ((await bordi.json()) ?? []).length > 0;

  try {
    const sinov = {
      qogoz: 'A5', chekka_tepa: 8, olcham_matn: 13,
      rang: '#0B7A55', ustun_rasm: false, altbilgi: '__sinov__',
    };
    const yoz = await rpc('hujjat_sozlama_saqla', { p: sinov });
    tekshir('sozlama saqlanadi', yoz.status < 400, 'HTTP ' + yoz.status);

    const qayta = (await rpc('hujjat_sozlama')).j;
    for (const [kalit, kutilgan] of Object.entries(sinov)) {
      tekshir(`qaytib keldi: ${kalit}`, String(qayta[kalit]) === String(kutilgan), String(qayta[kalit]));
    }

    // Sozlama HUJJATGA yetib boradimi — CSS ni shu qiymatlardan quramiz
    const jonliCss = H.uslub(qayta);
    tekshir('hujjatda A5', jonliCss.includes('size: A5'));
    tekshir('hujjatda 8mm tepa chekka', jonliCss.includes('margin: 8mm'));
    tekshir('hujjatda yashil rang', jonliCss.includes('#0B7A55'));

    // Baza chegaralari: panelda xato bo'lsa ham axlat tushmasin
    for (const [nom, p] of [
      ['chekka 999mm', { chekka_tepa: 999 }],
      ['rang “qizil”', { rang: 'qizil' }],
      ['qog‘oz A3', { qogoz: 'A3' }],
      ['shrift 100pt', { olcham_matn: 100 }],
    ]) {
      const r = await rpc('hujjat_sozlama_saqla', { p });
      tekshir(`to‘siladi: ${nom}`, r.status >= 400, 'HTTP ' + r.status);
    }
  } finally {
    // 2) Qanday bo'lsa - shunday tiklaymiz
    if (qatorBorMi) {
      await rpc('hujjat_sozlama_saqla', {
        p: {
          logo_path: oldingi.logo_path, manzil: oldingi.manzil, telefon: oldingi.telefon,
          stir: oldingi.stir, bank: oldingi.bank, hisob_raqam: oldingi.hisob_raqam,
          qogoz: oldingi.qogoz, chekka_tepa: oldingi.chekka_tepa, chekka_past: oldingi.chekka_past,
          chekka_chap: oldingi.chekka_chap, chekka_ong: oldingi.chekka_ong,
          shrift: oldingi.shrift, olcham_matn: oldingi.olcham_matn,
          olcham_sarlavha: oldingi.olcham_sarlavha, olcham_jadval: oldingi.olcham_jadval,
          rang: oldingi.rang, ustun_rasm: oldingi.ustun_rasm, ustun_sku: oldingi.ustun_sku,
          ustun_razmer: oldingi.ustun_razmer, imzo_topshirdi: oldingi.imzo_topshirdi,
          imzo_qabul: oldingi.imzo_qabul, altbilgi: oldingi.altbilgi,
        },
      });
      const tiklandi = (await rpc('hujjat_sozlama')).j;
      tekshir(
        'oldingi sozlama tiklandi',
        String(tiklandi.qogoz) === String(oldingi.qogoz) &&
          String(tiklandi.rang) === String(oldingi.rang),
        `${tiklandi.qogoz} · ${tiklandi.rang}`,
      );
    } else {
      // Qator yo'q edi — sinov yaratganini o'chiramiz
      const mgmt = `https://api.supabase.com/v1/projects/${K.ref}/database/query`;
      await fetch(mgmt, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K.mgmt_token },
        body: JSON.stringify({
          query: `delete from org_hujjat_sozlama where altbilgi = '__sinov__'`,
        }),
      });
      const qoldi = (await rpc('hujjat_sozlama')).j;
      tekshir('sinov qatori o‘chirildi', qoldi.altbilgi !== '__sinov__', 'toza');
    }
  }
}

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
