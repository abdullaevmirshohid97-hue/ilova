// =============================================================
//  FAYLNI FOYDALANUVCHIGA BERISH
//
//  Hisobot MATNI alohida faylda (hisobot.ts) — u sof mantiq va
//  sinovdan chaqiriladi. Bu yerda esa qurilmaga bogliq qism:
//  React Native va Expo modullari. Ikkisi bir faylda tursa,
//  sinov `react-native` ni yecholmay yiqilardi.
// =============================================================

import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { faylNomi } from '@ilova/kassa-yadro';
import { tr } from './til';

const TURLAR = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

/**
 * Faylni foydalanuvchiga beradi.
 *
 * Android/iOS — vaqtinchalik papkaga yozib, tizim "ulashish" oynasini
 * ochadi (Telegram, pochta, Drive...). Web — oddiy yuklab olish.
 *
 * Brauzerda `Sharing` ishlamaydi, telefonda esa `document` yo'q —
 * shuning uchun ikki yo'l ochiq yozilgan, "ishlasa kerak" degan
 * taxmin bilan emas.
 */
export async function ulash(
  nom: string,
  bayt: Uint8Array,
  tur: keyof typeof TURLAR,
): Promise<void> {
  const toza = `${faylNomi(nom)}.${tur}`;

  if (Platform.OS === 'web') {
    const blob = new Blob([bayt as unknown as BlobPart], { type: TURLAR[tur] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = toza;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Darhol bo'shatilsa Safari faylni ulgurmay qoladi
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  const fayl = new File(Paths.cache, toza);
  if (fayl.exists) fayl.delete();
  fayl.create();
  fayl.write(bayt);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(tr('Bu qurilmada fayl ulashish yo‘q'));
  }
  await Sharing.shareAsync(fayl.uri, { mimeType: TURLAR[tur], dialogTitle: toza });
}
