import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Har bir foydalanuvchi (admin, menejer) o'zi kirgan holda o'z parolini
// o'zgartiradi — bu yerda majburiy murakkablik talabi yo'q, kamida 6
// belgi yetarli (sodda parol ham qo'yish mumkin).
export default function ChangePasswordPanel() {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    setDone(false);
    if (password.length < 6) return setError("Parol kamida 6 belgi bo'lsin");
    setSaving(true);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      setDone(true);
      setPassword('');
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">🔑 Mening parolim</h3>
      <p className="mt-1 text-sm text-gray-400">
        O'zingiz xohlagan parolni qo'ying — sodda parol ham bo'laveradi (kamida 6 belgi).
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Yangi parol"
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button
          onClick={save}
          disabled={saving}
          className="shrink-0 rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
      {done && <p className="mt-2 text-sm font-semibold text-emerald-600">✅ Parol yangilandi</p>}
    </div>
  );
}
