// =============================================================
//  MA'LUMOT QATLAMI — MAHALLIY OMBOR BIRINCHI
//
//  Ilova endi serverdan EMAS, qurilmadagi ombordan o'qiydi va unga
//  yozadi. Serverga yuborish keyin, fonda bo'ladi.
//
//  Shuning uchun:
//   · yozuv darhol ko'rinadi — internet kutilmaydi;
//   · internet yo'q bo'lsa ham ilova to'liq ishlaydi;
//   · ekran kodlari O'ZGARMADI — ular avvalgidek shu fayldagi
//     funksiyalarni chaqiradi.
//
//  SHAKL: mahalliy omborda qatorlar SERVER shaklida turadi
//  (`summa` — "1234.56" matn, `versiya`, `o_raqam` bilan). O'girish
//  faqat shu faylda, chegarada bo'ladi. Aks holda serverdan kelgan
//  qator bilan mahalliy yaratilgani ikki xil ko'rinib, sinxronizatsiya
//  ularni farqli deb hisoblardi.
// =============================================================

import { bazaga, tiyinga } from '@ilova/kassa-yadro';
import { bitimQoldiq } from '@ilova/kassa-yadro';
import type { Bitim, Hisob, Klient, Tolov, Turkum, ValyutaKurs, Yozuv } from '@ilova/kassa-yadro';
import type { Amal, Jadval, Ombor } from '../ombor/turi';
import { amalYasa, uuid } from './sinx';
import { supabase } from './supabase';
import { tr } from './til';

export type Men = {
  org_id: string;
  biznes: string;
  rol: string;
  yonalishlar: string[];
  obuna: string;
};

// ---------------------------------------------------------------
//  Ombor va sinxronizatsiya — ilova ochilganda bir marta qo'yiladi
// ---------------------------------------------------------------
let OMBOR: Ombor | null = null;
let SINXNI_CHAQIR: (() => void) | null = null;

export function omborniQoy(o: Ombor, sinx: () => void) {
  OMBOR = o;
  SINXNI_CHAQIR = sinx;
}

function ombor(): Ombor {
  if (!OMBOR) throw new Error(tr('Ombor hali tayyor emas'));
  return OMBOR;
}

/** Yozgandan keyin: serverga yuborishni boshlaymiz, lekin KUTMAYMIZ */
function turtki() {
  try {
    SINXNI_CHAQIR?.();
  } catch {
    /* sinx o'zi xatoni ushlaydi */
  }
}

async function navbatga(amal: Amal) {
  await ombor().navbatQosh(amal);
  turtki();
}

// ---------------------------------------------------------------
//  Kim — bu faqat ONLAYN (kirish paytida)
// ---------------------------------------------------------------
export async function menKim(): Promise<Men | null> {
  const { data, error } = await supabase.rpc('kassa_men');
  if (error) throw error;
  const qator = Array.isArray(data) ? data[0] : data;
  return qator ?? null;
}

