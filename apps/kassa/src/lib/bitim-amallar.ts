// =============================================================
//  BITIM USTIDAGI AMALLAR
//
//  Hujjat chiqarish va tasdiqlash havolasi. Ikkalasi ham
//  ekranga bog‘liq emas, shuning uchun `lib` da: ular hamkor
//  kartochkasidan ham, operatsiyalar ro‘yxatidan ham
//  chaqiriladi.
//
//  Avval `KontaktlarEkrani.tsx` ichida turgan edi va o‘sha
//  fayl bosh ekran qayta yozilganda o‘lik qolgandi.
// =============================================================

import { Share } from 'react-native';
import type { Bitim, Klient, Tolov } from '@ilova/kassa-yadro';
import { bitimPdf } from './hisobot';
import { xatoMatn } from './supabase';
import { taklifMatni, tasdiqHavolasi } from './tasdiq';
import { tr } from './til';
import { ulash } from './ulash';
import { Ogoh } from './ogoh';

export async function bitimHujjati(b: Bitim, tolovlar: Tolov[], hamkor: Klient | null, biznes: string) {
  try {
    const bayt = bitimPdf({ biznes, bitim: b, tolovlar, hamkor });
    const nom = `${hamkor?.ism ?? tr('Hamkor')}-${b.sana.slice(0, 10)}`;
    await ulash(nom, bayt, 'pdf');
  } catch (e) {
    Ogoh.alert(tr('Hujjat chiqmadi'), String((e as Error)?.message ?? e));
  }
}

export async function tasdiqYubor(b: Bitim, hamkor: Klient | null, biznes: string) {
  try {
    const { havola } = await tasdiqHavolasi(b.id);
    await Share.share({ message: taklifMatni(havola, biznes) });
  } catch (e) {
    const m = xatoMatn(e);
    Ogoh.alert(
      tr('Havola yaratilmadi'),
      m.includes('TASDIQ_KERAKMAS')
        ? tr('Bu bitim tasdiq kutmayapti')
        : m.includes('Network') || m.includes('network')
          ? tr('Internet kerak: havola serverda yaratiladi')
          : m,
    );
  }
  void hamkor;
}
