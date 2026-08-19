import { useCallback, useEffect, useState } from 'react';
import { formatDate, genPassword, supabase } from '../lib/supabase';

type Org = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  subscription_status: string;
  plan: string;
  created_at: string;
  customers_count: number;
  products_count: number;
  orders_count: number;
  admins_count: number;
};

const STATUS_CLS: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  trial: 'Sinov',
  active: 'Faol',
  suspended: "To'xtatilgan",
};

// ---------------- Yangi tenant yaratish oynasi ----------------
function NewOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  async function create() {
    setError(null);
    if (!orgName.trim()) return setError('Tenant nomi majburiy');
    if (!adminEmail.trim()) return setError('Admin email majburiy');
    setSaving(true);
    try {
      const { data, error: e } = await supabase.functions.invoke('super-admin-create-org', {
        body: {
          org_name: orgName.trim(),
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          admin_full_name: adminFullName.trim() || null,
          admin_email: adminEmail.trim(),
          admin_password: password,
        },
      });
      if (e) throw new Error(e.message);
      if (data?.error) throw new Error(data.error);
      setDone({ email: adminEmail.trim(), password });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <div className="text-4xl">✅</div>
          <h2 className="mt-3 text-xl font-extrabold text-gray-900">Tenant yaratildi!</h2>
          <div className="mt-6 rounded-xl bg-gray-50 p-6 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Admin email:</span>
              <b className="text-gray-900">{done.email}</b>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-500">Parol:</span>
              <b className="font-mono text-gray-900">{done.password}</b>
            </div>
          </div>
          <button
            onClick={() =>
              navigator.clipboard.writeText(`Email: ${done.email}\nParol: ${done.password}`)
            }
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90"
          >
            📋 Nusxalash
          </button>
          <button
            onClick={onClose}
            className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Yopish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">➕ Yangi tenant</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">TENANT (BIZNES) NOMI *</label>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className={inputCls} placeholder="Masalan: Andijon to'qimachilik" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">KONTAKT ISM</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">KONTAKT TELEFON</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} placeholder="+998 90 123 45 67" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-bold uppercase text-gray-400">Birinchi admin</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">ISM FAMILIYA</label>
                <input value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">EMAIL *</label>
                <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className={inputCls} placeholder="admin@misol.uz" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-500">PAROL</label>
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
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <button
          onClick={create}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Yaratilmoqda...' : 'Tenant yaratish'}
        </button>
      </div>
    </div>
  );
}

// ---------------- Tenant ma'lumotlarini tahrirlash ----------------
function EditOrgModal({
  org,
  onClose,
  onSaved,
}: {
  org: Org;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(org.name);
  const [contactName, setContactName] = useState(org.contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(org.contact_phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Tenant nomi majburiy');
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('update_org_profile', {
        p_org_id: org.id,
        p_name: name.trim(),
        p_contact_name: contactName.trim() || null,
        p_contact_phone: contactPhone.trim() || null,
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
          <h2 className="text-xl font-extrabold text-gray-900">✏️ Tenantni tahrirlash</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">TENANT (BIZNES) NOMI *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">KONTAKT ISM</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">KONTAKT TELEFON</label>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} placeholder="+998 90 123 45 67" />
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
            className="rounded-xl px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#7000FF' }}
          >
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);

  const load = useCallback(async () => {
    const [{ data: orgRows }, { data: stats }] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at'),
      supabase.rpc('super_admin_org_stats'),
    ]);
    const statMap = new Map((stats ?? []).map((s: any) => [s.org_id, s]));
    setOrgs(
      (orgRows ?? []).map((o: any) => {
        const s = statMap.get(o.id) as any;
        return {
          ...o,
          customers_count: Number(s?.customers_count ?? 0),
          products_count: Number(s?.products_count ?? 0),
          orders_count: Number(s?.orders_count ?? 0),
          admins_count: Number(s?.admins_count ?? 0),
        };
      })
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(org: Org, status: string) {
    const { error } = await supabase.from('organizations').update({ subscription_status: status }).eq('id', org.id);
    if (error) alert('Xatolik: ' + error.message);
    load();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
        <div className="text-lg font-extrabold text-gray-900">
          ILOVA <span style={{ color: '#7000FF' }}>B2B</span>{' '}
          <span className="ml-2 rounded-full bg-gray-900 px-3 py-1 text-xs font-bold text-white">
            SUPER ADMIN
          </span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
        >
          🚪 Chiqish
        </button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-gray-900">Tenantlar</h1>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
            style={{ backgroundColor: '#7000FF' }}
          >
            ➕ Yangi tenant
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-6 py-3">Tenant</th>
                <th className="px-6 py-3">Kontakt</th>
                <th className="px-6 py-3">Holat</th>
                <th className="px-6 py-3 text-right">Adminlar</th>
                <th className="px-6 py-3 text-right">Mijozlar</th>
                <th className="px-6 py-3 text-right">Mahsulotlar</th>
                <th className="px-6 py-3 text-right">Buyurtmalar</th>
                <th className="px-6 py-3">Yaratilgan</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-t border-gray-50">
                  <td className="px-6 py-3 font-bold text-gray-900">{o.name}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {o.contact_name ?? '—'}
                    {o.contact_phone && <div className="text-xs text-gray-400">{o.contact_phone}</div>}
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={o.subscription_status}
                      onChange={(e) => changeStatus(o, e.target.value)}
                      className={`rounded-full border-0 px-3 py-1 text-xs font-bold outline-none ${STATUS_CLS[o.subscription_status] ?? 'bg-gray-100'}`}
                    >
                      <option value="trial">{STATUS_LABEL.trial}</option>
                      <option value="active">{STATUS_LABEL.active}</option>
                      <option value="suspended">{STATUS_LABEL.suspended}</option>
                    </select>
                  </td>
                  <td className="px-6 py-3 text-right">{o.admins_count}</td>
                  <td className="px-6 py-3 text-right">{o.customers_count}</td>
                  <td className="px-6 py-3 text-right">{o.products_count}</td>
                  <td className="px-6 py-3 text-right">{o.orders_count}</td>
                  <td className="px-6 py-3 text-gray-400">{formatDate(o.created_at)}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setEditOrg(o)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-brand hover:text-brand"
                    >
                      ✏️ Tahrirlash
                    </button>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-gray-400">
                    Tenant yo'q — «➕ Yangi tenant» bilan birinchisini qo'shing
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </main>

      {modalOpen && <NewOrgModal onClose={() => setModalOpen(false)} onCreated={load} />}
      {editOrg && <EditOrgModal org={editOrg} onClose={() => setEditOrg(null)} onSaved={load} />}
    </div>
  );
}
