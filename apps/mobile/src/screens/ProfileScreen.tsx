import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatSum, phoneToEmail, supabase } from '../lib/supabase';
import { useLanguage } from '../lib/i18n';
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

// ---------- Parolni o'zgartirish ----------
function ChangePasswordCard({ phone }: { phone: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    if (newPass.length < 6) return setError(t('passwordTooShort'));
    if (newPass !== confirm) return setError(t('passwordMismatch'));

    setSaving(true);
    try {
      // Eski parolni tekshiramiz (xavfsizlik uchun) — qayta kirish orqali
      const { error: reErr } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password: oldPass,
      });
      if (reErr) throw new Error(t('oldPasswordWrong'));

      const { error: upErr } = await supabase.auth.updateUser({ password: newPass });
      if (upErr) throw upErr;

      setDone(true);
      setOldPass('');
      setNewPass('');
      setConfirm('');
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 1500);
    } catch (e: any) {
      setError(e.message ?? t('error'));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <TouchableOpacity style={s.linkRow} onPress={() => setOpen(true)}>
        <Text style={s.linkRowText}>{t('changePasswordLink')}</Text>
        <Text style={s.linkRowArrow}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.card}>
      <Text style={s.pwTitle}>{t('changePasswordTitle')}</Text>
      <TextInput
        style={s.pwInput}
        value={oldPass}
        onChangeText={setOldPass}
        placeholder={t('oldPasswordPlaceholder')}
        placeholderTextColor={C.faint}
        secureTextEntry
      />
      <TextInput
        style={s.pwInput}
        value={newPass}
        onChangeText={setNewPass}
        placeholder={t('newPasswordPlaceholder')}
        placeholderTextColor={C.faint}
        secureTextEntry
      />
      <TextInput
        style={s.pwInput}
        value={confirm}
        onChangeText={setConfirm}
        placeholder={t('confirmPasswordPlaceholder')}
        placeholderTextColor={C.faint}
        secureTextEntry
      />
      {error && <Text style={s.pwError}>{error}</Text>}
      {done && <Text style={s.pwSuccess}>{t('passwordChanged')}</Text>}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <TouchableOpacity style={s.pwCancelBtn} onPress={() => setOpen(false)}>
          <Text style={s.pwCancelText}>{t('cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.pwSaveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.pwSaveText}>{t('save')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { t } = useLanguage();
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
        <Text style={s.balanceLabel}>{hasDebt ? t('profileDebtLabel') : t('profileBalanceLabel')}</Text>
        <Text style={[s.balanceValue, hasDebt ? { color: C.red } : { color: C.green }]}>
          {formatSum(Math.abs(p.balance))}
        </Text>
        <Text style={s.balanceHint}>
          {hasDebt ? t('profileDebtHint') : t('profileNoDebtHint')}
        </Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statValue}>{p.ordersCount}</Text>
          <Text style={s.statLabel}>{t('profileOrdersLabel')}</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statValue}>{p.groupName ?? '—'}</Text>
          <Text style={s.statLabel}>{t('profileTariffLabel')}</Text>
        </View>
      </View>

      <ChangePasswordCard phone={p.phone} />

      <TouchableOpacity style={s.logoutBtn} onPress={() => supabase.auth.signOut()}>
        <Text style={s.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
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
    borderWidth: 1,
    borderColor: C.border,
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
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  name: { color: C.text, fontSize: 18, fontWeight: '700' },
  phone: { color: C.muted, fontSize: 14, marginTop: 2 },
  address: { color: C.faint, fontSize: 13, marginTop: 4, textAlign: 'center' },
  balanceCard: { borderWidth: 1 },
  debtBorder: { borderColor: '#F8C6CC', backgroundColor: C.redSoft },
  okBorder: { borderColor: '#BCE9CE', backgroundColor: C.greenSoft },
  balanceLabel: { color: C.muted, fontSize: 13 },
  balanceValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  balanceHint: { color: C.faint, fontSize: 12, marginTop: 6, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { color: C.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 4 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  linkRowText: { color: C.text, fontSize: 14, fontWeight: '600', flex: 1 },
  linkRowArrow: { color: C.faint, fontSize: 18 },
  pwTitle: { color: C.text, fontSize: 15, fontWeight: '700', alignSelf: 'flex-start', marginBottom: 10 },
  pwInput: {
    width: '100%',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10,
  },
  pwError: { color: C.red, fontSize: 12, alignSelf: 'flex-start', marginTop: 2 },
  pwSuccess: { color: C.green, fontSize: 13, fontWeight: '700', marginTop: 2 },
  pwCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pwCancelText: { color: C.muted, fontWeight: '700' },
  pwSaveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pwSaveText: { color: '#fff', fontWeight: '700' },
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
