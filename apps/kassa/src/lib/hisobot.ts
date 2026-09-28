// =============================================================
//  HISOBOTNI FAYLGA CHIQARISH — Excel va PDF
//
//  Dvigatel `@ilova/kassa-yadro/hujjat` da: u kutubxonasiz XLSX va
//  PDF yasaydi va qarzdorlik boti bilan BIR XIL kod. Bu yerda esa
//  faqat "nima yoziladi" turadi.
//
//  Fayl QURILMADA yasaladi, serverda emas. Sabab: 2-bosqichda ilova
//  offline ishlaydi va o'sha paytda ham hisobot kerak bo'ladi.
//
//  TIL: yorliqlar foydalanuvchi tanlagan tilda chiqadi. PDF‘da
//  ruscha matn LOTINGA o‘giriladi (quyida) — o‘qsa bo‘ladi,
//  lekin kirill emas. Excel‘da bunday cheklov yo‘q.
//
//  PDF'da kirill matn lotinga o'giriladi (standart Helvetica boshqa
//  belgini bilmaydi) — `winansi` shuni qiladi. Excel'da bunday
//  cheklov yo'q.
// =============================================================

import {
  formatla,
  pdf,
  raqam,
  sanaYozuv,
  winansi,
  xlsx,
  type Bitim,
  type Hisob,
  type Katak,
  type KatakStil,
  type Klient,
  type PdfKatak,
  type PdfRang,
  type HamkorQator,
  operatsiyaNomi,
  type Valyuta,
  type Tolov,
  type Turkum,
  valyutaBoyicha,
  type Yozuv,
} from '@ilova/kassa-yadro';
import { sanaQisqa } from './davr';
import { tr } from './til';

export type HisobotManba = {
  biznes: string;
  davr: string;
  yozuvlar: Yozuv[];
  hisoblar: Hisob[];
  turkumlar: Turkum[];
  klientlar: Klient[];
};

// ---------------------------------------------------------------
//  VALYUTA
//
//  Hisobot avval hamma yozuvni bitta yig'indiga qo'shar edi: 2 mln
//  so'm va 100 dollar qo'shilib "2 000 100" chiqardi. Bu shunchaki
//  xato emas — JIM xato: raqam ishonarli ko'rinadi va odam unga
//  qarab qaror qabul qiladi.
//
//  Endi har valyuta ALOHIDA sanaladi. Bitta valyuta bo'lsa (odatdagi
//  holat) hisobot avvalgidek sodda qoladi — ortiqcha ustun ham,
//  qavs ichidagi "(UZS)" ham chiqmaydi.
// ---------------------------------------------------------------
function valyutalar(m: HisobotManba): string[] {
  const bor = new Set<string>();
  for (const y of m.yozuvlar) bor.add(y.valyuta ?? 'UZS');
  return bor.size === 0 ? ['UZS'] : [...bor].sort();
}

// ---------------------------------------------------------------
//  DIZAYN (2026-09-28): «kataklar yetarli bo‘lsin, ranglar alohida
//  e’tiborga olinsin».
//
//  · Excel’da summa MATN emas, SON — uni qo‘shsa, saralasa bo‘ladi.
//    Kasr faqat kerak bo‘lsa (so‘mda butun, dollarda tiyin bilan).
//  · Ustun eni kontentga qarab hisoblanadi, uzun izoh O‘RALADI.
//  · Ranglar ilova bilan bir xil: kirim (oldim) ko‘k, chiqim (berdim)
//    qizil, qoldiq ishorasiga qarab. Jadval sarlavhasi Telegram ko‘ki.
//  · Sarlavha qatori muzlatilgan va filtrli: uzun sverkada ham ustun
//    nomi ko‘rinib turadi.
// ---------------------------------------------------------------

/** Excel katagi: SON, kasr faqat kerak bo‘lsa */
function sonKatak(tiyin: number, stil: KatakStil = {}): Katak {
  const qiymat = Math.round(tiyin) / 100;
  return { son: qiymat, kasr: !Number.isInteger(qiymat), chegara: true, ...stil };
}

