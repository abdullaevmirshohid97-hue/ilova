import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ManagerPrices from '../pages/ManagerPrices';

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
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
        <div>
          <div className="text-lg font-extrabold text-gray-900">YUKCHIBOLLA</div>
          <div className="text-xs text-gray-400">Menejer paneli{name ? ` — ${name}` : ''}</div>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
        >
          🚪 Chiqish
        </button>
      </header>
      <main className="mx-auto max-w-5xl p-8">
        <ManagerPrices />
      </main>
    </div>
  );
}
