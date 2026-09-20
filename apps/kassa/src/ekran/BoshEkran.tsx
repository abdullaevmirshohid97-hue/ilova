// =============================================================
//  BOSH EKRAN — ataylab BO‘SH
//
//  20.09 qarori: bosh sahifada hech narsa turmaydi.
//
//  Nega. Bu yerda ketma-ket balans, oylik kirim-chiqim, 7 kunlik
//  grafik, qarz va hisoblar turgan edi. Har biri alohida foydali,
//  lekin birgalikda ular ilovani «hisobot» qilib qo‘yardi —
//  odam esa uni yozuv qo‘shish uchun ochadi. Endi ochilganda
//  ko‘zni chalg‘itadigan narsa yo‘q: bitta suzuvchi tugma.
//
//  Ma’lumot yo‘qolgani yo‘q, u yon panelda:
//    Hisoblar  → ☰ › Hisoblar
//    Kirim/chiqim va qarz kesimi → ☰ › Hisobot
//    Kechikkan qarz → yuqoridagi qo‘ng‘iroq
//
//  Fayl ATAYLAB qoldirildi (o‘chirilmadi): bosh sahifaga nimadir
//  qaytarilsa, u shu yerga tushadi va qobiqni o‘zgartirish
//  kerak bo‘lmaydi.
// =============================================================

import { View } from 'react-native';
import { useTema } from '../lib/tema';

export default function BoshEkran() {
  const { C } = useTema();
  return <View style={{ flex: 1, backgroundColor: C.fon }} />;
}
