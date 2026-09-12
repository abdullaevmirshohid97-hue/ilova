import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatNarx, imageUrl, somdan, supabase } from '../lib/supabase';
import { useCart } from '../lib/cart';
import { useLanguage } from '../lib/i18n';
import { C } from '../lib/theme';
import { ProductSheet, mahsulotlarniOl, type Product } from './CatalogScreen';

// ---------------------------------------------------------------------------
// BOSH SAHIFA
//
// Ilova avval to'g'ridan katalogdan ochilardi. Bu yerga kiradigan odam —
// ro'yxatdan o'tgan ULGURJI mijoz: u har hafta keladi va unga marketing
// emas, uchta narsa kerak:
//
//   1. qarzi qancha — eng ko'p so'raladigan raqam
//   2. oxirgi buyurtmasini takrorlash — eng ko'p takrorlanadigan amal
//   3. korxona nimani ko'p sotadi / nima yangi kelgan
//
// Shuning uchun bu ekranda "B2B hamkor bo'ling" turidagi bloklar YO'Q:
// ular kirmagan odam uchun, landing sahifada turishi kerak.
// ---------------------------------------------------------------------------

type Banner = {
  id: string;
  sarlavha: string;
  matn: string | null;
  tugma_matni: string | null;
  rasm_path: string | null;
};

