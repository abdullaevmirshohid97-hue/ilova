import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Google bilan kirish SKLAD xodimlari uchun. Bu tugma o'zi hech kimga
  // eshik ochmaydi: kirgandan keyin email ro'yxatda bor-yo'qligi
  // tekshiriladi va ro'yxatda bo'lmasa hech qanday sklad ochilmaydi.
  async function googleBilan() {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError('Google orqali kirib bo‘lmadi: ' + err.message);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Admin/xodim — haqiqiy email bilan kiradi. Menejerga esa TELEFON +
    // parol berilgan (ichkarida <raqam>@menejer.ilova sifatida saqlanadi) —
    // shu yerda avtomatik aniqlanadi: "@" bo'lsa email, bo'lmasa telefon.
    const v = email.trim();
    const loginEmail = v.includes('@') ? v : v.replace(/\D/g, '') + '@menejer.ilova';
    const { error: err } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    if (err) setError("Email/telefon yoki parol noto'g'ri");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="text-center text-2xl font-extrabold tracking-wide text-gray-900">
          ILOVA <span className="text-brand">B2B</span>
        </div>
        <p className="mt-1 text-center text-sm text-gray-400">Boshqaruv paneli</p>

        <label className="mt-8 block text-xs font-semibold text-gray-500">EMAIL YOKI TELEFON</label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand"
          placeholder="admin@ilova.local yoki +998 90 123 45 67"
          required
        />

        <label className="mt-4 block text-xs font-semibold text-gray-500">PAROL</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand"
          placeholder="••••••••"
          required
        />

        {error && <p className="mt-3 text-center text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Kirilmoqda...' : 'Kirish'}
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] text-gray-400">yoki</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={googleBilan}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.7 5.2C42.2 36 45 30.6 45 24z" />
            <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.7-5.2c-1.9 1.3-4.4 2.2-7.8 2.2-5.9 0-11-4-12.8-9.4l-7 5.4C7.9 41 15.4 46 24 46z" />
            <path fill="#FBBC05" d="M11.2 28.3c-.5-1.4-.8-2.8-.8-4.3s.3-3 .8-4.3l-7-5.4C2.8 17.2 2 20.5 2 24s.8 6.8 2.2 9.7l7-5.4z" />
            <path fill="#EA4335" d="M24 10.6c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 7.9 7 4.2 14.3l7 5.4C13 14.6 18.1 10.6 24 10.6z" />
          </svg>
          Google bilan kirish
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
          Google bilan kirish sklad xodimlari uchun — emailingiz administrator
          tomonidan ro‘yxatga olingan bo‘lishi kerak.
        </p>
      </form>
    </div>
  );
}
