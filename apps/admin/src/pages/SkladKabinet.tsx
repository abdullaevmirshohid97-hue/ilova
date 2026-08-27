import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================================
// SKLAD KABINETI
//
// Sklad xodimi ko'radigan yagona ekran. U tenant emas — admin panelga
// kirmaydi, faqat O'Z skladi bilan ishlaydi:
//   * kelgan so'rovlar va ularga javob
//   * o'z praysi va qoldig'i
//
// MIJOZ NARXI KO'RSATILMAYDI. Sklad o'z narxini (tannarx) ko'radi,
// ustiga qo'yilgan foiz — bizning ishimiz.
//
// Ranglar ataylab tinch: bu ekranda kun bo'yi ishlanadi.
// ============================================================================

type Poz = { name: string; qty: number; base_price: number | null; base_sum: number | null };

type Sorov = {
  id: string;
  status: string;
  base_total: number;
  created_at: string;
  order_no: number;
  pharmacy: string | null;
  comment: string | null;
  pozitsiyalar: Poz[];
};

type Narx = {
  id: string;
  name: string;
  manufacturer: string | null;
  unit: string | null;
  base_price: number | null;
  stock: number | null;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const vaqt = (s: string) =>
  new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const HOLAT: Record<string, { nom: string; sinf: string }> = {
  new: { nom: 'yangi', sinf: 'bg-blue-50 text-blue-700 border-blue-200' },
  sent: { nom: 'yuborildi', sinf: 'bg-blue-50 text-blue-700 border-blue-200' },
  accepted: { nom: 'qabul qilindi', sinf: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { nom: 'rad etildi', sinf: 'bg-rose-50 text-rose-700 border-rose-200' },
  done: { nom: 'bajarildi', sinf: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function SkladKabinet({ sklad }: { sklad: { warehouse_id: string; sklad: string; full_name?: string | null } }) {
  const [bolim, setBolim] = useState<'sorovlar' | 'prays'>('sorovlar');
  const [sorovlar, setSorovlar] = useState<Sorov[]>([]);
  const [narxlar, setNarxlar] = useState<Narx[]>([]);
  const [jami, setJami] = useState(0);
  const [q, setQ] = useState('');
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const sorovlarniYukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('dori_kabinet_sorovlar', { p_limit: 30 });
    if (error) { setXato('So‘rovlarni o‘qib bo‘lmadi: ' + error.message); return; }
    setSorovlar((data ?? []) as Sorov[]);
  }, []);

  const narxlarniYukla = useCallback(async (qidiruv: string) => {
    setIsh('Yuklanmoqda...');
    const { data, error } = await supabase.rpc('dori_kabinet_narxlar', {
      p_q: qidiruv || null, p_offset: 0, p_limit: 100,
    });
    setIsh(null);
    if (error) { setXato('Praysni o‘qib bo‘lmadi: ' + error.message); return; }
    const d = data as { jami: number; items: Narx[] };
    setJami(Number(d?.jami ?? 0));
    setNarxlar(d?.items ?? []);
  }, []);

  useEffect(() => { sorovlarniYukla(); }, [sorovlarniYukla]);
  useEffect(() => { if (bolim === 'prays' && narxlar.length === 0) narxlarniYukla(''); }, [bolim, narxlar.length, narxlarniYukla]);

  async function javob(s: Sorov, status: string) {
    setIsh('Saqlanmoqda...');
    const { error } = await supabase.rpc('dori_kabinet_javob', { p_split_id: s.id, p_status: status });
    setIsh(null);
    if (error) { setXato('Bajarilmadi: ' + error.message); return; }
    await sorovlarniYukla();
  }

  async function qoldiqYangila(n: Narx, qiymat: string) {
    const t = qiymat.trim();
    const v = t === '' ? null : Number(t.replace(',', '.'));
    if (v !== null && !Number.isFinite(v)) return;
    const { error } = await supabase.rpc('dori_kabinet_qoldiq', { p_product_id: n.id, p_stock: v });
    if (error) { setXato('Qoldiq saqlanmadi: ' + error.message); return; }
    setNarxlar((p) => p.map((x) => (x.id === n.id ? { ...x, stock: v } : x)));
  }

  const kutilayotgan = sorovlar.filter((s) => s.status === 'new' || s.status === 'sent').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="text-lg font-bold text-slate-800">{sklad.sklad}</div>
            <div className="text-xs text-slate-500">
              Sklad kabineti{sklad.full_name ? ` · ${sklad.full_name}` : ''}
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Chiqish
          </button>
        </div>

        <div className="mx-auto flex max-w-5xl gap-1 px-4">
          {([['sorovlar', `So‘rovlar${kutilayotgan ? ` (${kutilayotgan})` : ''}`], ['prays', 'Mening praysim']] as const).map(
            ([k, nom]) => (
              <button
                key={k}
                onClick={() => setBolim(k as 'sorovlar' | 'prays')}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  bolim === k
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {nom}
              </button>
            )
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {xato && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <span>{xato}</span>
            <button onClick={() => setXato(null)}>✕</button>
          </div>
        )}
        {ish && <div className="mb-3 text-sm text-teal-700">{ish}</div>}

        {bolim === 'sorovlar' && (
          <div className="grid gap-3">
            {sorovlar.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                Hozircha so‘rov yo‘q. Buyurtma tushganda shu yerda ko‘rinadi.
              </div>
            )}

            {sorovlar.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800">
                      So‘rov №{s.order_no}
                      {s.pharmacy ? <span className="font-normal text-slate-500"> · {s.pharmacy}</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">{vaqt(s.created_at)}</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${HOLAT[s.status]?.sinf ?? ''}`}>
                    {HOLAT[s.status]?.nom ?? s.status}
                  </span>
                </div>

                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {s.pozitsiyalar.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-700">{p.name}</td>
                        <td className="w-20 py-1.5 text-right font-semibold text-slate-800">{son(p.qty)}</td>
                        <td className="w-28 py-1.5 text-right text-slate-500">{son(p.base_price)}</td>
                        <td className="w-32 py-1.5 text-right font-semibold text-slate-800">{son(p.base_sum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <div className="text-sm text-slate-600">
                    Jami: <b className="text-slate-900">{son(s.base_total)} so‘m</b>
                  </div>
                  <div className="flex gap-2">
                    {(s.status === 'new' || s.status === 'sent') && (
                      <>
                        <button onClick={() => javob(s, 'accepted')}
                                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                          Qabul qilaman
                        </button>
                        <button onClick={() => javob(s, 'rejected')}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                          Yo‘q
                        </button>
                      </>
                    )}
                    {s.status === 'accepted' && (
                      <button onClick={() => javob(s, 'done')}
                              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                        Bajarildi
                      </button>
                    )}
                  </div>
                </div>

                {s.comment && <div className="mt-2 text-xs text-slate-500">Izoh: {s.comment}</div>}
              </div>
            ))}
          </div>
        )}

        {bolim === 'prays' && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
              <div className="text-sm text-slate-600">
                Praysingizda <b className="text-slate-900">{son(jami)}</b> pozitsiya
              </div>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); narxlarniYukla(e.target.value); }}
                placeholder="dori nomi"
                className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
              />
            </div>

            <div className="p-4 text-xs text-slate-500">
              Qoldiqni kiritsangiz, buyurtma aynan shu songa qarab taqsimlanadi.
              Bo‘sh qoldirsangiz — cheklov qo‘yilmaydi.
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-semibold">DORI</th>
                    <th className="px-4 py-2 font-semibold">ISHLAB CHIQARUVCHI</th>
                    <th className="px-4 py-2 text-right font-semibold">NARXINGIZ</th>
                    <th className="px-4 py-2 text-right font-semibold">QOLDIQ</th>
                  </tr>
                </thead>
                <tbody>
                  {narxlar.map((n) => (
                    <tr key={n.id} className="border-b border-slate-50">
                      <td className="px-4 py-2 text-slate-800">{n.name}</td>
                      <td className="px-4 py-2 text-slate-500">{n.manufacturer ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-800">{son(n.base_price)}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          defaultValue={n.stock == null ? '' : String(n.stock)}
                          onBlur={(e) => qoldiqYangila(n, e.target.value)}
                          placeholder="—"
                          className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm outline-none focus:border-teal-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