export async function biznesOch(nom: string, ism?: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_royxatdan_ot', {
    p_biznes: nom,
    p_ism: ism ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------
//  O'qish — mahalliy ombordan
// ---------------------------------------------------------------
export async function hisoblarOl(): Promise<Hisob[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('hisoblar');
  return qatorlar
    .map((h) => ({
      ...(h as unknown as Hisob),
      boshlangich: tiyinga(h.boshlangich as string),
      faol: h.faol !== false,
      tartib: Number(h.tartib ?? 0),
    }))
    .sort((a, b) => a.tartib - b.tartib || a.nom.localeCompare(b.nom));
}

export async function turkumlarOl(): Promise<Turkum[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('turkumlar');
  return qatorlar
    .map((t) => ({ ...(t as unknown as Turkum), tartib: Number(t.tartib ?? 0) }))
    .filter((t) => t.faol !== false)
    .sort((a, b) => a.tartib - b.tartib);
}

export async function klientlarOl(): Promise<Klient[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('klientlar');
  return qatorlar
    .map((k) => ({
      ...(k as unknown as Klient),
      // SQLite hamma narsani matn qilib qaytaradi; bazada bu
      // ustunlar son. Qo‘lda o‘girmasak «10000000» < «9» bo‘lib
      // solishtirilardi.
      cheklov: k.cheklov == null ? null : Number(k.cheklov),
      lat: k.lat == null ? null : Number(k.lat),
      lng: k.lng == null ? null : Number(k.lng),
    }))
    .filter((k) => k.faol !== false)
    .sort((a, b) => a.ism.localeCompare(b.ism));
}

export async function yozuvlarOl(): Promise<Yozuv[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('yozuvlar');
  return qatorlar.map((y) => ({
    ...(y as unknown as Yozuv),
    summa: tiyinga(y.summa as string),
    kurs: Number(y.kurs ?? 1),
  }));
}

// ---------------------------------------------------------------
//  Yozish — avval mahalliy, keyin navbat
// ---------------------------------------------------------------
async function mahalliyQosh(jadval: Jadval, qator: Record<string, unknown>) {
  await ombor().saqla(jadval, [qator]);
  // Serverga `versiya` va `o_raqam` yuborilmaydi: ularni server
  // triggeri qo'yadi. Yuborilsa, ular mijozdagi taxmin bo'lib
  // qolardi va sinxronizatsiya chalkashardi.
  const { versiya: _v, o_raqam: _o, ...yuboriladigan } = qator;
  await navbatga(amalYasa('qosh', jadval, String(qator.id), yuboriladigan));
}

async function mahalliyTahrir(
  jadval: Jadval,
  id: string,
  ozgarish: Record<string, unknown>,
) {
  const eski = await ombor().bitta<Record<string, unknown>>(jadval, id);
  if (!eski) throw new Error(tr('Yozuv topilmadi'));
  const versiya = Number(eski.versiya ?? 1);
  // Mahalliy nusxada versiyani oshirmaymiz: haqiqiy versiyani server
  // beradi va u sinxronizatsiyada qaytib keladi. Oshirsak, keyingi
  // tahrir noto'g'ri versiya bilan ketib, o'zimiz bilan ziddiyat
  // yasagan bo'lardik.
  await ombor().saqla(jadval, [{ ...eski, ...ozgarish }]);
  await navbatga(amalYasa('tahrir', jadval, id, ozgarish, versiya));
}

export type YangiYozuv = {
  /** Yozuv paytidagi kurs — MUZLATILADI */
  kurs?: number;
  hisob_id: string;
  turi: 'kirim' | 'chiqim';
  /** Tiyinda */
  summa: number;
  turkum_id?: string | null;
  klient_id?: string | null;
  izoh?: string | null;
  sana?: string;
  valyuta?: string;
  kochirma_id?: string | null;
  /** Qaysi bitimdan chiqqani — oldi-berdi qatlami */
  bitim_id?: string | null;
  tolov_usuli?: string;
};

export async function yozuvQosh(y: YangiYozuv): Promise<string> {
  const id = uuid();
  await mahalliyQosh('yozuvlar', {
    id,
    hisob_id: y.hisob_id,
    turi: y.turi,
    summa: bazaga(y.summa),
    valyuta: y.valyuta ?? 'UZS',
    kurs: y.kurs ?? 1,
    turkum_id: y.turkum_id ?? null,
    klient_id: y.klient_id ?? null,
    izoh: y.izoh?.trim() || null,
    sana: y.sana ?? new Date().toISOString(),
    tolov_usuli: y.tolov_usuli ?? 'naqd',
    kochirma_id: y.kochirma_id ?? null,
    bitim_id: y.bitim_id ?? null,
    bekor_at: null,
    bekor_sabab: null,
    versiya: 1,
    o_raqam: null,
    created_at: new Date().toISOString(),
  });
  return id;
}

export async function yozuvTahrirla(
  id: string,
  p: Partial<Pick<YangiYozuv, 'hisob_id' | 'turi' | 'summa' | 'turkum_id' | 'klient_id' | 'izoh' | 'sana'>>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.hisob_id !== undefined) patch.hisob_id = p.hisob_id;
  if (p.turi !== undefined) patch.turi = p.turi;
  if (p.summa !== undefined) patch.summa = bazaga(p.summa);
  if (p.turkum_id !== undefined) patch.turkum_id = p.turkum_id;
  if (p.klient_id !== undefined) patch.klient_id = p.klient_id;
  if (p.izoh !== undefined) patch.izoh = p.izoh?.trim() || null;
  if (p.sana !== undefined) patch.sana = p.sana;
  await mahalliyTahrir('yozuvlar', id, patch);
}

