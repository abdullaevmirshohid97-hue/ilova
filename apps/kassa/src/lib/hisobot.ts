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
  type Klient,
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
function xulosaSatrlari(m: HisobotManba): { yorliq: string; summa: number }[] {
  const boyicha = valyutaBoyicha(m.yozuvlar);
  const val = valyutalar(m);
  const kop = val.length > 1;
  const natija: { yorliq: string; summa: number }[] = [];
  for (const v of val) {
    const y = boyicha[v] ?? { kirim: 0, chiqim: 0, farq: 0 };
    const qoshimcha = kop ? ' (' + v + ')' : '';
    natija.push({ yorliq: tr('Kirim') + qoshimcha, summa: y.kirim });
    natija.push({ yorliq: tr('Chiqim') + qoshimcha, summa: y.chiqim });
    natija.push({ yorliq: tr('FARQ') + qoshimcha, summa: y.farq });
  }
  return natija;
}

export function hisobotXlsx(m: HisobotManba): Uint8Array {
  const kop = valyutalar(m).length > 1;
  const satrlar: Katak[][] = [
    [{ matn: m.biznes, qalin: true }],
    [{ matn: tr('HISOBOT —') + ' ' + m.davr, qalin: true }],
    [tr('Hujjat sanasi:') + ' ' + sanaYozuv(new Date())],
    [],
  ];
  for (const x of xulosaSatrlari(m)) {
    satrlar.push([{ matn: x.yorliq, qalin: true }, null, x.summa / 100]);
  }
  satrlar.push([], [{ matn: tr('TURKUMLAR'), qalin: true }]);
  for (const [nom, summa] of turkumKesimi(m, kop)) satrlar.push([nom, null, summa / 100]);

  satrlar.push([], USTUNLAR.filter((u) => kop || u !== 'Valyuta').map((u) => ({ matn: tr(u), qalin: true })));
  for (const q of qatorlar(m, kop)) satrlar.push(q.matn as Katak[]);

  const enlar = kop ? [14, 10, 14, 9, 18, 18, 12, 30] : [14, 10, 14, 18, 18, 12, 30];
  return xlsx(tr('Hisobot'), satrlar, enlar);
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
      ...xulosaSatrlari(m).map((x) => [winansi(x.yorliq), raqam(x.summa / 100)] as [string, string]),
      ...turkumKesimi(m, kop)
        .slice(0, 8)
        .map(([nom, summa]) => [winansi('   ' + nom), raqam(summa / 100)] as [string, string]),
    ],
    ustunlar,
    qatorlar: qatorlar(m, kop).map((q) => {
      const oxirgiIzoh = q.matn[q.matn.length - 1];
      return [
        winansi(q.matn[0]),
        winansi(q.matn[1]),
        raqam(q.matn[2]),
        ...(kop ? [winansi(q.matn[3])] : []),
        winansi(q.matn[kop ? 4 : 3]),
        winansi(q.matn[kop ? 5 : 4]),
        winansi(oxirgiIzoh),
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
function bitimQatorlari(m: BitimManba): string[][] {
  const v = m.bitim.valyuta;
  const qatorlar: string[][] = [
    [
      sanaQisqa(m.bitim.sana),
      m.bitim.yonalish === 'berdim' ? tr('Berildi') : tr('Olindi'),
      m.bitim.tovar_nom || (m.bitim.nima === 'qarz' ? tr('Qarz') : tr('Tovar')),
      m.bitim.miqdor ? `${m.bitim.miqdor} ${m.bitim.birlik ?? tr('dona')}` : '',
      m.bitim.narx ? pul(m.bitim.narx, v) : '',
      pul(m.bitim.summa, v),
    ],
  ];
  for (const t of m.tolovlar) {
    if (t.bitim_id !== m.bitim.id || t.holat === 'bekor') continue;
    qatorlar.push([
      sanaQisqa(t.sana),
      tr('To‘lov'),
      tr(t.usuli ?? 'naqd'),
      '',
      '',
      '-' + pul(t.summa, v),
    ]);
  }
  return qatorlar;
}

/** Pastdagi xulosa: jami, to'langan, qolgan */
function bitimXulosa(m: BitimManba): [string, string][] {
  const tolangan = m.tolovlar
    .filter((t) => t.bitim_id === m.bitim.id && t.holat !== 'bekor')
    .reduce((s, t) => s + t.summa, 0);
  const qoldi = Math.max(0, m.bitim.summa - tolangan);
  const v = m.bitim.valyuta;
  const x: [string, string][] = [
    [tr('Jami'), pul(m.bitim.summa, v) + ' ' + v],
    [tr('To‘langan'), pul(tolangan, v) + ' ' + v],
    [tr('Qoldi'), pul(qoldi, v) + ' ' + v],
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
    xulosa: bitimXulosa(m).map(([a, b]) => [winansi(a), winansi(b)] as [string, string]),
    ustunlar: [
      { nom: tr('Sana'), en: 14 },
      { nom: tr('Harakat'), en: 14 },
      { nom: tr('Nomi'), en: 24 },
      { nom: tr('Miqdor'), en: 14, ong: true },
      { nom: tr('Narx'), en: 14, ong: true },
      { nom: tr('Summa'), en: 16, ong: true },
    ],
    qatorlar: bitimQatorlari(m).map((q) => q.map(winansi)),
  });
}
