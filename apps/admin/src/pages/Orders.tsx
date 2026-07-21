import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS, formatDate, formatSum, supabase } from '../lib/supabase';

const PAGE_SIZE = 50;

type Item = { qty: number; unit_price: number; name: string; size: string | null; color: string | null; sku: string };
type Order = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  customer: string;
  phone: string;
  items: Item[];
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>('new');
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    const q_ = search.trim();
    const isNumeric = q_ !== '' && /^\d+$/.test(q_);

    let q = supabase
      .from('orders')
      .select(
        `id, order_number, status, total, created_at,
         customers!inner ( name, phone ),
         order_items ( qty, unit_price, product_variants ( sku, size, color, products ( name ) ) )`
      )
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filter !== 'all') q = q.eq('status', filter);
    if (isNumeric) q = q.eq('order_number', parseInt(q_, 10));
    else if (q_) q = q.or(`name.ilike.%${q_}%,phone.ilike.%${q_}%`, { referencedTable: 'customers' });
    if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');

    const { data } = await q;
    setHasMore((data ?? []).length === PAGE_SIZE);
    setOrders(
      (data ?? []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: Number(o.total),
        created_at: o.created_at,
        customer: o.customers?.name ?? '—',
        phone: o.customers?.phone ?? '',
        items: (o.order_items ?? []).map((it: any) => ({
          qty: it.qty,
          unit_price: Number(it.unit_price),
          sku: it.product_variants?.sku ?? '',
          name: it.product_variants?.products?.name ?? '—',
          size: it.product_variants?.size ?? null,
          color: it.product_variants?.color ?? null,
        })),
      }))
    );
  }, [filter, search, dateFrom, dateTo, page]);

  useEffect(() => {
    setPage(0);
  }, [filter, search, dateFrom, dateTo]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('orders-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function act(id: string, fn: 'confirm_order' | 'cancel_order' | 'set_order_status', status?: string) {
    setBusy(id);
    const params: any = { p_order_id: id };
    if (fn === 'set_order_status') params.p_status = status;
    const { error } = await supabase.rpc(fn, params);
    if (error) alert('Xatolik: ' + error.message);
    setBusy(null);
    load();
  }

  function printPickList(o: Order) {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>Yig'ish varaqasi №${o.order_number}</title>
      <style>
        body { font-family: sans-serif; padding: 24px; }
        h1 { font-size: 20px; } table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; font-size: 14px; }
        .meta { color: #444; font-size: 14px; margin-top: 4px; }
      </style></head><body>
      <h1>YIG'ISH VARAQASI — Buyurtma №${o.order_number}</h1>
      <div class="meta">Mijoz: <b>${o.customer}</b> · ${o.phone}</div>
      <div class="meta">Sana: ${formatDate(o.created_at)}</div>
      <table><thead><tr><th>SKU</th><th>Mahsulot</th><th>Razmer/Rang</th><th>Miqdor</th></tr></thead><tbody>
      ${o.items
        .map(
          (it) =>
            `<tr><td>${it.sku}</td><td>${it.name}</td><td>${[it.size, it.color]
              .filter(Boolean)
              .join(' / ')}</td><td><b>${it.qty.toLocaleString()} dona</b></td></tr>`
        )
        .join('')}
      </tbody></table>
      <p style="margin-top:24px">Jami: <b>${formatSum(o.total)}</b></p>
      <script>window.print()</script>
      </body></html>
    `);
    w.document.close();
  }

  const FILTERS = [
    { key: 'new', label: 'Yangi' },
    { key: 'confirmed', label: 'Qabul qilingan' },
    { key: 'picking', label: "Yig'ilmoqda" },
    { key: 'done', label: 'Yopilgan' },
    { key: 'cancelled', label: 'Bekor' },
    { key: 'all', label: 'Hammasi' },
  ];

  const inputCls =
    'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f.key
                ? 'bg-brand text-white'
                : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Mijoz nomi, telefon yoki buyurtma №..."
          className={inputCls + ' w-full max-w-sm'}
        />
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>dan</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
          <span>gacha</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
        </div>
      </div>

      {orders.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-400">
          Bu bo'limda buyurtma yo'q
        </div>
      )}

      {orders.map((o) => {
        const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100' };
        return (
          <div key={o.id} className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-extrabold text-gray-900">№{o.order_number}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>
                {st.label}
              </span>
              <span className="text-sm text-gray-500">
                {o.customer} · {o.phone}
              </span>
              <span className="text-xs text-gray-400">{formatDate(o.created_at)}</span>
              <span className="ml-auto text-lg font-extrabold text-gray-900">
                {formatSum(o.total)}
              </span>
            </div>

            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {it.name} {[it.size, it.color].filter(Boolean).join(' · ')}
                    <span className="ml-2 text-xs text-gray-400">{it.sku}</span>
                  </span>
                  <span className="font-semibold text-gray-900">
                    {it.qty.toLocaleString()} × {formatSum(it.unit_price)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {o.status === 'new' && (
                <>
                  <button
                    disabled={busy === o.id}
                    onClick={() => act(o.id, 'confirm_order')}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ✓ Qabul qilish
                  </button>
                  <button
                    disabled={busy === o.id}
                    onClick={() => confirm(`№${o.order_number} bekor qilinsinmi?`) && act(o.id, 'cancel_order')}
                    className="rounded-xl border border-red-200 px-5 py-2 text-sm font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    ✕ Bekor qilish
                  </button>
                </>
              )}
              {o.status === 'confirmed' && (
                <>
                  <button
                    onClick={() => printPickList(o)}
                    className="rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white hover:opacity-90"
                  >
                    🖨 Yig'ish varaqasi
                  </button>
                  <button
                    disabled={busy === o.id}
                    onClick={() => act(o.id, 'set_order_status', 'picking')}
                    className="rounded-xl border border-blue-200 px-5 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50"
                  >
                    Yig'ishga berish
                  </button>
                </>
              )}
              {o.status === 'picking' && (
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o.id, 'set_order_status', 'done')}
                  className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-bold text-white hover:opacity-90"
                >
                  Yopish (topshirildi)
                </button>
              )}
            </div>
          </div>
        );
      })}

      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 hover:border-brand disabled:opacity-40"
          >
            ← Oldingi
          </button>
          <span className="text-sm text-gray-400">{page + 1}-sahifa</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 hover:border-brand disabled:opacity-40"
          >
            Keyingi →
          </button>
        </div>
      )}
    </div>
  );
}
