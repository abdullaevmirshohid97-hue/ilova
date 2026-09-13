// =============================================================
//  PUL — tiyin (butun son) bilan ishlash
//
//  Bazada summa `numeric(18,2)`, JS tomonida esa TIYIN (butun son).
//  Sabab: JS'da 0.1 + 0.2 = 0.30000000000000004. Pulda bu bir kun
//  "1 tiyin yetishmadi" bo'lib chiqadi va sabab topilmaydi.
//
//  Bu loyihada allaqachon bir marta kasr yo'qolgan: RPC ichidagi
//  o'zgaruvchi eski aniqlikda qolib, summa kesib tashlangan. Shuning
//  uchun o'girish FAQAT chegarada (bazaga yozish / bazadan o'qish)
//  bo'ladi, oradagi hisob butun sonda ketadi.
// =============================================================

/** Bazadan kelgan qiymat ("1234.56" yoki 1234.56) → tiyin (123456) */
export function tiyinga(qiymat: string | number | null | undefined): number {
  if (qiymat === null || qiymat === undefined || qiymat === '') return 0;
  const s = String(qiymat).trim().replace(',', '.');
  const manfiy = s.startsWith('-');
  const toza = manfiy ? s.slice(1) : s;
  const [butun, kasr = ''] = toza.split('.');
  // Kasrni 2 xonaga to'ldiramiz: "12.5" → 50 tiyin, "12.567" → 56 tiyin
  const ikki = (kasr + '00').slice(0, 2);
  const n = Number(butun || '0') * 100 + Number(ikki || '0');
  return manfiy ? -n : n;
}

/** Tiyin → bazaga yoziladigan matn ("123456" → "1234.56") */
export function bazaga(tiyin: number): string {
  const manfiy = tiyin < 0;
  const n = Math.abs(Math.round(tiyin));
  const s = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
  return manfiy ? '-' + s : s;
}

export type Valyuta = 'UZS' | 'USD' | 'EUR' | 'RUB';

// Belgi qayerda turishi va kasr qanday ajratilishi valyutaga bog'liq.
// Tartib `apps/mobile/src/lib/valyuta.ts` dagidek: "$1 650.00" va
// "3 960 so'm" — foydalanuvchi ikki ekranda ikki xil ko'rmasin.
const BELGI: Record<Valyuta, { belgi: string; oldinda: boolean; nuqta: boolean }> = {
  UZS: { belgi: "so'm", oldinda: false, nuqta: false },
  RUB: { belgi: '₽', oldinda: false, nuqta: false },
  USD: { belgi: '$', oldinda: true, nuqta: true },
  EUR: { belgi: '€', oldinda: true, nuqta: true },
};

/**
 * Tiyinni ekran uchun matnga o'giradi: 200000000 → "2 000 000 so'm"
 *
 * `Intl` ATAYLAB ishlatilmaydi. Telegram WebView'da u ikki marta
 * RangeError berib oq ekran qilgan — shuning uchun formatlash qo'lda.
 */
export function formatla(
  tiyin: number,
  valyuta: Valyuta = 'UZS',
  imkon: { belgisiz?: boolean; kasrsiz?: boolean } = {},
): string {
  const manfiy = tiyin < 0;
  const n = Math.abs(Math.round(tiyin));
  const butun = Math.floor(n / 100);
  const kasr = n % 100;

  // Uch xonadan ajratish — probel bilan (O'zbekistonda odat shunday)
  let s = '';
  const raqam = String(butun);
  for (let i = 0; i < raqam.length; i++) {
    if (i > 0 && (raqam.length - i) % 3 === 0) s += ' ';
    s += raqam[i];
  }

  // So'm va rublda tiyin deyarli ishlatilmaydi: 0 bo'lsa ko'rsatilmaydi.
  // Dollarda esa 0 bo'lsa ham ".00" qoladi — "$5" emas, "$5.00".
  const b = BELGI[valyuta];
  const kasrKerak = !imkon.kasrsiz && (kasr !== 0 || b.nuqta);
  if (kasrKerak) s += (b.nuqta ? '.' : ',') + String(kasr).padStart(2, '0');

  // Belgi qo'yilgandan KEYIN minus old tomonga chiqadi: "−$5.00",
  // "$−5.00" emas. U+2212 ishlatiladi (defis emas) — hisobotda
  // raqamlar bir tekis turadi.
  const bilan = imkon.belgisiz ? s : b.oldinda ? `${b.belgi}${s}` : `${s} ${b.belgi}`;
  return manfiy ? '−' + bilan : bilan;
}

/** Klaviaturadagi ifoda: "1200+300" → tiyin. Xato bo'lsa null. */
export function ifodaHisobla(matn: string): number | null {
  const toza = matn.replace(/\s| /g, '').replace(/,/g, '.');
  if (!toza) return null;
  // Faqat raqam va to'rt amal — `eval` ishlatilmaydi
  if (!/^[0-9.+\-*/()]+$/.test(toza)) return null;

  try {
    const qiymat = hisobla(toza);
    if (qiymat === null || !isFinite(qiymat)) return null;
    return Math.round(qiymat * 100);
  } catch {
    return null;
  }
}

// --- Sodda ifoda hisoblagichi (rekursiv tushish) ---
function hisobla(s: string): number | null {
  let i = 0;

  function ifoda(): number {
    let q = had();
    while (s[i] === '+' || s[i] === '-') {
      const amal = s[i++];
      const o = had();
      q = amal === '+' ? q + o : q - o;
    }
    return q;
  }
  function had(): number {
    let q = omil();
    while (s[i] === '*' || s[i] === '/') {
      const amal = s[i++];
      const o = omil();
      if (amal === '/' && o === 0) throw new Error('nolga bo‘linish');
      q = amal === '*' ? q * o : q / o;
    }
    return q;
  }
  function omil(): number {
    if (s[i] === '(') {
      i++;
      const q = ifoda();
      if (s[i] !== ')') throw new Error('qavs yopilmagan');
      i++;
      return q;
    }
    if (s[i] === '-') {
      i++;
      return -omil();
    }
    const bosh = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (i === bosh) throw new Error('raqam kutilgan');
    const n = Number(s.slice(bosh, i));
    if (Number.isNaN(n)) throw new Error('raqam emas');
    return n;
  }

  const natija = ifoda();
  if (i !== s.length) throw new Error('ortiqcha belgi');
  return natija;
}
