import { useState } from 'react';
import { supabase } from '../lib/supabase';

const METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: '💵 Naqd' },
  { value: 'card', label: '💳 Karta' },
  { value: 'transfer', label: "🏦 O'tkazma" },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentModal({
  customerId,
  customerName,
  onClose,
  onSaved,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = parseInt(amount, 10);

  async function save() {
    setError(null);
    if (!n || n <= 0) return setError("Summani kiriting");

    setSaving(true);
    try {
      const paidAt = date === todayStr() ? null : new Date(date + 'T12:00:00').toISOString();
      const { error: e } = await supabase.rpc('record_payment', {
        p_customer_id: customerId,
        p_amount: n,
        p_method: method,
        p_note: note.trim() || null,
        p_paid_at: paidAt,
      });
      if (e) throw e;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">💵 To'lov qabul qilish</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">{customerName}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">SUMMA (SO'M) *</label>
            <input
              value={amount ? Number(amount).toLocaleString('ru-RU') : ''}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              className={inputCls + ' text-lg font-bold'}
              placeholder="500 000"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">TO'LOV USULI</label>
            <div className="mt-1 flex gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    method === m.value
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">SANA</label>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">IZOH (ixtiyoriy)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="Masalan: naqd kassaga"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saqlanmoqda...' : "To'lovni saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}
