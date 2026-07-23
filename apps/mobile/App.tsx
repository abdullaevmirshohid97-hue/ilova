import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { formatSum, supabase } from './src/lib/supabase';
import { CartProvider, useCart } from './src/lib/cart';
import { LanguageProvider, useLanguage } from './src/lib/i18n';
import { useIsWide } from './src/lib/responsive';
import { C } from './src/lib/theme';
import LoginScreen from './src/screens/LoginScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import CartScreen from './src/screens/CartScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import DesignOrdersScreen from './src/screens/DesignOrdersScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import ProfileScreen from './src/screens/ProfileScreen';

type Screen = 'catalog' | 'cart' | 'orders' | 'designOrders' | 'ledger' | 'profile';
type CustomerInfo = { name: string; phone: string; balance: number };

const MENU: { key: Screen; icon: string; labelKey: 'menuCatalog' | 'menuCart' | 'menuOrders' | 'menuDesignOrders' | 'menuLedger' | 'menuProfile' }[] = [
  { key: 'catalog', icon: '🏬', labelKey: 'menuCatalog' },
  { key: 'cart', icon: '🛒', labelKey: 'menuCart' },
  { key: 'orders', icon: '📦', labelKey: 'menuOrders' },
  { key: 'designOrders', icon: '🎨', labelKey: 'menuDesignOrders' },
  { key: 'ledger', icon: '💳', labelKey: 'menuLedger' },
  { key: 'profile', icon: '👤', labelKey: 'menuProfile' },
];

const TITLE_KEYS: Record<Screen, 'menuCatalog' | 'menuCart' | 'menuOrders' | 'menuDesignOrders' | 'menuLedger' | 'menuProfile'> = {
  catalog: 'menuCatalog',
  cart: 'menuCart',
  orders: 'menuOrders',
  designOrders: 'menuDesignOrders',
  ledger: 'menuLedger',
  profile: 'menuProfile',
};

// Kompyuter/planshetda content juda cho'zilib ketmasligi uchun — katalogga
// ko'proq joy (grid ustunlari uchun), qolgan ekranlarga o'qish uchun qulay eni
const WIDE_MAX_WIDTH: Record<Screen, number> = {
  catalog: 1200,
  cart: 760,
  orders: 760,
  designOrders: 760,
  ledger: 760,
  profile: 640,
};

const DRAWER_W = Math.min(Dimensions.get('window').width * 0.78, 320);

function useCustomerInfo() {
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const refresh = useCallback(() => {
    Promise.all([
      supabase.from('customers').select('name, phone').single(),
      supabase.from('customer_balances').select('balance').maybeSingle(),
    ]).then(([{ data: c }, { data: b }]) => {
      if (c) {
        setInfo({
          name: (c as any).name,
          phone: (c as any).phone,
          balance: Number((b as any)?.balance ?? 0),
        });
      }
    });
  }, []);
  return { info, refresh };
}

