import * as XLSX from 'xlsx';

// ============================================================================
// FAKTURA ROBOTI — har xil ko'rinishdagi Excel fakturani o'qiydi.
//
// Uch qoida ustiga qurilgan:
//
//  1. SHABLON QOTIB QOLGAN EMAS. Robot sarlavha qatorini o'zi qidiradi va
//     ustun nomlarini standart maydonlarga moslaydi (uz/ru/en nomlar).
//
//  2. HECH NARSA YO'QOLMAYDI. Tanilmagan ustun tashlab yuborilmaydi —
//     u `qoshimcha` ichiga tushadi. "1:1" degani shu: fayldagi har bir
//     katak natijada ham bor.
//
//  3. ROBOT O'ZINI TEKSHIRADI. miqdor × narx = summa, qatorlar yig'indisi
//     fayldagi "Jami" bilan bir xilmi — mos kelmasa qator belgilanadi.
//     Ya'ni xato jimgina o'tib ketmaydi.
// ============================================================================

export type Rejim = 'faktura' | 'narxlar';

export type Maydon =
  | 'name'
  | 'manufacturer'
  | 'series'
  | 'expiry'
  | 'qty'
  | 'unit'
  | 'price'
  | 'sum'
  | 'nds_rate'
  | 'nds_sum'
  | 'barcode'
  | 'stock'
  | 'group';

export const MAYDON_NOMI: Record<Maydon, string> = {
  name: 'Nomi',
  manufacturer: 'Ishlab chiqaruvchi',
  series: 'Seriya',
  expiry: 'Yaroqlilik muddati',
  qty: 'Miqdor',
  unit: 'Birlik',
  price: 'Narx',
  sum: 'Summa',
  nds_rate: 'NDS %',
  nds_sum: 'NDS summa',
  barcode: 'Shtrix-kod',
  stock: 'Qoldiq',
  group: 'Guruh',
};

// Ustun nomini tanish uchun kalit so'zlar. Uzbek (lotin/kirill), rus va
// ingliz variantlari — postavshchiklar har xil yozadi.
const KALITLAR: Record<Maydon, string[]> = {
  name: ['nomi', 'nomlanishi', 'tovar', 'mahsulot', 'dori', 'preparat', 'наименование', 'название', 'товар', 'препарат', 'name', 'product', 'description'],
  manufacturer: ['ishlab chiqaruvchi', 'zavod', 'firma', 'производитель', 'изготовитель', 'завод', 'manufacturer', 'maker', 'brand'],
  series: ['seriya', 'seriyasi', 'partiya', 'серия', 'партия', 'series', 'batch', 'lot'],
  expiry: ['muddat', 'yaroqlilik', 'amal qilish', 'срок', 'годен', 'годности', 'expiry', 'exp', 'shelf'],
  qty: ['miqdor', 'soni', 'son', 'dona', 'kol-vo', 'количество', 'кол-во', 'кол', 'qty', 'quantity', 'amount'],
  unit: ['birlik', "o'lchov", 'olchov', 'ед.изм', 'единица', 'изм', 'unit', 'uom'],
  price: ['narx', 'narxi', 'baho', 'цена', 'price', 'unit price', 'стоимость за'],
  sum: ['summa', 'jami', 'qiymat', 'сумма', 'стоимость', 'итого', 'total', 'amount'],
  nds_rate: ['nds %', 'ndc %', 'qqs %', 'ндс %', 'ставка ндс', 'vat %', 'nds stavka'],
  nds_sum: ['nds summa', 'qqs summa', 'сумма ндс', 'ндс сумма', 'vat amount', 'nds'],
  // Katalog uchun kerak: dorini AYNAN tanish (shtrix-kod nomdan ishonchli —
  // nom "таб.№30" / "таб. №30" bo'lib o'zgarib turadi), bor-yo'qligi va bo'limi
  barcode: ['shtrix', 'штрих', 'штрихкод', 'barcode', 'ean', 'sku', 'artikul', 'артикул'],
  stock: ['qoldiq', 'ombor', 'mavjud', 'остаток', 'остатки', 'наличие', 'склад', 'stock'],
  group: ['guruh', 'kategoriya', "bo'lim", 'группа', 'категория', 'раздел', 'group', 'category'],
};

export type Ustun = { indeks: number; sarlavha: string };
export type Moslash = Partial<Record<Maydon, number>>;   // maydon -> ustun indeksi