/** Jadval katagi (matn) */
function matnKatak(matn: string, stil: KatakStil = {}): Katak {
  return { matn, chegara: true, ...stil };
}

/** Jadval sarlavhasi — Telegram ko‘ki, oq qalin matn */
function sarlavhaKatak(matn: string, ong = false): Katak {
  return { matn, qalin: true, rang: 'oq', fon: 'sarlavha', chegara: true, ong, orash: true };
}

/** Qoldiq rangi: musbat — hamkor sizga qarzdor (ko‘k), manfiy — siz (qizil) */
const qoldiqRangi = (q: number): PdfRang | undefined => (q > 0 ? 'kirim' : q < 0 ? 'chiqim' : undefined);

// Kalitlar: tarjima hujjat yasalayotganda qilinadi (modul bir
// marta o‘qiladi, til esa keyinroq yuklanadi).
const USTUNLAR = ['Sana', 'Turi', 'Summa', 'Valyuta', 'Turkum', 'Kontakt', 'Hisob', 'Izoh'];

function qatorlar(m: HisobotManba, kopValyuta: boolean) {
  const turkum = (id?: string | null) => m.turkumlar.find((t) => t.id === id)?.nom ?? '';
  const klient = (id?: string | null) => m.klientlar.find((k) => k.id === id)?.ism ?? '';
  const hisob = (id: string) => m.hisoblar.find((h) => h.id === id)?.nom ?? '';

  return [...m.yozuvlar]
    .sort((a, b) => Date.parse(a.sana) - Date.parse(b.sana))
    .map((y) => ({
      y,
      matn: [
        sanaQisqa(y.sana),
        y.kochirma_id ? tr('O‘tkazma') : y.turi === 'kirim' ? tr('Kirim') : tr('Chiqim'),
        y.summa / 100,
        kopValyuta ? (y.valyuta ?? 'UZS') : null,
        turkum(y.turkum_id),
        klient(y.klient_id),
        hisob(y.hisob_id),
        [y.izoh ?? '', y.bekor_at ? tr('(bekor qilingan)') : ''].filter(Boolean).join(' '),
      ].filter((k) => k !== null) as (string | number)[],
    }));
}

/** Turkum kesimi — valyutalar aralashmaydi */
function turkumKesimi(m: HisobotManba, kopValyuta: boolean): [string, number][] {
  const xarita = new Map<string, number>();
  for (const y of m.yozuvlar) {
    if (y.bekor_at || y.kochirma_id) continue;
    const nom =
      (m.turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? tr('Turkumsiz')) +
      (y.turi === 'kirim' ? ' ' + tr('(kirim)') : '') +
      (kopValyuta ? ' · ' + (y.valyuta ?? 'UZS') : '');
    xarita.set(nom, (xarita.get(nom) ?? 0) + y.summa);
  }
  return [...xarita.entries()].sort((a, b) => b[1] - a[1]);
}

/** Xulosa satrlari: bitta valyutada — uchta qator, ko'pda — har biriga uchtadan */
function xulosaSatrlari(m: HisobotManba): { yorliq: string; summa: number; turi: 'kirim' | 'chiqim' | 'farq' }[] {
  const boyicha = valyutaBoyicha(m.yozuvlar);
  const val = valyutalar(m);
  const kop = val.length > 1;
  const natija: { yorliq: string; summa: number; turi: 'kirim' | 'chiqim' | 'farq' }[] = [];
  for (const v of val) {
    const y = boyicha[v] ?? { kirim: 0, chiqim: 0, farq: 0 };
    const qoshimcha = kop ? ' (' + v + ')' : '';
    natija.push({ yorliq: tr('Kirim') + qoshimcha, summa: y.kirim, turi: 'kirim' });
    natija.push({ yorliq: tr('Chiqim') + qoshimcha, summa: y.chiqim, turi: 'chiqim' });
    natija.push({ yorliq: tr('FARQ') + qoshimcha, summa: y.farq, turi: 'farq' });
  }
  return natija;
}

