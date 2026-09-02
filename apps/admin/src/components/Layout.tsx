import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { TenantYonalish } from '../lib/yonalishlar';

// Qisqa "bip" ovozi — audio fayl kerak emas, Web Audio API bilan yasaladi
function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // audio ishlamasa ham signal (notification/badge) davom etadi
  }
}

// Menyu ro'yxati endi shu faylda emas: u tenantga BERILGAN yo'nalishdan
// keladi (lib/yonalishlar.ts). Sabab: bir tenantga ulgurji savdo, boshqasiga
// ishlab chiqarish berilishi mumkin va menyu shunga qarab o'zgaradi.

const TITLES: Record<string, string> = {
  '/': 'Boshqaruv paneli',
  '/pos': 'Sotuv — kassa',
  '/orders': 'Buyurtmalar',
  '/design-orders': 'Dizayn buyurtmalari',
  '/products': 'Mahsulotlar va ombor',
  '/inventory': 'Ombor jurnali',
  '/customers': 'Mijozlar',
  '/managers': 'Menejerlar',
  '/finance': 'Moliya',
  '/reports': 'Hisobotlar',
  '/maosh': 'Maosh va xodimlar',
  '/settings': 'Sozlamalar',
};

// Sidebar ichidagi tarkib — ham doimiy (planshet/kompyuter) sidebar'da,
// ham telefon drawer'ida ishlatiladi (mobil ilovadagi DrawerBody naqshi)
function SidebarContent({
  role,
  yonalish,
  koproqYonalish,
  onYonalishlar,
  newCount,
  onNavigate,
}: {
  role: string;
  yonalish: TenantYonalish;
  koproqYonalish: boolean;
  onYonalishlar: () => void;
  newCount: number;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-6 py-6">
        <div className="text-xl font-extrabold tracking-wide">YUKCHIBOLLA</div>
        <div className="mt-1 text-xs text-white/55">
          {role === 'super_admin' ? 'Super administrator' : 'Administrator'}
        </div>
      </div>

      {/* Qaysi tizimda ishlayotgani. Bir nechta yo'nalish berilgan bo'lsa
          shu yerdan almashtiriladi; bittagina bo'lsa tugma keraksiz. */}
      <div className="px-3 pb-3">
        <button
          onClick={koproqYonalish ? onYonalishlar : undefined}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${
            koproqYonalish ? 'hover:bg-white/5' : 'cursor-default'
          }`}
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          <span className="text-base">{yonalish.belgi}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-widest text-white/55">Tizim</span>
            <span className="block truncate text-sm font-bold text-white">{yonalish.nom}</span>
          </span>
          {koproqYonalish && <span className="text-white/55">⇄</span>}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {yonalish.modullar.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/55 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <span className="text-base">{n.icon}</span>
            {n.label}
            {n.to === '/orders' && newCount > 0 && (
              <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                {newCount}
              </span>
            )}
          </NavLink>
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

export default function Layout({
  role,
  yonalish,
  koproqYonalish,
  onYonalishlar,
  children,
}: {
  role: string;
  yonalish: TenantYonalish;
  koproqYonalish: boolean;
  onYonalishlar: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const [newCount, setNewCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sahifa almashganda telefon drawer'i avtomatik yopiladi
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    async function refreshCount() {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new');
      if (mounted) setNewCount(count ?? 0);
    }
    refreshCount();

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const ch = supabase
      .channel('orders-signal')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        refreshCount();
        beep();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const num = (payload.new as any)?.order_number;
          new Notification('🛎 Yangi buyurtma!', {
            body: num ? `Buyurtma №${num} tushdi` : 'Yangi buyurtma tushdi',
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, refreshCount)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, refreshCount)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Planshet/kompyuter — doimiy ko'rinadigan yon panel */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy text-white md:flex lg:w-64">
        <SidebarContent role={role} yonalish={yonalish} koproqYonalish={koproqYonalish} onYonalishlar={onYonalishlar} newCount={newCount} />
      </aside>

      {/* Telefon — gamburger bilan ochiladigan drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col bg-navy text-white shadow-2xl">
            <SidebarContent role={role} yonalish={yonalish} koproqYonalish={koproqYonalish} onYonalishlar={onYonalishlar} newCount={newCount} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Kontent */}
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
            {TITLES[pathname] ?? ''}
          </h1>
          <div className="hidden shrink-0 text-sm text-gray-500 sm:block">
            {new Date().toLocaleDateString('uz-UZ', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
