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
import { formatNarx, imageUrl, supabase } from '../lib/supabase';
import { useCart } from '../lib/cart';
import { useLanguage } from '../lib/i18n';
import { C } from '../lib/theme';

const PAGE_SIZE = 20;
// v2: keshdagi variantlarga disp_price/disp_currency qo'shildi. Kalit
// almashmasa eski keshdan narxsiz variant kelib, ekranda "—" chiqardi.
// v3: narx endi null bo'lishi mumkin (admin "narxsiz mahsulot ham
// ko'rinsin" deb qo'ysa). Eski kesh qolsa null narx 0 bo'lib ko'rinardi.
// v4: mahsulot tavsifi qo'shildi — eski keshda u yo'q, ya'ni tavsif
// yozilgan bo'lsa ham ekranda chiqmasdi.
// v5: brend va minimal partiya qo'shildi. Eski keshda minMiqdor yo'q —
// u yerdan ochilgan mahsulotda savat tugmasi ishlamay qolardi.
const CACHE_KEY = '@ilova/catalog-cache-v5';

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

export type Variant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  // null — narx qo'yilmagan. Bunday variant faqat admin "narxsiz
  // mahsulot ham ko'rinsin" deb qo'ygan bo'lsa keladi va SOTILMAYDI:
  // savatga tushmaydi, create_order ham NARX_TOPILMADI beradi.
  price: number | null; // so'mdagi narx — buyurtma shu bo'yicha yoziladi
  currency: string; // narx qaysi valyutada KIRITILGAN (manba)
  origPrice: number | null;
  // Mijozga ko'rsatiladigan narx va valyuta — my_effective_prices() hisoblaydi
  dispPrice: number | null;
  dispCurrency: string;
  available: number;
};

// Narx MIJOZNING valyutasida ko'rsatiladi — variant qaysi valyutada
// narxlangani muhim emas.
//
// Avval shart uchta edi: mijoz USD + shu variant USD + asl summa bor.
// Menejer narx qo'ymagan variant baza narxidan keladi va so'mda
// bo'ladi — natijada bitta katalogda narxlar aralash chiqardi.
// Endi o'girishni baza qiladi (my_effective_prices.disp_price).
function fmtVariantPrice(v: Variant, narxYoqMatn: string): string {
  if (v.dispPrice == null) return narxYoqMatn;
  return formatNarx(v.dispPrice, v.dispCurrency);
}

export type Product = {
  id: string;
  name: string;
  model: string | null;
  material: string | null;
  description: string | null; // admin panelda yozadigan tavsif
  brand: string | null;
  // Minimal partiya: ulgurjida tovar bittalab sotilmaydi. SERVERDA ham
  // tekshiriladi (create_order -> MIN_MIQDOR); bu yerdagi to'siq esa
  // xaridor bekorga urinib ko'rmasligi uchun
  minMiqdor: number;
  image: string | null; // kichik nusxa (birinchi rasm) — grid uchun
  images: string[]; // katta nusxalar — mahsulot sahifasida swipe galereya
  variants: Variant[];
};

type Category = { id: string; name: string };

// Saralash turlari. Narx bo'yicha saralash SERVERDA bo'lmaydi: narx har
// mijoz uchun my_effective_prices() da hisoblanadi (menejer narxi,
// valyuta). Shuning uchun narx tanlansa ro'yxat bir marta to'liq
// olinadi va shu yerda saralanadi — katalog hajmida bu arzon.
type Saralash = 'nom' | 'arzon' | 'qimmat' | 'yangi';

// Mahsulotning eng arzon narxi (narxsiz variantlar hisobga olinmaydi)
function engArzon(p: Product): number | null {
  let min: number | null = null;
  for (const v of p.variants) {
    if (v.dispPrice == null) continue;
    if (min == null || v.dispPrice < min) min = v.dispPrice;
  }
  return min;
}

