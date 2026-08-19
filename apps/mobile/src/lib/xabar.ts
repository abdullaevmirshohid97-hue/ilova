import { Alert, Platform } from 'react-native';

// react-native-web'da Alert.alert() BO'SH funksiya (`static alert() {}`) —
// ya'ni web va Telegram Mini App'da hech qanday xabar ko'rinmaydi va ilova
// "javob bermayotgandek" tuyuladi. Shu sabab hamma joyda shu helper
// ishlatiladi, to'g'ridan-to'g'ri Alert emas.
//
// Telegram Mini App WebView'ida window.alert ham bloklangan bo'lishi mumkin,
// shuning uchun avval Telegram'ning o'z API'si sinaladi.

type TgWebApp = {
  showAlert?: (msg: string, cb?: () => void) => void;
  showPopup?: (params: unknown, cb?: () => void) => void;
};

function tgWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  return (window as any)?.Telegram?.WebApp ?? null;
}

/** Bir tugmali xabar. Web/Mini App/native — hammasida ko'rinadi. */
export function xabar(sarlavha: string, matn?: string) {
  const toliq = matn ? `${sarlavha}\n\n${matn}` : sarlavha;

  if (Platform.OS !== 'web') {
    Alert.alert(sarlavha, matn);
    return;
  }

  const tg = tgWebApp();
  if (tg?.showAlert) {
    try {
      tg.showAlert(toliq);
      return;
    } catch {
      // Telegram API xato bersa oddiy yo'lga tushamiz
    }
  }
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(toliq);
  }
}

/** Ha/yo'q so'rovi. Native'da Alert tugmalari, web'da confirm. */
export function sorov(
  sarlavha: string,
  matn: string,
  haMatni: string,
  onHa: () => void,
  buzuvchi = false
) {
  if (Platform.OS !== 'web') {
    Alert.alert(sarlavha, matn, [
      { text: 'Bekor', style: 'cancel' },
      { text: haMatni, style: buzuvchi ? 'destructive' : 'default', onPress: onHa },
    ]);
    return;
  }
  if (typeof window !== 'undefined' && window.confirm(`${sarlavha}\n\n${matn}`)) onHa();
}
