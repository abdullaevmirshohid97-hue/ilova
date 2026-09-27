// =============================================================
//  KLAVIATURALI — klaviatura bosmaydigan idish
//
//  Ekranning tashqi `View` i o'rniga qo'yiladi:
//
//      <Klaviaturali uslub={{ backgroundColor: C.fon }}>
//        ... sarlavha, ScrollView, pastdagi tugma ...
//      </Klaviaturali>
//
//  Pastdan klaviatura balandligicha bo'shliq qoldiradi, ya'ni
//  ichidagi `ScrollView` KICHRAYADI va tugmaga aylantirib
//  yetish mumkin bo'ladi. Edge-to-edge Android'da bu ISHNING
//  O'ZI: u yerda oyna o'zi qayta o'lchanmaydi.
//
//  Sababi `lib/klaviatura.ts` da yozilgan.
//
//  NEGA `KeyboardAvoidingView` emas: uning Android yo'li
//  `adjustResize` ga tayanadi, edge-to-edge da esa u ishlamaydi.
//  Bu yerda balandlik hodisadan olinadi va hech narsaga
//  tayanmaydi.
// =============================================================

import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useKlaviaturaBalandligi } from '../lib/klaviatura';

export function Klaviaturali({
  children,
  uslub,
}: {
  children: ReactNode;
  uslub?: StyleProp<ViewStyle>;
}) {
  const past = useKlaviaturaBalandligi();
  return <View style={[{ flex: 1 }, uslub, { paddingBottom: past }]}>{children}</View>;
}
