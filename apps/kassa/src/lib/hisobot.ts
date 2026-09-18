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
//  PDF'da kirill matn lotinga o'giriladi (standart Helvetica boshqa
//  belgini bilmaydi) — `winansi` shuni qiladi. Excel'da bunday
//  cheklov yo'q.
// =============================================================

import {
  pdf,
  raqam,
  sanaYozuv,
  winansi,
  xlsx,
  type Hisob,
  type Katak,
  type Klient,
  type Turkum,
  valyutaBoyicha,
  type Yozuv,
} from '@ilova/kassa-yadro';
import { sanaQisqa } from './davr';

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
        y.kochirma_id ? "O'tkazma" : y.turi === 'kirim' ? 'Kirim' : 'Chiqim',
        y.summa / 100,
        kopValyuta ? (y.valyuta ?? 'UZS') : null,
        turkum(y.turkum_id),
        klient(y.klient_id),
        hisob(y.hisob_id),
        [y.izoh ?? '', y.bekor_at ? '(bekor qilingan)' : ''].filter(Boolean).join(' '),
      ].filter((k) => k !== null) as (string | number)[],
    }));
}

/** Turkum kesimi — valyutalar aralashmaydi */
function turkumKesimi(m: HisobotManba, kopValyuta: boolean): [string, number][] {
  const xarita = new Map<string, number>();
  for (const y of m.yozuvlar) {
    if (y.bekor_at || y.kochirma_id) continue;
    const nom =
      (m.turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? 'Turkumsiz') +
      (y.turi === 'kirim' ? ' (kirim)' : '') +
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
    natija.push({ yorliq: 'Kirim' + qoshimcha, summa: y.kirim });
    natija.push({ yorliq: 'Chiqim' + qoshimcha, summa: y.chiqim });
    natija.push({ yorliq: 'FARQ' + qoshimcha, summa: y.farq });
  }
  return natija;
}

export function hisobotXlsx(m: HisobotManba): Uint8Array {
  const kop = valyutalar(m).length > 1;
  const satrlar: Katak[][] = [
    [{ matn: m.biznes, qalin: true }],
    [{ matn: 'HISOBOT — ' + m.davr, qalin: true }],
    ['Hujjat sanasi: ' + sanaYozuv(new Date())],
    [],
  ];
  for (const x of xulosaSatrlari(m)) {
    satrlar.push([{ matn: x.yorliq, qalin: true }, null, x.summa / 100]);
  }
  satrlar.push([], [{ matn: 'TURKUMLAR', qalin: true }]);
  for (const [nom, summa] of turkumKesimi(m, kop)) satrlar.push([nom, null, summa / 100]);

  satrlar.push([], USTUNLAR.filter((u) => kop || u !== 'Valyuta').map((u) => ({ matn: u, qalin: true })));
  for (const q of qatorlar(m, kop)) satrlar.push(q.matn as Katak[]);

  const enlar = kop ? [14, 10, 14, 9, 18, 18, 12, 30] : [14, 10, 14, 18, 18, 12, 30];
  return xlsx('Hisobot', satrlar, enlar);
}

export function hisobotPdf(m: HisobotManba): Uint8Array {
  const kop = valyutalar(m).length > 1;
  const ustunlar = [
    { nom: 'Sana', en: 14 },
    { nom: 'Turi', en: 10 },
    { nom: 'Summa', en: 14, ong: true },
    ...(kop ? [{ nom: 'Val.', en: 7 }] : []),
    { nom: 'Turkum', en: kop ? 16 : 18 },
    { nom: 'Kontakt', en: 16 },
    { nom: 'Izoh', en: kop ? 20 : 24 },
  ];
  return pdf({
    sarlavha: winansi(m.biznes),
    qator2: winansi('HISOBOT — ' + m.davr),
    qator3: winansi('Hujjat sanasi: ' + sanaYozuv(new Date())),
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
