// =============================================================
//  CLARY — DIZAYN TIZIMI
//
//  Kassa ilovasining UI qismlari shu yerdan BIR joyga yig'iladi
//  va brauzer uchun chiqariladi (react-native-web).
//
//  MUHIM: bu yerda komponent YOZILMAYDI. Hammasi
//  `apps/kassa/src/ui/` dagi HAQIQIY fayllardan qayta
//  eksport qilinadi. Ya'ni dizayn tizimi va ilova bir xil
//  koddan yuradi — nusxa yo'q, ikkisi ajralib ketolmaydi.
//
//  Kirmaganlar va sababi:
//   · SinxBelgi   — `useHolat()` ni chaqiradi, u provayder
//                   bo'lmasa `throw` qiladi. Bu dizayn qismi
//                   emas, sinx holati ko'rsatkichi.
//   · uslublar()  — komponent emas, uslub qaytaradigan funksiya
//                   (baribir kichik harfda, konvertor olmaydi).
// =============================================================

import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TemaKontekst, YORUG, QORONGI, SHIFO, SHIFO_TUN, O } from '../../apps/kassa/src/lib/tema';
import type { Ranglar, TemaRejimi, TemaHolati } from '../../apps/kassa/src/lib/tema';

// ---------- Oddiy qismlar ----------
export {
  Chip,
  Karta,
  Sarlavha,
  BoshHolat,
  Tugma,
  Tanlagich,
  Qator,
  YigindiPaneli,
  DavrOqlari,
  uslublar,
} from '../../apps/kassa/src/ui/qismlar';

// ---------- Ikonkalar ----------
// Hammasi View bilan chizilgan: ikonka kutubxonasi yo'q,
// shuning uchun ular hech qanday shriftga bog'liq emas.
export {
  Menyu,
  Lupa,
  Qongiroq,
  UchNuqta,
  Orqaga,
  Dokon,
  Ruchka,
  Chiqindi,
  Kitob,
} from '../../apps/kassa/src/ui/ikonka';

// ---------- Tuzilma ----------
export { YuqoriQator } from '../../apps/kassa/src/ui/YuqoriQator';
export { YonPanel } from '../../apps/kassa/src/ui/YonPanel';
export { BildirishnomaOyna, AmallarMenyusi } from '../../apps/kassa/src/ui/YuqoriOynalar';

// ---------- Ma'lumot qatorlari ----------
export { BitimQatori } from '../../apps/kassa/src/ui/BitimQatori';
export { YozuvQatori } from '../../apps/kassa/src/ui/YozuvQatori';
export { MijozRasmi } from '../../apps/kassa/src/ui/MijozRasmi';
export { MuddatMaydoni } from '../../apps/kassa/src/ui/MuddatMaydoni';

// ---------- Xatoni ushlagich ----------
export { default as XatoQalqoni } from '../../apps/kassa/src/ui/XatoQalqoni';

// ---------- Tokenlar ----------
export { YORUG, QORONGI, SHIFO, SHIFO_TUN, O, TemaKontekst };
export type { Ranglar, TemaRejimi, TemaHolati };

/**
 * Dizayn tizimining ILDIZ o'rovchisi.
 *
 * Ikki narsa beradi:
 *  1. `SafeAreaProvider` — uchta qism `useSafeAreaInsets()` ni
 *     chaqiradi. Usiz ular chizilmaydi.
 *  2. Tema — `TemaKontekst` ning o'z standart qiymati bor
 *     (YORUG), ya'ni provayder shart emas. Lekin qorong'i
 *     rejimni ko'rsatish uchun shu yerdan beriladi.
 *
 * `initialMetrics` ataylab qo'lda berilgan: brauzerda
 * `SafeAreaProvider` o'lchovni asinxron oladi va o'lchanmaguncha
 * bolalarini CHIZMAYDI — kartochka bo'sh bo'lib qolardi.
 */
export function DizaynIldiz({
  children,
  qorongi = false,
}: {
  children: ReactNode;
  /** true — qorong'i tema */
  qorongi?: boolean;
}) {
  const tema: TemaHolati = {
    C: qorongi ? QORONGI : YORUG,
    rejim: qorongi ? 'qorongi' : 'yorug',
    qorongi,
    qoy: () => {},
  };
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <TemaKontekst.Provider value={tema}>{children}</TemaKontekst.Provider>
    </SafeAreaProvider>
  );
}
