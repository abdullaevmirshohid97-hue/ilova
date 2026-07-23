import type { TranslationKey } from './i18n';

// Uzum/WB/Ozon marketplace uslubidagi yorug' tema
export const C = {
  bg: '#F2F3F7',
  card: '#FFFFFF',
  border: '#E9EAF2',
  divider: '#F0F1F6',
  text: '#14151A',
  text2: '#3B3E48',
  muted: '#8E92A3',
  faint: '#B9BDCC',
  primary: '#7000FF', // Uzum binafsha
  primarySoft: '#F3EBFF',
  accent: '#CB11AB', // WB magenta
  blue: '#005BFF', // Ozon ko'k
  green: '#0DB459',
  greenSoft: '#E7F8EE',
  red: '#F0384A',
  redSoft: '#FEECEE',
  yellow: '#FFA800',
  yellowSoft: '#FFF4DC',
} as const;

// label endi tarjima kaliti (i18n.tsx) — matn t(labelKey) orqali olinadi
export const ORDER_STATUS: Record<string, { labelKey: TranslationKey; color: string; bg: string }> = {
  new: { labelKey: 'statusNew', color: '#B7791F', bg: C.yellowSoft },
  confirmed: { labelKey: 'statusConfirmed', color: C.green, bg: C.greenSoft },
  picking: { labelKey: 'statusPicking', color: C.blue, bg: '#E8F0FF' },
  done: { labelKey: 'statusDone', color: C.muted, bg: '#F0F1F6' },
  cancelled: { labelKey: 'statusCancelled', color: C.red, bg: C.redSoft },
};

export const DESIGN_ORDER_STATUS: Record<string, { labelKey: TranslationKey; color: string; bg: string }> = {
  new: { labelKey: 'statusNew', color: '#B7791F', bg: C.yellowSoft },
  in_production: { labelKey: 'statusInProduction', color: C.blue, bg: '#E8F0FF' },
  ready: { labelKey: 'statusReady', color: C.green, bg: C.greenSoft },
  delivered: { labelKey: 'statusDelivered', color: C.muted, bg: '#F0F1F6' },
  cancelled: { labelKey: 'statusCancelled', color: C.red, bg: C.redSoft },
};

export const LEDGER_KIND: Record<string, { labelKey: TranslationKey; icon: string }> = {
  order_debt: { labelKey: 'kindOrderDebt', icon: '📦' },
  payment: { labelKey: 'kindPayment', icon: '💵' },
  discount: { labelKey: 'kindDiscount', icon: '🎁' },
  adjustment: { labelKey: 'kindAdjustment', icon: '✏️' },
  cancel_reversal: { labelKey: 'kindCancelReversal', icon: '↩️' },
};
