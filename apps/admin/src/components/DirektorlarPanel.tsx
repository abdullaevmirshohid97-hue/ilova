import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from './Xabar';
import { genPassword, supabase, fnXato } from '../lib/supabase';

// Direktor — KUZATUVCHI hisob. Buyurtma, sotuv, tahlil, hisobot va
// moliyani ko'radi, hech narsani o'zgartira olmaydi.
//
// Huquq bazada: is_admin() direktorni qamramaydi, unga faqat "for
// select" siyosatlari berilgan. Ya'ni bu panel hisob ochadi, xolos —
// cheklovni panel emas, RLS ushlab turadi.

type Qator = { id: string; name: string; phone: string };

async function chaqir(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('admin-direktor', {
    body: { action, ...extra },
  });
  // functions.invoke har xato uchun bitta gap qaytaradi — serverning
  // o'z xabari javob tanasida qoladi, fnXato uni ochib oladi
  if (error) throw new Error(await fnXato(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function DirektorlarPanel() {
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [yuklandi, setYuklandi] = useState(false);
  const [ochiq, setOchiq] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState(genPassword());
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [tayyor, setTayyor] = useState<{ phone: string; password: string } | null>(null);

  const yukla = useCallback(async () => {
    try {
      const d = await chaqir('list');
      setQatorlar((d?.rows ?? []) as Qator[]);
    } catch {
      // Ro'yxat kelmasa panel yopilib qolmasin — bo'sh ko'rinadi
      setQatorlar([]);
    } finally {
      setYuklandi(true);
    }
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  async function yarat() {
    setXato(null);
    if (!name.trim()) return setXato('Ism majburiy');
    if (phone.replace(/\D/g, '').length < 12) return setXato("Telefon raqam to'liq emas");
    if (password.length < 6) return setXato("Parol kamida 6 belgi bo'lsin");
    setSaqlanmoqda(true);
    try {
      await chaqir('create', { name: name.trim(), phone: phone.trim(), password });
      setTayyor({ phone: phone.trim(), password });
      await yukla();
    } catch (e: any) {
      setXato(e.message ?? 'Xatolik');
    } finally {
      setSaqlanmoqda(false);
    }
  }

  async function parolAlmash(q: Qator) {
    const yangi = genPassword();
    if (!(await tasdiqlaSoz(`${q.name} uchun yangi parol qo'yilsinmi?\n\nYangi parol: ${yangi}`)))
      return;
    try {
      await chaqir('password', { id: q.id, password: yangi });
      xabarKorsat(`✅ Yangi parol: ${yangi}`);
    } catch (e: any) {
      xabarKorsat('❌ ' + (e.message ?? 'Xatolik'));
    }
  }

  async function ochir(q: Qator) {
    if (!(await tasdiqlaSoz(`${q.name} direktor hisobi o'chirilsinmi? Bu amal qaytarilmaydi.`)))
      return;
    try {
      await chaqir('delete', { id: q.id });
      xabarKorsat('✅ Hisob o‘chirildi');
      await yukla();
    } catch (e: any) {
      xabarKorsat('❌ ' + (e.message ?? 'Xatolik'));
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">📊 Direktorlar</h3>
          <p className="mt-1 text-sm text-gray-500">
            Direktor buyurtma, sotuv, tahlil, hisobot va moliyani <b>faqat ko‘radi</b> —
            hech narsani o‘zgartira olmaydi. Panelga telefon raqami bilan kiradi
            («Direktor» yorlig‘ini tanlab).
          </p>
        </div>
        <button
          onClick={() => {
            setOchiq(true);
            setTayyor(null);
            setXato(null);
            setName('');
            setPhone('+998');
            setPassword(genPassword());
          }}
          className="shrink-0 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
        >
          ➕ Direktor qo‘shish
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {!yuklandi && <div className="text-sm text-gray-500">Yuklanmoqda...</div>}
        {yuklandi && qatorlar.length === 0 && (
          <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Hozircha direktor yo‘q
          </div>
        )}
        {qatorlar.map((q) => (
          <div
            key={q.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-gray-900">{q.name}</div>
              <div className="text-xs text-gray-500">{q.phone}</div>
            </div>
            <button
              onClick={() => parolAlmash(q)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-brand"
            >
              🔑 Yangi parol
            </button>
            <button
              onClick={() => ochir(q)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
            >
              O‘chirish
            </button>
          </div>
        ))}
      </div>

      {ochiq && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            {tayyor ? (
              <div className="text-center">
                <div className="text-4xl">✅</div>
                <h2 className="mt-3 text-xl font-extrabold text-gray-900">Direktor yaratildi</h2>
                <div className="mt-6 rounded-xl bg-gray-50 p-6 text-left">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Telefon (login):</span>
                    <b className="text-gray-900">{tayyor.phone}</b>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-gray-500">Parol:</span>
                    <b className="font-mono text-gray-900">{tayyor.password}</b>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Kirishda «Direktor» yorlig‘i tanlansin.
                  </p>
                </div>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `Direktor kabineti:\nTelefon: ${tayyor.phone}\nParol: ${tayyor.password}`
                    )
                  }
                  className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90"
                >
                  📋 Ma’lumotlarni nusxalash
                </button>
                <button
                  onClick={() => setOchiq(false)}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Yopish
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold text-gray-900">➕ Yangi direktor</h2>
                  <button
                    onClick={() => setOchiq(false)}
                    className="text-2xl text-gray-300 hover:text-gray-500"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500">ISM *</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                      placeholder="Familiya Ism"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">TELEFON (LOGIN) *</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={inputCls}
                      placeholder="+998 90 123 45 67"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">PAROL *</label>
                    <div className="flex gap-2">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputCls + ' font-mono'}
                      />
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
                {xato && <p className="mt-3 text-sm font-semibold text-red-500">{xato}</p>}
                <button
                  onClick={yarat}
                  disabled={saqlanmoqda}
                  className="mt-6 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saqlanmoqda ? 'Saqlanmoqda...' : 'Yaratish'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
