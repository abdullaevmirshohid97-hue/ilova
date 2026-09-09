import { useCallback, useEffect, useState } from 'react';
import { ORDER_STATUS, formatDate, formatSum, supabase } from '../lib/supabase';
import { JadvalSkelet } from '../components/Skelet';

// Direktor uchun buyurtmalar — FAQAT KO'RISH.
//
// Orders.tsx ni qayta ishlatmadik: unda tasdiqlash, bekor qilish,
// tahrirlash, yangi buyurtma va Telegramga yuborish tugmalari bor.
// Ularni "agar direktor bo'lsa yashir" bilan o'chirish xavfli —
// bitta shart unutilsa direktor jonli buyurtmani o'zgartirib
// yuborardi. Bu yerda o'sha tugmalar umuman yo'q.
//
// Haqiqiy himoya baribir bazada: is_admin() direktorni qamramaydi,
// shuning uchun confirm_order/cancel_order/edit_order_items unga
// RUXSAT_YOQ beradi. Bu ekran shunchaki chalkashtirmaydi.
//
// Narx — RASMIY (baza) narx, xuddi admin panelidagidek: menejerning
// ustamasi korxona xodimlariga ko'rsatilmaydi.

type Qator = {
  id: string;
  order_number: number;
  status: string;
  base_total: number;
  created_at: string;
  customer: string;
};

const FILTRLAR: { key: string; label: string }[] = [
  { key: 'all', label: 'Hammasi' },
  { key: 'new', label: 'Yangi' },
  { key: 'confirmed', label: 'Qabul qilingan' },
  { key: 'picking', label: 'Yig‘ilmoqda' },
  { key: 'done', label: 'Yopilgan' },
  { key: 'cancelled', label: 'Bekor qilingan' },
];

const SAHIFA = 50;

export default function DirektorBuyurtmalar() {
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [yuklandi, setYuklandi] = useState(false);
  const [filtr, setFiltr] = useState('all');
  const [qidiruv, setQidiruv] = useState('');
  const [sanaDan, setSanaDan] = useState('');
  const [sanaGacha, setSanaGacha] = useState('');
  const [sahifa, setSahifa] = useState(0);
  const [yana, setYana] = useState(false);

  const yukla = useCallback(async () => {
    const q_ = qidiruv.trim();
    const raqammi = q_ !== '' && /^\d+$/.test(q_);

    // XARIDOR — bill_customer_id bo'yicha. customer_id bo'yicha
    // qolsa, menejer yashirgan mijozning buyurtmasi "!inner" tufayli
    // ro'yxatdan BUTUNLAY tushib qolardi: RLS yashirin mijozni
    // bermaydi, ichki bog'lanish esa qatorni tashlab yuboradi.
    let q = supabase
      .from('orders')
      .select(
        'id, order_number, status, base_total, created_at,' +
          ' xaridor:customers!orders_bill_customer_id_fkey!inner ( name )'
      )
      .order('created_at', { ascending: false })
      .range(sahifa * SAHIFA, sahifa * SAHIFA + SAHIFA - 1);

    if (filtr !== 'all') q = q.eq('status', filtr);
    if (raqammi) q = q.eq('order_number', parseInt(q_, 10));
    else if (q_) q = q.ilike('xaridor.name', `%${q_}%`);
    if (sanaDan) q = q.gte('created_at', sanaDan);
    // "gacha" — o'sha kunning oxirigacha: sof sana berilsa soat 00:00
    // bo'lib, o'sha kun buyurtmalari ro'yxatdan tushib qolardi
    if (sanaGacha) q = q.lte('created_at', sanaGacha + 'T23:59:59');

    const { data } = await q;
    setQatorlar(
      (data ?? []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        base_total: Number(o.base_total),
        created_at: o.created_at,
        customer: o.xaridor?.name ?? '—',
      }))
    );
    setYana((data ?? []).length === SAHIFA);
    setYuklandi(true);
  }, [filtr, qidiruv, sanaDan, sanaGacha, sahifa]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  // Filtr o'zgarsa birinchi sahifaga qaytamiz — aks holda 3-sahifada
  // turib filtr almashtirilsa bo'sh ro'yxat chiqardi
  useEffect(() => {
    setSahifa(0);
  }, [filtr, qidiruv, sanaDan, sanaGacha]);

  const inputCls =
    'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        👁️ Kuzatuv rejimi — buyurtmalarni ko‘rasiz, o‘zgartira olmaysiz.
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTRLAR.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltr(f.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              filtr === f.key
                ? 'bg-brand text-white'
                : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={qidiruv}
          onChange={(e) => setQidiruv(e.target.value)}
          placeholder="Mijoz nomi yoki buyurtma raqami"
          className={inputCls + ' min-w-[16rem] flex-1'}
        />
        <input type="date" value={sanaDan} onChange={(e) => setSanaDan(e.target.value)} className={inputCls} />
        <input type="date" value={sanaGacha} onChange={(e) => setSanaGacha(e.target.value)} className={inputCls} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">№</th>
                <th className="px-6 py-3">Mijoz</th>
                <th className="px-6 py-3">Sana</th>
                <th className="px-6 py-3">Holat</th>
                <th className="px-6 py-3 text-right">Summa</th>
              </tr>
            </thead>
            <tbody>
              {!yuklandi && <JadvalSkelet ustun={5} />}
              {yuklandi &&
                qatorlar.map((o) => {
                  const st = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100' };
                  return (
                    <tr key={o.id} className="border-t border-gray-50">
                      <td className="px-6 py-3 font-bold text-gray-900">№{o.order_number}</td>
                      <td className="px-6 py-3 text-gray-700">{o.customer}</td>
                      <td className="px-6 py-3 text-gray-500">{formatDate(o.created_at)}</td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-gray-900">
                        {formatSum(o.base_total)}
                      </td>
                    </tr>
                  );
                })}
              {yuklandi && qatorlar.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    Buyurtma topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(sahifa > 0 || yana) && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setSahifa((s) => Math.max(0, s - 1))}
            disabled={sahifa === 0}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
          >
            ← Oldingi
          </button>
          <button
            onClick={() => setSahifa((s) => s + 1)}
            disabled={!yana}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
          >
            Keyingi →
          </button>
        </div>
      )}
    </div>
  );
}
