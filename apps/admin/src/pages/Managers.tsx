import { useCallback, useEffect, useState } from 'react';
import { genPassword, supabase, fnXato } from '../lib/supabase';

type Row = {
  id: string;
  name: string;
  phone: string;
  is_active: boolean;
};

// Xodimlar boti — admin ham, menejer ham shu bitta botga ulanadi,
// kim ekanini bot profil bo'yicha aniqlaydi.
const STAFF_BOT = 'yukchibolla_bot';

type TgHolat = {
  manager_id: string;
  has_account: boolean;
  linked: boolean;
  username: string | null;
  linked_at: string | null;
  invite_expires_at: string | null;
};

async function callFn(action: string, extra: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-update-manager', {
    body: { action, ...extra },
  });
  if (error) throw new Error(await fnXato(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------------- Yangi menejer yaratish oynasi ----------------
function ManagerNewModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ phone: string; password: string } | null>(null);

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Ism majburiy');
    if (phone.replace(/\D/g, '').length < 12) return setError("Telefon raqam to'liq emas");
    if (password.length < 6) return setError("Parol kamida 6 belgi bo'lsin");
    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-create-manager', {
        body: { name: name.trim(), phone: phone.trim(), password },
      });
      if (fnErr) throw new Error(await fnXato(fnErr));
      if (data?.error) throw new Error(data.error);
      setDone({ phone: phone.trim(), password });
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const msg = `Assalomu alaykum! Yukchibolla admin panelga kirish ma'lumotlaringiz:\nTelefon: ${done.phone}\nParol: ${done.password}`;
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
        <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-2xl">
          <div className="text-4xl">✅</div>
          <h2 className="mt-3 text-xl font-extrabold text-gray-900">Menejer yaratildi!</h2>
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
          <h2 className="text-xl font-extrabold text-gray-900">➕ Yangi menejer</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">ISM *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Mirshohid" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">TELEFON (LOGIN) *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+998 90 123 45 67" />
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
            {saving ? 'Yaratilmoqda...' : 'Menejer yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Managers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newPasswordFor, setNewPasswordFor] = useState<{ id: string; password: string } | null>(null);
  const [tgStatus, setTgStatus] = useState<Record<string, TgHolat>>({});
  const [invite, setInvite] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: tg }] = await Promise.all([
      supabase.from('managers').select('id, name, phone, is_active').order('name'),
      supabase.rpc('manager_telegram_status'),
    ]);
    setRows((data ?? []) as Row[]);
    const xarita: Record<string, TgHolat> = {};
    for (const t of ((tg ?? []) as any[])) xarita[t.manager_id] = t;
    setTgStatus(xarita);
  }, []);

  // Taklif havolasi: kod menejerning telefon raqamiga bog'lanadi, ya'ni
  // havolaning o'zi yetarli emas — botda o'sha raqamni tasdiqlash kerak.
  // Shu sabab admin havolani o'zi ishlatib menejer narxlarini ko'ra olmaydi.
  async function taklifHavolasi(r: Row) {
    setBusy(r.id);
    try {
      const { data, error } = await supabase.rpc('staff_telegram_code_for', { p_manager_id: r.id });
      if (error) throw error;
      const kod = (data as any)?.code as string;
      setInvite({ id: r.id, url: `https://t.me/${STAFF_BOT}?start=${kod}` });
      load();
    } catch (e: any) {
      alert(
        e?.message === 'MENEJER_HISOBI_YOQ'
          ? "Bu menejerda hali login yo'q — avval unga parol yarating."
          : 'Xatolik: ' + (e?.message ?? '')
      );
    } finally {
      setBusy(null);
    }
  }

  async function botdanUzish(r: Row) {
    if (!confirm(`${r.name}ning Telegram ulanishi uzilsinmi?`)) return;
    setBusy(r.id);
    try {
      const { error } = await supabase.rpc('staff_telegram_admin_unlink', { p_manager_id: r.id });
      if (error) throw error;
      load();
    } catch (e: any) {
      alert('Xatolik: ' + (e?.message ?? ''));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(r: Row) {
    if (r.is_active && !confirm(`${r.name} bloklansinmi?`)) return;
    setBusy(r.id);
    try {
      await callFn('set_active', { manager_id: r.id, is_active: !r.is_active });
      load();
    } catch (e: any) {
      alert('Xatolik: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(r: Row) {
    if (!confirm(`${r.name} uchun yangi parol o'rnatilsinmi?`)) return;
    setBusy(r.id);
    try {
      const pw = genPassword();
      await callFn('reset_password', { manager_id: r.id, new_password: pw });
      setNewPasswordFor({ id: r.id, password: pw });
    } catch (e: any) {
      alert('Xatolik: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-gray-400">
          Menejerlar o'ziga biriktirilgan mijozlarga o'z narxi bo'yicha sotadi (Narxlarim bo'limi
          orqali). Bir menejerning narxi va mijozlari boshqa menejerlarga ko'rinmaydi.
        </p>
        <button
          onClick={() => setShowNew(true)}
          className="shrink-0 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Menejer yaratish
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-6 py-3">Menejer</th>
              <th className="px-6 py-3">Telefon</th>
              <th className="px-6 py-3">Telegram</th>
              <th className="px-6 py-3"></th>
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
                        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                          bloklangan
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3 text-gray-600">{r.phone}</td>
                <td className="px-6 py-3">
                  {tgStatus[r.id]?.linked ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        🟢 Ulangan
                      </span>
                      {tgStatus[r.id]?.username && (
                        <span className="text-xs text-gray-400">@{tgStatus[r.id]?.username}</span>
                      )}
                      <button
                        onClick={() => botdanUzish(r)}
                        disabled={busy === r.id}
                        className="text-xs font-bold text-gray-400 hover:text-red-500 disabled:opacity-50"
                        title="Telegram ulanishini uzish"
                      >
                        ✕
                      </button>
                    </div>
                  ) : invite?.id === r.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={invite.url}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-52 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-800"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(invite.url)}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                        title="Nusxa olish"
                      >
                        📋
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-400">
                        ⚪ Ulanmagan
                      </span>
                      <button
                        onClick={() => taklifHavolasi(r)}
                        disabled={busy === r.id || !tgStatus[r.id]?.has_account}
                        title={
                          tgStatus[r.id]?.has_account
                            ? 'Havolani menejerga yuboring — u botda o‘z raqamini tasdiqlab ulanadi'
                            : "Avval menejerga parol yarating (login kerak)"
                        }
                        className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-bold text-gray-500 hover:border-brand hover:text-brand disabled:opacity-40"
                      >
                        🔗 Taklif havolasi
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="flex justify-end gap-2">
                    {newPasswordFor?.id === r.id && (
                      <span className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs">
                        <b className="font-mono">{newPasswordFor.password}</b>
                        <button
                          onClick={() => navigator.clipboard.writeText(newPasswordFor.password)}
                          className="font-bold text-emerald-700 hover:underline"
                        >
                          📋
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => resetPassword(r)}
                      disabled={busy === r.id}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-500 hover:border-brand hover:text-brand disabled:opacity-50"
                    >
                      🔑 Yangi parol
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      disabled={busy === r.id}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                        r.is_active
                          ? 'border-red-200 text-red-500 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {r.is_active ? '🚫 Bloklash' : '✅ Faollashtirish'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-gray-400">
                  Menejerlar yo'q — «➕ Menejer yaratish» bilan birinchisini qo'shing
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showNew && <ManagerNewModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  );
}
