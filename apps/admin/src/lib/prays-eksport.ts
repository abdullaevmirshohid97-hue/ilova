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
  // Ta'minotchining praysi kabi uch bo'lim. Bo'sh bo'lsa — asosiy
  // ro'yxat (eski chaqiruvlar shu sababdan buzilmaydi).
  bolim?: string | null;
  nomi: string | null;
  narx: number | string | null;
  yaroqlilik: string | null;
  ishlab_chiqaruvchi: string | null;
  // Aksiya bo'limi uchun
  aksiya?: string | null;
  aksiya_narx?: number | string | null;
  // Qo'shimchalar bo'limi uchun
  narx_real?: number | string | null;
  org_upk?: number | string | null;
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

// Pastki bo'limlar ta'minotchining faylidagi ustunlar bilan chiqadi.
// Ustun soni ATAYLAB asosiy jadval bilan bir xil (7) — aks holda
// ustun kengliklari siljib, jadvallar bir-biriga mos kelmasdi.
export const QOSHIMCHA_USTUNLAR = [
  '№',
  'Наименование товаров',
  'Цена СПЕЦ',
  'Цена Реал',
  'Орг. упк',
  'Производитель',
  'Срок годности',
];

export const AKSIYA_USTUNLAR = [
  '№',
  'Наименование товаров',
  'Акция',
  'Цена без акции',
  'Цена после акции',
  'Производитель',
  'Срок годности',
];

export const QOSHIMCHA_SARLAVHA = 'ҚЎШИМЧАЛАР';
export const AKSIYA_SARLAVHA = 'Внимание! Акции!!!';

const KOK = 'FFB8D9EC';
const KULRANG = 'FFD9D9D9';
const SARIQ = 'FFFFFF00';
const YASHIL = 'FFC6EFCE';

/** Sarlavha bloki necha qator egallaydi — ma'lumot shundan keyin boshlanadi */
export const BOSH_QATOR = 5;

/**
 * Oxirgi ustun harfi: 7 ustun -> 'G'.
 *
 * Avval sarlavha 'A1:F1' deb QO'LDA yozilgan edi. Jadval esa yetti
 * ustunli, ya'ni ko'k fon G ustuniga yetmay, sarlavhaning o'ng chekkasi
 * oq bo'lib qolardi. Endi ustun qo'shilsa qamrov o'zi kengayadi.
 */
