import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS, formatDate, formatSum, supabase } from '../lib/supabase';
import OrderEditModal from '../components/OrderEditModal';

type Item = { qty: number; unit_price: number; name: string; size: string | null; color: string | null };
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

const FILTERS = [
  { key: 'new', label: 'Yangi' },
  { key: 'confirmed', label: 'Qabul qilingan' },
  { key: 'picking', label: "Yig'ilmoqda" },
  { key: 'done', label: 'Yopilgan' },
  { key: 'cancelled', label: 'Bekor' },
  { key: 'all', label: 'Hammasi' },
];

// Menejerning bu yerda ko'radigan summasi HAQIQIY (o'zi qo'ygan narx) —
// admin ko'radigan Buyurtmalar sahifasidan farqli, chunki bu uning o'z
// savdosi, undan yashirin narsa yo'q.
export default function ManagerOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('new');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q_ = search.trim();
    const isNumeric = q_ !== '' && /^\d+$/.test(q_);

    let q = supabase
      .from('orders')
      .select(
        `id, order_number, status, total, created_at,
         customers!inner ( name, phone ),
         order_items ( qty, unit_price, product_variants ( size, color, products ( name ) ) )`
      )
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    if (isNumeric) q = q.eq('order_number', parseInt(q_, 10));
    else if (q_) q = q.or(`name.ilike.%${q_}%,phone.ilike.%${q_}%`, { referencedTable: 'customers' });

    const { data } = await q;
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
          name: it.product_variants?.products?.name ?? '—',
          size: it.product_variants?.size ?? null,
          color: it.product_variants?.color ?? null,
        })),
      }))
    );
  }, [filter, search]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('orders-manager')
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
              filter === f.key ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Mijoz nomi, telefon yoki buyurtma №..."
        className={inputCls + ' w-full max-w-sm'}
      />

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
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
              <span className="text-sm text-gray-500">
                {o.customer} · {o.phone}
              </span>
              <span className="text-xs text-gray-400">{formatDate(o.created_at)}</span>
              <span className="ml-auto text-lg font-extrabold text-gray-900">{formatSum(o.total)}</span>
            </div>

            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{it.name} {[it.size, it.color].filter(Boolean).join(' · ')}</span>
                  <span className="font-semibold text-gray-900">
                    {it.qty.toLocaleString()} × {formatSum(it.unit_price)}
                  </span>
                </div>
              ))}
            </div>

            {o.status === 'new' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o.id, 'confirm_order')}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  ✓ Qabul qilish
                </button>
                <button
                  onClick={() => setEditOrderId(o.id)}
                  className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand"
                >
                  ✏️ Tahrirlash
                </button>
                <button
                  disabled={busy === o.id}
                  onClick={() => confirm(`№${o.order_number} bekor qilinsinmi?`) && act(o.id, 'cancel_order')}
                  className="rounded-xl border border-red-200 px-5 py-2 text-sm font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  ✕ Bekor qilish
                </button>
              </div>
            )}
            {o.status === 'confirmed' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o.id, 'set_order_status', 'picking')}
                  className="rounded-xl border border-blue-200 px-5 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  Yig'ishga berish
                </button>
              </div>
            )}
            {o.status === 'picking' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o.id, 'set_order_status', 'done')}
                  className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Yopish (topshirildi)
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editOrderId && (
        <OrderEditModal orderId={editOrderId} onClose={() => setEditOrderId(null)} onSaved={load} />
      )}
    </div>
  );
}
