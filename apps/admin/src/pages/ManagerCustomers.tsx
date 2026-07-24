import { useCallback, useEffect, useState } from 'react';
import { genPassword, supabase } from '../lib/supabase';

type Group = { id: string; name: string };
type Row = { id: string; name: string; phone: string; is_active: boolean };

type FullCustomer = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  region: string | null;
  price_group_id: string;
  display_currency: string;
  notes: string | null;
  is_active: boolean;
};

async function callFn(action: string, extra: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manager-update-customer', {
    body: { action, ...extra },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

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

function EditCustomerModal({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const [phoneEdit, setPhoneEdit] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: cust }, { data: grps }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone, address, region, price_group_id, display_currency, notes, is_active')
        .eq('id', customerId)
        .single(),
      supabase.from('price_groups').select('id, name').order('name'),
    ]);
    if (cust) {
      setCustomer(cust as any);
      setNewPhone((cust as any).phone);
    }
    setGroups((grps ?? []) as Group[]);
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  async function save() {
    if (!customer) return;
    setError(null);
    setSaving(true);
    try {
      const { error: e } = await supabase
        .from('customers')
        .update({
          name: customer.name.trim(),
          address: customer.address?.trim() || null,
          region: customer.region?.trim() || null,
          price_group_id: customer.price_group_id,
          display_currency: customer.display_currency,
          notes: customer.notes?.trim() || null,
        })
        .eq('id', customer.id);
      if (e) throw e;
      setNotice('Saqlandi');
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  async function savePhone() {
    if (!customer) return;
    setError(null);
    setBusyAction('phone');
    try {
      await callFn('change_phone', { customer_id: customer.id, phone: newPhone.trim() });
      setPhoneEdit(false);
      load();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleActive() {
    if (!customer) return;
    const goingActive = !customer.is_active;
    if (!goingActive && !confirm(`${customer.name} bloklansinmi? Bloklangan mijoz buyurtma berolmaydi.`)) return;
    setBusyAction('active');
    setError(null);
    try {
      await callFn('set_active', { customer_id: customer.id, is_active: goingActive });
      load();
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setBusyAction(null);
    }
  }

  async function resetPassword() {
    if (!customer) return;
    if (!confirm(`${customer.name} uchun yangi parol o'rnatilsinmi?`)) return;
    setBusyAction('password');
    setError(null);
    try {
      const pw = genPassword();
      await callFn('reset_password', { customer_id: customer.id, new_password: pw });
      setNewPassword(pw);
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setBusyAction(null);
    }
  }

  if (!customer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-2xl bg-white p-8 text-sm text-gray-400">Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">✏️ Mijozni tahrirlash</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        {!customer.is_active && (
          <div className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-center text-xs font-bold text-gray-500">
            🚫 Bloklangan
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">ISM</label>
            <input
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">TELEFON (LOGIN)</label>
            {!phoneEdit ? (
              <div className="flex items-center gap-2">
                <input value={customer.phone} disabled className={inputCls + ' text-gray-400'} />
                <button
                  onClick={() => setPhoneEdit(true)}
                  className="shrink-0 rounded-xl border border-gray-200 px-3 py-3 text-xs font-bold text-gray-500 hover:border-brand hover:text-brand"
                >
                  ✏️
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={inputCls} />
                <button
                  onClick={savePhone}
                  disabled={busyAction === 'phone'}
                  className="shrink-0 rounded-xl bg-brand px-3 py-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  ✓
                </button>
                <button
                  onClick={() => {
                    setPhoneEdit(false);
                    setNewPhone(customer.phone);
                  }}
                  className="shrink-0 rounded-xl border border-gray-200 px-3 py-3 text-xs font-bold text-gray-500"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-500">VILOYAT</label>
              <input
                value={customer.region ?? ''}
                onChange={(e) => setCustomer({ ...customer, region: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">MANZIL</label>
              <input
                value={customer.address ?? ''}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">NARX TARIFI</label>
              <select
                value={customer.price_group_id}
                onChange={(e) => setCustomer({ ...customer, price_group_id: e.target.value })}
                className={inputCls}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">MIJOZ NARXNI QANDAY KO'RADI</label>
              <select
                value={customer.display_currency}
                onChange={(e) => setCustomer({ ...customer, display_currency: e.target.value })}
                className={inputCls}
              >
                <option value="UZS">So'mda</option>
                <option value="USD">Dollarda ($)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">IZOH</label>
            <textarea
              value={customer.notes ?? ''}
              onChange={(e) => setCustomer({ ...customer, notes: e.target.value })}
              className={inputCls}
              rows={2}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}
        {notice && <p className="mt-4 text-sm font-semibold text-emerald-600">{notice}</p>}
        {newPassword && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
            <div className="text-sm">
              Yangi parol: <b className="font-mono">{newPassword}</b>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(newPassword)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
            >
              📋 Nusxalash
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-6">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saqlanmoqda...' : '💾 Saqlash'}
          </button>
          <button
            onClick={resetPassword}
            disabled={busyAction === 'password'}
            className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand disabled:opacity-50"
          >
            🔑 Yangi parol
          </button>
          <button
            onClick={toggleActive}
            disabled={busyAction === 'active'}
            className={`ml-auto rounded-xl border px-5 py-3 text-sm font-bold disabled:opacity-50 ${
              customer.is_active
                ? 'border-red-200 text-red-500 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            {customer.is_active ? '🚫 Bloklash (o`chirish)' : '✅ Faollashtirish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManagerCustomers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

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
          Bu — sizga biriktirilgan mijozlar. Yangisini o'zingiz yaratishingiz, mavjudini
          tahrirlashingiz yoki bloklashingiz mumkin (boshqa menejerlar va admin bu
          mijozlaringizning telefon raqamini ko'rmaydi).
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
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setEditId(r.id)}
                className="cursor-pointer border-t border-gray-50 hover:bg-gray-50/60"
              >
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
                <td className="px-6 py-3 text-right text-xs font-bold text-brand">✏️ Tahrirlash</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-gray-400">
                  Hali mijozingiz yo'q — «➕ Mijoz yaratish» bilan birinchisini qo'shing
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showNew && <NewCustomerModal onClose={() => setShowNew(false)} onCreated={load} />}
      {editId && <EditCustomerModal customerId={editId} onClose={() => setEditId(null)} onSaved={load} />}
    </div>
  );
}
