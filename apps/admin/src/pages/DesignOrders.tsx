import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from '../components/Xabar';
import { DESIGN_STATUS, formatDate, formatSum, supabase } from '../lib/supabase';
import DesignOrderModal from '../components/DesignOrderModal';

type Row = {
  id: string;
  customer: string;
  phone: string;
  size: string | null;
  bottomMaterial: string | null;
  topMaterial: string | null;
  bagMaterial: string | null;
  ropeColor: string | null;
  printType: string | null;
  qty: number;
  unitPrice: number;
  total: number;
  advanceAmount: number;
  isFullyPaid: boolean;
  paymentDueDate: string | null;
  readyDate: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
};

const NEXT_STATUS: Record<string, { key: string; label: string } | null> = {
  new: { key: 'in_production', label: 'Ishlab chiqarishga berish' },
  in_production: { key: 'ready', label: 'Tayyor deb belgilash' },
  ready: { key: 'delivered', label: 'Topshirildi deb belgilash' },
  delivered: null,
  cancelled: null,
};

export default function DesignOrders() {
  const [rows, setRows] = useState<Row[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Bekor qilinganlar bu asosiy ro'yxatda ko'rsatilmaydi — ular
    // Sozlamalar > Xavfli zonada, alohida butunlay o'chirish uchun turadi
    const { data } = await supabase
      .from('design_orders')
      .select(
        `id, size, bottom_material, top_material, bag_material, rope_color, print_type,
         qty, unit_price, advance_amount, is_fully_paid, payment_due_date, ready_date,
         notes, status, created_at,
         customers ( name, phone )`
      )
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    setRows(
      (data ?? []).map((d: any) => ({
        id: d.id,
        customer: d.customers?.name ?? '—',
        phone: d.customers?.phone ?? '',
        size: d.size,
        bottomMaterial: d.bottom_material,
        topMaterial: d.top_material,
        bagMaterial: d.bag_material,
        ropeColor: d.rope_color,
        printType: d.print_type,
        qty: d.qty,
        unitPrice: Number(d.unit_price),
        total: Number(d.qty) * Number(d.unit_price),
        advanceAmount: Number(d.advance_amount),
        isFullyPaid: d.is_fully_paid,
        paymentDueDate: d.payment_due_date,
        readyDate: d.ready_date,
        notes: d.notes,
        status: d.status,
        createdAt: d.created_at,
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function advance(row: Row) {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    setBusy(row.id);
    const { error } = await supabase.from('design_orders').update({ status: next.key }).eq('id', row.id);
    if (error) xabarKorsat('Xatolik: ' + error.message);
    setBusy(null);
    load();
  }

  async function cancelRow(row: Row) {
    if (!await tasdiqlaSoz("Bu dizayn buyurtmasi bekor qilinsinmi?")) return;
    setBusy(row.id);
    const { error } = await supabase.from('design_orders').update({ status: 'cancelled' }).eq('id', row.id);
    if (error) xabarKorsat('Xatolik: ' + error.message);
    setBusy(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          🎨 Yangi dizayn buyurtma
        </button>
      </div>

      {rows.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
          Hali shaxsiy dizayn buyurtmasi yo'q
        </div>
      )}

      {rows.map((r) => {
        const st = DESIGN_STATUS[r.status] ?? { label: r.status, cls: 'bg-gray-100' };
        const remaining = r.isFullyPaid ? 0 : r.total - r.advanceAmount;
        const next = NEXT_STATUS[r.status];
        return (
          <div key={r.id} className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-extrabold text-gray-900">{r.customer}</span>
              <span className="text-sm text-gray-500">{r.phone}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
              <span className="text-xs text-gray-500">{formatDate(r.createdAt)}</span>
              <span className="ml-auto text-lg font-extrabold text-gray-900">{formatSum(r.total)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-gray-100 pt-3 text-sm md:grid-cols-4">
              {r.size && (
                <div><span className="text-gray-500">O'lcham:</span> <span className="font-semibold text-gray-700">{r.size}</span></div>
              )}
              {r.bottomMaterial && (
                <div><span className="text-gray-500">Tag qismi:</span> <span className="font-semibold text-gray-700">{r.bottomMaterial}</span></div>
              )}
              {r.topMaterial && (
                <div><span className="text-gray-500">Ustki qismi:</span> <span className="font-semibold text-gray-700">{r.topMaterial}</span></div>
              )}
              {r.bagMaterial && (
                <div><span className="text-gray-500">Sumka qog'ozi:</span> <span className="font-semibold text-gray-700">{r.bagMaterial}</span></div>
              )}
              {r.ropeColor && (
                <div><span className="text-gray-500">Ip rangi:</span> <span className="font-semibold text-gray-700">{r.ropeColor}</span></div>
              )}
              {r.printType && (
                <div><span className="text-gray-500">Bosma:</span> <span className="font-semibold text-gray-700">{r.printType === 'tesneniya' ? 'Tesneniyali' : 'Oddiy pechatnoy'}</span></div>
              )}
              <div><span className="text-gray-500">Miqdor:</span> <span className="font-semibold text-gray-700">{r.qty.toLocaleString()} dona</span></div>
              <div><span className="text-gray-500">Dona narxi:</span> <span className="font-semibold text-gray-700">{formatSum(r.unitPrice)}</span></div>
              {r.readyDate && (
                <div><span className="text-gray-500">Tayyor bo'lish:</span> <span className="font-semibold text-gray-700">{r.readyDate}</span></div>
              )}
              {r.notes && (
                <div className="col-span-2"><span className="text-gray-500">Izoh:</span> <span className="font-semibold text-gray-700">{r.notes}</span></div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
              {r.isFullyPaid ? (
                <span className="font-bold text-emerald-600">✅ To'liq to'langan</span>
              ) : (
                <>
                  <span className="text-gray-500">
                    Oldindan: <span className="font-bold text-gray-800">{formatSum(r.advanceAmount)}</span>
                  </span>
                  <span className="text-gray-500">
                    Qoldiq: <span className="font-bold text-amber-600">{formatSum(remaining)}</span>
                  </span>
                  {r.paymentDueDate && (
                    <span className="text-gray-500">
                      To'lov sanasi: <span className="font-bold text-gray-800">{r.paymentDueDate}</span>
                    </span>
                  )}
                </>
              )}
            </div>

            {r.status !== 'delivered' && r.status !== 'cancelled' && (
              <div className="mt-4 flex flex-wrap gap-2">
                {next && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => advance(r)}
                    className="rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {next.label}
                  </button>
                )}
                <button
                  disabled={busy === r.id}
                  onClick={() => cancelRow(r)}
                  className="rounded-xl border border-red-200 px-5 py-2 text-sm font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  ✕ Bekor qilish
                </button>
              </div>
            )}
          </div>
        );
      })}

      {showModal && <DesignOrderModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}
