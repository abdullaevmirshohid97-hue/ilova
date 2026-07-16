import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatSum, imageUrl, supabase } from '../lib/supabase';
import { useCart } from '../lib/cart';
import { C } from '../lib/theme';

type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number | null;
  qty: number;
};

type Product = {
  id: string;
  name: string;
  model: string | null;
  material: string | null;
  image: string | null;
  variants: Variant[];
};

function first<T>(v: T | T[] | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function VariantRow({ v, productName, image }: { v: Variant; productName: string; image: string | null }) {
  const cart = useCart();
  const [qtyText, setQtyText] = useState('');
  const inCart = cart.items.find((i) => i.variantId === v.id);

  function addToCart() {
    const qty = parseInt(qtyText, 10);
    if (!qty || qty <= 0 || v.price == null) return;
    cart.add({
      variantId: v.id,
      productName,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: v.price,
      qty: Math.min(qty, v.qty),
      image,
      maxQty: v.qty,
    });
    setQtyText('');
  }

  return (
    <View style={s.variantRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.variantTitle}>
          {[v.size, v.color].filter(Boolean).join(' · ') || v.sku}
        </Text>
        <Text style={s.price}>{formatSum(v.price)}</Text>
        <Text style={[s.stock, v.qty === 0 && s.stockOut]}>
          {v.qty > 0 ? `${v.qty.toLocaleString()} dona bor` : 'Tugagan'}
        </Text>
      </View>
      {v.qty > 0 && v.price != null && (
        <View style={s.addBox}>
          <TextInput
            style={s.qtyInput}
            value={qtyText}
            onChangeText={(t) => setQtyText(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="dona"
            placeholderTextColor={C.faint}
          />
          <TouchableOpacity
            style={[s.addBtn, !qtyText && s.addBtnDisabled]}
            onPress={addToCart}
            disabled={!qtyText}
          >
            <Text style={s.addBtnText}>{inCart ? `+ (${inCart.qty})` : 'Savatga'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function CatalogScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  async function loadCatalog() {
    const { data, error } = await supabase
      .from('products')
      .select(
        `id, name, model, material,
         product_images ( storage_path, is_primary, sort_order ),
         product_variants ( id, sku, size, color,
           prices ( price ),
           stock_levels ( qty )
         )`
      )
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setProducts(
        data.map((p: any) => {
          const imgs = (p.product_images ?? []).sort(
            (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
          );
          return {
            id: p.id,
            name: p.name,
            model: p.model,
            material: p.material,
            image: imgs[0] ? imageUrl(imgs[0].storage_path) : null,
            variants: (p.product_variants ?? []).map((v: any) => ({
              id: v.id,
              sku: v.sku,
              size: v.size,
              color: v.color,
              price: first<any>(v.prices)?.price ?? null,
              qty: first<any>(v.stock_levels)?.qty ?? 0,
            })),
          };
        })
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCatalog();
    // Jonli qoldiq: kimdir olsa — hammada bir zumda yangilanadi
    const channel = supabase
      .channel('stock-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stock_levels' },
        (payload) => {
          const { variant_id, qty } = payload.new as { variant_id: string; qty: number };
          setProducts((prev) =>
            prev.map((p) => ({
              ...p,
              variants: p.variants.map((v) => (v.id === variant_id ? { ...v, qty } : v)),
            }))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.model ?? '').toLowerCase().includes(q) ||
        (p.material ?? '').toLowerCase().includes(q) ||
        p.variants.some(
          (v) =>
            v.sku.toLowerCase().includes(q) ||
            (v.size ?? '').toLowerCase().includes(q) ||
            (v.color ?? '').toLowerCase().includes(q)
        )
    );
  }, [products, search]);

  async function onRefresh() {
    setRefreshing(true);
    await loadCatalog();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Katalog</Text>
      <TextInput
        style={s.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Qidiruv: nomi, model, razmer, rang, SKU..."
        placeholderTextColor={C.faint}
      />
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        ListEmptyComponent={<Text style={s.empty}>Hech narsa topilmadi</Text>}
        contentContainerStyle={{ paddingBottom: 90 }}
        renderItem={({ item }) => (
          <View style={s.card}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={s.image} resizeMode="cover" />
            ) : (
              <View style={[s.image, s.imagePlaceholder]}>
                <Text style={s.imagePlaceholderText}>{item.name.slice(0, 1)}</Text>
              </View>
            )}
            <View style={s.cardBody}>
              <Text style={s.productName}>
                {item.name}
                {item.model ? `  ·  ${item.model}` : ''}
              </Text>
              {item.material && <Text style={s.material}>{item.material}</Text>}
              {item.variants.map((v) => (
                <VariantRow key={v.id} v={v} productName={item.name} image={item.image} />
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 56 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  search: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 15,
  },
  empty: { color: C.faint, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 180 },
  imagePlaceholder: {
    backgroundColor: '#1f2430',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: { color: C.faint, fontSize: 64, fontWeight: '800' },
  cardBody: { padding: 16 },
  productName: { color: C.text, fontSize: 17, fontWeight: '700' },
  material: { color: C.muted, fontSize: 13, marginTop: 2 },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  variantTitle: { color: C.text2, fontSize: 15, fontWeight: '600' },
  price: { color: C.green, fontSize: 16, fontWeight: '700', marginTop: 2 },
  stock: { color: C.muted, fontSize: 13, marginTop: 2 },
  stockOut: { color: C.red },
  addBox: { alignItems: 'flex-end', gap: 6 },
  qtyInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    color: C.text,
    width: 90,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    textAlign: 'center',
  },
  addBtn: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: C.text, fontWeight: '700', fontSize: 13 },
});
