// =============================================================
//  CLARY — HAMKOR DAFTARIDA QIDIRUV
//
//  To'rt yo'l: kalit so'z, miqdor, sana, oraliq. Ular BIRGA
//  ishlaydi (VA mantiqi).
//
//  Nega alohida sinov: bu yerda chegaralar oson adashadi.
//  «500 mingdan katta» — 500 mingning o'zi kiradimi? «20-sentabr»
//  — o'sha kunning 23:59 dagi yozuvi kiradimi? Bunday savollar
//  faqat qo'lda bosib tekshirilsa, javob har safar boshqa
//  bo'lardi.
//
//  Ishga tushirish: node tests/kassa-qidiruv.mjs
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

const ish = mkdtempSync(join(tmpdir(), 'kassa-qidiruv-'));
const chiqish = join(ish, 'qidiruv.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'apps/kassa/src/lib/qidiruv.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const Q = await import('file://' + chiqish.replace(/\\/g, '/'));

console.log('\n\x1b[1mCLARY — QIDIRUV\x1b[0m');

const bosh = () => ({ ...Q.BOSH_QIDIRUV });

/** Bitim qatori */
const B = (x) => ({
  tur: 'bitim',
  id: x.id ?? 'b1',
  sana: x.sana ?? '2026-09-20T09:00:00.000Z',
  bitim: {
    id: x.id ?? 'b1',
    klient_id: 'k1',
    yonalish: 'berdim',
    nima: 'tovar',
    tovar_nom: x.tovar ?? 'Karobka',
    izoh: x.izoh ?? null,
    summa: 0,
    valyuta: 'UZS',
    kurs: 1,
    holat: 'kutilmoqda',
    versiya: 1,
  },
});

// =============================================================
console.log('\n1. Qidiruv bor-yo‘qligi');

tekshir('bo‘sh qidiruv — yo‘q', Q.qidiruvBormi(bosh()) === false);
tekshir('kalit so‘z — bor', Q.qidiruvBormi({ ...bosh(), matn: 'karobka' }) === true);
tekshir(
  'miqdor turi tanlangan, lekin son yo‘q — YO‘Q',
  Q.qidiruvBormi({ ...bosh(), miqdorTuri: 'katta', miqdor: '' }) === false,
  'yarim to‘ldirilgan filtr ro‘yxatni kesmasligi kerak',
);
tekshir('sana — bor', Q.qidiruvBormi({ ...bosh(), sanaBosh: '2026-09-20' }) === true);

// =============================================================
console.log('\n2. Kalit so‘z');

const q1 = B({ tovar: 'Karobka', izoh: 'Akasi kelib to‘laydi' });

tekshir('tovar nomidan topiladi', Q.qidiruvMos(q1, 100, { ...bosh(), matn: 'karob' }) === true);
tekshir('izohdan topiladi', Q.qidiruvMos(q1, 100, { ...bosh(), matn: 'akasi' }) === true);
tekshir(
  'HARF KATTA-KICHIKLIGI ahamiyatsiz',
  Q.qidiruvMos(q1, 100, { ...bosh(), matn: 'KAROBKA' }) === true,
  'odam klaviaturani almashtirib yurmasin',
);
tekshir('mos kelmasa — yo‘q', Q.qidiruvMos(q1, 100, { ...bosh(), matn: 'shakar' }) === false);
tekshir(
  'izohsiz qator kalit so‘zda yiqitmaydi',
  Q.qidiruvMos(B({ tovar: 'Shakar', izoh: null }), 100, { ...bosh(), matn: 'shakar' }) === true,
);

// =============================================================
console.log('\n3. Miqdor');

const M = (turi, som) => ({ ...bosh(), miqdorTuri: turi, miqdor: String(som) });
const YARIM_MLN = 500_000_00; // tiyin

tekshir('katta: 600 ming > 500 ming', Q.qidiruvMos(q1, 600_000_00, M('katta', 500000)) === true);
tekshir(
  'katta: 500 mingning O‘ZI kirmaydi',
  Q.qidiruvMos(q1, YARIM_MLN, M('katta', 500000)) === false,
  'qat‘iy katta — teng kerak bo‘lsa «teng» bor',
);
tekshir('kichik: 400 ming < 500 ming', Q.qidiruvMos(q1, 400_000_00, M('kichik', 500000)) === true);
tekshir('kichik: teng bo‘lsa kirmaydi', Q.qidiruvMos(q1, YARIM_MLN, M('kichik', 500000)) === false);
tekshir('teng: aynan', Q.qidiruvMos(q1, YARIM_MLN, M('teng', 500000)) === true);

tekshir(
  'MANFIY o‘zgarish ham topiladi (absolyut qiymat)',
  Q.qidiruvMos(q1, -600_000_00, M('katta', 500000)) === true,
  'odam «500 mingdan katta» deganda ishorani o‘ylamaydi',
);

tekshir(
  'bo‘shliqli son o‘qiladi',
  Q.qidiruvMos(q1, 600_000_00, M('katta', '500 000')) === true,
  'maydonda «500 000» deb yozilgan bo‘lishi mumkin',
);
tekshir(
  'kasrli son: 0.10 dan katta',
  Q.qidiruvMos(q1, 20, M('katta', '0.10')) === true,
  '10 tiyin — kasr yo‘qolmasin',
);
tekshir(
  'noto‘g‘ri son filtrni O‘CHIRADI (yiqitmaydi)',
  Q.qidiruvMos(q1, 100, M('katta', 'abc')) === true,
  'yarim yozilgan filtr ro‘yxatni bo‘shatmasligi kerak',
);

// =============================================================
console.log('\n4. Sana va oraliq');

const kun = (d) => B({ sana: d });

tekshir('oraliq ichida', Q.qidiruvMos(kun('2026-09-20T09:00:00.000Z'), 100, { ...bosh(), sanaBosh: '2026-09-19', sanaOxir: '2026-09-21' }) === true);
tekshir('oraliqdan oldin', Q.qidiruvMos(kun('2026-09-18T09:00:00.000Z'), 100, { ...bosh(), sanaBosh: '2026-09-19', sanaOxir: '2026-09-21' }) === false);
tekshir('oraliqdan keyin', Q.qidiruvMos(kun('2026-09-22T09:00:00.000Z'), 100, { ...bosh(), sanaBosh: '2026-09-19', sanaOxir: '2026-09-21' }) === false);

tekshir(
  'CHEGARA: boshlanish kuni KIRADI',
  Q.qidiruvMos(kun('2026-09-19T00:00:00.000Z'), 100, { ...bosh(), sanaBosh: '2026-09-19' }) === true,
);
tekshir(
  'CHEGARA: oxirgi kunning 23:59 i ham KIRADI',
  Q.qidiruvMos(kun('2026-09-21T23:59:59.000Z'), 100, { ...bosh(), sanaOxir: '2026-09-21' }) === true,
  'vaqt emas, faqat KUN solishtiriladi',
);

tekshir(
  'bitta kun: bosh va oxir bir xil',
  Q.qidiruvMos(kun('2026-09-20T15:30:00.000Z'), 100, { ...bosh(), sanaBosh: '2026-09-20', sanaOxir: '2026-09-20' }) === true,
);

// =============================================================
console.log('\n5. Birga ishlashi (VA mantiqi)');

const aralash = { ...bosh(), matn: 'karobka', miqdorTuri: 'katta', miqdor: '500000', sanaBosh: '2026-09-19' };
tekshir('uchala shart bajarilsa — mos', Q.qidiruvMos(q1, 600_000_00, aralash) === true);
tekshir('miqdor mos kelmasa — YO‘Q', Q.qidiruvMos(q1, 100_000_00, aralash) === false);
tekshir('sana mos kelmasa — YO‘Q', Q.qidiruvMos(B({ sana: '2026-09-01T09:00:00.000Z' }), 600_000_00, aralash) === false);

console.log('\n' + (yiqildi === 0 ? '\x1b[32mHAMMASI O‘TDI\x1b[0m' : `\x1b[31m${yiqildi} TA XATO\x1b[0m`) + '\n');
process.exit(yiqildi === 0 ? 0 : 1);
