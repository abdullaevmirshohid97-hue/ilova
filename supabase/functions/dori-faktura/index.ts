// Dori fakturasi — mijozga PDF va Excel qilib yuboradi.
//
// Chaqiriladi: telegram-dori boti ("Buyurtmalarim" tugmasi), sotuv
// ekrani, buyurtmalar ekrani va sklad kirimi.
//
// IKKI KO'RINISH — dori_settings.faktura_uslubi:
//   '1c'      buxgalteriya blanki: qora-oq, tepada bank rekvizitlari,
//             qalin ajratgich chiziq, summa yozuvda, imzo va M.O'.
//   'oracle'  korporativ hisobot: to'q sarlavha lentasi, zebra qatorlar,
//             o'ngda jami bloki, sahifa raqami.
//
// Ikkalasi ham TIK A4 da. Avval landshaft edi va faktura shu sababli
// g'alati ko'rinardi: hisob-faktura hamma joyda tik bo'ladi, jadval esa
// varaq o'rtasiga surilib, ikki yonida keng oq yo'l qolardi.
//
// Ustun kengligi endi NISBAT bilan beriladi va varaqqa moslanadi: avval
// piksel bilan yozilgan edi, ustun qo'shilsa jadval varaqdan chiqardi.
//
// KIRILL: pdf-lib'ning standart shriftlari (Helvetica) WinAnsi kodlashda —
// kirill umuman chiqmaydi, dori nomlari esa deyarli hammasi kirillcha.
// Shuning uchun DejaVuSans yuklab olinib joylanadi va sovuq startdan
// keyin xotirada qoladi. Yuklanmasa faktura bekor qilinmaydi — lotin
// yozuviga o'girilib chiqadi.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import ExcelJS from 'npm:exceljs@4.4.0';

const SHRIFT_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';
const SHRIFT_BOLD_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf';

let shriftKesh: { oddiy: Uint8Array; qalin: Uint8Array } | null = null;

