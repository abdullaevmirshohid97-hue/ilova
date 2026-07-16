import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

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
  variants: Variant[];
};

// PostgREST 1-1 bog'lanishni obyekt yoki massiv qilib berishi mumkin
function first<T>(v: T | T[] | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
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
         product_variants ( id, sku, size, color,
           prices ( price ),
           stock_levels ( qty )
         )`
      )
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setProducts(
        data.map((p: any) => ({
          id: p.id,
          name: p.name,
          model: p.model,
          material: p.material,
          variants: (p.product_variants ?? []).map((v: any) => ({
            id: v.id,
            sku: v.sku,
            size: v.size,
            color: v.color,
            price: first<any>(v.prices)?.price ?? null,
            qty: first<any>(v.stock_levels)?.qty ?? 0,
          })),
        }))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCatalog();

    // JONLI QOLDIQ: kimdir sotib olsa — hammada bir zumda yangilanadi
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
              variants: p.variants.map((v) =>
                v.id === variant_id ? { ...v, qty } : v
              ),
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
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Katalog</Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={styles.logout}>Chiqish</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Qidiruv: nomi, model, razmer, rang, SKU..."
        placeholderTextColor="#666"
      />

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Hech narsa topilmadi</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.productName}>
              {item.name}
              {item.model ? `  ·  ${item.model}` : ''}
            </Text>
            {item.material && (
              <Text style={styles.material}>{item.material}</Text>
            )}
            {item.variants.map((v) => (
              <View key={v.id} style={styles.variantRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.variantTitle}>
                    {[v.size, v.color].filter(Boolean).join(' · ') || v.sku}
                  </Text>
                  <Text style={styles.sku}>{v.sku}</Text>
                </View>
                <View style={styles.rightCol}>
                  <Text style={styles.price}>
                    {v.price != null ? `${Number(v.price).toLocaleString()} so'm` : '—'}
                  </Text>
                  <Text style={[styles.stock, v.qty === 0 && styles.stockOut]}>
                    {v.qty > 0 ? `${v.qty.toLocaleString()} dona` : 'Tugagan'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1115', paddingTop: 56 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  logout: { color: '#8b93a7', fontSize: 14 },
  search: {
    backgroundColor: '#171a21',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2f3a',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 15,
  },
  empty: { color: '#5b6272', textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#171a21',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  productName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  material: { color: '#8b93a7', fontSize: 13, marginTop: 2 },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#232834',
  },
  variantTitle: { color: '#d7dbe4', fontSize: 15, fontWeight: '600' },
  sku: { color: '#5b6272', fontSize: 12, marginTop: 2 },
  rightCol: { alignItems: 'flex-end' },
  price: { color: '#4ade80', fontSize: 16, fontWeight: '700' },
  stock: { color: '#8b93a7', fontSize: 13, marginTop: 2 },
  stockOut: { color: '#f87171' },
});
