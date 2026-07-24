import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

type Group = { id: string; name: string };
type Category = { id: string; name: string };

type ParsedRow = {
  rowNum: number;
  name: string;
  model: string;
  category: string;
  material: string;
  size: string;
  color: string;
  sku: string;
  prices: Record<string, string>; // group name -> raw qiymat
  initQty: string;
  status: 'ok' | 'error';
  reason?: string;
};

const FIXED_COLS = ['Nomi', 'Model', 'Kategoriya', 'Material', 'Razmer', 'Rang', 'SKU'];
const QTY_COL = 'Boshlangich_qoldiq';

function makeSku(name: string, model: string, size: string, color: string): string {
  const part = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6);
  return (
    [part(name), part(model), part(size), part(color)].filter(Boolean).join('-') +
    '-' + Math.random().toString(36).slice(2, 5).toUpperCase()
  );
}

export default function ProductImport() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ products: number; newVariants: number; updatedVariants: number; errors: string[] } | null>(null);

  useEffect(() => {
    supabase.from('price_groups').select('id, name').order('name').then(({ data }) => setGroups((data ?? []) as Group[]));
    supabase.from('categories').select('id, name').order('sort_order').then(({ data }) => setCategories((data ?? []) as Category[]));
  }, []);

  function downloadTemplate() {
    const header = [...FIXED_COLS, ...groups.map((g) => g.name), QTY_COL];
    const example = [
      'Versace', 'V25', 'Choyshab to\'plamlari', 'Paxta', '170x200', "Ko'k", '',
      ...groups.map(() => '3000'),
      '1000',
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mahsulotlar');
    XLSX.writeFile(wb, 'ilova-mahsulot-shablon.xlsx');
  }

  function parseRow(raw: Record<string, any>, rowNum: number): ParsedRow {
    const get = (k: string) => String(raw[k] ?? '').trim();
    const name = get('Nomi');
    const prices: Record<string, string> = {};
    for (const g of groups) prices[g.name] = get(g.name);
    const row: ParsedRow = {
      rowNum,
      name,
      model: get('Model'),
      category: get('Kategoriya'),
      material: get('Material'),
      size: get('Razmer'),
      color: get('Rang'),
      sku: get('SKU'),
      prices,
      initQty: get(QTY_COL),
      status: 'ok',
    };

    if (!name) {
      row.status = 'error';
      row.reason = 'Nomi majburiy';
      return row;
    }
    for (const g of groups) {
      const v = prices[g.name];
      if (v && (!/^\d+$/.test(v) || parseInt(v, 10) < 0)) {
        row.status = 'error';
        row.reason = `${g.name} narxi noto'g'ri: "${v}"`;
        return row;
      }
    }
    if (row.initQty && (!/^\d+$/.test(row.initQty) || parseInt(row.initQty, 10) < 0)) {
      row.status = 'error';
      row.reason = `Boshlang'ich qoldiq noto'g'ri: "${row.initQty}"`;
      return row;
    }
    return row;
  }

  async function pickFile(f: File | null) {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    const parsed = raw.map((r, i) => parseRow(r, i + 2)); // +2: 1-based + header row

    // Bir xil SKU takrorlansa — ikkinchisidan xato
    const seenSku = new Set<string>();
    for (const row of parsed) {
      if (row.status === 'error' || !row.sku) continue;
      const key = row.sku.toLowerCase();
      if (seenSku.has(key)) {
        row.status = 'error';
        row.reason = `SKU faylda takrorlangan: ${row.sku}`;
      } else {
        seenSku.add(key);
      }
    }

    setRows(parsed);
  }

  async function runImport() {
    const valid = rows.filter((r) => r.status === 'ok');
    if (valid.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: valid.length });

    const errors: string[] = [];
    let productsCreated = 0;
    let newVariants = 0;
    let updatedVariants = 0;

    // Mavjud mahsulot/variant/kategoriyalarni oldindan yuklab olamiz (dublikat yaratmaslik uchun)
    const [{ data: existingProducts }, { data: existingVariants }] = await Promise.all([
      supabase.from('products').select('id, name, model'),
      supabase.from('product_variants').select('id, sku, product_id'),
    ]);
    const productMap = new Map<string, string>();
    for (const p of existingProducts ?? []) {
      productMap.set(`${(p as any).name.trim().toLowerCase()}|${((p as any).model ?? '').trim().toLowerCase()}`, (p as any).id);
    }
    const variantBySku = new Map<string, { id: string; product_id: string }>();
    for (const v of existingVariants ?? []) {
      variantBySku.set((v as any).sku.toLowerCase(), { id: (v as any).id, product_id: (v as any).product_id });
    }
    const categoryMap = new Map<string, string>(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
    let categorySortOrder = categories.length;

    for (const row of valid) {
      try {
        // 1. Kategoriya
        let categoryId: string | null = null;
        if (row.category) {
          const key = row.category.toLowerCase();
          if (categoryMap.has(key)) {
            categoryId = categoryMap.get(key)!;
          } else {
            const { data: cat, error: catErr } = await supabase
              .from('categories')
              .insert({ name: row.category, sort_order: ++categorySortOrder })
              .select('id')
              .single();
            if (catErr) throw new Error('Kategoriya: ' + catErr.message);
            categoryId = (cat as any).id;
            categoryMap.set(key, categoryId!);
          }
        }

        // 2. Mahsulot (nomi+model bo'yicha)
        const prodKey = `${row.name.toLowerCase()}|${row.model.toLowerCase()}`;
        let productId = productMap.get(prodKey);
        if (!productId) {
          const { data: prod, error: prodErr } = await supabase
            .from('products')
            .insert({
              name: row.name,
              model: row.model || null,
              material: row.material || null,
              category_id: categoryId,
            })
            .select('id')
            .single();
          if (prodErr) throw new Error('Mahsulot: ' + prodErr.message);
          productId = (prod as any).id;
          productMap.set(prodKey, productId!);
          productsCreated++;
        }

        // 3. Variant (SKU bo'yicha — mavjud bo'lsa yangilanadi, aks holda yaratiladi)
        let variantId: string;
        const existing = row.sku ? variantBySku.get(row.sku.toLowerCase()) : undefined;
        if (existing) {
          const { error: vErr } = await supabase
            .from('product_variants')
            .update({ size: row.size || null, color: row.color || null })
            .eq('id', existing.id);
          if (vErr) throw new Error('Variant yangilash: ' + vErr.message);
          variantId = existing.id;
          updatedVariants++;
        } else {
          const sku = row.sku || makeSku(row.name, row.model, row.size, row.color);
          const { data: v, error: vErr } = await supabase
            .from('product_variants')
            .insert({ product_id: productId, sku, size: row.size || null, color: row.color || null })
            .select('id')
            .single();
          if (vErr) throw new Error('Variant yaratish: ' + vErr.message);
          variantId = (v as any).id;
          if (row.sku) variantBySku.set(row.sku.toLowerCase(), { id: variantId, product_id: productId! });
          newVariants++;

          const init = parseInt(row.initQty || '0', 10);
          if (init > 0) {
            const { error: sErr } = await supabase.rpc('add_stock', {
              p_variant_id: variantId,
              p_qty: init,
              p_note: 'Excel import — boshlang\'ich qoldiq',
            });
            if (sErr) throw new Error('Kirim: ' + sErr.message);
          }
        }

        // 4. Narxlar
        const priceRows = groups
          .filter((g) => row.prices[g.name])
          .map((g) => ({ variant_id: variantId, price_group_id: g.id, price: parseInt(row.prices[g.name], 10) }));
        if (priceRows.length > 0) {
          const { error: pErr } = await supabase.from('prices').upsert(priceRows, { onConflict: 'variant_id,price_group_id' });
          if (pErr) throw new Error('Narx: ' + pErr.message);
        }
      } catch (e: any) {
        errors.push(`Qator ${row.rowNum} (${row.name}): ${e.message ?? 'xatolik'}`);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResult({ products: productsCreated, newVariants, updatedVariants, errors });
    setUploading(false);
  }

  const okRows = rows.filter((r) => r.status === 'ok');
  const errorRows = rows.filter((r) => r.status === 'error');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/products" className="text-sm font-semibold text-gray-400 hover:text-brand">
        ← Mahsulotlarga qaytish
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <h2 className="text-xl font-extrabold text-gray-900">📥 Excel orqali mahsulot import qilish</h2>
        <p className="mt-1 text-sm text-gray-400">
          Shablonni yuklab oling, to'ldiring, so'ng shu yerga qayta yuklang. Mavjud SKU — yangilanadi,
          yangi SKU — yaratiladi. Bir xil nomi+model qatorlari bitta mahsulotning variantlari sifatida birlashadi.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={downloadTemplate}
            className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-bold text-gray-600 hover:border-brand hover:text-brand"
          >
            📄 Shablon yuklab olish
          </button>
          <label className="cursor-pointer rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:opacity-90">
            📤 Faylni tanlash
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {fileName && <span className="text-sm text-gray-500">{fileName}</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold text-gray-900">
              Ko'rib chiqish: {rows.length} qator ({okRows.length} to'g'ri, {errorRows.length} xato)
            </h3>
            <button
              onClick={runImport}
              disabled={uploading || okRows.length === 0}
              className="ml-auto rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {uploading ? `Yuklanmoqda... ${progress.done}/${progress.total}` : `✓ ${okRows.length} qatorni yuklash`}
            </button>
          </div>

          <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-gray-100">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Nomi</th>
                  <th className="px-4 py-2">Model</th>
                  <th className="px-4 py-2">Razmer/Rang</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Holat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowNum} className={`border-t border-gray-50 ${r.status === 'error' ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-2 text-gray-400">{r.rowNum}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{r.name || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{r.model || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{[r.size, r.color].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.sku || '(avto)'}</td>
                    <td className="px-4 py-2">
                      {r.status === 'ok' ? (
                        <span className="font-semibold text-emerald-600">✓ tayyor</span>
                      ) : (
                        <span className="font-semibold text-red-500">✕ {r.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <h3 className="font-bold text-gray-900">✅ Import yakunlandi</h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>Yangi mahsulot: <b>{result.products}</b></li>
            <li>Yangi variant: <b>{result.newVariants}</b></li>
            <li>Yangilangan variant: <b>{result.updatedVariants}</b></li>
          </ul>
          {result.errors.length > 0 && (
            <div className="mt-4">
              <div className="font-bold text-red-500">Xatoliklar ({result.errors.length}):</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-500">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
