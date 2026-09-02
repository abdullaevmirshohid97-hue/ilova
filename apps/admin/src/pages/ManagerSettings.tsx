import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ChangePasswordPanel from '../components/ChangePasswordPanel';
import StaffTelegramPanel from '../components/StaffTelegramPanel';

export default function ManagerSettings() {
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const managerId = ((data.user?.user_metadata as any)?.manager_id as string) ?? null;
      if (!managerId) return;
      supabase
        .from('managers')
        .select('usd_rate')
        .eq('id', managerId)
        .single()
        .then(({ data: m }) => {
          if (m) setRate(String(Math.round(Number((m as any).usd_rate))));
        });
    });
  }, []);

  async function saveRate() {
    setError(null);
    setDone(false);
    const n = parseInt(rate.replace(/\D/g, ''), 10);
    if (!n || n <= 0) return setError("To'g'ri kurs kiriting");
    setSaving(true);
    const { error: e } = await supabase.rpc('set_my_usd_rate', { p_rate: n });
    if (e) setError(e.message);
    else setDone(true);
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="font-bold text-gray-900">💵 Dollar kursi</h3>
        <p className="mt-1 text-sm text-gray-500">
          Dollarda ($) qo'ygan narxlaringiz mijozga shu kurs bo'yicha so'mda ko'rinadi va shu
          bo'yicha hisoblanadi. Kursni istagan vaqt yangilab turishingiz mumkin.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))}
            placeholder="Masalan: 12700"
            className="w-40 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <span className="text-sm text-gray-500">so'm / 1$</span>
          <button
            onClick={saveRate}
            disabled={saving}
            className="ml-auto rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
        {done && <p className="mt-2 text-sm font-semibold text-emerald-600">✅ Kurs yangilandi</p>}
      </div>

      <StaffTelegramPanel />

      <ChangePasswordPanel />
    </div>
  );
}