export function hisobotXlsx(m: HisobotManba): Uint8Array {
  const kop = valyutalar(m).length > 1;
  const satrlar: Katak[][] = [
    [{ matn: m.biznes, qalin: true, olcham: 14 }],
    [{ matn: tr('HISOBOT —') + ' ' + m.davr, qalin: true, rang: 'urgu' }],
    [{ matn: tr('Hujjat sanasi:') + ' ' + sanaYozuv(new Date()), rang: 'xira' }],
    [],
  ];
  for (const x of xulosaSatrlari(m)) {
    const rang = x.turi === 'kirim' ? 'kirim' : x.turi === 'chiqim' ? 'chiqim' : qoldiqRangi(x.summa);
    satrlar.push([{ matn: x.yorliq, qalin: true }, null, sonKatak(x.summa, { qalin: true, rang, fon: 'jami' })]);
  }
  satrlar.push([], [{ matn: tr('TURKUMLAR'), qalin: true, rang: 'urgu' }]);
  for (const [nom, summa] of turkumKesimi(m, kop)) satrlar.push([matnKatak(nom), null, sonKatak(summa)]);

  satrlar.push([]);
  const sarlavhaQatori = satrlar.length + 1;
  const ustunlar = USTUNLAR.filter((u) => kop || u !== 'Valyuta');
  satrlar.push(ustunlar.map((u) => sarlavhaKatak(tr(u), u === 'Summa')));
  qatorlar(m, kop).forEach((q, i) => {
    const fon = i % 2 === 1 ? ('zebra' as const) : undefined;
    const rang = q.y.bekor_at ? 'xira' : q.y.kochirma_id ? 'xira' : q.y.turi === 'kirim' ? 'kirim' : 'chiqim';
    satrlar.push(
      q.matn.map((k, j) =>
        j === 2
          ? sonKatak(q.y.summa, { fon, rang })
          : matnKatak(String(k ?? ''), { fon, orash: j === q.matn.length - 1, rang: j === 1 ? rang : undefined }),
      ),
    );
  });

  const enlar = kop ? [11, 9, 13, 8, 16, 18, 12, 30] : [11, 9, 13, 16, 18, 12, 30];
  return xlsx(tr('Hisobot'), satrlar, enlar, { avtoEn: true, muzlat: sarlavhaQatori, filtr: sarlavhaQatori });
}

export function hisobotPdf(m: HisobotManba): Uint8Array {
  const kop = valyutalar(m).length > 1;
  const ustunlar = [
    { nom: tr('Sana'), en: 14 },
    { nom: tr('Turi'), en: 10 },
    { nom: tr('Summa'), en: 14, ong: true },
    ...(kop ? [{ nom: tr('Val.'), en: 7 }] : []),
    { nom: tr('Turkum'), en: kop ? 16 : 18 },
    { nom: tr('Kontakt'), en: 16 },
    { nom: tr('Izoh'), en: kop ? 20 : 24 },
  ];
  return pdf({
    sarlavha: winansi(m.biznes),
    qator2: winansi(tr('HISOBOT —') + ' ' + m.davr),
    qator3: winansi(tr('Hujjat sanasi:') + ' ' + sanaYozuv(new Date())),
    xulosa: [
      ...xulosaSatrlari(m).map(
        (x) =>
          [
            winansi(x.yorliq),
            raqam(x.summa / 100),
            x.turi === 'kirim' ? 'kirim' : x.turi === 'chiqim' ? 'chiqim' : (qoldiqRangi(x.summa) ?? 'urgu'),
          ] as [string, string, PdfRang],
      ),
      ...turkumKesimi(m, kop)
        .slice(0, 8)
        .map(([nom, summa]) => [winansi('   ' + nom), raqam(summa / 100)] as [string, string]),
    ],
    ustunlar,
    qatorlar: qatorlar(m, kop).map((q): PdfKatak[] => {
      const oxirgiIzoh = q.matn[q.matn.length - 1];
      const rang: PdfRang = q.y.bekor_at || q.y.kochirma_id ? 'xira' : q.y.turi === 'kirim' ? 'kirim' : 'chiqim';
      return [
        winansi(q.matn[0]),
        { matn: winansi(q.matn[1]), rang },
        { matn: raqam(q.matn[2]), rang },
        ...(kop ? [winansi(q.matn[3])] : []),
        winansi(q.matn[kop ? 4 : 3]),
        winansi(q.matn[kop ? 5 : 4]),
        // XOM matn — o‘rash dvigatelda (sverkadagi sabab)
        String(oxirgiIzoh ?? ''),
      ];
    }),
  });
}

