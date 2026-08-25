// =============================================================
//  MINI APP: KATALOG VA SAVATNI TAHRIRLASH
//
//  Nega bu sinov bor: Mini App sahifasi ikki marta JIMGINA buzildi -
//  chizish paytida xato yuz berardi, sahifa esa ochilaverardi, faqat
//  ro'yxat ko'rinmasdi. Buni faqat mijoz sezardi.
//
//  Shuning uchun sahifa haqiqiy DOM'da (jsdom) ishga tushiriladi:
//  Telegram va tarmoq soxta, sahifaning O'ZI sinaladi.
//
//  Ishga tushirish:
//    node tests/miniapp-savat.mjs
// =============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ildiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.error("jsdom topilmadi. Avval: pnpm install");
  process.exit(1);
}

const HTML = fs
  .readFileSync(path.join(ildiz, 'apps/admin/public/dori-miniapp.html'), 'utf8')
  // Tashqi Telegram skripti o'rniga soxta obyekt qo'yamiz
  .replace(/<script src="https:\/\/telegram\.org[^>]*><\/script>/, '');

const NARX = { p1: 10000, p2: 2500 };
const xatolar = [];
const yuborilgan = [];
let savatServer = {}; // product_id -> qty (server tomoni)

function savatJson() {
  const items = Object.keys(savatServer).map((id) => ({
    product_id: id,
    name: 'Dori ' + id,
    price: NARX[id],
    qty: savatServer[id],
    sum: NARX[id] * savatServer[id],
  }));
  return { items, total: items.reduce((s, i) => s + i.sum, 0) };
}

const dom = new JSDOM(HTML, {
  runScripts: 'dangerously',
  url: 'https://admin.yukchibolla.com/dori-miniapp.html',
  beforeParse(w) {
    w.Telegram = {
      WebApp: {
        initData: 'query_id=x&user=%7B%22id%22%3A1%7D&auth_date=1&hash=deadbeef',
        platform: 'android',
        version: '6.0',
        ready() {},
        expand() {},
        close() {},
        HapticFeedback: { notificationOccurred() {} },
      },
    };
    w.fetch = async (url, opt) => {
      const b = JSON.parse(opt.body);

      // Sahifaning o'z telemetriyasi: 'ochildi:' - ataylab yozilgan
      // xabar, qolgani esa haqiqiy xato demakdir
      if (String(url).includes('report_client_error')) {
        if (!String(b.p_message).startsWith('ochildi:')) xatolar.push(b.p_message);
        return javob({});
      }

      if (b.amal === 'katalog') {
        return javob({
          ok: true,
          jami: 2,
          items: [
            { id: 'p1', name: 'Azitromitsin 500', manufacturer: 'Nobel', price: NARX.p1, stock: 40, eng_yaqin_muddat: '2027-03-31' },
            { id: 'p2', name: 'Paratsetamol 500', manufacturer: 'Jurabek', price: NARX.p2, stock: 0, eng_yaqin_muddat: null },
          ],
        });
      }
      if (b.amal === 'guruhlar') return javob({ ok: true, guruhlar: [] });
      if (b.amal === 'savat') return javob({ ok: true, savat: savatJson(), mijoz: { phone: '998770414020' } });
      if (b.amal === 'ozgartir') {
        yuborilgan.push(b.product_id + '=' + b.qty);
        if (b.qty > 0) savatServer[b.product_id] = b.qty;
        else delete savatServer[b.product_id];
        return javob({ ok: true, natija: { ok: true, savat: savatJson() } });
      }
      return javob({ ok: true });
    };

    function javob(body) {
      const matn = JSON.stringify(body);
      return { ok: true, status: 200, text: async () => matn, json: async () => body };
    }
  },
});

const w = dom.window;
const d = w.document;
w.addEventListener('error', (e) => xatolar.push('window.error: ' + e.message));

const kut = (ms) => new Promise((r) => setTimeout(r, ms));
const matn = (sel) => {
  const el = d.querySelector(sel);
  return el ? el.textContent.trim() : '(topilmadi)';
};

let yiqildi = 0;
function tekshir(nom, shart, qosh) {
  console.log((shart ? '  OK   ' : '  XATO ') + nom + (qosh !== undefined ? '   -> ' + qosh : ''));
  if (!shart) yiqildi++;
}

console.log('\nMINI APP: katalog va savat\n');

await kut(300);

// ---------- katalog ----------
const kartalar = d.querySelectorAll('main .karta');
tekshir('katalog chizildi', kartalar.length === 2, kartalar.length + ' kartochka');
// Telegram WebView'da ICU kesilgan bo'ladi: narx/sana Intl'siz formatlanishi shart
tekshir("narx Intl'siz formatlandi", matn('.narx') === "10 000 so'm", matn('.narx'));
tekshir('muddat sanasi', matn('.ishlab').includes('31.03.2027'), matn('.ishlab'));
tekshir('chizishda xato yuz bermadi', xatolar.length === 0, xatolar.join('; ') || 'toza');

// ---------- katalogdan savatga ----------
const karta = kartalar[0];
karta.querySelector('.qosh').click();
await kut(20);
tekshir("qo'shgach boshqaruv chiqdi", !!karta.querySelector('.miqdor'));
tekshir('jami darhol yangilandi (server javobisiz)', matn('#jami') === "10 000 so'm", matn('#jami'));
tekshir('pastki panel ochildi', d.getElementById('pastki').className.includes('bor'));

// ---------- katalogda tahrir ----------
const q = karta.querySelector('.miqdor');
const [kam, son] = [q.children[0], q.children[1]];
const kop = q.children[2];
kop.click();
kop.click();
await kut(20);
tekshir('katalogda + ishladi', son.textContent === '3', son.textContent);
tekshir('jami uch barobar', matn('#jami') === "30 000 so'm", matn('#jami'));

await kut(500); // kechikish (debounce) tugasin
tekshir(
  "tez bosishlar bitta so'rovga birlashdi",
  yuborilgan.length === 1 && yuborilgan[0] === 'p1=3',
  yuborilgan.join(', ')
);

kam.click();
await kut(500);
tekshir('katalogda − ishladi', son.textContent === '2' && savatServer.p1 === 2,
  'ekran ' + son.textContent + ', server ' + savatServer.p1);

// ---------- aniq miqdorni yozish ----------
son.click();
const inp = q.querySelector('.sonKirit');
tekshir('raqamni bosganda maydon ochildi', !!inp, inp ? 'value=' + inp.value : '');
inp.value = '24';
inp.dispatchEvent(new w.Event('blur'));
await kut(500);
tekshir('yozilgan miqdor qabul qilindi', savatServer.p1 === 24, 'server: ' + savatServer.p1);
tekshir('jami qayta hisoblandi', matn('#jami') === "240 000 so'm", matn('#jami'));

// ---------- savat bo'limi ----------
d.getElementById('tabSavat').click();
await kut(300);
const savatKarta = d.querySelectorAll('main .karta');
tekshir('savatda qator bor', savatKarta.length === 1, savatKarta.length + ' qator');
tekshir("savatda hisob ko'rinadi",
  savatKarta[0].querySelector('.hisob').textContent === "24 × 10 000 so'm",
  savatKarta[0].querySelector('.hisob').textContent);
tekshir('savatda ham boshqaruv bor', !!savatKarta[0].querySelector('.miqdor'));

const sq = savatKarta[0].querySelector('.miqdor');
sq.children[0].click();
await kut(20);
tekshir('savat qatori darhol yangilandi',
  savatKarta[0].querySelector('.hisob').textContent === "23 × 10 000 so'm",
  savatKarta[0].querySelector('.hisob').textContent);
tekshir('qator summasi', savatKarta[0].querySelector('.summa').textContent === "230 000 so'm",
  savatKarta[0].querySelector('.summa').textContent);

// ---------- o'chirish ----------
sq.querySelector('.ochir').click();
await kut(500);
tekshir("✕ qatorni o'chirdi", savatServer.p1 === undefined, JSON.stringify(savatServer));
tekshir("bo'sh savat xabari", d.querySelector('main').textContent.includes("Savat bo‘sh"));
tekshir('pastki panel yopildi', !d.getElementById('pastki').className.includes('bor'));

tekshir('butun sinov davomida JS xatosi yo‘q', xatolar.length === 0, xatolar.join('; ') || 'toza');

console.log('\n' + (yiqildi === 0 ? "HAMMASI O'TDI" : yiqildi + ' TA TEKSHIRUV YIQILDI') + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
