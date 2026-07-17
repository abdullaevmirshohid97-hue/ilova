import { useCallback, useEffect, useState } from 'react';
import { formatSum, supabase } from '../lib/supabase';

type Row = {
  id: string;
  name: string;
  phone: string;
  region: string | null;
  group: string;
  balance: number;
  active: boolean;
};

export default function Customers() {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const [{ data: customers }, { data: balances }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone, region, is_active, price_groups ( name )')
        .order('name'),
      supabase.from('customer_balances').select('customer_id, balance'),
    ]);
    const balMap = new Map(
      (balances ?? []).map((b: any) => [b.customer_id, Number(b.balance)])
    );
    setRows(
      (customers ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        region: c.region,
        group: c.price_groups?.name ?? '—',
        balance: balMap.get(c.id) ?? 0,
        active: c.is_active,
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pay(r: Row) {
    const v = prompt(`${r.name}\nQancha to'lov qabul qilindi? (so'm)`);
    const n = parseInt((v ?? '').replace(/\D/g, ''), 10);
    if (!n || n <= 0) return;
    const method = confirm('Naqd to`lovmi? (OK = naqd, Cancel = o`tkazma)') ? 'cash' : 'transfer';
    const { error } = await supabase.rpc('record_payment', {
      p_customer_id: r.id,
      p_amount: n,
      p_method: method,
      p_note: 'Admin panel orqali',
    });
    if (error) alert('Xatolik: ' + error.message);
    load();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-6 py-3">Mijoz</th>
            <th className="px-6 py-3">Telefon</th>
            <th className="px-6 py-3">Hudud</th>
            <th className="px-6 py-3">Narx tarifi</th>
            <th className="px-6 py-3 text-right">Balans</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
              <td className="px-6 py-3 font-semibold text-gray-900">
                {r.name}
                {!r.active && (
                  <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                    bloklangan
                  </span>
                )}
              </td>
              <td className="px-6 py-3 text-gray-600">{r.phone}</td>
              <td className="px-6 py-3 text-gray-500">{r.region ?? '—'}</td>
              <td className="px-6 py-3">
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                  {r.group}
                </span>
              </td>
              <td
                className={`px-6 py-3 text-right font-bold ${
                  r.balance > 0 ? 'text-red-500' : r.balance < 0 ? 'text-emerald-600' : 'text-gray-400'
                }`}
              >
                {r.balance > 0
                  ? `Qarz: ${formatSum(r.balance)}`
                  : r.balance < 0
                    ? `Haqi: ${formatSum(-r.balance)}`
                    : '0'}
              </td>
              <td className="px-6 py-3 text-right">
                <button
                  onClick={() => pay(r)}
                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-100"
                >
                  💵 To'lov
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                Mijozlar yo'q
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
