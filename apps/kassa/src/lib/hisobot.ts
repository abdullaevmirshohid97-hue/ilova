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
  davrYigindi,
  formatla,
  pdf,
  raqam,
  sanaYozuv,
  winansi,
  xlsx,
  type Hisob,
  type Katak,
  type Klient,
  type Turkum,
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

const USTUNLAR = ['Sana', 'Turi', 'Summa', 'Turkum', 'Kontakt', 'Hisob', 'Izoh'];

function qatorlar(m: HisobotManba) {
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
        turkum(y.turkum_id),
        klient(y.klient_id),
        hisob(y.hisob_id),
        [y.izoh ?? '', y.bekor_at ? '(bekor qilingan)' : ''].filter(Boolean).join(' '),
      ] as (string | number)[],
    }));
}

function turkumKesimi(m: HisobotManba): [string, number][] {
  const xarita = new Map<string, number>();
  for (const y of m.yozuvlar) {
    if (y.bekor_at || y.kochirma_id) continue;
    const nom =
      (m.turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? 'Turkumsiz') +
      (y.turi === 'kirim' ? ' (kirim)' : '');
    xarita.set(nom, (xarita.get(nom) ?? 0) + y.summa);
  }
  return [...xarita.entries()].sort((a, b) => b[1] - a[1]);
}

export function hisobotXlsx(m: HisobotManba): Uint8Array {
  const y = davrYigindi(m.yozuvlar);
  const satrlar: Katak[][] = [
    [{ matn: m.biznes, qalin: true }],
    [{ matn: 'HISOBOT — ' + m.davr, qalin: true }],
    ['Hujjat sanasi: ' + sanaYozuv(new Date())],
    [],
    [{ matn: 'Kirim', qalin: true }, null, y.kirim / 100],
    [{ matn: 'Chiqim', qalin: true }, null, y.chiqim / 100],
    [{ matn: 'FARQ', qalin: true }, null, y.farq / 100],
    [],
    [{ matn: 'TURKUMLAR', qalin: true }],
  ];
  for (const [nom, summa] of turkumKesimi(m)) satrlar.push([nom, null, summa / 100]);

  satrlar.push([], USTUNLAR.map((u) => ({ matn: u, qalin: true })));
  for (const q of qatorlar(m)) satrlar.push(q.matn as Katak[]);

  return xlsx('Hisobot', satrlar, [14, 10, 14, 18, 18, 12, 30]);
}

export function hisobotPdf(m: HisobotManba): Uint8Array {
  const y = davrYigindi(m.yozuvlar);
  return pdf({
    sarlavha: winansi(m.biznes),
    qator2: winansi('HISOBOT — ' + m.davr),
    qator3: winansi('Hujjat sanasi: ' + sanaYozuv(new Date())),
    xulosa: [
      ['Kirim', raqam(y.kirim / 100)],
      ['Chiqim', raqam(y.chiqim / 100)],
      ['FARQ', raqam(y.farq / 100)],
      ...turkumKesimi(m)
        .slice(0, 8)
        .map(([nom, summa]) => [winansi('   ' + nom), raqam(summa / 100)] as [string, string]),
    ],
    ustunlar: [
      { nom: 'Sana', en: 14 },
      { nom: 'Turi', en: 10 },
      { nom: 'Summa', en: 14, ong: true },
      { nom: 'Turkum', en: 18 },
      { nom: 'Kontakt', en: 16 },
      { nom: 'Izoh', en: 24 },
    ],
    qatorlar: qatorlar(m).map((q) => [
      winansi(q.matn[0]),
      winansi(q.matn[1]),
      raqam(q.matn[2]),
      winansi(q.matn[3]),
      winansi(q.matn[4]),
      winansi(q.matn[6]),
    ]),
  });
}
