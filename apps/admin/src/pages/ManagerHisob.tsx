import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from '../components/Xabar';
import { formatDate, formatSum, supabase } from '../lib/supabase';
import PaymentModal from '../components/PaymentModal';

// MENEJERNING HISOB-KITOBI
//
// Menejer mijozlarini yashirsa, korxona ular bilan pul ishini
// yuritmaydi — pulni menejer o'zi oladi. Shu ekran o'sha ish uchun.
//
// Ikki xil qarz bir ekranda turadi va ular ADASHTIRILMASLIGI kerak:
//   mijozlar → menejerga   — ustamali narxda
//   menejer  → korxonaga   — baza narxda (faqat ko'rish)
//
// Hammasi bitta menejer_hisob() chaqiruvidan keladi: uchta alohida
// so'rov yuborilsa, uchtasi uch vaqtda kelib, jami raqamlar
// bir-biriga to'g'ri kelmasdi.

type Mijoz = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  balance: number;
};

type Hisob = {
  korxonaga_qarzim: number;
  mijozlar_qarzi: number;
  mijozlar: Mijoz[];
};

type Harakat = {
  id: number;
  amount: number;
  kind: string;
  note: string | null;
  payment_id: string | null;
  order_number: number | null;
  created_at: string;
};

const TUR: Record<string, { label: string; cls: string }> = {
  order_debt: { label: 'Buyurtma', cls: 'text-gray-700' },
  payment: { label: "To'lov", cls: 'text-emerald-600' },
  discount: { label: 'Chegirma', cls: 'text-emerald-600' },
  adjustment: { label: 'Tuzatish', cls: 'text-amber-600' },
  cancel_reversal: { label: 'Bekor qilindi', cls: 'text-gray-500' },
};

function BalansRangi(b: number): string {
  return b > 0 ? 'text-red-500' : b < 0 ? 'text-emerald-600' : 'text-gray-500';
}

function balansMatni(b: number): string {
  if (b > 0) return `Qarz: ${formatSum(b)}`;
  if (b < 0) return `Haqi: ${formatSum(-b)}`;
  return '0';
}