// ===============================================================
//  BITIM HUJJATI — bitta oldi-berdining dalili
//
//  Hisobot DAVRNI ko'rsatadi, bu esa BITTA bitimni: tovar, miqdor,
//  narx, to'langani va qolgani. Nizoda qo'lga tutqaziladigan
//  qog'oz shu.
//
//  Ataylab «Faktura» yoki «Schyot» deyilmadi: bu buxgalteriya
//  hujjati EMAS, STIR va imzo majburiy emas. Nomi bilan va'da
//  bermaslik kerak — aks holda odam uni soliqqa olib borardi.
// ===============================================================

export type BitimManba = {
  biznes: string;
  bitim: Bitim;
  tolovlar: Tolov[];
  hamkor: Klient | null;
};

/** Hujjatning ustki qismidagi «kim kimga» satri */
function tomonlar(m: BitimManba): string {
  const hamkor = m.hamkor?.kompaniya || m.hamkor?.ism || tr('Hamkor');
  return m.bitim.yonalish === 'berdim'
    ? `${m.biznes} → ${hamkor}`
    : `${hamkor} → ${m.biznes}`;
}

/**
 * Bitim hujjatida pul KASRI BILAN yoziladi.
 *
 * `raqam()` butunga yaxlitlaydi — hisobotda so'm uchun bu to'g'ri,
 * lekin bu yerda birlik narxi $0.10 bo‘lishi mumkin va u «0» bo‘lib
 * chiqardi. Konsepsiyadagi xato ham aynan shu qatorda tug‘ilgan edi.
 */
const pul = (tiyin: number, valyuta: Bitim['valyuta']) =>
  formatla(tiyin, valyuta, { belgisiz: true });

/** Bitim va to'lovlar jadvali: har qator — bitta harakat */
function bitimQatorlari(m: BitimManba): PdfKatak[][] {
  const v = m.bitim.valyuta;
  // Berildi — qizil, olindi — ko‘k (ilovadagidek). To‘lov bitimga
  // TESKARI yo‘nalishda, shuning uchun rangi ham teskari.
  const bitimRangi: PdfRang = m.bitim.yonalish === 'berdim' ? 'chiqim' : 'kirim';
  const tolovRangi: PdfRang = m.bitim.yonalish === 'berdim' ? 'kirim' : 'chiqim';
  const qatorlar: PdfKatak[][] = [
    [
      sanaQisqa(m.bitim.sana),
      { matn: m.bitim.yonalish === 'berdim' ? tr('Berildi') : tr('Olindi'), rang: bitimRangi },
      m.bitim.tovar_nom || (m.bitim.nima === 'qarz' ? tr('Qarz') : tr('Tovar')),
      m.bitim.miqdor ? `${m.bitim.miqdor} ${m.bitim.birlik ?? tr('dona')}` : '',
      m.bitim.narx ? pul(m.bitim.narx, v) : '',
      { matn: pul(m.bitim.summa, v), rang: bitimRangi, qalin: true },
    ],
  ];
  for (const t of m.tolovlar) {
    if (t.bitim_id !== m.bitim.id || t.holat === 'bekor') continue;
    qatorlar.push([
      sanaQisqa(t.sana),
      { matn: tr('To‘lov'), rang: tolovRangi },
      t.izoh || tr(t.usuli ?? 'naqd'),
      '',
      '',
      { matn: '-' + pul(t.summa, v), rang: tolovRangi },
    ]);
  }
  return qatorlar;
}

