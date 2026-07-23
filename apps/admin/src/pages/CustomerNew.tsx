import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { genPassword, supabase } from '../lib/supabase';

type Group = { id: string; name: string };
type Manager = { id: string; name: string };

export default function CustomerNew() {
  const nav = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [groupId, setGroupId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ phone: string; password: string; invite: string } | null>(null);

  useEffect(() => {
    supabase
      .from('price_groups')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        setGroups((data ?? []) as Group[]);
        if (data?.[0]) setGroupId((data as any)[0].id);
      });
    supabase
      .from('managers')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setManagers((data ?? []) as Manager[]));
  }, []);

  function pickFile(f: File | null) {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  }

  async function save() {
    setError(null);
    if (!firstName.trim()) return setError('Ism majburiy');
    if (phone.replace(/\D/g, '').length < 12) return setError("Telefon raqam to'liq emas");
    if (!groupId) return setError('Tarifni tanlang');
    if (password.length < 6) return setError("Parol kamida 6 belgi bo'lsin");

    setSaving(true);
    try {
      // 1. Rasm (agar tanlangan bo'lsa)
      let photoPath: string | null = null;
      if (file) {
        photoPath = `customers/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(photoPath, file);
        if (upErr) throw new Error('Rasm: ' + upErr.message);
      }

      // 2. Server funksiyasi: mijoz + login yaratadi, gmail bo'lsa havola yuboradi
      const { data, error: fnErr } = await supabase.functions.invoke('admin-create-customer', {
        body: {
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: address.trim() || null,
          region: region.trim() || null,
          price_group_id: groupId,
          password,
          photo_path: photoPath,
          manager_id: managerId || null,
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);

      setDone({ phone: phone.trim(), password, invite: data.invite });
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  // ---------- Muvaffaqiyat ekrani ----------
  if (done) {
    const msg = `Assalomu alaykum! Yukchibolla ilovasiga kirish ma'lumotlaringiz:\nTelefon: ${done.phone}\nParol: ${done.password}\nIlovani oching va shu ma'lumotlar bilan kiring.`;
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="text-4xl">✅</div>
          <h2 className="mt-3 text-xl font-extrabold text-gray-900">Mijoz yaratildi!</h2>
          <div className="mt-6 rounded-xl bg-white p-6 text-left">
            <div className="text-xs font-semibold uppercase text-gray-400">Ilovaga kirish</div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-gray-500">Telefon (login):</span>
              <b className="text-gray-900">{done.phone}</b>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-500">Parol:</span>
              <b className="font-mono text-gray-900">{done.password}</b>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-500">Gmail havolasi:</span>
              <b className={done.invite === 'yuborildi' ? 'text-emerald-600' : 'text-gray-400'}>
                {done.invite === 'yuborildi'
                  ? '✉️ Yuborildi'
                  : done.invite === 'gmail_kiritilmagan'
                    ? 'Gmail kiritilmagan'
                    : done.invite}
              </b>
            </div>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(msg)}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90"
          >
            📋 Ma'lumotlarni nusxalash (SMS/Telegram uchun)
          </button>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => {
                setDone(null);
                setFirstName(''); setLastName(''); setPhone('+998'); setEmail('');
                setAddress(''); setRegion(''); setPassword(genPassword());
                setFile(null); setPreview(null); setManagerId('');
              }}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              + Yana yaratish
            </button>
            <button
              onClick={() => nav('/customers')}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              Mijozlar ro'yxati
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Forma ----------
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/customers" className="text-sm font-semibold text-gray-400 hover:text-brand">
        ← Mijozlar ro'yxatiga qaytish
      </Link>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-8">
        <h2 className="text-xl font-extrabold text-gray-900">➕ Yangi mijoz yaratish</h2>
        <p className="mt-1 text-sm text-gray-400">
          Mijoz siz bergan telefon + parol bilan mobil ilovaga kiradi. Gmail kiritsangiz, unga
          taklif havolasi ham boradi.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-[140px_1fr]">
          {/* Rasm */}
          <div>
            <label className="block cursor-pointer">
              {preview ? (
                <img src={preview} className="h-32 w-32 rounded-2xl border border-gray-200 object-cover" />
              ) : (
                <div className="flex h-32 w-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-brand hover:text-brand">
                  <span className="text-2xl">📷</span>
                  <span className="mt-1 text-xs font-semibold">Rasm</span>
                </div>
              )}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-500">ISM *</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="Alisher" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">FAMILIYA</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Karimov" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">TELEFON (LOGIN) *</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+998 90 123 45 67" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">GMAIL (ixtiyoriy)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="mijoz@gmail.com" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">VILOYAT</label>
              <input value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls} placeholder="Toshkent" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">MANZIL</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="Chorsu bozori, 12-do'kon" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">NARX TARIFI *</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">MENEJER (ixtiyoriy)</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={inputCls}>
                <option value="">— Yo'q —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
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
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Yaratilmoqda...' : 'Mijozni yaratish va login berish'}
        </button>
      </div>
    </div>
  );
}