async function shriftlarniOl() {
  if (shriftKesh) return shriftKesh;
  const [a, b] = await Promise.all([fetch(SHRIFT_URL), fetch(SHRIFT_BOLD_URL)]);
  if (!a.ok || !b.ok) throw new Error('SHRIFT_YUKLANMADI');
  shriftKesh = {
    oddiy: new Uint8Array(await a.arrayBuffer()),
    qalin: new Uint8Array(await b.arrayBuffer()),
  };
  return shriftKesh;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'i', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function lotinga(s: string): string {
  return String(s ?? '')
    // Tipografik belgilar avval "?" bo'lib qolardi. O'zbekcha o' va g'
    // deyarli har qatorda uchraydi — bu butun hujjatni buzardi.
    .replace(/[‘’ʻʼ]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .split('')
    .map((c) => {
      const past = c.toLowerCase();
      const t = TRANSLIT[past];
      if (t === undefined) return c;
      return c === past ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('')
    .replace(/[^\x20-\xFF]/g, '?');
}

function raqam(n: unknown): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 1 234 567,00 — buxgalteriya ko'rinishi, tiyinlari bilan */
function pul(n: unknown): string {
  const x = Number(n) || 0;
  const butun = Math.floor(Math.abs(x));
  const tiyin = Math.round((Math.abs(x) - butun) * 100);
  return (x < 0 ? '-' : '') + raqam(butun) + ',' + String(tiyin).padStart(2, '0');
}

function miqdor(n: unknown): string {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function sana(v: unknown): string {
  if (!v) return '—';
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU');
}

const OYLAR = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

/** "7 sentabr 2026 y." — blank sarlavhasidagi to'liq sana */
function sanaUzun(v: unknown): string {
  const d = v ? new Date(String(v)) : new Date();
  if (isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${OYLAR[d.getMonth()]} ${d.getFullYear()} y.`;
}

// ---------------------------------------------------------- summa yozuvda
// Buxgalteriya hujjatining majburiy qatori: raqamda bitta belgi
// o'zgartirilsa yozuv bilan mos kelmay qoladi va bu darrov bilinadi.
// 1C blankida bu qator aynan shuning uchun turadi.
const BIRLAR = ['', 'bir', 'ikki', 'uch', 'to‘rt', 'besh', 'olti', 'yetti', 'sakkiz', 'to‘qqiz'];
const ONLAR = ['', 'o‘n', 'yigirma', 'o‘ttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'to‘qson'];
const DARAJA = ['', 'ming', 'million', 'milliard', 'trillion'];

function uchXona(n: number): string {
  const p: string[] = [];
  const y = Math.floor(n / 100);
  const o = Math.floor((n % 100) / 10);
  const b = n % 10;
  if (y) p.push(BIRLAR[y], 'yuz');
  if (o) p.push(ONLAR[o]);
  if (b) p.push(BIRLAR[b]);
  return p.join(' ');
}

function sozBilan(n: number): string {
  let x = Math.floor(Math.abs(Number(n) || 0));
  if (x === 0) return 'Nol';
  const bolaklar: string[] = [];
  let d = 0;
  while (x > 0 && d < DARAJA.length) {
    const uch = x % 1000;
    if (uch) {
      // 1000 — "bir ming" emas, "ming": o'zbekchada birlik tushib qoladi
      const bosh = d === 1 && uch === 1 ? '' : uchXona(uch);
      bolaklar.unshift((bosh + ' ' + DARAJA[d]).trim());
    }
    x = Math.floor(x / 1000);
    d++;
  }
  const s = bolaklar.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Bir million ... so'm 00 tiyin" */
function summaYozuvda(n: number): string {
  const x = Number(n) || 0;
  const butun = Math.floor(x);
  const tiyin = Math.round((x - butun) * 100);
  return `${sozBilan(butun)} so‘m ${String(tiyin).padStart(2, '0')} tiyin`;
}

const HOLAT: Record<string, string> = {
  new: 'Yangi',
  confirmed: 'Qabul qilingan',
  done: 'Yopilgan',
  cancelled: 'Bekor qilingan',
};

// ---------------------------------------------------------------- ustunlar
// Kenglik NISBAT bilan (ulush): jadval varaq kengligiga moslanadi, ustun
// qo'shilsa yoki tushib qolsa ham chetdan chiqmaydi.
type Ustun = { kalit: string; nom: string; ulush: number; tik: 'chap' | 'ong' | 'mkz' };

const U_NOMER: Ustun = { kalit: 'n', nom: '№', ulush: 5, tik: 'mkz' };
const U_NOM: Ustun = { kalit: 'name', nom: 'Nomi', ulush: 31, tik: 'chap' };
const U_ISHLAB: Ustun = { kalit: 'manuf', nom: 'Ishlab chiqaruvchi', ulush: 19, tik: 'chap' };
const U_SERIYA: Ustun = { kalit: 'ser', nom: 'Seriya', ulush: 9, tik: 'mkz' };
const U_MADE: Ustun = { kalit: 'made', nom: 'Ishlab chiq.', ulush: 10, tik: 'mkz' };
const U_EXP: Ustun = { kalit: 'exp', nom: 'Yaroqlilik', ulush: 10, tik: 'mkz' };
const U_SONI: Ustun = { kalit: 'qty', nom: 'Soni', ulush: 6, tik: 'ong' };
const U_NARX: Ustun = { kalit: 'price', nom: 'Narxi', ulush: 11, tik: 'ong' };
const U_SUMMA: Ustun = { kalit: 'sum', nom: 'Summasi', ulush: 13, tik: 'ong' };
const U_SKLAD: Ustun = { kalit: 'sklad', nom: 'Sklad', ulush: 16, tik: 'chap' };
const U_BIRLIK: Ustun = { kalit: 'birlik', nom: 'Birlik', ulush: 8, tik: 'mkz' };

/**
 * Ustunlar hujjat turiga VA ma'lumotga qarab tanlanadi.
 *
 * "Ishlab chiqarilgan sana" sotuv fakturasida hech qachon to'ldirilmaydi
 * — butun ustun "—" bo'lib turardi va tik varaqda joy yeb, dori nomini
 * siqib qo'yardi. Endi qiymati bor bo'lsagina chiqadi.
 *
 * Yig'ish varaqasida NARX YO'Q: sklad bizning ustamamizni ko'rmasligi
 * kerak, omborchiga esa u umuman kerak emas — o'rniga QAYSI SKLAD.
 */
function ustunlarniTanla(inv: any): Ustun[] {
  const items: any[] = inv?.items ?? [];
  const madeBor = items.some((i) => i?.made_at);
  const seriyaBor = items.some((i) => i?.series);
  const ishlabBor = items.some((i) => i?.manufacturer);

  const u: Ustun[] = [U_NOMER, U_NOM];
  if (ishlabBor) u.push(U_ISHLAB);
  if (seriyaBor) u.push(U_SERIYA);
  if (madeBor) u.push(U_MADE);
  u.push(U_EXP);

  if (inv?.ustunlar === 'yigish') {
    u.push({ ...U_SONI, nom: 'Dona' }, U_SKLAD);
  } else {
    u.push(U_SONI);
    // «Birlik» ustuni faqat kerak bo'lganda: hamma qator pachkada
    // bo'lsa u butun ro'yxat bo'yicha bir xil so'zni takrorlab,
    // dori nomiga joy qoldirmasdi.
    if (items.some((i) => i?.birlik === 'dona')) u.push(U_BIRLIK);
    u.push(U_NARX, U_SUMMA);
  }
  return u;
}

/** Ulushlarni haqiqiy kenglikka aylantiradi */
function kengliklar(ustun: Ustun[], en: number): number[] {
  const jami = ustun.reduce((a, u) => a + u.ulush, 0);
  return ustun.map((u) => (u.ulush / jami) * en);
}

/** Qator qiymatlari — ikkala ko'rinish uchun bir xil */
function qatorQiymati(it: any, i: number): Record<string, string> {
  return {
    n: String(i + 1),
    name: String(it?.name ?? ''),
    manuf: String(it?.manufacturer ?? '—'),
    ser: it?.series ? String(it.series) : '—',
    made: it?.made_at ? sana(it.made_at) : '—',
    exp: it?.expiry ? sana(it.expiry) : '—',
    qty: miqdor(it?.qty),
    birlik: it?.birlik === 'dona' ? 'dona' : 'pachka',
    price: pul(it?.price),
    sum: pul(it?.sum),
    sklad: it?.sklad ? String(it.sklad) : '—',
  };
}

// ------------------------------------------------------------ shrift/matn
async function shriftlarniJoyla(doc: any) {
  try {
    doc.registerFontkit(fontkit);
    const sh = await shriftlarniOl();
    return {
      font: await doc.embedFont(sh.oddiy, { subset: true }),
      bold: await doc.embedFont(sh.qalin, { subset: true }),
      kirill: true,
    };
  } catch {
    return {
      font: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      kirill: false,
    };
  }
}

/**
 * Matnni ustun kengligiga bo'ladi.
 *
 * Uzun BITTA so'z ham bo'linadi: dori nomlarida qavs ichidagi kod va
 * chiziqchali birikmalar uchraydi, ular avval ustundan chiqib, qo'shni
 * ustun matnining ustiga yozilardi.
 *
 * Kirilldan lotinga o'girish BU YERDA emas, chaqiruvchida bo'lishi
 * kerak: kenglik o'lchovi aynan chiziladigan matnniki bo'lsin.
 */
function bol(matn: string, en: number, size: number, f: any, maxQator = 3): string[] {
  const s = String(matn ?? '').trim();
  if (!s) return [''];
  if (f.widthOfTextAtSize(s, size) <= en) return [s];

  const qatorlar: string[] = [];
  let joriy = '';
  const yop = () => {
    if (joriy) {
      qatorlar.push(joriy);
      joriy = '';
    }
  };

  for (const soz of s.split(/\s+/)) {
    let w = soz;
    while (f.widthOfTextAtSize(w, size) > en && qatorlar.length < maxQator) {
      let k = 1;
      while (k < w.length && f.widthOfTextAtSize(w.slice(0, k + 1), size) <= en) k++;
      yop();
      qatorlar.push(w.slice(0, k));
      w = w.slice(k);
    }
    if (qatorlar.length >= maxQator) break;
    const sinov = joriy ? joriy + ' ' + w : w;
    if (f.widthOfTextAtSize(sinov, size) <= en) joriy = sinov;
    else {
      yop();
      joriy = w;
    }
    if (qatorlar.length >= maxQator) break;
  }
  yop();

  if (qatorlar.length > maxQator) {
    const oxirgi = qatorlar[maxQator - 1];
    qatorlar.length = maxQator;
    qatorlar[maxQator - 1] = oxirgi.slice(0, Math.max(0, oxirgi.length - 3)) + '...';
  }
  return qatorlar;
}

// A4 tik
const EN = 595.28;
const BO = 841.89;

/** Logoni PDF ichiga joylaydi (PNG yoki JPEG) */
async function logoniJoyla(doc: any, logo: { bayt: Uint8Array; png: boolean } | null) {
  if (!logo) return null;
  try {
    return logo.png ? await doc.embedPng(logo.bayt) : await doc.embedJpg(logo.bayt);
  } catch {
    return null; // buzuq rasm butun fakturani to'xtatmasin
  }
}

/** Har sahifaning pastiga "1 / 3" — ko'p varaqli faktura aralashib ketmasin */
function sahifaRaqamlari(doc: any, font: any, T: (s: unknown) => string, rang: any) {
  const sahifalar = doc.getPages();
  sahifalar.forEach((p: any, i: number) => {
    const t = T(`${i + 1} / ${sahifalar.length}`);
    const w = font.widthOfTextAtSize(t, 7.5);
    p.drawText(t, { x: EN - 36 - w, y: 22, size: 7.5, font, color: rang });
  });
}

// ============================================================================
// KO'RINISH 1 — «1C» buxgalteriya blanki
//
// Qora-oq, rangsiz: hujjat faksda ham, oq-qora printerda ham bir xil
// o'qiladi. Yuqorida bank rekvizitlari katagi, keyin qalin ajratgich
// chiziq — 1C blankining eng tanish belgisi.
// ============================================================================
async function pdf1C(inv: any, firma: any, logo: any): Promise<{ bayt: Uint8Array; kirill: boolean }> {
  const doc = await PDFDocument.create();
  const { font, bold, kirill } = await shriftlarniJoyla(doc);
  const T = (s: unknown) => (kirill ? String(s ?? '') : lotinga(String(s ?? '')));
  const rasm = await logoniJoyla(doc, logo);

  const M = 36;
  const ICH = EN - M * 2;
  const PAST = 44;
  const qora = rgb(0, 0, 0);
  const kul = rgb(0.35, 0.35, 0.35);
  const ochKul = rgb(0.93, 0.93, 0.93);

  const ustun = ustunlarniTanla(inv);
  const w = kengliklar(ustun, ICH);
  const x: number[] = [];
  let acc = M;
  for (const kk of w) {
    x.push(acc);
    acc += kk;
  }
  const oxirX = M + ICH;

  let page = doc.addPage([EN, BO]);
  let y = 0;
  let jadvalBoshi = 0;

  const yoz = (s: unknown, xx: number, yy: number, size = 8.5, f = font, color = qora) =>
    page.drawText(T(s), { x: xx, y: yy, size, font: f, color });

  const yozOng = (s: unknown, ongX: number, yy: number, size = 8.5, f = font, color = qora) => {
    const t = T(s);
    page.drawText(t, { x: ongX - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  };

  const yozMkz = (s: unknown, chapX: number, en: number, yy: number, size = 8.5, f = font, color = qora) => {
    const t = T(s);
    page.drawText(t, { x: chapX + (en - f.widthOfTextAtSize(t, size)) / 2, y: yy, size, font: f, color });
  };

  const chiziq = (x1: number, y1: number, x2: number, y2: number, qalinlik = 0.5, color = qora) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: qalinlik, color });

  const quti = (xx: number, yy: number, en: number, bal: number, qalinlik = 0.5) =>
    page.drawRectangle({ x: xx, y: yy, width: en, height: bal, borderColor: qora, borderWidth: qalinlik });

  // ---------- bank rekvizitlari katagi ----------
  // 1C blankida u eng tepada turadi. Rekvizit umuman kiritilmagan bo'lsa
  // bo'sh katak chizmaymiz — hujjat "to'ldirilmagan" bo'lib ko'rinmasin.
  function rekvizitKatagi() {
    const bor = firma.bank_nomi || firma.hisob_raqam || firma.mfo || firma.stir;
    if (!bor) return;

    const chapEn = ICH * 0.6;
    const yorliqEn = 62;
    const r1 = 34; // bank nomi + MFO
    const r2 = 22; // hisob raqami
    const r3 = 20; // STIR va oluvchi
    const jamiBal = r1 + r2 + r3;
    const tepa = y;

    quti(M, tepa - jamiBal, ICH, jamiBal, 0.7);

    // tik ajratgichlar
    chiziq(M + chapEn, tepa - r1 - r2, M + chapEn, tepa);
    chiziq(M + chapEn + yorliqEn, tepa - r1 - r2, M + chapEn + yorliqEn, tepa);
    // gorizontal ajratgichlar
    chiziq(M + chapEn, tepa - r1, oxirX, tepa - r1);
    chiziq(M, tepa - r1 - r2, oxirX, tepa - r1 - r2);

    yoz('Oluvchi banki', M + 5, tepa - 10, 6.5, font, kul);
    bol(T(firma.bank_nomi ?? '—'), chapEn - 12, 8.5, bold, 1).forEach((q) =>
      page.drawText(q, { x: M + 5, y: tepa - 24, size: 8.5, font: bold, color: qora }),
    );

    yoz('MFO', M + chapEn + 5, tepa - 21, 7.5, font, kul);
    yoz(firma.mfo ?? '—', M + chapEn + yorliqEn + 5, tepa - 21, 9, bold);

    yoz('Hisob №', M + chapEn + 5, tepa - r1 - 14, 7.5, font, kul);
    yoz(firma.hisob_raqam ?? '—', M + chapEn + yorliqEn + 5, tepa - r1 - 14, 9, bold);

    const uchY = tepa - r1 - r2;
    chiziq(M + chapEn * 0.5, uchY - r3, M + chapEn * 0.5, uchY);
    yoz(`STIR: ${firma.stir ?? '—'}`, M + 5, uchY - 13, 8);
    yoz('Oluvchi:', M + chapEn * 0.5 + 5, uchY - 13, 7.5, font, kul);
    yoz(firma.nom, M + chapEn * 0.5 + 42, uchY - 13, 8.5, bold);

    y = tepa - jamiBal - 16;
  }

  // ---------- sarlavha ----------
  function sarlavhaBloki() {
    if (rasm) {
      const { width: iw, height: ih } = rasm.size();
      const k = Math.min(52 / iw, 34 / ih);
      page.drawImage(rasm, { x: M, y: y - ih * k + 2, width: iw * k, height: ih * k });
    }
    const chapX = rasm ? M + 60 : M;

    const nomi = String(inv.sarlavha ?? 'FAKTURA');
    yoz(`${nomi} № ${inv.faktura_no ?? inv.order_no}`, chapX, y - 13, 15, bold);
    yoz(sanaUzun(inv.created_at), chapX, y - 26, 9.5, font, kul);
    yozOng(HOLAT[inv.status] ?? inv.status ?? '', oxirX, y - 13, 9, bold);
    // Tahrirlangan hujjat shundayligini AYTADI: mijozdagi oldingi
    // nusxa bilan bu nusxa farq qiladi va buni yashirish mumkin emas
    if (Number(inv.tahrirlar) > 0) {
      yozOng(`Tuzatilgan (${inv.tahrirlar})`, oxirX, y - 25, 7.5, font, kul);
    }
    y -= 34;

    // 1C blankining eng tanish belgisi — qalin ajratgich
    page.drawRectangle({ x: M, y: y - 3, width: ICH, height: 2.6, color: qora });
    y -= 16;
  }

  // ---------- taraflar ----------
  function taraflar() {
    const yozTaraf = (yorliq: string, matn: string) => {
      yoz(yorliq, M, y, 8, bold);
      const bosh = M + 92;
      bol(T(matn), oxirX - bosh, 8.5, font, 2).forEach((q, j) =>
        page.drawText(q, { x: bosh, y: y - j * 11, size: 8.5, font, color: qora }),
      );
      const n = Math.min(2, bol(T(matn), oxirX - bosh, 8.5, font, 2).length);
      chiziq(bosh, y - (n - 1) * 11 - 3, oxirX, y - (n - 1) * 11 - 3, 0.4, kul);
      y -= n * 11 + 8;
    };

    const yetkazib = [
      firma.nom,
      firma.stir ? `STIR ${firma.stir}` : null,
      firma.manzil,
      firma.telefon ? `tel. ${firma.telefon}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const xaridor = [
      inv.customer?.name ?? '—',
      inv.customer?.pharmacy,
      inv.customer?.phone && inv.customer.phone !== '—' ? `tel. ${inv.customer.phone}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    yozTaraf('Yetkazib beruvchi:', yetkazib);
    yozTaraf(String(inv.taraf_nom ?? 'Xaridor:').replace(/:?$/, ':'), xaridor);
    yozTaraf('Asos:', inv.comment ? String(inv.comment) : 'Hisob-faktura bo‘yicha yetkazib berish');
    y -= 2;
  }

  // ---------- jadval sarlavhasi ----------
  function jadvalSarlavha() {
    const bal = 26;
    page.drawRectangle({ x: M, y: y - bal, width: ICH, height: bal, color: ochKul });
    ustun.forEach((u, i) => {
      const qatorlar = bol(T(u.nom), w[i] - 6, 7.5, bold, 2);
      qatorlar.forEach((q, j) => {
        const yy = y - 11 - j * 8.5 + (qatorlar.length === 1 ? -3 : 0);
        if (u.tik === 'ong') {
          page.drawText(q, { x: x[i] + w[i] - 4 - bold.widthOfTextAtSize(q, 7.5), y: yy, size: 7.5, font: bold, color: qora });
        } else if (u.tik === 'mkz') {
          page.drawText(q, { x: x[i] + (w[i] - bold.widthOfTextAtSize(q, 7.5)) / 2, y: yy, size: 7.5, font: bold, color: qora });
        } else {
          page.drawText(q, { x: x[i] + 4, y: yy, size: 7.5, font: bold, color: qora });
        }
      });
    });
    jadvalBoshi = y;
    y -= bal;
  }

  /** Tik chiziqlar oxirida bir marta chiziladi — sahifa bo'yi ma'lum bo'lgach */
  function tikChiziqlar(pastY: number) {
    for (let i = 0; i <= ustun.length; i++) {
      const xx = i === ustun.length ? oxirX : x[i];
      chiziq(xx, jadvalBoshi, xx, pastY);
    }
    chiziq(M, jadvalBoshi, oxirX, jadvalBoshi, 0.7);
  }

  /** Jadvalsiz davom varaqasi — jami yoki imzo uchun joy qolmaganda */
  function yangiVaraq() {
    page = doc.addPage([EN, BO]);
    y = BO - 40;
    yoz(`${inv.sarlavha ?? 'FAKTURA'} № ${inv.faktura_no ?? inv.order_no} — davomi`, M, y, 9, bold);
    y -= 24;
  }

  function yangiSahifa() {
    tikChiziqlar(y);
    page = doc.addPage([EN, BO]);
    y = BO - 40;
    yoz(`${inv.sarlavha ?? 'FAKTURA'} № ${inv.faktura_no ?? inv.order_no} — davomi`, M, y, 9, bold);
    y -= 14;
    jadvalSarlavha();
  }

  y = BO - 32;
  rekvizitKatagi();
  sarlavhaBloki();
  taraflar();
  jadvalSarlavha();

  const items: any[] = inv.items ?? [];
  for (const [i, it] of items.entries()) {
    const q = qatorQiymati(it, i);
    const nomIdx = ustun.findIndex((u) => u.kalit === 'name');
    const ishIdx = ustun.findIndex((u) => u.kalit === 'manuf');
    const nomQ = bol(T(q.name), w[nomIdx] - 8, 8, font, 3);
    const ishQ = ishIdx >= 0 ? bol(T(q.manuf), w[ishIdx] - 8, 8, font, 2) : [''];
    const qatorSoni = Math.max(nomQ.length, ishQ.length);
    const bal = 7 + qatorSoni * 9.8;

    if (y - bal < PAST + 26) yangiSahifa();

    const yuqori = y;
    ustun.forEach((u, ci) => {
      if (u.kalit === 'name' || u.kalit === 'manuf') {
        const qatorlar = u.kalit === 'name' ? nomQ : ishQ;
        qatorlar.forEach((s, j) =>
          page.drawText(s, { x: x[ci] + 4, y: yuqori - 11 - j * 9.8, size: 8, font, color: qora }),
        );
      } else {
        const s = q[u.kalit] ?? '';
        const f = u.kalit === 'sum' ? bold : font;
        if (u.tik === 'ong') yozOng(s, x[ci] + w[ci] - 4, yuqori - 11, 8, f);
        else if (u.tik === 'mkz') yozMkz(s, x[ci], w[ci], yuqori - 11, 8, f);
        else yoz(s, x[ci] + 4, yuqori - 11, 8, f);
      }
    });

    y = yuqori - bal;
    chiziq(M, y, oxirX, y);
  }

  tikChiziqlar(y);

  // ---------- jami ----------
  const jamiSumma = Number(inv.total) || 0;
  const qqsFoiz = Number(firma.qqs_foiz) || 0;
  // QQS narxga KIRGAN: O'zbekistonda ulgurji narx shunday e'lon
  // qilinadi, ya'ni jami summaga ustiga qo'shilmaydi, ichidan ajratiladi.
  const qqs = qqsFoiz > 0 ? jamiSumma - jamiSumma / (1 + qqsFoiz / 100) : 0;
  const narxli = inv?.ustunlar !== 'yigish';

  if (narxli) {
    if (y - 92 < PAST) yangiVaraq();
    y -= 8;
    // Yorliq qiymatning KENGLIGIGA qarab suriladi. Qat'iy joy berilganda
    // katta summa ("3 651 000,00 so'm") yorliq ustiga chiqib ketardi.
    const yozJami = (yorliq: string, qiymat: string, katta = false) => {
      const olcham = katta ? 11 : 9;
      const en = bold.widthOfTextAtSize(T(qiymat), olcham);
      yozOng(yorliq, oxirX - 2 - en - 14, y, katta ? 10 : 8.5, katta ? bold : font);
      yozOng(qiymat, oxirX - 2, y, olcham, bold);
      y -= katta ? 17 : 13;
    };
    yozJami('Jami:', `${pul(jamiSumma)}`);
    yozJami(
      qqsFoiz > 0 ? `Shu jumladan QQS (${qqsFoiz}%):` : 'QQS solinmaydi:',
      qqsFoiz > 0 ? pul(qqs) : '—',
    );
    chiziq(oxirX - 210, y + 8, oxirX, y + 8);
    y -= 2;
    yozJami('Jami to‘lovga:', `${pul(jamiSumma)} so‘m`, true);

    y -= 4;
    yoz(
      `Jami nomlar soni ${items.length}, summasi ${pul(jamiSumma)} so‘m`,
      M,
      y,
      8.5,
      bold,
    );
    y -= 15;
    const yozuv = summaYozuvda(jamiSumma);
    yoz('Summa yozuvda:', M, y, 8, font, kul);
    bol(T(yozuv), ICH - 78, 8.5, bold, 2).forEach((q, j) =>
      page.drawText(q, { x: M + 76, y: y - j * 11, size: 8.5, font: bold, color: qora }),
    );
    const n = bol(T(yozuv), ICH - 78, 8.5, bold, 2).length;
    y -= (n - 1) * 11 + 5;
    chiziq(M, y, oxirX, y, 0.4, kul);
    y -= 16;
  } else {
    y -= 12;
    yoz(`Jami nomlar soni ${items.length}`, M, y, 8.5, bold);
    y -= 16;
  }

  // ---------- imzo ----------
  if (y < PAST + 64) yangiVaraq();
  page.drawRectangle({ x: M, y: y - 3, width: ICH, height: 1.6, color: qora });
  y -= 26;

  const imzoEn = (ICH - 40) / 2;
  const imzoQator = (yorliq: string, ism: string | null, xx: number) => {
    yoz(yorliq, xx, y, 8.5, font, kul);
    const chiziqBosh = xx + 76;
    chiziq(chiziqBosh, y - 2, xx + imzoEn, y - 2, 0.5);
    if (ism) yozMkz(ism, chiziqBosh, xx + imzoEn - chiziqBosh, y - 12, 7.5, font, kul);
  };
  imzoQator('Rahbar', firma.rahbar ?? null, M);
  imzoQator('Bosh hisobchi', firma.hisobchi ?? null, M + imzoEn + 40);
  y -= 30;
  yoz('M.O‘.', M, y, 8, font, kul);
  yoz('Qabul qildi:', M + imzoEn + 40, y, 8.5, font, kul);
  chiziq(M + imzoEn + 40 + 76, y - 2, M + ICH, y - 2, 0.5);

  sahifaRaqamlari(doc, font, T, kul);
  return { bayt: await doc.save(), kirill };
}

// ============================================================================
// KO'RINISH 2 — «Oracle» korporativ hisobot
//
// To'q sarlavha lentasi, zebra qatorlar, o'ngda jami bloki. Tik
// chiziqlar YO'Q: faqat gorizontal ingichka ajratgichlar — ko'p qatorli
// ro'yxat shunda tinchroq o'qiladi.
// ============================================================================
async function pdfOracle(inv: any, firma: any, logo: any): Promise<{ bayt: Uint8Array; kirill: boolean }> {
  const doc = await PDFDocument.create();
  const { font, bold, kirill } = await shriftlarniJoyla(doc);
  const T = (s: unknown) => (kirill ? String(s ?? '') : lotinga(String(s ?? '')));
  const rasm = await logoniJoyla(doc, logo);

  const M = 38;
  const ICH = EN - M * 2;
  const PAST = 46;

  const qora = rgb(0.11, 0.13, 0.15);
  const toq = rgb(0.184, 0.231, 0.259);   // jadval lentasi
  const qizil = rgb(0.78, 0.275, 0.204);  // urg'u
  const kul = rgb(0.45, 0.48, 0.5);
  const ochKul = rgb(0.85, 0.87, 0.88);
  const zebra = rgb(0.969, 0.973, 0.976);
  const panel = rgb(0.949, 0.957, 0.961);
  const oq = rgb(1, 1, 1);

  const ustun = ustunlarniTanla(inv);
  const w = kengliklar(ustun, ICH);
  const x: number[] = [];
  let acc = M;
  for (const kk of w) {
    x.push(acc);
    acc += kk;
  }
  const oxirX = M + ICH;

  let page = doc.addPage([EN, BO]);
  let y = 0;

  const yoz = (s: unknown, xx: number, yy: number, size = 8.5, f = font, color = qora) =>
    page.drawText(T(s), { x: xx, y: yy, size, font: f, color });

  const yozOng = (s: unknown, ongX: number, yy: number, size = 8.5, f = font, color = qora) => {
    const t = T(s);
    page.drawText(t, { x: ongX - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  };

  const yozMkz = (s: unknown, chapX: number, en: number, yy: number, size = 8.5, f = font, color = qora) => {
    const t = T(s);
    page.drawText(t, { x: chapX + (en - f.widthOfTextAtSize(t, size)) / 2, y: yy, size, font: f, color });
  };

  const chiziq = (x1: number, yy: number, x2: number, qalinlik = 0.5, color = ochKul) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: qalinlik, color });

  // ---------- to'liq sarlavha ----------
  function sarlavhaBloki() {
    // Varaq chetidagi urg'u lentasi — brend rangi bir joyda, ko'zni
    // charchatmasin
    page.drawRectangle({ x: 0, y: BO - 6, width: EN, height: 6, color: qizil });

    y = BO - 34;
    let chapX = M;
    if (rasm) {
      const { width: iw, height: ih } = rasm.size();
      const k = Math.min(46 / iw, 40 / ih);
      page.drawImage(rasm, { x: M, y: y - ih * k + 6, width: iw * k, height: ih * k });
      chapX = M + iw * k + 12;
    }

    // O'ngdagi katta so'z belgisi AVVAL o'lchanadi: chap tomondagi nom va
    // rekvizit shundan qolgan joyga sig'dirilishi kerak. Aks holda uzun
    // sarlavha ("YIG'ISH VARAQASI") rekvizit qatorining ustiga chiqardi.
    const soz = String(inv.sarlavha ?? 'FAKTURA').toUpperCase();
    let sozOlcham = 21;
    while (sozOlcham > 12 && bold.widthOfTextAtSize(T(soz), sozOlcham) > ICH * 0.46) sozOlcham -= 0.5;
    const sozEn = bold.widthOfTextAtSize(T(soz), sozOlcham);
    yozOng(soz, oxirX, y - 12, sozOlcham, bold, rgb(0.76, 0.79, 0.81));

    const chapEn = oxirX - sozEn - 16 - chapX;
    yoz(bol(T(firma.nom), chapEn, 13.5, bold, 1)[0], chapX, y - 6, 13.5, bold);
    const rek = [firma.manzil, firma.telefon, firma.stir ? `STIR ${firma.stir}` : null]
      .filter(Boolean)
      .join('  ·  ');
    if (rek) {
      bol(T(rek), chapEn, 7.5, font, 2).forEach((q, j) =>
        page.drawText(q, { x: chapX, y: y - 19 - j * 9.5, size: 7.5, font, color: kul }),
      );
    }

    y -= 44;

    // ---------- ma'lumot to'ri ----------
    // To'rt katak: har birining tepasida ingichka chiziq, ostida kichik
    // yorliq va qalin qiymat. Jadvalsiz ham tartib ko'rinib turadi.
    const kataklar: [string, string][] = [
      ['FAKTURA RAQAMI', `№ ${inv.faktura_no ?? inv.order_no}`],
      ['SANA', sana(inv.created_at)],
      [
        Number(inv.tahrirlar) > 0 ? `HOLAT · TUZATILGAN (${inv.tahrirlar})` : 'HOLAT',
        HOLAT[inv.status] ?? String(inv.status ?? '—'),
      ],
      [
        inv?.ustunlar === 'yigish' ? 'POZITSIYA' : 'JAMI SUMMA',
        inv?.ustunlar === 'yigish'
          ? String((inv.items ?? []).length)
          : `${raqam(inv.total)} so‘m`,
      ],
    ];
    const katakEn = ICH / kataklar.length;
    kataklar.forEach(([yorliq, qiymat], i) => {
      const xx = M + i * katakEn;
      page.drawLine({
        start: { x: xx, y },
        end: { x: xx + katakEn - 10, y },
        thickness: 1.2,
        color: i === kataklar.length - 1 ? qizil : ochKul,
      });
      yoz(yorliq, xx, y - 11, 6.5, font, kul);
      yoz(qiymat, xx, y - 24, 10.5, bold);
    });
    y -= 40;

    // ---------- taraflar paneli ----------
    const panelEn = (ICH - 12) / 2;

    const sotuvchi = [
      firma.nom,
      firma.manzil,
      [firma.telefon, firma.stir ? `STIR ${firma.stir}` : null].filter(Boolean).join('  ·  ') || null,
    ].filter(Boolean) as string[];
    const xaridor = [
      inv.customer?.name ?? '—',
      inv.customer?.pharmacy ?? null,
      inv.customer?.phone && inv.customer.phone !== '—' ? inv.customer.phone : null,
    ].filter(Boolean) as string[];

    // Balandlik mazmunga qarab: rekvizit hali kiritilmagan bo'lsa
    // panelning yarmi bo'sh kulrang maydon bo'lib turardi. Ikkalasi bir
    // xil balandlikda bo'lishi kerak, shuning uchun kattasi olinadi.
    const panelBal = 34 + Math.max(sotuvchi.length, xaridor.length, 1) * 10;

    const taraf = (xx: number, yorliq: string, bor: string[]) => {
      page.drawRectangle({ x: xx, y: y - panelBal, width: panelEn, height: panelBal, color: panel });
      yoz(yorliq, xx + 10, y - 14, 6.5, font, kul);
      yoz(bol(T(bor[0] ?? '—'), panelEn - 20, 10, bold, 1)[0], xx + 10, y - 28, 10, bold);
      bor.slice(1).forEach((s, j) => {
        const q = bol(T(s), panelEn - 20, 7.5, font, 1)[0];
        page.drawText(q, { x: xx + 10, y: y - 40 - j * 10, size: 7.5, font, color: kul });
      });
    };

    taraf(M, 'SOTUVCHI', sotuvchi);
    taraf(M + panelEn + 12, String(inv.taraf_nom ?? 'XARIDOR').replace(/:$/, '').toUpperCase(), xaridor);
    y -= panelBal + 22;

    if (inv.comment) {
      yoz('Izoh:', M, y, 7.5, font, kul);
      bol(T(String(inv.comment)), ICH - 34, 8, font, 1).forEach((q) =>
        page.drawText(q, { x: M + 30, y, size: 8, font, color: qora }),
      );
      y -= 16;
    }
  }

  function qisqaSarlavha() {
    page.drawRectangle({ x: 0, y: BO - 6, width: EN, height: 6, color: qizil });
    y = BO - 34;
    yoz(firma.nom, M, y, 10, bold);
    yozOng(`${inv.sarlavha ?? 'FAKTURA'} № ${inv.faktura_no ?? inv.order_no} — davomi`, oxirX, y, 8.5, font, kul);
    y -= 14;
  }

  function jadvalSarlavha() {
    const bal = 24;
    page.drawRectangle({ x: M, y: y - bal, width: ICH, height: bal, color: toq });
    ustun.forEach((u, i) => {
      const q = bol(T(u.nom), w[i] - 6, 7, bold, 2);
      q.forEach((s, j) => {
        const yy = y - (q.length === 1 ? 15 : 10 + j * 8);
        if (u.tik === 'ong') {
          page.drawText(s, { x: x[i] + w[i] - 5 - bold.widthOfTextAtSize(s, 7), y: yy, size: 7, font: bold, color: oq });
        } else if (u.tik === 'mkz') {
          page.drawText(s, { x: x[i] + (w[i] - bold.widthOfTextAtSize(s, 7)) / 2, y: yy, size: 7, font: bold, color: oq });
        } else {
          page.drawText(s, { x: x[i] + 5, y: yy, size: 7, font: bold, color: oq });
        }
      });
    });
    y -= bal;
  }

  sarlavhaBloki();
  jadvalSarlavha();

  const items: any[] = inv.items ?? [];
  for (const [i, it] of items.entries()) {
    const q = qatorQiymati(it, i);
    const nomIdx = ustun.findIndex((u) => u.kalit === 'name');
    const ishIdx = ustun.findIndex((u) => u.kalit === 'manuf');
    const nomQ = bol(T(q.name), w[nomIdx] - 10, 8, font, 3);
    const ishQ = ishIdx >= 0 ? bol(T(q.manuf), w[ishIdx] - 10, 8, font, 2) : [''];
    const qatorSoni = Math.max(nomQ.length, ishQ.length);
    const bal = 9 + qatorSoni * 9.8;

    if (y - bal < PAST + 26) {
      page = doc.addPage([EN, BO]);
      qisqaSarlavha();
      jadvalSarlavha();
    }

    const yuqori = y;
    if (i % 2 === 1) {
      page.drawRectangle({ x: M, y: yuqori - bal, width: ICH, height: bal, color: zebra });
    }

    ustun.forEach((u, ci) => {
      if (u.kalit === 'name' || u.kalit === 'manuf') {
        const qatorlar = u.kalit === 'name' ? nomQ : ishQ;
        const f = u.kalit === 'name' ? bold : font;
        qatorlar.forEach((s, j) =>
          page.drawText(s, {
            x: x[ci] + 5,
            y: yuqori - 12 - j * 9.8,
            size: 8,
            font: f,
            color: u.kalit === 'name' ? qora : kul,
          }),
        );
      } else {
        const s = q[u.kalit] ?? '';
        const f = u.kalit === 'sum' ? bold : font;
        const rang = u.kalit === 'n' ? kul : qora;
        if (u.tik === 'ong') yozOng(s, x[ci] + w[ci] - 5, yuqori - 12, 8, f, rang);
        else if (u.tik === 'mkz') yozMkz(s, x[ci], w[ci], yuqori - 12, 8, f, rang);
        else yoz(s, x[ci] + 5, yuqori - 12, 8, f, rang);
      }
    });

    y = yuqori - bal;
    chiziq(M, y, oxirX, 0.5);
  }

  // ---------- jami bloki ----------
  const jamiSumma = Number(inv.total) || 0;
  const qqsFoiz = Number(firma.qqs_foiz) || 0;
  const qqs = qqsFoiz > 0 ? jamiSumma - jamiSumma / (1 + qqsFoiz / 100) : 0;
  const narxli = inv?.ustunlar !== 'yigish';

  if (narxli) {
    if (y - 92 < PAST) {
      page = doc.addPage([EN, BO]);
      qisqaSarlavha();
      y -= 10;
    }
    y -= 14;
    const blokEn = 226;
    const blokX = oxirX - blokEn;

    const qator = (yorliq: string, qiymat: string) => {
      yoz(yorliq, blokX, y, 8.5, font, kul);
      yozOng(qiymat, oxirX, y, 9, font);
      y -= 14;
    };
    qator('Oraliq summa', `${pul(jamiSumma)}`);
    qator(qqsFoiz > 0 ? `Shu jumladan QQS (${qqsFoiz}%)` : 'QQS', qqsFoiz > 0 ? pul(qqs) : 'solinmaydi');

    y -= 4;
    page.drawRectangle({ x: blokX, y: y - 22, width: blokEn, height: 26, color: toq });
    yoz('JAMI TO‘LOVGA', blokX + 10, y - 12, 8, bold, oq);
    yozOng(`${raqam(jamiSumma)} so‘m`, oxirX - 10, y - 13, 11, bold, oq);
    y -= 34;

    yoz('Summa yozuvda:', M, y, 7.5, font, kul);
    bol(T(summaYozuvda(jamiSumma)), ICH - 74, 8, font, 2).forEach((q, j) =>
      page.drawText(q, { x: M + 72, y: y - j * 10, size: 8, font, color: qora }),
    );
    y -= 26;
  } else {
    y -= 16;
    yoz(`Jami nomlar soni: ${items.length}`, M, y, 9, bold);
    y -= 18;
  }

  // ---------- imzo ----------
  if (y < PAST + 46) {
    page = doc.addPage([EN, BO]);
    qisqaSarlavha();
    y = BO - 90;
  }
  const imzoEn = (ICH - 40) / 2;
  const imzoQator = (yorliq: string, ism: string | null, xx: number) => {
    chiziq(xx, y, xx + imzoEn, 0.6, kul);
    yoz(yorliq, xx, y - 11, 6.5, font, kul);
    if (ism) yozOng(ism, xx + imzoEn, y - 11, 7.5, font, kul);
  };
  imzoQator('TOPSHIRDI', firma.rahbar ?? null, M);
  imzoQator('QABUL QILDI', inv.customer?.name ?? null, M + imzoEn + 40);

  // ---------- altbilgi ----------
  const sahifalar = doc.getPages();
  sahifalar.forEach((p: any) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: oxirX, y: 34 }, thickness: 0.5, color: ochKul });
    const alt = T([firma.nom, firma.telefon].filter(Boolean).join('  ·  '));
    p.drawText(alt, { x: M, y: 22, size: 7, font, color: kul });
  });
  sahifaRaqamlari(doc, font, T, kul);

  return { bayt: await doc.save(), kirill };
}

// ---------------------------------------------------------------- tanlash
async function pdfYasa(
  inv: any,
  firma: any,
  logo: any,
): Promise<{ bayt: Uint8Array; kirill: boolean }> {
  return firma?.uslub === 'oracle' ? pdfOracle(inv, firma, logo) : pdf1C(inv, firma, logo);
}

// ---------------------------------------------------------------- Excel
// SheetJS'ning bepul versiyasi katak bezaklarini (chegara, rang) yozmaydi,
// shuning uchun ExcelJS ishlatiladi — to'r chiziqlari va imzo bloki kerak.
//
// Excel ustunlari PDF'dan farq qiladi va bu ataylab: jadval dasturida
// ustun bo'sh turgani muammo emas, foydalanuvchi uni o'zi yashira oladi.
// PDF esa qog'ozga chiqadi, u yerda har millimetr hisobda.
async function excelYasa(inv: any, firma: any): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = String(firma?.nom ?? FIRMA_ZAXIRA.nom);
  const ws = wb.addWorksheet('Faktura', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const oracle = firma?.uslub === 'oracle';
  const URGU = oracle ? 'FF2F3B42' : 'FF000000';
  const FON = oracle ? 'FFEDF0F2' : 'FFEDEDED';

  ws.columns = [
    { width: 5 },   // №
    { width: 44 },  // nomi
    { width: 26 },  // ishlab chiqaruvchi
    { width: 12 },  // seriya
    { width: 14 },  // ishlab chiqarilgan
    { width: 14 },  // yaroqlilik
    { width: 8 },   // soni
    { width: 14 },  // narxi
    { width: 16 },  // summasi
  ];

  const chegara = {
    top: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
    left: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
    right: { style: 'thin' as const, color: { argb: 'FF9AA5A8' } },
  };

  // ---------- sarlavha ----------
  ws.mergeCells('A1:I1');
  const s1 = ws.getCell('A1');
  s1.value = `${firma?.nom ?? FIRMA_ZAXIRA.nom} — ${inv.sarlavha ?? 'FAKTURA'} № ${inv.faktura_no ?? inv.order_no}`;
  s1.font = { size: 16, bold: true, color: { argb: URGU } };
  s1.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 24;

  // Rekvizit qatori: faktura buxgalteriyaga boradi, bank va STIRsiz
  // uni hujjat sifatida qabul qilishmaydi.
  ws.mergeCells('A2:I2');
  const s2 = ws.getCell('A2');
  s2.value = [
    firma?.manzil,
    firma?.telefon,
    firma?.stir ? `STIR ${firma.stir}` : null,
    firma?.bank_nomi,
    firma?.hisob_raqam ? `h/r ${firma.hisob_raqam}` : null,
    firma?.mfo ? `MFO ${firma.mfo}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  s2.alignment = { horizontal: 'center' };
  s2.font = { size: 9, color: { argb: 'FF666666' } };

  ws.mergeCells('A3:I3');
  const s3 = ws.getCell('A3');
  s3.value = `Sana: ${sana(inv.created_at)}    ·    Holat: ${HOLAT[inv.status] ?? inv.status}`;
  s3.alignment = { horizontal: 'center' };
  s3.font = { size: 10, color: { argb: 'FF555F63' } };

  ws.mergeCells('A4:I4');
  const s4 = ws.getCell('A4');
  s4.value =
    `${String(inv.taraf_nom ?? 'Mijoz:').replace(':', '')}: ${inv.customer?.name ?? '—'}    ·    Telefon: ${inv.customer?.phone ?? '—'}` +
    (inv.customer?.pharmacy ? `    ·    ${inv.customer.pharmacy}` : '');
  s4.alignment = { horizontal: 'center' };
  s4.font = { size: 10 };

  ws.addRow([]);

  // ---------- jadval sarlavhasi ----------
  const yigish = inv?.ustunlar === 'yigish';
  const sarlavha = ws.addRow(
    yigish
      ? ['№', 'Dori nomi', 'Ishlab chiqaruvchi', 'Seriya',
         'Ishlab chiqarilgan', 'Yaroqlilik muddati', 'Dona', 'Sklad']
      : ['№', 'Dori nomi', 'Ishlab chiqaruvchi', 'Seriya',
         'Ishlab chiqarilgan', 'Yaroqlilik muddati', 'Soni', 'Narxi', 'Summasi']
  );
  sarlavha.height = 30;
  sarlavha.eachCell((c: any) => {
    c.font = { bold: true, size: 10, color: { argb: oracle ? 'FFFFFFFF' : 'FF000000' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: oracle ? URGU : FON } };
    c.border = chegara;
  });

  // ---------- qatorlar ----------
  for (const [i, it] of (inv.items ?? []).entries()) {
    const asos = [
      i + 1,
      it.name ?? '',
      it.manufacturer ?? '—',
      it.series ?? '—',
      it.made_at ? sana(it.made_at) : '—',
      it.expiry ? sana(it.expiry) : '—',
      Number(it.qty) || 0,
    ];
    // Yig'ish varaqasida narx o'rniga SKLAD
    const r = ws.addRow(
      yigish ? [...asos, it.sklad ?? '—'] : [...asos, Number(it.price) || 0, Number(it.sum) || 0]
    );
    r.eachCell((c: any, n: number) => {
      c.border = chegara;
      c.font = { size: 10 };
      c.alignment = {
        vertical: 'top',
        wrapText: n === 2 || n === 3,
        horizontal: n === 1 || (n >= 4 && n <= 6) ? 'center' : n >= 7 ? 'right' : 'left',
      };
      if (n >= 8) c.numFmt = '#,##0';
      if (n === 7) c.numFmt = '#,##0.###';
    });
  }

  // ---------- jami ----------
  const jami = ws.addRow(['', 'JAMI', '', '', '', '', '', '', Number(inv.total) || 0]);
  jami.eachCell((c: any, n: number) => {
    c.border = chegara;
    c.font = { bold: true, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FON } };
    if (n === 9) {
      c.numFmt = '#,##0';
      c.alignment = { horizontal: 'right' };
    }
  });

  // Summa yozuvda — buxgalteriya hujjatining majburiy qatori
  if (!yigish) {
    const soz = ws.addRow(['', `Summa yozuvda: ${summaYozuvda(Number(inv.total) || 0)}`]);
    ws.mergeCells(`B${soz.number}:I${soz.number}`);
    soz.getCell(2).font = { size: 10, italic: true };
    soz.getCell(2).alignment = { horizontal: 'left', wrapText: true };
  }

  ws.addRow([]);

  // ---------- izoh va imzo ----------
  const izohQator = ws.rowCount + 1;
  ws.mergeCells(`A${izohQator}:E${izohQator + 2}`);
  const izoh = ws.getCell(`A${izohQator}`);
  izoh.value = inv.comment ? `Izoh: ${inv.comment}` : 'Izoh:';
  izoh.alignment = { vertical: 'top', wrapText: true };
  izoh.font = { size: 10 };
  izoh.border = chegara;

  ws.mergeCells(`F${izohQator}:I${izohQator + 2}`);
  const imzo = ws.getCell(`F${izohQator}`);
  imzo.value =
    `Rahbar: ______________________  ${firma?.rahbar ?? ''}\n\n` +
    `Qabul qildi: ______________________`;
  imzo.alignment = { vertical: 'top', wrapText: true };
  imzo.font = { size: 10 };
  imzo.border = chegara;

  ws.getRow(izohQator).height = 22;
  ws.getRow(izohQator + 1).height = 22;
  ws.getRow(izohQator + 2).height = 22;

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ---------------------------------------------------------------- yuborish
async function hujjatYubor(
  token: string,
  chatId: number,
  bayt: Uint8Array,
  nom: string,
  tur: string,
  caption?: string
) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  form.append('document', new Blob([bayt], { type: tur }), nom);

  const r = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const j = await r.json().catch(() => ({ ok: false }));
  // Yuborilmasa jim qolmaymiz: chaqiruvchi (bot) buni bilishi kerak
  if (!j.ok) throw new Error('TELEGRAM: ' + (j.description ?? 'yuborilmadi'));
  return j;
}

const CORS_JSON = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'content-type, authorization, apikey, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Fayl brauzerga JSON ichida qaytadi: panel uni yuklab olib chop etadi.
// Katta massivni spread bilan String.fromCharCode ga berish stek
// to'lib ketishiga olib keladi - bo'lak-bo'lak o'giriladi.
function base64ga(b: Uint8Array): string {
  let s = '';
  const bolak = 0x8000;
  for (let i = 0; i < b.length; i += bolak) {
    s += String.fromCharCode(...b.subarray(i, i + bolak));
  }
  return btoa(s);
}

const FIRMA_ZAXIRA = {
  uslub: '1c',
  nom: 'IDAA FARM',
  manzil: null,
  telefon: null,
  stir: null,
  bank_nomi: null,
  hisob_raqam: null,
  mfo: null,
  rahbar: null,
  hisobchi: null,
  qqs_foiz: 0,
  logo_path: null,
};

/**
 * Firma rekvizitlari va tanlangan ko'rinish.
 *
 * So'rov yiqilsa faktura BEKOR QILINMAYDI — zaxira qiymat bilan
 * chiqaveradi: mijoz sozlama o'qilmagani uchun hujjatsiz qolmasin.
 */
async function firmaniOl(supabase: any, uslubMajbur?: string) {
  let f: any = { ...FIRMA_ZAXIRA };
  try {
    const { data } = await supabase.rpc('dori_faktura_firma_srv');
    if (data) f = { ...FIRMA_ZAXIRA, ...(data as any) };
  } catch {
    /* sozlama o'qilmadi — zaxira bilan davom etamiz */
  }
  if (uslubMajbur === '1c' || uslubMajbur === 'oracle') f.uslub = uslubMajbur;
  return f;
}

/** Logo yopiq bucket'dan olinadi va hujjat ICHIGA joylanadi */
async function logoBaytlari(supabase: any, yol: string | null) {
  if (!yol) return null;
  try {
    const { data } = await supabase.storage.from('dori-logo').download(yol);
    if (!data) return null;
    const bayt = new Uint8Array(await data.arrayBuffer());
    // Turni kengaytmadan emas, MAGIC baytdan aniqlaymiz: .jpg deb
    // saqlangan PNG uchraydi va embedJpg unda yiqilardi.
    const png = bayt[0] === 0x89 && bayt[1] === 0x50 && bayt[2] === 0x4e && bayt[3] === 0x47;
    const jpeg = bayt[0] === 0xff && bayt[1] === 0xd8;
    if (!png && !jpeg) return null;
    return { bayt, png };
  } catch {
    return null;
  }
}

/** Ikkala ko'rinishni sotuvsiz solishtirish uchun namuna ma'lumot */
function namunaFaktura() {
  const items = [
    { name: 'Амоксициллин 500 мг капсулы №20', manufacturer: 'Hemofarm A.D.', series: 'A24-118', expiry: '2028-04-30', qty: 40, price: 18500, sum: 740000 },
    { name: 'Парацетамол 500 мг таблетки №10', manufacturer: 'Нобель Алматинская ФФ', series: 'PC-9032', expiry: '2027-11-30', qty: 120, price: 4200, sum: 504000 },
    { name: 'Цефтриаксон 1 г порошок для инъекций', manufacturer: 'Shreya Life Sciences', series: 'CFT-771', expiry: '2027-08-31', qty: 60, price: 12750, sum: 765000 },
    { name: 'Ибупрофен суспензия 100 мг/5 мл 100 мл', manufacturer: 'Реплекфарм А.Д.', series: 'IB-4410', expiry: '2028-01-31', qty: 25, price: 27400, sum: 685000 },
    { name: 'Омепразол 20 мг капсулы №30', manufacturer: 'Sandoz d.d.', series: 'OM-2201', expiry: '2029-02-28', qty: 30, price: 31900, sum: 957000 },
    // Donaga sotilgan qator: «Birlik» ustuni shunda paydo bo'ladi
    { name: 'Виусид пор.4.5г.№90', manufacturer: 'Catalysis S.L.', series: 'VS-9012', expiry: '2028-06-30', qty: 10, price: 28947, sum: 289470, birlik: 'dona' },
  ];
  return {
    sarlavha: 'SOTUV FAKTURASI',
    taraf_nom: 'Mijoz:',
    order_no: 1042,
    created_at: new Date().toISOString(),
    status: 'done',
    total: items.reduce((a, i) => a + i.sum, 0),
    comment: 'Namuna hujjat — ko‘rinishni tanlash uchun',
    customer: { name: '«Shifo» dorixonasi MCHJ', phone: '+998 90 123 45 67', pharmacy: 'Toshkent sh., Chilonzor t.' },
    items: items.map((it: any, n: number) => ({ birlik: 'pachka', ...it, line_no: n + 1, made_at: null })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_JSON });

  const token = Deno.env.get('TELEGRAM_DORI_BOT_TOKEN');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  if (!token) return new Response('TOKEN_YOQ', { status: 500 });

  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response('BAD_JSON', { status: 400 });
  }

  /** service_role kaliti yoki super admin JWT'si */
  async function superAdminmi(): Promise<boolean> {
    if (auth === serviceKey) return true;
    const { data: u } = await supabase.auth.getUser(auth);
    const uid = u?.user?.id;
    if (!uid) return false;
    const { data: p } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    return (p as any)?.role === 'super_admin';
  }

  /** PDF + Excel yasab, base64 bo'lib qaytaradi */
  async function hujjatlar(inv: any, nom: string, uslubMajbur?: string) {
    const firma = await firmaniOl(supabase, uslubMajbur);
    const logo = await logoBaytlari(supabase, firma.logo_path);
    const pdf = await pdfYasa(inv, firma, logo);
    const xls = await excelYasa(inv, firma);
    return new Response(
      JSON.stringify({
        ok: true,
        nom,
        uslub: firma.uslub,
        pdf: base64ga(pdf.bayt),
        xlsx: base64ga(xls),
      }),
      { headers: CORS_JSON }
    );
  }

  // ============================== NAMUNA REJIMI
  // Sozlamalar ekranidagi "namuna" tugmasi. Ikkala ko'rinishni
  // SOTUV QILMASDAN solishtirish uchun — avval tanlashning yagona
  // yo'li haqiqiy sotuv qilib, fakturani ochish edi.
  if (body?.rejim === 'namuna') {
    if (!auth) return new Response('FORBIDDEN', { status: 403 });
    if (!(await superAdminmi())) {
      return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: CORS_JSON });
    }
    try {
      return await hujjatlar(namunaFaktura(), 'namuna-faktura', String(body?.uslub ?? ''));
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
        status: 500, headers: CORS_JSON,
      });
    }
  }

  // ============================== BUYURTMA / YIG'ISH REJIMI
  // Ikkalasi ham bitta buyurtmadan yasaladi, farqi - qaysi hujjat:
  //   buyurtma -> mijozga, narx bilan
  //   yigish   -> omborchiga, narxsiz, lekin QAYSI SKLAD ustuni bilan
  if (body?.rejim === 'buyurtma' || body?.rejim === 'yigish') {
    if (!auth) return new Response('FORBIDDEN', { status: 403 });
    if (!(await superAdminmi())) {
      return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: CORS_JSON });
    }

    const oId = String(body?.order_id ?? '');
    if (!oId) return new Response(JSON.stringify({ error: 'ORDER_YOQ' }), { status: 400, headers: CORS_JSON });

    const rpc = body.rejim === 'yigish' ? 'dori_yigish_faktura_srv' : 'dori_buyurtma_faktura_srv';
    const { data: inv4, error: xato4 } = await supabase.rpc(rpc, { p_order_id: oId });
    if (xato4) return new Response(JSON.stringify({ error: xato4.message }), { status: 500, headers: CORS_JSON });
    if (!inv4) return new Response(JSON.stringify({ error: 'TOPILMADI' }), { status: 404, headers: CORS_JSON });

    try {
      const bosh = body.rejim === 'yigish' ? 'yigish' : 'buyurtma';
      return await hujjatlar(inv4 as any, `${bosh}-${(inv4 as any).order_no}`);
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
        status: 500, headers: CORS_JSON,
      });
    }
  }

  // ================================================== SOTUV REJIMI
  // Operator paneldan sotdi - faktura brauzerga qaytadi (chop etish
  // yoki PDF saqlash uchun). Telegram bu yerda qatnashmaydi.
  if (body?.rejim === 'sotuv') {
    if (!auth) return new Response('FORBIDDEN', { status: 403 });
    if (!(await superAdminmi())) {
      return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: CORS_JSON });
    }

    const saleId = String(body?.sale_id ?? '');
    if (!saleId) return new Response(JSON.stringify({ error: 'SALE_YOQ' }), { status: 400, headers: CORS_JSON });

    const { data: inv3, error: xato3 } = await supabase.rpc('dori_sotuv_faktura_srv', { p_sale_id: saleId });
    if (xato3) return new Response(JSON.stringify({ error: xato3.message }), { status: 500, headers: CORS_JSON });
    if (!inv3) return new Response(JSON.stringify({ error: 'TOPILMADI' }), { status: 404, headers: CORS_JSON });

    try {
      return await hujjatlar(inv3 as any, `sotuv-${(inv3 as any).order_no}`);
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
        status: 500, headers: CORS_JSON,
      });
    }
  }

  // ================================================== SKLAD REJIMI
  // Super admin sklad nomidan kirim fakturasini oladi. Telegramga
  // yuborilmaydi - fayllar brauzerga qaytadi (chop etish uchun).
  if (body?.rejim === 'sklad') {
    if (!auth) return new Response('FORBIDDEN', { status: 403 });
    if (!(await superAdminmi())) {
      return new Response(JSON.stringify({ error: 'RUXSAT_YOQ' }), { status: 403, headers: CORS_JSON });
    }

    const splitId = String(body?.split_id ?? '');
    if (!splitId) return new Response(JSON.stringify({ error: 'SPLIT_YOQ' }), { status: 400, headers: CORS_JSON });

    const { data: inv2, error: xato2 } = await supabase.rpc('dori_sklad_faktura_srv', { p_split_id: splitId });
    if (xato2) return new Response(JSON.stringify({ error: xato2.message }), { status: 500, headers: CORS_JSON });
    if (!inv2) return new Response(JSON.stringify({ error: 'TOPILMADI' }), { status: 404, headers: CORS_JSON });

    try {
      const nom = `kirim-${(inv2 as any).faktura_no ?? (inv2 as any).order_no}`;
      return await hujjatlar(inv2 as any, nom);
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
        status: 500, headers: CORS_JSON,
      });
    }
  }

  // ================================================== MIJOZ REJIMI
  if (auth !== serviceKey) return new Response('FORBIDDEN', { status: 403 });

  const order_id: string | undefined = body?.order_id;
  const chat_id: number | undefined = Number(body?.chat_id);
  if (!order_id || !chat_id) return new Response('PARAM_YOQ', { status: 400 });

  // Buyurtma AYNAN shu chatniki ekanini baza tekshiradi
  const { data, error } = await supabase.rpc('dori_invoice_for_chat', {
    p_order_id: order_id,
    p_chat_id: chat_id,
  });
  if (error) return new Response('RPC: ' + error.message, { status: 500 });
  if (!data) return new Response('BUYURTMA_TOPILMADI', { status: 404 });

  const inv = data as any;
  const kun = sana(inv.created_at).replace(/\./g, '-');

  let kirill = false;
  try {
    const firma = await firmaniOl(supabase);
    const logo = await logoBaytlari(supabase, firma.logo_path);
    const yasandi = await pdfYasa(inv, firma, logo);
    kirill = yasandi.kirill;
    const xls = await excelYasa(inv, firma);

    await hujjatYubor(
      token,
      chat_id,
      yasandi.bayt,
      `faktura-${inv.order_no}-${kun}.pdf`,
      'application/pdf',
      `🧾 <b>Faktura №${inv.order_no}</b>\n` +
        `Sana: ${sana(inv.created_at)}\n` +
        `Jami: <b>${raqam(inv.total)} so'm</b>`
    );

    await hujjatYubor(
      token,
      chat_id,
      xls,
      `faktura-${inv.order_no}-${kun}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    return new Response(JSON.stringify({ ok: true, kirill }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, kirill, error: String((e as any)?.message ?? e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