/** Pastdagi xulosa: jami, to'langan, qolgan */
function bitimXulosa(m: BitimManba): ([string, string] | [string, string, PdfRang])[] {
  const tolangan = m.tolovlar
    .filter((t) => t.bitim_id === m.bitim.id && t.holat !== 'bekor')
    .reduce((s, t) => s + t.summa, 0);
  const qoldi = Math.max(0, m.bitim.summa - tolangan);
  const v = m.bitim.valyuta;
  const x: ([string, string] | [string, string, PdfRang])[] = [
    [tr('Jami'), pul(m.bitim.summa, v) + ' ' + v],
    [tr('To‘langan'), pul(tolangan, v) + ' ' + v, 'kirim'],
    // Qolgan qarz — e’tibor kerak joy, shuning uchun qizil
    [tr('Qoldi'), pul(qoldi, v) + ' ' + v, qoldi > 0 ? 'chiqim' : 'kirim'],
  ];
  if (m.bitim.muddat) x.push([tr('Muddat'), sanaQisqa(m.bitim.muddat)]);
  x.push([
    tr('Holat'),
    m.bitim.holat === 'tasdiqlangan'
      ? tr('Tasdiqlangan')
      : m.bitim.holat === 'yopilgan'
        ? tr('Yopilgan')
        : m.bitim.holat === 'bekor'
          ? tr('Bekor qilingan')
          : tr('Tasdiqlanmagan'),
  ]);
  return x;
}

export function bitimPdf(m: BitimManba): Uint8Array {
  return pdf({
    sarlavha: winansi(tr('OLDI-BERDI')),
    qator2: winansi(tomonlar(m)),
    qator3: winansi(tr('Hujjat sanasi:') + ' ' + sanaYozuv(new Date())),
    xulosa: bitimXulosa(m).map(([a, b, r]) => (r ? [winansi(a), winansi(b), r] : [winansi(a), winansi(b)]) as [string, string, PdfRang]),
    ustunlar: [
      { nom: tr('Sana'), en: 14 },
      { nom: tr('Harakat'), en: 14 },
      { nom: tr('Nomi'), en: 24 },
      { nom: tr('Miqdor'), en: 14, ong: true },
      { nom: tr('Narx'), en: 14, ong: true },
      { nom: tr('Summa'), en: 16, ong: true },
    ],
    qatorlar: bitimQatorlari(m).map((q) => q.map((k) => (typeof k === 'string' ? winansi(k) : { ...k, matn: winansi(k.matn) }))),
  });
}

// =============================================================
//  SVERKA — bitta hamkor bilan hisob-kitob
//
//  Qarzdorlik botidagi `sverkaPdf`/`sverkaXlsx` naqshi, lekin
//  OLDI-BERDI modeliga moslangan: bu yerda «chiqim/kirim» emas,
//  hamkor daftarining yuruvchi balansi.
//
//  Qatorlar `hamkorYuruvchi` dan keladi — ya'ni hujjatdagi
//  qoldiq ekrandagi qoldiq bilan AYNAN bir manbadan. Ikki joyda
//  alohida hisoblansa, mijoz hujjatni ko'rsatib «bu yerda
//  boshqa raqam» deyishi mumkin edi va kim to'g'ri ekanini
//  isbotlab bo'lmasdi.
//
//  IKKI SUMMA USTUNI, nol yozilmaydi. Har qatorda ikkita raqam
//  turib qolsa, ko'z qaysi biri haqiqiy summa ekanini ajrata
//  olmaydi — shuning uchun tegishli bo'lmagani BO'SH qoladi.
// =============================================================

export type SverkaManba = {
  biznes: string;
  klient: Klient;
  /** `hamkorYuruvchi` natijasi — yuruvchi qoldiq bilan */
  qatorlar: { qator: HamkorQator; ozgarish: number; qoldiq: number }[];
  valyuta: Valyuta;
  davr: string;
};

