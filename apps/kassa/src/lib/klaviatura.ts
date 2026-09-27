// =============================================================
//  KLAVIATURA BALANDLIGI
//
//  NEGA BU FAYL BOR — 2026-09-27 dagi kritik xato.
//
//  Foydalanuvchi: «APK da login-parol tergandan keyin KIRISH
//  tugmasi yo'q». Webda bor. Ya'ni odam ilovaga umuman kira
//  olmaydi.
//
//  Tugma o'z joyida edi. Sabab boshqa: `app.json` da
//  `edgeToEdgeEnabled: true` (Expo SDK 54, Android 15 buni
//  talab qiladi). Edge-to-edge da klaviatura chiqqanda Android
//  oynani QAYTA O'LCHAMAYDI — `adjustResize` manifestda turgani
//  bilan ish ko'rmaydi. Klaviatura shunchaki ekran USTIGA
//  tushadi va pastdagi hamma narsani — kirish tugmasini ham —
//  bosib qoladi.
//
//  `KeyboardAvoidingView` ni `behavior={Platform.OS === 'ios' ?
//  'padding' : undefined}` bilan ishlatish AYNAN shu sababdan
//  xato: Android'da `undefined` «operatsion tizim o'zi hal
//  qiladi» degani, edge-to-edge da esa u hech narsa qilmaydi.
//
//  Shuning uchun balandlik hodisadan olinadi va pastdan bo'shliq
//  QO'LDA qo'yiladi. Bu ikki holatda ham to'g'ri ishlaydi:
//  oyna qayta o'lchansa ham, o'lchanmasa ham.
//
//  iOS da `Will` hodisalari olinadi: ular animatsiya BOSHIDA
//  keladi va ekran klaviatura bilan birga siljiydi. Android'da
//  `Will` yo'q, faqat `Did` bor.
// =============================================================

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Klaviatura balandligi (dp). Yopiq bo'lsa 0. */
export function useKlaviaturaBalandligi(): number {
  const [balandlik, setBalandlik] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const ochildi = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setBalandlik(e.endCoordinates?.height ?? 0);
    });
    const yopildi = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setBalandlik(0);
    });
    return () => {
      ochildi.remove();
      yopildi.remove();
    };
  }, []);

  return balandlik;
}
