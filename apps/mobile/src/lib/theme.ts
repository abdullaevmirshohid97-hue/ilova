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

export const ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Kutilmoqda', color: '#B7791F', bg: C.yellowSoft },
  confirmed: { label: 'Qabul qilindi', color: C.green, bg: C.greenSoft },
  picking: { label: "Yig'ilmoqda", color: C.blue, bg: '#E8F0FF' },
  done: { label: 'Yopilgan', color: C.muted, bg: '#F0F1F6' },
  cancelled: { label: 'Bekor qilingan', color: C.red, bg: C.redSoft },
};

export const LEDGER_KIND: Record<string, { label: string; icon: string }> = {
  order_debt: { label: 'Buyurtma', icon: '📦' },
  payment: { label: "To'lov", icon: '💵' },
  discount: { label: 'Chegirma', icon: '🎁' },
  adjustment: { label: 'Tuzatish', icon: '✏️' },
  cancel_reversal: { label: 'Bekor qilindi', icon: '↩️' },
};
