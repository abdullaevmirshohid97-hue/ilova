import { useCallback, useEffect, useState } from 'react';
import { tasdiqlaSoz } from '../components/Xabar';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LEDGER_KIND_LABEL,
  ORDER_STATUS,
  formatDate,
  formatSum,
  genPassword,
  supabase,
  fnXato,
  avatarHavola,
} from '../lib/supabase';
import PaymentModal from '../components/PaymentModal';

type Group = { id: string; name: string };
type Manager = { id: string; name: string };

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  region: string | null;
  price_group_id: string;
  manager_id: string | null;
  display_currency: string;
  photo_path: string | null;
  is_active: boolean;
  notes: string | null;
};

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
};

type LedgerRow = {
  id: number;
  amount: number;
  kind: string;
  note: string | null;
  created_at: string;
  order_number: number | null;
  payment_id: string | null;
};

async function callFn(action: string, extra: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-update-customer', {
    body: { action, ...extra },
  });
  if (error) throw new Error(await fnXato(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------------- Storno (to'lovni bekor qilish) oynasi ----------------
function StornoModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm_() {
    if (!note.trim()) return setError('Izoh majburiy — nima uchun storno qilinayotganini yozing');
    setSaving(true);
    setError(null);
    try {
      await onConfirm(note.trim());
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h2 className="text-xl font-extrabold text-gray-900">↩️ To'lovni storno qilish</h2>
        <p className="mt-1 text-sm text-gray-500">
          Bu to'lov bekor qilinadi (qarz qaytadi). Asl yozuv o'chirilmaydi — jurnalda teskari
          yozuv qo'shiladi.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand"
          rows={3}
          placeholder="Sabab (majburiy): masalan, xato summa kiritilgan"
          autoFocus
        />
        {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">
            Bekor qilish
          </button>
          <button
            onClick={confirm_}
            disabled={saving}
            className="rounded-xl bg-red-500 px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Bajarilmoqda...' : 'Storno qilish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [balance, setBalance] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [phoneEdit, setPhoneEdit] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [stornoFor, setStornoFor] = useState<LedgerRow | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: cust }, { data: grps }, { data: mgrs }, { data: bal }, { data: ords }, { data: led }] =
      await Promise.all([
        supabase
          .from('customers_masked')
          .select('id, name, phone, email, address, region, price_group_id, manager_id, display_currency, photo_path, is_active, notes')
          .eq('id', id)
          .single(),
        supabase.from('price_groups').select('id, name').order('name'),
        supabase.from('managers').select('id, name').eq('is_active', true).order('name'),
        supabase.from('customer_balances').select('balance').eq('customer_id', id).maybeSingle(),
        supabase
          .from('orders')
          .select('id, order_number, status, base_total, created_at')
          .eq('customer_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('ledger_entries')
          .select('id, amount, kind, note, created_at, payment_id, orders ( order_number )')
          .eq('customer_id', id)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
    if (cust) {
      setCustomer(cust as any);
      // Bucket yopiq: ochiq havola o'rniga muddati o'tadigan imzolangan havola
      setPreview(await avatarHavola((cust as any).photo_path));
      setNewPhone((cust as any).phone ?? '');
    }
    setGroups((grps ?? []) as Group[]);
    setManagers((mgrs ?? []) as Manager[]);
    setBalance(bal ? Number((bal as any).balance) : 0);
    setOrders(
      (ords ?? []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: Number(o.base_total),
        created_at: o.created_at,
      }))
    );
    setLedger(
      (led ?? []).map((r: any) => ({
        id: r.id,
        amount: Number(r.amount),
        kind: r.kind,
        note: r.note,
        created_at: r.created_at,
        payment_id: r.payment_id,
        order_number: r.orders?.order_number ?? null,
      }))
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function pickFile(f: File | null) {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!customer) return;
    setError(null);
    setSaving(true);
    try {
      let photoPath = customer.photo_path;
      if (file) {
        photoPath = `customers/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(photoPath, file, { upsert: true });
        if (upErr) throw new Error('Rasm: ' + upErr.message);
      }
      const { error: e } = await supabase
        .from('customers')
        .update({
          name: customer.name.trim(),
          address: customer.address?.trim() || null,
          region: customer.region?.trim() || null,
          email: customer.email?.trim() || null,
          price_group_id: customer.price_group_id,
          manager_id: customer.manager_id || null,
          display_currency: customer.display_currency,
          notes: customer.notes?.trim() || null,
          photo_path: photoPath,
        })
        .eq('id', customer.id);
      if (e) throw e;
      setFile(null);
      setNotice('Saqlandi');
      load();
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
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleActive() {
    if (!customer) return;
    const goingActive = !customer.is_active;
    if (!goingActive && !await tasdiqlaSoz(`${customer.name} bloklansinmi? Bloklangan mijoz buyurtma berolmaydi.`)) return;
    setBusyAction('active');
    setError(null);
    try {
      await callFn('set_active', { customer_id: customer.id, is_active: goingActive });
      load();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setBusyAction(null);
    }
  }

  async function resetPassword() {
    if (!customer) return;
    if (!await tasdiqlaSoz(`${customer.name} uchun yangi parol o'rnatilsinmi? Eski parol ishlamay qoladi.`)) return;
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

  async function doStorno(entry: LedgerRow, note: string) {
    if (!entry.payment_id) return;
    const { error: e } = await supabase.rpc('reverse_payment', {
      p_payment_id: entry.payment_id,
      p_note: note,
    });
    if (e) throw new Error(e.message);
    load();
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  if (!customer) {
    return <div className="p-8 text-center text-gray-500">Yuklanmoqda...</div>;
  }

  const reversedPaymentIds = new Set(
    ledger.filter((e) => e.kind === 'adjustment' && e.payment_id).map((e) => e.payment_id)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/customers" className="text-sm font-semibold text-gray-500 hover:text-brand">
        ← Mijozlar ro'yxatiga qaytish
      </Link>

      {/* Profil kartochkasi */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[140px_1fr]">
          <div>
            <label className="block cursor-pointer">
              {preview ? (
                <img src={preview} className="h-32 w-32 rounded-2xl border border-gray-200 object-cover" />
              ) : (
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-brand hover:text-brand">
                  <span className="text-2xl">📷</span>
                  <span className="mt-1 text-xs font-semibold">Rasm</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </label>
            {!customer.is_active && (
              <div className="mt-2 rounded-lg bg-gray-100 px-2 py-1 text-center text-xs font-bold text-gray-500">
                🚫 Bloklangan
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <input value={customer.phone ?? '🔒 menejer mijozi — yashirin'} disabled className={inputCls + ' text-gray-500'} />
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
                        setNewPhone(customer.phone ?? '');
                      }}
                      className="shrink-0 rounded-xl border border-gray-200 px-3 py-3 text-xs font-bold text-gray-500"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
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
                <label className="text-xs font-semibold text-gray-500">GMAIL</label>
                <input
                  value={customer.email ?? ''}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
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
                <label className="text-xs font-semibold text-gray-500">MENEJER</label>
                <select
                  value={customer.manager_id ?? ''}
                  onChange={(e) => setCustomer({ ...customer, manager_id: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">— Yo'q —</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
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
            className={`rounded-xl border px-5 py-3 text-sm font-bold disabled:opacity-50 ${
              customer.is_active
                ? 'border-red-200 text-red-500 hover:bg-red-50'
                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            {customer.is_active ? '🚫 Bloklash' : '✅ Faollashtirish'}
          </button>
          <button
            onClick={() => setPayOpen(true)}
            className="ml-auto rounded-xl bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-600 hover:bg-emerald-100"
          >
            💵 To'lov qabul qilish
          </button>
        </div>
      </div>

      {/* Balans */}
      <div
        className={`rounded-2xl border p-6 ${
          balance > 0 ? 'border-red-200 bg-red-50' : balance < 0 ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="text-xs font-semibold uppercase text-gray-500">Joriy balans</div>
        <div className={`mt-1 text-2xl font-extrabold ${balance > 0 ? 'text-red-500' : balance < 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
          {balance > 0 ? `Qarz: ${formatSum(balance)}` : balance < 0 ? `Haqi: ${formatSum(-balance)}` : '0'}
        </div>
      </div>

      {/* Buyurtmalar tarixi */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4 font-bold text-gray-900">Buyurtmalar tarixi</div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3">№</th>
              <th className="px-6 py-3">Sana</th>
              <th className="px-6 py-3">Holat</th>
              <th className="px-6 py-3 text-right">Summa</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100' };
              return (
                <tr key={o.id} className="border-t border-gray-50">
                  <td className="px-6 py-3 font-semibold text-gray-900">№{o.order_number}</td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">{formatSum(o.total)}</td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-gray-500">Buyurtma yo'q</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Moliya tarixi */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-6 py-4 font-bold text-gray-900">To'lovlar / moliya tarixi</div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-6 py-3">Sana</th>
              <th className="px-6 py-3">Turi</th>
              <th className="px-6 py-3">Izoh</th>
              <th className="px-6 py-3 text-right">Summa</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((e) => (
              <tr key={e.id} className="border-t border-gray-50">
                <td className="px-6 py-3 text-gray-500">{formatDate(e.created_at)}</td>
                <td className="px-6 py-3 text-gray-600">
                  {LEDGER_KIND_LABEL[e.kind] ?? e.kind}
                  {e.order_number != null && ` №${e.order_number}`}
                </td>
                <td className="px-6 py-3 text-gray-500">{e.note ?? '—'}</td>
                <td className={`px-6 py-3 text-right font-bold ${e.amount > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {e.amount > 0 ? '+' : '−'}{formatSum(Math.abs(e.amount))}
                </td>
                <td className="px-6 py-3 text-right">
                  {e.kind === 'payment' && e.payment_id && (
                    reversedPaymentIds.has(e.payment_id) ? (
                      <span className="text-xs font-semibold text-gray-300">storno qilingan</span>
                    ) : (
                      <button
                        onClick={() => setStornoFor(e)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                      >
                        ↩️ Storno
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">Yozuvlar yo'q</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {payOpen && (
        <PaymentModal
          customerId={customer.id}
          customerName={customer.name}
          onClose={() => setPayOpen(false)}
          onSaved={load}
        />
      )}

      {stornoFor && (
        <StornoModal onClose={() => setStornoFor(null)} onConfirm={(note) => doStorno(stornoFor, note)} />
      )}
    </div>
  );
}