/**
 * Yozuvni BEKOR qilish. O'chirish yo'q — sabab bilan bekor qilinadi
 * va tarixda qoladi: bir oydan keyin "bu nima edi" degan savolga
 * javob qolsin.
 */
export async function yozuvBekorQil(id: string, sabab: string): Promise<void> {
  await mahalliyTahrir('yozuvlar', id, {
    bekor_at: new Date().toISOString(),
    bekor_sabab: sabab || 'sababsiz',
  });
}

/**
 * Hisoblararo o'tkazma — ikki yozuv, bitta juftlik id bilan.
 *
 * Offline'da ikkalasi ham mahalliy omborga BIR VAQTDA tushadi, ya'ni
 * ekranda pul bir hisobdan chiqib ikkinchisiga tushgani darhol
 * ko'rinadi. Serverga esa ikki alohida amal bo'lib ketadi va navbat
 * tartibi ularni ketma-ket yuboradi.
 */
export async function kochirmaYarat(p: {
  kimdan: string;
  kimga: string;
  summa: number;
  izoh?: string;
  sana?: string;
}): Promise<void> {
  if (p.kimdan === p.kimga) throw new Error(tr('Bir xil hisob tanlangan'));
  const juft = uuid();
  const sana = p.sana ?? new Date().toISOString();
  await yozuvQosh({ hisob_id: p.kimdan, turi: 'chiqim', summa: p.summa, izoh: p.izoh, sana, kochirma_id: juft });
  await yozuvQosh({ hisob_id: p.kimga, turi: 'kirim', summa: p.summa, izoh: p.izoh, sana, kochirma_id: juft });
}

// ---------- Hisoblar ----------
export async function hisobQosh(p: {
  nom: string;
  turi: Hisob['turi'];
  valyuta: Hisob['valyuta'];
  boshlangich: number;
}): Promise<void> {
  await mahalliyQosh('hisoblar', {
    id: uuid(),
    nom: p.nom.trim(),
    turi: p.turi,
    valyuta: p.valyuta,
    boshlangich: bazaga(p.boshlangich),
    rang: null,
    belgi: null,
    tartib: 100,
    faol: true,
    versiya: 1,
    o_raqam: null,
  });
}

export async function hisobTahrirla(
  id: string,
  p: { nom?: string; turi?: Hisob['turi']; boshlangich?: number; faol?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.nom !== undefined) patch.nom = p.nom.trim();
  if (p.turi !== undefined) patch.turi = p.turi;
  if (p.boshlangich !== undefined) patch.boshlangich = bazaga(p.boshlangich);
  if (p.faol !== undefined) patch.faol = p.faol;
  await mahalliyTahrir('hisoblar', id, patch);
}

// ---------- Turkumlar ----------
export async function turkumQosh(nom: string, turi: Turkum['turi']): Promise<void> {
  await mahalliyQosh('turkumlar', {
    id: uuid(),
    nom: nom.trim(),
    turi,
    ota_id: null,
    rang: null,
    belgi: null,
    tartib: 100,
    faol: true,
    versiya: 1,
    o_raqam: null,
  });
}

export async function turkumTahrirla(id: string, p: { nom?: string; faol?: boolean }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.nom !== undefined) patch.nom = p.nom.trim();
  if (p.faol !== undefined) patch.faol = p.faol;
  await mahalliyTahrir('turkumlar', id, patch);
}

// ---------- Klientlar ----------
export async function klientQosh(p: {
  ism: string;
  telefon?: string;
  turi: Klient['turi'];
  izoh?: string;
  familya?: string | null;
  manzil?: string | null;
  kategoriya?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Qarz chegarasi TIYINDA. null = cheklov yo‘q */
  cheklov?: number | null;
  rasm_path?: string | null;
  /** Oldindan berilsa — rasm shu id bilan yuklangan bo‘ladi */
  id?: string;
}): Promise<string> {
  const id = p.id ?? uuid();
  await mahalliyQosh('klientlar', {
    id,
    ism: p.ism.trim(),
    familya: p.familya?.trim() || null,
    telefon: p.telefon?.trim() || null,
    turi: p.turi,
    manzil: p.manzil?.trim() || null,
    kategoriya: p.kategoriya?.trim() || null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    cheklov: p.cheklov ?? null,
    rasm_path: p.rasm_path ?? null,
    izoh: p.izoh?.trim() || null,
    faol: true,
    versiya: 1,
    o_raqam: null,
  });
  return id;
}

