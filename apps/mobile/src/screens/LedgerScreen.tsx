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
import { C, LEDGER_KIND } from '../lib/theme';
import { useLanguage } from '../lib/i18n';

type Entry = {
  id: number;
  amount: number;
  kind: string;
  note: string | null;
  created_at: string;
  order_number: number | null;
};

export default function LedgerScreen() {
  const { t, lang } = useLanguage();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: bal }] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('id, amount, kind, note, created_at, orders ( order_number )')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('customer_balances').select('balance').maybeSingle(),
    ]);
    if (rows) {
      setEntries(
        rows.map((r: any) => ({
          id: r.id,
          amount: Number(r.amount),
          kind: r.kind,
          note: r.note,
          created_at: r.created_at,
          order_number: r.orders?.order_number ?? null,
        }))
      );
    }
    setBalance(Number((bal as any)?.balance ?? 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const isDebt = balance > 0;
  const isCredit = balance < 0;

  return (
    <View style={s.container}>
      {/* Balans kartasi */}
      <View style={[s.balanceCard, isDebt ? s.debtBg : isCredit ? s.creditBg : null]}>
        <Text style={s.balanceLabel}>
          {isDebt ? t('ledgerDebtLabel') : isCredit ? t('ledgerCreditLabel') : t('ledgerNeutralLabel')}
        </Text>
        <Text style={[s.balanceValue, isDebt && { color: C.red }, isCredit && { color: C.green }]}>
          {formatSum(Math.abs(balance))}
        </Text>
        <Text style={s.balanceHint}>
          {isDebt ? t('ledgerDebtHint') : isCredit ? t('ledgerCreditHint') : t('ledgerNeutralHint')}
        </Text>
      </View>

      <Text style={s.sectionTitle}>{t('ledgerHistoryTitle')}</Text>

      <FlatList
        data={entries}
        keyExtractor={(e) => String(e.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={s.empty}>{t('ledgerEmpty')}</Text>
        }
        renderItem={({ item }) => {
          const meta = LEDGER_KIND[item.kind];
          const label = meta ? t(meta.labelKey) : item.kind;
          const positive = item.amount > 0; // + qarz oshdi, - kamaydi
          return (
            <View style={s.row}>
              <View style={s.iconWrap}>
                <Text style={s.icon}>{meta?.icon ?? '•'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>
                  {label}
                  {item.order_number != null ? ` №${item.order_number}` : ''}
                </Text>
                <Text style={s.rowDate}>
                  {new Date(item.created_at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
                {item.note && <Text style={s.rowNote}>{item.note}</Text>}
              </View>
              <Text style={[s.amount, positive ? { color: C.red } : { color: C.green }]}>
                {positive ? '+' : '−'}{formatSum(Math.abs(item.amount))}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  balanceCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    margin: 16,
    padding: 20,
    alignItems: 'center',
  },
  debtBg: { backgroundColor: C.redSoft, borderColor: '#F8C6CC' },
  creditBg: { backgroundColor: C.greenSoft, borderColor: '#BCE9CE' },
  balanceLabel: { color: C.muted, fontSize: 13, fontWeight: '600' },
  balanceValue: { color: C.text, fontSize: 30, fontWeight: '800', marginTop: 4 },
  balanceHint: { color: C.muted, fontSize: 12, marginTop: 6, textAlign: 'center' },
  sectionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '800',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  empty: { color: C.muted, textAlign: 'center', marginTop: 30 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 18 },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  rowDate: { color: C.faint, fontSize: 11, marginTop: 2 },
  rowNote: { color: C.muted, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800' },
});