// Profil kartasi + menyu + til + chiqish — overlay drawer'da ham, doimiy
// sidebar'da ham bir xil ishlatiladi (mobil vs desktop uchun ikki marta
// yozmaslik uchun)
function DrawerBody({
  screen,
  onNavigate,
  info,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  info: CustomerInfo | null;
}) {
  const cart = useCart();
  const { t, lang, setLang } = useLanguage();
  const debt = info != null && info.balance > 0;
  const credit = info != null && info.balance < 0;

  return (
    <>
      <View style={d.profileBox}>
        <View style={d.avatar}>
          <Text style={d.avatarText}>{info?.name?.slice(0, 1)?.toUpperCase() ?? '•'}</Text>
        </View>
        <Text style={d.name}>{info?.name ?? '...'}</Text>
        <Text style={d.phone}>{info?.phone ?? ''}</Text>
        <View style={[d.balanceChip, debt ? d.debtChip : credit ? d.creditChip : null]}>
          <Text
            style={[
              d.balanceText,
              debt && { color: C.red },
              credit && { color: C.green },
            ]}
          >
            {info == null
              ? '...'
              : debt
                ? t('debtLabel', { amount: formatSum(info.balance) })
                : credit
                  ? t('creditLabel', { amount: formatSum(Math.abs(info.balance)) })
                  : t('accountClean')}
          </Text>
        </View>
      </View>

      {MENU.map((m) => {
        const active = screen === m.key;
        return (
          <TouchableOpacity
            key={m.key}
            style={[d.item, active && d.itemActive]}
            onPress={() => onNavigate(m.key)}
          >
            <Text style={d.itemIcon}>{m.icon}</Text>
            <Text style={[d.itemLabel, active && d.itemLabelActive]}>{t(m.labelKey)}</Text>
            {m.key === 'cart' && cart.count > 0 && (
              <View style={d.badge}>
                <Text style={d.badgeText}>{cart.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      <View style={{ flex: 1 }} />

      <View style={d.langRow}>
        <TouchableOpacity
          style={[d.langBtn, lang === 'uz' && d.langBtnActive]}
          onPress={() => setLang('uz')}
        >
          <Text style={[d.langBtnText, lang === 'uz' && d.langBtnTextActive]}>O'zbekcha</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[d.langBtn, lang === 'ru' && d.langBtnActive]}
          onPress={() => setLang('ru')}
        >
          <Text style={[d.langBtnText, lang === 'ru' && d.langBtnTextActive]}>Русский</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={d.logout} onPress={() => supabase.auth.signOut()}>
        <Text style={d.logoutIcon}>🚪</Text>
        <Text style={d.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>
    </>
  );
}

// Telefon/kichik planshet: yashirin drawer, gamburger bilan ochiladi
function Drawer({
  open,
  screen,
  onNavigate,
  onClose,
}: {
  open: boolean;
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onClose: () => void;
}) {
  // Panel DOIM chizilgan turadi — animatsiya shunda ishonchli ishlaydi
  const slide = useRef(new Animated.Value(-DRAWER_W)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const { info, refresh } = useCustomerInfo();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: open ? 0 : -DRAWER_W,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: open ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    // Har ochilganda balansni yangilaymiz
    if (open) refresh();
  }, [open, slide, fade, refresh]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[d.backdrop, { opacity: fade }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[d.panel, { transform: [{ translateX: slide }] }]}>
        <DrawerBody
          screen={screen}
          onNavigate={(s) => {
            onNavigate(s);
            onClose();
          }}
          info={info}
        />
      </Animated.View>
    </View>
  );
}

// Kompyuter/keng planshet: doimiy ko'rinadigan yon panel (drawer emas)
function Sidebar({
  screen,
  onNavigate,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
}) {
  const { info, refresh } = useCustomerInfo();
  useEffect(() => {
    refresh();
    // Ekran almashganda balans/qarz yangi bo'lsin (masalan to'lov kiritilgach)
  }, [screen, refresh]);

  return (
    <View style={d.sidebarPanel}>
      <DrawerBody screen={screen} onNavigate={onNavigate} info={info} />
    </View>
  );
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('catalog');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cart = useCart();
  const { t } = useLanguage();
  const isWide = useIsWide();
  const goOrders = useCallback(() => setScreen('orders'), []);

  // Android fizik "orqaga" tugmasi: drawer ochiq bo'lsa yopadi,
  // ichki ekranda bo'lsa katalogga qaytaradi
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isWide && drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (screen !== 'catalog') {
        setScreen('catalog');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen, screen, isWide]);

  return (
    <View style={{ flex: 1, flexDirection: isWide ? 'row' : 'column', backgroundColor: C.bg }}>
      {isWide && <Sidebar screen={screen} onNavigate={setScreen} />}

      <View style={{ flex: 1 }}>
        {/* Sarlavha paneli: mobilda gamburger+ortga, kompyuterda faqat sarlavha+savat */}
        <View style={[h.header, isWide && h.headerWide]}>
          {!isWide && (
            <TouchableOpacity
              style={h.burger}
              onPress={() => setDrawerOpen(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={h.burgerLine} />
              <View style={h.burgerLine} />
              <View style={h.burgerLine} />
            </TouchableOpacity>
          )}
          {!isWide && screen !== 'catalog' && (
            <TouchableOpacity
              style={h.backBtn}
              onPress={() => setScreen('catalog')}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Text style={h.backArrow}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={[h.title, isWide && { marginLeft: 0 }]}>{t(TITLE_KEYS[screen])}</Text>
          <TouchableOpacity style={h.cartBtn} onPress={() => setScreen('cart')}>
            <Text style={h.cartIcon}>🛒</Text>
            {cart.count > 0 && (
              <View style={h.badge}>
                <Text style={h.badgeText}>{cart.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, alignItems: isWide ? 'center' : 'stretch' }}>
          <View
            style={[
              { flex: 1, width: '100%' },
              isWide && { maxWidth: WIDE_MAX_WIDTH[screen] },
            ]}
          >
            {screen === 'catalog' && <CatalogScreen />}
            {screen === 'cart' && <CartScreen onOrdered={goOrders} />}
            {screen === 'orders' && <OrdersScreen />}
            {screen === 'designOrders' && <DesignOrdersScreen />}
            {screen === 'ledger' && <LedgerScreen />}
            {screen === 'profile' && <ProfileScreen />}
          </View>
        </View>
      </View>

      {!isWide && (
        <Drawer
          open={drawerOpen}
          screen={screen}
          onNavigate={setScreen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <LanguageProvider>
      <CartProvider>
        <StatusBar style="dark" />
        {session ? <MainApp /> : <LoginScreen />}
      </CartProvider>
    </LanguageProvider>
  );
}

const h = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerWide: {
    paddingTop: 20,
  },
  burger: { width: 26, gap: 5, paddingVertical: 4 },
  burgerLine: { height: 2.5, borderRadius: 2, backgroundColor: C.text },
  backBtn: { marginLeft: 12 },
  backArrow: { color: C.text, fontSize: 22, fontWeight: '800' },
  title: { flex: 1, color: C.text, fontSize: 19, fontWeight: '800', marginLeft: 14 },
  cartBtn: { padding: 4 },
  cartIcon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: C.accent,
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});

const d = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,21,26,0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_W,
    backgroundColor: C.card,
    paddingTop: 64,
    paddingHorizontal: 14,
    paddingBottom: 32,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  sidebarPanel: {
    width: 260,
    backgroundColor: C.card,
    paddingTop: 28,
    paddingHorizontal: 14,
    paddingBottom: 24,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  profileBox: {
    alignItems: 'center',
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    marginBottom: 12,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  name: { color: C.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
  phone: { color: C.muted, fontSize: 13, marginTop: 2 },
  balanceChip: {
    marginTop: 10,
    backgroundColor: C.bg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  debtChip: { backgroundColor: C.redSoft },
  creditChip: { backgroundColor: C.greenSoft },
  balanceText: { color: C.text2, fontSize: 13, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  itemActive: { backgroundColor: C.primarySoft },
  itemIcon: { fontSize: 19 },
  itemLabel: { color: C.text2, fontSize: 15, fontWeight: '600', flex: 1 },
  itemLabelActive: { color: C.primary, fontWeight: '800' },
  badge: {
    backgroundColor: C.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  langRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  langBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 9,
    alignItems: 'center',
  },
  langBtnActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  langBtnText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  langBtnTextActive: { color: C.primary },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  logoutIcon: { fontSize: 18 },
  logoutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
