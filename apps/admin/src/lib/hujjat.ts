import { supabase } from './supabase';

// ============================================================================
// CHOP ETILADIGAN HUJJATLAR — umumiy asos
//
// Avval to'rtta hujjat to'rt joyda alohida yozilgan edi va har biri o'z
// qoidasi bilan chiqardi: uch xil shrift, ikki xil chekka, yig'ish
// varaqasida esa @page umuman yo'q edi — qog'oz o'lchamini brauzer o'zi
// tanlardi. Logo hech qaysisida yo'q edi.
//
// Bu fayl ularni BITTA QOLIPGA TIQMAYDI: katalog kartochka ro'yxati,
// hisobot esa KPI va bir nechta jadvaldan iborat — ularni jadvalga
// aylantirish soxta umumlashtirish bo'lardi. Umumiy bo'lgani ajratilgan:
// qog'oz sozlamasi, uslub, blank (logo va rekvizit), imzo, altbilgi va
// chop etish oynasi. Har hujjat faqat o'z tanasini beradi.
// ============================================================================

export type HujjatSozlama = {
  org_id: string;
  logo_path: string | null;
  manzil: string | null;
  telefon: string | null;
  stir: string | null;
  bank: string | null;
  hisob_raqam: string | null;
  qogoz: 'A4' | 'A5';
  chekka_tepa: number;
  chekka_past: number;
  chekka_chap: number;
  chekka_ong: number;
  shrift: string;
  olcham_matn: number;
  olcham_sarlavha: number;
  olcham_jadval: number;
  rang: string;
  ustun_rasm: boolean;
  ustun_sku: boolean;
  ustun_razmer: boolean;
  imzo_topshirdi: string;
  imzo_qabul: string;
  altbilgi: string | null;
  /** Biznes nomi — sozlama bilan birga keladi, har sahifa alohida so'ramasin */
  org_nomi?: string;
};

/** Chop etishda ishlatiladigan shriftlar — o'zbekcha o' va g' to'g'ri chiqadi */
export const SHRIFTLAR = [
  { qiymat: 'sans-serif', nom: 'Tizim shrifti (sans)' },
  { qiymat: '"Times New Roman", Times, serif', nom: 'Times New Roman' },
  { qiymat: 'Arial, Helvetica, sans-serif', nom: 'Arial' },
  { qiymat: 'Georgia, serif', nom: 'Georgia' },
  { qiymat: '"Courier New", monospace', nom: 'Courier New' },
];

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

// Sozlama bir marta o'qiladi va shu sahifa ochiq turgancha eslab qolinadi:
// bir buyurtmani chop etib, keyin ikkinchisini chop etganda ikkinchi
// so'rov ketmasin.
let kesh: HujjatSozlama | null = null;

export async function sozlamaniOl(yangila = false): Promise<HujjatSozlama> {
  if (kesh && !yangila) return kesh;
  // Biznes nomi ham shu yerda olinadi: aks holda katalog va hisobot
  // sahifalari faqat blankdagi nom uchun alohida so'rov yuborardi.
  const [{ data }, { data: org }] = await Promise.all([
    supabase.rpc('hujjat_sozlama'),
    supabase.from('organizations').select('name').limit(1).maybeSingle(),
  ]);
  // So'rov ishlamasa ham hujjat chiqishi kerak — chop etish sozlama
  // yuklanmagani uchun to'xtab qolmasin.
  kesh = { ...((data as HujjatSozlama) ?? ({} as HujjatSozlama)), org_nomi: (org as any)?.name ?? '' };
  return kesh;
}

/** Sozlama o'zgargach keshni tashlash */
export function sozlamaKeshiniTashla() {
  kesh = null;
}

/**
 * Logoni data-URI ga aylantiradi.
 *
 * Nega havola emas: bucket yopiq, ya'ni havola imzolangan va muddati bor.
 * Chop etish oynasi sekin ochilsa yoki foydalanuvchi hujjatni saqlab
 * keyinroq ochsa, rasm joyida bo'sh katak bo'lib qolardi. Data-URI
 * hujjat ichida qoladi.
 */
