// ============================================================================
// SUPER-ADMIN TEMALARI — eDEX / shadcn / Healthcare
//
// Panel ranglari avval har faylda `const C = { neon: '#00e8c6', ... }` bo'lib
// yozilgan edi va har elementga `style` orqali qo'yilardi. Uchta tema uchun bu
// yo'l ishlamaydi: har rangni uch joyda saqlash kerak bo'lardi.
//
// Yechim: `C` ning qiymatlari endi CSS o'zgaruvchilariga havola. Ya'ni
// komponentlar umuman o'zgarmaydi — tema almashganda faqat o'zgaruvchilar
// qiymati almashadi. Rang, radius, shrift va hatto burchak kesimi (eDEX'ning
// belgisi) ham token.
//
// Shaffoflik: avval `${C.text}cc` kabi hex qo'shimchalar ishlatilgan edi, bu
// CSS o'zgaruvchisi bilan ishlamaydi (var(--x)cc — noto'g'ri). O'rniga sh()
// yordamchisi: color-mix orqali foizli shaffoflik.
// ============================================================================

export type Tema = 'edex' | 'shadcn' | 'healthcare';

export const TEMALAR: { key: Tema; nom: string; izoh: string }[] = [
  { key: 'edex', nom: 'eDEX', izoh: 'operator konsoli' },
  { key: 'shadcn', nom: 'shadcn', izoh: 'zamonaviy, bezaksiz' },
  { key: 'healthcare', nom: 'Healthcare', izoh: 'tinch, ko‘z charchamaydi' },
];

// Komponentlar shu obyektni ishlatadi — qiymatlar temaga qarab o'zgaradi
export const C = {
  bg: 'var(--sa-bg)',
  panel: 'var(--sa-panel)',
  panel2: 'var(--sa-panel2)',
  line: 'var(--sa-line)',
  neon: 'var(--sa-accent)',
  neon2: 'var(--sa-accent2)',
  text: 'var(--sa-text)',
  textBright: 'var(--sa-text-bright)',
  warn: 'var(--sa-warn)',
  danger: 'var(--sa-danger)',
  ok: 'var(--sa-accent)',
  // Accent ustidagi matn: qorong'i temada qora, yorug'ida oq
  onAccent: 'var(--sa-on-accent)',
  // Kiritish maydoni foni va zebra qatorlar
  field: 'var(--sa-field)',
  zebra: 'var(--sa-zebra)',
  overlay: 'var(--sa-overlay)',
} as const;

export const MONO = 'var(--sa-font-mono)';
export const SHRIFT = 'var(--sa-font)';

// Burchak kesimi — eDEX'da polygon, boshqalarda oddiy radius
export const KESIM = 'var(--sa-clip)';
export const KESIM_KICHIK = 'var(--sa-clip-sm)';
export const RADIUS = 'var(--sa-radius)';

/** Shaffoflik: sh(C.text, 60) -> 60% ko'rinadigan rang */
export function sh(rang: string, foiz: number): string {
  return `color-mix(in srgb, ${rang} ${foiz}%, transparent)`;
}

// ---------------------------------------------------------------- temalar
const CSS = `
[data-sa-tema="edex"] {
  --sa-bg: #05080a;
  --sa-panel: #0a1014;
  --sa-panel2: #0d151a;
  --sa-line: #16323a;
  --sa-accent: #00e8c6;
  --sa-accent2: #05d1ff;
  --sa-text: #8fa8b0;
  --sa-text-bright: #d6ebf0;
  --sa-warn: #ffb454;
  --sa-danger: #ff3b5c;
  --sa-field: #060b0e;
  --sa-font: ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
  --sa-font-mono: ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
  --sa-radius: 0px;
  --sa-clip: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  --sa-clip-sm: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  --sa-on-accent: #05080a;
  --sa-zebra: #0a1014;
  --sa-overlay: rgba(2, 6, 8, 0.82);
  --sa-glow: 1;
}

/* shadcn: oq fon, neytral kulranglar, yumshoq chegara, bezaksiz */
[data-sa-tema="shadcn"] {
  --sa-bg: #f8fafc;
  --sa-panel: #ffffff;
  --sa-panel2: #f8fafc;
  --sa-line: #e2e8f0;
  --sa-accent: #0f172a;
  --sa-accent2: #475569;
  --sa-text: #64748b;
  --sa-text-bright: #0f172a;
  --sa-warn: #b45309;
  --sa-danger: #be123c;
  --sa-field: #ffffff;
  --sa-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --sa-font-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  --sa-radius: 8px;
  --sa-clip: none;
  --sa-clip-sm: none;
  --sa-on-accent: #ffffff;
  --sa-zebra: #f8fafc;
  --sa-overlay: rgba(15, 23, 42, 0.45);
  --sa-glow: 0;
}

/* Healthcare: tinch yashil-ko'k, kattaroq matn, keng oraliq */
[data-sa-tema="healthcare"] {
  --sa-bg: #f2f7f6;
  --sa-panel: #ffffff;
  --sa-panel2: #eef5f4;
  --sa-line: #d3e3e0;
  --sa-accent: #0e7c6b;
  --sa-accent2: #2b6cb0;
  --sa-text: #5b7a76;
  --sa-text-bright: #14312c;
  --sa-warn: #a16207;
  --sa-danger: #b3261e;
  --sa-field: #ffffff;
  --sa-font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --sa-font-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  --sa-radius: 12px;
  --sa-clip: none;
  --sa-clip-sm: none;
  --sa-on-accent: #ffffff;
  --sa-zebra: #f7fbfa;
  --sa-overlay: rgba(20, 49, 44, 0.45);
  --sa-glow: 0;
}

/* Yorug' temalarda neon soyalar o'rinsiz — ular faqat eDEX uchun */
[data-sa-tema="shadcn"] *, [data-sa-tema="healthcare"] * {
  text-shadow: none !important;
}
[data-sa-tema="healthcare"] { font-size: 15.5px; }
`;

const KALIT = 'ilova.sa.tema';

/** Temani qo'llaydi va eslab qoladi */
export function temaniQoy(t: Tema) {
  const el = document.getElementById('sa-tema-root') ?? document.documentElement;
  el.setAttribute('data-sa-tema', t);
  try {
    localStorage.setItem(KALIT, t);
  } catch {
    // maxfiylik rejimida localStorage yopiq bo'lishi mumkin — tema ishlayveradi
  }
}

export function temaniOl(): Tema {
  try {
    const t = localStorage.getItem(KALIT) as Tema | null;
    if (t && TEMALAR.some((x) => x.key === t)) return t;
  } catch {
    // e'tibor bermaymiz
  }
  return 'edex';
}

/** Tema CSS'ini sahifaga bir marta qo'shadi */
export function temaCssniUlash() {
  if (document.getElementById('sa-tema-css')) return;
  const style = document.createElement('style');
  style.id = 'sa-tema-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}
