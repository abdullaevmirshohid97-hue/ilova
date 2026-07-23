import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatSum, supabase } from '../lib/supabase';
import { C, DESIGN_ORDER_STATUS } from '../lib/theme';
import { useLanguage, TranslationKey } from '../lib/i18n';

type DesignOrder = {
  id: string;
  size: string | null;
  bottom_material: string | null;
  top_material: string | null;
  bag_material: string | null;
  rope_color: string | null;
  print_type: string | null;
  qty: number;
  unit_price: number;
  advance_amount: number;
  is_fully_paid: boolean;
  payment_due_date: string | null;
  ready_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

const PRINT_TYPE_LABEL: Record<string, TranslationKey> = {
  tesneniya: 'designPrintTesneniya',
  oddiy: 'designPrintOddiy',
};

export default function DesignOrdersScreen() {
  const { t, lang } = useLanguage();
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('design_orders')
      .select(
        `id, size, bottom_material, top_material, bag_material, rope_color,
         print_type, qty, unit_price, advance_amount, is_fully_paid,
         payment_due_date, ready_date, notes, status, created_at`
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setOrders(data as DesignOrder[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Admin ishlab chiqarish bosqichini o'zgartirsa — holat jonli yangilanadi
    const channel = supabase
      .channel('design-orders-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'design_orders' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function fmtDate(d: string | null): string | null {
    if (!d) return null;
    return new Date(d).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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
            <Text style={s.emptyIcon}>🎨</Text>
            <Text style={s.emptyText}>{t('designOrdersEmptyTitle')}</Text>
            <Text style={s.emptyHint}>{t('designOrdersEmptyHint')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const st = DESIGN_ORDER_STATUS[item.status];
          const statusLabel = st ? t(st.labelKey) : item.status;
          const total = item.qty * item.unit_price;
          const remaining = total - item.advance_amount;
          const materials = [
            item.size ? [t('designSize'), item.size] : null,
            item.bottom_material ? [t('designBottomMaterial'), item.bottom_material] : null,
            item.top_material ? [t('designTopMaterial'), item.top_material] : null,
            item.bag_material ? [t('designBagMaterial'), item.bag_material] : null,
            item.rope_color ? [t('designRopeColor'), item.rope_color] : null,
            item.print_type
              ? [t('designPrintType'), t(PRINT_TYPE_LABEL[item.print_type] ?? 'designPrintOddiy')]
              : null,
          ].filter(Boolean) as [string, string][];
          const readyDate = fmtDate(item.ready_date);
          const paymentDue = fmtDate(item.payment_due_date);

          return (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardIcon}>🎨</Text>
                <Text style={s.date}>
                  {new Date(item.created_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </Text>
                <View style={[s.badge, { backgroundColor: st?.bg ?? C.divider }]}>
                  <Text style={[s.badgeText, { color: st?.color ?? C.muted }]}>{statusLabel}</Text>
                </View>
              </View>

              {materials.map(([label, value]) => (
                <View key={label} style={s.row}>
                  <Text style={s.rowLabel}>{label}</Text>
                  <Text style={s.rowValue}>{value}</Text>
                </View>
              ))}

              <View style={s.row}>
                <Text style={s.rowLabel}>{t('designQty')}</Text>
                <Text style={s.rowValue}>
                  {item.qty.toLocaleString()} × {formatSum(item.unit_price)}
                </Text>
              </View>

              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{t('totalLabel')}</Text>
                <Text style={s.totalValue}>{formatSum(total)}</Text>
              </View>

              {item.advance_amount > 0 && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>{t('designAdvancePaid')}</Text>
                  <Text style={s.rowValue}>{formatSum(item.advance_amount)}</Text>
                </View>
              )}

              {item.is_fully_paid ? (
                <Text style={s.paidBadge}>{t('designFullyPaid')}</Text>
              ) : (
                remaining > 0 && (
                  <View style={s.row}>
                    <Text style={s.rowLabel}>{t('designRemaining')}</Text>
                    <Text style={[s.rowValue, { color: C.red, fontWeight: '800' }]}>
                      {formatSum(remaining)}
                    </Text>
                  </View>
                )
              )}

              {paymentDue && !item.is_fully_paid && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>{t('designPaymentDue')}</Text>
                  <Text style={s.rowValue}>{paymentDue}</Text>
                </View>
              )}

              {readyDate && (
                <View style={s.row}>
                  <Text style={s.rowLabel}>{t('designReadyDate')}</Text>
                  <Text style={s.rowValue}>{readyDate}</Text>
                </View>
              )}

              {item.notes && (
                <View style={s.notesBox}>
                  <Text style={s.notesLabel}>{t('designNotes')}</Text>
                  <Text style={s.notesText}>{item.notes}</Text>
                </View>
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
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIcon: { fontSize: 18, marginRight: 8 },
  date: { color: C.faint, fontSize: 12, flex: 1 },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  rowLabel: { color: C.muted, fontSize: 13, flex: 1, marginRight: 8 },
  rowValue: { color: C.text2, fontSize: 13, fontWeight: '600', textAlign: 'right' },
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
  paidBadge: {
    marginTop: 8,
    color: C.green,
    fontSize: 13,
    fontWeight: '700',
  },
  notesBox: {
    marginTop: 10,
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: 10,
  },
  notesLabel: { color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  notesText: { color: C.text2, fontSize: 13 },
});
