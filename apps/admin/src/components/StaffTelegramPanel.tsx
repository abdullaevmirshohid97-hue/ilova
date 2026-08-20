import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Xodimlar boti — admin va menejer paneli uchun bitta panel.
// Ulanish bir martalik kod orqali: pastdagi havola bosilganda Telegram
// botni "/start KOD" bilan ochadi va bot xodimni tanib oladi. Telefon
// orqali emas — adminda telefon ustuni ham yo'q, qolaversa kod aynan
// panelga kirgan odam qo'lida yaratiladi.
const BOT = 'yukchibolla_bot';

type Holat = { chat_id: number; username: string | null; linked_at: string } | null;

export default function StaffTelegramPanel() {
  const [holat, setHolat] = useState<Holat>(null);
  const [kod, setKod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    const { data } = await supabase
      .from('staff_telegram')
      .select('chat_id, username, linked_at')
      .maybeSingle();
    setHolat((data as any) ?? null);
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  async function ulash() {
    setXato(null);
    setBusy(true);
    const { data, error } = await supabase.rpc('staff_telegram_code');
    setBusy(false);
    if (error) return setXato(error.message);
    setKod(data as string);
  }

  async function uzish() {
    if (!confirm('Telegram ulanishi uzilsinmi? Yangi buyurtmalar haqida xabar kelmay qoladi.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('staff_telegram_unlink');
    setBusy(false);
    if (error) return setXato(error.message);
    setKod(null);
    yukla();
  }

  const havola = kod ? `https://t.me/${BOT}?start=${kod}` : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-base font-bold text-gray-900">📲 Telegram bot</h2>
      <p className="mt-1 text-sm text-gray-500">
        Botga ulansangiz, yangi buyurtma tushishi bilan telefoningizga xabar keladi va
        istalgan buyurtmaning fakturasini PDF qilib olasiz.
      </p>

      {holat ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            ✓ Ulangan{holat.username ? ` — @${holat.username}` : ''}
          </span>
          <a
            href={`https://t.me/${BOT}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand"
          >
            Botni ochish
          </a>
          <button
            disabled={busy}
            onClick={uzish}
            className="rounded-xl border border-red-200 px-5 py-2 text-sm font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            Uzish
          </button>
        </div>
      ) : havola ? (
        <div className="mt-4 space-y-3">
          <a
            href={havola}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold text-white hover:opacity-90"
          >
            🔗 Telegramda ochish va ulash
          </a>
          <div className="text-xs text-gray-500">
            Havola <b>30 daqiqa</b> amal qiladi. Boshqa qurilmada ochmoqchi bo'lsangiz, botda
            <b> /start {kod}</b> deb yozing.
          </div>
          <button
            onClick={yukla}
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-500 hover:border-brand hover:text-brand"
          >
            Ulandim — tekshirish
          </button>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={ulash}
          className="mt-4 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Tayyorlanmoqda...' : '🔗 Telegramga ulash'}
        </button>
      )}

      {xato && <div className="mt-3 text-sm text-red-500">{xato}</div>}
    </div>
  );
}
