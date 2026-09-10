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
  | 'group'
  | 'made_at'
  // Praysning pastki bloklari uchun (aksiya / qo'shimchalar)
  | 'aksiya'
  | 'aksiya_narx'
  | 'narx_real'
  | 'org_upk';

// Prays fayli bitta ro'yxat emas: pastida "ҚЎШИМЧАЛАР" va "Внимание!
// Акции!!!" kabi ALOHIDA jadvallar turadi, ularning ustunlari ham
// boshqacha.
export type Bolim = 'asosiy' | 'qoshimcha' | 'aksiya';

export const BOLIM_NOMI: Record<Bolim, string> = {
  asosiy: 'Asosiy ro‘yxat',
  qoshimcha: 'Qo‘shimchalar',
  aksiya: 'Aksiya',
};

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
  made_at: 'Ishlab chiqarilgan sana',
  aksiya: 'Aksiya sharti',
  aksiya_narx: 'Aksiya narxi',
  narx_real: 'Real narx',
  org_upk: 'Org. upakovka',
};

// Bu ustunlar HECH QAYSI maydonga tushmasligi kerak.
//
// "Ваш заказ" — mijoz to'ldiradigan bo'sh ustun. Robot uni "miqdor" deb
// olsa, butun prays bo'ylab miqdor nol bo'lib ketadi. Jonli faylda
// aynan shunday bo'lgan: saqlangan moslashtirishda qty 2-ustunga,
// ya'ni "Ваш заказ" ga ishora qilardi.
//
// "Сумма заказ" — mijoz yozgan miqdordan hisoblanadigan formula, ya'ni
// ta'minotchining faktura summasi emas.
const ETIBORSIZ_USTUNLAR = [
  'ваш заказ', 'сумма заказ', 'сумма заказа', 'заказ',
  'sizning buyurtma', 'buyurtma summa',
];

