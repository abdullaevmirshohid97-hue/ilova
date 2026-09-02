import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// ============================================================================
// XABAR VA TASDIQLASH
//
// Avval panel brauzerning o'z oynachalari bilan gaplashardi: 33 ta
// alert() va 35 ta confirm(). Uch muammo bor edi:
//
//  1. Ular panelning ko'rinishidan butunlay boshqacha — kulrang tizim
//     oynasi va ustida sayt manzili yozilgan.
//  2. confirm() matnini bezash mumkin emas: "O'chirilsinmi?" deb
//     so'raydi, lekin NIMA o'chirilayotganini ajratib ko'rsatolmaydi.
//  3. Telefonda ular ekranni bosib qoladi va sahifa bilan birga
//     harakatlanmaydi.
//
// Bu yerda ikkalasi ham panel ichida. `tasdiqla` va'da qaytaradi,
// ya'ni chaqiruv joyi deyarli o'zgarmaydi:
//     if (!confirm('...')) return;
//     if (!(await tasdiqla('...'))) return;
// ============================================================================

type XabarTuri = 'ok' | 'xato' | 'oddiy';

type Tasdiq = {
  matn: string;
  tafsilot?: string;
  tugma?: string;
  xavfli?: boolean;
  hal: (javob: boolean) => void;
};

type Kontekst = {
  xabar: (matn: string, turi?: XabarTuri) => void;
  tasdiqla: (
    matn: string,
    ixtiyoriy?: { tafsilot?: string; tugma?: string; xavfli?: boolean },
  ) => Promise<boolean>;
};

const Ctx = createContext<Kontekst | null>(null);

/** Panelning istalgan joyidan: const { xabar, tasdiqla } = useXabar(); */
export function useXabar(): Kontekst {
  const c = useContext(Ctx);
  if (!c) throw new Error('useXabar faqat XabarProvider ichida ishlaydi');
  return c;
}

let keyingiId = 1;

export function XabarProvider({ children }: { children: ReactNode }) {
  const [toastlar, setToastlar] = useState<{ id: number; matn: string; turi: XabarTuri }[]>([]);
  const [tasdiq, setTasdiq] = useState<Tasdiq | null>(null);

  const xabar = useCallback((matn: string, turi: XabarTuri = 'oddiy') => {
    const id = keyingiId++;
    setToastlar((s) => [...s, { id, matn, turi }]);
    // Xato xabarini uzoqroq ko'rsatamiz: odam uni o'qib ulgurishi kerak
    window.setTimeout(() => setToastlar((s) => s.filter((t) => t.id !== id)), turi === 'xato' ? 6000 : 3500);
  }, []);

  const tasdiqla = useCallback(
    (matn: string, ixtiyoriy?: { tafsilot?: string; tugma?: string; xavfli?: boolean }) =>
      new Promise<boolean>((hal) => setTasdiq({ matn, ...ixtiyoriy, hal })),
    [],
  );

  // useMemo bo'lmasa har render'da yangi obyekt tug'iladi va ko'prik
  // effekti keraksiz qayta ishlaydi
  const qiymat = useMemo(() => ({ xabar, tasdiqla }), [xabar, tasdiqla]);

  return (
    <Ctx.Provider value={qiymat}>
      <KopriUlash qiymat={qiymat} />
      {children}

      {/* Toastlar — o'ngdan pastda, sahifa bilan birga */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toastlar.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
              t.turi === 'ok'
                ? 'bg-green-600 text-white'
                : t.turi === 'xato'
                  ? 'bg-red-600 text-white'
                  : 'bg-navy text-white'
            }`}
          >
            {t.matn}
          </div>
        ))}
      </div>

      {tasdiq && <TasdiqOynasi tasdiq={tasdiq} onYopish={() => setTasdiq(null)} />}
    </Ctx.Provider>
  );
}

function TasdiqOynasi({ tasdiq, onYopish }: { tasdiq: Tasdiq; onYopish: () => void }) {
  const oyna = useRef<HTMLDivElement>(null);
  const tugma = useRef<HTMLButtonElement>(null);

  function javob(v: boolean) {
    tasdiq.hal(v);
    onYopish();
  }

  // Klaviatura: Escape yopadi, Tab oynadan chiqib ketmaydi.
  // Kun bo'yi ma'lumot kirituvchi xodim uchun bu sichqonchaga ortiqcha
  // qo'l uzatmaslik demak.
  useEffect(() => {
    tugma.current?.focus();
    function tugmacha(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        javob(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const el = oyna.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea');
      if (!el?.length) return;
      const birinchi = el[0];
      const oxirgi = el[el.length - 1];
      if (e.shiftKey && document.activeElement === birinchi) {
        e.preventDefault();
        oxirgi.focus();
      } else if (!e.shiftKey && document.activeElement === oxirgi) {
        e.preventDefault();
        birinchi.focus();
      }
    }
    document.addEventListener('keydown', tugmacha);
    return () => document.removeEventListener('keydown', tugmacha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasdiq]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && javob(false)}
    >
      <div
        ref={oyna}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="text-base font-bold text-gray-900">{tasdiq.matn}</div>
        {tasdiq.tafsilot && <p className="mt-2 text-sm text-gray-500">{tasdiq.tafsilot}</p>}

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => javob(false)}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Bekor
          </button>
          <button
            ref={tugma}
            onClick={() => javob(true)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white ${
              tasdiq.xavfli ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:opacity-90'
            }`}
          >
            {tasdiq.tugma ?? 'Ha'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// React'dan tashqarida ishlatish
//
// Ba'zi yordamchilar komponent emas (lib/hujjat.ts dagi oyna ochish kabi)
// va ular hook chaqira olmaydi. Provider o'z funksiyalarini shu yerga
// qo'yib qo'yadi, ular esa shu orqali murojaat qiladi.
//
// Provider hali ulanmagan bo'lsa - brauzer oynasiga qaytamiz: xabar
// butunlay yo'qolib ketgandan ko'ra ko'rinmasi yaxshiroq.
// ---------------------------------------------------------------------------
let kopri: Kontekst | null = null;

export function xabarKorsat(matn: string, turi: XabarTuri = 'oddiy') {
  if (kopri) kopri.xabar(matn, turi);
  else alert(matn);
}

export function tasdiqlaSoz(matn: string): Promise<boolean> {
  if (kopri) return kopri.tasdiqla(matn);
  return Promise.resolve(confirm(matn));
}

/** Provider ichida chaqiriladi — ko'prikni ulaydi */
export function KopriUlash({ qiymat }: { qiymat: Kontekst }) {
  useEffect(() => {
    kopri = qiymat;
    return () => {
      kopri = null;
    };
  }, [qiymat]);
  return null;
}
