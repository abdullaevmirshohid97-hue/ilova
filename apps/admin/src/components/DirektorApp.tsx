import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ChangePasswordPanel from './ChangePasswordPanel';

// Direktor paneli — KUZATUV rejimi.
//
// Menejer paneli (ManagerApp) naqshi bo'yicha: to'liq admin Layout'dan
// alohida. Sabab bir xil — admin menyusiga shart qo'yib bo'limlarni
// yashirish xavfli, chunki bitta shart unutilsa yozish ekrani ochilib
// qoladi. Bu yerda o'zgartirish ekranlari umuman ulanmagan.
//
// Ekranlar admin bilan bir xil komponentlardan: Dashboard, Reports va
// Finance faqat o'qiydi (ularda hech qanday yozish tugmasi yo'q —
// tekshirilgan). Buyurtmalar esa alohida, tugmasiz ekran.
const Dashboard = lazy(() => import('../pages/Dashboard'));
const DirektorBuyurtmalar = lazy(() => import('../pages/DirektorBuyurtmalar'));
const Finance = lazy(() => import('../pages/Finance'));
const Reports = lazy(() => import('../pages/Reports'));

type Tab = 'dashboard' | 'orders' | 'reports' | 'finance' | 'settings';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'dashboard', icon: '📊', label: 'Tahlil' },
  { key: 'orders', icon: '🧾', label: 'Buyurtmalar' },
  { key: 'reports', icon: '📈', label: 'Hisobotlar' },
  { key: 'finance', icon: '💰', label: 'Moliya' },
  { key: 'settings', icon: '⚙️', label: 'Sozlamalar' },
];

function SidebarNav({
  name,
  tab,
  onSelect,
}: {
  name: string;
  tab: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <>
      <div className="px-6 py-6">
        <div className="text-xl font-extrabold tracking-wide">YUKCHIBOLLA</div>
        <div className="mt-1 text-xs text-white/55">Direktor{name ? ` — ${name}` : ''}</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
              tab === t.key
                ? 'bg-white/10 text-white'
                : 'text-white/55 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mx-3 mb-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-300 hover:bg-white/5"
      >
        🚪 Chiqish
      </button>
    </>
  );
}

function Sozlamalar() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="font-bold text-amber-900">👁️ Kuzatuv rejimi</h3>
        <p className="mt-1 text-sm text-amber-800">
          Siz korxonaning ishini ko‘rasiz: buyurtmalar, sotuv, tahlil, hisobot va moliya.
          Ma’lumotni o‘zgartirish huquqi yo‘q — o‘zgartirish kerak bo‘lsa administratorga
          murojaat qiling. Bu yerda faqat o‘z parolingizni almashtira olasiz.
        </p>
      </div>
      <ChangePasswordPanel />
    </div>
  );
}

export default function DirektorApp() {
  const [name, setName] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setName(((data.user?.user_metadata as any)?.full_name as string) ?? '');
    });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Planshet/kompyuter — doimiy sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy text-white md:flex">
        <SidebarNav name={name} tab={tab} onSelect={setTab} />
      </aside>

      {/* Telefon — gamburger bilan ochiladigan drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col bg-navy text-white shadow-2xl">
            <SidebarNav
              name={name}
              tab={tab}
              onSelect={(t) => {
                setTab(t);
                setDrawerOpen(false);
              }}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 md:h-16 md:px-8">
          <button
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 shrink-0 rounded-lg p-2 text-xl text-gray-500 hover:bg-gray-100 md:hidden"
            aria-label="Menyu"
          >
            ☰
          </button>
          <h1 className="flex-1 truncate text-base font-bold text-gray-900 md:text-lg">
            {TABS.find((t) => t.key === tab)?.label}
          </h1>
          <span className="hidden shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 sm:inline">
            Kuzatuv rejimi
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center text-gray-500">
                Yuklanmoqda...
              </div>
            }
          >
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'orders' && <DirektorBuyurtmalar />}
            {tab === 'reports' && <Reports />}
            {tab === 'finance' && <Finance />}
            {tab === 'settings' && <Sozlamalar />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