export default function ManagerHisob() {
  const [hisob, setHisob] = useState<Hisob | null>(null);
  const [tanlangan, setTanlangan] = useState<Mijoz | null>(null);
  const [harakat, setHarakat] = useState<Harakat[] | null>(null);
  const [tolovUchun, setTolovUchun] = useState<Mijoz | null>(null);
  const [qidiruv, setQidiruv] = useState('');

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('menejer_hisob');
    if (error) {
      xabarKorsat('❌ ' + error.message);
      return;
    }
    setHisob(data as unknown as Hisob);
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const harakatniYukla = useCallback(async (m: Mijoz) => {
    setTanlangan(m);
    setHarakat(null);
    const { data, error } = await supabase.rpc('menejer_mijoz_harakati', {
      p_customer_id: m.id,
      p_limit: 100,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      setHarakat([]);
      return;
    }
    setHarakat((data ?? []) as unknown as Harakat[]);
  }, []);

  async function storno(h: Harakat) {
    if (!h.payment_id) return;
    const izoh = 'Menejer bekor qildi';
    if (!(await tasdiqlaSoz(`Bu to'lov bekor qilinsinmi? Mijozning qarzi tiklanadi.`))) return;
    const { error } = await supabase.rpc('menejer_storno', {
      p_payment_id: h.payment_id,
      p_note: izoh,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      return;
    }
    xabarKorsat('✅ To‘lov bekor qilindi');
    await yukla();
    if (tanlangan) await harakatniYukla(tanlangan);
  }

  const q = qidiruv.trim().toLowerCase();
  const royxat = (hisob?.mijozlar ?? []).filter(
    (m) => !q || m.name.toLowerCase().includes(q) || (m.phone ?? '').includes(q)
  );

  return (
    <div className="space-y-6">
      {/* Ikki qarz — ataylab boshqa rangda va boshqa yozuv bilan:
          bir xil ko'rinsa menejer qaysi biri kimniki ekanini
          chalkashtirib yuborardi */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Mijozlar menga qarz
          </div>
          <div className="mt-1 text-3xl font-extrabold text-gray-900">
            {formatSum(hisob?.mijozlar_qarzi ?? 0)}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Sizning narxingizda — ustamangiz bilan birga.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Men korxonaga qarzman
          </div>
          <div className="mt-1 text-3xl font-extrabold text-amber-900">
            {formatSum(hisob?.korxonaga_qarzim ?? 0)}
          </div>
          <p className="mt-2 text-xs text-amber-700">
            Baza narxda. Bu yerdan to‘lov yozib bo‘lmaydi — korxona hisobga oladi.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-6 py-4">
          <h3 className="font-bold text-gray-900">Mijozlarim</h3>
          <input
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            placeholder="Ism yoki telefon"
            className="ml-auto min-w-[14rem] rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">Mijoz</th>
                <th className="px-6 py-3">Telefon</th>
                <th className="px-6 py-3 text-right">Balans</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {hisob === null && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {hisob !== null && royxat.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    Mijoz topilmadi
                  </td>
                </tr>
              )}
              {royxat.map((m) => (
                <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-6 py-3">
                    <button
                      onClick={() => harakatniYukla(m)}
                      className="font-semibold text-gray-900 hover:text-brand"
                    >
                      {m.name}
                    </button>
                    {!m.active && (
                      <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        bloklangan
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{m.phone}</td>
                  <td className={`px-6 py-3 text-right font-bold ${BalansRangi(m.balance)}`}>
                    {balansMatni(m.balance)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setTolovUchun(m)}
                      className="rounded-xl bg-brand px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      💵 To‘lov
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {tanlangan && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">{tanlangan.name}</h2>
                <p className={`mt-1 text-sm font-bold ${BalansRangi(tanlangan.balance)}`}>
                  {balansMatni(tanlangan.balance)}
                </p>
              </div>
              <button
                onClick={() => setTanlangan(null)}
                className="text-2xl text-gray-300 hover:text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 max-h-[55vh] overflow-y-auto">
              {harakat === null && <div className="py-8 text-center text-gray-500">Yuklanmoqda...</div>}
              {harakat !== null && harakat.length === 0 && (
                <div className="py-8 text-center text-gray-500">Hali harakat yo‘q</div>
              )}
              {(harakat ?? []).map((h) => {
                const t = TUR[h.kind] ?? { label: h.kind, cls: 'text-gray-700' };
                return (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center gap-3 border-b border-gray-50 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${t.cls}`}>
                        {t.label}
                        {h.order_number ? ` · №${h.order_number}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(h.created_at)}
                        {h.note ? ' · ' + h.note : ''}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 font-bold ${
                        h.amount > 0 ? 'text-red-500' : 'text-emerald-600'
                      }`}
                    >
                      {h.amount > 0 ? '+' : '−'}
                      {formatSum(Math.abs(h.amount))}
                    </div>
                    {h.kind === 'payment' && h.payment_id && (
                      <button
                        onClick={() => storno(h)}
                        className="shrink-0 rounded-lg border border-red-200 px-3 py-1 text-xs font-bold text-red-500 hover:bg-red-50"
                      >
                        Bekor qilish
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setTolovUchun(tanlangan)}
                className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90"
              >
                💵 To‘lov qabul qilish
              </button>
              <button
                onClick={() => setTanlangan(null)}
                className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {tolovUchun && (
        <PaymentModal
          customerId={tolovUchun.id}
          customerName={tolovUchun.name}
          rpcNomi="menejer_tolov"
          onClose={() => setTolovUchun(null)}
          onSaved={async () => {
            await yukla();
            if (tanlangan) await harakatniYukla(tanlangan);
          }}
        />
      )}
    </div>
  );
}
