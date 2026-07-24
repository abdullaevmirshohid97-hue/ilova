import { useCallback, useEffect, useState } from 'react';
import { formatSum, supabase } from '../lib/supabase';

const SOLD_STATUSES = ['confirmed', 'picking', 'done'];

type DayPoint = { date: string; total: number };
type ProductRow = { name: string; qty: number; revenue: number };
type ManagerRow = { name: string; orders: number; revenue: number };
type CustomerRow = { name: string; phone: string; orders: number; revenue: number };
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
function RankBars({ rows, formatValue }: { rows: { name: string; value: number }[]; formatValue: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.name + i}>
          <div className="flex justify-between text-sm">
            <span className="truncate font-semibold text-gray-700">
              {i + 1}. {r.name}
            </span>
            <span className="shrink-0 font-bold text-gray-900">{formatValue(r.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function printReport(opts: {
  days: number;
  periodTotal: number;
  ordersCount: number;
  avgOrder: number;
  activeCustomers: number;
  totalDebt: number;
  inventoryValue: number;
  topProducts: ProductRow[];
  topManagers: ManagerRow[];
  topCustomers: CustomerRow[];
}) {
  const dateStr = new Date().toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const row = (cells: (string | number)[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`
    <html><head><meta charset="utf-8" /><title>Umumiy hisobot</title>
    <style>
      @page { size: A4; margin: 16mm; }
      body { font-family: sans-serif; padding: 0; color: #14151A; }
      h1 { font-size: 22px; margin-bottom: 2px; }
      .meta { color: #555; font-size: 13px; margin-top: 2px; }
      .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
      .kpi { border: 1px solid #ddd; border-radius: 8px; padding: 10px 14px; min-width: 150px; }
      .kpi .label { font-size: 11px; color: #777; text-transform: uppercase; }
      .kpi .value { font-size: 18px; font-weight: 800; margin-top: 2px; }
      h2 { font-size: 15px; margin-top: 26px; margin-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; font-size: 12px; }
      th { background: #F2F3F7; }
      td:last-child, th:last-child { text-align: right; }
    </style></head><body>
    <h1>YUKCHIBOLLA — Umumiy hisobot</h1>
    <div class="meta">Davr: so'nggi ${opts.days} kun · Chop etilgan sana: ${dateStr}</div>

    <div class="kpis">
      <div class="kpi"><div class="label">Davr sotuvi</div><div class="value">${formatSum(opts.periodTotal)}</div></div>
      <div class="kpi"><div class="label">Buyurtmalar soni</div><div class="value">${opts.ordersCount.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">O'rtacha buyurtma</div><div class="value">${formatSum(opts.avgOrder)}</div></div>
      <div class="kpi"><div class="label">Faol mijozlar</div><div class="value">${opts.activeCustomers.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Jami qarzdorlik</div><div class="value">${formatSum(opts.totalDebt)}</div></div>
      <div class="kpi"><div class="label">Ombor qiymati</div><div class="value">${formatSum(opts.inventoryValue)}</div></div>
    </div>

    <h2>Top-${opts.topProducts.length} mahsulot</h2>
    <table>
      <thead>${row(['#', 'Mahsulot', 'Sotilgan dona', 'Summa'])}</thead>
      <tbody>${opts.topProducts.map((p, i) => row([i + 1, p.name, p.qty.toLocaleString(), formatSum(p.revenue)])).join('')}</tbody>
    </table>

    <h2>Top menejerlar</h2>
    <table>
      <thead>${row(['#', 'Menejer', 'Buyurtmalar', 'Summa'])}</thead>
      <tbody>${
        opts.topManagers.length > 0
          ? opts.topManagers.map((m, i) => row([i + 1, m.name, m.orders.toLocaleString(), formatSum(m.revenue)])).join('')
          : row(['—', "Menejerlar orqali sotuv yo'q", '', ''])
      }</tbody>
    </table>

    <h2>Top mijozlar</h2>
    <table>
      <thead>${row(['#', 'Mijoz', 'Telefon', 'Buyurtmalar', 'Summa'])}</thead>
      <tbody>${opts.topCustomers.map((c, i) => row([i + 1, c.name, c.phone, c.orders.toLocaleString(), formatSum(c.revenue)])).join('')}</tbody>
    </table>

    <script>window.onload = function() { window.print(); };</script>
    </body></html>
  `);
  w.document.close();
}

export default function Reports() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [dailySales, setDailySales] = useState<DayPoint[]>([]);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [topManagers, setTopManagers] = useState<ManagerRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<CustomerRow[]>([]);
  const [debtors, setDebtors] = useState<DebtorRow[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);

    const [ordersRes, debtorsRes, invRes] = await Promise.all([
      supabase
        .from('orders')
        .select(
          `id, status, base_total, created_at, customer_id,
           customers ( name, phone, manager_id, managers ( name ) ),
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

    // Kunlik sotuv + top mahsulot + top menejer + top mijoz — bitta o'tishda
    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    let total = 0;
    const productAgg = new Map<string, { qty: number; revenue: number }>();
    const managerAgg = new Map<string, { name: string; orders: number; revenue: number }>();
    const customerAgg = new Map<string, { name: string; phone: string; orders: number; revenue: number }>();

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

      const cust = (o as any).customers;
      const custId = (o as any).customer_id;
      if (cust && custId) {
        const c = customerAgg.get(custId) ?? { name: cust.name ?? '—', phone: cust.phone ?? '', orders: 0, revenue: 0 };
        c.orders += 1;
        c.revenue += amt;
        customerAgg.set(custId, c);
      }

      const mgrId = cust?.manager_id;
      const mgrName = cust?.managers?.name;
      if (mgrId && mgrName) {
        const m = managerAgg.get(mgrId) ?? { name: mgrName, orders: 0, revenue: 0 };
        m.orders += 1;
        m.revenue += amt;
        managerAgg.set(mgrId, m);
      }
    }

    setDailySales(Array.from(byDay.entries()).map(([date, total]) => ({ date, total })));
    setPeriodTotal(total);
    setOrdersCount((ordersRes.data ?? []).length);
    setTopProducts(
      Array.from(productAgg.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 20)
    );
    setTopManagers(
      Array.from(managerAgg.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
    );
    setTopCustomers(
      Array.from(customerAgg.values())
        .sort((a, b) => b.revenue - a.revenue)
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
    downloadCsv('qarzdorlar.csv', toCsv(['Mijoz', 'Telefon', 'Qarz'], debtors.map((d) => [d.name, d.phone, d.balance])));
  }
  function exportDailySales() {
    downloadCsv(`kunlik-sotuv-${days}kun.csv`, toCsv(['Sana', 'Summa'], dailySales.map((d) => [d.date, d.total])));
  }

  const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);
  const avgOrder = ordersCount > 0 ? Math.round(periodTotal / ordersCount) : 0;
  const activeCustomers = topCustomers.length;

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
          onClick={() =>
            printReport({
              days,
              periodTotal,
              ordersCount,
              avgOrder,
              activeCustomers,
              totalDebt,
              inventoryValue,
              topProducts,
              topManagers,
              topCustomers,
            })
          }
          disabled={loading}
          className="ml-auto rounded-xl bg-gray-900 px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          🖨 A4 / PDF hisobot
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">Yuklanmoqda...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">Davr bo'yicha sotuv ({days} kun)</div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{formatSum(periodTotal)}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">Buyurtmalar / o'rtacha</div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">
                {ordersCount.toLocaleString()} <span className="text-sm font-semibold text-gray-400">ta</span>
              </div>
              <div className="mt-1 text-xs text-gray-400">O'rtacha: {formatSum(avgOrder)}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">Jami qarzdorlik</div>
              <div className="mt-2 text-2xl font-extrabold text-red-500">{formatSum(totalDebt)}</div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-semibold uppercase text-gray-400">Ombor qiymati (Standart narxda, taxminiy)</div>
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

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Top-20 mahsulot (dona bo'yicha)</h3>
              <button onClick={exportTopProducts} className="text-xs font-bold text-brand hover:underline">
                📥 CSV
              </button>
            </div>
            <div className="mt-4">
              {topProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Ma'lumot yo'q</p>
              ) : (
                <RankBars rows={topProducts.map((p) => ({ name: `${p.name} · ${formatSum(p.revenue)}`, value: p.qty }))} formatValue={(n) => `${n.toLocaleString()} dona`} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="font-bold text-gray-900">Top menejerlar</h3>
              <p className="mt-1 text-xs text-gray-400">Rasmiy (baza) narxda hisoblangan sotuv hajmi bo'yicha</p>
              <div className="mt-4">
                {topManagers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Menejerlar orqali sotuv yo'q</p>
                ) : (
                  <RankBars rows={topManagers.map((m) => ({ name: `${m.name} · ${m.orders} buyurtma`, value: m.revenue }))} formatValue={formatSum} />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="font-bold text-gray-900">Top mijozlar</h3>
              <p className="mt-1 text-xs text-gray-400">Davr ichidagi xarid hajmi bo'yicha</p>
              <div className="mt-4">
                {topCustomers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Ma'lumot yo'q</p>
                ) : (
                  <RankBars rows={topCustomers.map((c) => ({ name: `${c.name} · ${c.orders} buyurtma`, value: c.revenue }))} formatValue={formatSum} />
                )}
              </div>
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
                <RankBars rows={debtors.map((d) => ({ name: d.name, value: d.balance }))} formatValue={formatSum} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
