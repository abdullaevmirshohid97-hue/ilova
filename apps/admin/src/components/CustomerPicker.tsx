import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type PickedCustomer = {
  id: string;
  name: string;
  phone: string | null;
  price_group_id: string | null;
};

// customers_masked — menejerga biriktirilgan mijozning telefoni admin
// uchun yashirilgan (o'zi ko'rgan holda esa to'liq) — pastda shu view
// ishlatiladi, shunda bu komponent admin ham, menejer ham foydalanganda
// avtomatik to'g'ri ishlaydi.
export default function CustomerPicker({ onPick }: { onPick: (c: PickedCustomer) => void }) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<PickedCustomer[]>([]);

  useEffect(() => {
    supabase
      .from('customers_masked')
      .select('id, name, phone, price_group_id')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setCustomers((data ?? []) as PickedCustomer[]));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
    : customers;

  return (
    <div>
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Mijoz ismi yoki telefon..."
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand"
      />
      <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-100">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">Mijoz topilmadi</div>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className="flex w-full items-center justify-between border-b border-gray-50 px-4 py-3 text-left text-sm last:border-0 hover:bg-brand-soft"
          >
            <span className="font-semibold text-gray-800">{c.name}</span>
            <span className="text-gray-500">{c.phone ?? '🔒 menejer mijozi'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
