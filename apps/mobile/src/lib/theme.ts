export const C = {
  bg: '#0f1115',
  card: '#171a21',
  border: '#2a2f3a',
  divider: '#232834',
  text: '#ffffff',
  text2: '#d7dbe4',
  muted: '#8b93a7',
  faint: '#5b6272',
  primary: '#2563eb',
  green: '#4ade80',
  red: '#f87171',
  yellow: '#facc15',
} as const;

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: 'Kutilmoqda', color: C.yellow },
  confirmed: { label: 'Qabul qilindi', color: C.green },
  picking: { label: "Yig'ilmoqda", color: C.primary },
  done: { label: 'Yopilgan', color: C.muted },
  cancelled: { label: 'Bekor qilingan', color: C.red },
};
