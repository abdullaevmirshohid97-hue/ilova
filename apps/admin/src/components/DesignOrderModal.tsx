import { useState } from 'react';
import { supabase } from '../lib/supabase';
import CustomerPicker, { PickedCustomer } from './CustomerPicker';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DesignOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [size, setSize] = useState('');
  const [bottomMaterial, setBottomMaterial] = useState('');
  const [topMaterial, setTopMaterial] = useState('');
  const [bagMaterial, setBagMaterial] = useState('');
  const [ropeColor, setRopeColor] = useState('');
  const [printType, setPrintType] = useState<'tesneniya' | 'oddiy'>('oddiy');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [isFullyPaid, setIsFullyPaid] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [readyDate, setReadyDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qtyN = parseInt(qty, 10) || 0;
  const priceN = parseInt(unitPrice, 10) || 0;
  const total = qtyN * priceN;

  async function save() {
    setError(null);
    if (!customer) return setError('Mijozni tanlang');
    if (qtyN <= 0) return setError("Miqdorni to'g'ri kiriting");

    setSaving(true);
    try {
      const { error: e } = await supabase.from('design_orders').insert({
        customer_id: customer.id,
        size: size.trim() || null,
        bottom_material: bottomMaterial.trim() || null,
        top_material: topMaterial.trim() || null,
        bag_material: bagMaterial.trim() || null,
        rope_color: ropeColor.trim() || null,
        print_type: printType,
        qty: qtyN,
        unit_price: priceN,
        is_fully_paid: isFullyPaid,
        advance_amount: isFullyPaid ? 0 : parseInt(advanceAmount, 10) || 0,
        payment_due_date: !isFullyPaid && paymentDueDate ? paymentDueDate : null,
        ready_date: readyDate || null,
        notes: notes.trim() || null,
      });
      if (e) throw e;
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-brand';
  const labelCls = 'text-xs font-semibold text-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">🎨 Shaxsiy logoli dizayn buyurtmasi</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Individual qadoqlash (karopka + sumka) uchun texnik topshiriq va to'lov shartlari
        </p>

        {!customer ? (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-gray-500">Mijozni tanlang:</p>
            <CustomerPicker onPick={setCustomer} />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3">
              <div>
                <span className="font-bold text-gray-900">{customer.name}</span>
                <span className="ml-2 text-sm text-gray-500">{customer.phone}</span>
              </div>
              <button onClick={() => setCustomer(null)} className="text-xs font-bold text-brand hover:underline">
                O'zgartirish
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className={labelCls}>O'LCHAM</label>
                <input value={size} onChange={(e) => setSize(e.target.value)} className={inputCls} placeholder="masalan 26×36×8" />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className={labelCls}>TAG QISMI (karopka)</label>
                  <input
                    value={bottomMaterial}
                    onChange={(e) => setBottomMaterial(e.target.value)}
                    className={inputCls}
                    placeholder="Gofra 300gr"
                  />
                </div>
                <div>
                  <label className={labelCls}>USTKI QISMI (karopka)</label>
                  <input
                    value={topMaterial}
                    onChange={(e) => setTopMaterial(e.target.value)}
                    className={inputCls}
                    placeholder="Karton 300/350gr"
                  />
                </div>
                <div>
                  <label className={labelCls}>SUMKA QOG'OZI</label>
                  <input
                    value={bagMaterial}
                    onChange={(e) => setBagMaterial(e.target.value)}
                    className={inputCls}
                    placeholder="masalan Kraft"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={labelCls}>SUMKA IPI (dastak) RANGI</label>
                  <input value={ropeColor} onChange={(e) => setRopeColor(e.target.value)} className={inputCls} placeholder="masalan Qora" />
                </div>
                <div>
                  <label className={labelCls}>BOSMA TURI</label>
                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={() => setPrintType('tesneniya')}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                        printType === 'tesneniya' ? 'border-brand bg-brand-soft text-brand' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      Tesneniyali
                    </button>
                    <button
                      onClick={() => setPrintType('oddiy')}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                        printType === 'oddiy' ? 'border-brand bg-brand-soft text-brand' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      Oddiy pechatnoy
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className={labelCls}>MIQDOR (dona)</label>
                  <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>DONA NARXI (so'm)</label>
                  <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value.replace(/\D/g, ''))} className={inputCls} placeholder="15000" />
                </div>
                <div>
                  <label className={labelCls}>JAMI</label>
                  <div className="flex h-[42px] items-center rounded-xl bg-gray-50 px-4 text-sm font-bold text-gray-700">
                    {total.toLocaleString('ru-RU')} so'm
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={labelCls}>TAYYOR BO'LISH SANASI</label>
                  <input type="date" value={readyDate} min={todayStr()} onChange={(e) => setReadyDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>IZOH</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="ixtiyoriy" />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <input type="checkbox" checked={isFullyPaid} onChange={(e) => setIsFullyPaid(e.target.checked)} className="h-4 w-4" />
                  To'liq oldindan to'landi
                </label>
                {!isFullyPaid && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>OLDINDAN TO'LANGAN SUMMA (so'm)</label>
                      <input
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value.replace(/\D/g, ''))}
                        className={inputCls}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>QOLGAN PUL UCHUN SANA</label>
                      <input
                        type="date"
                        value={paymentDueDate}
                        min={todayStr()}
                        onChange={(e) => setPaymentDueDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">
            Bekor qilish
          </button>
          {customer && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
