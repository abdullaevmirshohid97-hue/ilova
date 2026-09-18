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
import type { Hisob, Klient, Turkum, Yozuv } from '@ilova/kassa-yadro';
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
    .map((k) => k as unknown as Klient)
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
};

export async function yozuvQosh(y: YangiYozuv): Promise<void> {
  await mahalliyQosh('yozuvlar', {
    id: uuid(),
    hisob_id: y.hisob_id,
    turi: y.turi,
    summa: bazaga(y.summa),
    valyuta: y.valyuta ?? 'UZS',
    kurs: 1,
    turkum_id: y.turkum_id ?? null,
    klient_id: y.klient_id ?? null,
    izoh: y.izoh?.trim() || null,
    sana: y.sana ?? new Date().toISOString(),
    tolov_usuli: 'naqd',
    kochirma_id: y.kochirma_id ?? null,
    bekor_at: null,
    bekor_sabab: null,
    versiya: 1,
    o_raqam: null,
    created_at: new Date().toISOString(),
  });
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
}): Promise<string> {
  const id = uuid();
  await mahalliyQosh('klientlar', {
    id,
    ism: p.ism.trim(),
    telefon: p.telefon?.trim() || null,
    turi: p.turi,
    rasm_path: null,
    izoh: p.izoh?.trim() || null,
    faol: true,
    versiya: 1,
    o_raqam: null,
  });
  return id;
}

export async function klientTahrirla(
  id: string,
  p: { ism?: string; telefon?: string | null; turi?: Klient['turi']; izoh?: string | null; faol?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.ism !== undefined) patch.ism = p.ism.trim();
  if (p.telefon !== undefined) patch.telefon = p.telefon?.trim() || null;
  if (p.turi !== undefined) patch.turi = p.turi;
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
