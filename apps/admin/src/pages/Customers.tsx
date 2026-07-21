import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatSum, supabase } from '../lib/supabase';
import PaymentModal from '../components/PaymentModal';

const AVATAR_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/`;

type Row = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photo: string | null;
  region: string | null;
  group: string;
  balance: number;
  active: boolean;
};

export default function Customers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [payFor, setPayFor] = useState<Row | null>(null);
  const nav = useNavigate();

  const load = useCallback(async () => {
    const [{ data: customers }, { data: balances }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone, email, photo_path, region, is_active, price_groups ( name )')
        .order('name'),
      supabase.from('customer_balances').select('customer_id, balance'),
    ]);
    const balMap = new Map(
      (balances ?? []).map((b: any) => [b.customer_id, Number(b.balance)])
    );
    setRows(
      (customers ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        photo: c.photo_path ? AVATAR_BASE + c.photo_path : null,
        region: c.region,
        group: c.price_groups?.name ?? '—',
        balance: balMap.get(c.id) ?? 0,
        active: c.is_active,
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => nav('/customers/new')}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Mijoz yaratish
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
            <th className="px-6 py-3">Mijoz</th>
            <th className="px-6 py-3">Telefon</th>
            <th className="px-6 py-3">Hudud</th>
            <th className="px-6 py-3">Narx tarifi</th>
            <th className="px-6 py-3 text-right">Balans</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => nav(`/customers/${r.id}`)}
              className="cursor-pointer border-t border-gray-50 hover:bg-gray-50/60"
            >
              <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                  {r.photo ? (
                    <img src={r.photo} className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">
                      {r.name.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-gray-900">
                      {r.name}
                      {!r.active && (
                        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
                          bloklangan
                        </span>
                      )}
                    </div>
                    {r.email && <div className="text-xs text-gray-400">{r.email}</div>}
                  </div>
                </div>
              </td>
              <td className="px-6 py-3 text-gray-600">{r.phone}</td>
              <td className="px-6 py-3 text-gray-500">{r.region ?? '—'}</td>
              <td className="px-6 py-3">
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                  {r.group}
                </span>
              </td>
              <td
                className={`px-6 py-3 text-right font-bold ${
                  r.balance > 0 ? 'text-red-500' : r.balance < 0 ? 'text-emerald-600' : 'text-gray-400'
                }`}
              >
                {r.balance > 0
                  ? `Qarz: ${formatSum(r.balance)}`
                  : r.balance < 0
                    ? `Haqi: ${formatSum(-r.balance)}`
                    : '0'}
              </td>
              <td className="px-6 py-3 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPayFor(r);
                  }}
                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-100"
                >
                  💵 To'lov
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                Mijozlar yo'q — «➕ Mijoz yaratish» bilan birinchisini qo'shing
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {payFor && (
        <PaymentModal
          customerId={payFor.id}
          customerName={payFor.name}
          onClose={() => setPayFor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
