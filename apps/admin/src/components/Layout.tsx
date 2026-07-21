import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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

const NAV = [
  { to: '/', icon: '📊', label: 'Boshqaruv' },
  { to: '/orders', icon: '🧾', label: 'Buyurtmalar' },
  { to: '/products', icon: '📦', label: 'Mahsulotlar & Ombor' },
  { to: '/inventory', icon: '📋', label: 'Ombor jurnali' },
  { to: '/customers', icon: '👥', label: 'Mijozlar' },
  { to: '/finance', icon: '💰', label: 'Moliya' },
];

const TITLES: Record<string, string> = {
  '/': 'Boshqaruv paneli',
  '/orders': 'Buyurtmalar',
  '/products': 'Mahsulotlar va ombor',
  '/inventory': 'Ombor jurnali',
  '/customers': 'Mijozlar',
  '/finance': 'Moliya',
};

export default function Layout({ role, children }: { role: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const [newCount, setNewCount] = useState(0);

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
      {/* Yon panel — navy, CEO uslubi */}
      <aside className="flex w-64 shrink-0 flex-col bg-navy text-white">
        <div className="px-6 py-6">
          <div className="text-xl font-extrabold tracking-wide">
            ILOVA <span className="text-brand" style={{ color: '#B388FF' }}>B2B</span>
          </div>
          <div className="mt-1 text-xs text-white/40">
            {role === 'super_admin' ? 'Super administrator' : 'Administrator'}
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
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
      </aside>

      {/* Kontent */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8">
          <h1 className="text-lg font-bold text-gray-900">{TITLES[pathname] ?? ''}</h1>
          <div className="text-sm text-gray-400">
            {new Date().toLocaleDateString('uz-UZ', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