export default function HomeScreen({
  onKatalog,
  onSavat,
  onQarz,
}: {
  onKatalog: () => void;
  onSavat: () => void;
  onQarz: () => void;
}) {
  const { t } = useLanguage();
  const cart = useCart();

  const [ism, setIsm] = useState('');
  const [balans, setBalans] = useState(0); // so'mda — ledger shu bo'yicha
  const [valyuta, setValyuta] = useState('UZS');
  const [kurs, setKurs] = useState<number | null>(null);
  const [bannerlar, setBannerlar] = useState<Banner[]>([]);
  const [kopSotilgan, setKopSotilgan] = useState<Product[]>([]);
  const [yangilar, setYangilar] = useState<Product[]>([]);
  const [oxirgiBuyurtma, setOxirgiBuyurtma] = useState<{ raqam: number; qatorlar: number } | null>(
    null
  );
  const [takrorBand, setTakrorBand] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);
  const [ochilgan, setOchilgan] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: mijoz }, { data: bal }, { data: val }, { data: bannerRows }, { data: kop }] =
      await Promise.all([
        supabase.from('customers').select('name').maybeSingle(),
        supabase.from('customer_balances').select('balance').maybeSingle(),
        supabase.rpc('mijoz_valyuta'),
        supabase
          .from('bannerlar')
          .select('id, sarlavha, matn, tugma_matni, rasm_path')
          .eq('faol', true)
          .order('tartib'),
        supabase.rpc('eng_kop_sotilgan', { p_limit: 8 }),
      ]);

    setIsm(((mijoz as any)?.name as string) ?? '');
    setBalans(Number((bal as any)?.balance ?? 0));
    const v = Array.isArray(val) ? val[0] : val;
    if (v) {
      setValyuta((v as any).valyuta ?? 'UZS');
      setKurs((v as any).kurs != null ? Number((v as any).kurs) : null);
    }
    setBannerlar((bannerRows ?? []) as Banner[]);

    // Eng ko'p sotilganlar — RPC faqat id qaytaradi (kim qancha olgani sir),
    // mahsulotning o'zi odatdagi RLS va narx yo'li bilan olinadi
    const idlar = ((kop ?? []) as any[]).map((r) => r.product_id as string);
    setKopSotilgan(await mahsulotlarniOl(idlar));

    const { data: yangiRows } = await supabase
      .from('products')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(8);
    setYangilar(await mahsulotlarniOl(((yangiRows ?? []) as any[]).map((r) => r.id)));

    const { data: oxirgi } = await supabase
      .from('orders')
      .select('order_number, order_items ( variant_id )')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setOxirgiBuyurtma(
      oxirgi
        ? {
            raqam: (oxirgi as any).order_number,
            qatorlar: ((oxirgi as any).order_items ?? []).length,
          }
        : null
    );
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function yangila() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // ---------- Oxirgi buyurtmani takrorlash ----------
  //
  // Eski NARXLAR ishlatilmaydi: narx o'zgargan bo'lishi mumkin, savatga
  // esa BUGUNGI narx tushishi kerak. Qoldiqda yo'q yoki narxi olib
  // tashlangan qatorlar jimgina tashlab ketilmaydi — nechtasi tushmagani
  // aytiladi.
  async function takrorla() {
    setTakrorBand(true);
    setXabar(null);
    try {
      const { data: oxirgi } = await supabase
        .from('orders')
        .select('order_items ( variant_id, qty )')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const qatorlar = ((oxirgi as any)?.order_items ?? []) as { variant_id: string; qty: number }[];
      if (qatorlar.length === 0) {
        setXabar(t('repeatNothing'));
        return;
      }

      const { data: variantRows } = await supabase
        .from('product_variants')
        .select('id, product_id')
        .in(
          'id',
          qatorlar.map((q) => q.variant_id)
        );
      const variantMahsulot = new Map<string, string>(
        ((variantRows ?? []) as any[]).map((v) => [v.id, v.product_id])
      );
      const mahsulotlar = await mahsulotlarniOl([...new Set([...variantMahsulot.values()])]);

      let qoshildi = 0;
      let otkazildi = 0;
      for (const qator of qatorlar) {
        const mahsulot = mahsulotlar.find((m) => m.id === variantMahsulot.get(qator.variant_id));
        const variant = mahsulot?.variants.find((v) => v.id === qator.variant_id);
        // Narxsiz yoki qoldiqda yetmaydigan qator savatga tushmaydi:
        // create_order uni baribir rad etardi
        if (
          !mahsulot ||
          !variant ||
          variant.price == null ||
          variant.dispPrice == null ||
          variant.available < qator.qty
        ) {
          otkazildi++;
          continue;
        }
        cart.add({
          variantId: variant.id,
          productName: mahsulot.name,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          price: variant.price,
          currency: variant.currency,
          origPrice: variant.origPrice,
          dispPrice: variant.dispPrice,
          dispCurrency: variant.dispCurrency,
          qty: qator.qty,
          image: mahsulot.image,
          maxQty: variant.available,
        });
        qoshildi++;
      }

      setXabar(
        otkazildi > 0
          ? t('repeatPartial', { n: String(qoshildi), m: String(otkazildi) })
          : t('repeatDone', { n: String(qoshildi) })
      );
      if (qoshildi > 0) onSavat();
    } finally {
      setTakrorBand(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  // Qarz jonli raqam — mijoz valyutasida ko'rsatiladi (buyurtma summasi
  // esa muzlatilgan kursda qoladi).
  //
  // BELGI: bu loyihada MUSBAT balans = mijozning QARZI (App.tsx dagi
  // "Qarz: ..." yorlig'i ham shunday hisoblaydi). Teskarisiga tushunsak,
  // ekranda qarz "haqingiz" bo'lib chiqardi.
  const balansKorinish = somdan(balans, valyuta, kurs);
  const qarzdor = balans > 0;

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={yangila} tintColor={C.primary} />
        }
      >
        {/* ---------- Hisob ---------- */}
        <TouchableOpacity style={s.qarzKarta} onPress={onQarz} activeOpacity={0.85}>
          <Text style={s.salom}>{ism ? t('helloName', { name: ism }) : t('hello')}</Text>
          <Text style={[s.qarzSumma, qarzdor ? { color: C.red } : { color: C.green }]}>
            {formatNarx(Math.abs(balansKorinish), valyuta)}
          </Text>
          <Text style={s.qarzIzoh}>
            {balans === 0 ? t('accountClean') : qarzdor ? t('youOwe') : t('weOwe')}
          </Text>
        </TouchableOpacity>

        {/* ---------- Oxirgi buyurtmani takrorlash ---------- */}
        {oxirgiBuyurtma && (
          <View style={s.takrorKarta}>
            <View style={{ flex: 1 }}>
              <Text style={s.takrorSarlavha}>{t('repeatTitle')}</Text>
              <Text style={s.takrorIzoh}>
                {t('repeatSubtitle', {
                  num: String(oxirgiBuyurtma.raqam),
                  n: String(oxirgiBuyurtma.qatorlar),
                })}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.takrorBtn, takrorBand && { opacity: 0.6 }]}
              onPress={takrorla}
              disabled={takrorBand}
            >
              <Text style={s.takrorBtnText}>{t('repeatButton')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {xabar && <Text style={s.xabar}>{xabar}</Text>}

        {/* ---------- Bannerlar ---------- */}
        {bannerlar.map((b) => (
          <View key={b.id} style={s.banner}>
            {b.rasm_path ? (
              <Image source={{ uri: imageUrl(b.rasm_path) }} style={s.bannerRasm} resizeMode="cover" />
            ) : null}
            <View style={s.bannerMatn}>
              <Text style={s.bannerSarlavha}>{b.sarlavha}</Text>
              {b.matn ? <Text style={s.bannerIzoh}>{b.matn}</Text> : null}
              {b.tugma_matni ? (
                <TouchableOpacity style={s.bannerBtn} onPress={onKatalog}>
                  <Text style={s.bannerBtnText}>{b.tugma_matni} →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))}

        <MahsulotQatori
          sarlavha={t('bestSellers')}
          mahsulotlar={kopSotilgan}
          onOch={setOchilgan}
          onHammasi={onKatalog}
          hammasiMatn={t('seeAll')}
          narxYoqMatn={t('priceOnRequest')}
        />
        <MahsulotQatori
          sarlavha={t('newArrivals')}
          mahsulotlar={yangilar}
          onOch={setOchilgan}
          onHammasi={onKatalog}
          hammasiMatn={t('seeAll')}
          narxYoqMatn={t('priceOnRequest')}
        />
      </ScrollView>

      {ochilgan && <ProductSheet product={ochilgan} onClose={() => setOchilgan(null)} />}
    </View>
  );
}

// ---------- Gorizontal mahsulot qatori ----------
function MahsulotQatori({
  sarlavha,
  mahsulotlar,
  onOch,
  onHammasi,
  hammasiMatn,
  narxYoqMatn,
}: {
  sarlavha: string;
  mahsulotlar: Product[];
  onOch: (p: Product) => void;
  onHammasi: () => void;
  hammasiMatn: string;
  narxYoqMatn: string;
}) {
  // Bo'sh qator sarlavhasi bilan turib olmasin — yangi tenantda hali
  // sotuv ham, mahsulot ham yo'q
  if (mahsulotlar.length === 0) return null;

  return (
    <View>
      <View style={s.qatorSarlavha}>
        <Text style={s.bolimNomi}>{sarlavha}</Text>
        <TouchableOpacity onPress={onHammasi}>
          <Text style={s.hammasi}>{hammasiMatn} →</Text>
        </TouchableOpacity>
      </View>
      {/* RN'da ScrollView bazasida flexGrow:1, flexShrink:1 turadi —
          ustun ichida gorizontal qator siqilib yo'qolib ketishi mumkin */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.qatorSiqilmasin}
        contentContainerStyle={{ gap: 12 }}
      >
        {mahsulotlar.map((m) => {
          const narxli = m.variants.filter((v) => v.dispPrice != null);
          const eng = narxli.length > 0 ? narxli.reduce((a, b) => (a.dispPrice! < b.dispPrice! ? a : b)) : null;
          return (
            <TouchableOpacity key={m.id} style={s.kartochka} onPress={() => onOch(m)} activeOpacity={0.85}>
              {m.image ? (
                <Image source={{ uri: m.image }} style={s.kartochkaRasm} resizeMode="cover" />
              ) : (
                <View style={[s.kartochkaRasm, s.rasmYoq]}>
                  <Text style={s.rasmYoqHarf}>{m.name.slice(0, 1)}</Text>
                </View>
              )}
              <Text style={s.kartochkaNarx} numberOfLines={1}>
                {eng ? formatNarx(eng.dispPrice!, eng.dispCurrency) : narxYoqMatn}
              </Text>
              <Text style={s.kartochkaNom} numberOfLines={2}>
                {m.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  qatorSiqilmasin: { flexGrow: 0, flexShrink: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },

  qarzKarta: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
  },
  salom: { color: C.muted, fontSize: 14 },
  qarzSumma: { fontSize: 28, fontWeight: '800', marginTop: 6 },
  qarzIzoh: { color: C.muted, fontSize: 13, marginTop: 2 },

  takrorKarta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.primarySoft,
    borderRadius: 18,
    padding: 16,
  },
  takrorSarlavha: { color: C.text, fontSize: 15, fontWeight: '800' },
  takrorIzoh: { color: C.text2, fontSize: 13, marginTop: 3 },
  takrorBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  takrorBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  xabar: { color: C.text2, fontSize: 13, marginTop: -8 },

  banner: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  bannerRasm: { width: '100%', height: 150 },
  bannerMatn: { padding: 16 },
  bannerSarlavha: { color: C.text, fontSize: 17, fontWeight: '800' },
  bannerIzoh: { color: C.text2, fontSize: 14, marginTop: 4, lineHeight: 20 },
  bannerBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bannerBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  qatorSarlavha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bolimNomi: { color: C.text, fontSize: 17, fontWeight: '800' },
  hammasi: { color: C.primary, fontSize: 13, fontWeight: '700' },

  kartochka: { width: 150 },
  kartochkaRasm: { width: 150, height: 175, borderRadius: 14, backgroundColor: C.card },
  rasmYoq: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
  rasmYoqHarf: { color: C.primary, fontSize: 40, fontWeight: '800' },
  kartochkaNarx: { color: C.text, fontSize: 15, fontWeight: '800', marginTop: 8 },
  kartochkaNom: { color: C.text2, fontSize: 13, marginTop: 2, lineHeight: 17 },
});
