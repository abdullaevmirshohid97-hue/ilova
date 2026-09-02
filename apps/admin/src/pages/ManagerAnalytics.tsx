import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatSum, supabase } from '../lib/supabase';

const SOLD_STATUSES = ['confirmed', 'picking', 'done'];

type SaleRow = {
  id: string;
  orderNumber: number;
  customer: string;
  status: string;
  total: number; // haqiqiy (mijoz to'lagan)
  baseTotal: number; // rasmiy/kompaniya narxi
  profit: number; // total - baseTotal — sizning sof foydangiz
  createdAt: string;
};

type DebtorRow = { name: string; phone: string; balance: number };

export default function ManagerAnalytics() {
  const [days, setDays] = useState<number | null>(30); // null = hammasi
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [debtors, setDebtors] = useState<DebtorRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    let ordersQuery = supabase
      .from('orders')
      .select('id, order_number, status, total, base_total, created_at, customers ( name, phone )')
      .in('status', SOLD_STATUSES)
      .order('created_at', { ascending: false })
      .limit(200);
    if (days != null) {
      const from = new Date();
      from.setDate(from.getDate() - days + 1);
      from.setHours(0, 0, 0, 0);
      ordersQuery = ordersQuery.gte('created_at', from.toISOString());
    }

    const [{ data: orders }, { data: balances }] = await Promise.all([
      ordersQuery,
      supabase
        .from('customer_balances')
        .select('balance, customers ( name, phone )')
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(20),
    ]);

    setSales(
      (orders ?? []).map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        customer: o.customers?.name ?? '—',
        status: o.status,
        total: Number(o.total),
        baseTotal: Number(o.base_total),
        profit: Number(o.total) - Number(o.base_total),
        createdAt: o.created_at,
      }))
    );
    setDebtors(
      (balances ?? []).map((d: any) => ({
        name: d.customers?.name ?? '—',
        phone: d.customers?.phone ?? '',
        balance: Number(d.balance),
      }))
    );
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const turnover = sales.reduce((s, r) => s + r.total, 0);
  const netProfit = sales.reduce((s, r) => s + r.profit, 0);
  const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              days === d ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {d} kun
          </button>
        ))}
        <button
          onClick={() => setDays(null)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            days === null ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
          }`}
        >
          Hammasi
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500">Yuklanmoqda...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-500">Aylanmam (topgan pulim)</div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{formatSum(turnover)}</div>
              <div className="mt-1 text-xs text-gray-500">Mijozlarim to'lagan/to'laydigan jami summa</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <div className="text-xs font-semibold uppercase text-emerald-700">Sof foydam</div>
              <div className="mt-2 text-2xl font-extrabold text-emerald-700">{formatSum(netProfit)}</div>
              <div className="mt-1 text-xs text-emerald-700/70">Kompaniya narxidan ortiqcha olganim (ustamam)</div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <div className="text-xs font-semibold uppercase text-red-600">Qarzdor mijozlarim</div>
              <div className="mt-2 text-2xl font-extrabold text-red-600">{formatSum(totalDebt)}</div>
              <div className="mt-1 text-xs text-red-600/70">{debtors.length} ta mijozda qarz bor</div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4 font-bold text-gray-900">Qarzdor mijozlarim</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3">Mijoz</th>
                    <th className="px-6 py-3">Telefon</th>
                    <th className="px-6 py-3 text-right">Qarz</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.map((d, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-6 py-3 font-semibold text-gray-900">{d.name}</td>
                      <td className="px-6 py-3 text-gray-500">{d.phone}</td>
                      <td className="px-6 py-3 text-right font-bold text-red-500">{formatSum(d.balance)}</td>
                    </tr>
                  ))}
                  {debtors.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-10 text-center text-gray-500">
                        Qarzdor mijozingiz yo'q
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-6 py-4 font-bold text-gray-900">Savdo tarixi</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3">№</th>
                    <th className="px-6 py-3">Mijoz</th>
                    <th className="px-6 py-3">Sana</th>
                    <th className="px-6 py-3 text-right">Mijozdan olganim</th>
                    <th className="px-6 py-3 text-right">Sof foydam</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((r) => (
                    <tr key={r.id} className="border-t border-gray-50">
                      <td className="px-6 py-3 font-semibold text-gray-900">№{r.orderNumber}</td>
                      <td className="px-6 py-3 text-gray-700">{r.customer}</td>
                      <td className="px-6 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
                      <td className="px-6 py-3 text-right font-bold text-gray-900">{formatSum(r.total)}</td>
                      <td className={`px-6 py-3 text-right font-bold ${r.profit > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>
                        {r.profit > 0 ? '+' : ''}
                        {formatSum(r.profit)}
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                        Bu davrda savdo yo'q
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
