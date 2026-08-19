import { useEffect, useState } from 'react';
import { formatSum, imageUrl, supabase } from '../lib/supabase';
import CustomerPicker, { PickedCustomer } from './CustomerPicker';

type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  model: string | null;
  image: string | null;
  variants: Variant[];
};

type CartLine = {
  variantId: string;
  productName: string;
  size: string | null;
  color: string | null;
  price: number;
  qty: number;
  discount: number;
};

export default function AdminOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountOpen, setDiscountOpen] = useState<Record<string, boolean>>({});
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      // Menejer o'z mijoziga buyurtma yaratganda EKRANDA ham o'z narxini
      // ko'rishi shart. Avval faqat `prices` (kompaniya bazasi) o'qilardi —
      // server esa admin_create_order ichida menejer narxini qo'llardi, ya'ni
      // menejer bir summani ko'rib, buyurtma boshqa summada tushardi.
      // Ustuvorlik serverdagi bilan bir xil:
      //   mijozga alohida narx > menejerning umumiy narxi > kompaniya bazasi
      const [{ data }, { data: mgrUser }] = await Promise.all([
        supabase
          .from('products')
          .select(
            `id, name, model,
             product_images ( storage_path, thumb_path, is_primary, sort_order ),
             product_variants ( id, sku, size, color, is_active,
               stock_levels ( qty, reserved ),
               prices ( price_group_id, price ) )`
          )
          .eq('is_active', true)
          .order('name')
          .limit(300),
        supabase.auth.getUser(),
      ]);

      // managers.id = menejerning o'z profil id'si. Admin bu jadvalda umuman
      // yo'q, shuning uchun bu so'rov admin uchun null qaytaradi va quyidagi
      // blok o'tkazib yuboriladi — admin baribir kompaniya bazasini ko'radi.
      const uid = (mgrUser as any)?.user?.id;
      const { data: mgr } = uid
        ? await supabase.from('managers').select('id, usd_rate').eq('id', uid).maybeSingle()
        : { data: null };

      const mgrPrices = new Map<string, { price: number; currency: string }>();
      if (mgr) {
        const rate = Number((mgr as any).usd_rate) || 0;
        const [{ data: general }, { data: perCustomer }] = await Promise.all([
          supabase.from('manager_prices').select('variant_id, price, currency'),
          supabase
            .from('manager_customer_prices')
            .select('variant_id, price, currency')
            .eq('customer_id', customer.id),
        ]);
        const put = (rows: any[]) => {
          for (const r of rows ?? []) {
            const raw = Number(r.price);
            const som = r.currency === 'USD' ? Math.round(raw * rate) : raw;
            mgrPrices.set(r.variant_id, { price: som, currency: r.currency });
          }
        };
        put(general ?? []); // avval umumiy...
        put(perCustomer ?? []); // ...keyin mijozga alohida narx ustidan yozadi
      }

      setProducts(
        (data ?? [])
          .map((p: any) => {
            const imgs = (p.product_images ?? []).sort(
              (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
            );
            const variants: Variant[] = (p.product_variants ?? [])
              .filter((v: any) => v.is_active)
              .map((v: any) => {
                const sl = Array.isArray(v.stock_levels) ? v.stock_levels[0] : v.stock_levels;
                const priceRow = (v.prices ?? []).find(
                  (pr: any) => pr.price_group_id === customer.price_group_id
                );
                const basePrice = priceRow ? Number(priceRow.price) : null;
                const own = mgrPrices.get(v.id);
                return {
                  id: v.id,
                  sku: v.sku,
                  size: v.size,
                  color: v.color,
                  price: own ? own.price : basePrice,
                  available: Math.max(0, (sl?.qty ?? 0) - (sl?.reserved ?? 0)),
                };
              })
              .filter((v: any): v is Variant => v.price != null && v.available > 0);
            return { id: p.id, name: p.name, model: p.model, image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null, variants };
          })
          .filter((p: Product) => p.variants.length > 0)
      );
    })();
  }, [customer]);

  function addToCart(p: Product, v: Variant) {
    const qty = parseInt(qtyInputs[v.id] || '1', 10) || 0;
    if (qty <= 0) return;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.variantId === v.id);
      const capped = Math.min(qty + (idx >= 0 ? prev[idx].qty : 0), v.available);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: capped };
        return next;
      }
      return [
        ...prev,
        { variantId: v.id, productName: p.name, size: v.size, color: v.color, price: v.price, qty: capped, discount: 0 },
      ];
    });
    setQtyInputs((prev) => ({ ...prev, [v.id]: '1' }));
  }

  function removeFromCart(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function toggleDiscount(variantId: string) {
    setDiscountOpen((prev) => ({ ...prev, [variantId]: !prev[variantId] }));
  }

  function setLineDiscount(variantId: string, raw: string) {
    const digits = raw.replace(/\D/g, '');
    setDiscountInputs((prev) => ({ ...prev, [variantId]: digits }));
    setCart((prev) =>
      prev.map((l) =>
        l.variantId === variantId
          ? { ...l, discount: Math.min(parseInt(digits || '0', 10) || 0, l.price) }
          : l
      )
    );
  }

  const total = cart.reduce((sum, l) => sum + (l.price - l.discount) * l.qty, 0);

  const q = search.trim().toLowerCase();
  const filteredProducts = q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.model ?? '').toLowerCase().includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q))
      )
    : products;

  async function submit() {
    setError(null);
    if (!customer) return setError('Mijozni tanlang');
    if (cart.length === 0) return setError("Kamida bitta mahsulot qo'shing");
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('admin_create_order', {
        p_customer_id: customer.id,
        p_items: cart.map((l) => ({ variant_id: l.variantId, qty: l.qty, discount: l.discount })),
        p_comment: comment.trim() || null,
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">🧾 Buyurtma yaratish (mijoz nomidan)</h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        {!customer ? (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-gray-500">Avval mijozni tanlang:</p>
            <CustomerPicker onPick={setCustomer} />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3">
              <div>
                <span className="font-bold text-gray-900">{customer.name}</span>
                <span className="ml-2 text-sm text-gray-500">{customer.phone}</span>
              </div>
              <button
                onClick={() => {
                  setCustomer(null);
                  setCart([]);
                  setDiscountOpen({});
                  setDiscountInputs({});
                }}
                className="text-xs font-bold text-brand hover:underline"
              >
                O'zgartirish
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
              {/* Mahsulot qidirish/tanlash */}
              <div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 Mahsulot yoki SKU bo'yicha qidirish..."
                  className={inputCls}
                />
                <div className="mt-3 max-h-[420px] space-y-4 overflow-y-auto">
                  {filteredProducts.length === 0 && (
                    <p className="p-6 text-center text-sm text-gray-400">Mahsulot topilmadi</p>
                  )}
                  {filteredProducts.map((p) => (
                    <div key={p.id} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          <img src={p.image} className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-sm font-bold text-brand">
                            {p.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="font-bold text-gray-900">
                          {p.name}
                          {p.model && <span className="ml-1 font-semibold text-gray-400">· {p.model}</span>}
                        </div>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {p.variants.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                            <span className="flex-1 text-gray-600">
                              {[v.size, v.color].filter(Boolean).join(' / ') || v.sku}
                              <span className="ml-2 text-xs text-gray-400">{v.available.toLocaleString()} dona</span>
                            </span>
                            <span className="font-bold text-gray-900">{formatSum(v.price)}</span>
                            <input
                              value={qtyInputs[v.id] ?? '1'}
                              onChange={(e) =>
                                setQtyInputs((prev) => ({ ...prev, [v.id]: e.target.value.replace(/\D/g, '') }))
                              }
                              className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm outline-none focus:border-brand"
                            />
                            <button
                              onClick={() => addToCart(p, v)}
                              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                            >
                              + Qo'shish
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Savat */}
              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="font-bold text-gray-900">Savat</h3>
                {cart.length === 0 && <p className="mt-3 text-sm text-gray-400">Hali mahsulot qo'shilmagan</p>}
                <div className="mt-2 space-y-3">
                  {cart.map((l) => (
                    <div key={l.variantId} className="border-b border-gray-50 pb-2 text-sm last:border-0">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-gray-800">{l.productName}</div>
                          <div className="text-xs text-gray-400">
                            {[l.size, l.color].filter(Boolean).join(' / ')} · {l.qty} ×{' '}
                            {l.discount > 0 ? (
                              <>
                                <span className="text-gray-300 line-through">{formatSum(l.price)}</span>{' '}
                                <span className="font-bold text-green-600">{formatSum(l.price - l.discount)}</span>
                              </>
                            ) : (
                              formatSum(l.price)
                            )}
                          </div>
                        </div>
                        <button onClick={() => removeFromCart(l.variantId)} className="ml-2 text-gray-300 hover:text-red-400">
                          ✕
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          onClick={() => toggleDiscount(l.variantId)}
                          className="text-xs font-bold text-brand hover:underline"
                        >
                          🏷️ {l.discount > 0 ? 'Skidkani tahrirlash' : 'Skidka bilan'}
                        </button>
                        {discountOpen[l.variantId] && (
                          <input
                            autoFocus
                            value={discountInputs[l.variantId] ?? (l.discount ? String(l.discount) : '')}
                            onChange={(e) => setLineDiscount(l.variantId, e.target.value)}
                            placeholder="Dona uchun skidka, so'm"
                            className="w-40 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-between border-t border-gray-100 pt-3">
                  <span className="font-semibold text-gray-500">Jami</span>
                  <span className="text-lg font-extrabold text-gray-900">{formatSum(total)}</span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Izoh (ixtiyoriy)"
                  className={inputCls + ' mt-3'}
                  rows={2}
                />
              </div>
            </div>
          </>
        )}

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">
            Bekor qilish
          </button>
          {customer && (
            <button
              onClick={submit}
              disabled={saving || cart.length === 0}
              className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Yuborilmoqda...' : 'Buyurtma yaratish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