function first<T>(v: T | T[] | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// Narx to'g'ridan-to'g'ri `prices` (baza) jadvalidan emas — mijozning
// o'ziga (menejeri qo'ygan narx bo'lsa, o'shani hisobga olib) tegishli
// yakuniy narxni qaytaradigan my_effective_prices() RPC orqali olinadi.
// Aks holda mijoz katalogda hali buyurtma bermay turib ham noto'g'ri
// (baza) narxni ko'rib, chalkashib qolardi.
// price/dispPrice null bo'lishi mumkin: admin "narxsiz mahsulot ham
// ko'rinsin" deb qo'ysa, my_effective_prices() narxsiz variantlarni
// ham qaytaradi — narx ustunlari bo'sh holda.
export type EffPrice = {
  price: number | null;
  currency: string;
  origPrice: number | null;
  dispPrice: number | null;
  dispCurrency: string;
};

// my_effective_prices() javobini variant_id -> narx xaritasiga aylantiradi
export function narxXaritasi(priceRows: any[] | null): Map<string, EffPrice> {
  return new Map<string, EffPrice>(
    (priceRows ?? []).map((r: any) => [
      r.variant_id,
      {
        price: r.price != null ? Number(r.price) : null,
        currency: r.currency ?? 'UZS',
        origPrice: r.orig_price != null ? Number(r.orig_price) : null,
        // disp_* bo'lmasa (eski keshdan kelgan javob) so'mdagi narxga
        // qaytamiz — ekran bo'sh qolmasin. Narxning O'ZI yo'q bo'lsa
        // (narxsiz mahsulot) null qoladi: 0 deb ko'rsatib bo'lmaydi.
        dispPrice:
          r.disp_price != null ? Number(r.disp_price) : r.price != null ? Number(r.price) : null,
        dispCurrency: r.disp_currency ?? 'UZS',
      },
    ])
  );
}

// Katalog so'rovidagi ustunlar — bosh sahifa ham AYNAN shu ro'yxatni
// ishlatadi, aks holda bir ekranda tavsif bor, ikkinchisida yo'q bo'lardi
export const MAHSULOT_USTUNLARI = `id, name, model, material, description, brand, min_order_qty,
   product_images ( storage_path, thumb_path, is_primary, sort_order ),
   product_variants ( id, sku, size, color,
     stock_levels ( qty, reserved )
   )`;

// Berilgan id'lar bo'yicha mahsulotlarni narxi bilan oladi va AYNAN
// shu tartibda qaytaradi (eng ko'p sotilganlar tartibi muhim).
export async function mahsulotlarniOl(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const [{ data }, { data: priceRows }] = await Promise.all([
    supabase.from('products').select(MAHSULOT_USTUNLARI).in('id', ids).eq('is_active', true),
    supabase.rpc('my_effective_prices'),
  ]);
  const priceMap = narxXaritasi(priceRows);
  const xarita = new Map<string, Product>();
  for (const p of data ?? []) {
    const m = mapRow(p, priceMap);
    if (m.variants.length > 0) xarita.set(m.id, m);
  }
  return ids.map((id) => xarita.get(id)).filter((p): p is Product => p != null);
}

export function mapRow(p: any, priceMap: Map<string, EffPrice>): Product {
  const imgs = (p.product_images ?? []).sort(
    (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
  );
  // Narxsiz variant (mijoz guruhida narx yo'q) katalogda ko'rsatilmaydi
  const variants: Variant[] = (p.product_variants ?? [])
    .map((v: any): Variant | null => {
      const eff = priceMap.get(v.id);
      if (eff == null) return null;
      const sl = first<any>(v.stock_levels);
      return {
        id: v.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        price: eff.price,
        currency: eff.currency,
        origPrice: eff.origPrice,
        dispPrice: eff.dispPrice,
        dispCurrency: eff.dispCurrency,
        available: Math.max(0, (sl?.qty ?? 0) - (sl?.reserved ?? 0)),
      };
    })
    .filter((v: Variant | null): v is Variant => v != null);
  return {
    id: p.id,
    name: p.name,
    model: p.model,
    material: p.material,
    description: p.description ?? null,
    brand: p.brand ?? null,
    minMiqdor: Math.max(1, Number(p.min_order_qty ?? 1)),
    image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null,
    images: imgs.map((im: any) => imageUrl(im.storage_path)),
    variants,
  };
}


// ---------- Rasm galereyasi (bir nechta rasm — swipe) ----------
function ImageGallery({
  images,
  placeholderLetter,
  width,
  height,
}: {
  images: string[];
  placeholderLetter: string;
  width: number;
  // Balandlik ekran kengligidan hisoblanadi — avval 320px qat'iy edi va
  // katta telefonda rasm kichkina bo'lib qolardi
  height: number;
}) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <View style={[ps.image, ps.imagePh, { height }]}>
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
        style={s.qatorSiqilmasin}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
      >
        {images.map((uri, i) => (
          <Image key={i} source={{ uri }} style={[ps.image, { width, height }]} resizeMode="cover" />
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
export function ProductSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const cart = useCart();
  const { t } = useLanguage();

  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const galleryWidth = isWide ? 560 : width;
  // Rasm — mahsulot sahifasidagi ASOSIY narsa. Avval balandlik 320px
  // qat'iy edi: katta telefonda ham, planshetda ham bir xil kichkina
  // ko'rinardi. Endi kenglikka bog'liq (telefonda deyarli kvadratdan
  // balandroq — WB/Uzum uslubi), planshetda oyna sig'ishi uchun cheklangan.
  const galleryHeight = isWide ? 420 : Math.round(galleryWidth * 1.15);
  // Narxsiz variant tanlanmaydi: uni sotib bo'lmaydi. Narxlisi bo'lsa
  // o'sha ochiladi, bo'lmasa tanlov bo'sh qoladi va tugma o'chiq turadi.
  const [selected, setSelected] = useState<Variant | null>(
    product.variants.find((v) => v.available > 0 && v.price != null) ?? null
  );
  // Minimal partiya mahsulot darajasida. Maydon darhol shu son bilan
  // to'ldiriladi — xaridor "1" yozib, keyin xato ko'rib o'tirmasin.
  // `Number(...) || 1` ATAYLAB: eski keshdan kelgan mahsulotda bu maydon
  // yo'q va Math.max(1, undefined) NaN beradi — o'shanda qty >= NaN doim
  // false bo'lib, savat tugmasi butunlay ishlamay qolardi
  const minMiqdor = Math.max(1, Number(product.minMiqdor) || 1);
  const [qtyText, setQtyText] = useState(minMiqdor > 1 ? String(minMiqdor) : '');
  const qty = parseInt(qtyText, 10) || 0;
  const kamMiqdor = qty > 0 && qty < minMiqdor;
  const canAdd =
    selected != null && selected.price != null && qty >= minMiqdor && qty <= selected.available;

  function addToCart() {
    if (!selected || !canAdd || selected.price == null || selected.dispPrice == null) return;
    cart.add({
      variantId: selected.id,
      productName: product.name,
      sku: selected.sku,
      size: selected.size,
      color: selected.color,
      price: selected.price,
      currency: selected.currency,
      origPrice: selected.origPrice,
      dispPrice: selected.dispPrice,
      dispCurrency: selected.dispCurrency,
      qty,
      image: product.image,
      maxQty: selected.available,
    });
    onClose();
  }

  const body = (
    <ScrollView contentContainerStyle={{ paddingBottom: isWide ? 8 : 140 }}>
      <ImageGallery
        images={product.images}
        placeholderLetter={product.name.slice(0, 1)}
        width={galleryWidth}
        height={galleryHeight}
      />
      <View style={ps.body}>
        <Text style={ps.name}>
          {product.name}
          {product.model ? `  ·  ${product.model}` : ''}
        </Text>
        {product.brand ? (
          <Text style={ps.brend}>
            {t('brandLabel')}: <Text style={ps.brendNom}>{product.brand}</Text>
          </Text>
        ) : null}
        {product.material && <Text style={ps.material}>{product.material}</Text>}
        {minMiqdor > 1 && (
          <View style={ps.minBelgi}>
            <Text style={ps.minBelgiText}>{t('minQty', { n: String(minMiqdor) })}</Text>
          </View>
        )}
        {/* Tavsif. Admin uni panelda yozadi, lekin katalog so'rovi bu
            ustunni UMUMAN olmasdi — mijoz hech qachon ko'rmagan. */}
        {product.description ? (
          <Text style={ps.tavsif}>{product.description}</Text>
        ) : null}

        <Text style={ps.sectionTitle}>{t('variantsSectionTitle')}</Text>
        {product.variants.map((v) => {
          const active = selected?.id === v.id;
          // Narxsiz variant ham tugagan variant kabi: ko'rinadi,
          // lekin tanlanmaydi
          const narxsiz = v.price == null;
          const out = v.available <= 0 || narxsiz;
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
                  {fmtVariantPrice(v, t('priceOnRequest'))}
                </Text>
                <Text style={[ps.variantStock, out && !narxsiz && { color: C.red }]}>
                  {narxsiz
                    ? t('priceOnRequestHint')
                    : out
                      ? t('stockOut')
                      : t('stockAvailable', { n: v.available.toLocaleString() })}
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
        style={[ps.qtyInput, kamMiqdor && ps.qtyInputXato]}
        value={qtyText}
        onChangeText={(txt) => setQtyText(txt.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder={minMiqdor > 1 ? String(minMiqdor) : t('qtyPlaceholder')}
        placeholderTextColor={C.faint}
      />
      <TouchableOpacity
        style={[ps.addBtn, !canAdd && ps.addBtnDisabled]}
        onPress={addToCart}
        disabled={!canAdd}
      >
        <Text style={ps.addBtnText}>
          {/* Miqdor minimaldan kam bo'lsa — summa emas, SABAB yoziladi.
              "Savatga" o'chiq turgani yetarli emas: xaridor nega
              ishlamayotganini bilmasdi */}
          {kamMiqdor
            ? t('minQty', { n: String(minMiqdor) })
            : qty > 0 && selected != null && selected.dispPrice != null
              ? t('addToCartWithSum', {
                  sum: formatNarx(qty * selected.dispPrice, selected.dispCurrency),
                })
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

// Yoqilgan filtr — sarlavha ostidagi olib tashlanadigan chip
function FaolChip({ nom, onOchir }: { nom: string; onOchir: () => void }) {
  return (
    <TouchableOpacity style={s.faolChip} onPress={onOchir}>
      <Text style={s.faolChipText}>{nom}</Text>
      <Text style={s.faolChipX}>✕</Text>
    </TouchableOpacity>
  );
}

function saralashNomi(v: Saralash, t: (k: any) => string): string {
  if (v === 'arzon') return t('sortCheapest');
  if (v === 'qimmat') return t('sortExpensive');
  if (v === 'yangi') return t('sortNewest');
  return t('sortByName');
}

// Filtr paneli ichidagi bitta qator: sarlavha + gorizontal chiplar.
// Bitta komponent — qatorlar orasidagi masofa va o'lcham hamma joyda
// bir xil bo'lsin.
function FiltrQatori({
  sarlavha,
  qiymatlar,
  tanlangan,
  onTanla,
}: {
  sarlavha: string;
  qiymatlar: { key: string; nom: string }[];
  tanlangan: string | null;
  onTanla: (k: string) => void;
}) {
  return (
    <View style={s.filtrQator}>
      <Text style={s.filtrSarlavha}>{sarlavha}</Text>
      {/* RN'da ScrollView bazasida flexGrow:1, flexShrink:1 turadi —
          ustun ichida u siqilib nolga tushadi va qator YO'QOLADI */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.qatorSiqilmasin}
        contentContainerStyle={s.filtrChiplar}
      >
        {qiymatlar.map((q) => (
          <TouchableOpacity
            key={q.key}
            style={[s.chip, tanlangan === q.key && s.chipActive]}
            onPress={() => onTanla(q.key)}
          >
            <Text style={[s.chipText, tanlangan === q.key && s.chipTextActive]}>{q.nom}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
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
  // Ulgurji xaridor katalogni varaqlab o'tirmaydi — unga kerakli narsani
  // tez ajratib beradigan filtr kerak. Hammasi BOR ma'lumot ustida
  // ishlaydi: material mahsulotda, o'lcham variantda, qoldiq stock_levels
  // da, narx esa my_effective_prices() dan keladi.
  const [saralash, setSaralash] = useState<Saralash>('nom');
  const [material, setMaterial] = useState<string | null>(null);
  const [olcham, setOlcham] = useState<string | null>(null);
  const [brend, setBrend] = useState<string | null>(null);
  const [faqatQoldiq, setFaqatQoldiq] = useState(false);
  const [filtrOchiq, setFiltrOchiq] = useState(false);
  const [materiallar, setMateriallar] = useState<string[]>([]);
  const [olchamlar, setOlchamlar] = useState<string[]>([]);
  const [brendlar, setBrendlar] = useState<string[]>([]);
  const pageRef = useRef(0);

  // Nechta filtr yoqilgani — tugmada raqam bo'lib turadi, aks holda
  // xaridor "nega ro'yxat qisqa" deb tushunmay qoladi
  const faolFiltr =
    (material ? 1 : 0) +
    (olcham ? 1 : 0) +
    (brend ? 1 : 0) +
    (faqatQoldiq ? 1 : 0) +
    (saralash !== 'nom' ? 1 : 0);
  // Grid ustunlari qurilma eniga qarab moslashadi (telefon 2, planshet 3,
  // kompyuter 4) — App.tsx allaqachon katalog uchun kengni cheklaydi (max 1200)
  const [gridWidth, setGridWidth] = useState(0);
  const GRID_PADDING = 16;
  const GRID_GAP = 12;
  const columns = gridWidth >= 1000 ? 4 : gridWidth >= 640 ? 3 : 2;
  const cardWidth =
    gridWidth > 0 ? (gridWidth - GRID_PADDING * 2 - GRID_GAP * (columns - 1)) / columns : 160;
  // Rasm avval kvadrat edi (balandlik = kenglik). Mijoz tovarni rasmdan
  // tanlaydi — bo'yiga cho'zilgani ko'proq joy beradi va mato/naqsh
  // ko'rinadi. Ustunlar soni o'zgarmaydi: ro'yxat baribir siqilib
  // qolmasin.
  const kartochkaRasmBalandligi = Math.round(cardWidth * 1.25);

  useEffect(() => {
    supabase
      .from('categories')
      .select('id, name')
      .order('sort_order')
      .then(({ data }) => setCategories((data ?? []) as Category[]));

    // Filtr ro'yxatlari katalogning O'ZIDAN olinadi — qo'lda yozilgan
    // ro'yxat bo'lsa, yangi material qo'shilganda filtr eskirib qolardi.
    // RLS tufayli bu doim shu tenantning qiymatlari.
    const nom = (v: unknown) => String(v ?? '').trim();
    const yigish = (rows: any[] | null, ustun: string) =>
      Array.from(new Set((rows ?? []).map((r) => nom(r[ustun])).filter(Boolean)))
        // localeCompare ATAYLAB ishlatilmadi: Telegram WebView'da Intl
        // yo'q va til bilan bog'liq chaqiruvlar RangeError beradi
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, 24); // chiplar qatori cheksiz cho'zilib ketmasin

    supabase
      .from('products')
      .select('material')
      .eq('is_active', true)
      .then(({ data }) => setMateriallar(yigish(data, 'material')));

    supabase
      .from('product_variants')
      .select('size')
      .eq('is_active', true)
      .then(({ data }) => setOlchamlar(yigish(data, 'size')));

    supabase
      .from('products')
      .select('brand')
      .eq('is_active', true)
      .then(({ data }) => setBrendlar(yigish(data, 'brand')));
  }, []);

  // Qidiruvni 350ms kechiktiramiz — har harfda serverga so'rov yubormaslik uchun
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchPage(page: number): Promise<{ rows: Product[]; full: boolean; failed: boolean }> {
    // Narx va qoldiq SERVERDA filtrlanmaydi (narx — RPC dan, qoldiq —
    // qty minus reserved). Shunday filtr yoqilganda ro'yxat bitta
    // so'rovda to'liq olinadi va shu yerda saralanadi. Sahifalash
    // bilan aralashtirilsa tartib yolg'on chiqardi: birinchi 20 ta
    // ichidagi eng arzoni "eng arzon" bo'lib ko'rinardi.
    const ozimizFiltrlaymiz = faqatQoldiq || saralash === 'arzon' || saralash === 'qimmat';
    const TOLIQ_CHEK = 500;

    // O'lcham variantda — embedded filtr uchun `!inner` kerak,
    // aks holda mos kelmaydigan variantlar ham qaytadi.
    // Ustunlar ro'yxati bitta joyda (MAHSULOT_USTUNLARI): bosh sahifa
    // ham shuni ishlatadi.
    const ustunlar = olcham
      ? MAHSULOT_USTUNLARI.replace('product_variants (', 'product_variants!inner (')
      : MAHSULOT_USTUNLARI;

    let q = supabase.from('products').select(ustunlar).eq('is_active', true);

    q = saralash === 'yangi' ? q.order('created_at', { ascending: false }) : q.order('name');
    q = ozimizFiltrlaymiz
      ? q.range(0, TOLIQ_CHEK - 1)
      : q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (categoryId) q = q.eq('category_id', categoryId);
    if (material) q = q.eq('material', material);
    if (brend) q = q.eq('brand', brend);
    if (olcham) q = q.eq('product_variants.size', olcham);
    if (debouncedSearch) q = q.or(`name.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%`);

    const [{ data, error }, { data: priceRows }] = await Promise.all([
      q,
      supabase.rpc('my_effective_prices'),
    ]);
    if (error || !data) return { rows: [], full: false, failed: true };
    const priceMap = narxXaritasi(priceRows);
    // Mijoz guruhida narxi bo'lmagan mahsulot (barcha variantlari filtrlanib) grid'da chiqmaydi
    let rows = data.map((p: any) => mapRow(p, priceMap)).filter((p) => p.variants.length > 0);

    if (faqatQoldiq) {
      rows = rows.filter((p) => p.variants.some((v) => v.available > 0));
    }
    if (saralash === 'arzon' || saralash === 'qimmat') {
      // Narxsiz mahsulot doim oxirida: uni "eng arzon" deb ko'rsatish
      // xaridorni aldardi
      rows = [...rows].sort((a, b) => {
        const x = engArzon(a);
        const y = engArzon(b);
        if (x == null) return y == null ? 0 : 1;
        if (y == null) return -1;
        return saralash === 'arzon' ? x - y : y - x;
      });
    }

    return {
      rows,
      full: ozimizFiltrlaymiz ? false : data.length === PAGE_SIZE,
      failed: false,
    };
  }

  async function loadFirstPage() {
    setLoading(true);
    pageRef.current = 0;
    const { rows, full, failed } = await fetchPage(0);
    // Kesh FAQAT toza ko'rinish uchun: filtrlangan ro'yxatni saqlab
    // qo'ysak, oflayn holatda xaridor uni butun katalog deb o'ylardi
    const isDefaultView =
      !categoryId &&
      !debouncedSearch &&
      !material &&
      !olcham &&
      !brend &&
      !faqatQoldiq &&
      saralash === 'nom';

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
  }, [categoryId, debouncedSearch, material, olcham, brend, faqatQoldiq, saralash]);

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

  function filtrniTozala() {
    setSaralash('nom');
    setMaterial(null);
    setOlcham(null);
    setBrend(null);
    setFaqatQoldiq(false);
  }

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
      <View style={s.searchRow}>
        <View style={[s.searchWrap, { flex: 1 }]}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.search}
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={C.faint}
          />
        </View>
        <TouchableOpacity
          style={[s.filtrBtn, (filtrOchiq || faolFiltr > 0) && s.filtrBtnActive]}
          onPress={() => setFiltrOchiq((v) => !v)}
        >
          <Text style={[s.filtrBtnText, (filtrOchiq || faolFiltr > 0) && s.filtrBtnTextActive]}>
            ⚙︎
          </Text>
          {faolFiltr > 0 && (
            <View style={s.filtrBadge}>
              <Text style={s.filtrBadgeText}>{faolFiltr}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filtr — pastdan chiqadigan MODAL.
          Avval u ro'yxat ustida ochiladigan panel edi va uch narsani
          buzardi: (1) ochilganda mahsulotlar ekrandan chiqib ketardi,
          (2) sarlavha qismi cho'zilib, kategoriyalar qatorini siqib
          qo'yardi, (3) telefonda filtrni ko'rib, natijani ko'rib
          bo'lmasdi. Modal bularning uchalasini ham yechadi. */}
      <Modal
        visible={filtrOchiq}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltrOchiq(false)}
      >
        <View style={s.filtrOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFiltrOchiq(false)} />
          <View style={s.filtrSheet}>
            <View style={s.filtrSheetBosh}>
              <Text style={s.filtrSheetNom}>{t('filterTitle')}</Text>
              <TouchableOpacity onPress={() => setFiltrOchiq(false)} hitSlop={12}>
                <Text style={s.filtrYopish}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.filtrSheetTana}>
              <FiltrQatori
                sarlavha={t('filterSort')}
                qiymatlar={[
                  { key: 'nom', nom: t('sortByName') },
                  { key: 'arzon', nom: t('sortCheapest') },
                  { key: 'qimmat', nom: t('sortExpensive') },
                  { key: 'yangi', nom: t('sortNewest') },
                ]}
                tanlangan={saralash}
                onTanla={(k) => setSaralash(k as Saralash)}
              />

              {materiallar.length > 0 && (
                <FiltrQatori
                  sarlavha={t('filterMaterial')}
                  qiymatlar={materiallar.map((m) => ({ key: m, nom: m }))}
                  tanlangan={material}
                  onTanla={(k) => setMaterial(k === material ? null : k)}
                />
              )}

              {brendlar.length > 0 && (
                <FiltrQatori
                  sarlavha={t('filterBrand')}
                  qiymatlar={brendlar.map((b) => ({ key: b, nom: b }))}
                  tanlangan={brend}
                  onTanla={(k) => setBrend(k === brend ? null : k)}
                />
              )}

              {olchamlar.length > 0 && (
                <FiltrQatori
                  sarlavha={t('filterSize')}
                  qiymatlar={olchamlar.map((o) => ({ key: o, nom: o }))}
                  tanlangan={olcham}
                  onTanla={(k) => setOlcham(k === olcham ? null : k)}
                />
              )}

              <View style={s.filtrOxirgiQator}>
                <TouchableOpacity
                  style={[s.chip, faqatQoldiq && s.chipActive]}
                  onPress={() => setFaqatQoldiq((v) => !v)}
                >
                  <Text style={[s.chipText, faqatQoldiq && s.chipTextActive]}>
                    {t('filterInStockOnly')}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={s.filtrSheetOyoq}>
              <TouchableOpacity onPress={filtrniTozala} disabled={faolFiltr === 0}>
                <Text style={[s.filtrTozala, faolFiltr === 0 && { color: C.faint }]}>
                  {t('filterClear')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.filtrKorish} onPress={() => setFiltrOchiq(false)}>
                <Text style={s.filtrKorishText}>
                  {t('filterShowResults', { n: String(products.length) })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Yoqilgan filtrlar — ro'yxat nega qisqargani KO'RINIB tursin.
          Avval faqat tugmadagi raqam bor edi: xaridor ro'yxat qisqarganini
          ko'rardi, sababini esa filtrni ochmaguncha bilmasdi. */}
      {faolFiltr > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.qatorSiqilmasin}
          contentContainerStyle={s.faolChiplar}
        >
          {saralash !== 'nom' && (
            <FaolChip nom={saralashNomi(saralash, t)} onOchir={() => setSaralash('nom')} />
          )}
          {brend && <FaolChip nom={brend} onOchir={() => setBrend(null)} />}
          {material && <FaolChip nom={material} onOchir={() => setMaterial(null)} />}
          {olcham && <FaolChip nom={olcham} onOchir={() => setOlcham(null)} />}
          {faqatQoldiq && (
            <FaolChip nom={t('filterInStockOnly')} onOchir={() => setFaqatQoldiq(false)} />
          )}
        </ScrollView>
      )}

      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.qatorSiqilmasin}
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
        ListEmptyComponent={
          // Bo'sh ro'yxat ikki xil bo'ladi: katalogda hech narsa yo'q,
          // yoki filtr hammasini kesib tashlagan. Ikkinchisida chiqish
          // yo'li ham ko'rsatiladi — aks holda xaridor "ilova buzuq"
          // deb o'ylab yopib ketardi.
          faolFiltr > 0 || debouncedSearch ? (
            <View style={s.boshHolat}>
              <Text style={s.boshHolatNom}>{t('nothingFoundTitle')}</Text>
              <Text style={s.boshHolatIzoh}>{t('nothingFoundHint')}</Text>
              {faolFiltr > 0 && (
                <TouchableOpacity style={s.boshHolatBtn} onPress={filtrniTozala}>
                  <Text style={s.boshHolatBtnText}>{t('filterClear')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={s.empty}>{t('emptyCatalog')}</Text>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={C.primary} /> : null
        }
        renderItem={({ item }) => {
          // Eng arzon narx — FAQAT narxi bor variantlar orasidan.
          // Hech birida narx bo'lmasa kartochkada "Narx kelishiladi"
          // chiqadi (pastdagi fmtVariantPrice null'ni shunday o'qiydi).
          const minVariant = item.variants.reduce<Variant | null>(
            (min, v) =>
              v.price == null ? min : min == null || v.price < (min.price ?? Infinity) ? v : min,
            null
          );
          const kartochkaVariant = minVariant ?? item.variants[0] ?? null;
          // Variantlar narxi har xil bo'lsa narx yonida «dan» turadi
          const kopNarx =
            new Set(item.variants.map((v) => v.dispPrice).filter((p) => p != null)).size > 1;
          const totalAvail = item.variants.reduce((sum, v) => sum + v.available, 0);
          return (
            <TouchableOpacity
              style={[s.card, { width: cardWidth }]}
              onPress={() => setOpenProduct(item)}
              activeOpacity={0.8}
            >
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={[s.image, { height: kartochkaRasmBalandligi }]}
                  resizeMode="cover"
                />
              ) : (
                <View style={[s.image, s.imagePh, { height: kartochkaRasmBalandligi }]}>
                  <Text style={s.imagePhText}>{item.name.slice(0, 1)}</Text>
                </View>
              )}
              <View style={s.cardBody}>
                <View style={s.narxQatori}>
                  {/* «dan» — ulgurjining muhim signali: bu eng arzon
                      variant narxi, boshqalari qimmatroq. O'rni tilga
                      qarab o'zgaradi (uz: keyin, ru: oldin) */}
                  {kopNarx && t('priceFromPrefix') !== '' && (
                    <Text style={s.narxDan}>{t('priceFromPrefix')}</Text>
                  )}
                  <Text style={s.price}>
                    {kartochkaVariant != null
                      ? fmtVariantPrice(kartochkaVariant, t('priceOnRequest'))
                      : '—'}
                  </Text>
                  {kopNarx && t('priceFromSuffix') !== '' && (
                    <Text style={s.narxDan}>{t('priceFromSuffix')}</Text>
                  )}
                </View>
                <Text style={s.name} numberOfLines={2}>
                  {item.name}
                  {item.model ? ` · ${item.model}` : ''}
                </Text>
                {/* Ulgurjining eng muhim sharti — xaridor uni kartochkadayoq
                    ko'rsin, mahsulotni ochib yurmasin */}
                {item.minMiqdor > 1 && (
                  <Text style={s.minMiqdor}>{t('minQty', { n: String(item.minMiqdor) })}</Text>
                )}
                <View style={s.kartochkaOxiri}>
                  <Text style={[s.stock, totalAvail === 0 && { color: C.red }]} numberOfLines={1}>
                    {totalAvail > 0
                      ? t('stockAvailable', { n: totalAvail.toLocaleString() })
                      : t('stockOut')}
                  </Text>
                  {/* Tugma buyurtmani JIM qo'shmaydi — mahsulot sahifasini
                      ochadi. Ulgurjida miqdor tanlanmasdan savatga tashlash
                      xato: minimal partiya va qoldiq bor */}
                  <TouchableOpacity
                    style={[s.savatBtn, totalAvail === 0 && s.savatBtnOff]}
                    onPress={() => setOpenProduct(item)}
                    disabled={totalAvail === 0}
                  >
                    <Text style={s.savatBtnText}>🛒</Text>
                  </TouchableOpacity>
                </View>
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 16 },
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
  filtrBtn: {
    width: 44,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtrBtnActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  filtrBtnText: { fontSize: 18, color: C.text2 },
  filtrBtnTextActive: { color: C.primary },
  filtrBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtrBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  // RN'da ScrollView bazasida flexGrow:1, flexShrink:1 turadi. Ustun
  // ichida (ayniqsa yonida FlatList bo'lsa) gorizontal qator siqilib
  // NOLGA tushadi va butunlay yo'qoladi — kategoriyalar shu sababdan
  // ko'rinmay qolgan edi.
  qatorSiqilmasin: { flexGrow: 0, flexShrink: 0 },
  boshHolat: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  boshHolatNom: { color: C.text, fontSize: 16, fontWeight: '800' },
  boshHolatIzoh: { color: C.muted, fontSize: 14, marginTop: 6, textAlign: 'center' },
  boshHolatBtn: {
    marginTop: 16,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  boshHolatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  filtrOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,21,26,0.45)' },
  filtrSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxHeight: '85%',
  },
  filtrSheetBosh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filtrSheetNom: { color: C.text, fontSize: 17, fontWeight: '800' },
  filtrYopish: { color: C.muted, fontSize: 18, fontWeight: '700' },
  filtrSheetTana: { paddingTop: 4 },
  filtrSheetOyoq: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  filtrKorish: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  filtrKorishText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  faolChiplar: { gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  faolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.primarySoft,
  },
  faolChipText: { color: C.primary, fontSize: 13, fontWeight: '700' },
  faolChipX: { color: C.primary, fontSize: 12, fontWeight: '800' },
  filtrPanel: {
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 12,
  },
  filtrQator: { marginBottom: 10 },
  filtrSarlavha: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  filtrChiplar: { gap: 8, paddingHorizontal: 16 },
  filtrOxirgiQator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  filtrTozala: { color: C.primary, fontSize: 13, fontWeight: '700' },
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
  narxQatori: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { color: C.text, fontSize: 16, fontWeight: '800' },
  narxDan: { color: C.muted, fontSize: 12, fontWeight: '600' },
  name: { color: C.text2, fontSize: 13, marginTop: 3, lineHeight: 17 },
  minMiqdor: { color: C.primary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  kartochkaOxiri: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 5,
  },
  stock: { color: C.green, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  savatBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savatBtnOff: { backgroundColor: C.faint },
  savatBtnText: { fontSize: 15 },
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
  // Balandlik ataylab yo'q — uni ImageGallery ekran kengligidan
  // hisoblab beradi. Bu yerda qat'iy 320px turganda katta telefonda
  // ham, planshetda ham rasm bir xil kichkina ko'rinardi.
  image: { width: '100%' },
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
  brend: { color: C.muted, fontSize: 14, marginTop: 6 },
  brendNom: { color: C.text, fontWeight: '700' },
  minBelgi: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C.primarySoft,
  },
  minBelgiText: { color: C.primary, fontSize: 13, fontWeight: '700' },
  // Tavsif uzun matn bo'ladi — qatorlar orasi keng, o'qishga qulay
  tavsif: { color: C.text2, fontSize: 14, lineHeight: 21, marginTop: 10 },
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
  qtyInputXato: { borderColor: C.red },
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
