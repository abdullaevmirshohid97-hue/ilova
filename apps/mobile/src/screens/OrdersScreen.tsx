import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatSum, supabase } from '../lib/supabase';
import { C, ORDER_STATUS } from '../lib/theme';
import { useLanguage } from '../lib/i18n';

type OrderItem = {
  qty: number;
  unit_price: number;
  name: string;
  size: string | null;
  color: string | null;
};

type Order = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  items: OrderItem[];
};

export default function OrdersScreen() {
  const { t, lang } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `id, order_number, status, total, created_at,
         order_items ( qty, unit_price,
           product_variants ( size, color, products ( name ) )
         )`
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setOrders(
        data.map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total: o.total,
          created_at: o.created_at,
          items: (o.order_items ?? []).map((it: any) => ({
            qty: it.qty,
            unit_price: it.unit_price,
            name: it.product_variants?.products?.name ?? '—',
            size: it.product_variants?.size ?? null,
            color: it.product_variants?.color ?? null,
          })),
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Admin tasdiqlasa — holat jonli yangilanadi
    const channel = supabase
      .channel('orders-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  function cancelOrder(order: Order) {
    Alert.alert(
      t('cancelOrderTitle'),
      t('cancelOrderBody', { num: order.order_number }),
      [
        { text: t('cancelOrderNo'), style: 'cancel' },
        {
          text: t('cancelOrderYes'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id });
            if (error) {
              Alert.alert(t('error'), t('cancelOrderFailed'));
            }
            load();
          },
        },
      ]
    );
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
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
            <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={s.center}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyText}>{t('ordersEmptyTitle')}</Text>
            <Text style={s.emptyHint}>{t('ordersEmptyHint')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st = ORDER_STATUS[item.status];
          const statusLabel = st ? t(st.labelKey) : item.status;
          return (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.orderNo}>№{item.order_number}</Text>
                <View style={[s.badge, { backgroundColor: st?.bg ?? C.divider }]}>
                  <Text style={[s.badgeText, { color: st?.color ?? C.muted }]}>{statusLabel}</Text>
                </View>
              </View>
              <Text style={s.date}>
                {new Date(item.created_at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
              {item.items.map((it, idx) => (
                <View key={idx} style={s.itemRow}>
                  <Text style={s.itemName} numberOfLines={1}>
                    {it.name}
                    {[it.size, it.color].filter(Boolean).length > 0
                      ? ` (${[it.size, it.color].filter(Boolean).join(', ')})`
                      : ''}
                  </Text>
                  <Text style={s.itemQty}>
                    {it.qty.toLocaleString()} × {formatSum(it.unit_price)}
                  </Text>
                </View>
              ))}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{t('totalLabel')}</Text>
                <Text style={s.totalValue}>{formatSum(item.total)}</Text>
              </View>
              {item.status === 'new' && (
                <TouchableOpacity style={s.cancelBtn} onPress={() => cancelOrder(item)}>
                  <Text style={s.cancelBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  title: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: C.text, fontSize: 20, fontWeight: '700', marginTop: 12 },
  emptyHint: { color: C.faint, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNo: { color: C.text, fontSize: 17, fontWeight: '800' },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  date: { color: C.faint, fontSize: 12, marginTop: 2, marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  itemName: { color: C.text2, fontSize: 14, flex: 1, marginRight: 8 },
  itemQty: { color: C.muted, fontSize: 13 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    marginTop: 4,
  },
  totalLabel: { color: C.muted, fontSize: 14 },
  totalValue: { color: C.green, fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.red,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: { color: C.red, fontWeight: '700', fontSize: 13 },
});
