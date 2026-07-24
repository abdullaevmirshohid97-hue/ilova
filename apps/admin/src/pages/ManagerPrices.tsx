import { useCallback, useEffect, useState } from 'react';
import { formatSum, formatUsd, imageUrl, supabase } from '../lib/supabase';

type Currency = 'UZS' | 'USD';
type PriceEntry = { price: number; currency: Currency };

type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  basePrices: Record<string, number>; // price_group_id -> narx
};

type Product = {
  id: string;
  name: string;
  model: string | null;
  image: string | null;
  variants: Variant[];
};

type Customer = { id: string; name: string; phone: string; price_group_id: string };
type Group = { id: string; name: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Baza narxni (har doim so'mda saqlanadi) tanlangan valyutaga o'giradi
function baseInCurrency(baseSom: number, currency: Currency, usdRate: number): number | null {
  if (currency === 'UZS') return baseSom;
  if (usdRate <= 0) return null;
  return round2(baseSom / usdRate);
}

function fmtCurrency(n: number, currency: Currency): string {
  return currency === 'USD' ? formatUsd(n) : formatSum(n);
}

type MarkupMode = 'amount' | 'percent';

// mode='amount' — baza ustiga qo'shiladigan summa; mode='percent' — baza
// ustiga qo'shiladigan foiz (masalan 15 => baza*1.15)
function computeFinal(base: number, markup: number, mode: MarkupMode, currency: Currency): number {
  const result = mode === 'percent' ? base * (1 + markup / 100) : base + markup;
  return currency === 'USD' ? round2(result) : Math.round(result);
}

export default function ManagerPrices() {
  const [managerId, setManagerId] = useState<string | null>(null);
  const [usdRate, setUsdRate] = useState<number>(0);
  const [defaultCurrency, setDefaultCurrency] = useState<Currency>('UZS');
  const [switchingCurrency, setSwitchingCurrency] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState(''); // '' = umumiy narx

  const [generalPrices, setGeneralPrices] = useState<Record<string, PriceEntry>>({});
  const [customerPrices, setCustomerPrices] = useState<Record<string, PriceEntry>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [inputCurrency, setInputCurrency] = useState<Record<string, Currency>>({});
  const [markupMode, setMarkupMode] = useState<MarkupMode>('amount');
  const [bulkMarkup, setBulkMarkup] = useState('');
  const [bulkCurrency, setBulkCurrency] = useState<Currency>('UZS');
  const [bulkBusy, setBulkBusy] = useState(false);

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
           product_variants ( id, sku, size, color, is_active, prices ( price, price_group_id ) )`
        )
        .eq('is_active', true)
        .order('name')
        .limit(300),
      supabase.from('manager_prices').select('variant_id, price, currency'),
      supabase.from('customers').select('id, name, phone, price_group_id').order('name'),
      supabase.from('price_groups').select('id, name').order('name'),
      supabase.from('managers').select('usd_rate, default_currency').eq('id', managerId).single(),
    ]).then(([{ data: prodData }, { data: priceData }, { data: custData }, { data: groupData }, { data: mgrData }]) => {
      const priceMap: Record<string, PriceEntry> = {};
      for (const p of priceData ?? []) {
        priceMap[(p as any).variant_id] = { price: Number((p as any).price), currency: (p as any).currency };
      }
      setGeneralPrices(priceMap);
      setCustomers((custData ?? []) as Customer[]);
      setGroups((groupData ?? []) as Group[]);
      setUsdRate(mgrData ? Number((mgrData as any).usd_rate) : 0);
      const dc = ((mgrData as any)?.default_currency as Currency) ?? 'UZS';
      setDefaultCurrency(dc);
      setBulkCurrency(dc);

      setProducts(
        (prodData ?? [])
          .map((p: any) => {
            const imgs = (p.product_images ?? []).sort(
              (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
            );
            const variants: Variant[] = (p.product_variants ?? [])
              .filter((v: any) => v.is_active)
              .map((v: any) => {
                const basePrices: Record<string, number> = {};
                for (const pr of v.prices ?? []) basePrices[pr.price_group_id] = Number(pr.price);
                return { id: v.id, sku: v.sku, size: v.size, color: v.color, basePrices };
              });
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

  const loadCustomerPrices = useCallback((customerId: string) => {
    if (!customerId) {
      setCustomerPrices({});
      return;
    }
    supabase
      .from('manager_customer_prices')
      .select('variant_id, price, currency')
      .eq('customer_id', customerId)
      .then(({ data }) => {
        const m: Record<string, PriceEntry> = {};
        for (const p of data ?? []) m[(p as any).variant_id] = { price: Number((p as any).price), currency: (p as any).currency };
        setCustomerPrices(m);
      });
  }, []);

  useEffect(() => {
    setInputs({});
    loadCustomerPrices(selectedCustomer);
  }, [selectedCustomer, loadCustomerPrices]);

  async function switchDefaultCurrency(currency: Currency) {
    if (currency === defaultCurrency) return;
    setSwitchingCurrency(true);
    const { error } = await supabase.rpc('set_my_default_currency', { p_currency: currency });
    if (!error) {
      setDefaultCurrency(currency);
      setBulkCurrency(currency);
      // Hali qo'lda tanlanmagan qatorlarni ham yangi standartga o'tkazamiz
      setInputCurrency({});
    }
    setSwitchingCurrency(false);
  }

  const activePrices = selectedCustomer ? customerPrices : generalPrices;
  const stdGroupId = groups.find((g) => g.name === 'Standart')?.id;
  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomer);
  const refGroupId = selectedCustomer ? selectedCustomerObj?.price_group_id : stdGroupId;

  async function savePrice(variantId: string, baseSom: number | null) {
    if (!managerId) return;
    const raw = inputs[variantId];
    const markup = parseFloat(raw ?? '');
    if (!raw || Number.isNaN(markup)) return;
    const currency = inputCurrency[variantId] ?? defaultCurrency;
    const base = baseSom != null ? baseInCurrency(baseSom, currency, usdRate) : null;
    if (base == null) return; // dollar kursi hali kiritilmagan yoki baza narx yo'q
    const finalPrice = computeFinal(base, markup, markupMode, currency);

    setSaving(variantId);
    const { error } = selectedCustomer
      ? await supabase
          .from('manager_customer_prices')
          .upsert(
            { manager_id: managerId, customer_id: selectedCustomer, variant_id: variantId, price: finalPrice, currency },
            { onConflict: 'manager_id,customer_id,variant_id' }
          )
      : await supabase
          .from('manager_prices')
          .upsert({ manager_id: managerId, variant_id: variantId, price: finalPrice, currency }, { onConflict: 'manager_id,variant_id' });
    if (!error) {
      const entry = { price: finalPrice, currency };
      if (selectedCustomer) setCustomerPrices((p) => ({ ...p, [variantId]: entry }));
      else setGeneralPrices((p) => ({ ...p, [variantId]: entry }));
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
    if (selectedCustomer) {
      await supabase
        .from('manager_customer_prices')
        .delete()
        .eq('manager_id', managerId)
        .eq('customer_id', selectedCustomer)
        .eq('variant_id', variantId);
      setCustomerPrices((p) => {
        const next = { ...p };
        delete next[variantId];
        return next;
      });
    } else {
      await supabase.from('manager_prices').delete().eq('manager_id', managerId).eq('variant_id', variantId);
      setGeneralPrices((p) => {
        const next = { ...p };
        delete next[variantId];
        return next;
      });
    }
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
  const visibleVariants = filtered.flatMap((p) => p.variants);

  async function applyBulk() {
    if (!managerId || !refGroupId) return;
    const markup = parseFloat(bulkMarkup);
    if (Number.isNaN(markup) || visibleVariants.length === 0) return;
    const unit = markupMode === 'percent' ? '%' : bulkCurrency === 'USD' ? '$' : "so'm";
    const verb = markupMode === 'percent' ? 'foiz qo`shilsinmi' : "qo'shilsinmi";
    if (
      !confirm(
        `Ko'rinayotgan ${visibleVariants.length} ta mahsulotning bazasi ustiga ${markup.toLocaleString()}${unit} ${verb}?`
      )
    )
      return;
    setBulkBusy(true);

    const rows = visibleVariants
      .map((v) => {
        const baseSom = v.basePrices[refGroupId];
        if (baseSom == null) return null;
        const base = baseInCurrency(baseSom, bulkCurrency, usdRate);
        if (base == null) return null;
        const finalPrice = computeFinal(base, markup, markupMode, bulkCurrency);
        return { variant_id: v.id, price: finalPrice };
      })
      .filter((r): r is { variant_id: string; price: number } => r != null);

    if (selectedCustomer) {
      const payload = rows.map((r) => ({
        manager_id: managerId,
        customer_id: selectedCustomer,
        variant_id: r.variant_id,
        price: r.price,
        currency: bulkCurrency,
      }));
      const { error } = await supabase
        .from('manager_customer_prices')
        .upsert(payload, { onConflict: 'manager_id,customer_id,variant_id' });
      if (!error) {
        setCustomerPrices((p) => {
          const next = { ...p };
          for (const r of rows) next[r.variant_id] = { price: r.price, currency: bulkCurrency };
          return next;
        });
      }
    } else {
      const payload = rows.map((r) => ({ manager_id: managerId, variant_id: r.variant_id, price: r.price, currency: bulkCurrency }));
      const { error } = await supabase.from('manager_prices').upsert(payload, { onConflict: 'manager_id,variant_id' });
      if (!error) {
        setGeneralPrices((p) => {
          const next = { ...p };
          for (const r of rows) next[r.variant_id] = { price: r.price, currency: bulkCurrency };
          return next;
        });
      }
    }
    setBulkMarkup('');
    setBulkBusy(false);
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none focus:border-brand';
  const currencySelectCls =
    'rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand';

  return (
    <div>
      <h1 className="text-xl font-extrabold text-gray-900">🏷️ Narxlarim</h1>
      <p className="mt-1 text-sm text-gray-400">
        Har bir qatorda kompaniya baza narxi ko'rinadi — tanlagan valyutangizda (so'm yoki $).
        Siz kiritgan son shu BAZA USTIGA QO'SHILADI — summa yoki foiz sifatida (pastda tanlang).
        Dollarda ishlasangiz, baza avtomatik dollarga o'giriladi (Sozlamalardagi kursingiz
        bo'yicha) va ustamangiz o'sha ustiga qo'shiladi. Bu narxlarni faqat siz ko'rasiz.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-soft px-4 py-3">
        <span className="text-sm font-bold text-gray-700">💱 Men savdo qiladigan valyuta:</span>
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          <button
            onClick={() => switchDefaultCurrency('UZS')}
            disabled={switchingCurrency}
            className={`px-4 py-1.5 text-sm font-bold transition disabled:opacity-50 ${
              defaultCurrency === 'UZS' ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            So'm
          </button>
          <button
            onClick={() => switchDefaultCurrency('USD')}
            disabled={switchingCurrency}
            className={`px-4 py-1.5 text-sm font-bold transition disabled:opacity-50 ${
              defaultCurrency === 'USD' ? 'bg-brand text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            $ Dollar
          </button>
        </div>
        <span className="text-xs text-gray-500">
          Tanlangan valyuta pastdagi barcha maydonlarda standart bo'ladi — har birida alohida
          tanlash shart emas.
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
        <span className="text-sm font-bold text-gray-700">➕ Ustama turi:</span>
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          <button
            onClick={() => setMarkupMode('amount')}
            className={`px-4 py-1.5 text-sm font-bold transition ${
              markupMode === 'amount' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
            }`}
          >
            + Summa
          </button>
          <button
            onClick={() => setMarkupMode('percent')}
            className={`px-4 py-1.5 text-sm font-bold transition ${
              markupMode === 'percent' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'
            }`}
          >
            % Foiz
          </button>
        </div>
        <span className="text-xs text-gray-500">
          {markupMode === 'percent'
            ? "Masalan bazasi 3000 bo'lgan mahsulotga \"15\" desangiz, yakuniy narx 3450 (baza + 15%) bo'ladi."
            : "Masalan bazasi 3000 bo'lgan mahsulotga \"500\" desangiz, yakuniy narx 3500 bo'ladi."}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={selectedCustomer}
          onChange={(e) => setSelectedCustomer(e.target.value)}
          className={inputCls + ' max-w-xs'}
        >
          <option value="">— Umumiy narx (barcha mijozlarim) —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.phone}
            </option>
          ))}
        </select>
        {usdRate <= 0 && (
          <span className="text-xs font-semibold text-amber-600">
            ⚠️ Dollar kursi kiritilmagan — Sozlamalarda kiriting, aks holda dollarda narx qo'ya olmaysiz
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
        <span className="text-xs font-semibold text-gray-500">
          Ko'rinayotgan {visibleVariants.length} ta mahsulotning bazasi ustiga bir xil ustama qo'shish:
        </span>
        <input
          value={bulkMarkup}
          onChange={(e) => setBulkMarkup(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder={markupMode === 'percent' ? 'Masalan: 15' : 'Masalan: 500'}
          className="w-32 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <select value={bulkCurrency} onChange={(e) => setBulkCurrency(e.target.value as Currency)} className={currencySelectCls}>
          <option value="UZS">so'm</option>
          <option value="USD">$</option>
        </select>
        <button
          onClick={applyBulk}
          disabled={bulkBusy || !bulkMarkup || visibleVariants.length === 0}
          className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {bulkBusy ? 'Qollanmoqda...' : 'Barchasiga qo`llash'}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Mahsulot yoki SKU bo'yicha qidirish..."
        className={inputCls + ' mt-3'}
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
                  const mine = activePrices[v.id];
                  const baseSom = refGroupId != null ? v.basePrices[refGroupId] : null;
                  const currency = inputCurrency[v.id] ?? defaultCurrency;
                  const baseInCur = baseSom != null ? baseInCurrency(baseSom, currency, usdRate) : null;
                  return (
                    <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 text-gray-600">
                        {[v.size, v.color].filter(Boolean).join(' / ') || v.sku}
                        {baseInCur != null && (
                          <span className="ml-2 text-xs text-gray-400">(baza: {fmtCurrency(baseInCur, currency)})</span>
                        )}
                      </span>
                      {mine != null && (
                        <span className="text-xs font-bold text-emerald-600">
                          = {fmtCurrency(mine.price, mine.currency)}
                        </span>
                      )}
                      <input
                        value={inputs[v.id] ?? ''}
                        onChange={(e) => setInputs((p) => ({ ...p, [v.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                        placeholder={markupMode === 'percent' ? '%' : '+ustama'}
                        disabled={baseInCur == null}
                        className="w-24 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand disabled:bg-gray-100 sm:w-28 sm:flex-none"
                      />
                      <select
                        value={currency}
                        onChange={(e) => setInputCurrency((p) => ({ ...p, [v.id]: e.target.value as Currency }))}
                        className={currencySelectCls}
                      >
                        <option value="UZS">so'm</option>
                        <option value="USD">$</option>
                      </select>
                      <button
                        onClick={() => savePrice(v.id, baseSom ?? null)}
                        disabled={saving === v.id || !inputs[v.id] || baseInCur == null}
                        className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Saqlash
                      </button>
                      {mine != null && (
                        <button
                          onClick={() => clearPrice(v.id)}
                          disabled={saving === v.id}
                          className="shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold text-gray-400 hover:border-red-300 hover:text-red-400"
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
