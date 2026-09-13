// =============================================================
//  BAZA BILAN ALOQA
//
//  Hamma so'rov shu yerda: ekranlar `supabase` ni to'g'ridan-to'g'ri
//  chaqirmaydi. Sabab — 2-bosqichda shu fayl OFFLINE qatlamga
//  almashtiriladi (mahalliy baza + navbat), ekranlar esa o'zgarmaydi.
//
//  Summalar chegarada o'giriladi: bazada `numeric(18,2)`, ilovada
//  tiyin (butun son). `pul.ts` ga qarang — nega shundayligi yozilgan.
// =============================================================

import { bazaga, tiyinga } from '@ilova/kassa-yadro';
import type { Hisob, Klient, Turkum, Yozuv } from '@ilova/kassa-yadro';
import { supabase } from './supabase';

export type Men = {
  org_id: string;
  biznes: string;
  rol: string;
  yonalishlar: string[];
  obuna: string;
};

/** Kirgan odamning tashkiloti. Profil hali yo'q bo'lsa — null */
export async function menKim(): Promise<Men | null> {
  const { data, error } = await supabase.rpc('kassa_men');
  if (error) throw error;
  const qator = Array.isArray(data) ? data[0] : data;
  return qator ?? null;
}

/** Ro'yxatdan o'tishning ikkinchi qadami: tashkilot ochish */
export async function biznesOch(nom: string, ism?: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_royxatdan_ot', {
    p_biznes: nom,
    p_ism: ism ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function hisoblarOl(): Promise<Hisob[]> {
  const { data, error } = await supabase
    .from('kassa_hisoblar')
    .select('id, nom, turi, valyuta, boshlangich, rang, belgi, tartib, faol, versiya, o_raqam')
    .order('tartib')
    .order('nom');
  if (error) throw error;
  return (data ?? []).map((h: Record<string, unknown>) => ({
    ...(h as unknown as Hisob),
    boshlangich: tiyinga(h.boshlangich as string),
  }));
}

export async function turkumlarOl(): Promise<Turkum[]> {
  const { data, error } = await supabase
    .from('kassa_turkumlar')
    .select('id, nom, turi, ota_id, rang, belgi, tartib, faol, versiya, o_raqam')
    .eq('faol', true)
    .order('tartib');
  if (error) throw error;
  return (data ?? []) as unknown as Turkum[];
}

export async function klientlarOl(): Promise<Klient[]> {
  const { data, error } = await supabase
    .from('kassa_klientlar')
    .select('id, ism, telefon, turi, rasm_path, izoh, faol, versiya, o_raqam')
    .eq('faol', true)
    .order('ism');
  if (error) throw error;
  return (data ?? []) as unknown as Klient[];
}

/**
 * Yozuvlar. PostgREST 1000 qatorda kesadi, shuning uchun chegara
 * ATAYLAB berilgan: "hammasi keldi" degan taxmin bilan yig'indi
 * hisoblanса, eski yozuvlar tushib qolib balans yolg'on chiqardi.
 * Katta tarix kerak bo'lganda davr bo'yicha so'raladi.
 */
export async function yozuvlarOl(chegara = 500): Promise<Yozuv[]> {
  const { data, error } = await supabase
    .from('kassa_yozuvlar')
    .select(
      'id, hisob_id, turi, summa, valyuta, kurs, turkum_id, klient_id, izoh, sana, tolov_usuli, kochirma_id, bekor_at, bekor_sabab, versiya, o_raqam, created_at',
    )
    .order('sana', { ascending: false })
    .limit(chegara);
  if (error) throw error;
  return (data ?? []).map((y: Record<string, unknown>) => ({
    ...(y as unknown as Yozuv),
    summa: tiyinga(y.summa as string),
    kurs: Number(y.kurs ?? 1),
  }));
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
};

export async function yozuvQosh(y: YangiYozuv): Promise<void> {
  // org_id ustunining standart qiymati `current_org_id()` — uni
  // ilovadan yubormaymiz. Yuborilsa, noto'g'ri qiymat RLS `with check`
  // ga urilib, sababi tushunarsiz xato berardi.
  const { error } = await supabase.from('kassa_yozuvlar').insert({
    hisob_id: y.hisob_id,
    turi: y.turi,
    summa: bazaga(y.summa),
    turkum_id: y.turkum_id ?? null,
    klient_id: y.klient_id ?? null,
    izoh: y.izoh?.trim() || null,
    sana: y.sana ?? new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Yozuvni BEKOR qilish. O'chirish yo'q — sabab bilan bekor qilinadi
 * va tarixda qoladi. Pul harakatida "izsiz yo'qolish" bo'lmasligi
 * kerak: bir oydan keyin "bu nima edi" degan savolga javob qolsin.
 */
export async function yozuvBekorQil(id: string, sabab: string): Promise<void> {
  const { error } = await supabase
    .from('kassa_yozuvlar')
    .update({ bekor_at: new Date().toISOString(), bekor_sabab: sabab || 'sababsiz' })
    .eq('id', id);
  if (error) throw error;
}

/** Yozuvni tahrirlash. Summa tiyinda keladi. */
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
  const { error } = await supabase.from('kassa_yozuvlar').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Hisoblararo o'tkazma: BIR so'rovda ikki yozuv.
 *
 * Ikki alohida so'rov bo'lsa, ikkinchisi yiqilganda pul bir hisobdan
 * chiqib, ikkinchisiga tushmay qolardi — daftar yolg'on gapirardi.
 * PostgREST massivni bitta tranzaksiyada yozadi: yo ikkalasi, yo
 * hech biri.
 */
export async function kochirmaYarat(p: {
  kimdan: string;
  kimga: string;
  /** Tiyinda */
  summa: number;
  izoh?: string;
  sana?: string;
}): Promise<void> {
  if (p.kimdan === p.kimga) throw new Error("Bir xil hisob tanlangan");
  // Juftlikni bog'laydigan id — ikkalasida bir xil.
  const juft =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  const sana = p.sana ?? new Date().toISOString();
  const izoh = p.izoh?.trim() || null;
  const { error } = await supabase.from('kassa_yozuvlar').insert([
    { hisob_id: p.kimdan, turi: 'chiqim', summa: bazaga(p.summa), kochirma_id: juft, izoh, sana },
    { hisob_id: p.kimga, turi: 'kirim', summa: bazaga(p.summa), kochirma_id: juft, izoh, sana },
  ]);
  if (error) throw error;
}

// ---------- Hisoblar ----------
export async function hisobQosh(p: {
  nom: string;
  turi: Hisob['turi'];
  valyuta: Hisob['valyuta'];
  /** Tiyinda */
  boshlangich: number;
}): Promise<void> {
  const { error } = await supabase.from('kassa_hisoblar').insert({
    nom: p.nom.trim(),
    turi: p.turi,
    valyuta: p.valyuta,
    boshlangich: bazaga(p.boshlangich),
  });
  if (error) throw error;
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
  const { error } = await supabase.from('kassa_hisoblar').update(patch).eq('id', id);
  if (error) throw error;
}

// ---------- Turkumlar ----------
export async function turkumQosh(nom: string, turi: Turkum['turi']): Promise<void> {
  const { error } = await supabase.from('kassa_turkumlar').insert({ nom: nom.trim(), turi });
  if (error) throw error;
}

export async function turkumTahrirla(
  id: string,
  p: { nom?: string; faol?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.nom !== undefined) patch.nom = p.nom.trim();
  if (p.faol !== undefined) patch.faol = p.faol;
  const { error } = await supabase.from('kassa_turkumlar').update(patch).eq('id', id);
  if (error) throw error;
}

// ---------- Klientlar ----------
export async function klientQosh(p: {
  ism: string;
  telefon?: string;
  turi: Klient['turi'];
  izoh?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('kassa_klientlar')
    .insert({
      ism: p.ism.trim(),
      telefon: p.telefon?.trim() || null,
      turi: p.turi,
      izoh: p.izoh?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
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
  const { error } = await supabase.from('kassa_klientlar').update(patch).eq('id', id);
  if (error) throw error;
}

// ---------- Biznes ----------
/** Nomni FAQAT shu funksiya o'zgartira oladi — yo'nalish va obunaga tegmaydi */
export async function biznesNomiQoy(nom: string): Promise<string> {
  const { data, error } = await supabase.rpc('kassa_biznes_nomi', { p_nom: nom });
  if (error) throw error;
  return data as string;
}
