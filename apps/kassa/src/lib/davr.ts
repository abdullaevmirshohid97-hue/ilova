// =============================================================
//  DAVR — kunlik / haftalik / oylik / hammasi
//
//  Yozuvlar ro'yxati, kalendar va hisobot — uchalasi shu bitta
//  hisobga tayanadi. Ikki joyda alohida yozilsa, hisobotdagi "sentabr"
//  bilan ro'yxatdagi "sentabr" bir kun bilan farq qilib qolardi.
//
//  Oy nomlari QO'LDA yozilgan. `Intl` ishlatilmaydi — u Telegram
//  WebView'da ikki marta oq ekran bergan (RangeError) va Android'ning
//  eski versiyalarida o'zbek tilini bilmaydi.
// =============================================================

export type DavrTuri = 'kun' | 'hafta' | 'oy' | 'hammasi';

export const OYLAR = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

export const HAFTA_KUNLARI = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const ikki = (n: number) => String(n).padStart(2, '0');

/** Dushanbadan boshlanadigan hafta: yakshanba 0 emas, 6 bo'ladi */
function haftaKuni(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function kunBoshi(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function kunOxiri(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export type Oraliq = { bosh: Date; oxir: Date; nom: string };

/**
 * @param turi  qaysi davr
 * @param siljish  0 = joriy, -1 = oldingi, +1 = keyingi
 */
export function davrOraligi(turi: DavrTuri, siljish: number): Oraliq {
  const bugun = kunBoshi(new Date());

  if (turi === 'hammasi') {
    return {
      bosh: new Date(2000, 0, 1),
      oxir: new Date(2999, 11, 31, 23, 59, 59),
      nom: 'Hammasi',
    };
  }

  if (turi === 'kun') {
    const k = new Date(bugun);
    k.setDate(k.getDate() + siljish);
    const nom =
      siljish === 0 ? 'Bugun' : siljish === -1 ? 'Kecha' : `${ikki(k.getDate())}.${ikki(k.getMonth() + 1)}.${k.getFullYear()}`;
    return { bosh: kunBoshi(k), oxir: kunOxiri(k), nom };
  }

  if (turi === 'hafta') {
    const b = new Date(bugun);
    b.setDate(b.getDate() - haftaKuni(b) + siljish * 7);
    const o = new Date(b);
    o.setDate(o.getDate() + 6);
    const nom =
      siljish === 0
        ? 'Shu hafta'
        : `${ikki(b.getDate())} ${OYLAR[b.getMonth()].slice(0, 3)} – ${ikki(o.getDate())} ${OYLAR[o.getMonth()].slice(0, 3)}`;
    return { bosh: kunBoshi(b), oxir: kunOxiri(o), nom };
  }

  // oy
  const b = new Date(bugun.getFullYear(), bugun.getMonth() + siljish, 1);
  const o = new Date(b.getFullYear(), b.getMonth() + 1, 0);
  const joriyYil = b.getFullYear() === new Date().getFullYear();
  return {
    bosh: kunBoshi(b),
    oxir: kunOxiri(o),
    nom: joriyYil ? OYLAR[b.getMonth()] : `${OYLAR[b.getMonth()]} ${b.getFullYear()}`,
  };
}

/** "2026-09-13" — kalendar kaliti (mahalliy vaqt bo'yicha, UTC emas) */
export function kunKaliti(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${ikki(x.getMonth() + 1)}-${ikki(x.getDate())}`;
}

export function oraliqdami(sana: string, o: Oraliq): boolean {
  const t = Date.parse(sana);
  return t >= o.bosh.getTime() && t <= o.oxir.getTime();
}

/** "13 sentabr, 14:35" */
export function sanaVaqt(d: string | Date): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getDate()} ${OYLAR[x.getMonth()]}, ${ikki(x.getHours())}:${ikki(x.getMinutes())}`;
}

/** "13 sentabr" — bugun bo'lsa "Bugun", kecha bo'lsa "Kecha" */
export function sanaQisqa(d: string | Date): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  const bugun = kunBoshi(new Date());
  const kun = kunBoshi(x);
  const farq = Math.round((bugun.getTime() - kun.getTime()) / 86400000);
  if (farq === 0) return 'Bugun';
  if (farq === 1) return 'Kecha';
  if (farq === -1) return 'Ertaga';
  const joriyYil = x.getFullYear() === bugun.getFullYear();
  return joriyYil
    ? `${x.getDate()} ${OYLAR[x.getMonth()]}`
    : `${x.getDate()} ${OYLAR[x.getMonth()]} ${x.getFullYear()}`;
}

/** Oy kalendari uchun: 6 qatorli to'r (bo'sh kunlar null) */
export function oyTori(yil: number, oy: number): (Date | null)[][] {
  const birinchi = new Date(yil, oy, 1);
  const kunlar = new Date(yil, oy + 1, 0).getDate();
  const bosh = haftaKuni(birinchi);
  const hujayralar: (Date | null)[] = [];
  for (let i = 0; i < bosh; i++) hujayralar.push(null);
  for (let k = 1; k <= kunlar; k++) hujayralar.push(new Date(yil, oy, k));
  while (hujayralar.length % 7 !== 0) hujayralar.push(null);
  const qatorlar: (Date | null)[][] = [];
  for (let i = 0; i < hujayralar.length; i += 7) qatorlar.push(hujayralar.slice(i, i + 7));
  return qatorlar;
}
