import { useCallback, useEffect, useState } from 'react';
import { formatSum, supabase } from '../lib/supabase';

const SOLD_STATUSES = ['confirmed', 'picking', 'done'];

type DayPoint = { date: string; total: number };
type ProductRow = { name: string; qty: number; revenue: number };
type DebtorRow = { name: string; phone: string; balance: number };

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Oddiy ustunli diagramma (bitta rang — brand) ----------
function BarChart({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.total));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative">
      <div className="flex h-48 items-end gap-1">
        {points.map((p, i) => {
          const h = Math.max(2, Math.round((p.total / max) * 176));
          return (
            <div
              key={p.date}
              className="group relative flex-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h2) => (h2 === i ? null : h2))}
            >
              <div
                className="mx-auto w-full max-w-[22px] rounded-t-[4px] bg-brand transition-opacity hover:opacity-80"
                style={{ height: h }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg">
                  {new Date(p.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}
                  <br />
                  {formatSum(p.total)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        <span>{points[0] ? new Date(points[0].date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }) : ''}</span>
        <span>{points.length > 0 ? new Date(points[points.length - 1].date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }) : ''}</span>
      </div>
    </div>
  );
}

// ---------- Gorizontal ustunli reyting (bitta rang — brand) ----------
function RankBars({ rows, valueKey, formatValue }: { rows: { name: string; value: number }[]; valueKey: string; formatValue: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name + valueKey}>
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-gray-700">{r.name}</span>
            <span className="font-bold text-gray-900">{formatValue(r.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-brand"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [dailySales, setDailySales] = useState<DayPoint[]>([]);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [debtors, setDebtors] = useState<DebtorRow[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [periodTotal, setPeriodTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);

    const [ordersRes, debtorsRes, invRes] = await Promise.all([
      supabase
        .from('orders')
        .select(
          `id, status, base_total, created_at,
           order_items ( qty, base_price, product_variants ( products ( name ) ) )`
        )
        .in('status', SOLD_STATUSES)
        .gte('created_at', from.toISOString()),
      supabase
        .from('customer_balances')
        .select('balance, customers ( name, phone )')
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(10),
      supabase
        .from('product_variants')
        .select('stock_levels ( qty ), prices!inner ( price, price_groups!inner ( name ) )')
        .eq('prices.price_groups.name', 'Standart'),
    ]);

    // Kunlik sotuv
    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    let total = 0;
    const productAgg = new Map<string, { qty: number; revenue: number }>();
    for (const o of ordersRes.data ?? []) {
      const day = (o as any).created_at.slice(0, 10);
      const amt = Number((o as any).base_total);
      byDay.set(day, (byDay.get(day) ?? 0) + amt);
      total += amt;
      for (const it of (o as any).order_items ?? []) {
        const name = it.product_variants?.products?.name ?? "Noma'lum";
        const cur = productAgg.get(name) ?? { qty: 0, revenue: 0 };
        cur.qty += it.qty;
        cur.revenue += it.qty * Number(it.base_price);
        productAgg.set(name, cur);
      }
    }
    setDailySales(Array.from(byDay.entries()).map(([date, total]) => ({ date, total })));
    setPeriodTotal(total);
    setTopProducts(
      Array.from(productAgg.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
    );

    setDebtors(
      (debtorsRes.data ?? []).map((d: any) => ({
        name: d.customers?.name ?? '—',
        phone: d.customers?.phone ?? '',
        balance: Number(d.balance),
      }))
    );

    const invValue = (invRes.data ?? []).reduce((sum: number, v: any) => {
      const qty = Number(v.stock_levels?.qty ?? 0);
      const price = Number(v.prices?.[0]?.price ?? 0);
      return sum + qty * price;
    }, 0);
    setInventoryValue(invValue);

    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  function exportTopProducts() {
    downloadCsv(
      `top-mahsulotlar-${days}kun.csv`,
      toCsv(['Mahsulot', 'Sotilgan dona', 'Summa'], topProducts.map((p) => [p.name, p.qty, p.revenue]))
    );
  }
  function exportDebtors() {
    downloadCsv(
      'qarzdorlar.csv',
      toCsv(['Mijoz', 'Telefon', 'Qarz'], debtors.map((d) => [d.name, d.phone, d.balance]))
    );
  }
  function exportDailySales() {
    downloadCsv(
      `kunlik-sotuv-${days}kun.csv`,
      toCsv(['Sana', 'Summa'], dailySales.map((d) => [d.date, d.total]))
    );
  }

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
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">Yuklanmoqda...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">
                Davr bo'yicha sotuv ({days} kun)
              </div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{formatSum(periodTotal)}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">Jami qarzdorlik</div>
              <div className="mt-2 text-2xl font-extrabold text-red-500">
                {formatSum(debtors.reduce((s, d) => s + d.balance, 0))}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">
                Ombor qiymati (Standart narxda, taxminiy)
              </div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{formatSum(inventoryValue)}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Kunlik sotuv</h3>
              <button onClick={exportDailySales} className="text-xs font-bold text-brand hover:underline">
                📥 CSV
              </button>
            </div>
            <div className="mt-4">
              {dailySales.every((d) => d.total === 0) ? (
                <p className="py-8 text-center text-sm text-gray-400">Bu davrda tasdiqlangan sotuv yo'q</p>
              ) : (
                <BarChart points={dailySales} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Top-10 mahsulot (dona bo'yicha)</h3>
                <button onClick={exportTopProducts} className="text-xs font-bold text-brand hover:underline">
                  📥 CSV
                </button>
              </div>
              <div className="mt-4">
                {topProducts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Ma'lumot yo'q</p>
                ) : (
                  <RankBars
                    rows={topProducts.map((p) => ({ name: p.name, value: p.qty }))}
                    valueKey="qty"
                    formatValue={(n) => `${n.toLocaleString()} dona`}
                  />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Qarzdorlar reytingi</h3>
                <button onClick={exportDebtors} className="text-xs font-bold text-brand hover:underline">
                  📥 CSV
                </button>
              </div>
              <div className="mt-4">
                {debtors.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Qarzdor mijoz yo'q</p>
                ) : (
                  <RankBars
                    rows={debtors.map((d) => ({ name: d.name, value: d.balance }))}
                    valueKey="balance"
                    formatValue={formatSum}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
