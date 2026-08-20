import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatSum, genPassword, supabase } from '../lib/supabase';
import ChangePasswordPanel from '../components/ChangePasswordPanel';
import StaffTelegramPanel from '../components/StaffTelegramPanel';

type Category = { id: string; name: string; sort_order: number };
type Group = { id: string; name: string };
type CancelledDesignOrder = {
  id: string;
  customer: string;
  phone: string;
  qty: number;
  total: number;
  createdAt: string;
};

const rowInputCls =
  'flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand';

// Biznes nomi — fakturalarda, pick-list'larda va hisobotlarda chiqadi,
// shuning uchun admin uni o'zi to'g'rilay olishi kerak. Obuna holati va
// tarif bu yerda YO'Q — ularni faqat super-admin o'zgartiradi
// (update_org_profile RPC ham faqat shu uchta maydonni yangilaydi).
function OrgProfilePanel() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, contact_name, contact_phone')
      .limit(1)
      .maybeSingle();
    if (!data) return;
    setOrgId((data as any).id);
    setName((data as any).name ?? '');
    setContactName((data as any).contact_name ?? '');
    setContactPhone((data as any).contact_phone ?? '');
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg(null);
    if (!name.trim()) return setMsg({ ok: false, text: 'Nom majburiy' });
    setSaving(true);
    const { error } = await supabase.rpc('update_org_profile', {
      p_org_id: orgId,
      p_name: name.trim(),
      p_contact_name: contactName.trim() || null,
      p_contact_phone: contactPhone.trim() || null,
    });
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saqlandi ✓' });
    if (!error) load();
  }

  if (!orgId) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="font-bold text-gray-900">🏢 Biznes ma'lumotlari</h2>
      <p className="mt-1 text-xs text-gray-400">
        Bu nom fakturalarda va hisobotlarda chiqadi
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">BIZNES NOMI *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={rowInputCls + ' w-full'} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-500">KONTAKT ISM</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={rowInputCls + ' w-full'} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">KONTAKT TELEFON</label>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={rowInputCls + ' w-full'} placeholder="+998 90 123 45 67" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
        {msg && (
          <span className={`text-sm font-semibold ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

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

function DangerZonePanel() {
  const [rows, setRows] = useState<CancelledDesignOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('design_orders')
      .select('id, qty, unit_price, created_at, customers ( name, phone )')
      .eq('status', 'cancelled')
      .order('created_at', { ascending: false });
    setRows(
      (data ?? []).map((d: any) => ({
        id: d.id,
        customer: d.customers?.name ?? '—',
        phone: d.customers?.phone ?? '',
        qty: d.qty,
        total: Number(d.qty) * Number(d.unit_price),
        createdAt: d.created_at,
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function permanentlyDelete(row: CancelledDesignOrder) {
    if (
      !confirm(
        `DIQQAT: "${row.customer}" ning bekor qilingan dizayn buyurtmasi BUTUNLAY o'chiriladi — bu amalni qaytarib bo'lmaydi. Davom etilsinmi?`
      )
    )
      return;
    setBusy(row.id);
    const { error } = await supabase.from('design_orders').delete().eq('id', row.id);
    if (error) alert('Xatolik: ' + error.message);
    setBusy(null);
    load();
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
      <h3 className="font-bold text-red-600">⚠️ Xavfli zona</h3>
      <p className="mt-1 text-sm text-gray-500">
        Bekor qilingan dizayn buyurtmalari — asosiy ro'yxatda ko'rinmaydi. Bu yerdan butunlay,
        qaytarib bo'lmaydigan tarzda o'chirish mumkin.
      </p>
      <div className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-400">Bekor qilingan buyurtma yo'q</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-sm">
            <div>
              <div className="font-semibold text-gray-800">
                {r.customer} <span className="font-normal text-gray-400">· {r.phone}</span>
              </div>
              <div className="text-xs text-gray-400">
                {r.qty.toLocaleString()} dona · {formatSum(r.total)} · {formatDate(r.createdAt)}
              </div>
            </div>
            <button
              onClick={() => permanentlyDelete(r)}
              disabled={busy === r.id}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              🗑 Butunlay o'chirish
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ChangePasswordPanel />
      <StaffTelegramPanel />
      <OrgProfilePanel />
      <CategoriesPanel />
      <PriceGroupsPanel />
      <StaffPanel />
      <DangerZonePanel />
    </div>
  );
}
