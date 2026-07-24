import { useCallback, useEffect, useState } from 'react';
import { genPassword, supabase } from '../lib/supabase';

type Group = { id: string; name: string };
type Row = { id: string; name: string; phone: string; is_active: boolean };

function NewCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [groupId, setGroupId] = useState('');
  const [displayCurrency, setDisplayCurrency] = useState<'UZS' | 'USD'>('UZS');
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ phone: string; password: string } | null>(null);

  useEffect(() => {
    supabase
      .from('price_groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setGroups((data ?? []) as Group[]);
        if (data?.[0]) setGroupId((data as any)[0].id);
      });
  }, []);

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Ism majburiy');
    if (phone.replace(/\D/g, '').length < 12) return setError("Telefon raqam to'liq emas");
    if (!groupId) return setError('Tarifni tanlang');
    if (password.length < 6) return setError("Parol kamida 6 belgi bo'lsin");
    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('manager-create-customer', {
        body: { name: name.trim(), phone: phone.trim(), price_group_id: groupId, password, display_currency: displayCurrency },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      setDone({ phone: phone.trim(), password });
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const msg = `Assalomu alaykum! Yukchibolla ilovasiga kirish ma'lumotlaringiz:\nTelefon: ${done.phone}\nParol: ${done.password}`;
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-2xl">
          <div className="text-4xl">✅</div>
          <h2 className="mt-3 text-xl font-extrabold text-gray-900">Mijoz yaratildi!</h2>
          <div className="mt-6 rounded-xl bg-white p-6 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Telefon (login):</span>
              <b className="text-gray-900">{done.phone}</b>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-500">Parol:</span>
              <b className="font-mono text-gray-900">{done.password}</b>
            </div>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(msg)}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90"
          >
            📋 Ma'lumotlarni nusxalash
          </button>
          <button
            onClick={() => {
              onCreated();
              onClose();
            }}
            className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Yopish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">➕ Yangi mijoz</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">ISM *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Sardoba" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">TELEFON (LOGIN) *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+998 90 123 45 67" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">NARX TARIFI *</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">MIJOZ NARXNI QANDAY KO'RADI</label>
            <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as 'UZS' | 'USD')} className={inputCls}>
              <option value="UZS">So'mda</option>
              <option value="USD">Dollarda ($)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">PAROL *</label>
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + ' font-mono'} />
              <button
                onClick={() => setPassword(genPassword())}
                className="shrink-0 rounded-xl border border-gray-200 px-3 text-sm hover:border-brand"
                title="Yangi parol yaratish"
              >
                🎲
              </button>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">
            Bekor qilish
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Yaratilmoqda...' : 'Mijoz yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManagerCustomers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, name, phone, is_active').order('name');
    setRows((data ?? []) as Row[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-gray-400">
          Bu — sizga biriktirilgan mijozlar. Yangisini o'zingiz yaratishingiz mumkin (boshqa
          menejerlar va admin bu mijozlaringizning telefon raqamini ko'rmaydi).
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="shrink-0 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Mijoz yaratish
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-6 py-3">Mijoz</th>
              <th className="px-6 py-3">Telefon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-50">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">
                      {r.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="font-semibold text-gray-900">
                      {r.name}
                      {!r.is_active && (
                        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">bloklangan</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3 text-gray-600">{r.phone}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-6 py-10 text-center text-gray-400">
                  Hali mijozingiz yo'q — «➕ Mijoz yaratish» bilan birinchisini qo'shing
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showNew && <NewCustomerModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}
