import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ChangePasswordPanel from '../components/ChangePasswordPanel';
import StaffTelegramPanel from '../components/StaffTelegramPanel';

export default function ManagerSettings() {
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // null = hali yuklanmadi (kalitni noto'g'ri holatda ko'rsatmaslik uchun)
  const [korinsin, setKorinsin] = useState<boolean | null>(null);
  const [korinishBand, setKorinishBand] = useState(false);
  const [korinishXato, setKorinishXato] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const managerId = ((data.user?.user_metadata as any)?.manager_id as string) ?? null;
      if (!managerId) return;
      supabase
        .from('managers')
        .select('usd_rate, mijoz_korinsin')
        .eq('id', managerId)
        .single()
        .then(({ data: m }) => {
          if (!m) return;
          setRate(String(Math.round(Number((m as any).usd_rate))));
          setKorinsin(Boolean((m as any).mijoz_korinsin));
        });
    });
  }, []);

  async function korinishniOzgartir(yangi: boolean) {
    setKorinishXato(null);
    setKorinishBand(true);
    const { error: e } = await supabase.rpc('set_my_mijoz_korinish', { p_korinsin: yangi });
    if (e) setKorinishXato(e.message);
    else setKorinsin(yangi);
    setKorinishBand(false);
  }

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
        <h3 className="font-bold text-gray-900">🔒 Mijozlarim korxonaga ko‘rinsinmi</h3>
        <p className="mt-1 text-sm text-gray-500">
          Mijozlaringiz sizniki. Yashirsangiz korxona ularning ismini, telefonini va
          qarzini <b>umuman ko‘rmaydi</b>: mijozdan buyurtma kelganda korxona uchun{' '}
          <b>xaridor siz</b> bo‘lasiz — ya’ni korxona sizga <b>baza narxida</b> sotgan
          hisoblanadi, ustamangiz esa o‘zingizda qoladi. Mijoz bilan pul hisob-kitobini
          o‘zingiz yuritasiz.
        </p>

        {korinsin === null ? (
          <div className="mt-4 text-sm text-gray-500">Yuklanmoqda...</div>
        ) : (
          <>
            <div className="mt-4 flex overflow-hidden rounded-xl border border-gray-200">
              <button
                onClick={() => korinishniOzgartir(false)}
                disabled={korinishBand}
                className={`flex-1 px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                  !korinsin ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                🔒 Yashirin — mijozlarim meniki
              </button>
              <button
                onClick={() => korinishniOzgartir(true)}
                disabled={korinishBand}
                className={`flex-1 px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${
                  korinsin ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                👁️ Ochiq — korxona ko‘rsin
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {korinsin
                ? 'Hozir: korxona mijozlaringizni va ularning qarzini ko‘rib turibdi.'
                : 'Hozir: korxona faqat sizni ko‘radi. Buyurtmalar sizning nomingizdan tushadi.'}
            </p>
            {korinishXato && (
              <p className="mt-2 text-sm font-semibold text-red-500">{korinishXato}</p>
            )}
          </>
        )}
      </div>

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
