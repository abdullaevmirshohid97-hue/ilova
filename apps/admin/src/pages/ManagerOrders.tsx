import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS, formatDate, formatSum, formatUsd, imageUrl, supabase } from '../lib/supabase';
import { openInvoice } from '../lib/invoice';
import OrderEditModal from '../components/OrderEditModal';
import AdminOrderModal from '../components/AdminOrderModal';
import DesignOrderModal from '../components/DesignOrderModal';

type Item = {
  qty: number;
  unit_price: number;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  image: string | null;
};
type Order = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  customer: string;
  phone: string;
  items: Item[];
  // Mijoz dollarda savdo qilinsa summalar dollarda ko'rsatiladi; so'mdagi
  // ekvivalent esa saqlanadi, chunki qarz (ledger) so'mda yuritiladi
  currency: 'UZS' | 'USD';
  totalUzs: number | null;
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
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showDesignOrder, setShowDesignOrder] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [tgBusy, setTgBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('organizations')
      .select('name')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOrgName((data as any)?.name ?? ''));
  }, []);

  // Fakturani PDF qilib MIJOZNING Telegramiga yuboradi. PDF server tomonda
  // (telegram-notify) yasaladi va u yerda menejerning o'z narxi ishlatiladi —
  // mijoz aynan o'zi to'laydigan summani ko'radi.
  async function sendTelegram(o: Order) {
    if (!confirm(`№${o.order_number} fakturasi ${o.customer}ga Telegram orqali yuborilsinmi?`)) return;
    setTgBusy(o.id);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-notify', {
        body: { order_id: o.id },
      });
      const xato = (data as any)?.error ? ((data as any).message ?? (data as any).error) : error?.message;
      if (xato) alert('❌ ' + xato);
      else alert('✅ Faktura Telegramga yuborildi');
    } catch (e: any) {
      alert('❌ ' + (e?.message ?? 'Xatolik'));
    } finally {
      setTgBusy(null);
    }
  }

  const load = useCallback(async () => {
    const q_ = search.trim();
    const isNumeric = q_ !== '' && /^\d+$/.test(q_);

    let q = supabase
      .from('orders')
      .select(
        `id, order_number, status, total, created_at,
         customers!inner ( name, phone, display_currency ),
         order_items ( qty, unit_price, currency, orig_price, discount,
           product_variants ( sku, size, color,
           products ( name, product_images ( storage_path, thumb_path, is_primary, sort_order ) ) ) )`
      )
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter !== 'all') q = q.eq('status', filter);
    if (isNumeric) q = q.eq('order_number', parseInt(q_, 10));
    else if (q_) q = q.or(`name.ilike.%${q_}%,phone.ilike.%${q_}%`, { referencedTable: 'customers' });

    const { data } = await q;
    setOrders(
      (data ?? []).map((o: any) => {
        const qatorlar = (o.order_items ?? []) as any[];

        // Dollar faqat mijozning valyutasi USD bo'lsa VA hamma qator USD
        // bo'lsa ko'rsatiladi — bu qoida bazadagi order_usd_total() va
        // mobil ilovadagi mantiq bilan bir xil. Chegirmali qator so'mda
        // qoladi: chegirma so'mda saqlanadi, orig_price'ga tegmaydi.
        const usd =
          o.customers?.display_currency === 'USD' &&
          qatorlar.length > 0 &&
          qatorlar.every(
            (it) => it.currency === 'USD' && it.orig_price != null && Number(it.discount ?? 0) === 0
          );

        return {
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          currency: (usd ? 'USD' : 'UZS') as 'USD' | 'UZS',
          total: usd
            ? qatorlar.reduce((s, it) => s + Number(it.orig_price) * it.qty, 0)
            : Number(o.total),
          totalUzs: usd ? Number(o.total) : null,
          created_at: o.created_at,
          customer: o.customers?.name ?? '—',
          phone: o.customers?.phone ?? '',
          items: qatorlar.map((it: any) => {
            const imgs = (it.product_variants?.products?.product_images ?? []).sort(
              (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
            );
            return {
              qty: it.qty,
              unit_price: usd
                ? Number(it.orig_price)
                : Number(it.unit_price) - Number(it.discount ?? 0),
              sku: it.product_variants?.sku ?? '',
              name: it.product_variants?.products?.name ?? '—',
              size: it.product_variants?.size ?? null,
              color: it.product_variants?.color ?? null,
              image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null,
            };
          }),
        };
      })
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

  // Buyurtma valyutasida yozadi — dollarli savdoda so'm ko'rsatish
  // menejerni chalkashtiradi (u mijozga dollarda narx aytgan)
  const pul = (o: Order, n: number) => (o.currency === 'USD' ? formatUsd(n) : formatSum(n));

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

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Mijoz nomi, telefon yoki buyurtma №..."
          className={inputCls + ' w-full max-w-sm'}
        />
        <button
          onClick={() => setShowDesignOrder(true)}
          className="ml-auto rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand"
        >
          🎨 Dizayn buyurtma
        </button>
        <button
          onClick={() => setShowNewOrder(true)}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Buyurtma yaratish
        </button>
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
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
              <span className="text-sm text-gray-500">
                {o.customer} · {o.phone}
              </span>
              <span className="text-xs text-gray-400">{formatDate(o.created_at)}</span>
              <span className="ml-auto text-lg font-extrabold text-gray-900">{pul(o, o.total)}</span>
            </div>

            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">{it.name} {[it.size, it.color].filter(Boolean).join(' · ')}</span>
                  <span className="font-semibold text-gray-900">
                    {it.qty.toLocaleString()} × {pul(o, it.unit_price)}
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
                </>
              )}
              {o.status === 'confirmed' && (
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o.id, 'set_order_status', 'picking')}
                  className="rounded-xl border border-blue-200 px-5 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  Yig'ishga berish
                </button>
              )}
              {o.status === 'picking' && (
                <button
                  disabled={busy === o.id}
                  onClick={() => act(o.id, 'set_order_status', 'done')}
                  className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Yopish (topshirildi)
                </button>
              )}

              {/* Faktura — holatdan qat'i nazar doim mavjud. Ochilgan oynada
                  "Chop etish / PDF saqlash" tugmasi bor, ya'ni yuklab ham olinadi. */}
              <button
                onClick={() => openInvoice(o, orgName)}
                className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-bold text-gray-700 hover:border-brand hover:text-brand"
              >
                📄 Faktura
              </button>
              <button
                disabled={tgBusy === o.id}
                onClick={() => sendTelegram(o)}
                className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-2 text-sm font-bold text-sky-600 hover:bg-sky-100 disabled:opacity-50"
                title="Fakturani PDF qilib mijozning Telegramiga yuboradi"
              >
                {tgBusy === o.id ? 'Yuborilmoqda...' : '📤 Telegramga yuborish'}
              </button>
            </div>
          </div>
        );
      })}

      {editOrderId && (
        <OrderEditModal orderId={editOrderId} onClose={() => setEditOrderId(null)} onSaved={load} />
      )}
      {showNewOrder && (
        <AdminOrderModal onClose={() => setShowNewOrder(false)} onCreated={load} />
      )}
      {showDesignOrder && (
        <DesignOrderModal onClose={() => setShowDesignOrder(false)} onCreated={() => {}} />
      )}
    </div>
  );
}