// Ustun nomini tanish uchun kalit so'zlar. Uzbek (lotin/kirill), rus va
// ingliz variantlari — postavshchiklar har xil yozadi.
const KALITLAR: Record<Maydon, string[]> = {
  name: ['nomi', 'nomlanishi', 'tovar', 'mahsulot', 'dori', 'preparat', 'наименование', 'название', 'товар', 'препарат', 'name', 'product', 'description',
         'номи', 'номланиши', 'дори', 'маҳсулот', 'махсулот', 'товари'],
  manufacturer: ['ishlab chiqaruvchi', 'zavod', 'firma', 'производитель', 'изготовитель', 'завод', 'manufacturer', 'maker', 'brand',
                 'ишлаб чиқарувчи', 'ишлаб чикарувчи', 'заводи', 'фирма'],
  series: ['seriya', 'seriyasi', 'partiya', 'серия', 'партия', 'series', 'batch', 'lot',
           'серияси', 'партияси'],
  expiry: ['muddat', 'yaroqlilik', 'amal qilish', 'срок', 'годен', 'годности', 'expiry', 'exp', 'shelf',
           'муддат', 'муддати', 'яроқлилик', 'яроклилик', 'тугаш'],
  qty: ['miqdor', 'soni', 'son', 'dona', 'kol-vo', 'количество', 'кол-во', 'кол', 'qty', 'quantity', 'amount',
        'миқдор', 'микдор', 'сони', 'дона'],
  unit: ['birlik', "o'lchov", 'olchov', 'ед.изм', 'единица', 'изм', 'unit', 'uom',
         'бирлик', 'ўлчов', 'улчов'],
  // "сотув нархи", "сотув цена со скидкой/наценкой" — jonli fayllardagi
  // haqiqiy sarlavhalar. Ular tanilmasa narx ustuni topilmay qolardi.
  // "цена без акции" va "цена спец" ATAYLAB uzun kalit sifatida yozilgan:
  // ular yonidagi "цена после акции" / "цена реал" ustunlari ham "цена"
  // ni o'z ichiga oladi va qaysi biri narx bo'lishi tasodifga qolardi.
  // Uzunroq kalit ko'proq ball beradi — tanlov aniq bo'ladi.
  price: ['narx', 'narxi', 'baho', 'цена', 'price', 'unit price', 'стоимость за',
          'нарх', 'нархи', 'нарҳ', 'сотув нарх', 'сотув нархи', 'сотиш нарх',
          'сотув цена', 'цена со скидкой', 'наценкой', 'баҳо', 'бахо',
          'цена без акции', 'без акции', 'акциясиз', 'цена спец', 'спец'],
  sum: ['summa', 'jami', 'qiymat', 'сумма', 'стоимость', 'итого', 'total', 'amount',
        'сумма', 'жами', 'қиймат', 'киймат'],
  nds_rate: ['nds %', 'ndc %', 'qqs %', 'ндс %', 'ставка ндс', 'vat %', 'nds stavka'],
  nds_sum: ['nds summa', 'qqs summa', 'сумма ндс', 'ндс сумма', 'vat amount', 'nds'],
  // Katalog uchun kerak: dorini AYNAN tanish (shtrix-kod nomdan ishonchli —
  // nom "таб.№30" / "таб. №30" bo'lib o'zgarib turadi), bor-yo'qligi va bo'limi
  // "Код" — haqiqiy fayllarda shtrix-kod o'rniga postavshchikning o'z
  // kodi ishlatiladi (masalan "A66458") va u ham xuddi shunday doimiy kalit
  barcode: ['shtrix', 'штрих', 'штрихкод', 'barcode', 'ean', 'sku', 'artikul', 'артикул', 'kod', 'код'],
  stock: ['qoldiq', 'ombor', 'mavjud', 'остаток', 'остатки', 'наличие', 'склад', 'stock',
          'қолдиқ', 'колдик', 'омбор', 'мавжуд'],
  group: ['guruh', 'kategoriya', "bo'lim", 'группа', 'категория', 'раздел', 'group', 'category',
          'гуруҳ', 'гурух', 'категорияси', 'бўлим', 'булим'],
  // Ishlab chiqarilgan sana. DIQQAT: "производств" ni tanlaymiz, "производ"
  // emas — aks holda "Производитель" (ishlab chiqaruvchi) ham shunga tushib
  // ketardi va ikkala ustun chalkashardi.
  made_at: [
    'ishlab chiqarilgan', 'ishlab chiq', 'i/ch sana',
    'производств', 'изготовлен', 'дата изг', 'дата вып',
    'made', 'mfg', 'manufactured', 'prod date',
  ],

  // ---- Pastki bloklar (aksiya / qo'shimchalar) ----
  //
  // "Акция" ustunida "5+1", "10+1" turadi — bu SON EMAS, shart.
  // Uni narx deb o'qish jonli bazada falokat bo'lgan: songa("5+1")
  // 51 qaytaradi va 63 800 so'mlik dori skladda 51 so'm bo'lib
  // qolgan (56 ta pozitsiya).
  aksiya: ['акция', 'акцияси', 'aksiya', 'aksiyasi', 'aksiya sharti'],
  aksiya_narx: ['цена после акции', 'после акции', 'цена после',
                'акциядан кейин', 'акция нархи', 'aksiya narxi'],
  narx_real: ['цена реал', 'реал нарх', 'реал', 'real narx', 'цена реальная'],
  org_upk: ['орг. упк', 'орг.упк', 'орг упк', 'упаковка', 'упак', 'org upk', 'org. upk'],
};

export type Ustun = { indeks: number; sarlavha: string };
export type Moslash = Partial<Record<Maydon, number>>;   // maydon -> ustun indeksi

export type Qator = {
  line_no: number;
  bolim: Bolim;
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
  made_at?: string;
  aksiya?: string;
  aksiya_narx?: number;
  narx_real?: number;
  org_upk?: number;
  qoshimcha: Record<string, unknown>;
  ogohlar: string[];
};

// Faylning bitta jadvali: o'z sarlavhasi, o'z ustunlari, o'z
// moslashtirishi bilan. Avval butun varaqqa BITTA moslashtirish
// qo'llanardi — pastdagi bloklar boshqa ustun tartibida bo'lgani
// uchun narx boshqa ustundan o'qilardi.
export type Blok = {
  bolim: Bolim;
  nom: string;            // faylda yozilgani ("Внимание! Акции!!!")
  sarlavhaQatori: number;
  oxirgiQator: number;    // shu blokning oxirgi qatori (shu qator ham kiradi)
  ustunlar: Ustun[];
  moslash: Moslash;
  qatorSoni: number;
};

