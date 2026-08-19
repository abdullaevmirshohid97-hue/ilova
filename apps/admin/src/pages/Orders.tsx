import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS, formatDate, formatSum, imageUrl, supabase } from '../lib/supabase';
import AdminOrderModal from '../components/AdminOrderModal';
import DesignOrderModal from '../components/DesignOrderModal';
import OrderEditModal from '../components/OrderEditModal';

const PAGE_SIZE = 50;

type Item = {
  qty: number;
  unit_price: number;
  name: string;
  size: string | null;
  color: string | null;
  sku: string;
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
};

// Admin panelida FAQAT rasmiy (baza) narx ko'rsatiladi — menejerga
// biriktirilgan mijozning haqiqiy (ustama bilan) narxi order.total/
// order_items.unit_price'da saqlanadi, lekin bu yerda hech qachon
// chiqarilmaydi.

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>('new');
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showDesignOrder, setShowDesignOrder] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [tgBusy, setTgBusy] = useState<string | null>(null);

  // Fakturani PDF qilib mijozning Telegramiga yuboradi. PDF server tomonda
  // (telegram-notify edge funksiyasida) yasaladi — bot ham, admin panel ham
  // bitta manbadan foydalanadi.
  async function sendTelegram(o: Order) {
    if (!confirm(`№${o.order_number} fakturasi ${o.customer}ga Telegram orqali yuborilsinmi?`)) return;
    setTgBusy(o.id);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-notify', {
        body: { order_id: o.id },
      });
      // Edge funksiya xato holatida ham tushunarli matn qaytaradi (masalan
      // mijoz botga hali ulanmagan bo'lsa) — uni ko'rsatamiz
      const xato = (data as any)?.error ? ((data as any).message ?? (data as any).error) : error?.message;
      if (xato) alert('❌ ' + xato);
      else alert('✅ Faktura Telegramga yuborildi');
    } catch (e: any) {
      alert('❌ ' + (e?.message ?? 'Xatolik'));
    } finally {
      setTgBusy(null);
    }
  }

  useEffect(() => {
    supabase
      .from('organizations')
      .select('name')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setOrgName((data as any)?.name ?? ''));
  }, []);

  const load = useCallback(async () => {
    const q_ = search.trim();
    const isNumeric = q_ !== '' && /^\d+$/.test(q_);

    let q = supabase
      .from('orders')
      .select(
        `id, order_number, status, base_total, created_at,
         customers!inner ( name, phone ),
         order_items ( qty, base_price, product_variants ( sku, size, color,
           products ( name, product_images ( storage_path, thumb_path, is_primary, sort_order ) ) ) )`
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
        total: Number(o.base_total),
        created_at: o.created_at,
        customer: o.customers?.name ?? '—',
        phone: o.customers?.phone ?? '',
        items: (o.order_items ?? []).map((it: any) => {
          const imgs = (it.product_variants?.products?.product_images ?? []).sort(
            (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
          );
          return {
            qty: it.qty,
            unit_price: Number(it.base_price),
            sku: it.product_variants?.sku ?? '',
            name: it.product_variants?.products?.name ?? '—',
            size: it.product_variants?.size ?? null,
            color: it.product_variants?.color ?? null,
            image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null,
          };
        }),
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
        th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; font-size: 14px; vertical-align: middle; }
        td img { display: block; }
        .meta { color: #444; font-size: 14px; margin-top: 4px; }
      </style></head><body>
      <h1>YIG'ISH VARAQASI — Buyurtma №${o.order_number}</h1>
      <div class="meta">Mijoz: <b>${o.customer}</b> · ${o.phone}</div>
      <div class="meta">Sana: ${formatDate(o.created_at)}</div>
      <table><thead><tr><th>Rasm</th><th>SKU</th><th>Mahsulot</th><th>Razmer/Rang</th><th>Miqdor</th></tr></thead><tbody>
      ${o.items
        .map(
          (it) =>
            `<tr><td>${
              it.image
                ? `<img src="${it.image}" style="width:50px;height:50px;object-fit:cover;border-radius:4px" />`
                : ''
            }</td><td>${it.sku}</td><td>${it.name}</td><td>${[it.size, it.color]
              .filter(Boolean)
              .join(' / ')}</td><td><b>${it.qty.toLocaleString()} dona</b></td></tr>`
        )
        .join('')}
      </tbody></table>
      <p style="margin-top:24px">Jami: <b>${formatSum(o.total)}</b></p>
      <script>window.onload = function() { window.print(); };</script>
      </body></html>
    `);
    w.document.close();
  }

  // Faktura — pick-list'dan farqli o'laroq HAR QANDAY holатdagi buyurtma
  // uchun ochiladi (yopilgani ham, hali tasdiqlanmagani ham). Tasdiqlanmagan
  // buyurtmada yuqorida "TASDIQLANMAGAN" belgisi chiqadi, chunki narx/miqdor
  // hali o'zgarishi mumkin.
  function printInvoice(o: Order) {
    const w = window.open('', '_blank');
    if (!w) return;
    const tasdiqlanmagan = o.status === 'new' || o.status === 'cancelled';
    const statusLabel: Record<string, string> = {
      new: 'YANGI — TASDIQLANMAGAN',
      confirmed: 'QABUL QILINGAN',
      picking: "YIG'ILMOQDA",
      done: 'YOPILGAN',
      cancelled: 'BEKOR QILINGAN',
    };
    const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

    w.document.write(`
      <html><head><meta charset="utf-8"><title>Faktura №${o.order_number}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #14151a; margin: 0; }
        .head { display: flex; justify-content: space-between; align-items: flex-start;
                border-bottom: 3px solid #7000FF; padding-bottom: 12px; }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 1px; color: #7000FF; }
        .sub { color: #666; font-size: 12px; margin-top: 2px; }
        .no { text-align: right; }
        .no b { font-size: 26px; }
        .warn { margin-top: 12px; padding: 8px 12px; background: #fff4e5;
                border-left: 4px solid #ff9800; font-size: 12px; font-weight: 700; color: #8a5200; }
        .grid { display: flex; gap: 40px; margin-top: 18px; font-size: 13px; }
        .grid div span { color: #777; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
        th { background: #f4f0ff; text-align: left; padding: 9px 10px; border: 1px solid #ddd;
             font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
        td { border: 1px solid #ddd; padding: 8px 10px; vertical-align: middle; }
        td.num, th.num { text-align: right; white-space: nowrap; }
        tfoot td { font-weight: 800; background: #faf7ff; font-size: 15px; }
        .foot { margin-top: 30px; display: flex; justify-content: space-between;
                font-size: 12px; color: #666; }
        .sign { margin-top: 40px; font-size: 12px; }
        .sign span { display: inline-block; width: 200px; border-bottom: 1px solid #999; }
        @media print { .noprint { display: none; } }
        .noprint { position: fixed; top: 10px; right: 10px; }
        .noprint button { background: #7000FF; color: #fff; border: 0; padding: 10px 18px;
                          border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
      </style></head><body>

      <div class="noprint"><button onclick="window.print()">🖨 Chop etish / PDF saqlash</button></div>

      <div class="head">
        <div>
          <div class="brand">${esc(orgName || 'YUKCHIBOLLA')}</div>
          <div class="sub">Ulgurji savdo · faktura</div>
        </div>
        <div class="no">
          <div style="font-size:11px;color:#777;text-transform:uppercase">Faktura</div>
          <b>№${o.order_number}</b>
          <div class="sub">${formatDate(o.created_at)}</div>
        </div>
      </div>

      ${tasdiqlanmagan ? `<div class="warn">⚠ ${statusLabel[o.status] ?? o.status} — bu faktura yakuniy emas, miqdor va summa hali o'zgarishi mumkin.</div>` : ''}

      <div class="grid">
        <div><span>Mijoz</span><br><b>${esc(o.customer)}</b></div>
        <div><span>Telefon</span><br><b>${esc(o.phone ?? '—')}</b></div>
        <div><span>Holat</span><br><b>${statusLabel[o.status] ?? o.status}</b></div>
      </div>

      <table>
        <thead><tr>
          <th style="width:34px">№</th><th>Mahsulot</th><th>Razmer / Rang</th>
          <th class="num">Miqdor</th><th class="num">Narx</th><th class="num">Summa</th>
        </tr></thead>
        <tbody>
        ${o.items
          .map(
            (it, i) =>
              `<tr>
                 <td>${i + 1}</td>
                 <td><b>${esc(it.name)}</b><div style="color:#888;font-size:11px">${esc(it.sku)}</div></td>
                 <td>${esc([it.size, it.color].filter(Boolean).join(' / ') || '—')}</td>
                 <td class="num">${it.qty.toLocaleString('ru-RU')}</td>
                 <td class="num">${formatSum(it.unit_price)}</td>
                 <td class="num">${formatSum(it.unit_price * it.qty)}</td>
               </tr>`
          )
          .join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="5" class="num">JAMI</td><td class="num">${formatSum(o.total)}</td>
        </tr></tfoot>
      </table>

      <div class="sign">
        Topshirdi: <span></span> &nbsp;&nbsp;&nbsp; Qabul qildi: <span></span>
      </div>

      <div class="foot">
        <div>${esc(orgName || 'Yukchibolla')}</div>
        <div>Chop etilgan: ${new Date().toLocaleString('ru-RU')}</div>
      </div>
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

              {/* Faktura — holatdan qat'i nazar doim mavjud: yopilgan
                  buyurtmani ham, hali tasdiqlanmaganini ham ko'rish kerak */}
              <button
                onClick={() => printInvoice(o)}
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

      {showNewOrder && (
        <AdminOrderModal onClose={() => setShowNewOrder(false)} onCreated={load} />
      )}
      {showDesignOrder && (
        <DesignOrderModal onClose={() => setShowDesignOrder(false)} onCreated={() => {}} />
      )}
      {editOrderId && (
        <OrderEditModal orderId={editOrderId} onClose={() => setEditOrderId(null)} onSaved={load} />
      )}
    </div>
  );
}
