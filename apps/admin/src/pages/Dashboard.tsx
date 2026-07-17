import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ORDER_STATUS, formatDate, formatSum, supabase } from '../lib/supabase';

type Stats = {
  newOrders: number;
  todaySales: number;
  totalDebt: number;
  stockUnits: number;
  reservedUnits: number;
};

type RecentOrder = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  customer: string;
};

function Kpi({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      <div className={`mt-2 text-2xl font-extrabold ${accent ?? 'text-gray-900'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentOrder[]>([]);

  useEffect(() => {
    async function load() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [newCount, todayOrders, balances, stock, recentOrders] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase
          .from('orders')
          .select('total')
          .in('status', ['confirmed', 'picking', 'done'])
          .gte('confirmed_at', today.toISOString()),
        supabase.from('customer_balances').select('balance'),
        supabase.from('stock_levels').select('qty, reserved'),
        supabase
          .from('orders')
          .select('id, order_number, status, total, created_at, customers ( name )')
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      setStats({
        newOrders: newCount.count ?? 0,
        todaySales: (todayOrders.data ?? []).reduce((s, o: any) => s + Number(o.total), 0),
        totalDebt: (balances.data ?? []).reduce(
          (s, b: any) => s + Math.max(0, Number(b.balance)),
          0
        ),
        stockUnits: (stock.data ?? []).reduce((s, r: any) => s + Number(r.qty), 0),
        reservedUnits: (stock.data ?? []).reduce((s, r: any) => s + Number(r.reserved), 0),
      });
      setRecent(
        (recentOrders.data ?? []).map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total: Number(o.total),
          created_at: o.created_at,
          customer: o.customers?.name ?? '—',
        }))
      );
    }
    load();

    const ch = supabase
      .channel('dash-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi
          title="Yangi buyurtmalar"
          value={String(stats?.newOrders ?? '…')}
          hint="Tasdiqlashingiz kutilmoqda"
          accent={stats && stats.newOrders > 0 ? 'text-amber-600' : undefined}
        />
        <Kpi title="Bugungi sotuv" value={stats ? formatSum(stats.todaySales) : '…'} />
        <Kpi
          title="Jami qarzdorlik"
          value={stats ? formatSum(stats.totalDebt) : '…'}
          hint="Barcha mijozlar bo'yicha"
          accent="text-red-500"
        />
        <Kpi
          title="Ombor qoldig'i"
          value={stats ? `${stats.stockUnits.toLocaleString()} dona` : '…'}
          hint={stats ? `${stats.reservedUnits.toLocaleString()} dona band qilingan` : undefined}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="font-bold text-gray-900">So'nggi buyurtmalar</h2>
          <Link to="/orders" className="text-sm font-semibold text-brand hover:underline">
            Hammasi →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-6 py-3">№</th>
              <th className="px-6 py-3">Mijoz</th>
              <th className="px-6 py-3">Sana</th>
              <th className="px-6 py-3">Holat</th>
              <th className="px-6 py-3 text-right">Summa</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => {
              const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100' };
              return (
                <tr key={o.id} className="border-t border-gray-50">
                  <td className="px-6 py-3 font-bold text-gray-900">№{o.order_number}</td>
                  <td className="px-6 py-3 text-gray-700">{o.customer}</td>
                  <td className="px-6 py-3 text-gray-400">{formatDate(o.created_at)}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">
                    {formatSum(o.total)}
                  </td>
                </tr>
              );
            })}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  Hozircha buyurtma yo'q
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