function sverkaTavsif(q: HamkorQator): string {
  if (q.tur === 'bitim') {
    const b = q.bitim;
    const bolaklar = [
      b.tovar_nom ?? '',
      b.miqdor ? `${b.miqdor} ${b.birlik ?? ''}`.trim() : '',
      b.izoh ?? '',
    ];
    return bolaklar.filter(Boolean).join(' · ');
  }
  if (q.tur === 'tolov') return q.tolov.izoh ?? '';
  return q.yozuv.izoh ?? '';
}

/**
 * Sverka qatorlari. USTUNLAR «Berdim» va «Oldim» (ilgari «Qarz» va
 * «To‘lov»): kartochkadagi kirim/chiqim endi oddiy pul harakati va
 * «Qarz» ustunida «Pul berdim» turishi chalg‘itardi. Ishora qoidasi
 * o‘zgarmadi — berdim +, oldim −.
 */
type SverkaQatori = { tartib: string; sana: string; amal: string; tavsif: string; berdim: number; oldim: number; qoldiq: number };

function sverkaQatorlari(m: SverkaManba): SverkaQatori[] {
  return m.qatorlar.map((x, i) => ({
    tartib: String(i + 1),
    sana: sanaQisqa(x.qator.sana),
    amal: tr(operatsiyaNomi(x.qator)),
    tavsif: sverkaTavsif(x.qator),
    // Musbat o‘zgarish — men berdim, hamkor ko‘proq qarzdor bo‘ldi
    berdim: x.ozgarish > 0 ? x.ozgarish : 0,
    oldim: x.ozgarish < 0 ? -x.ozgarish : 0,
    qoldiq: x.qoldiq,
  }));
}

function sverkaXulosa(m: SverkaManba): { yorliq: string; tiyin: number | null; matn: string; rang?: PdfRang }[] {
  let berdim = 0;
  let oldim = 0;
  for (const x of m.qatorlar) {
    if (x.ozgarish > 0) berdim += x.ozgarish;
    else oldim += -x.ozgarish;
  }
  const oxiri = m.qatorlar.length ? m.qatorlar[m.qatorlar.length - 1].qoldiq : 0;
  return [
    { yorliq: tr('Operatsiyalar'), tiyin: null, matn: String(m.qatorlar.length) },
    { yorliq: tr('Jami berdim'), tiyin: berdim, matn: formatla(berdim, m.valyuta), rang: 'chiqim' },
    { yorliq: tr('Jami oldim'), tiyin: oldim, matn: formatla(oldim, m.valyuta), rang: 'kirim' },
    // Ishorani MATN bilan ham aytamiz: minus belgisi hujjatda
    // ko‘zdan qochadi va «kim kimga qarzdor» chalkashadi.
    {
      yorliq: oxiri >= 0 ? tr('Sizga qarzdor') : tr('Siz qarzdorsiz'),
      tiyin: Math.abs(oxiri),
      matn: formatla(Math.abs(oxiri), m.valyuta),
      rang: qoldiqRangi(oxiri) ?? 'urgu',
    },
  ];
}

const SVERKA_USTUNLAR: { nom: string; en: number; ong?: boolean }[] = [
  { nom: '№', en: 4 },
  { nom: 'Sana', en: 11 },
  { nom: 'Amal', en: 13 },
  { nom: 'Tavsif', en: 28 },
  { nom: 'Berdim', en: 14, ong: true },
  { nom: 'Oldim', en: 14, ong: true },
  { nom: 'Qoldiq', en: 15, ong: true },
];

