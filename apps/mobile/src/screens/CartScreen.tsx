import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatSum, supabase } from '../lib/supabase';
import { useCart } from '../lib/cart';
import { useLanguage } from '../lib/i18n';
import { C } from '../lib/theme';

export default function CartScreen({ onOrdered }: { onOrdered: () => void }) {
  const cart = useCart();
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [comment, setComment] = useState('');

  async function placeOrder() {
    if (cart.items.length === 0) return;
    setSending(true);
    const { error } = await supabase.rpc('create_order', {
      p_items: cart.items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
      p_comment: comment.trim() || null,
    });
    setSending(false);

    if (error) {
      const msg = error.message.includes('QOLDIQ_YETARLI_EMAS')
        ? t('stockErrorMsg')
        : t('orderFailedMsg');
      Alert.alert(t('error'), msg);
      return;
    }

    cart.clear();
    setComment('');
    Alert.alert(
      t('orderSuccessTitle'),
      t('orderSuccessBody'),
      [{ text: t('goToOrders'), onPress: onOrdered }]
    );
  }

  if (cart.items.length === 0) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.emptyIcon}>🛒</Text>
        <Text style={s.emptyText}>{t('cartEmptyTitle')}</Text>
        <Text style={s.emptyHint}>{t('cartEmptyHint')}</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={cart.items}
        keyExtractor={(i) => i.variantId}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 160 }}
        renderItem={({ item }) => (
          <View style={s.row}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={s.thumb} />
            ) : (
              <View style={[s.thumb, s.thumbPh]}>
                <Text style={s.thumbLetter}>{item.productName.slice(0, 1)}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.name}>{item.productName}</Text>
              <Text style={s.variant}>
                {[item.size, item.color].filter(Boolean).join(' · ') || item.sku}
              </Text>
              <Text style={s.price}>
                {formatSum(item.price)} × {item.qty.toLocaleString()} ={' '}
                {formatSum(item.price * item.qty)}
              </Text>
            </View>
            <View style={s.controls}>
              <TextInput
                style={s.qtyInput}
                value={String(item.qty)}
                onChangeText={(txt) => {
                  const n = parseInt(txt.replace(/\D/g, ''), 10);
                  if (n) cart.setQty(item.variantId, n);
                }}
                keyboardType="number-pad"
              />
              <TouchableOpacity onPress={() => cart.remove(item.variantId)}>
                <Text style={s.removeText}>{t('removeItem')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <View style={s.footer}>
        <TextInput
          style={s.commentInput}
          value={comment}
          onChangeText={setComment}
          placeholder={t('commentPlaceholder')}
          placeholderTextColor={C.faint}
          multiline
        />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{t('totalLabel')}</Text>
          <Text style={s.totalValue}>{formatSum(cart.total)}</Text>
        </View>
        <TouchableOpacity
          style={[s.orderBtn, sending && { opacity: 0.6 }]}
          onPress={placeOrder}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.orderBtnText}>{t('placeOrder')}</Text>
          )}
        </TouchableOpacity>
        <Text style={s.reserveHint}>{t('reserveHint')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 12 },
  emptyHint: { color: C.muted, marginTop: 4 },
  row: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  thumb: { width: 60, height: 60, borderRadius: 10 },
  thumbPh: { backgroundColor: C.primarySoft, justifyContent: 'center', alignItems: 'center' },
  thumbLetter: { color: C.primary, fontSize: 24, fontWeight: '800' },
  name: { color: C.text, fontSize: 15, fontWeight: '700' },
  variant: { color: C.muted, fontSize: 13, marginTop: 1 },
  price: { color: C.text2, fontSize: 13, marginTop: 3, fontWeight: '700' },
  controls: { alignItems: 'flex-end', gap: 6 },
  qtyInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    color: C.text,
    width: 80,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 15,
    textAlign: 'center',
  },
  removeText: { color: C.red, fontSize: 12, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
    padding: 16,
    paddingBottom: 28,
  },
  commentInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 12,
    maxHeight: 60,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  totalLabel: { color: C.muted, fontSize: 16 },
  totalValue: { color: C.text, fontSize: 20, fontWeight: '800' },
  orderBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  orderBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  reserveHint: { color: C.faint, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