export async function logoniOl(s: HujjatSozlama): Promise<string | null> {
  if (!s?.logo_path) return null;
  try {
    const { data } = await supabase.storage.from('org-logos').download(s.logo_path);
    if (!data) return null;
    return await new Promise<string | null>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => res(null);
      fr.readAsDataURL(data);
    });
  } catch {
    return null; // logo chiqmasa ham hujjat chiqaveradi
  }
}

/** Sozlamadan qurilgan umumiy uslub */
export function uslub(s: HujjatSozlama): string {
  const qogoz = s.qogoz ?? 'A4';
  const rang = s.rang ?? '#7000FF';
  const shrift = s.shrift ?? 'sans-serif';
  const matn = s.olcham_matn ?? 11;
  const sarlavha = s.olcham_sarlavha ?? 20;
  const jadval = s.olcham_jadval ?? 10;
  const c = {
    t: s.chekka_tepa ?? 14,
    p: s.chekka_past ?? 14,
    ch: s.chekka_chap ?? 14,
    o: s.chekka_ong ?? 14,
  };

  return `
    @page { size: ${qogoz}; margin: ${c.t}mm ${c.o}mm ${c.p}mm ${c.ch}mm; }
    * { box-sizing: border-box; }
    body { font-family: ${shrift}; font-size: ${matn}pt; color: #14151a; margin: 0; }

    .blank { display: flex; justify-content: space-between; align-items: flex-start;
             gap: 20px; border-bottom: 2px solid ${rang}; padding-bottom: 10px; }
    .blank .chap { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
    .blank img.logo { max-height: 56px; max-width: 140px; object-fit: contain; }
    .blank .nom { font-size: ${sarlavha}pt; font-weight: 800; color: ${rang}; line-height: 1.15; }
    .blank .rekvizit { font-size: ${Math.max(7, matn - 3)}pt; color: #666; margin-top: 3px; line-height: 1.45; }
    .blank .ong { text-align: right; white-space: nowrap; }
    .blank .turi { font-size: ${Math.max(7, matn - 3)}pt; color: #777; text-transform: uppercase; letter-spacing: .5px; }
    .blank .raqam { font-size: ${Math.round(sarlavha * 0.85)}pt; font-weight: 800; }
    .blank .sana { font-size: ${Math.max(7, matn - 3)}pt; color: #666; }

    .ogoh { margin-top: 10px; padding: 7px 11px; background: #fff4e5;
            border-left: 4px solid #ff9800; font-size: ${Math.max(8, matn - 2)}pt;
            font-weight: 700; color: #8a5200; }

    .meta { display: flex; flex-wrap: wrap; gap: 8px 34px; margin-top: 14px;
            font-size: ${Math.max(8, matn - 1)}pt; }
    .meta span.yorliq { color: #777; }

    table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: ${jadval}pt; }
    th { background: ${rang}14; text-align: left; padding: 6px 8px; border: 1px solid #ddd;
         font-size: ${Math.max(6, jadval - 1)}pt; text-transform: uppercase; letter-spacing: .4px; }
    td { border: 1px solid #ddd; padding: 5px 8px; vertical-align: middle; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 800; background: ${rang}0d; font-size: ${jadval + 2}pt; }
    tr { break-inside: avoid; }

    .imzo { margin-top: 34px; font-size: ${Math.max(8, matn - 1)}pt; display: flex; gap: 46px; }
    .imzo span { display: inline-block; width: 190px; border-bottom: 1px solid #999; }

    .altbilgi { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e6e6ee;
                display: flex; justify-content: space-between; gap: 20px;
                font-size: ${Math.max(7, matn - 3)}pt; color: #666; }

    @media print { .noprint { display: none; } }
    .noprint { position: fixed; top: 10px; right: 10px; }
    .noprint button { background: ${rang}; color: #fff; border: 0; padding: 10px 18px;
                      border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
  `;
}

