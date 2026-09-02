import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { avatarHavolalari, formatSum, supabase } from '../lib/supabase';
import PaymentModal from '../components/PaymentModal';

type Row = {
  id: string;
  name: string;
  phone: string | null;
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
    // customers_masked — menejerga biriktirilgan mijozning telefonini
    // admin uchun yashiradi. Bu view bo'lgani uchun price_groups
    // avtomatik "embed" qilinmaydi (PostgREST FK'ni faqat jadvallardan
    // biladi) — shuning uchun alohida so'rab, id bo'yicha bog'laymiz.
    const [{ data: customers }, { data: balances }, { data: groups }] = await Promise.all([
      supabase
        .from('customers_masked')
        .select('id, name, phone, email, photo_path, region, is_active, price_group_id')
        .order('name'),
      supabase.from('customer_balances').select('customer_id, balance'),
      supabase.from('price_groups').select('id, name'),
    ]);
    const balMap = new Map(
      (balances ?? []).map((b: any) => [b.customer_id, Number(b.balance)])
    );
    const groupMap = new Map((groups ?? []).map((g: any) => [g.id, g.name]));
    // Suratlar yopiq bucket'da — hamma qator uchun bitta so'rovda
    // imzolangan havola olamiz (har qatorga alohida so'rov yubormaymiz)
    const rasm = await avatarHavolalari((customers ?? []).map((c: any) => c.photo_path));
    setRows(
      (customers ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        photo: c.photo_path ? rasm.get(c.photo_path) ?? null : null,
        region: c.region,
        group: groupMap.get(c.price_group_id) ?? '—',
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
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
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
                        <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          bloklangan
                        </span>
                      )}
                    </div>
                    {r.email && <div className="text-xs text-gray-500">{r.email}</div>}
                  </div>
                </div>
              </td>
              <td className="px-6 py-3 text-gray-600">{r.phone ?? '🔒 menejer mijozi'}</td>
              <td className="px-6 py-3 text-gray-500">{r.region ?? '—'}</td>
              <td className="px-6 py-3">
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
                  {r.group}
                </span>
              </td>
              <td
                className={`px-6 py-3 text-right font-bold ${
                  r.balance > 0 ? 'text-red-500' : r.balance < 0 ? 'text-emerald-600' : 'text-gray-500'
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
              <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                Mijozlar yo'q — «➕ Mijoz yaratish» bilan birinchisini qo'shing
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
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
