import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { C } from './src/lib/theme';
import LoginScreen from './src/screens/LoginScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import CartScreen from './src/screens/CartScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import LedgerScreen from './src/screens/LedgerScreen';
import ProfileScreen from './src/screens/ProfileScreen';

type Screen = 'catalog' | 'cart' | 'orders' | 'ledger' | 'profile';

const MENU: { key: Screen; icon: string; label: string }[] = [
  { key: 'catalog', icon: '🏬', label: 'Katalog' },
  { key: 'cart', icon: '🛒', label: 'Savat' },
  { key: 'orders', icon: '📦', label: 'Buyurtmalarim' },
  { key: 'ledger', icon: '💳', label: 'Hisob-kitob' },
  { key: 'profile', icon: '👤', label: 'Profil' },
];

const TITLES: Record<Screen, string> = {
  catalog: 'Katalog',
  cart: 'Savat',
  orders: 'Buyurtmalarim',
  ledger: 'Hisob-kitob',
  profile: 'Profil',
};

const DRAWER_W = Math.min(Dimensions.get('window').width * 0.78, 320);

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
  const cart = useCart();
  const slide = useRef(new Animated.Value(-DRAWER_W)).current;
  const [visible, setVisible] = useState(open);
  const [info, setInfo] = useState<{ name: string; phone: string; balance: number } | null>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
      // Har ochilganda balansni yangilaymiz
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
    } else {
      Animated.timing(slide, { toValue: -DRAWER_W, duration: 180, useNativeDriver: true }).start(
        () => setVisible(false)
      );
    }
  }, [open, slide]);

  if (!visible) return null;

  const debt = info != null && info.balance > 0;
  const credit = info != null && info.balance < 0;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={d.backdrop} onPress={onClose} />
      <Animated.View style={[d.panel, { transform: [{ translateX: slide }] }]}>
        {/* Mijoz kartasi */}
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
                  ? `Qarz: ${formatSum(info.balance)}`
                  : credit
                    ? `Haqingiz: ${formatSum(Math.abs(info.balance))}`
                    : 'Hisob toza ✅'}
            </Text>
          </View>
        </View>

        {/* Menyu */}
        {MENU.map((m) => {
          const active = screen === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[d.item, active && d.itemActive]}
              onPress={() => {
                onNavigate(m.key);
                onClose();
              }}
            >
              <Text style={d.itemIcon}>{m.icon}</Text>
              <Text style={[d.itemLabel, active && d.itemLabelActive]}>{m.label}</Text>
              {m.key === 'cart' && cart.count > 0 && (
                <View style={d.badge}>
                  <Text style={d.badgeText}>{cart.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ flex: 1 }} />
        <TouchableOpacity style={d.logout} onPress={() => supabase.auth.signOut()}>
          <Text style={d.logoutIcon}>🚪</Text>
          <Text style={d.logoutText}>Chiqish</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('catalog');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cart = useCart();
  const goOrders = useCallback(() => setScreen('orders'), []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Sarlavha paneli: chapda gamburger */}
      <View style={h.header}>
        <TouchableOpacity style={h.burger} onPress={() => setDrawerOpen(true)}>
          <View style={h.burgerLine} />
          <View style={h.burgerLine} />
          <View style={h.burgerLine} />
        </TouchableOpacity>
        <Text style={h.title}>{TITLES[screen]}</Text>
        <TouchableOpacity style={h.cartBtn} onPress={() => setScreen('cart')}>
          <Text style={h.cartIcon}>🛒</Text>
          {cart.count > 0 && (
            <View style={h.badge}>
              <Text style={h.badgeText}>{cart.count}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {screen === 'catalog' && <CatalogScreen />}
        {screen === 'cart' && <CartScreen onOrdered={goOrders} />}
        {screen === 'orders' && <OrdersScreen />}
        {screen === 'ledger' && <LedgerScreen />}
        {screen === 'profile' && <ProfileScreen />}
      </View>

      <Drawer
        open={drawerOpen}
        screen={screen}
        onNavigate={setScreen}
        onClose={() => setDrawerOpen(false)}
      />
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
    <CartProvider>
      <StatusBar style="dark" />
      {session ? <MainApp /> : <LoginScreen />}
    </CartProvider>
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
  burger: { width: 26, gap: 5, paddingVertical: 4 },
  burgerLine: { height: 2.5, borderRadius: 2, backgroundColor: C.text },
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