/** Blank: logo, biznes nomi, rekvizit va hujjat raqami */
export function blank(
  s: HujjatSozlama,
  orgNomi: string | null | undefined,
  logo: string | null,
  d: { turi: string; raqam?: string | number; sana?: string; ostki?: string },
): string {
  const rekvizit = [
    s.manzil,
    s.telefon,
    s.stir ? `STIR: ${s.stir}` : null,
    s.bank && s.hisob_raqam ? `${s.bank} · ${s.hisob_raqam}` : s.bank || s.hisob_raqam,
  ]
    .filter(Boolean)
    .map(esc)
    .join('<br>');

  return `
    <div class="blank">
      <div class="chap">
        ${logo ? `<img class="logo" src="${logo}" alt="" />` : ''}
        <div>
          <div class="nom">${esc(orgNomi || s.org_nomi || 'YUKCHIBOLLA')}</div>
          ${d.ostki ? `<div class="rekvizit">${esc(d.ostki)}</div>` : ''}
          ${rekvizit ? `<div class="rekvizit">${rekvizit}</div>` : ''}
        </div>
      </div>
      <div class="ong">
        <div class="turi">${esc(d.turi)}</div>
        ${d.raqam != null ? `<div class="raqam">№${esc(d.raqam)}</div>` : ''}
        ${d.sana ? `<div class="sana">${esc(d.sana)}</div>` : ''}
      </div>
    </div>
  `;
}

/** Imzo qatorlari */
export function imzo(s: HujjatSozlama): string {
  return `
    <div class="imzo">
      <div>${esc(s.imzo_topshirdi ?? 'Topshirdi')}: <span></span></div>
      <div>${esc(s.imzo_qabul ?? 'Qabul qildi')}: <span></span></div>
    </div>
  `;
}

/** Altbilgi: sozlamadagi matn va chop etilgan vaqt */
export function altbilgi(s: HujjatSozlama, orgNomi?: string | null): string {
  // Sana formatini brauzer o'zi tanlaydi: locale nomini qattiq yozsak,
  // ba'zi muhitlarda (Telegram WebView) RangeError beradi va sahifa
  // butunlay ochilmay qoladi — bu allaqachon ikki marta bo'lgan.
  let vaqt = '';
  try {
    vaqt = new Date().toLocaleString();
  } catch {
    vaqt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
  return `
    <div class="altbilgi">
      <div>${esc(s.altbilgi || orgNomi || s.org_nomi || '')}</div>
      <div>Chop etilgan: ${esc(vaqt)}</div>
    </div>
  `;
}

/**
 * Bo'sh oyna ochadi.
 *
 * MUHIM — bu tugma bosilishi bilan DARHOL chaqirilishi kerak, `await`
 * dan OLDIN. Brauzer pop-up'ga faqat foydalanuvchi harakati paytida
 * ruxsat beradi; sozlama va logo yuklanguncha kutilsa, oyna bloklanadi
 * va hujjat umuman ochilmaydi.
 *
 * Shuning uchun naqsh shunday: oynani darrov ochamiz, ichiga
 * "tayyorlanmoqda" deb yozamiz, ma'lumot kelgach `hujjatniYoz` bilan
 * to'ldiramiz.
 */
export function oynaOch(): Window | null {
  const w = window.open('', '_blank');
  if (!w) {
    alert("Hujjat oynasi ochilmadi — brauzer pop-up'ni bloklagan bo'lishi mumkin.");
    return null;
  }
  w.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>Tayyorlanmoqda…</title></head>' +
      '<body style="font-family:sans-serif;color:#777;padding:40px">Hujjat tayyorlanmoqda…</body></html>',
  );
  return w;
}

/**
 * Ochilgan oynaga hujjatni yozadi.
 *
 * `avtoChop` — yig'ish varaqasi, katalog va hisobot darhol chop etish
 * oynasini ochadi (ular ko'rish uchun emas, qog'oz uchun). Faktura esa
 * avval ekranda ko'riladi, shuning uchun tugma bilan.
 */
