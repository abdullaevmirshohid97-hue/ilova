// =============================================================
//  XABAR TILI — ilova tilidan ALOHIDA
//
//  Ilova o'zbek va ruschada. Lekin MIJOZ boshqa tilda gaplashishi
//  mumkin: Toshkentdagi do'kondorning mijozi qozoq, qirg'iz yoki
//  turk bo'lishi odatiy hol, va unga o'zbekcha xabar yuborish
//  «o'zi tushunib olar» degan taxmin bo'lardi.
//
//  Shuning uchun xabar tili YUBORISH PAYTIDA tanlanadi va ilova
//  interfeysiga tegmaydi. Bu ataylab: butun ilovani sakkiz tilga
//  o'girish katta ish va uning yarmi hech qachon ishlatilmasdi —
//  xabar esa har kuni ketadi.
//
//  Lug'at ATAYLAB kichik: faqat xabarda uchraydigan so'zlar.
//  Yangi so'z qo'shilsa, u sakkiz tilda ham bo'lishi shart,
//  aks holda xabar yarim tilda chiqardi — sinov shuni talab
//  qiladi.
// =============================================================

export type XabarTil = 'uz' | 'ru' | 'en' | 'tg' | 'ky' | 'kk' | 'az' | 'tr';

export const XABAR_TILLAR: { kalit: XabarTil; nom: string }[] = [
  { kalit: 'uz', nom: "O'zbekcha" },
  { kalit: 'ru', nom: 'Русский' },
  { kalit: 'en', nom: 'English' },
  { kalit: 'tg', nom: 'Тоҷикӣ' },
  { kalit: 'ky', nom: 'Кыргызча' },
  { kalit: 'kk', nom: 'Қазақша' },
  { kalit: 'az', nom: 'Azərbaycanca' },
  { kalit: 'tr', nom: 'Türkçe' },
];

/** Kalit — o'zbekcha matnning O'ZI, ilova lug'atidagi kabi */
type Lugat = Record<string, string>;

const RU: Lugat = {
  'Tovar berdim': 'Отдал товар',
  'Tovar oldim': 'Взял товар',
  'Qarz berdim': 'Дал в долг',
  'Qarz oldim': 'Взял в долг',
  'Pul berdim': 'Отдал деньги',
  'Pul oldim': 'Получил деньги',
  Kirim: 'Приход',
  Chiqim: 'Расход',
  'Izoh:': 'Заметка:',
  'Summa:': 'Сумма:',
  'Kirim:': 'Приход:',
  'Muddat:': 'Срок:',
  'Umumiy qarz:': 'Общий долг:',
  'Sizga beramiz:': 'Мы должны вам:',
  'Muddati kelgan:': 'Просрочено:',
  dona: 'шт',
  kg: 'кг',
  metr: 'м',
  quti: 'кор.',
  litr: 'л',
};

const EN: Lugat = {
  'Tovar berdim': 'Goods given',
  'Tovar oldim': 'Goods received',
  'Qarz berdim': 'Lent',
  'Qarz oldim': 'Borrowed',
  'Pul berdim': 'Money given',
  'Pul oldim': 'Money received',
  Kirim: 'Income',
  Chiqim: 'Expense',
  'Izoh:': 'Note:',
  'Summa:': 'Amount:',
  'Kirim:': 'Paid:',
  'Muddat:': 'Due:',
  'Umumiy qarz:': 'Total debt:',
  'Sizga beramiz:': 'We owe you:',
  'Muddati kelgan:': 'Overdue:',
  dona: 'pcs',
  kg: 'kg',
  metr: 'm',
  quti: 'box',
  litr: 'l',
};

const TG: Lugat = {
  'Tovar berdim': 'Мол додам',
  'Tovar oldim': 'Мол гирифтам',
  'Qarz berdim': 'Қарз додам',
  'Qarz oldim': 'Қарз гирифтам',
  'Pul berdim': 'Пул додам',
  'Pul oldim': 'Пул гирифтам',
  Kirim: 'Даромад',
  Chiqim: 'Хароҷот',
  'Izoh:': 'Шарҳ:',
  'Summa:': 'Маблағ:',
  'Kirim:': 'Пардохт:',
  'Muddat:': 'Мӯҳлат:',
  'Umumiy qarz:': 'Қарзи умумӣ:',
  'Sizga beramiz:': 'Мо ба шумо қарздорем:',
  'Muddati kelgan:': 'Мӯҳлаташ гузашта:',
  dona: 'дона',
  kg: 'кг',
  metr: 'м',
  quti: 'қуттӣ',
  litr: 'л',
};

