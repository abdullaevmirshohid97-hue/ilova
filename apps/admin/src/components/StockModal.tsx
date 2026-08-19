import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const REASONS = [
  { value: 'Brak', label: '🔴 Brak (nosoz tovar)' },
  { value: "Yo'qolgan", label: "⚫ Yo'qolgan" },
  { value: 'Inventarizatsiya farqi', label: '📋 Inventarizatsiya farqi' },
  { value: 'Boshqa', label: '❓ Boshqa sabab' },
];

type Group = { id: string; name: string };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StockModal({
  variantId,
  label,
  mode,
  onClose,
  onSaved,
}: {
  variantId: string;
  label: string;
  mode: 'in' | 'out';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState(REASONS[0].value);
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kirim bilan birga narxni ham qo'yish/yangilash mumkin. Narxsiz mahsulot
  // mijoz katalogida UMUMAN ko'rinmaydi, shuning uchun kirim payti narxni
  // shu yerdayoq kiritish eng qulay joy.
  const [groups, setGroups] = useState<Group[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [narxYoq, setNarxYoq] = useState(false);

  useEffect(() => {
    if (mode !== 'in') return;
    (async () => {
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('price_groups').select('id, name').order('name'),
        supabase.from('prices').select('price_group_id, price').eq('variant_id', variantId),
      ]);
      setGroups((g as Group[]) ?? []);
      const m: Record<string, string> = {};
      for (const row of (p as any[]) ?? []) m[row.price_group_id] = String(row.price);
      setPrices(m);
      setNarxYoq(((p as any[]) ?? []).length === 0);
    })();
  }, [variantId, mode]);

  const n = parseInt(qty, 10);

  async function save() {
    setError(null);
    if (!n || n <= 0) return setError("Miqdorni kiriting");
    if (mode === 'out' && !note.trim()) return setError('Izoh majburiy (audit uchun)');

    setSaving(true);
    try {
      if (mode === 'in') {
        const createdAt = date === todayStr() ? null : new Date(date + 'T12:00:00').toISOString();
        const { error: e } = await supabase.rpc('add_stock', {
          p_variant_id: variantId,
          p_qty: n,
          p_note: note.trim() || null,
          p_created_at: createdAt,
        });
        if (e) throw e;

        const upserts = groups
          .filter((g) => prices[g.id]?.trim())
          .map((g) => ({
            variant_id: variantId,
            price_group_id: g.id,
            price: parseInt(prices[g.id].replace(/\D/g, ''), 10) || 0,
          }));
        if (upserts.length > 0) {
          const { error: pe } = await supabase
            .from('prices')
            .upsert(upserts, { onConflict: 'variant_id,price_group_id' });
          if (pe) throw pe;
        }
      } else {
        const fullNote = `${reason}: ${note.trim()}`;
        const { error: e } = await supabase.rpc('adjust_stock', {
          p_variant_id: variantId,
          p_qty: -n,
          p_note: fullNote,
        });
        if (e) throw e;
      }
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
          <h2 className="text-xl font-extrabold text-gray-900">
            {mode === 'in' ? '📥 Omborga kirim' : '📤 Chiqim / korreksiya'}
          </h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-400">{label}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">MIQDOR (DONA) *</label>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
              className={inputCls + ' text-lg font-bold'}
              placeholder="1000"
              autoFocus
            />
          </div>

          {mode === 'out' && (
            <div>
              <label className="text-xs font-semibold text-gray-500">SABAB</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                      reason === r.value
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'in' && (
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
          )}

          {mode === 'in' && groups.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500">
                  NARX (GURUH BO'YICHA, SO'M)
                </label>
                {narxYoq && (
                  <span className="rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                    narx yo'q — mijozga ko'rinmaydi
                  </span>
                )}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {groups.map((g) => (
                  <div key={g.id}>
                    <label className="text-[11px] font-semibold text-gray-400">{g.name}</label>
                    <input
                      value={prices[g.id] ?? ''}
                      onChange={(e) =>
                        setPrices((p) => ({ ...p, [g.id]: e.target.value.replace(/\D/g, '') }))
                      }
                      className={inputCls}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                Bo'sh qoldirsangiz eski narx o'zgarmaydi.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500">
              IZOH {mode === 'out' && '*'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              rows={2}
              placeholder={mode === 'in' ? "Masalan: ishlab chiqarishdan" : 'Tafsilot yozing (majburiy)'}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">
            Bekor qilish
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`rounded-xl px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 ${
              mode === 'in' ? 'bg-brand' : 'bg-red-500'
            }`}
          >
            {saving ? 'Saqlanmoqda...' : mode === 'in' ? 'Kirim qilish' : 'Chiqim qilish'}
          </button>
        </div>
      </div>
    </div>
  );
}