export function hujjatniYoz(
  w: Window | null,
  d: { nom: string; uslub: string; tana: string; avtoChop?: boolean },
): void {
  if (!w) return;
  // Oldingi "tayyorlanmoqda" matnini almashtirish uchun hujjatni qaytadan
  // ochamiz — aks holda yangi mazmun eskisining ustiga qo'shilardi.
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${esc(d.nom)}</title><style>${d.uslub}</style></head><body>
    ${d.avtoChop ? '' : '<div class="noprint"><button onclick="window.print()">🖨 Chop etish / PDF saqlash</button></div>'}
    ${d.tana}
    ${d.avtoChop ? '<script>window.onload = function () { window.print(); };<\/script>' : ''}
    </body></html>`);
  w.document.close();
}

// ============================================================================
// CHEK (58mm termal printer)
//
// A4 dan butunlay boshqa dunyo: kenglik 58mm, ya'ni taxminan 32 belgi.
// Jadval, ustun, chegara — hech biri sig'maydi. Shuning uchun bu yerda
// A4 uslubi ishlatilmaydi, alohida quriladi.
//
// Chek printerlari odatda o'z drayveri bilan brauzerdan chop etiladi:
// @page kengligini 58mm qilib qo'yamiz, balandligini "auto" — qog'oz
// rulon bo'lgani uchun uzunligi mazmunga qarab kesiladi.
// ============================================================================

export function chekUslubi(s: HujjatSozlama, kenglik = 58): string {
  const shrift = s.shrift ?? 'sans-serif';
  return `
    @page { size: ${kenglik}mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { font-family: ${shrift}; font-size: 9pt; color: #000; margin: 0;
           width: ${kenglik - 6}mm; }
    .mkz { text-align: center; }
    .nom { font-size: 11pt; font-weight: 800; }
    .kichik { font-size: 7.5pt; color: #333; }
    .chiziq { border-top: 1px dashed #000; margin: 5px 0; }
    .qator { display: flex; justify-content: space-between; gap: 6px; }
    .qator .o { text-align: right; white-space: nowrap; }
    .jami { font-size: 11pt; font-weight: 800; }
    .imzo { margin-top: 14px; font-size: 7.5pt; }
    @media print { .noprint { display: none; } }
    .noprint { margin-bottom: 8px; }
    .noprint button { width: 100%; padding: 8px; font-size: 11px; font-weight: 700;
                      border: 0; border-radius: 6px; background: #000; color: #fff; }
  `;
}

/** Chekning yuqori qismi — logo chekda ishlatilmaydi (termal printerda yomon chiqadi) */
export function chekBoshi(s: HujjatSozlama, turi: string, raqam?: string | number): string {
  return `
    <div class="mkz">
      <div class="nom">${esc(s.org_nomi || 'YUKCHIBOLLA')}</div>
      ${s.manzil ? `<div class="kichik">${esc(s.manzil)}</div>` : ''}
      ${s.telefon ? `<div class="kichik">${esc(s.telefon)}</div>` : ''}
      ${s.stir ? `<div class="kichik">STIR ${esc(s.stir)}</div>` : ''}
    </div>
    <div class="chiziq"></div>
    <div class="mkz"><b>${esc(turi)}</b>${raqam != null ? ` №${esc(raqam)}` : ''}</div>
    <div class="chiziq"></div>
  `;
}

/** Chekning pastki qismi */
export function chekOxiri(s: HujjatSozlama): string {
  let vaqt = '';
  try {
    vaqt = new Date().toLocaleString();
  } catch {
    vaqt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
  return `
    <div class="chiziq"></div>
    <div class="kichik mkz">${esc(vaqt)}</div>
    ${s.altbilgi ? `<div class="kichik mkz">${esc(s.altbilgi)}</div>` : ''}
  `;
}

/** Chek qatori: chapda nom, o'ngda son */
export function chekQator(chap: string, ong: string, qalin = false): string {
  const t = qalin ? 'jami' : '';
  return `<div class="qator ${t}"><div>${esc(chap)}</div><div class="o">${esc(ong)}</div></div>`;
}
