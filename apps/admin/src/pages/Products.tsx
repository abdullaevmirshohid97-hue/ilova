import { useCallback, useEffect, useState } from 'react';
import { formatSum, imageUrl, supabase } from '../lib/supabase';

type Group = { id: string; name: string };
type Category = { id: string; name: string };

type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  qty: number;
  reserved: number;
  prices: Record<string, number>; // group_id -> narx
};

type Product = {
  id: string;
  name: string;
  model: string | null;
  material: string | null;
  description: string | null;
  category_id: string | null;
  image: string | null;
  variants: Variant[];
};

type NewVariantRow = { size: string; color: string; sku: string; initQty: string };

const emptyRow = (): NewVariantRow => ({ size: '', color: '', sku: '', initQty: '' });

function makeSku(name: string, model: string, size: string, color: string): string {
  const part = (s: string) =>
    s
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 6);
  return [part(name), part(model), part(size), part(color)].filter(Boolean).join('-');
}

// ---------------- Mahsulot yaratish / tahrirlash oynasi ----------------
function ProductModal({
  product,
  groups,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null; // null = yangi kirim
  groups: Group[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = product != null;
  const [name, setName] = useState(product?.name ?? '');
  const [model, setModel] = useState(product?.model ?? '');
  const [material, setMaterial] = useState(product?.material ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(product?.image ?? null);
  const [newRows, setNewRows] = useState<NewVariantRow[]>(isEdit ? [] : [emptyRow()]);
  // yangi variantlar uchun guruh narxlari
  const [groupPrices, setGroupPrices] = useState<Record<string, string>>({});
  // edit rejimida mavjud variantlarning narx jadvali
  const [editPrices, setEditPrices] = useState<Record<string, Record<string, string>>>(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const v of product?.variants ?? []) {
      m[v.id] = {};
      for (const g of groups) m[v.id][g.id] = v.prices[g.id] != null ? String(v.prices[g.id]) : '';
    }
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Mahsulot nomi majburiy');
    const rows = newRows.filter((r) => r.size.trim() || r.color.trim() || r.sku.trim());
    if (!isEdit && rows.length === 0) return setError('Kamida bitta variant kiriting');

    setSaving(true);
    try {
      // 1. Mahsulot
      let productId = product?.id;
      if (isEdit) {
        const { error: e } = await supabase
          .from('products')
          .update({
            name: name.trim(),
            model: model.trim() || null,
            material: material.trim() || null,
            description: description.trim() || null,
            category_id: categoryId || null,
          })
          .eq('id', productId!);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase
          .from('products')
          .insert({
            name: name.trim(),
            model: model.trim() || null,
            material: material.trim() || null,
            description: description.trim() || null,
            category_id: categoryId || null,
          })
          .select('id')
          .single();
        if (e) throw e;
        productId = (data as any).id;
      }

      // 2. Rasm
      if (file && productId) {
        const path = `${productId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage
          .from('product-images')
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        await supabase.from('product_images').delete().eq('product_id', productId);
        const { error: imgErr } = await supabase
          .from('product_images')
          .insert({ product_id: productId, storage_path: path, is_primary: true, sort_order: 0 });
        if (imgErr) throw imgErr;
      }

      // 3. Yangi variantlar (+ narxlar + boshlang'ich kirim)
      for (const r of rows) {
        const sku =
          r.sku.trim() ||
          makeSku(name, model, r.size, r.color) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
        const { data: v, error: vErr } = await supabase
          .from('product_variants')
          .insert({
            product_id: productId,
            sku,
            size: r.size.trim() || null,
            color: r.color.trim() || null,
          })
          .select('id')
          .single();
        if (vErr) throw vErr;

        const priceRows = groups
          .filter((g) => groupPrices[g.id]?.trim())
          .map((g) => ({
            variant_id: (v as any).id,
            price_group_id: g.id,
            price: parseInt(groupPrices[g.id].replace(/\D/g, ''), 10) || 0,
          }));
        if (priceRows.length > 0) {
          const { error: pErr } = await supabase
            .from('prices')
            .upsert(priceRows, { onConflict: 'variant_id,price_group_id' });
          if (pErr) throw pErr;
        }

        const init = parseInt(r.initQty.replace(/\D/g, ''), 10);
        if (init > 0) {
          const { error: sErr } = await supabase.rpc('add_stock', {
            p_variant_id: (v as any).id,
            p_qty: init,
            p_note: 'Yangi mahsulot kirimi',
          });
          if (sErr) throw sErr;
        }
      }

      // 4. Mavjud variantlar narxlarini yangilash (edit)
      if (isEdit) {
        const upserts: { variant_id: string; price_group_id: string; price: number }[] = [];
        for (const [variantId, byGroup] of Object.entries(editPrices)) {
          for (const [groupId, val] of Object.entries(byGroup)) {
            const n = parseInt(val.replace(/\D/g, ''), 10);
            if (val.trim() && n >= 0) {
              upserts.push({ variant_id: variantId, price_group_id: groupId, price: n });
            }
          }
        }
        if (upserts.length > 0) {
          const { error: pErr } = await supabase
            .from('prices')
            .upsert(upserts, { onConflict: 'variant_id,price_group_id' });
          if (pErr) throw pErr;
        }
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">
            {isEdit ? '✏️ Mahsulotni tahrirlash' : '➕ Yangi kirim — mahsulot yaratish'}
          </h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
          {/* Rasm */}
          <div>
            <label className="block cursor-pointer">
              {preview ? (
                <img
                  src={preview}
                  className="h-48 w-full rounded-xl border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-48 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-brand hover:text-brand">
                  <span className="text-3xl">🖼</span>
                  <span className="mt-2 text-xs font-semibold">Rasm tanlash</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {preview && (
              <label className="mt-2 block cursor-pointer text-center text-xs font-semibold text-brand hover:underline">
                Rasmni almashtirish
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {/* Maydonlar */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">NOMI *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Versace" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">MODEL</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} placeholder="V25" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">MATERIAL</label>
                <input value={material} onChange={(e) => setMaterial(e.target.value)} className={inputCls} placeholder="Paxta" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">KATEGORIYA</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                  <option value="">— tanlanmagan —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">TAVSIF</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Yangi variantlar */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">
              {isEdit ? 'Yangi variant qo`shish (ixtiyoriy)' : 'Variantlar (razmer × rang)'}
            </h3>
            <button
              onClick={() => setNewRows((p) => [...p, emptyRow()])}
              className="rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand"
            >
              + Variant qatori
            </button>
          </div>
          {newRows.map((r, i) => (
            <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_1.2fr_100px_32px] items-center gap-2">
              <input value={r.size} placeholder="Razmer (170x200)" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} />
              <input value={r.color} placeholder="Rang (Ko'k)" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
              <input value={r.sku} placeholder="SKU (bo'sh = avto)" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
              <input value={r.initQty} placeholder="Kirim" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, initQty: e.target.value.replace(/\D/g, '') } : x)))} />
              <button onClick={() => setNewRows((p) => p.filter((_, j) => j !== i))}
                className="text-gray-300 hover:text-red-400">✕</button>
            </div>
          ))}

          {newRows.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-bold text-gray-700">Yangi variantlar narxi (guruh bo'yicha, so'm)</h4>
              <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                {groups.map((g) => (
                  <div key={g.id}>
                    <label className="text-xs font-semibold text-gray-400">{g.name}</label>
                    <input
                      value={groupPrices[g.id] ?? ''}
                      onChange={(e) =>
                        setGroupPrices((p) => ({ ...p, [g.id]: e.target.value.replace(/\D/g, '') }))
                      }
                      className={inputCls}
                      placeholder="3000"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Edit: mavjud variantlar narx jadvali */}
        {isEdit && product!.variants.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold text-gray-900">Mavjud variantlar narxlari</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-400">
                    <th className="py-2 pr-3">Variant</th>
                    {groups.map((g) => (
                      <th key={g.id} className="px-2 py-2">{g.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product!.variants.map((v) => (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="py-2 pr-3 font-semibold text-gray-700">
                        {[v.size, v.color].filter(Boolean).join(' · ') || v.sku}
                      </td>
                      {groups.map((g) => (
                        <td key={g.id} className="px-2 py-2">
                          <input
                            value={editPrices[v.id]?.[g.id] ?? ''}
                            onChange={(e) =>
                              setEditPrices((p) => ({
                                ...p,
                                [v.id]: { ...p[v.id], [g.id]: e.target.value.replace(/\D/g, '') },
                              }))
                            }
                            className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-brand"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>}

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">
            Bekor qilish
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saqlanmoqda...' : isEdit ? 'Saqlash' : 'Kirim qilish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Asosiy sahifa ----------------
export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });

  const load = useCallback(async () => {
    const [{ data: prods }, { data: grps }, { data: cats }] = await Promise.all([
      supabase
        .from('products')
        .select(
          `id, name, model, material, description, category_id,
           product_images ( storage_path, is_primary, sort_order ),
           product_variants ( id, sku, size, color,
             stock_levels ( qty, reserved ),
             prices ( price_group_id, price ) )`
        )
        .order('name')
        .limit(500),
      supabase.from('price_groups').select('id, name').order('name'),
      supabase.from('categories').select('id, name').order('sort_order'),
    ]);
    setGroups((grps ?? []) as Group[]);
    setCategories((cats ?? []) as Category[]);
    setProducts(
      (prods ?? []).map((p: any) => {
        const imgs = (p.product_images ?? []).sort(
          (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
        );
        return {
          id: p.id,
          name: p.name,
          model: p.model,
          material: p.material,
          description: p.description,
          category_id: p.category_id,
          image: imgs[0] ? imageUrl(imgs[0].storage_path) : null,
          variants: (p.product_variants ?? []).map((v: any) => {
            const sl = Array.isArray(v.stock_levels) ? v.stock_levels[0] : v.stock_levels;
            const prices: Record<string, number> = {};
            for (const pr of v.prices ?? []) prices[pr.price_group_id] = Number(pr.price);
            return {
              id: v.id,
              sku: v.sku,
              size: v.size,
              color: v.color,
              qty: Number(sl?.qty ?? 0),
              reserved: Number(sl?.reserved ?? 0),
              prices,
            };
          }),
        };
      })
    );
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('stock-admin')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_levels' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  async function addStock(v: Variant, productName: string) {
    const val = prompt(`${productName} (${v.sku})\nOmborga nechta dona KIRIM qilinsin?`);
    const n = parseInt(val ?? '', 10);
    if (!n || n <= 0) return;
    const { error } = await supabase.rpc('add_stock', {
      p_variant_id: v.id,
      p_qty: n,
      p_note: 'Admin panel orqali kirim',
    });
    if (error) alert('Xatolik: ' + error.message);
    load();
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.model ?? '').toLowerCase().includes(q) ||
          p.variants.some(
            (v) =>
              v.sku.toLowerCase().includes(q) ||
              (v.size ?? '').toLowerCase().includes(q) ||
              (v.color ?? '').toLowerCase().includes(q)
          )
      )
    : products;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍  Qidiruv: nomi, SKU, razmer, rang..."
          className="w-full max-w-md rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() => setModal({ open: true, product: null })}
          className="ml-auto rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Yangi kirim
        </button>
      </div>

      {filtered.map((p) => (
        <div key={p.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-4">
            {p.image ? (
              <img src={p.image} className="h-14 w-14 rounded-xl border border-gray-100 object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-soft text-lg font-extrabold text-brand">
                {p.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-extrabold text-gray-900">
                {p.name}
                {p.model && <span className="ml-1 font-semibold text-gray-400">· {p.model}</span>}
              </div>
              <div className="text-xs text-gray-400">{p.material ?? ''}</div>
            </div>
            <button
              onClick={() => setModal({ open: true, product: p })}
              className="ml-auto rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:border-brand hover:text-brand"
            >
              ✏️ Tahrirlash
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-6 py-2">SKU</th>
                <th className="px-6 py-2">Razmer / Rang</th>
                <th className="px-6 py-2 text-right">Fizik</th>
                <th className="px-6 py-2 text-right">Band</th>
                <th className="px-6 py-2 text-right">Mavjud</th>
                <th className="px-6 py-2 text-right">Narx (Standart)</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {p.variants.map((v) => {
                const avail = v.qty - v.reserved;
                const stdGroup = groups.find((g) => g.name === 'Standart');
                return (
                  <tr key={v.id} className="border-t border-gray-50">
                    <td className="px-6 py-2.5 font-mono text-xs text-gray-500">{v.sku}</td>
                    <td className="px-6 py-2.5 text-gray-700">
                      {[v.size, v.color].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-6 py-2.5 text-right font-semibold">{v.qty.toLocaleString()}</td>
                    <td className="px-6 py-2.5 text-right text-amber-600">
                      {v.reserved > 0 ? v.reserved.toLocaleString() : '—'}
                    </td>
                    <td className={`px-6 py-2.5 text-right font-bold ${avail === 0 ? 'text-red-500' : avail < 1000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {avail.toLocaleString()}
                    </td>
                    <td className="px-6 py-2.5 text-right text-gray-600">
                      {stdGroup && v.prices[stdGroup.id] != null ? formatSum(v.prices[stdGroup.id]) : '—'}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <button
                        onClick={() => addStock(v, p.name)}
                        className="rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand hover:opacity-80"
                      >
                        + Kirim
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-400">
          Mahsulot topilmadi. «➕ Yangi kirim» bilan birinchisini qo'shing.
        </div>
      )}

      {modal.open && (
        <ProductModal
          product={modal.product}
          groups={groups}
          categories={categories}
          onClose={() => setModal({ open: false, product: null })}
          onSaved={load}
        />
      )}
    </div>
  );
}
