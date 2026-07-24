import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      </form>
    </div>
  );
}
