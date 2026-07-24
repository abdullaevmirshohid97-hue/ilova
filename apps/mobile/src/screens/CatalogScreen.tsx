import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatSum, imageUrl, supabase } from '../lib/supabase';
import { useCart } from '../lib/cart';
import { useLanguage } from '../lib/i18n';
import { C } from '../lib/theme';

const PAGE_SIZE = 20;
const CACHE_KEY = '@ilova/catalog-cache';

async function saveCache(products: Product[]) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(products));
  } catch {
    // kesh yozilmasa ham ilova ishlashda davom etadi
  }
}

async function loadCache(): Promise<Product[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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
  material: string | null;
  image: string | null; // kichik nusxa (birinchi rasm) — grid uchun
  images: string[]; // katta nusxalar — mahsulot sahifasida swipe galereya
  variants: Variant[];
};

type Category = { id: string; name: string };

function first<T>(v: T | T[] | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ---------- Rasm galereyasi (bir nechta rasm — swipe) ----------
function ImageGallery({
  images,
  placeholderLetter,
  width,
}: {
  images: string[];
  placeholderLetter: string;
  width: number;
}) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <View style={[ps.image, ps.imagePh]}>
        <Text style={ps.imagePhText}>{placeholderLetter}</Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
      >
        {images.map((uri, i) => (
          <Image key={i} source={{ uri }} style={[ps.image, { width }]} resizeMode="cover" />
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={ps.dotsRow}>
          {images.map((_, i) => (
            <View key={i} style={[ps.dot, i === index && ps.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- Mahsulot sahifasi (WB/Uzum uslubidagi modal) ----------
// Telefonda: pastdan chiqadigan to'liq ekran sheet. Kompyuter/planshetda (>=700px):
// ekran o'rtasida cho'zilmagan, o'lchami cheklangan dialog.
function ProductSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const cart = useCart();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const galleryWidth = isWide ? 560 : width;
  const [selected, setSelected] = useState<Variant | null>(
    product.variants.find((v) => v.available > 0) ?? null
  );
  const [qtyText, setQtyText] = useState('');
  const qty = parseInt(qtyText, 10) || 0;
  const canAdd = selected != null && qty > 0 && qty <= selected.available;

  function addToCart() {
    if (!selected || !canAdd) return;
    cart.add({
      variantId: selected.id,
      productName: product.name,
      sku: selected.sku,
      size: selected.size,
      color: selected.color,
      price: selected.price,
      qty,
      image: product.image,
      maxQty: selected.available,
    });
    onClose();
  }

  const body = (
    <ScrollView contentContainerStyle={{ paddingBottom: isWide ? 8 : 140 }}>
      <ImageGallery images={product.images} placeholderLetter={product.name.slice(0, 1)} width={galleryWidth} />
      <View style={ps.body}>
        <Text style={ps.name}>
          {product.name}
          {product.model ? `  ·  ${product.model}` : ''}
        </Text>
        {product.material && <Text style={ps.material}>{product.material}</Text>}

        <Text style={ps.sectionTitle}>{t('variantsSectionTitle')}</Text>
        {product.variants.map((v) => {
          const active = selected?.id === v.id;
          const out = v.available <= 0;
          return (
            <TouchableOpacity
              key={v.id}
              style={[ps.variant, active && ps.variantActive, out && ps.variantOut]}
              onPress={() => !out && setSelected(v)}
              disabled={out}
            >
              <View style={{ flex: 1 }}>
                <Text style={[ps.variantTitle, out && { color: C.faint }]}>
                  {[v.size, v.color].filter(Boolean).join(' · ') || v.sku}
                </Text>
                <Text style={ps.variantSku}>{v.sku}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[ps.variantPrice, out && { color: C.faint }]}>
                  {formatSum(v.price)}
                </Text>
                <Text style={[ps.variantStock, out && { color: C.red }]}>
                  {out ? t('stockOut') : t('stockAvailable', { n: v.available.toLocaleString() })}
                </Text>
              </View>
              <View style={[ps.radio, active && ps.radioActive]}>
                {active && <View style={ps.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const footer = (
    <>
      <TextInput
        style={ps.qtyInput}
        value={qtyText}
        onChangeText={(txt) => setQtyText(txt.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder={t('qtyPlaceholder')}
        placeholderTextColor={C.faint}
      />
      <TouchableOpacity
        style={[ps.addBtn, !canAdd && ps.addBtnDisabled]}
        onPress={addToCart}
        disabled={!canAdd}
      >
        <Text style={ps.addBtnText}>
          {qty > 0 && selected != null
            ? t('addToCartWithSum', { sum: formatSum(qty * selected.price) })
            : t('addToCart')}
        </Text>
      </TouchableOpacity>
    </>
  );

  if (isWide) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={ps.wideOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={ps.wideCard}>
            <TouchableOpacity onPress={onClose} style={[ps.closeBtn, ps.wideCloseBtn]}>
              <Text style={ps.closeText}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>{body}</View>
            <View style={ps.footerWide}>{footer}</View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ps.container}>
        <View style={ps.header}>
          <TouchableOpacity onPress={onClose} style={ps.closeBtn}>
            <Text style={ps.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        {body}
        <View style={ps.footer}>{footer}</View>
      </View>
    </Modal>
  );
}

// ---------- Katalog (2 ustunli grid, server qidiruv + sahifalash) ----------
export default function CatalogScreen() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offline, setOffline] = useState(false);
  const [openProduct, setOpenProduct] = useState<Product | null>(null);
  const pageRef = useRef(0);
  // Grid ustunlari qurilma eniga qarab moslashadi (telefon 2, planshet 3,
  // kompyuter 4) — App.tsx allaqachon katalog uchun kengni cheklaydi (max 1200)
  const [gridWidth, setGridWidth] = useState(0);
  const GRID_PADDING = 16;
  const GRID_GAP = 12;
  const columns = gridWidth >= 1000 ? 4 : gridWidth >= 640 ? 3 : 2;
  const cardWidth =
    gridWidth > 0 ? (gridWidth - GRID_PADDING * 2 - GRID_GAP * (columns - 1)) / columns : 160;

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as Category[]));
  }, []);

  // Qidiruvni 350ms kechiktiramiz — har harfda serverga so'rov yubormaslik uchun
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Narx to'g'ridan-to'g'ri `prices` (baza) jadvalidan emas — mijozning
  // o'ziga (menejeri qo'ygan narx bo'lsa, o'shani hisobga olib) tegishli
  // yakuniy narxni qaytaradigan my_effective_prices() RPC orqali olinadi.
  // Aks holda mijoz katalogda hali buyurtma bermay turib ham noto'g'ri
  // (baza) narxni ko'rib, chalkashib qolardi.
  function mapRow(p: any, priceMap: Map<string, number>): Product {
    const imgs = (p.product_images ?? []).sort(
      (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
    );
    // Narxsiz variant (mijoz guruhida narx yo'q) katalogda ko'rsatilmaydi
    const variants: Variant[] = (p.product_variants ?? [])
      .map((v: any): Variant | null => {
        const price = priceMap.get(v.id);
        if (price == null) return null;
        const sl = first<any>(v.stock_levels);
        return {
          id: v.id,
          sku: v.sku,
          size: v.size,
          color: v.color,
          price,
          available: Math.max(0, (sl?.qty ?? 0) - (sl?.reserved ?? 0)),
        };
      })
      .filter((v: Variant | null): v is Variant => v != null);
    return {
      id: p.id,
      name: p.name,
      model: p.model,
      material: p.material,
      image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null,
      images: imgs.map((im: any) => imageUrl(im.storage_path)),
      variants,
    };
  }

  async function fetchPage(page: number): Promise<{ rows: Product[]; full: boolean; failed: boolean }> {
    let q = supabase
      .from('products')
      .select(
        `id, name, model, material,
         product_images ( storage_path, thumb_path, is_primary, sort_order ),
         product_variants ( id, sku, size, color,
           stock_levels ( qty, reserved )
         )`
      )
      .eq('is_active', true)
      .order('name')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (categoryId) q = q.eq('category_id', categoryId);
    if (debouncedSearch) q = q.or(`name.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%`);

    const [{ data, error }, { data: priceRows }] = await Promise.all([
      q,
      supabase.rpc('my_effective_prices'),
    ]);
    if (error || !data) return { rows: [], full: false, failed: true };
    const priceMap = new Map<string, number>(
      (priceRows ?? []).map((r: any) => [r.variant_id, Number(r.price)])
    );
    // Mijoz guruhida narxi bo'lmagan mahsulot (barcha variantlari filtrlanib) grid'da chiqmaydi
    const rows = data.map((p: any) => mapRow(p, priceMap)).filter((p) => p.variants.length > 0);
    return { rows, full: data.length === PAGE_SIZE, failed: false };
  }

  async function loadFirstPage() {
    setLoading(true);
    pageRef.current = 0;
    const { rows, full, failed } = await fetchPage(0);
    const isDefaultView = !categoryId && !debouncedSearch;

    if (failed) {
      // Internet yo'q (yoki server javob bermadi) — faqat filtrsiz asosiy
      // ko'rinish uchun oxirgi keshni ko'rsatamiz
      const cached = isDefaultView ? await loadCache() : null;
      setProducts(cached ?? []);
      setHasMore(false);
      setOffline(true);
    } else {
      setOffline(false);
      setProducts(rows);
      setHasMore(full);
      if (isDefaultView) saveCache(rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, debouncedSearch]);

  useEffect(() => {
    // Jonli: kimdir buyurtma bersa — mavjud son hammada darhol kamayadi
    const channel = supabase
      .channel('stock-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stock_levels' },
        (payload) => {
          const { variant_id, qty, reserved } = payload.new as {
            variant_id: string;
            qty: number;
            reserved: number;
          };
          const available = Math.max(0, qty - reserved);
          setProducts((prev) =>
            prev.map((p) => ({
              ...p,
              variants: p.variants.map((v) => (v.id === variant_id ? { ...v, available } : v)),
            }))
          );
          setOpenProduct((prev) =>
            prev
              ? {
                  ...prev,
                  variants: prev.variants.map((v) =>
                    v.id === variant_id ? { ...v, available } : v
                  ),
                }
              : prev
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const next = pageRef.current + 1;
    const { rows, full, failed } = await fetchPage(next);
    if (failed) {
      setHasMore(false);
      setLoadingMore(false);
      return;
    }
    pageRef.current = next;
    setProducts((prev) => [...prev, ...rows]);
    setHasMore(full);
    setLoadingMore(false);
  }

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={s.container} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
      {offline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineBannerText}>{t('offlineBanner')}</Text>
        </View>
      )}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={C.faint}
        />
      </View>

      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsWrap}
        >
          <TouchableOpacity
            style={[s.chip, categoryId == null && s.chipActive]}
            onPress={() => setCategoryId(null)}
          >
            <Text style={[s.chipText, categoryId == null && s.chipTextActive]}>{t('categoryAll')}</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.chip, categoryId === c.id && s.chipActive]}
              onPress={() => setCategoryId(c.id === categoryId ? null : c.id)}
            >
              <Text style={[s.chipText, categoryId === c.id && s.chipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        key={columns}
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={columns}
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_PADDING }}
        contentContainerStyle={{ gap: GRID_GAP, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListEmptyComponent={<Text style={s.empty}>{t('emptyCatalog')}</Text>}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={C.primary} /> : null
        }
        renderItem={({ item }) => {
          const prices = item.variants.map((v) => v.price);
          const minPrice = prices.length ? Math.min(...prices) : null;
          const totalAvail = item.variants.reduce((sum, v) => sum + v.available, 0);
          return (
            <TouchableOpacity
              style={[s.card, { width: cardWidth }]}
              onPress={() => setOpenProduct(item)}
              activeOpacity={0.8}
            >
              {item.image ? (
                <Image source={{ uri: item.image }} style={[s.image, { height: cardWidth }]} resizeMode="cover" />
              ) : (
                <View style={[s.image, s.imagePh, { height: cardWidth }]}>
                  <Text style={s.imagePhText}>{item.name.slice(0, 1)}</Text>
                </View>
              )}
              <View style={s.cardBody}>
                <Text style={s.price}>{minPrice != null ? formatSum(minPrice) : '—'}</Text>
                <Text style={s.name} numberOfLines={2}>
                  {item.name}
                  {item.model ? ` · ${item.model}` : ''}
                </Text>
                <Text style={[s.stock, totalAvail === 0 && { color: C.red }]}>
                  {totalAvail > 0 ? t('stockAvailable', { n: totalAvail.toLocaleString() }) : t('stockOut')}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {openProduct && <ProductSheet product={openProduct} onClose={() => setOpenProduct(null)} />}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  offlineBanner: {
    backgroundColor: C.yellowSoft,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  offlineBannerText: { color: '#8A6D1F', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 15, marginRight: 6 },
  search: { flex: 1, color: C.text, paddingVertical: 10, fontSize: 15 },
  chipsWrap: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.text2, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  empty: { color: C.muted, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  image: { width: '100%' },
  imagePh: { backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  imagePhText: { color: C.primary, fontSize: 48, fontWeight: '800' },
  cardBody: { padding: 10 },
  price: { color: C.text, fontSize: 16, fontWeight: '800' },
  name: { color: C.text2, fontSize: 13, marginTop: 3, lineHeight: 17 },
  stock: { color: C.green, fontSize: 12, marginTop: 5, fontWeight: '600' },
});

const ps = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.card },
  header: { position: 'absolute', top: 12, right: 12, zIndex: 10 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(20,21,26,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  wideOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20,21,26,0.5)',
    padding: 24,
  },
  wideCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  wideCloseBtn: { position: 'absolute', top: 12, right: 12 },
  footerWide: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  image: { width: '100%', height: 320 },
  imagePh: { backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  imagePhText: { color: C.primary, fontSize: 80, fontWeight: '800' },
  dotsRow: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  body: { padding: 16 },
  name: { color: C.text, fontSize: 20, fontWeight: '800' },
  material: { color: C.muted, fontSize: 14, marginTop: 4 },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  variant: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  variantActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  variantOut: { opacity: 0.6 },
  variantTitle: { color: C.text, fontSize: 15, fontWeight: '600' },
  variantSku: { color: C.faint, fontSize: 11, marginTop: 2 },
  variantPrice: { color: C.text, fontSize: 15, fontWeight: '800' },
  variantStock: { color: C.green, fontSize: 11, marginTop: 2, fontWeight: '600' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.faint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: { borderColor: C.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  qtyInput: {
    width: 120,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    color: C.text,
    paddingHorizontal: 12,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: C.bg,
  },
  addBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
  },
  addBtnDisabled: { backgroundColor: C.faint },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
