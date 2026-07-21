import { useCallback, useEffect, useState } from 'react';
import { genPassword, supabase } from '../lib/supabase';

type Category = { id: string; name: string; sort_order: number };
type Group = { id: string; name: string };

const rowInputCls =
  'flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand';

function CategoriesPanel() {
  const [rows, setRows] = useState<Category[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('categories').select('id, name, sort_order').order('sort_order');
    setRows((data ?? []) as Category[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error: e } = await supabase.from('categories').insert({ name: newName.trim(), sort_order: maxOrder + 1 });
    if (e) return setError(e.message);
    setNewName('');
    load();
  }
  async function rename(id: string, name: string) {
    const { error: e } = await supabase.from('categories').update({ name }).eq('id', id);
    if (e) alert('Xatolik: ' + e.message);
    load();
  }
  async function remove(id: string, name: string) {
    if (!confirm(`"${name}" kategoriyasi o'chirilsinmi? Bu kategoriyadagi mahsulotlar "kategoriyasiz" bo'lib qoladi.`)) return;
    const { error: e } = await supabase.from('categories').delete().eq('id', id);
    if (e) alert('Xatolik: ' + e.message);
    load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">📁 Kategoriyalar</h3>
      <div className="mt-4 space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) rename(c.id, v);
              }}
              className={rowInputCls}
            />
            <button onClick={() => remove(c.id, c.name)} className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-red-50">
              🗑
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-400">Kategoriya yo'q</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Yangi kategoriya nomi"
          className={rowInputCls}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          + Qo'shish
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
    </div>
  );
}

function PriceGroupsPanel() {
  const [rows, setRows] = useState<Group[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('price_groups').select('id, name').order('name');
    setRows((data ?? []) as Group[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    const { error: e } = await supabase.from('price_groups').insert({ name: newName.trim() });
    if (e) return setError(e.message);
    setNewName('');
    load();
  }
  async function rename(id: string, name: string) {
    const { error: e } = await supabase.from('price_groups').update({ name }).eq('id', id);
    if (e) alert('Xatolik: ' + e.message);
    load();
  }
  async function remove(id: string, name: string) {
    if (!confirm(`"${name}" narx tarifi o'chirilsinmi?`)) return;
    const { error: e } = await supabase.from('price_groups').delete().eq('id', id);
    if (e) {
      alert("O'chirib bo'lmadi — bu tarifda mijoz yoki narxlar bor. Avval ularni boshqa tarifga o'tkazing.");
      return;
    }
    load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">🏷 Narx tariflari</h3>
      <div className="mt-4 space-y-2">
        {rows.map((g) => (
          <div key={g.id} className="flex items-center gap-2">
            <input
              defaultValue={g.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== g.name) rename(g.id, v);
              }}
              className={rowInputCls}
            />
            <button onClick={() => remove(g.id, g.name)} className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-red-50">
              🗑
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-400">Narx tarifi yo'q</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Yangi tarif nomi (masalan, Optom)"
          className={rowInputCls}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          + Qo'shish
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
    </div>
  );
}

function StaffPanel() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!email.trim()) return setError('Email majburiy');
    setSaving(true);
    try {
      const { data, error: e } = await supabase.functions.invoke('admin-create-staff', {
        body: { email: email.trim(), password, full_name: fullName.trim() },
      });
      if (e) throw new Error(e.message);
      if (data?.error) throw new Error(data.error);
      setDone(`${email.trim()} / ${password}`);
      setEmail('');
      setFullName('');
      setPassword(genPassword());
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">👤 Xodim (admin) qo'shish</h3>
      <p className="mt-1 text-sm text-gray-400">
        Yangi administrator hisobi — email + parol bilan admin panelga kiradi.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ism familiya"
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@misol.com"
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <div className="flex gap-2 sm:col-span-2">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-brand"
          />
          <button
            onClick={() => setPassword(genPassword())}
            className="rounded-lg border border-gray-200 px-3 text-sm hover:border-brand"
          >
            🎲
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
      {done && <p className="mt-3 text-sm font-semibold text-emerald-600">✅ Yaratildi: {done}</p>}
      <button
        onClick={create}
        disabled={saving}
        className="mt-4 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Yaratilmoqda...' : 'Xodim yaratish'}
      </button>
    </div>
  );
}

export default function Settings({ role }: { role: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <CategoriesPanel />
      <PriceGroupsPanel />
      {role === 'super_admin' && <StaffPanel />}
    </div>
  );
}
