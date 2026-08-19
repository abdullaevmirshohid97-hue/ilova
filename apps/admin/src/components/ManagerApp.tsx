import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Har bir bo'lim ochilganda yuklanadi — menejer kirishi bilan beshtasini
// birdan yuklab kutib turmaydi
const ManagerCustomers = lazy(() => import('../pages/ManagerCustomers'));
const ManagerPrices = lazy(() => import('../pages/ManagerPrices'));
const ManagerOrders = lazy(() => import('../pages/ManagerOrders'));
const ManagerAnalytics = lazy(() => import('../pages/ManagerAnalytics'));
const ManagerSettings = lazy(() => import('../pages/ManagerSettings'));

type Tab = 'customers' | 'prices' | 'orders' | 'analytics' | 'settings';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'customers', icon: '👥', label: 'Mijozlarim' },
  { key: 'prices', icon: '🏷️', label: 'Narxlarim' },
  { key: 'orders', icon: '🧾', label: 'Buyurtmalarim' },
  { key: 'analytics', icon: '📊', label: 'Tahlil' },
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
        <div className="mt-1 text-xs text-white/40">Menejer{name ? ` — ${name}` : ''}</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
              tab === t.key ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
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

// Menejerning cheklangan paneli — to'liq admin Layout/sidebar'dan alohida,
// chunki menejer faqat o'z narxi, o'z mijozlarining buyurtmalari va o'z
// sozlamalariga kirish huquqiga ega — boshqa hech narsa yo'q.
export default function ManagerApp() {
  const [name, setName] = useState('');
  const [tab, setTab] = useState<Tab>('customers');
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
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center text-gray-400">
                Yuklanmoqda...
              </div>
            }
          >
            {tab === 'customers' && <ManagerCustomers />}
            {tab === 'prices' && <ManagerPrices />}
            {tab === 'orders' && <ManagerOrders />}
            {tab === 'analytics' && <ManagerAnalytics />}
            {tab === 'settings' && <ManagerSettings />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
