import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from '../components/Xabar';
import { ORDER_STATUS, formatDate, formatSum, imageUrl, supabase, fnXato } from '../lib/supabase';
import { openInvoice } from '../lib/invoice';
import { altbilgi, blank, hujjatniYoz, imzo, logoniOl, oynaOch, sozlamaniOl, uslub } from '../lib/hujjat';
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
    if (!await tasdiqlaSoz(`№${o.order_number} fakturasi ${o.customer}ga Telegram orqali yuborilsinmi?`)) return;
    setTgBusy(o.id);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-notify', {
        body: { order_id: o.id },
      });
      // Edge funksiya xato holatida ham tushunarli matn qaytaradi (masalan
      // mijoz botga hali ulanmagan bo'lsa) — uni ko'rsatamiz
      const xato = (data as any)?.error ? ((data as any).message ?? (data as any).error) : error ? await fnXato(error) : null;
      if (xato) xabarKorsat('❌ ' + xato);
      else xabarKorsat('✅ Faktura Telegramga yuborildi');
    } catch (e: any) {
      xabarKorsat('❌ ' + (e?.message ?? 'Xatolik'));
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
    if (error) xabarKorsat('Xatolik: ' + error.message);
    setBusy(null);
    load();
  }

  // Yig'ish varaqasi — omborchiga qog'ozda beriladi: narx yo'q, rasm va
  // miqdor kattaroq, oxirida belgilash ustuni. Ko'rinish (qog'oz, chekka,
  // shrift, logo) tenantning sozlamasidan keladi.
  async function printPickList(o: Order) {
    // Oyna DARHOL ochiladi — await'dan keyin ochilsa brauzer bloklaydi
    const w = oynaOch();
    if (!w) return;
    const s = await sozlamaniOl();
    const logo = await logoniOl(s);

    const rasmBor = s.ustun_rasm !== false;
    const skuBor = s.ustun_sku !== false;
    const razmerBor = s.ustun_razmer !== false;

    const qatorlar = o.items
      .map((it) => {
        const rasm = rasmBor
          ? `<td>${it.image ? `<img src="${it.image}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;display:block" />` : ''}</td>`
          : '';
        const sku = skuBor ? `<td>${it.sku}</td>` : '';
        const razmer = razmerBor ? `<td>${[it.size, it.color].filter(Boolean).join(' / ')}</td>` : '';
        return `<tr>${rasm}${sku}<td><b>${it.name}</b></td>${razmer}<td class="num"><b>${it.qty} dona</b></td><td></td></tr>`;
      })
      .join('');

    const tana = `
      ${blank(s, orgName, logo, {
        turi: "Yig'ish varaqasi",
        raqam: o.order_number,
        sana: formatDate(o.created_at),
      })}

      <div class="meta">
        <div><span class="yorliq">Mijoz</span><br><b>${o.customer}</b></div>
        <div><span class="yorliq">Telefon</span><br><b>${o.phone ?? '—'}</b></div>
        <div><span class="yorliq">Pozitsiya</span><br><b>${o.items.length}</b></div>
      </div>

      <table>
        <thead><tr>
          ${rasmBor ? '<th style="width:58px">Rasm</th>' : ''}
          ${skuBor ? '<th>SKU</th>' : ''}
          <th>Mahsulot</th>
          ${razmerBor ? '<th>Razmer / Rang</th>' : ''}
          <th class="num">Miqdor</th>
          <th style="width:46px">✓</th>
        </tr></thead>
        <tbody>${qatorlar}</tbody>
      </table>

      ${imzo(s)}
      ${altbilgi(s, orgName)}
    `;

    hujjatniYoz(w, {
      nom: `Yig'ish varaqasi №${o.order_number}`,
      uslub: uslub(s),
      tana,
      avtoChop: true,
    });
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
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
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
              <span className="text-xs text-gray-500">{formatDate(o.created_at)}</span>
              <span className="ml-auto text-lg font-extrabold text-gray-900">
                {formatSum(o.total)}
              </span>
            </div>

            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {it.name} {[it.size, it.color].filter(Boolean).join(' · ')}
                    <span className="ml-2 text-xs text-gray-500">{it.sku}</span>
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
                    onClick={async () => {
                      if (await tasdiqlaSoz(`№${o.order_number} bekor qilinsinmi?`)) act(o.id, 'cancel_order');
                    }}
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

      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 hover:border-brand disabled:opacity-40"
          >
            ← Oldingi
          </button>
          <span className="text-sm text-gray-500">{page + 1}-sahifa</span>
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
