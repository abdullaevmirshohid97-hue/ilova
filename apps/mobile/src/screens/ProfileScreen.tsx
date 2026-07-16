import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatSum, supabase } from '../lib/supabase';
import { C } from '../lib/theme';

type Profile = {
  name: string;
  phone: string;
  region: string | null;
  address: string | null;
  groupName: string | null;
  balance: number;
  ordersCount: number;
};

export default function ProfileScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: cust }, { data: bal }, { count }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone, region, address, price_groups ( name )')
        .single(),
      supabase.from('customer_balances').select('balance').maybeSingle(),
      supabase.from('orders').select('id', { count: 'exact', head: true }),
    ]);

    if (cust) {
      setP({
        name: (cust as any).name,
        phone: (cust as any).phone,
        region: (cust as any).region,
        address: (cust as any).address,
        groupName: (cust as any).price_groups?.name ?? null,
        balance: Number((bal as any)?.balance ?? 0),
        ordersCount: count ?? 0,
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!p) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const hasDebt = p.balance > 0;

  return (
    <ScrollView
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
      }
    >
      <Text style={s.title}>Profil</Text>

      <View style={s.card}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{p.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={s.name}>{p.name}</Text>
        <Text style={s.phone}>{p.phone}</Text>
        {(p.region || p.address) && (
          <Text style={s.address}>{[p.region, p.address].filter(Boolean).join(', ')}</Text>
        )}
      </View>

      <View style={[s.card, s.balanceCard, hasDebt ? s.debtBorder : s.okBorder]}>
        <Text style={s.balanceLabel}>{hasDebt ? 'Qarzdorlik' : 'Balans'}</Text>
        <Text style={[s.balanceValue, hasDebt ? { color: C.red } : { color: C.green }]}>
          {formatSum(Math.abs(p.balance))}
        </Text>
        <Text style={s.balanceHint}>
          {hasDebt
            ? "To'lov qilganingizda admin kiritadi va bu yerda kamayadi"
            : 'Sizda qarzdorlik yo`q'}
        </Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{p.ordersCount}</Text>
          <Text style={s.statLabel}>Buyurtmalar</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statValue}>{p.groupName ?? '—'}</Text>
          <Text style={s.statLabel}>Narx tarifi</Text>
        </View>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={() => supabase.auth.signOut()}>
        <Text style={s.logoutText}>Chiqish</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
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
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: { color: C.text, fontSize: 28, fontWeight: '800' },
  name: { color: C.text, fontSize: 18, fontWeight: '700' },
  phone: { color: C.muted, fontSize: 14, marginTop: 2 },
  address: { color: C.faint, fontSize: 13, marginTop: 4, textAlign: 'center' },
  balanceCard: { borderWidth: 1 },
  debtBorder: { borderColor: '#7f1d1d' },
  okBorder: { borderColor: '#14532d' },
  balanceLabel: { color: C.muted, fontSize: 13 },
  balanceValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  balanceHint: { color: C.faint, fontSize: 12, marginTop: 6, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { color: C.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 4 },
  logoutBtn: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: C.red,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutText: { color: C.red, fontWeight: '700' },
});
