import { supabase } from './supabase';

// Xatolik telemetriyasi — "qaysi ekran necha marta yiqilyapti" degan
// savolga javob beradi. Uch qoida:
//   1. Hech qachon ilovani buzmaydi — o'zi xato bersa ham jim qoladi.
//   2. Bir xil xato takror-takror yuborilmaydi (5 daqiqalik eslash).
//   3. Kutilgan xatolar (internet yo'q, parol noto'g'ri) yuborilmaydi —
//      ular bug emas, ular hayotning oddiy holati.

const yuborilgan = new Map<string, number>();
const TAKROR_MS = 5 * 60 * 1000;

// Bug emas, shunchaki holat: bularni yuborsak jurnal shovqinga to'ladi
const JIM = [
  'network request failed',
  'failed to fetch',
  'load failed',
  'aborted',
  'invalid login credentials',
  'timeout',
];

let joriyEkran = '';

export function ekranBelgila(nom: string) {
  joriyEkran = nom;
}

export function xatoYubor(e: unknown, ekran?: string, qoshimcha?: Record<string, unknown>) {
  try {
    const xabar = e instanceof Error ? e.message : String(e ?? '');
    if (!xabar) return;

    const past = xabar.toLowerCase();
    if (JIM.some((j) => past.includes(j))) return;

    const kalit = `${ekran ?? joriyEkran}|${xabar.slice(0, 200)}`;
    const oxirgi = yuborilgan.get(kalit) ?? 0;
    if (Date.now() - oxirgi < TAKROR_MS) return;
    yuborilgan.set(kalit, Date.now());

    // Javobini kutmaymiz: telemetriya foydalanuvchini kutkazmasligi kerak
    void supabase.rpc('report_client_error', {
      p_app: 'mobile',
      p_message: xabar,
      p_screen: (ekran ?? joriyEkran) || null,
      p_stack: e instanceof Error ? (e.stack ?? null) : null,
      p_platform: platformaNomi(),
      p_app_version: VERSIYA,
      p_extra: qoshimcha ?? null,
    });
  } catch {
    // telemetriya hech qachon ilovani yiqitmasin
  }
}

export const VERSIYA = '1.0.0';

function platformaNomi(): string {
  try {
    // react-native'ni import qilmasdan: web'da ham, mobil'da ham ishlaydi
    const g = globalThis as any;
    if (g.navigator?.product === 'ReactNative') return 'react-native';
    if (typeof g.document !== 'undefined') return 'web';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Ilova ishga tushganda bir marta chaqiriladi: tutilmagan xatolarni ushlaydi
export function telemetriyaniYoq() {
  try {
    const g = globalThis as any;

    // React Native tomoni
    const EU = g.ErrorUtils;
    if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
      const eski = EU.getGlobalHandler();
      EU.setGlobalHandler((e: any, fatal?: boolean) => {
        xatoYubor(e, joriyEkran, { fatal: !!fatal });
        eski?.(e, fatal);
      });
    }

    // Web tomoni (Mini App ham shu yerga tushadi)
    if (typeof g.addEventListener === 'function') {
      g.addEventListener('error', (ev: any) => xatoYubor(ev?.error ?? ev?.message, joriyEkran));
      g.addEventListener('unhandledrejection', (ev: any) =>
        xatoYubor(ev?.reason, joriyEkran, { turi: 'promise' })
      );
    }
  } catch {
    // e'tibor bermaymiz
  }
}
