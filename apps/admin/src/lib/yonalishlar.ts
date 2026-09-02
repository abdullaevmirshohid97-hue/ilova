// ============================================================================
// YO'NALISHLAR — platformadagi biznes tizimlari
//
// Bitta ro'yxat ikki joyda ishlatiladi:
//   1) super admin  — tenant yaratganda/tahrirlaganda qaysi tizim berilishi
//   2) tenant paneli — o'ziga berilgan tizimlarnigina ko'rsatish
//
// Ro'yxat shu faylda turishi shart: agar nomlar ikki joyda alohida yozilsa,
// bittasi o'zgarganda tenant "yo'q tizim"ga ega bo'lib qolardi va paneli
// bo'sh ochilardi.
//
// `modullar` bo'sh bo'lsa - tizim hali qurilmagan, kartochka "TEZ ORADA"
// bo'lib turadi. Bu ataylab: tenantga bermoqchi bo'lgan yo'nalishingiz
// ro'yxatda ko'rinib tursin, lekin ochilmasin.
// ============================================================================

export type YonalishKalit = 'dorixona' | 'sklad' | 'ishlab_chiqarish' | 'b2b' | 'marketplace';

export type TenantModul = { to: string; icon: string; label: string };

export type TenantYonalish = {
  key: YonalishKalit;
  belgi: string;
  nom: string;
  izoh: string;
  modullar: TenantModul[];
};

// Tenant panelining hozirgi sahifalari — ulgurji savdo tizimi.
// Yangi yo'nalish qurilganda o'z ro'yxati shu yerga qo'shiladi.
const B2B_MODULLAR: TenantModul[] = [
  { to: '/', icon: '📊', label: 'Boshqaruv' },
  { to: '/orders', icon: '🧾', label: 'Buyurtmalar' },
  { to: '/design-orders', icon: '🎨', label: 'Dizayn buyurtmalari' },
  { to: '/products', icon: '📦', label: 'Mahsulotlar & Ombor' },
  { to: '/inventory', icon: '📋', label: 'Ombor jurnali' },
  { to: '/customers', icon: '👥', label: 'Mijozlar' },
  { to: '/managers', icon: '🧑‍💼', label: 'Menejerlar' },
  { to: '/finance', icon: '💰', label: 'Moliya' },
  { to: '/reports', icon: '📈', label: 'Hisobotlar' },
  { to: '/settings', icon: '⚙️', label: 'Sozlamalar' },
];

export const TENANT_YONALISHLAR: TenantYonalish[] = [
  {
    key: 'b2b',
    belgi: '🧾',
    nom: 'B2B ULGURJI',
    izoh: 'katalog, buyurtma, mijoz narxlari, qarzdorlik',
    modullar: B2B_MODULLAR,
  },
  {
    key: 'dorixona',
    belgi: '⚕️',
    nom: 'DORIXONA',
    izoh: 'dori katalogi, skladlar, sotuv',
    // Bo'sh: dori tizimi hozircha bitta biznesga bog'langan (26 jadvalning
    // birortasida org_id yo'q). Tenantga ochish uchun avval ular
    // tenantlarga ajratilishi kerak - alohida ish.
    modullar: [],
  },
  { key: 'sklad', belgi: '📦', nom: 'SKLAD', izoh: 'ombor va qoldiq boshqaruvi', modullar: [] },
  {
    key: 'ishlab_chiqarish',
    belgi: '🏭',
    nom: 'ISHLAB CHIQARISH',
    izoh: 'ishlab chiqarish jarayoni',
    modullar: [],
  },
  { key: 'marketplace', belgi: '🛒', nom: 'MARKETPLACE', izoh: 'onlayn savdo maydoni', modullar: [] },
];

export function yonalishTop(key: string): TenantYonalish | undefined {
  return TENANT_YONALISHLAR.find((y) => y.key === key);
}

/** Tenantga berilgan yo'nalishlar — noma'lum kalitlar tashlab yuboriladi */
export function tenantYonalishlari(kalitlar: string[] | null | undefined): TenantYonalish[] {
  const bor = kalitlar ?? [];
  return TENANT_YONALISHLAR.filter((y) => bor.includes(y.key));
}

/** Shu yo'nalishga tegishli sahifami — noto'g'ri manzilga kirib ketmasin */
export function yonalishdaBormi(y: TenantYonalish, yol: string): boolean {
  return y.modullar.some((m) => (m.to === '/' ? yol === '/' : yol.startsWith(m.to)));
}
