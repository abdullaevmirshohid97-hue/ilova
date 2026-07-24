import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ManagerPrices from '../pages/ManagerPrices';
import ChangePasswordPanel from './ChangePasswordPanel';

// Menejerning cheklangan paneli — to'liq admin Layout/sidebar'dan alohida,
// chunki menejer faqat o'z narxini ko'radi/qo'yadi, boshqa hech narsaga
// (buyurtmalar, mijozlar, boshqa menejerlar) kirish huquqi yo'q.
export default function ManagerApp() {
  const [name, setName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setName(((data.user?.user_metadata as any)?.full_name as string) ?? '');
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-8 sm:py-0 sm:h-16">
        <div className="min-w-0">
          <div className="text-base font-extrabold text-gray-900 sm:text-lg">YUKCHIBOLLA</div>
          <div className="truncate text-xs text-gray-400">Menejer paneli{name ? ` — ${name}` : ''}</div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="shrink-0 rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
        >
          🚪 Chiqish
        </button>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
        <ChangePasswordPanel />
        <ManagerPrices />
      </main>
    </div>
  );
}
