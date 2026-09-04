// ============================================================================
// PRAYS HUJJATI — mijozga yuboriladigan narxlar ro'yxati
//
// Alohida faylda turishi ataylab: shu tufayli hujjatni sinovda HAQIQATAN
// yasab, qayta o'qib tekshirish mumkin. Komponent ichida qolsa, uni
// faqat "kodda shunday yozilganmi" deb tekshirish qolardi — bu esa
// katak formulasi yoki rangi noto'g'ri chiqqanini ushlamaydi.
//
// ExcelJS ishlatiladi, xlsx emas: xlsx katak bezay olmaydi (rang, ramka,
// qalin shrift) va formula yozolmaydi.
// ============================================================================

export type PraysQator = {
  nomi: string | null;
  narx: number | string | null;
  yaroqlilik: string | null;
  ishlab_chiqaruvchi: string | null;
};

const RUS_OYLAR = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// Oy nomlari qo'lda: toLocaleDateString('ru-RU') ICU'si qirqilgan
// muhitda RangeError berib butun sahifani yiqitgan edi — bu ikki
// marta bo'lgan.
export function sanaYozuv(d: Date): string {
  return `${d.getDate()} ${RUS_OYLAR[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** 2027-06-30 -> 30.06.2027 */
export function sanaFormat(s: string | null): string {
  if (!s) return '';
  const [y, o, k] = String(s).slice(0, 10).split('-');
  return y && o && k ? `${k}.${o}.${y}` : String(s);
}

export const USTUNLAR = [
  '№',
  'Название',
  'Ваш заказ',
  'Сотув нархи',
  'Сумма заказ',
  'Срок годности',
  'Производитель',
];

const KOK = 'FFB8D9EC';
const KULRANG = 'FFD9D9D9';
const SARIQ = 'FFFFFF00';

/** Sarlavha bloki necha qator egallaydi — ma'lumot shundan keyin boshlanadi */
export const BOSH_QATOR = 5;

export async function praysKitobi(
  qatorlar: PraysQator[],
  firma: string,
  sana = new Date(),
  // Logo baytlari. Yo'q bo'lsa hujjat baribir chiqadi — brend belgisi
  // yo'qligi uchun prays yuborilmay qolmasin.
  logo?: { bayt: ArrayBuffer; kengaytma: 'png' | 'jpeg' } | null,
): Promise<ArrayBuffer> {
  // Faqat kerak bo'lganda yuklanadi: kutubxona ~900 KB, uni asosiy
  // paketga qo'shish har sahifa ochilishini sekinlashtirardi.
  const ExcelJS = (await import('exceljs')).default;
  const kitob = new ExcelJS.Workbook();
  const v = kitob.addWorksheet('Прайс');

  const chegara = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  // Birinchi ustun logo bo'lsa kengaytiriladi (pastda), aks holda
  // tartib raqami uchun tor qoladi.
  v.columns = [
    { width: 5 }, { width: 46 }, { width: 12 }, { width: 13 },
    { width: 14 }, { width: 15 }, { width: 30 },
  ];

  // ---- firma nomi va logo ----
  // Logo bo'lsa: chapda rasm, o'ngda nom. Bo'lmasa nom butun kenglikni
  // egallaydi — bo'sh joy qolib, hujjat nosozdek ko'rinmasin.
  const logoBor = !!logo?.bayt;
  if (logoBor) {
    // Rasm A1:A2 kataklari ustiga qo'yiladi. ExcelJS rasmni katak
    // to'riga emas, ustiga joylaydi — shuning uchun qator balandligi
    // va ustun kengligi rasmga moslanadi, aks holda u kesilib qoladi.
    const rasmId = kitob.addImage({
      buffer: logo!.bayt as any,
      extension: logo!.kengaytma,
    });
    v.addImage(rasmId, {
      tl: { col: 0.15, row: 0.12 } as any,
      ext: { width: 88, height: 88 },
    });
    v.getColumn(1).width = 14;
  }

  v.mergeCells(logoBor ? 'B1:F1' : 'A1:F1');
  const b1 = v.getCell(logoBor ? 'B1' : 'A1');
  b1.value = firma;
  b1.font = { name: 'Arial', size: 22, bold: true, italic: true };
  b1.alignment = { horizontal: 'center', vertical: 'middle' };
  b1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };
  if (logoBor) {
    v.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };
    v.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };
  }
  // Logo bo'lsa qator balandroq: 88px rasm ikki qatorga bo'linadi
  v.getRow(1).height = logoBor ? 48 : 34;

  // ---- hujjat turi ----
  v.mergeCells(logoBor ? 'B2:F2' : 'A2:F2');
  const b2 = v.getCell(logoBor ? 'B2' : 'A2');
  b2.value = 'ПРАЙС ЛИСТ';
  b2.font = { name: 'Arial', size: 18, bold: true };
  b2.alignment = { horizontal: 'right', vertical: 'middle' };
  b2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };
  v.getRow(2).height = logoBor ? 40 : 26;

  // ---- sana va umumiy summa ----
  v.mergeCells('A3:E3');
  v.getCell('A3').value = 'Прайс-лист';
  v.mergeCells('A4:E4');
  v.getCell('A4').value = sanaYozuv(sana);
  v.mergeCells('F3:G3');
  v.getCell('F3').value = 'Общая сумма';
  v.mergeCells('F4:G4');

  for (const k of ['A3', 'A4', 'F3', 'F4']) {
    const c = v.getCell(k);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = chegara;
    c.font = { bold: true, italic: k.charAt(0) === 'F' };
  }

  // ---- ustun sarlavhalari ----
  const sarlavha = v.getRow(BOSH_QATOR);
  sarlavha.values = USTUNLAR;
  sarlavha.height = 30;
  sarlavha.eachCell((c, i) => {
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    // «Ваш заказ» sariq: mijoz aynan shu ustunga yozishi kerak
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 3 ? SARIQ : KULRANG } };
    c.border = chegara;
  });

  // ---- ma'lumot ----
  qatorlar.forEach((r, i) => {
    const n = BOSH_QATOR + 1 + i;
    const qator = v.getRow(n);
    qator.values = [
      i + 1,
      r.nomi ?? '',
      null, // Ваш заказ — mijoz to'ldiradi
      r.narx == null ? null : Number(r.narx),
      // Miqdor × narx. Mijoz miqdorni yozishi bilan summa o'zi
      // hisoblanadi — qo'lda ko'paytirish kerak emas.
      { formula: `IF(C${n}="","",C${n}*D${n})` },
      sanaFormat(r.yaroqlilik),
      r.ishlab_chiqaruvchi ?? '',
    ];
    qator.eachCell({ includeEmpty: true }, (c, idx) => {
      c.border = chegara;
      if (idx === 1 || idx === 6) c.alignment = { horizontal: 'center' };
      if (idx === 3) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SARIQ } };
      if (idx === 4 || idx === 5) c.numFmt = '#,##0';
    });
  });

  // Umumiy summa — «Сумма заказ» ustuni yig'indisi
  const oxirgi = BOSH_QATOR + qatorlar.length;
  const jami = v.getCell('F4');
  jami.value = { formula: `SUM(E${BOSH_QATOR + 1}:E${oxirgi})` };
  jami.numFmt = '#,##0';

  // Sarlavha doim ko'rinib tursin: 4 800 qatorli ro'yxatda pastga
  // tushganda qaysi ustun nima ekani bilinmay qolardi
  v.views = [{ state: 'frozen', ySplit: BOSH_QATOR }];

  return kitob.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