export function sverkaXlsx(m: SverkaManba): Uint8Array {
  const satrlar: Katak[][] = [
    [{ matn: m.biznes, qalin: true, olcham: 14 }],
    [{ matn: tr('SVERKA') + ' — ' + m.klient.ism, qalin: true, olcham: 12, rang: 'urgu' }],
    [{ matn: m.davr + '   ·   ' + tr('Hujjat sanasi:') + ' ' + sanaYozuv(new Date()), rang: 'xira' }],
  ];
  if (m.klient.telefon) satrlar.push([{ matn: tr('Tel:') + ' ' + m.klient.telefon, rang: 'xira' }]);
  satrlar.push([]);

  // Xulosa: yorliq chapda, qiymat QOLDIQ ustunida — son sifatida
  const oxirgi = SVERKA_USTUNLAR.length - 1;
  for (const x of sverkaXulosa(m)) {
    const qator: Katak[] = Array(SVERKA_USTUNLAR.length).fill(null);
    qator[0] = { matn: x.yorliq, qalin: true };
    qator[oxirgi] =
      x.tiyin === null
        ? { matn: x.matn, qalin: true, ong: true, fon: 'jami' }
        : sonKatak(x.tiyin, { qalin: true, rang: x.rang, fon: 'jami' });
    satrlar.push(qator);
  }
  satrlar.push([]);

  const sarlavhaQatori = satrlar.length + 1;
  satrlar.push(SVERKA_USTUNLAR.map((u) => sarlavhaKatak(tr(u.nom), u.ong)));
  sverkaQatorlari(m).forEach((q, i) => {
    const fon = i % 2 === 1 ? ('zebra' as const) : undefined;
    satrlar.push([
      matnKatak(q.tartib, { fon, rang: 'xira' }),
      matnKatak(q.sana, { fon }),
      matnKatak(q.amal, { fon, rang: q.berdim ? 'chiqim' : 'kirim' }),
      matnKatak(q.tavsif, { fon, orash: true }),
      q.berdim ? sonKatak(q.berdim, { fon, rang: 'chiqim' }) : matnKatak('', { fon }),
      q.oldim ? sonKatak(q.oldim, { fon, rang: 'kirim' }) : matnKatak('', { fon }),
      sonKatak(q.qoldiq, { fon, qalin: true, rang: qoldiqRangi(q.qoldiq) }),
    ]);
  });

  return xlsx(
    tr('Sverka'),
    satrlar,
    SVERKA_USTUNLAR.map((u) => u.en),
    { avtoEn: true, muzlat: sarlavhaQatori, filtr: sarlavhaQatori },
  );
}

export function sverkaPdf(m: SverkaManba): Uint8Array {
  const b = (tiyin: number) => formatla(tiyin, m.valyuta, { belgisiz: true });
  return pdf({
    sarlavha: winansi(tr('SVERKA') + ' — ' + m.klient.ism),
    qator2: winansi(m.biznes + '   ·   ' + m.davr),
    qator3: winansi(
      (m.klient.telefon ? tr('Tel:') + ' ' + m.klient.telefon + '   ·   ' : '') +
        tr('Hujjat sanasi:') +
        ' ' +
        sanaYozuv(new Date()),
    ),
    xulosa: sverkaXulosa(m).map((x) =>
      (x.rang ? [winansi(x.yorliq), winansi(x.matn), x.rang] : [winansi(x.yorliq), winansi(x.matn)]) as [string, string, PdfRang],
    ),
    ustunlar: SVERKA_USTUNLAR.map((u) => ({ nom: winansi(tr(u.nom)), en: u.en, ong: u.ong })),
    qatorlar: sverkaQatorlari(m).map((q): PdfKatak[] => [
      { matn: q.tartib, rang: 'xira' },
      winansi(q.sana),
      { matn: winansi(q.amal), rang: q.berdim ? 'chiqim' : 'kirim' },
      // XOM matn: o‘rash dvigatelda va u yangi qatorni ham biladi.
      // Oldindan `winansi` qilinsa qator bo‘linishlari yo‘qolardi.
      q.tavsif,
      q.berdim ? { matn: b(q.berdim), rang: 'chiqim' } : '',
      q.oldim ? { matn: b(q.oldim), rang: 'kirim' } : '',
      { matn: b(q.qoldiq), rang: qoldiqRangi(q.qoldiq), qalin: true },
    ]),
  });
}
