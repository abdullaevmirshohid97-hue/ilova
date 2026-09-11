// ============================================================================
// QARZDORLIK BOT HUJJATLARI — XLSX va PDF
//
// Bu sinov faylni HAQIQATAN yasaydi va QAYTA OCHADI. "Kodda shunday
// yozilgan" degan tekshiruv bu yerda yaramaydi: xlsx — ZIP, pdf — xref
// jadvali; ikkalasida ham bitta noto'g'ri siljish faylni ochilmas
// qiladi va buni faqat mijoz bilardi.
//
// Kutubxona yo'q — ZIP yozuvlari siqilmagan (store), shuning uchun
// ularni shu yerda o'qib olsa bo'ladi.
// ============================================================================

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let xato = 0;
let jami = 0;
function tekshir(nom, shart, izoh = '') {
  jami++;
  if (shart) {
    console.log('  ok   ' + nom);
  } else {
    xato++;
    console.log('  XATO ' + nom + (izoh ? ' — ' + izoh : ''));
  }
}

// ---- moduli TS'dan yig'ib olamiz ----
const kesh = join(ROOT, 'node_modules/.cache/qarz-fayl');
mkdirSync(kesh, { recursive: true });
const chiqish = join(kesh, 'hujjat.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'supabase/functions/telegram-qarz/hujjat.ts')],
  outfile: chiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const H = await import('file://' + chiqish.replace(/\\/g, '/'));

const davrChiqish = join(kesh, 'davr.mjs');
await esbuild.build({
  entryPoints: [join(ROOT, 'supabase/functions/telegram-qarz/davr.ts')],
  outfile: davrChiqish,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
});
const D = await import('file://' + davrChiqish.replace(/\\/g, '/'));

// ---------------------------------------------------------------------------
// Sodda ZIP o'quvchi (faqat "store" usuli)
// ---------------------------------------------------------------------------
function zipOch(bayt) {
  const dv = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  // EOCD ni oxiridan qidiramiz
  let eocd = -1;
  for (let i = bayt.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('EOCD topilmadi');
  const soni = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const fayllar = {};
  for (let i = 0; i < soni; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('markaziy yozuv buzuq');
    const usul = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const hajm = dv.getUint32(p + 24, true);
    const nomUz = dv.getUint16(p + 28, true);
    const qoshUz = dv.getUint16(p + 30, true);
    const izohUz = dv.getUint16(p + 32, true);
    const siljish = dv.getUint32(p + 42, true);
    const nom = new TextDecoder().decode(bayt.slice(p + 46, p + 46 + nomUz));
    if (usul !== 0) throw new Error('siqilgan yozuv: ' + nom);
    // Mahalliy sarlavhadan ma'lumot boshini topamiz
    if (dv.getUint32(siljish, true) !== 0x04034b50) throw new Error('mahalliy sarlavha buzuq: ' + nom);
    const lNom = dv.getUint16(siljish + 26, true);
    const lQosh = dv.getUint16(siljish + 28, true);
    const bosh = siljish + 30 + lNom + lQosh;
    const malumot = bayt.slice(bosh, bosh + hajm);
    fayllar[nom] = { matn: new TextDecoder().decode(malumot), crc, bayt: malumot };
    p += 46 + nomUz + qoshUz + izohUz;
  }
  return fayllar;
}

function crc32(b) {
  let t = crc32.t;
  if (!t) {
    t = crc32.t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Varaq XML'idan kataklar: {A1: 'matn' | son} */
function kataklar(sheet) {
  const katak = {};
  const re =
    /<c r="([A-Z]+\d+)"[^>]*?(?: t="inlineStr")?>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g;
  let m;
  while ((m = re.exec(sheet))) {
    katak[m[1]] =
      m[2] !== undefined
        ? m[2]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
        : Number(m[3]);
  }
  return katak;
}

// ---------------------------------------------------------------------------
// Sinov ma'lumoti — ataylab "og'ir": kirill nomi, bekor qilingan amal,
// XML buzadigan belgilar va nolinchi qoldiq
// ---------------------------------------------------------------------------
const SVERKA = {
  klient: { ism: 'Aziz', familiya: 'Rahimov', apteka: 'Аптека №5 "Шифо" & Ko', telefon: '+998901234567' },
  boshlangich: 1000000,
  chiqim: 5000000,
  kirim: 3500000,
  usullar: { naqd: 2000000, plastik: 1000000, klik: 500000 },
  qoldiq: 2500000,
  amallar: [
    { tur: 'chiqim', summa: 3000000, sana: '2026-09-01T10:00:00Z', izoh: 'Sentabr <partiya>' },
    { tur: 'kirim', summa: 2000000, sana: '2026-09-03T12:30:00Z', usul: 'naqd' },
    { tur: 'chiqim', summa: 2000000, sana: '2026-09-05T09:00:00Z' },
    { tur: 'kirim', summa: 1000000, sana: '2026-09-07T15:00:00Z', usul: 'plastik' },
    { tur: 'kirim', summa: 999999, sana: '2026-09-08T15:00:00Z', usul: 'klik', bekor: true, bekor_sabab: 'Xato kiritildi' },
    { tur: 'kirim', summa: 500000, sana: '2026-09-09T15:00:00Z', usul: 'klik' },
  ],
};

const HISOBOT = {
  chiqim: 12000000, kirim: 9000000, naqd: 5000000, plastik: 3000000,
  klik: 1000000, qarz: 7500000, klientlar: 3,
};

const KLIENTLAR = [
  {
    ism: 'Aziz', familiya: 'Rahimov', apteka: 'Аптека №5', telefon: '+998901234567',
    chiqim: 5000000, kirim: 3500000, naqd: 2000000, plastik: 1000000, klik: 500000,
    qarz: 2500000,
  },
  {
    ism: 'Bobur', familiya: null, apteka: 'Shifo', telefon: null,
    chiqim: 4000000, kirim: 1000000, naqd: 1000000, plastik: 0, klik: 0,
    qarz: 3000000,
  },
  // Bu davrda umuman harakat qilmagan klient — qarzi bor, qatori chiqishi shart
  {
    ism: 'Dilnoza', familiya: 'Yo‘ldosheva', apteka: null, telefon: '+998911111111',
    chiqim: 0, kirim: 0, naqd: 0, plastik: 0, klik: 0,
    qarz: 2000000,
  },
];

// ===========================================================================
console.log('\n— Yugurib boradigan qoldiq —');
// ===========================================================================
{
  const q = H.qoldiqlar(SVERKA.boshlangich, SVERKA.amallar);
  tekshir('qatorlar soni mos', q.length === SVERKA.amallar.length);
  tekshir('1-qator 4 000 000', q[0] === 4000000, String(q[0]));
  tekshir('2-qator 2 000 000', q[1] === 2000000, String(q[1]));
  // Bekor qilingan amal qoldiqni O'ZGARTIRMASLIGI shart
  tekshir('bekor qilingan qatordan keyin qoldiq o‘zgarmagan', q[4] === q[3], `${q[3]} -> ${q[4]}`);
  tekshir('oxirgi qoldiq sverkadagi qoldiqqa teng', q[q.length - 1] === SVERKA.qoldiq, String(q[q.length - 1]));
}

// ===========================================================================
console.log('\n— XLSX: ZIP tuzilishi —');
// ===========================================================================
const xb = H.sverkaXlsx(SVERKA, 'IDAA FARM', 'Shu oy');
let fayllar;
{
  tekshir('PK sarlavhasi bilan boshlanadi', xb[0] === 0x50 && xb[1] === 0x4b);
  fayllar = zipOch(xb);
  for (const kerak of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ]) {
    tekshir('ichida ' + kerak, !!fayllar[kerak]);
  }
  let crcOk = true;
  for (const [nom, f] of Object.entries(fayllar)) {
    if (crc32(f.bayt) !== f.crc) {
      crcOk = false;
      console.log('    crc mos emas: ' + nom);
    }
  }
  tekshir('har bir yozuvning CRC32 si to‘g‘ri', crcOk);
}

// ===========================================================================
console.log('\n— XLSX: sverka mazmuni —');
// ===========================================================================
{
  const sheet = fayllar['xl/worksheets/sheet1.xml'].matn;

  const katak = kataklar(sheet);

  tekshir('A1 — firma nomi', katak.A1 === 'IDAA FARM', String(katak.A1));
  tekshir(
    'A2 — sarlavhada apteka nomi kirillicha turibdi',
    typeof katak.A2 === 'string' && katak.A2.includes('Аптека №5'),
    String(katak.A2),
  );
  tekshir(
    'XML maxsus belgilari qochirilgan (& va ")',
    typeof katak.A2 === 'string' && katak.A2.includes('"Шифо" & Ko'),
    String(katak.A2),
  );

  // Sarlavha qatorini topamiz
  const sarlavhaQator = Object.entries(katak).find(([, v]) => v === 'Qoldiq');
  tekshir('jadval sarlavhasi bor', !!sarlavhaQator);
  const bosh = Number(sarlavhaQator[0].replace(/\D/g, ''));
  tekshir('sarlavhada 8 ta ustun', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].every((u) => katak[u + bosh]));

  // Birinchi amal qatori
  const r1 = bosh + 1;
  tekshir('1-amal: tartib raqami', katak['A' + r1] === 1, String(katak['A' + r1]));
  tekshir('1-amal: turi', katak['C' + r1] === 'Tovar chiqimi', String(katak['C' + r1]));
  tekshir('1-amal: chiqim ustunida SON turibdi', katak['E' + r1] === 3000000, String(katak['E' + r1]));
  tekshir('1-amal: kirim ustuni bo‘sh', katak['F' + r1] === undefined);
  tekshir('1-amal: qoldiq 4 000 000', katak['G' + r1] === 4000000, String(katak['G' + r1]));

  // Kirim qatori — usul ko'rinishi shart
  const r2 = bosh + 2;
  tekshir('2-amal: usul yozilgan', katak['D' + r2] === 'Naqd', String(katak['D' + r2]));
  tekshir('2-amal: kirim ustunida son', katak['F' + r2] === 2000000, String(katak['F' + r2]));

  // Bekor qilingan qator
  const r5 = bosh + 5;
  tekshir(
    'bekor qilingan qator sababi bilan ko‘rinadi',
    String(katak['H' + r5] ?? '').includes('BEKOR QILINGAN') &&
      String(katak['H' + r5]).includes('Xato kiritildi'),
    String(katak['H' + r5]),
  );
  tekshir('bekor qilingan qatorda qoldiq o‘zgarmagan', katak['G' + r5] === katak['G' + (r5 - 1)]);

  // Xulosa qismi — QOLDIQ qatori
  const qoldiqKatak = Object.entries(katak).find(([, v]) => v === 'QOLDIQ (QARZ)');
  tekshir('xulosada QOLDIQ (QARZ) qatori bor', !!qoldiqKatak);
  const qr = Number(qoldiqKatak[0].replace(/\D/g, ''));
  tekshir('xulosadagi qoldiq son sifatida', katak['G' + qr] === 2500000, String(katak['G' + qr]));

  // Sonlar MATN bo'lib qolmasin — bo'lsa Excel'da qo'shib bo'lmasdi
  const matnSon = Object.entries(katak).some(
    ([, v]) => typeof v === 'string' && /^\d[\d ]{6,}$/.test(v),
  );
  tekshir('sonlar matn ko‘rinishida yozilmagan', !matnSon);
}

// ===========================================================================
console.log('\n— XLSX: umumiy hisobot —');
// ===========================================================================
{
  const hb = H.hisobotXlsx(HISOBOT, KLIENTLAR, 'IDAA FARM', 'Shu oy · barcha agentlar');
  const f = zipOch(hb);
  const sheet = f['xl/worksheets/sheet1.xml'].matn;
  const katak = kataklar(sheet);

  tekshir('hisobotda sarlavha bor', sheet.includes('QARZDORLIK HISOBOTI'));
  tekshir('varaq nomi Hisobot', f['xl/workbook.xml'].matn.includes('name="Hisobot"'));

  // Jadval sarlavhasi — yangi ustunlar
  const sarlavhaKatak = Object.entries(katak).find(([, v]) => v === 'Qarzdorlik');
  tekshir('Qarzdorlik ustuni bor', !!sarlavhaKatak);
  const bosh = Number(sarlavhaKatak[0].replace(/\D/g, ''));
  tekshir('Apteka ustuni C da', katak['C' + bosh] === 'Apteka', String(katak['C' + bosh]));
  tekshir('Tovar chiqimi ustuni D da', katak['D' + bosh] === 'Tovar chiqimi', String(katak['D' + bosh]));
  tekshir('Pul kirimi ustuni E da', katak['E' + bosh] === 'Pul kirimi', String(katak['E' + bosh]));
  tekshir('To‘lov turi ustuni F da', katak['F' + bosh] === "To'lov turi", String(katak['F' + bosh]));

  // 1-klient qatori
  const r1 = bosh + 1;
  tekshir('1-klient: ismi', katak['B' + r1] === 'Aziz Rahimov', String(katak['B' + r1]));
  tekshir('1-klient: apteka kirillicha', katak['C' + r1] === 'Аптека №5', String(katak['C' + r1]));
  tekshir('1-klient: chiqim SON', katak['D' + r1] === 5000000, String(katak['D' + r1]));
  tekshir('1-klient: kirim SON', katak['E' + r1] === 3500000, String(katak['E' + r1]));
  tekshir(
    '1-klient: to‘lov turlari summasi bilan',
    katak['F' + r1] === 'Naqd 2 000 000 · Plastik 1 000 000 · Click 500 000',
    String(katak['F' + r1]),
  );
  tekshir('1-klient: qarz SON', katak['G' + r1] === 2500000, String(katak['G' + r1]));

  // 2-klient: faqat naqd ishlatgan — bo'sh usullar yozilmasin
  const r2 = bosh + 2;
  tekshir('2-klient: faqat naqd yozilgan', katak['F' + r2] === 'Naqd 1 000 000', String(katak['F' + r2]));

  // 3-klient: davrda harakat yo'q, lekin qarzi bor
  const r3 = bosh + 3;
  tekshir('3-klient: qatori chiqqan', katak['B' + r3] === 'Dilnoza Yo‘ldosheva', String(katak['B' + r3]));
  tekshir('3-klient: chiqim bo‘sh (nol emas)', katak['D' + r3] === undefined, String(katak['D' + r3]));
  tekshir('3-klient: to‘lov turi bo‘sh', !katak['F' + r3], String(katak['F' + r3]));
  tekshir('3-klient: qarzi ko‘rinadi', katak['G' + r3] === 2000000, String(katak['G' + r3]));

  // JAMI uchta ustunda ham qatorlar yig'indisiga teng bo'lishi shart
  const jami = bosh + 4;
  tekshir('JAMI qatori bor', katak['A' + jami] === 'JAMI', String(katak['A' + jami]));
  tekshir(
    'JAMI chiqim',
    katak['D' + jami] === KLIENTLAR.reduce((s, k) => s + k.chiqim, 0),
    String(katak['D' + jami]),
  );
  tekshir(
    'JAMI kirim',
    katak['E' + jami] === KLIENTLAR.reduce((s, k) => s + k.kirim, 0),
    String(katak['E' + jami]),
  );
  tekshir(
    'JAMI qarz',
    katak['G' + jami] === KLIENTLAR.reduce((s, k) => s + k.qarz, 0),
    String(katak['G' + jami]),
  );
}

// ===========================================================================
console.log('\n— PDF: tuzilishi —');
// ===========================================================================
{
  const pb = H.sverkaPdf(SVERKA, 'IDAA FARM', 'Shu oy');
  const matn = Buffer.from(pb).toString('latin1');

  tekshir('%PDF bilan boshlanadi', matn.startsWith('%PDF-'));
  tekshir('%%EOF bilan tugaydi', matn.trimEnd().endsWith('%%EOF'));

  // startxref haqiqiy xref jadvaliga ko'rsatishi shart
  const sx = /startxref\s+(\d+)/.exec(matn);
  tekshir('startxref bor', !!sx);
  const xrefPos = Number(sx[1]);
  tekshir('startxref aynan "xref" so‘ziga ko‘rsatadi', matn.slice(xrefPos, xrefPos + 4) === 'xref',
    JSON.stringify(matn.slice(xrefPos, xrefPos + 10)));

  // Har bir obyekt siljishi haqiqiy joyga tushishi shart
  const jadval = matn.slice(xrefPos);
  const bosh = /xref\s+0 (\d+)\s+/.exec(jadval);
  tekshir('xref boshi to‘g‘ri', !!bosh);
  const soni = Number(bosh[1]);
  const yozuvlar = jadval.slice(bosh[0].length).match(/(\d{10}) (\d{5}) n/g) ?? [];
  tekshir('xref yozuvlari soni obyektlar soniga mos', yozuvlar.length === soni - 1,
    `${yozuvlar.length} / ${soni - 1}`);

  let hammasiTogri = true;
  yozuvlar.forEach((y, i) => {
    const siljish = Number(y.slice(0, 10));
    const kutilgan = `${i + 1} 0 obj`;
    if (matn.slice(siljish, siljish + kutilgan.length) !== kutilgan) {
      hammasiTogri = false;
      console.log(`    obyekt ${i + 1}: ${siljish} da "${matn.slice(siljish, siljish + 12)}"`);
    }
  });
  tekshir('har bir xref siljishi o‘z obyektiga tushadi', hammasiTogri);

  // /Length haqiqiy oqim uzunligiga teng bo'lishi shart
  let uzunlikOk = true;
  const oqimRe = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g;
  let om;
  let oqimSoni = 0;
  while ((om = oqimRe.exec(matn))) {
    oqimSoni++;
    if (Number(om[1]) !== om[2].length) {
      uzunlikOk = false;
      console.log(`    /Length ${om[1]} != ${om[2].length}`);
    }
  }
  tekshir('oqim topildi', oqimSoni > 0);
  tekshir('/Length haqiqiy oqim uzunligiga teng', uzunlikOk);

  // Sahifalar soni Kids ro'yxatiga mos
  const kids = /\/Kids \[([^\]]*)\]/.exec(matn);
  const count = /\/Count (\d+)/.exec(matn);
  tekshir('Kids va Count mos', kids[1].trim().split(/\s+0 R/).filter(Boolean).length === Number(count[1]));

  tekshir('WinAnsi kodlash ko‘rsatilgan', matn.includes('/WinAnsiEncoding'));
  tekshir('matn oqimida sverka sarlavhasi bor', matn.includes('SVERKA'));
  tekshir(
    'kirill nomi lotinga o‘girilgan',
    matn.includes('Apteka No 5') || matn.includes('Apteka No'),
    'transliteratsiya ishlamadi',
  );
  tekshir('kirill belgisi PDF ichida qolmagan', !/[Ѐ-ӿ]/.test(matn));
}

// ===========================================================================
console.log('\n— PDF: uzun ro‘yxat sahifalanadi —');
// ===========================================================================
{
  const kop = [];
  for (let i = 0; i < 200; i++) {
    kop.push({ tur: i % 2 ? 'kirim' : 'chiqim', summa: 100000 + i, sana: '2026-09-01T10:00:00Z', usul: i % 2 ? 'naqd' : null });
  }
  const pb = H.sverkaPdf({ ...SVERKA, amallar: kop }, 'IDAA FARM', 'Hammasi');
  const matn = Buffer.from(pb).toString('latin1');
  const count = Number(/\/Count (\d+)/.exec(matn)[1]);
  tekshir('200 ta amal bir necha sahifaga bo‘lindi', count >= 4, 'sahifa: ' + count);

  const yozuvlar = matn.slice(Number(/startxref\s+(\d+)/.exec(matn)[1])).match(/(\d{10}) (\d{5}) n/g) ?? [];
  let ok = true;
  yozuvlar.forEach((y, i) => {
    const s = Number(y.slice(0, 10));
    if (matn.slice(s, s + `${i + 1} 0 obj`.length) !== `${i + 1} 0 obj`) ok = false;
  });
  tekshir('ko‘p sahifali hujjatda ham xref to‘g‘ri', ok);
  tekshir('oxirgi sahifa raqami ko‘rsatilgan', matn.includes(`${count} / ${count}`));
}

// ===========================================================================
console.log('\n— Fayl nomi —');
// ===========================================================================
{
  tekshir('taqiqlangan belgilar olib tashlanadi', !/[\\/:*?"<>|]/.test(H.faylNomi('Аптека №5/"Шифо"')));
  tekshir('bo‘sh nom ham ishlaydi', H.faylNomi('') === 'hujjat');
  tekshir('uzun nom qirqiladi', H.faylNomi('a'.repeat(200)).length <= 60);
}

// ===========================================================================
console.log('\n— Sana oralig‘i —');
// ===========================================================================
{
  // Ajratgich har xil bo'lishi mumkin — agent qanday yozsa ham tushunilsin
  for (const yozuv of [
    '01.09.2026 - 30.09.2026',
    '01.09.2026 30.09.2026',
    '1.9.2026 dan 30.9.2026 gacha',
    '01/09/2026 - 30/09/2026',
    '01-09-2026 — 30-09-2026',
  ]) {
    tekshir(
      '«' + yozuv + '» tushuniladi',
      D.oraliqOqi(yozuv) === 'd2026090120260930',
      String(D.oraliqOqi(yozuv)),
    );
  }

  tekshir(
    'teskari yozilsa o‘rni almashadi',
    D.oraliqOqi('30.09.2026 - 01.09.2026') === 'd2026090120260930',
  );
  tekshir('bitta sana yetarli emas', D.oraliqOqi('01.09.2026') === null);
  tekshir('sanasiz matn rad etiladi', D.oraliqOqi('kecha va bugun') === null);
  // 31.02 ni Date jimgina 1-martga surib yuborardi
  tekshir('mavjud bo‘lmagan sana rad etiladi', D.oraliqOqi('31.02.2026 - 30.09.2026') === null);
  tekshir('13-oy rad etiladi', D.oraliqOqi('01.13.2026 - 30.09.2026') === null);

  const d = D.davrOraliq('d2026090120260930');
  tekshir('oraliq boshi', d.dan === '2026-09-01T00:00:00', String(d.dan));
  // Oxirgi kun ICHIGA kirishi shart
  tekshir('oraliq oxiri 30-kunni ichiga oladi', d.gacha === '2026-09-30T23:59:59', String(d.gacha));
  tekshir('oraliq nomi o‘qiladi', d.nom === '01.09.2026 — 30.09.2026', d.nom);

  // Boshqa kalitlar buzilmaganini ham tekshiramiz
  const bugun = D.davrOraliq('bugun', new Date(2026, 8, 11));
  tekshir('bugun boshi', bugun.dan === '2026-09-11T00:00:00', String(bugun.dan));
  tekshir('bugun oxiri', bugun.gacha === '2026-09-11T23:59:59', String(bugun.gacha));
  const oy = D.davrOraliq('oy', new Date(2026, 8, 11));
  tekshir('shu oy 1-kundan', oy.dan === '2026-09-01T00:00:00', String(oy.dan));
  tekshir('shu oy nomi o‘zbekcha', oy.nom === 'sentabr 2026', oy.nom);
  const hammasi = D.davrOraliq('hammasi');
  tekshir('hammasi chegarasiz', hammasi.dan === null && hammasi.gacha === null);

  // Telegram callback_data 64 BAYT beradi. Eng uzuni — sverka fayli
  // tugmasi: sf:<uuid>:<oraliq>:xlsx. Sig'masa tugma jim ishlamasdi.
  const eng = `sf:${'0'.repeat(36)}:d2026090120260930:xlsx`;
  tekshir(
    'eng uzun callback 64 baytga sig‘adi',
    new TextEncoder().encode(eng).length <= 64,
    eng.length + ' bayt',
  );
}

// ===========================================================================
console.log('\n— Bitta sana (o‘tgan kunga yozish) —');
// ===========================================================================
{
  const H_ = new Date(2026, 8, 11); // 11.09.2026

  for (const yozuv of ['09.09.2026', '9.9.2026', '09/09/2026', '9-9-26']) {
    tekshir(
      '«' + yozuv + '» tushuniladi',
      D.sanaOqi(yozuv, H_) === '2026-09-09',
      String(D.sanaOqi(yozuv, H_)),
    );
  }

  tekshir('bugun ham qabul qilinadi', D.sanaOqi('11.09.2026', H_) === '2026-09-11');
  // Kelajak sanani baza ham rad etadi, lekin agent buni YOZGAN ZAHOTI bilsin
  tekshir('ertangi kun rad etiladi', D.sanaOqi('12.09.2026', H_) === null);
  tekshir('mavjud bo‘lmagan sana rad etiladi', D.sanaOqi('31.02.2026', H_) === null);
  tekshir('sanasiz matn rad etiladi', D.sanaOqi('kecha', H_) === null);

  // Kun yorlig'i
  tekshir('bugun → «Bugun»', D.kunYorligi('2026-09-11', H_) === 'Bugun');
  tekshir('kecha → «Kecha»', D.kunYorligi('2026-09-10', H_) === 'Kecha');
  tekshir('oldingi kun sana bo‘lib chiqadi', D.kunYorligi('2026-09-09', H_) === '09.09.2026',
    D.kunYorligi('2026-09-09', H_));

  // Oy boshida "kecha" oldingi oyga tushadi — sodda ayirish buni
  // noto'g'ri hisoblardi
  const oyBoshi = new Date(2026, 8, 1);
  tekshir('oy boshida kecha oldingi oyga tushadi',
    D.kunYorligi('2026-08-31', oyBoshi) === 'Kecha', D.kunYorligi('2026-08-31', oyBoshi));

  tekshir('kun kaliti mahalliy kun bo‘yicha',
    D.kunKaliti(new Date(2026, 8, 11, 23, 59)) === '2026-09-11',
    D.kunKaliti(new Date(2026, 8, 11, 23, 59)));
}

console.log(`\n${jami - xato} / ${jami} tekshiruv o'tdi`);
if (xato) {
  console.log(`${xato} ta XATO`);
  process.exit(1);
}