function ustunHarfi(n: number): string {
  let s = '';
  let i = n;
  while (i > 0) {
    const q = (i - 1) % 26;
    s = String.fromCharCode(65 + q) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export async function praysKitobi(
  hammaQator: PraysQator[],
  firma: string,
  sana = new Date(),
  // Logo baytlari. Yo'q bo'lsa hujjat baribir chiqadi — brend belgisi
  // yo'qligi uchun prays yuborilmay qolmasin.
  logo?: { bayt: ArrayBuffer; kengaytma: 'png' | 'jpeg' } | null,
): Promise<ArrayBuffer> {
  // Bo'limlarga ajratamiz. Bo'lim ko'rsatilmagan qator — asosiy
  // ro'yxat, ya'ni eski chaqiruvlar avvalgidek ishlayveradi.
  const qatorlar = hammaQator.filter((r) => (r.bolim ?? 'asosiy') === 'asosiy');
  const qoshimchalar = hammaQator.filter((r) => r.bolim === 'qoshimcha');
  const aksiyalar = hammaQator.filter((r) => r.bolim === 'aksiya');

  // Faqat kerak bo'lganda yuklanadi: kutubxona ~900 KB, uni asosiy
  // paketga qo'shish har sahifa ochilishini sekinlashtirardi.
  const ExcelJS = (await import('exceljs')).default;
  const kitob = new ExcelJS.Workbook();
  const v = kitob.addWorksheet('Прайс');

  // Sarlavha butun jadval kengligini egallashi kerak
  const OXIRGI = ustunHarfi(USTUNLAR.length);

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

  v.mergeCells(logoBor ? `B1:${OXIRGI}1` : `A1:${OXIRGI}1`);
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
  v.mergeCells(logoBor ? `B2:${OXIRGI}2` : `A2:${OXIRGI}2`);
  const b2 = v.getCell(logoBor ? 'B2' : 'A2');
  b2.value = 'ПРАЙС ЛИСТ';
  b2.font = { name: 'Arial', size: 18, bold: true };
  b2.alignment = { horizontal: 'right', vertical: 'middle' };
  b2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KOK } };
  v.getRow(2).height = logoBor ? 40 : 26;

  // ---- sana va umumiy summa ----
  // Chap qism yorliq va sana, o'ng chekkadagi ikki ustun umumiy summa
  const SUMMA_BOSH = ustunHarfi(USTUNLAR.length - 1);
  const CHAP_OXIR = ustunHarfi(USTUNLAR.length - 2);
  v.mergeCells(`A3:${CHAP_OXIR}3`);
  v.getCell('A3').value = 'Прайс-лист';
  v.mergeCells(`A4:${CHAP_OXIR}4`);
  v.getCell('A4').value = sanaYozuv(sana);
  v.mergeCells(`${SUMMA_BOSH}3:${OXIRGI}3`);
  v.getCell(`${SUMMA_BOSH}3`).value = 'Общая сумма';
  v.mergeCells(`${SUMMA_BOSH}4:${OXIRGI}4`);

  for (const k of ['A3', 'A4', `${SUMMA_BOSH}3`, `${SUMMA_BOSH}4`]) {
    const c = v.getCell(k);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = chegara;
    c.font = { bold: true, italic: k.startsWith(SUMMA_BOSH) };
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
  const jami = v.getCell(`${SUMMA_BOSH}4`);
  jami.value = { formula: `SUM(E${BOSH_QATOR + 1}:E${oxirgi})` };
  jami.numFmt = '#,##0';

  // ---- pastki bo'limlar ----
  //
  // Ta'minotchining faylida asosiy ro'yxatdan keyin "ҚЎШИМЧАЛАР" va
  // "Внимание! Акции!!!" alohida jadval bo'lib turadi. Mijoz o'sha
  // tartibga o'rgangan, shuning uchun bizning prays ham shunday
  // chiqadi. Ustunlari ham o'sha faylnikidek — aksiya jadvalida
  // "Акция" ustuni (5+1) va ikkala narx bor.
  let qator = BOSH_QATOR + qatorlar.length + 1;

  function bolimChiz(
    nom: string,
    ustunlar: string[],
    satrlar: PraysQator[],
    qiymat: (r: PraysQator, i: number) => (string | number | null)[],
  ) {
    if (satrlar.length === 0) return;

    qator += 1; // bo'sh ajratuvchi qator

    v.mergeCells(`A${qator}:${OXIRGI}${qator}`);
    const s = v.getCell(`A${qator}`);
    s.value = nom;
    s.font = { name: 'Arial', size: 14, bold: true };
    s.alignment = { horizontal: 'center', vertical: 'middle' };
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YASHIL } };
    s.border = chegara;
    v.getRow(qator).height = 24;
    qator += 1;

    const sh = v.getRow(qator);
    sh.values = ustunlar;
    sh.height = 28;
    sh.eachCell((c) => {
      c.font = { bold: true, size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KULRANG } };
      c.border = chegara;
    });
    qator += 1;

    satrlar.forEach((r, i) => {
      const q = v.getRow(qator);
      q.values = qiymat(r, i);
      q.eachCell({ includeEmpty: true }, (c, idx) => {
        c.border = chegara;
        if (idx === 1) c.alignment = { horizontal: 'center' };
        if (idx >= 3 && idx <= 5) c.numFmt = '#,##0';
      });
      qator += 1;
    });
  }

  bolimChiz(QOSHIMCHA_SARLAVHA, QOSHIMCHA_USTUNLAR, qoshimchalar, (r, i) => [
    i + 1,
    r.nomi ?? '',
    r.narx == null ? null : Number(r.narx),
    r.narx_real == null ? null : Number(r.narx_real),
    r.org_upk == null ? null : Number(r.org_upk),
    r.ishlab_chiqaruvchi ?? '',
    sanaFormat(r.yaroqlilik),
  ]);

  bolimChiz(AKSIYA_SARLAVHA, AKSIYA_USTUNLAR, aksiyalar, (r, i) => [
    i + 1,
    r.nomi ?? '',
    // Aksiya sharti MATN bo'lib qoladi ("5+1"). Uni songa aylantirish
    // aynan robotdagi xato edi: songa("5+1") = 51.
    r.aksiya ?? '',
    r.narx == null ? null : Number(r.narx),
    r.aksiya_narx == null ? null : Number(r.aksiya_narx),
    r.ishlab_chiqaruvchi ?? '',
    sanaFormat(r.yaroqlilik),
  ]);

  // Sarlavha doim ko'rinib tursin: 4 800 qatorli ro'yxatda pastga
  // tushganda qaysi ustun nima ekani bilinmay qolardi
  v.views = [{ state: 'frozen', ySplit: BOSH_QATOR }];

  return kitob.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
