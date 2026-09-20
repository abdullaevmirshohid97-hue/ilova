// =============================================================
//  SERVER — sinxronizatsiya dvigateli uchun Supabase tomoni
//
//  Dvigatel (`sinx.ts`) Supabase'ni bilmaydi: u shu fayldagi
//  `Server` interfeysi orqali gaplashadi. Shuning uchun dvigatelni
//  soxta server bilan sinash mumkin, bu fayl esa faqat "so'rovni
//  qanday yuborish" bilan shug'ullanadi.
//
//  IKKI NOZIK JOY:
//
//  1. TAKROR QO'SHISH. Amal yuborildi, javob yo'lda yo'qoldi,
//     ilova qayta urindi. Server "duplicate key" beradi — bu XATO
//     emas, "allaqachon bor" degani. Shuning uchun 23505 kodi
//     muvaffaqiyat deb qabul qilinadi.
//
//  2. ZIDDIYAT VA "YO'Q" NI AJRATISH. Tahrir `versiya` sharti bilan
//     yuboriladi va 0 qator qaytsa ikki sabab bo'lishi mumkin:
//     yozuv boshqa qurilmada o'zgargan (ziddiyat) yoki umuman
//     yo'q (rad). Ikkalasiga bir xil xabar berilsa, foydalanuvchi
//     nima qilishini bilmasdi — shuning uchun alohida so'rov bilan
//     tekshiriladi.
// =============================================================

import type { Amal, Server } from '../ombor/turi';
import { BAZA_NOMI, JADVALLAR, type Jadval } from '../ombor/turi';
import { supabase } from './supabase';
import { tr } from './til';

/** Postgres: unique_violation */
const DUBL = '23505';

export function supabaseServer(qurilmaId: string, platforma: string): Server {
  return {
    async ozgarishlar(kursor: number) {
      const { data, error } = await supabase.rpc('kassa_ozgarishlar', {
        p_kursor: kursor,
        p_chegara: 500,
      });
      if (error) throw error;
      const j = (data ?? {}) as Record<string, unknown>;
      // Eski server yangi massivni qaytarmasligi mumkin — bo‘sh
      // ro‘yxat bilan to‘ldiriladi, ilova yiqilmaydi.
      const olingan = Object.fromEntries(
        JADVALLAR.map((x) => [x, (j[x] as Record<string, unknown>[]) ?? []]),
      ) as Record<Jadval, Record<string, unknown>[]>;
      return {
        kursor: Number(j.kursor ?? kursor),
        yana: !!j.yana,
        ...olingan,
      };
    },

    async yubor(amal: Amal) {
      const jadval = BAZA_NOMI[amal.jadval];

      if (amal.tur === 'qosh') {
        const { error } = await supabase.from(jadval).insert({ id: amal.yozuv_id, ...amal.qiymat });
        if (!error) return { holat: 'ok' };
        if ((error as { code?: string }).code === DUBL) return { holat: 'ok' };
        // RLS rad etsa (42501) yoki cheklov buzilsa — qayta urinish
        // foyda bermaydi, foydalanuvchiga aytish kerak.
        if (qaytarsaBolmaydi(error)) return { holat: 'rad', sabab: xabar(error) };
        throw error;
      }

      // tahrir
      let sorov = supabase.from(jadval).update(amal.qiymat).eq('id', amal.yozuv_id);
      if (amal.versiya !== undefined) sorov = sorov.eq('versiya', amal.versiya);
      const { data, error } = await sorov.select('id');
      if (error) {
        if (qaytarsaBolmaydi(error)) return { holat: 'rad', sabab: xabar(error) };
        throw error;
      }
      if ((data ?? []).length > 0) return { holat: 'ok' };

      // 0 qator: ziddiyatmi yoki yozuv yo'qmi
      const { data: bor } = await supabase.from(jadval).select('id').eq('id', amal.yozuv_id).maybeSingle();
      return bor ? { holat: 'ziddiyat' } : { holat: 'rad', sabab: tr('Yozuv topilmadi') };
    },

    async kursorSaqla(kursor: number) {
      const { error } = await supabase.rpc('kassa_qurilma_kursor', {
        p_qurilma: qurilmaId,
        p_kursor: kursor,
        p_nom: null,
        p_platforma: platforma,
      });
      if (error) throw error;
    },
  };
}

/** Qayta urinish foyda bermaydigan xatolar */
function qaytarsaBolmaydi(e: unknown): boolean {
  const kod = (e as { code?: string })?.code ?? '';
  // 42501 — RLS rad etdi, 23xxx — cheklov (nol summa, noma'lum valyuta),
  // 22xxx — ma'lumot turi. Bularning hammasi qayta yuborilganda ham
  // o'sha javobni beradi.
  return /^(42501|23|22)/.test(kod);
}

function xabar(e: unknown): string {
  const x = e as { message?: string; details?: string };
  return x?.message ?? x?.details ?? tr('Server qabul qilmadi');
}