export type Natija = {
  fileName: string;
  sheetName: string;
  sarlavhaQatori: number;
  ustunlar: Ustun[];
  moslash: Moslash;
  imzo: string;
  qatorlar: Qator[];
  bloklar: Blok[];
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
// Sinov uchun ochiq: ustun tanish qoidasi eng ko'p xato beradigan joy,
// uni haqiqiy sarlavhalar bilan tekshirib turish kerak.
export function nomNomzodlari(sarlavha: string): { maydon: Maydon; ball: number }[] {
  const s = past(sarlavha);
  if (!s) return [];
  // Mijoz to'ldiradigan ustunlar hech qaysi maydonga tushmaydi
  if (ETIBORSIZ_USTUNLAR.some((e) => s === e || s.startsWith(e))) return [];

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
  made_at: 'sana',
  aksiya: 'matn',
  aksiya_narx: 'son',
  narx_real: 'son',
  org_upk: 'son',
};

// Ustunda HAQIQATAN kerakli turdagi ma'lumot bormi? 0..1 oralig'ida.
// Bu tekshiruvsiz "Цена со скидкой" kabi bo'sh ustun narx deb tanlanib,
// butun faktura narxsiz qolib ketardi.
function ustunBali(
  satrlar: unknown[][],
  boshlanish: number,
  indeks: number,
  tur: Tur,
  raqamRad = false
): number {
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
    } else if (raqamRad) {
      // Faqat NOM uchun: butunlay raqamli ustun dori nomi bo'la olmaydi
      // ("№" ustuni). Boshqa matn ustunlariga bu cheklov QO'YILMAYDI —
      // seriya ("A-2211") va shtrix-kod ("4780001") raqamga o'xshaydi va
      // avval shu sababli tanilmay qolardi.
      mos += /^[\d\s.,'’\-]+$/.test(matn(katak)) ? 0 : 1;
    } else {
      mos++;
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
      const dBall = ustunBali(satrlar, sarlavhaQatori + 1, u.indeks, MAYDON_TURI[maydon], maydon === 'name');
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

// ------------------------------------------------------------ bloklar
//
// Prays fayli bitta jadval emas. Jonli faylda uchta bor:
//   1) asosiy ro'yxat (~3 600 qator)
//   2) "ҚЎШИМЧАЛАР"        — № | Nomi | Цена СПЕЦ | Цена Реал | Орг.упк | ...
//   3) "Внимание! Акции!!!" — № | Nomi | Акция | Цена без акции | Цена после | ...
//
// Ular BOSHQA ustun tartibida. Avval butun varaqqa bitta moslashtirish
// qo'llanardi: aksiya blokida 3-ustun narx emas, "Акция" ("5+1") edi va
// songa("5+1") = 51 bo'lib, 63 800 so'mlik dori skladda 51 so'm bo'lib
// qolgan. Shuning uchun har blok o'z moslashtirishi bilan o'qiladi.

/** Shu qator sarlavhaga o'xshaydimi? Nechta maydon tanilgani. */
function sarlavhaBali(s: unknown[]): number {
  let ball = 0;
  const korilgan = new Set<Maydon>();
  let toldirilgan = 0;
  let sonli = 0;
  for (const katak of s) {
    const t = matn(katak);
    if (!t) continue;
    toldirilgan++;
    if (songa(katak) !== undefined && /^[\d\s.,\-]+$/.test(t)) sonli++;
    const m = ustunniTani(t);
    if (m && !korilgan.has(m)) {
      korilgan.add(m);
      ball++;
    }
  }
  // Ma'lumot qatori ham tasodifan tanilishi mumkin (dori nomida "narx"
  // so'zi bo'lsa). Sarlavhada raqamli katak deyarli bo'lmaydi.
  if (toldirilgan > 0 && sonli / toldirilgan > 0.4) return 0;
  return ball;
}

/**
 * Sarlavhadan yuqoridagi eng yaqin matnli qator — blok nomi.
 *
 * Qatorining indeksi ham qaytadi: u OLDINGI blokning oxiri sifatida
 * kesiladi. Aks holda "ҚЎШИМЧАЛАР" sarlavhasi oldingi ro'yxatga dori
 * bo'lib qo'shilib qolardi — katalogda aynan shunday axlat bor edi
 * ("Наименование товаров", ishlab chiqaruvchisi "Производитель").
 */
function blokNomi(
  satrlar: unknown[][],
  sarlavhaQatori: number,
  chegara: number
): { nom: string; qator: number } {
  for (let i = sarlavhaQatori - 1; i >= chegara; i--) {
    const s = satrlar[i] ?? [];
    const matnlar = s.map(matn).filter(Boolean);
    if (matnlar.length === 0) continue;
    // Sarlavha bloki emas, qisqa yozuv bo'lsin (birlashtirilgan katak)
    if (matnlar.length <= 3 && sarlavhaBali(s) < 2) {
      return { nom: matnlar.join(' ').trim(), qator: i };
    }
    return { nom: '', qator: sarlavhaQatori };
  }
  return { nom: '', qator: sarlavhaQatori };
}

function bolimniTani(nom: string, birinchimi: boolean): Bolim {
  const p = past(nom);
  if (/акци|aksiya|скидк|chegirma/.test(p)) return 'aksiya';
  if (/қўшимча|кўшимча|qoshimcha|qo'shimcha|дополнит|қошимча/.test(p)) return 'qoshimcha';
  // Nomi tanilmagan blok: birinchisi asosiy, keyingilari qo'shimcha.
  // Yo'qotmaslik muhimroq — noma'lum blok tashlab yuborilmaydi.
  return birinchimi ? 'asosiy' : 'qoshimcha';
}

export function bloklarniTop(satrlar: unknown[][]): Blok[] {
  const nomzodlar: number[] = [];
  for (let i = 0; i < satrlar.length; i++) {
    if (sarlavhaBali(satrlar[i] ?? []) >= 2) nomzodlar.push(i);
  }
  if (nomzodlar.length === 0) return [];

  // Ketma-ket sarlavhaga o'xshagan qatorlar (ikki qatorli sarlavha)
  // bitta blok deb qaraladi — oxirgisi haqiqiy sarlavha.
  const boshlar: number[] = [];
  for (const q of nomzodlar) {
    if (boshlar.length && q - boshlar[boshlar.length - 1] <= 1) {
      boshlar[boshlar.length - 1] = q;
    } else {
      boshlar.push(q);
    }
  }

  // Har blokning nomi va u turgan qator — nom qatori OLDINGI blokning
  // oxiri bo'ladi
  const nomlar = boshlar.map((q, b) =>
    blokNomi(satrlar, q, b === 0 ? 0 : boshlar[b - 1] + 1)
  );

  const bloklar: Blok[] = [];
  for (let b = 0; b < boshlar.length; b++) {
    const sarlavhaQatori = boshlar[b];
    // Keyingi blokning NOMI ham shu blokdan chiqariladi
    const keyingi = boshlar[b + 1];
    const oxirgiQator =
      keyingi === undefined ? satrlar.length - 1 : nomlar[b + 1].qator - 1;

    const sarlavha = satrlar[sarlavhaQatori] ?? [];
    const ustunlar: Ustun[] = sarlavha
      .map((s, i) => ({ indeks: i, sarlavha: matn(s) }))
      .filter((u) => u.sarlavha !== '');
    if (ustunlar.length === 0) continue;

    const nom = nomlar[b].nom;
    const bolim = bolimniTani(nom, b === 0);

    // Moslashtirish FAQAT shu blokning qatorlaridan hisoblanadi
    const oyna = satrlar.slice(0, oxirgiQator + 1);
    bloklar.push({
      bolim,
      nom,
      sarlavhaQatori,
      oxirgiQator,
      ustunlar,
      moslash: moslashniTop(oyna, sarlavhaQatori, ustunlar),
      qatorSoni: 0,
    });
  }

  // Blok nomi bo'lmagan, sarlavhasi oldingisiga AYNAN o'xshash blok —
  // bu bitta jadvalning davomi (Excel'da sarlavha takrorlanadi).
  // Uni alohida blok qilsak bir ro'yxat ikkiga bo'linib ketardi.
  const birlashgan: Blok[] = [];
  for (const b of bloklar) {
    const oldingi = birlashgan[birlashgan.length - 1];
    const imzoB = b.ustunlar.map((u) => past(u.sarlavha)).join('|');
    const imzoO = oldingi?.ustunlar.map((u) => past(u.sarlavha)).join('|');
    if (oldingi && !b.nom && imzoB === imzoO) {
      oldingi.oxirgiQator = b.oxirgiQator;
      continue;
    }
    birlashgan.push(b);
  }

  return birlashgan;
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

  const bloklar = bloklarniTop(satrlar);
  if (bloklar.length === 0) {
    return {
      fileName,
      sheetName,
      sarlavhaQatori: -1,
      ustunlar: [],
      moslash: {},
      imzo: '',
      qatorlar: [],
      bloklar: [],
      jamiHisoblangan: 0,
      jamiFayldan: null,
      rejim: 'faktura',
      faktura: {},
    };
  }

  // Har blok O'Z moslashtirishi bilan o'qiladi va natijalar birlashadi.
  // Ekranda ham, katalogga yozishda ham qatorlar bitta ro'yxat bo'lib
  // qoladi — faqat endi har birida `bolim` bor.
  const qatorlar: Qator[] = [];
  let jamiHisoblangan = 0;
  let jamiFayldan: number | null = null;
  let rejim: Rejim = 'narxlar';

  for (const b of bloklar) {
    const q = qatorlarniYig(
      satrlar,
      b.sarlavhaQatori,
      b.ustunlar,
      b.moslash,
      b.bolim,
      b.oxirgiQator,
      qatorlar.length
    );
    b.qatorSoni = q.qatorlar.length;
    qatorlar.push(...q.qatorlar);
    jamiHisoblangan += q.jamiHisoblangan;
    if (q.jamiFayldan !== null) jamiFayldan = (jamiFayldan ?? 0) + q.jamiFayldan;
    // Bitta blokda ham miqdor bo'lsa — bu faktura
    if (q.rejim === 'faktura') rejim = 'faktura';
  }

  // Asosiy blok — panel ustun moslashtirish jadvali va shablon xotirasi
  // shunga tayanadi (avvalgi xatti-harakat saqlanadi)
  const asosiy = bloklar[0];

  return {
    fileName,
    sheetName,
    sarlavhaQatori: asosiy.sarlavhaQatori,
    ustunlar: asosiy.ustunlar,
    moslash: asosiy.moslash,
    imzo: imzoYasa(asosiy.ustunlar),
    qatorlar,
    bloklar,
    jamiHisoblangan,
    jamiFayldan,
    rejim,
    faktura: bosh(satrlar, asosiy.sarlavhaQatori),
  };
}

// Moslashtirish o'zgarganda qatorlarni qayta yig'ish (foydalanuvchi
// ustunni qo'lda tanlaganda shu chaqiriladi)
export function qatorlarniYig(
  satrlar: unknown[][],
  sarlavhaQatori: number,
  ustunlar: Ustun[],
  moslash: Moslash,
  bolim: Bolim = 'asosiy',
  oxirgiQator?: number,
  boshLineNo = 0
): { qatorlar: Qator[]; jamiHisoblangan: number; jamiFayldan: number | null; rejim: Rejim } {
  const qatorlar: Qator[] = [];
  let jamiHisoblangan = 0;
  let jamiFayldan: number | null = null;
  const oxiri = oxirgiQator ?? satrlar.length - 1;

  // Har bir fayl faktura emas. Miqdor ham, summa ham yo'q bo'lsa — bu
  // narxlar ro'yxati (assortiment). Unda "miqdor yo'q" deb har bir qatorni
  // ogohlantirish ma'nosiz: 10 ming qator qizarib ketadi va haqiqiy
  // muammolar ko'rinmay qoladi.
  const rejim: Rejim = moslash.qty === undefined ? 'narxlar' : 'faktura';

  const moslanganIndekslar = new Set(Object.values(moslash));

  for (let i = sarlavhaQatori + 1; i <= oxiri; i++) {
    const s = satrlar[i] ?? [];
    if (s.every((k) => k === null || matn(k) === '')) continue;
    // Blok ichida sarlavha takrorlansa (Excel'da uzun ro'yxatda odatiy)
    // u dori bo'lib qolmasin
    if (sarlavhaBali(s) >= 2) continue;

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
      line_no: boshLineNo + qatorlar.length + 1,
      bolim,
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
      made_at: sanaga(olish('made_at')),
      // Aksiya sharti ("5+1") SON EMAS — matn bo'lib qoladi. Uni narx
      // deb o'qish jonli bazada 56 ta dorini 51 so'mga tushirgan edi.
      aksiya: matn(olish('aksiya')) || undefined,
      aksiya_narx: songa(olish('aksiya_narx')),
      narx_real: songa(olish('narx_real')),
      org_upk: songa(olish('org_upk')),
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
