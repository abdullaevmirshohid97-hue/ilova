import { useEffect, useState } from 'react';
import { LEDGER_KIND_LABEL, formatDate, formatSum, supabase } from '../lib/supabase';

type Entry = {
  id: number;
  amount: number;
  kind: string;
  note: string | null;
  created_at: string;
  customer: string;
  order_number: number | null;
};

export default function Finance() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totals, setTotals] = useState<{ debt: number; paidToday: number } | null>(null);

  useEffect(() => {
    async function load() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ data: rows }, { data: balances }, { data: payments }] = await Promise.all([
        supabase
          .from('ledger_entries')
          .select('id, amount, kind, note, created_at, customers ( name ), orders ( order_number )')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('customer_balances').select('balance'),
        supabase.from('payments').select('amount').gte('created_at', today.toISOString()),
      ]);
      setEntries(
        (rows ?? []).map((r: any) => ({
          id: r.id,
          amount: Number(r.amount),
          kind: r.kind,
          note: r.note,
          created_at: r.created_at,
          customer: r.customers?.name ?? '—',
          order_number: r.orders?.order_number ?? null,
        }))
      );
      setTotals({
        debt: (balances ?? []).reduce((s, b: any) => s + Math.max(0, Number(b.balance)), 0),
        paidToday: (payments ?? []).reduce((s, p: any) => s + Number(p.amount), 0),
      });
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 max-w-xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase text-gray-500">Jami qarzdorlik</div>
          <div className="mt-2 text-2xl font-extrabold text-red-500">
            {totals ? formatSum(totals.debt) : '…'}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase text-gray-500">Bugungi to'lovlar</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600">
            {totals ? formatSum(totals.paidToday) : '…'}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4 font-bold text-gray-900">
          Moliya jurnali (ledger)
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3">Sana</th>
              <th className="px-6 py-3">Mijoz</th>
              <th className="px-6 py-3">Turi</th>
              <th className="px-6 py-3">Izoh</th>
              <th className="px-6 py-3 text-right">Summa</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-gray-50">
                <td className="px-6 py-3 text-gray-500">{formatDate(e.created_at)}</td>
                <td className="px-6 py-3 font-semibold text-gray-900">{e.customer}</td>
                <td className="px-6 py-3 text-gray-600">
                  {LEDGER_KIND_LABEL[e.kind] ?? e.kind}
                  {e.order_number != null && ` №${e.order_number}`}
                </td>
                <td className="px-6 py-3 text-gray-500">{e.note ?? '—'}</td>
                <td
                  className={`px-6 py-3 text-right font-bold ${
                    e.amount > 0 ? 'text-red-500' : 'text-emerald-600'
                  }`}
                >
                  {e.amount > 0 ? '+' : '−'}
                  {formatSum(Math.abs(e.amount))}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                  Yozuvlar yo'q
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
