import { useEffect, useState } from 'react';
import { formatSum, imageUrl, supabase } from '../lib/supabase';

type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
};

type Product = {
  id: string;
  name: string;
  model: string | null;
  image: string | null;
  variants: Variant[];
};

export default function ManagerPrices() {
  const [managerId, setManagerId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setManagerId(((data.user?.user_metadata as any)?.manager_id as string) ?? null);
    });
  }, []);

  useEffect(() => {
    if (!managerId) return;
    Promise.all([
      supabase
        .from('products')
        .select(
          `id, name, model,
           product_images ( storage_path, thumb_path, is_primary, sort_order ),
           product_variants ( id, sku, size, color, is_active )`
        )
        .eq('is_active', true)
        .order('name')
        .limit(300),
      supabase.from('manager_prices').select('variant_id, price'),
    ]).then(([{ data: prodData }, { data: priceData }]) => {
      const priceMap: Record<string, number> = {};
      for (const p of priceData ?? []) priceMap[(p as any).variant_id] = Number((p as any).price);
      setPrices(priceMap);

      setProducts(
        (prodData ?? [])
          .map((p: any) => {
            const imgs = (p.product_images ?? []).sort(
              (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
            );
            const variants: Variant[] = (p.product_variants ?? [])
              .filter((v: any) => v.is_active)
              .map((v: any) => ({ id: v.id, sku: v.sku, size: v.size, color: v.color }));
            return {
              id: p.id,
              name: p.name,
              model: p.model,
              image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null,
              variants,
            };
          })
          .filter((p: Product) => p.variants.length > 0)
      );
      setLoading(false);
    });
  }, [managerId]);

  async function savePrice(variantId: string) {
    if (!managerId) return;
    const raw = inputs[variantId];
    const n = parseInt((raw ?? '').replace(/\D/g, ''), 10);
    if (!raw || Number.isNaN(n)) return;
    setSaving(variantId);
    const { error } = await supabase
      .from('manager_prices')
      .upsert({ manager_id: managerId, variant_id: variantId, price: n }, { onConflict: 'manager_id,variant_id' });
    if (!error) {
      setPrices((p) => ({ ...p, [variantId]: n }));
      setInputs((p) => {
        const next = { ...p };
        delete next[variantId];
        return next;
      });
    }
    setSaving(null);
  }

  async function clearPrice(variantId: string) {
    if (!managerId) return;
    setSaving(variantId);
    await supabase.from('manager_prices').delete().eq('manager_id', managerId).eq('variant_id', variantId);
    setPrices((p) => {
      const next = { ...p };
      delete next[variantId];
      return next;
    });
    setSaving(null);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.model ?? '').toLowerCase().includes(q) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(q))
      )
    : products;

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div>
      <h1 className="text-xl font-extrabold text-gray-900">🏷️ Narxlarim</h1>
      <p className="mt-1 text-sm text-gray-400">
        Bu yerda qo'ygan narxingiz bo'yicha sizga biriktirilgan mijozlar tovar sotib oladi. Narx
        qo'ymagan mahsulotlaringiz odatdagi narxda sotiladi. Bu narxlarni faqat siz ko'rasiz.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Mahsulot yoki SKU bo'yicha qidirish..."
        className={inputCls + ' mt-4'}
      />

      {loading ? (
        <p className="mt-8 text-center text-sm text-gray-400">Yuklanmoqda...</p>
      ) : (
        <div className="mt-4 space-y-4">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-400">Mahsulot topilmadi</p>
          )}
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-100 bg-white p-4">
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
                {p.variants.map((v) => {
                  const mine = prices[v.id];
                  return (
                    <div key={v.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="flex-1 text-gray-600">
                        {[v.size, v.color].filter(Boolean).join(' / ') || v.sku}
                      </span>
                      {mine != null && (
                        <span className="text-xs font-bold text-emerald-600">{formatSum(mine)}</span>
                      )}
                      <input
                        value={inputs[v.id] ?? ''}
                        onChange={(e) => setInputs((p) => ({ ...p, [v.id]: e.target.value.replace(/\D/g, '') }))}
                        placeholder={mine != null ? "O'zgartirish" : "Narx qo'yish"}
                        className="w-32 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => savePrice(v.id)}
                        disabled={saving === v.id || !inputs[v.id]}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Saqlash
                      </button>
                      {mine != null && (
                        <button
                          onClick={() => clearPrice(v.id)}
                          disabled={saving === v.id}
                          className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold text-gray-400 hover:border-red-300 hover:text-red-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