export type Qator = {
  line_no: number;
  name?: string;
  manufacturer?: string;
  series?: string;
  expiry?: string;
  qty?: number;
  unit?: string;
  price?: number;
  sum?: number;
  nds_rate?: number;
  nds_sum?: number;
  barcode?: string;
  stock?: number;
  group?: string;
  qoshimcha: Record<string, unknown>;
  ogohlar: string[];
};

export type Natija = {
  fileName: string;
  sheetName: string;
  sarlavhaQatori: number;
  ustunlar: Ustun[];
  moslash: Moslash;
  imzo: string;
  qatorlar: Qator[];
  jamiHisoblangan: number;
  jamiFayldan: number | null;
  rejim: Rejim;
  faktura: { invoice_no?: string; invoice_date?: string; supplier?: string };
};

// ---------------------------------------------------------------- yordamchi

function matn(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function past(v: unknown): string {
  return matn(v).toLowerCase();
}

// Son: "1 234,56", "1'234.56", "12 345 so'm" — hammasidan raqam chiqaradi
export function songa(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = matn(v);
  if (!s) return undefined;

  let t = s.replace(/[^\d.,\-]/g, '');
  if (!t || t === '-') return undefined;

  const oxirgiVergul = t.lastIndexOf(',');
  const oxirgiNuqta = t.lastIndexOf('.');

  if (oxirgiVergul > -1 && oxirgiNuqta > -1) {
    // Ikkalasi bor: oxirgisi o'nlik ajratgichi
    if (oxirgiVergul > oxirgiNuqta) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (oxirgiVergul > -1) {
    // Faqat vergul: "1,5" -> o'nlik; "1,234" (3 raqam) -> minglik
    const keyin = t.length - oxirgiVergul - 1;
    t = keyin === 3 ? t.replace(/,/g, '') : t.replace(',', '.');
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

// Sana: Excel seriya raqami ham, "12.05.2027" ham, "2027-05-12" ham
export function sanaga(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;

  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }

  const s = matn(v);
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/);
  if (m) {
    const yil = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${yil}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // "05.2027" — faqat oy va yil (dorilarda tez-tez uchraydi): oy oxiri
  m = s.match(/^(\d{1,2})[-./](\d{4})$/);
  if (m) {
    const oxirgiKun = new Date(Number(m[2]), Number(m[1]), 0).getDate();
    return `${m[2]}-${m[1].padStart(2, '0')}-${oxirgiKun}`;
  }
  return undefined;
}

// ---------------------------------------------------------------- tanish

function ustunniTani(sarlavha: string): Maydon | null {
  const r = nomNomzodlari(sarlavha);
  return r.length ? r[0].maydon : null;
}

// Bitta sarlavha bir necha maydonga o'xshashi mumkin ("Сумма НДС" — ham
// summa, ham nds). Hammasini ball bilan qaytaramiz, tanlashni keyingi
// bosqich (ma'lumotni ko'rib) hal qiladi.
function nomNomzodlari(sarlavha: string): { maydon: Maydon; ball: number }[] {
  const s = past(sarlavha);
  if (!s) return [];

  const natija = new Map<Maydon, number>();
  for (const [maydon, kalitlar] of Object.entries(KALITLAR) as [Maydon, string[]][]) {
    for (const k of kalitlar) {
      if (!s.includes(k)) continue;
      // Uzunroq kalit — ishonchliroq moslik; aynan teng bo'lsa yana kuchliroq
      const ball = k.length + (s === k ? 10 : 0);
      natija.set(maydon, Math.max(natija.get(maydon) ?? 0, ball));
    }
  }
  return [...natija].map(([maydon, ball]) => ({ maydon, ball })).sort((a, b) => b.ball - a.ball);
}

type Tur = 'son' | 'sana' | 'matn';

const MAYDON_TURI: Record<Maydon, Tur> = {
  name: 'matn',
  manufacturer: 'matn',
  series: 'matn',
  unit: 'matn',
  expiry: 'sana',
  qty: 'son',
  price: 'son',
  sum: 'son',
  nds_rate: 'son',
  nds_sum: 'son',
  barcode: 'matn',
  stock: 'son',
  group: 'matn',
};

// Ustunda HAQIQATAN kerakli turdagi ma'lumot bormi? 0..1 oralig'ida.
// Bu tekshiruvsiz "Цена со скидкой" kabi bo'sh ustun narx deb tanlanib,
// butun faktura narxsiz qolib ketardi.
function ustunBali(satrlar: unknown[][], boshlanish: number, indeks: number, tur: Tur): number {
  let jami = 0;
  let mos = 0;
  for (let i = boshlanish; i < satrlar.length && jami < 60; i++) {
    const katak = (satrlar[i] ?? [])[indeks];
    if (katak === null || katak === undefined || matn(katak) === '') continue;
    jami++;
    if (tur === 'son') {
      const n = songa(katak);
      if (n !== undefined && Number.isFinite(n)) mos++;
    } else if (tur === 'sana') {
      if (sanaga(katak)) mos++;
    } else {
      // Matn ustuni: sof son bo'lsa bu matn ustuni emas (masalan "№")
      mos += songa(katak) !== undefined && matn(katak).length < 8 ? 0 : 1;
    }
  }
  if (jami === 0) return 0;
  // To'ldirilganlik ham muhim: 3 ta qatorda qiymat bor ustun yaxshi emas
  const toldirilgan = Math.min(1, jami / 20);
  return (mos / jami) * (0.4 + 0.6 * toldirilgan);
}

// Ustunlarni maydonlarga taqsimlash: nom mosligi + ma'lumot mosligi.
// Ochko'zlik bilan eng yaxshi juftlikdan boshlab biriktiramiz, shunda
// bitta ustun ikki maydonga tushib qolmaydi.
function moslashniTop(
  satrlar: unknown[][],
  sarlavhaQatori: number,
  ustunlar: Ustun[]
): Moslash {
  type Juft = { maydon: Maydon; indeks: number; ball: number };
  const juftlar: Juft[] = [];

  for (const u of ustunlar) {
    for (const { maydon, ball } of nomNomzodlari(u.sarlavha)) {
      const dBall = ustunBali(satrlar, sarlavhaQatori + 1, u.indeks, MAYDON_TURI[maydon]);
      // Ma'lumot mutlaqo mos kelmasa — bu ustun emas
      if (dBall < 0.15) continue;
      juftlar.push({ maydon, indeks: u.indeks, ball: ball / 10 + dBall * 2 });
    }
  }

  juftlar.sort((a, b) => b.ball - a.ball);

  const moslash: Moslash = {};
  const bandUstun = new Set<number>();
  for (const j of juftlar) {
    if (moslash[j.maydon] !== undefined || bandUstun.has(j.indeks)) continue;
    moslash[j.maydon] = j.indeks;
    bandUstun.add(j.indeks);
  }
  return moslash;
}

// Sarlavha qatori qayerda? Eng ko'p tanilgan ustun bergan qator.
function sarlavhaniTop(satrlar: unknown[][]): number {
  let eng = { qator: -1, ball: 0 };
  const chegara = Math.min(satrlar.length, 30);

  for (let i = 0; i < chegara; i++) {
    const s = satrlar[i] ?? [];
    let ball = 0;
    const korilgan = new Set<Maydon>();
    for (const katak of s) {
      const m = ustunniTani(matn(katak));
      if (m && !korilgan.has(m)) {
        korilgan.add(m);
        ball++;
      }
    }
    // Kamida ikkita maydon tanilsa — bu sarlavhaga o'xshaydi
    if (ball > eng.ball) eng = { qator: i, ball };
  }
  return eng.ball >= 2 ? eng.qator : -1;
}

// Fayl ko'rinishining imzosi — shablonni eslab qolish uchun kalit
function imzoYasa(ustunlar: Ustun[]): string {
  const nom = ustunlar
    .map((u) => past(u.sarlavha))
    .filter(Boolean)
    .sort()
    .join('|');
  let h = 0;
  for (let i = 0; i < nom.length; i++) {
    h = (h * 31 + nom.charCodeAt(i)) | 0;
  }
  return 'v1_' + (h >>> 0).toString(36) + '_' + ustunlar.length;
}

// Sarlavhadan yuqoridagi kataklardan faktura raqami/sanasi/postavshchik
function bosh(satrlar: unknown[][], sarlavhaQatori: number) {
  const natija: { invoice_no?: string; invoice_date?: string; supplier?: string } = {};
  const chegara = Math.max(0, sarlavhaQatori);

  for (let i = 0; i < chegara; i++) {
    for (const katak of satrlar[i] ?? []) {
      const s = matn(katak);
      if (!s) continue;
      const p = s.toLowerCase();

      if (!natija.invoice_no) {
        // Bir nechta nomzod bo'lishi mumkin ("Счет-фактура № AB-4471"):
        // hammasini ko'rib chiqamiz va RAQAMI BOR birinchisini olamiz.
        // Bitta regex bilan cheklansak, "-фактура" nomzodda to'xtab qolardi.
        const nomzodlar = [
          ...s.matchAll(/(?:№|#|no\.?|schet|faktura|счет|счёт)\s*[:№#]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9\-\/]{1,19})/gi),
        ].map((m) => m[1]);
        const topildi = nomzodlar.find((n) => /\d/.test(n) && !/^\d{1,2}[.\/]\d{1,2}$/.test(n));
        if (topildi) natija.invoice_no = topildi;
      }
      if (!natija.invoice_date) {
        const m = s.match(/(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})|(\d{4}-\d{2}-\d{2})/);
        if (m) natija.invoice_date = sanaga(m[0]);
      }
      if (!natija.supplier && (p.includes('postavshchik') || p.includes('поставщик') || p.includes('yetkazib'))) {
        const qism = s.split(/[:—-]/).slice(1).join(':').trim();
        if (qism) natija.supplier = qism;
      }
    }
  }
  return natija;
}

// ---------------------------------------------------------------- asosiy

export function faylniOqi(bayt: ArrayBuffer, fileName: string, sheetIndex = 0): Natija {
  const wb = XLSX.read(bayt, { cellDates: true });
  const sheetName = wb.SheetNames[sheetIndex] ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Birlashtirilgan kataklar odatda sarlavhada bo'ladi — defval bilan
  // bo'sh kataklar ham o'z o'rnida qoladi, ustun indekslari siljimaydi
  const satrlar = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });

  const sarlavhaQatori = sarlavhaniTop(satrlar);
  if (sarlavhaQatori < 0) {
    return {
      fileName,
      sheetName,
      sarlavhaQatori: -1,
      ustunlar: [],
      moslash: {},
      imzo: '',
      qatorlar: [],
      jamiHisoblangan: 0,
      jamiFayldan: null,
      rejim: 'faktura',
      faktura: {},
    };
  }

  const sarlavha = satrlar[sarlavhaQatori] ?? [];
  const ustunlar: Ustun[] = sarlavha
    .map((s, i) => ({ indeks: i, sarlavha: matn(s) }))
    .filter((u) => u.sarlavha !== '');

  const moslash = moslashniTop(satrlar, sarlavhaQatori, ustunlar);

  const { qatorlar, jamiHisoblangan, jamiFayldan, rejim } = qatorlarniYig(
    satrlar,
    sarlavhaQatori,
    ustunlar,
    moslash
  );

  return {
    fileName,
    sheetName,
    sarlavhaQatori,
    ustunlar,
    moslash,
    imzo: imzoYasa(ustunlar),
    qatorlar,
    jamiHisoblangan,
    jamiFayldan,
    rejim,
    faktura: bosh(satrlar, sarlavhaQatori),
  };
}

// Moslashtirish o'zgarganda qatorlarni qayta yig'ish (foydalanuvchi
// ustunni qo'lda tanlaganda shu chaqiriladi)
export function qatorlarniYig(
  satrlar: unknown[][],
  sarlavhaQatori: number,
  ustunlar: Ustun[],
  moslash: Moslash
): { qatorlar: Qator[]; jamiHisoblangan: number; jamiFayldan: number | null; rejim: Rejim } {
  const qatorlar: Qator[] = [];
  let jamiHisoblangan = 0;
  let jamiFayldan: number | null = null;

  // Har bir fayl faktura emas. Miqdor ham, summa ham yo'q bo'lsa — bu
  // narxlar ro'yxati (assortiment). Unda "miqdor yo'q" deb har bir qatorni
  // ogohlantirish ma'nosiz: 10 ming qator qizarib ketadi va haqiqiy
  // muammolar ko'rinmay qoladi.
  const rejim: Rejim =
    moslash.qty === undefined && moslash.sum === undefined ? 'narxlar' : 'faktura';

  const moslanganIndekslar = new Set(Object.values(moslash));

  for (let i = sarlavhaQatori + 1; i < satrlar.length; i++) {
    const s = satrlar[i] ?? [];
    if (s.every((k) => k === null || matn(k) === '')) continue;

    const olish = (m: Maydon) => (moslash[m] === undefined ? undefined : s[moslash[m]!]);

    const nomi = matn(olish('name'));
    const qty = songa(olish('qty'));
    const price = songa(olish('price'));
    const sum = songa(olish('sum'));

    // "Jami" qatori: nomi bor-u miqdor/narx yo'q, summa bor
    const jamiQatorimi =
      /^(jami|итого|всего|jami:|total)/i.test(nomi) || (!nomi && qty === undefined && sum !== undefined);
    if (jamiQatorimi) {
      if (sum !== undefined) jamiFayldan = sum;
      continue;
    }

    // Mahsulot qatori bo'lishi uchun kamida nomi yoki miqdori bo'lsin
    if (!nomi && qty === undefined) continue;

    const ogohlar: string[] = [];
    if (!nomi) ogohlar.push('nomi yo‘q');
    if (rejim === 'faktura') {
      if (qty === undefined) ogohlar.push('miqdor yo‘q');
      if (price === undefined && sum === undefined) ogohlar.push('narx ham, summa ham yo‘q');
    } else if (price === undefined) {
      ogohlar.push('narx yo‘q');
    }

    let hisoblangan = sum;
    if (qty !== undefined && price !== undefined) {
      const kutilgan = qty * price;
      if (sum === undefined) {
        hisoblangan = kutilgan;
        ogohlar.push('summa fayldan emas, hisoblab qo‘yildi');
      } else if (Math.abs(kutilgan - sum) > Math.max(1, Math.abs(sum) * 0.01)) {
        ogohlar.push(`miqdor × narx = ${kutilgan.toFixed(2)}, faylda ${sum}`);
      }
    }
    if (hisoblangan !== undefined) jamiHisoblangan += hisoblangan;

    // Moslanmagan ustunlar — hech narsa yo'qolmasin
    const qoshimcha: Record<string, unknown> = {};
    for (const u of ustunlar) {
      if (moslanganIndekslar.has(u.indeks)) continue;
      const qiymat = s[u.indeks];
      if (qiymat !== null && matn(qiymat) !== '') qoshimcha[u.sarlavha] = qiymat;
    }

    const muddat = sanaga(olish('expiry'));
    if (moslash.expiry !== undefined && !muddat && matn(olish('expiry'))) {
      ogohlar.push('muddat o‘qilmadi: ' + matn(olish('expiry')));
    }

    qatorlar.push({
      line_no: qatorlar.length + 1,
      name: nomi || undefined,
      manufacturer: matn(olish('manufacturer')) || undefined,
      series: matn(olish('series')) || undefined,
      expiry: muddat,
      qty,
      unit: matn(olish('unit')) || undefined,
      price,
      sum: hisoblangan,
      nds_rate: songa(olish('nds_rate')),
      nds_sum: songa(olish('nds_sum')),
      barcode: matn(olish('barcode')) || undefined,
      stock: songa(olish('stock')),
      group: matn(olish('group')) || undefined,
      qoshimcha,
      ogohlar,
    });
  }

  return { qatorlar, jamiHisoblangan, jamiFayldan, rejim };
}

// Fayl satrlarini qayta o'qish uchun (moslashtirish o'zgarganda kerak)
export function satrlarniOl(bayt: ArrayBuffer, sheetIndex = 0): { satrlar: unknown[][]; sheetName: string } {
  const wb = XLSX.read(bayt, { cellDates: true });
  const sheetName = wb.SheetNames[sheetIndex] ?? wb.SheetNames[0];
  const satrlar = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });
  return { satrlar, sheetName };
}

export function varaqlar(bayt: ArrayBuffer): string[] {
  return XLSX.read(bayt, { bookSheets: true }).SheetNames;
}

// Natijani Excel qilib qaytarish (1:1 tekshirish va qo'lda ishlash uchun)
export function excelgaYoz(natija: Natija): Blob {
  const qatorlar = natija.qatorlar.map((q) => ({
    '№': q.line_no,
    Nomi: q.name ?? '',
    'Ishlab chiqaruvchi': q.manufacturer ?? '',
    Seriya: q.series ?? '',
    Muddat: q.expiry ?? '',
    Miqdor: q.qty ?? '',
    Birlik: q.unit ?? '',
    Narx: q.price ?? '',
    Summa: q.sum ?? '',
    'NDS %': q.nds_rate ?? '',
    'NDS summa': q.nds_sum ?? '',
    ...q.qoshimcha,
    Ogohlantirish: q.ogohlar.join('; '),
  }));

  const ws = XLSX.utils.json_to_sheet(qatorlar);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Qatorlar');
  const bayt = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([bayt], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
