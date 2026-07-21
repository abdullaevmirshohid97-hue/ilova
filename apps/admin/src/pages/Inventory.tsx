import { useCallback, useEffect, useState } from 'react';
import { formatDate, supabase } from '../lib/supabase';

type Row = {
  id: number;
  qty: number;
  reason: string;
  note: string | null;
  created_at: string;
  order_number: number | null;
  variant_label: string;
  sku: string;
  by: string;
};

const REASON_LABEL: Record<string, string> = {
  production_in: '📥 Kirim (ishlab chiqarish)',
  order_out: '📦 Buyurtma chiqimi',
  order_cancel_return: "↩️ Bekor qilindi — qaytdi",
  adjustment: '✏️ Korreksiya',
  return_in: '↩️ Qaytarish',
};

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Inventory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: movs } = await supabase
      .from('stock_movements')
      .select(
        `id, qty, reason, note, created_at, created_by,
         orders ( order_number ),
         product_variants ( sku, size, color, products ( name ) )`
      )
      .gte('created_at', from + 'T00:00:00')
      .lte('created_at', to + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(500);

    const byIds = Array.from(new Set((movs ?? []).map((m: any) => m.created_by).filter(Boolean)));
    let profMap = new Map<string, string>();
    if (byIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', byIds);
      profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || 'Admin']));
    }

    setRows(
      (movs ?? []).map((m: any) => ({
        id: m.id,
        qty: m.qty,
        reason: m.reason,
        note: m.note,
        created_at: m.created_at,
        order_number: m.orders?.order_number ?? null,
        variant_label: [m.product_variants?.products?.name, m.product_variants?.size, m.product_variants?.color]
          .filter(Boolean)
          .join(' · '),
        sku: m.product_variants?.sku ?? '',
        by: m.created_by ? profMap.get(m.created_by) ?? '—' : '—',
      }))
    );
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.variant_label.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q) ||
          (r.note ?? '').toLowerCase().includes(q)
      )
    : rows;

  const inputCls =
    'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Qidiruv: mahsulot, SKU, izoh..."
          className={inputCls + ' w-full max-w-md'}
        />
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>dan</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          <span>gacha</span>
          <input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-6 py-3">Sana</th>
              <th className="px-6 py-3">Mahsulot / variant</th>
              <th className="px-6 py-3">Turi</th>
              <th className="px-6 py-3 text-right">Miqdor</th>
              <th className="px-6 py-3">Izoh</th>
              <th className="px-6 py-3">Kim</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-gray-50">
                <td className="px-6 py-3 text-gray-400">{formatDate(r.created_at)}</td>
                <td className="px-6 py-3 text-gray-900">
                  <div className="font-semibold">{r.variant_label || '—'}</div>
                  <div className="font-mono text-xs text-gray-400">{r.sku}</div>
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {REASON_LABEL[r.reason] ?? r.reason}
                  {r.order_number != null && ` №${r.order_number}`}
                </td>
                <td className={`px-6 py-3 text-right font-bold ${r.qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {r.qty > 0 ? '+' : ''}
                  {r.qty.toLocaleString()}
                </td>
                <td className="px-6 py-3 text-gray-400">{r.note ?? '—'}</td>
                <td className="px-6 py-3 text-gray-500">{r.by}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                  Bu davrda harakat topilmadi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
