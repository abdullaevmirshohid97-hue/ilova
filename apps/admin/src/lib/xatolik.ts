import { supabase } from './supabase';

// Admin paneli uchun xatolik telemetriyasi — mobil ilovadagi bilan bir xil
// qoidalar: hech qachon panelni buzmaydi, bir xil xatoni takror yubormaydi,
// kutilgan xatolarni (internet yo'q, parol noto'g'ri) yubormaydi.

const yuborilgan = new Map<string, number>();
const TAKROR_MS = 5 * 60 * 1000;

const JIM = [
  'network request failed',
  'failed to fetch',
  'load failed',
  'aborted',
  'invalid login credentials',
  'timeout',
  'resizeobserver loop',
];

export function xatoYubor(e: unknown, joy?: string, qoshimcha?: Record<string, unknown>) {
  try {
    const xabar = e instanceof Error ? e.message : String(e ?? '');
    if (!xabar) return;
    if (JIM.some((j) => xabar.toLowerCase().includes(j))) return;

    // Sahifa manzili ekran nomi vazifasini bajaradi
    const ekran = joy ?? (typeof location !== 'undefined' ? location.hash || location.pathname : '');
    const kalit = `${ekran}|${xabar.slice(0, 200)}`;
    if (Date.now() - (yuborilgan.get(kalit) ?? 0) < TAKROR_MS) return;
    yuborilgan.set(kalit, Date.now());

    void supabase.rpc('report_client_error', {
      p_app: 'admin',
      p_message: xabar,
      p_screen: ekran || null,
      p_stack: e instanceof Error ? (e.stack ?? null) : null,
      p_platform: 'web',
      p_app_version: import.meta.env.VITE_APP_VERSION ?? 'dev',
      p_extra: qoshimcha ?? null,
    });
  } catch {
    // telemetriya jim yiqiladi
  }
}

export function telemetriyaniYoq() {
  window.addEventListener('error', (ev) => xatoYubor(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => xatoYubor(ev.reason, undefined, { turi: 'promise' }));
}