export async function klientTahrirla(
  id: string,
  p: {
    ism?: string;
    telefon?: string | null;
    turi?: Klient['turi'];
    izoh?: string | null;
    faol?: boolean;
  familya?: string | null;
  manzil?: string | null;
  kategoriya?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Qarz chegarasi TIYINDA. null = cheklov yo‘q */
  cheklov?: number | null;
  rasm_path?: string | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.ism !== undefined) patch.ism = p.ism.trim();
  if (p.familya !== undefined) patch.familya = p.familya?.trim() || null;
  if (p.telefon !== undefined) patch.telefon = p.telefon?.trim() || null;
  if (p.turi !== undefined) patch.turi = p.turi;
  if (p.manzil !== undefined) patch.manzil = p.manzil?.trim() || null;
  if (p.kategoriya !== undefined) patch.kategoriya = p.kategoriya?.trim() || null;
  // Koordinata JUFT yoziladi: bazada ham shunday cheklov bor.
  // Bittasini yuborsak server rad etardi va sabab ekranga
  // «cheklov buzildi» bo‘lib chiqardi.
  if (p.lat !== undefined || p.lng !== undefined) {
    patch.lat = p.lat ?? null;
    patch.lng = p.lng ?? null;
  }
  if (p.cheklov !== undefined) patch.cheklov = p.cheklov ?? null;
  if (p.rasm_path !== undefined) patch.rasm_path = p.rasm_path ?? null;
  if (p.izoh !== undefined) patch.izoh = p.izoh?.trim() || null;
  if (p.faol !== undefined) patch.faol = p.faol;
  await mahalliyTahrir('klientlar', id, patch);
}

// ---------------------------------------------------------------
//  Onlayn talab qiladigan amallar
// ---------------------------------------------------------------

/** Nomni FAQAT shu funksiya o'zgartira oladi — yo'nalish va obunaga tegmaydi */
export async function biznesNomiQoy(nom: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_biznes_nomi', { p_nom: nom });
  if (error) throw error;
  return data as string;
}

/**
 * Hisobni BUTUNLAY o'chirish — Google Play talabi.
 *
 * Qaytarib bo'lmaydi: tashkilot, hisoblar, yozuvlar, kontaktlar va
 * kirish hisobi yo'q qilinadi. Chegaralarni `tests/kassa-ochirish.mjs`
 * bosib ko'radi.
 */
export async function hisobniOchir(): Promise<{ tashkilot: string | null; yozuvlar: number }> {
  const { data, error } = await supabase.functions.invoke('kassa-hisob-ochir', {
    body: { tasdiq: 'OCHIRISH' },
  });
  if (error) {
    // `functions.invoke` xato matnini yutadi — javob tanasini ochamiz,
    // aks holda odam "noma'lum xatolik" dan boshqa hech narsa ko'rmaydi.
    let sabab = error.message;
    try {
      const javob = await (error as { context?: Response }).context?.json();
      if (javob?.error) sabab = javob.error;
    } catch {
      /* javob JSON emas */
    }
    throw new Error(sabab);
  }
  const j = data as { ok?: boolean; error?: string; ochirildi?: { tashkilot: string | null; yozuvlar: number } };
  if (!j?.ok) throw new Error(j?.error ?? 'O‘chirilmadi');
  // Mahalliy nusxa ham qolmasin
  await ombor().tozala().catch(() => {});
  return j.ochirildi ?? { tashkilot: null, yozuvlar: 0 };
}

// ---------------------------------------------------------------
//  AI ULANISHI (MCP) — tokenlar
//
//  Token SERVERDA yasaladi va javobda BIR MARTA qaytadi: bazada
//  faqat sha256 xeshi turadi. Shuning uchun ilova uni ko'chirib
//  olishni taklif qiladi va boshqa ko'rsatolmaydi.
// ---------------------------------------------------------------
export type Token = {
  id: string;
  nom: string;
  prefiks: string;
  yozishi: boolean;
  faol: boolean;
  oxirgi_ishlatilgan: string | null;
  soralgan_soni: number;
  created_at: string;
};

export async function tokenYarat(nom: string, yozishi: boolean): Promise<{ id: string; token: string }> {
  const { data, error } = await supabase.rpc('kassa_token_yarat', {
    p_nom: nom,
    p_yozishi: yozishi,
  });
  if (error) throw error;
  return data as { id: string; token: string };
}

