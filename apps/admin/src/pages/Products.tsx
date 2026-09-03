import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from '../components/Xabar';
import { Link } from 'react-router-dom';
import { formatSum, imageUrl, resizeImage, supabase } from '../lib/supabase';
import { asosiyTarifId, tarifNomi } from '../lib/tarif';
import { JadvalSkelet } from '../components/Skelet';
import { altbilgi, blank, hujjatniYoz, logoniOl, oynaOch, sozlamaniOl, uslub } from '../lib/hujjat';
import StockModal from '../components/StockModal';

type Group = { id: string; name: string };
type Category = { id: string; name: string };

type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  qty: number;
  reserved: number;
  is_active: boolean;
  prices: Record<string, number>; // group_id -> narx
};

type ProductImageRow = {
  id: string;
  storagePath: string;
  thumbPath: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

type Product = {
  id: string;
  name: string;
  model: string | null;
  material: string | null;
  description: string | null;
  category_id: string | null;
  images: ProductImageRow[]; // birinchi = asosiy (galereya tartibida)
  is_active: boolean;
  variants: Variant[];
};

type NewVariantRow = { height: string; width: string; length: string; color: string; sku: string; initQty: string };

const emptyRow = (): NewVariantRow => ({ height: '', width: '', length: '', color: '', sku: '', initQty: '' });

// Razmer mijozga har doim "balandligi×eni×bo'yi" tartibida ko'rinadi (masalan
// 8×26×36) — admin uchun esa uchta alohida maydonga bo'lib kiritiladi, shunda
// keyinchalik o'lchamlar bo'yicha qidiruv/filtr qo'shish osonlashadi.
function combineSize(height: string, width: string, length: string): string | null {
  const parts = [height, width, length].map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join('×') : null;
}

// Eski/qo'lda yozilgan razmerlarni (masalan "170x200" yoki "8×26×36") tahrir
// oynasidagi uchta maydonga imkon qadar qayta bo'lib beradi
function splitSize(size: string | null): { height: string; width: string; length: string } {
  if (!size) return { height: '', width: '', length: '' };
  const parts = size.split(/[×xX]/).map((s) => s.trim());
  return { height: parts[0] ?? '', width: parts[1] ?? '', length: parts[2] ?? '' };
}

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
  const [images, setImages] = useState<ProductImageRow[]>(product?.images ?? []);
  const [newFiles, setNewFiles] = useState<{ file: File; preview: string }[]>([]);
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
  // mavjud variantlar (size/rang/SKU/faollik tahriri shu yerda, jonli)
  const [variants, setVariants] = useState<Variant[]>(product?.variants ?? []);
  // mavjud variantlarning razmeri uchta alohida maydonga bo'lib ko'rsatiladi
  const [existingDims, setExistingDims] = useState<Record<string, { height: string; width: string; length: string }>>(
    () => {
      const m: Record<string, { height: string; width: string; length: string }> = {};
      for (const v of product?.variants ?? []) m[v.id] = splitSize(v.size);
      return m;
    }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchVariant(id: string, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function updateExistingDim(id: string, key: 'height' | 'width' | 'length', value: string) {
    setExistingDims((prev) => {
      const dims = { ...(prev[id] ?? { height: '', width: '', length: '' }), [key]: value };
      patchVariant(id, { size: combineSize(dims.height, dims.width, dims.length) });
      return { ...prev, [id]: dims };
    });
  }

  async function toggleVariantActive(v: Variant) {
    const { error: e } = await supabase
      .from('product_variants')
      .update({ is_active: !v.is_active })
      .eq('id', v.id);
    if (e) return xabarKorsat('Xatolik: ' + e.message);
    patchVariant(v.id, { is_active: !v.is_active });
    onSaved();
  }

  async function deleteVariant(v: Variant) {
    if (!await tasdiqlaSoz(`${v.sku} butunlay o'chirilsinmi?\nEslatma: buyurtma yoki ombor tarixida ishlatilgan bo'lsa, o'chirib bo'lmaydi — shunda "yashirish"dan foydalaning.`)) {
      return;
    }
    const { error: e } = await supabase.from('product_variants').delete().eq('id', v.id);
    if (e) {
      xabarKorsat("O'chirib bo'lmadi — bu variant buyurtma yoki ombor tarixida ishlatilgan. Uni yashiring.");
      return;
    }
    setVariants((prev) => prev.filter((x) => x.id !== v.id));
    onSaved();
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const added = Array.from(list).map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setNewFiles((prev) => [...prev, ...added]);
  }

  function removeNewFile(idx: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function deleteImage(img: ProductImageRow) {
    if (!await tasdiqlaSoz("Bu rasm o'chirilsinmi?")) return;
    const paths = [img.storagePath, img.thumbPath].filter((p): p is string => !!p);
    await supabase.storage.from('product-images').remove(paths);
    const { error: e } = await supabase.from('product_images').delete().eq('id', img.id);
    if (e) return xabarKorsat('Xatolik: ' + e.message);

    const wasPrimary = img.isPrimary;
    const remaining = images.filter((x) => x.id !== img.id);
    if (wasPrimary && remaining.length > 0) {
      await supabase.from('product_images').update({ is_primary: true }).eq('id', remaining[0].id);
      remaining[0] = { ...remaining[0], isPrimary: true };
    }
    setImages(remaining);
    onSaved();
  }

  async function setPrimaryImage(img: ProductImageRow) {
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', product!.id);
    await supabase.from('product_images').update({ is_primary: true }).eq('id', img.id);
    setImages((prev) => prev.map((x) => ({ ...x, isPrimary: x.id === img.id })));
    onSaved();
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Mahsulot nomi majburiy');
    const rows = newRows.filter(
      (r) => r.height.trim() || r.width.trim() || r.length.trim() || r.color.trim() || r.sku.trim()
    );
    if (!isEdit && rows.length === 0) return setError('Kamida bitta variant kiriting');

    // Narxsiz variant mijoz katalogida UMUMAN ko'rinmaydi. Avval bu jimgina
    // sodir bo'lardi — mahsulot saqlanardi, admin esa uni mijoz ko'rmayotganini
    // bilmasdi. Endi ataylab shundaymi deb so'raymiz.
    const narxKiritilgan = groups.some((g) => groupPrices[g.id]?.trim());
    if (rows.length > 0 && !narxKiritilgan) {
      const davom = window.confirm(
        "Narx kiritilmadi!\n\nNarxsiz mahsulot mijozning katalogida KO'RINMAYDI.\n\n" +
          'Baribir saqlansinmi? (Narxni keyin "+ Kirim" tugmasi orqali qo\'yish mumkin)'
      );
      if (!davom) return;
    }

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

      // 2. Yangi rasmlar — har biri uchun kichik (katalog) va katta (mahsulot sahifasi) nusxa
      if (newFiles.length > 0 && productId) {
        let sortOrder = images.length;
        for (let i = 0; i < newFiles.length; i++) {
          const base = `${productId}/${Date.now()}-${i}`;
          const [thumbBlob, fullBlob] = await Promise.all([
            resizeImage(newFiles[i].file, 300),
            resizeImage(newFiles[i].file, 1200),
          ]);
          const fullPath = `${base}-full.jpg`;
          const thumbPath = `${base}-thumb.jpg`;
          const { error: upErr1 } = await supabase.storage
            .from('product-images')
            .upload(fullPath, fullBlob, { upsert: true, contentType: 'image/jpeg' });
          if (upErr1) throw upErr1;
          const { error: upErr2 } = await supabase.storage
            .from('product-images')
            .upload(thumbPath, thumbBlob, { upsert: true, contentType: 'image/jpeg' });
          if (upErr2) throw upErr2;
          const { error: imgErr } = await supabase.from('product_images').insert({
            product_id: productId,
            storage_path: fullPath,
            thumb_path: thumbPath,
            is_primary: images.length === 0 && i === 0,
            sort_order: sortOrder++,
          });
          if (imgErr) throw imgErr;
        }
      }

      // 3. Yangi variantlar (+ narxlar + boshlang'ich kirim)
      for (const r of rows) {
        const size = combineSize(r.height, r.width, r.length);
        const sku =
          r.sku.trim() ||
          makeSku(name, model, size ?? '', r.color) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
        const { data: v, error: vErr } = await supabase
          .from('product_variants')
          .insert({
            product_id: productId,
            sku,
            size,
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

        // 5. Mavjud variantlarning razmer/rang/SKU tahriri
        for (const v of variants) {
          const { error: vErr } = await supabase
            .from('product_variants')
            .update({ size: v.size, color: v.color, sku: v.sku })
            .eq('id', v.id);
          if (vErr) throw new Error(`Variant ${v.sku}: ` + vErr.message);
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
          {/* Rasm galereyasi */}
          <div>
            <div className="grid grid-cols-2 gap-2">
              {images.map((img) => (
                <div key={img.id} className="group relative">
                  <img
                    src={imageUrl(img.thumbPath || img.storagePath)}
                    className={`h-20 w-full rounded-lg border object-cover ${img.isPrimary ? 'border-brand' : 'border-gray-200'}`}
                  />
                  {img.isPrimary && (
                    <span className="absolute left-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      asosiy
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/50 py-0.5 opacity-0 group-hover:opacity-100">
                    {!img.isPrimary && (
                      <button
                        onClick={() => setPrimaryImage(img)}
                        title="Asosiy qilish"
                        className="text-xs text-white"
                      >
                        ⭐
                      </button>
                    )}
                    <button onClick={() => deleteImage(img)} title="O'chirish" className="text-xs text-white">
                      🗑
                    </button>
                  </div>
                </div>
              ))}
              {newFiles.map((nf, i) => (
                <div key={i} className="group relative">
                  <img src={nf.preview} className="h-20 w-full rounded-lg border border-dashed border-brand object-cover" />
                  <button
                    onClick={() => removeNewFile(i)}
                    className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-2 flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-brand hover:text-brand">
              <span className="text-lg">🖼</span>
              <span className="text-xs font-semibold">Rasm qo'shish</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => pickFiles(e.target.files)}
              />
            </label>
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
              {isEdit ? 'Yangi variant qo`shish (ixtiyoriy)' : "Variantlar (o'lcham × rang)"}
            </h3>
            <button
              onClick={() => setNewRows((p) => [...p, emptyRow()])}
              className="rounded-xl bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand"
            >
              + Variant qatori
            </button>
          </div>
          {newRows.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              O'lcham uchta maydonga alohida kiritiladi, mijozga "Balandligi×Eni×Bo'yi" ko'rinishida chiqadi (masalan 8×26×36)
            </p>
          )}
          {newRows.map((r, i) => (
            <div key={i} className="mt-2 grid grid-cols-[70px_70px_70px_1fr_1.2fr_90px_32px] items-center gap-2">
              <input value={r.height} placeholder="Balandligi" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, height: e.target.value.replace(/\D/g, '') } : x)))} />
              <input value={r.width} placeholder="Eni" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, width: e.target.value.replace(/\D/g, '') } : x)))} />
              <input value={r.length} placeholder="Bo'yi" className={inputCls}
                onChange={(e) => setNewRows((p) => p.map((x, j) => (j === i ? { ...x, length: e.target.value.replace(/\D/g, '') } : x)))} />
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
                    <label className="text-xs font-semibold text-gray-500">{g.name}</label>
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

        {/* Edit: mavjud variantlar — razmer/rang/SKU tahriri, narxlari, yashirish/o'chirish */}
        {isEdit && variants.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold text-gray-900">Mavjud variantlar</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="py-2 pr-2">Balandligi</th>
                    <th className="py-2 pr-2">Eni</th>
                    <th className="py-2 pr-2">Bo'yi</th>
                    <th className="py-2 pr-2">Rang</th>
                    <th className="py-2 pr-2">SKU</th>
                    {groups.map((g) => (
                      <th key={g.id} className="px-2 py-2">{g.name}</th>
                    ))}
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const dims = existingDims[v.id] ?? { height: '', width: '', length: '' };
                    return (
                    <tr key={v.id} className={`border-t border-gray-100 ${!v.is_active ? 'opacity-40' : ''}`}>
                      <td className="py-2 pr-2">
                        <input
                          value={dims.height}
                          onChange={(e) => updateExistingDim(v.id, 'height', e.target.value.replace(/\D/g, ''))}
                          className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={dims.width}
                          onChange={(e) => updateExistingDim(v.id, 'width', e.target.value.replace(/\D/g, ''))}
                          className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={dims.length}
                          onChange={(e) => updateExistingDim(v.id, 'length', e.target.value.replace(/\D/g, ''))}
                          className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={v.color ?? ''}
                          onChange={(e) => patchVariant(v.id, { color: e.target.value || null })}
                          className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={v.sku}
                          onChange={(e) => patchVariant(v.id, { sku: e.target.value })}
                          className="w-28 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm font-mono outline-none focus:border-brand"
                        />
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
                      <td className="py-2 pl-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggleVariantActive(v)}
                            title={v.is_active ? 'Yashirish' : "Ko'rsatish"}
                            className="rounded-lg px-2 py-1.5 text-sm hover:bg-gray-100"
                          >
                            {v.is_active ? '👁' : '🚫'}
                          </button>
                          <button
                            onClick={() => deleteVariant(v)}
                            title="O'chirish"
                            className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-red-50"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
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

// Katalogni bitta hujjat sifatida chop etish. Ko'rinish (qog'oz, chekka,
// shrift, logo, rekvizit) tenantning sozlamasidan keladi — avval bu yerda
// qattiq yozilgan edi va boshqa uch hujjatdan farq qilardi.
async function printCatalog(products: Product[], groups: Group[]) {
  // Oyna DARHOL ochiladi — await'dan keyin ochilsa brauzer bloklaydi
  const w = oynaOch();
  if (!w) return;
  const s = await sozlamaniOl();
  const logo = await logoniOl(s);

  // Qat'iy 'Standart' emas: tarifini boshqacha nomlagan biznesda narx
  // ustuni bo'sh qolardi. lib/tarif.ts ga qarang.
  const asosiyId = asosiyTarifId(groups, (gid) =>
    products.some((pr) => pr.variants.some((v) => v.prices[gid] != null)),
  );
  const stdGroup = groups.find((g) => g.id === asosiyId);
  const withVariants = products.filter((p) => p.variants.length > 0);
  // Locale nomini qattiq yozmaymiz: ba'zi muhitlarda RangeError beradi
  const dateStr = new Date().toLocaleDateString();

  const rasmBor = s.ustun_rasm !== false;
  const skuBor = s.ustun_sku !== false;

  const productsHtml = withVariants
    .map((p) => {
      const img = p.images[0];
      const thumbHtml = !rasmBor
        ? ''
        : img
          ? `<img class="thumb" src="${imageUrl(img.thumbPath || img.storagePath)}" />`
          : `<div class="thumb thumb-ph">${p.name.slice(0, 1).toUpperCase()}</div>`;
      const variantRows = p.variants
        .map((v) => {
          const avail = v.qty - v.reserved;
          const price =
            stdGroup && v.prices[stdGroup.id] != null ? formatSum(v.prices[stdGroup.id]) : '—';
          return `<tr>
            ${skuBor ? `<td>${v.sku}</td>` : ''}
            <td>${[v.size, v.color].filter(Boolean).join(' / ') || '—'}</td>
            <td class="num">${price}</td>
            <td class="num ${avail === 0 ? 'out' : ''}">${avail}</td>
          </tr>`;
        })
        .join('');
      return `
        <div class="product">
          ${thumbHtml}
          <div class="info">
            <div class="name">${p.name}${p.model ? ` · ${p.model}` : ''}</div>
            <div class="sub">${p.material ?? ''}</div>
            <table>
              <thead>
                <tr>${skuBor ? '<th>SKU</th>' : ''}<th>Razmer / Rang</th><th class="num">Narx</th><th class="num">Mavjud</th></tr>
              </thead>
              <tbody>${variantRows}</tbody>
            </table>
          </div>
        </div>`;
    })
    .join('');

  // Katalogga xos qo'shimcha uslub — kartochka ko'rinishi umumiy asosda yo'q
  const katalogUslubi = `
    ${uslub(s)}
    .product { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #e9eaf2; break-inside: avoid; }
    .thumb { width: 76px; height: 76px; border-radius: 8px; object-fit: cover;
             border: 1px solid #e9eaf2; flex-shrink: 0; }
    .thumb-ph { background: ${s.rang ?? '#7000FF'}1a; color: ${s.rang ?? '#7000FF'};
                display: flex; align-items: center; justify-content: center;
                font-size: 24px; font-weight: 800; }
    .info { flex: 1; min-width: 0; }
    .name { font-weight: 800; }
    .sub { color: #8e92a3; font-size: .85em; margin-top: 2px; }
    .product table { margin-top: 6px; }
    .product th, .product td { border: 0; padding: 2px 10px 2px 0; background: none; }
    td.out { color: #f0384a; font-weight: 700; }
  `;

  const tana = `
    ${blank(s, null, logo, { turi: 'Mahsulotlar katalogi', sana: dateStr })}
    <div class="meta"><div>Jami <b>${withVariants.length}</b> mahsulot</div></div>
    ${productsHtml}
    ${altbilgi(s)}
  `;

  hujjatniYoz(w, {
    nom: 'Mahsulotlar katalogi',
    uslub: katalogUslubi,
    tana,
    avtoChop: true,
  });
}

// ---------------- Asosiy sahifa ----------------
export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  // Birinchi yuklash tugadimi — busiz ma'lumot kelguncha
  // "Mahsulot topilmadi" deb yozilib turardi
  const [yuklandi, setYuklandi] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // Jadvalda ko'rsatiladigan narx qaysi tarifniki. Qat'iy 'Standart'
  // yozilganida boshqacha nomlangan tarifda narx umuman ko'rinmasdi.
  const asosiyTarif = asosiyTarifId(groups, (gid) =>
    products.some((pr) => pr.variants.some((v) => v.prices[gid] != null)),
  );
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
          `id, name, model, material, description, category_id, is_active,
           product_images ( id, storage_path, thumb_path, is_primary, sort_order ),
           product_variants ( id, sku, size, color, is_active,
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
        const imgs: ProductImageRow[] = (p.product_images ?? [])
          .map((im: any) => ({
            id: im.id,
            storagePath: im.storage_path,
            thumbPath: im.thumb_path,
            isPrimary: im.is_primary,
            sortOrder: im.sort_order,
          }))
          .sort((a: ProductImageRow, b: ProductImageRow) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
        return {
          id: p.id,
          name: p.name,
          model: p.model,
          material: p.material,
          description: p.description,
          category_id: p.category_id,
          is_active: p.is_active,
          images: imgs,
          variants: (p.product_variants ?? []).map((v: any) => {
            const sl = Array.isArray(v.stock_levels) ? v.stock_levels[0] : v.stock_levels;
            const prices: Record<string, number> = {};
            for (const pr of v.prices ?? []) prices[pr.price_group_id] = Number(pr.price);
            return {
              id: v.id,
              sku: v.sku,
              size: v.size,
              color: v.color,
              is_active: v.is_active,
              qty: Number(sl?.qty ?? 0),
              reserved: Number(sl?.reserved ?? 0),
              prices,
            };
          }),
        };
      })
    );
    setYuklandi(true);
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

  const [stockModal, setStockModal] = useState<{ variantId: string; label: string; mode: 'in' | 'out' } | null>(null);

  async function toggleProductActive(p: Product) {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) return xabarKorsat('Xatolik: ' + error.message);
    load();
  }

  async function deleteProduct(p: Product) {
    if (!await tasdiqlaSoz(`"${p.name}" butunlay o'chirilsinmi?\nBuyurtma yoki ombor tarixida ishlatilgan bo'lsa, o'chirib bo'lmaydi — shunda "yashirish"dan foydalaning.`)) {
      return;
    }
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      xabarKorsat("O'chirib bo'lmadi — bu mahsulot buyurtma yoki ombor tarixida ishlatilgan. Uni yashiring.");
      return;
    }
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
          onClick={() => printCatalog(filtered, groups)}
          className="ml-auto rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand"
        >
          🖨 Katalog PDF
        </button>
        <Link
          to="/products/import"
          className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand"
        >
          📥 Excel import
        </Link>
        <button
          onClick={() => setModal({ open: true, product: null })}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Yangi kirim
        </button>
      </div>

      {filtered.map((p) => (
        <div key={p.id} className={`overflow-hidden rounded-2xl border border-gray-200 bg-white ${!p.is_active ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-4">
            {p.images[0] ? (
              <img
                src={imageUrl(p.images[0].thumbPath || p.images[0].storagePath)}
                className="h-14 w-14 rounded-xl border border-gray-100 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-soft text-lg font-extrabold text-brand">
                {p.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-extrabold text-gray-900">
                {p.name}
                {p.model && <span className="ml-1 font-semibold text-gray-500">· {p.model}</span>}
                {!p.is_active && (
                  <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">yashirilgan</span>
                )}
              </div>
              <div className="text-xs text-gray-500">{p.material ?? ''}</div>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => toggleProductActive(p)}
                title={p.is_active ? 'Katalogdan yashirish' : "Katalogda ko'rsatish"}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:border-brand hover:text-brand"
              >
                {p.is_active ? '👁' : '🚫'}
              </button>
              <button
                onClick={() => deleteProduct(p)}
                title="O'chirish"
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-red-400 hover:border-red-300 hover:bg-red-50"
              >
                🗑
              </button>
              <button
                onClick={() => setModal({ open: true, product: p })}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:border-brand hover:text-brand"
              >
                ✏️ Tahrirlash
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-2">SKU</th>
                <th className="px-6 py-2">Razmer / Rang</th>
                <th className="px-6 py-2 text-right">Fizik</th>
                <th className="px-6 py-2 text-right">Band</th>
                <th className="px-6 py-2 text-right">Mavjud</th>
                <th className="px-6 py-2 text-right">Narx ({tarifNomi(groups, asosiyTarif)})</th>
                <th className="px-6 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {p.variants.map((v) => {
                const avail = v.qty - v.reserved;
                const label = `${p.name} (${v.sku})`;
                return (
                  <tr key={v.id} className={`border-t border-gray-50 ${!v.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-6 py-2.5 font-mono text-xs text-gray-500">{v.sku}</td>
                    <td className="px-6 py-2.5 text-gray-700">
                      {[v.size, v.color].filter(Boolean).join(' / ') || '—'}
                      {!v.is_active && <span className="ml-2 text-xs text-gray-500">(yashirilgan)</span>}
                    </td>
                    <td className="px-6 py-2.5 text-right font-semibold">{v.qty.toLocaleString()}</td>
                    <td className="px-6 py-2.5 text-right text-amber-600">
                      {v.reserved > 0 ? v.reserved.toLocaleString() : '—'}
                    </td>
                    <td className={`px-6 py-2.5 text-right font-bold ${avail === 0 ? 'text-red-500' : avail < 1000 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {avail.toLocaleString()}
                    </td>
                    <td className="px-6 py-2.5 text-right text-gray-600">
                      {asosiyTarif && v.prices[asosiyTarif] != null ? (
                        formatSum(v.prices[asosiyTarif])
                      ) : (
                        // Narxsiz variant mijoz katalogida umuman chiqmaydi —
                        // buni admin darhol ko'rishi kerak
                        <span
                          className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600"
                          title="Narx qo'yilmagan — bu mahsulot mijozga ko'rinmaydi. '+ Kirim' tugmasi orqali narx qo'ying."
                        >
                          narx yo'q
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setStockModal({ variantId: v.id, label, mode: 'in' })}
                          className="rounded-xl bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand hover:opacity-80"
                        >
                          + Kirim
                        </button>
                        <button
                          onClick={() => setStockModal({ variantId: v.id, label, mode: 'out' })}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 hover:opacity-80"
                        >
                          − Chiqim
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}

      {!yuklandi && <div className="rounded-2xl border border-gray-200 bg-white"><JadvalSkelet ustun={5} /></div>}
      {yuklandi && filtered.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500">
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

      {stockModal && (
        <StockModal
          variantId={stockModal.variantId}
          label={stockModal.label}
          mode={stockModal.mode}
          onClose={() => setStockModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
