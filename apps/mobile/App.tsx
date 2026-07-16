import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { CartProvider, useCart } from './src/lib/cart';
import { C } from './src/lib/theme';
import LoginScreen from './src/screens/LoginScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import CartScreen from './src/screens/CartScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import ProfileScreen from './src/screens/ProfileScreen';

type Tab = 'catalog' | 'cart' | 'orders' | 'profile';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'catalog', icon: '🏬', label: 'Katalog' },
  { key: 'cart', icon: '🛒', label: 'Savat' },
  { key: 'orders', icon: '📦', label: 'Buyurtmalar' },
  { key: 'profile', icon: '👤', label: 'Profil' },
];

function MainApp() {
  const [tab, setTab] = useState<Tab>('catalog');
  const cart = useCart();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1 }}>
        {tab === 'catalog' && <CatalogScreen />}
        {tab === 'cart' && <CartScreen onOrdered={() => setTab('orders')} />}
        {tab === 'orders' && <OrdersScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </View>

      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={s.tab} onPress={() => setTab(t.key)}>
            <View>
              <Text style={s.tabIcon}>{t.icon}</Text>
              {t.key === 'cart' && cart.count > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{cart.count}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;

  return (
    <CartProvider>
      <StatusBar style="light" />
      {session ? <MainApp /> : <LoginScreen />}
    </CartProvider>
  );
}

const s = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    paddingBottom: 24,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 22 },
  tabLabel: { color: C.faint, fontSize: 11, marginTop: 2 },
  tabLabelActive: { color: C.primary, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: C.red,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: C.text, fontSize: 10, fontWeight: '800' },
});