export async function tokenlarOl(): Promise<Token[]> {
  const { data, error } = await supabase
    .from('kassa_tokenlar')
    .select('id, nom, prefiks, yozishi, faol, oxirgi_ishlatilgan, soralgan_soni, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Token[];
}

/** O'chirish emas, YOPISH: tarix va jurnal bog'lanishi saqlanadi */
export async function tokenYop(id: string): Promise<void> {
  const { error } = await supabase.from('kassa_tokenlar').update({ faol: false }).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------
//  MIJOZNING O'Z AI KALITI (BYOK)
//
//  Kalit bazada SHIFRLANGAN holda yotadi va uni hech kim —
//  egasi ham — qayta o'qiy olmaydi. Ilova faqat provayder nomi,
//  model va niqobni ko'radi ("sk-ant-…a1b2").
// ---------------------------------------------------------------
export type AiProvayder = 'anthropic' | 'openai' | 'google';

export type AiKalit = {
  provayder: AiProvayder;
  model: string;
  niqob: string;
  faol: boolean;
  oxirgi_sinov: string | null;
  oxirgi_xato: string | null;
};

export async function aiKalitOl(): Promise<AiKalit | null> {
  const { data, error } = await supabase.rpc('kassa_ai_kalit_ol');
  if (error) throw error;
  return (data as AiKalit) ?? null;
}

export async function aiKalitSaqla(
  provayder: AiProvayder,
  model: string,
  kalit: string,
): Promise<void> {
  const { error } = await supabase.rpc('kassa_ai_kalit_saqla', {
    p_provayder: provayder,
    p_model: model,
    p_kalit: kalit,
  });
  if (error) throw error;
}

export async function aiKalitOchir(): Promise<void> {
  const { error } = await supabase.rpc('kassa_ai_kalit_ochir');
  if (error) throw error;
}

/** Kalit haqiqatan ishlayaptimi — modelga bitta qisqa so'rov yuboradi */
export async function aiSina(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('kassa-ai', {
    body: { amal: 'sina' },
  });
  if (error) {
    let sabab = error.message;
    try {
      const javob = await (error as { context?: Response }).context?.json();
      if (javob?.error) sabab = javob.error;
    } catch {
      /* javob JSON emas */
    }
    throw new Error(sabab);
  }
  const j = data as { ok?: boolean; javob?: string; error?: string };
  if (!j?.ok) throw new Error(j?.error ?? tr('Javob kelmadi'));
  return j.javob ?? '';
}

/** Tenantning AI sarfi: so'rov soni va (Claude bo'lsa) dollar */
export async function aiHolat(): Promise<{
  kunlik_chegara: number;
  bugun_soralgan: number;
  oy_soralgan: number;
  oy_narx_usd: number;
}> {
  const { data, error } = await supabase.rpc('kassa_ai_holat');
  if (error) throw error;
  return data as {
    kunlik_chegara: number;
    bugun_soralgan: number;
    oy_soralgan: number;
    oy_narx_usd: number;
  };
}

// =============================================================
//  OLDI-BERDI: bitim va to‘lov
//
//  DIQQAT — MANTIQ IKKI JOYDA TAKRORLANADI va bu ATAYLAB:
//
//  Bazada `kassa_bitim_yarat` va `kassa_tolov_qosh` funksiyalari
//  bor. Lekin ilova ULARNI CHAQIRMAYDI: u avval qurilmaga yozadi,
//  keyin navbat orqali jadvalga to‘g‘ridan-to‘g‘ri INSERT qiladi.
//  Internetsiz ishlashning boshqa yo‘li yo‘q.
//
//  Shuning uchun «qarz bitimi daftarga yozuv tushiradi» va
//  «to‘liq to‘langach bitim yopiladi» qoidalari SHU YERDA ham
//  yozilgan. Ikkisi bir xil bo‘lishi shart; ikkalasi ham sinov
//  bilan qo‘riqlanadi (`kassa-balans` — JS tomoni, `kassa-bitim`
//  — baza tomoni).
//
//  Baza funksiyalari esa TASHQI chaqiruvchilar uchun kerak:
//  MCP orqali ulangan AI agent va Telegram boti.
// =============================================================

export async function bitimlarOl(): Promise<Bitim[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('bitimlar');
  return qatorlar.map((b) => ({
    ...(b as unknown as Bitim),
    summa: tiyinga(b.summa as string),
    narx: b.narx === null || b.narx === undefined ? null : tiyinga(b.narx as string),
    miqdor: b.miqdor === null || b.miqdor === undefined ? null : Number(b.miqdor),
    kurs: Number(b.kurs ?? 1),
  }));
}

export async function tolovlarOl(): Promise<Tolov[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('tolovlar');
  return qatorlar.map((t) => ({
    ...(t as unknown as Tolov),
    summa: tiyinga(t.summa as string),
    kurs: Number(t.kurs ?? 1),
  }));
}

export type YangiBitim = {
  /** Yozuv paytidagi kurs — MUZLATILADI */
  kurs?: number;
  klient_id: string;
  yonalish: 'oldim' | 'berdim';
  nima: 'tovar' | 'qarz';
  /** Tiyinda */
  summa: number;
  tovar_nom?: string | null;
  birlik?: string | null;
  miqdor?: number | null;
  /** Tiyinda */
  narx?: number | null;
  valyuta?: string;
  muddat?: string | null;
  izoh?: string | null;
  sana?: string;
  /** `nima === 'qarz'` bo‘lsa MAJBURIY: pul qaysi hisobdan */
  hisob_id?: string | null;
};

/**
 * Bitim qo‘shadi.
 *
 * TOVAR kassaga TEGMAYDI — faqat qarz paydo bo‘ladi. Eski ilovada
 * «tovar berdim» chiqim bo‘lib kassadan pul yechardi va bir amal
 * ikki marta hisoblanardi.
 */
export async function bitimQosh(b: YangiBitim): Promise<string> {
  if (b.nima === 'qarz' && !b.hisob_id) throw new Error(tr('Hisobni tanlang.'));
  const id = uuid();
  const sana = b.sana ?? new Date().toISOString();

  await mahalliyQosh('bitimlar', {
    id,
    klient_id: b.klient_id,
    yonalish: b.yonalish,
    nima: b.nima,
    tovar_nom: b.tovar_nom?.trim() || null,
    birlik: b.birlik?.trim() || null,
    miqdor: b.miqdor ?? null,
    narx: b.narx === null || b.narx === undefined ? null : bazaga(b.narx),
    summa: bazaga(b.summa),
    valyuta: b.valyuta ?? 'UZS',
    kurs: b.kurs ?? 1,
    muddat: b.muddat ?? null,
    izoh: b.izoh?.trim() || null,
    sana,
    holat: 'kutilmoqda',
    tasdiq_at: null,
    tasdiq_kim: null,
    bekor_sabab: null,
    versiya: 1,
    o_raqam: null,
    created_at: new Date().toISOString(),
  });

  // Pul harakati bor bitim daftarga ham tushadi
  if (b.nima === 'qarz' && b.hisob_id) {
    await yozuvQosh({
      hisob_id: b.hisob_id,
      turi: b.yonalish === 'berdim' ? 'chiqim' : 'kirim',
      summa: b.summa,
      klient_id: b.klient_id,
      izoh: b.izoh?.trim() || tr('Qarz'),
      sana,
      valyuta: b.valyuta,
      bitim_id: id,
    });
  }

  return id;
}

export type YangiTolov = {
  /** Yozuv paytidagi kurs — MUZLATILADI */
  kurs?: number;
  klient_id: string;
  yonalish: 'oldim' | 'berdim';
  /** Tiyinda */
  summa: number;
  hisob_id: string;
  bitim_id?: string | null;
  usuli?: 'naqd' | 'karta' | 'bank' | 'tovar';
  valyuta?: string;
  muddat?: string | null;
  izoh?: string | null;
  sana?: string;
};

/**
 * To‘lov qo‘shadi: daftarga yozuv, to‘lovlar jadvaliga qator.
 *
 * Bitimga bog‘langan bo‘lsa, yo‘nalish TESKARI bo‘lishi shart —
 * «men berdim» bitimi «men oldim» to‘lovi bilan yopiladi. Bir xil
 * yo‘nalishda qarz kamaymay, ikki baravar oshib ketardi.
 */
export async function tolovQosh(t: YangiTolov): Promise<string> {
  const id = uuid();
  const sana = t.sana ?? new Date().toISOString();

  if (t.bitim_id) {
    const bitim = await ombor().bitta<Record<string, unknown>>('bitimlar', t.bitim_id);
    if (!bitim) throw new Error(tr('Yozuv topilmadi'));
    if (bitim.yonalish === t.yonalish) {
      throw new Error(tr('To‘lov yo‘nalishi bitimga teskari bo‘lishi kerak.'));
    }
    if (bitim.klient_id !== t.klient_id) {
      throw new Error(tr('Bu bitim boshqa hamkorniki.'));
    }
  }

  const yozuvId = await yozuvQosh({
    hisob_id: t.hisob_id,
    turi: t.yonalish === 'berdim' ? 'chiqim' : 'kirim',
    summa: t.summa,
    klient_id: t.klient_id,
    izoh: t.izoh?.trim() || tr('To‘lov'),
    sana,
    valyuta: t.valyuta,
    kurs: t.kurs ?? 1,
    bitim_id: t.bitim_id ?? null,
    tolov_usuli: t.usuli === 'bank' ? 'otkazma' : t.usuli === 'tovar' ? 'naqd' : t.usuli,
  });

  await mahalliyQosh('tolovlar', {
    id,
    klient_id: t.klient_id,
    bitim_id: t.bitim_id ?? null,
    yonalish: t.yonalish,
    summa: bazaga(t.summa),
    valyuta: t.valyuta ?? 'UZS',
    kurs: t.kurs ?? 1,
    usuli: t.usuli ?? 'naqd',
    muddat: t.muddat ?? null,
    yozuv_id: yozuvId,
    izoh: t.izoh?.trim() || null,
    sana,
    holat: 'kutilmoqda',
    tasdiq_at: null,
    tasdiq_kim: null,
    bekor_sabab: null,
    versiya: 1,
    o_raqam: null,
    created_at: new Date().toISOString(),
  });

  // To‘liq to‘langan bo‘lsa bitim yopiladi. Holat — faqat
  // ko‘rsatkich: qoldiq har doim qaytadan hisoblanadi.
  if (t.bitim_id) {
    const [bitimlar, tolovlar] = await Promise.all([bitimlarOl(), tolovlarOl()]);
    const bitim = bitimlar.find((x) => x.id === t.bitim_id);
    if (bitim && bitimQoldiq(bitim, tolovlar) <= 0) {
      await mahalliyTahrir('bitimlar', bitim.id, { holat: 'yopilgan' });
    }
  }

  return id;
}

/** Bitim bekor qilinadi — o‘chirilmaydi, tarix qoladi */
export async function bitimBekorQil(id: string, sabab: string): Promise<void> {
  await mahalliyTahrir('bitimlar', id, { holat: 'bekor', bekor_sabab: sabab });
}

/** Hamkor tasdiqlagani belgilanadi (Telegram bosqichida ishlatiladi) */
export async function bitimTasdiqla(id: string): Promise<void> {
  await mahalliyTahrir('bitimlar', id, {
    holat: 'tasdiqlangan',
    tasdiq_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------
//  KO'P BIZNES
//
//  Do'kondorda ko'pincha ikki-uch nuqta bo'ladi va ularning
//  daftari ALOHIDA yuritilishi kerak: bir kassaga qo'shib
//  yuborilsa, qaysi do'kon foyda qilayotgani ko'rinmay qoladi.
//
//  DIQQAT: biznes almashgandan keyin mahalliy ombor TOZALANISHI
//  shart. Baza tomonda sizish yo'q (RLS `current_org_id()` ga
//  tayanadi), lekin qurilmadagi nusxa avvalgi biznesniki bo'lib
//  qoladi va odam buni sizish deb ko'radi.
// ---------------------------------------------------------------
export type Biznes = {
  org_id: string;
  nom: string;
  rol: string;
  joriymi: boolean;
  obuna: string | null;
};

export async function bizneslarOl(): Promise<Biznes[]> {
  const { data, error } = await supabase.rpc('kassa_bizneslarim');
  if (error) throw error;
  return (data ?? []) as Biznes[];
}

/** Yangi biznes ochadi va DARHOL unga o'tadi */
export async function biznesQosh(nom: string, ism?: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_biznes_qosh', {
    p_nom: nom,
    p_ism: ism ?? null,
  });
  if (error) throw error;
  await ombor().tozala();
  return data as string;
}

export async function biznesTanla(orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_biznes_tanla', { p_org_id: orgId });
  if (error) throw error;
  // Tozalash SERVER javobidan KEYIN: RPC yiqilsa mahalliy nusxa
  // o'chib, odam internetsiz bo'sh ilova bilan qolardi.
  await ombor().tozala();
  return data as string;
}

export async function biznesNomi(orgId: string, nom: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_biznes_nomi', {
    p_org_id: orgId,
    p_nom: nom,
  });
  if (error) throw error;
  return data as string;
}

export type OchirishNatija = {
  quruq: boolean;
  nom: string;
  yozuvlar: number;
  bitimlar: number;
  klientlar: number;
  joriy?: string | null;
};

/**
 * Biznesni o'chiradi.
 *
 * `qollash = false` (standart) — QURUQ SINOV: nima o'chishini
 * sanab beradi, hech narsaga tegmaydi. Ilova avval shuni
 * ko'rsatadi, odam tasdiqlagandan keyin `true` bilan chaqiradi.
 * Bu loyihaning 1-qoidasi va bu yerda ayniqsa muhim: o'chirilgan
 * biznesni qaytarib bo'lmaydi.
 */
export async function biznesOchir(orgId: string, qollash = false): Promise<OchirishNatija> {
  const { data, error } = await supabase.rpc('kassa_biznes_ochir', {
    p_org_id: orgId,
    p_qollash: qollash,
  });
  if (error) throw error;
  if (qollash) await ombor().tozala();
  return data as OchirishNatija;
}

// ---------------------------------------------------------------
//  VALYUTA VA KURS
//
//  Asosiy valyuta bitta, qolganlariga kurs kiritiladi.
//  Kurs YOZUV PAYTIDA nusxalanadi (`kurs` ustuni), shuning
//  uchun bu yerdagi qiymat faqat YANGI yozuvlarga ta’sir
//  qiladi — eskilari o‘zgarmaydi.
// ---------------------------------------------------------------
export async function valyutalarOl(): Promise<ValyutaKurs[]> {
  const qatorlar = await ombor().royxat<Record<string, unknown>>('valyutalar');
  return qatorlar
    .map((v) => ({
      ...(v as unknown as ValyutaKurs),
      kurs: Number(v.kurs ?? 1),
      asosiy: v.asosiy === true,
      faol: v.faol !== false,
    }))
    .filter((v) => v.faol)
    .sort((a, b) => (b.asosiy ? 1 : 0) - (a.asosiy ? 1 : 0) || a.valyuta.localeCompare(b.valyuta));
}

/** Qo‘shadi yoki kursini yangilaydi */
export async function valyutaSaqla(p: {
  valyuta: ValyutaKurs['valyuta'];
  kurs: number;
  asosiy?: boolean;
}): Promise<void> {
  const bor = (await valyutalarOl()).find((v) => v.valyuta === p.valyuta);
  if (bor) {
    await mahalliyTahrir('valyutalar', bor.id, {
      kurs: String(p.kurs),
      asosiy: p.asosiy ?? bor.asosiy,
    });
    return;
  }
  await mahalliyQosh('valyutalar', {
    id: uuid(),
    valyuta: p.valyuta,
    kurs: String(p.kurs),
    asosiy: p.asosiy ?? false,
    faol: true,
    versiya: 1,
    o_raqam: null,
  });
}

/**
 * Asosiy valyutani almashtiradi.
 *
 * Eskisidan belgi OLINADI, yangisiga qo‘yiladi — ikkalasi
 * ham bir yozuvda bo‘lishi kerak, aks holda bazadagi unikal
 * indeks ikkita asosiyni rad etardi.
 */
export async function asosiyValyutaQoy(valyuta: ValyutaKurs['valyuta']): Promise<void> {
  const royxat = await valyutalarOl();
  for (const v of royxat) {
    if (v.asosiy && v.valyuta !== valyuta) {
      await mahalliyTahrir('valyutalar', v.id, { asosiy: false });
    }
  }
  // Asosiy valyutaning kursi har doim 1: u o‘ziga o‘giriladi.
  await valyutaSaqla({ valyuta, kurs: 1, asosiy: true });
}

export async function valyutaOchir(id: string): Promise<void> {
  await mahalliyTahrir('valyutalar', id, { faol: false });
}