const KY: Lugat = {
  'Tovar berdim': 'Товар бердим',
  'Tovar oldim': 'Товар алдым',
  'Qarz berdim': 'Карызга бердим',
  'Qarz oldim': 'Карызга алдым',
  'Pul berdim': 'Акча бердим',
  'Pul oldim': 'Акча алдым',
  Kirim: 'Киреше',
  Chiqim: 'Чыгаша',
  'Izoh:': 'Эскертүү:',
  'Summa:': 'Сумма:',
  'Kirim:': 'Төлөм:',
  'Muddat:': 'Мөөнөт:',
  'Umumiy qarz:': 'Жалпы карыз:',
  'Sizga beramiz:': 'Биз сизге карызбыз:',
  'Muddati kelgan:': 'Мөөнөтү өткөн:',
  dona: 'даана',
  kg: 'кг',
  metr: 'м',
  quti: 'кор.',
  litr: 'л',
};

const KK: Lugat = {
  'Tovar berdim': 'Тауар бердім',
  'Tovar oldim': 'Тауар алдым',
  'Qarz berdim': 'Қарызға бердім',
  'Qarz oldim': 'Қарызға алдым',
  'Pul berdim': 'Ақша бердім',
  'Pul oldim': 'Ақша алдым',
  Kirim: 'Кіріс',
  Chiqim: 'Шығыс',
  'Izoh:': 'Ескертпе:',
  'Summa:': 'Сома:',
  'Kirim:': 'Төлем:',
  'Muddat:': 'Мерзім:',
  'Umumiy qarz:': 'Жалпы қарыз:',
  'Sizga beramiz:': 'Біз сізге қарызбыз:',
  'Muddati kelgan:': 'Мерзімі өткен:',
  dona: 'дана',
  kg: 'кг',
  metr: 'м',
  quti: 'қор.',
  litr: 'л',
};

const AZ: Lugat = {
  'Tovar berdim': 'Mal verdim',
  'Tovar oldim': 'Mal aldım',
  'Qarz berdim': 'Borc verdim',
  'Qarz oldim': 'Borc aldım',
  'Pul berdim': 'Pul verdim',
  'Pul oldim': 'Pul aldım',
  Kirim: 'Mədaxil',
  Chiqim: 'Məxaric',
  'Izoh:': 'Qeyd:',
  'Summa:': 'Məbləğ:',
  'Kirim:': 'Ödəniş:',
  'Muddat:': 'Müddət:',
  'Umumiy qarz:': 'Ümumi borc:',
  'Sizga beramiz:': 'Biz sizə borcluyuq:',
  'Muddati kelgan:': 'Vaxtı keçmiş:',
  dona: 'ədəd',
  kg: 'kq',
  metr: 'm',
  quti: 'qutu',
  litr: 'l',
};

const TR: Lugat = {
  'Tovar berdim': 'Mal verdim',
  'Tovar oldim': 'Mal aldım',
  'Qarz berdim': 'Borç verdim',
  'Qarz oldim': 'Borç aldım',
  'Pul berdim': 'Para verdim',
  'Pul oldim': 'Para aldım',
  Kirim: 'Gelir',
  Chiqim: 'Gider',
  'Izoh:': 'Not:',
  'Summa:': 'Tutar:',
  'Kirim:': 'Ödeme:',
  'Muddat:': 'Vade:',
  'Umumiy qarz:': 'Toplam borç:',
  'Sizga beramiz:': 'Size borçluyuz:',
  'Muddati kelgan:': 'Vadesi geçmiş:',
  dona: 'adet',
  kg: 'kg',
  metr: 'm',
  quti: 'kutu',
  litr: 'lt',
};

export const XABAR_LUGAT: Record<XabarTil, Lugat> = {
  // O'zbekcha — kalitning o'zi, shuning uchun bo'sh
  uz: {},
  ru: RU,
  en: EN,
  tg: TG,
  ky: KY,
  kk: KK,
  az: AZ,
  tr: TR,
};

/** Tarjima topilmasa O'ZBEKCHASI qoladi — matn yo'qolmaydi */
export function xtr(til: XabarTil, matn: string): string {
  return XABAR_LUGAT[til]?.[matn] ?? matn;
}
