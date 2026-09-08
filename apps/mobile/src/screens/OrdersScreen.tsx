import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDateTime, formatNarx, formatQty, imageUrl, supabase } from '../lib/supabase';
import { C, ORDER_STATUS } from '../lib/theme';
import { useLanguage } from '../lib/i18n';
import { sorov, xabar } from '../lib/xabar';

// Faktura yuklab olish faqat "qabul qilingan" bosqichdan boshlab (yangi/bekor
// qilingan buyurtmada narx/miqdor hali yakunlanmagan hisoblanadi)
const INVOICE_STATUSES = ['confirmed', 'picking', 'done'];

type OrderItem = {
  qty: number;
  unit_price: number; // so'mda — pul hisobi shu bo'yicha
  currency: string;
  orig_price: number | null;
  // Buyurtma berilgan paytda mijozga KO'RSATILGAN narx va valyuta.
  // Muzlatilgan: kurs keyin o'zgarsa ham eski buyurtma o'zgarmaydi.
  disp_price: number;
  disp_discount: number;
  disp_currency: string;
  name: string;
  size: string | null;
  color: string | null;
  image: string | null;
};

type Order = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  disp_total: number;
  disp_currency: string;
  created_at: string;
  items: OrderItem[];
};

export default function OrdersScreen() {
  const { t, lang } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null);
  const [seller, setSeller] = useState<{
    orgName: string;
    customerName: string;
    customerPhone: string;
    managerName: string | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('organizations').select('name').maybeSingle(),
      supabase.from('customers').select('name, phone').maybeSingle(),
      supabase.rpc('my_manager_name'),
    ]).then(([{ data: org }, { data: cust }, { data: managerName }]) => {
      setSeller({
        orgName: (org as any)?.name ?? 'YUKCHIBOLLA',
        customerName: (cust as any)?.name ?? '',
        customerPhone: (cust as any)?.phone ?? '',
        managerName: (managerName as string) ?? null,
      });
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `id, order_number, status, total, disp_total, disp_currency, created_at,
         order_items ( qty, unit_price, currency, orig_price, disp_price, disp_discount, disp_currency,
           product_variants ( size, color, products ( name,
             product_images ( storage_path, thumb_path, is_primary, sort_order )
           ) )
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
          disp_total: o.disp_total != null ? Number(o.disp_total) : Number(o.total),
          disp_currency: o.disp_currency ?? 'UZS',
          created_at: o.created_at,
          items: (o.order_items ?? []).map((it: any) => {
            const imgs = (it.product_variants?.products?.product_images ?? []).sort(
              (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
            );
            return {
              qty: it.qty,
              unit_price: it.unit_price,
              currency: it.currency ?? 'UZS',
              orig_price: it.orig_price != null ? Number(it.orig_price) : null,
              disp_price: it.disp_price != null ? Number(it.disp_price) : Number(it.unit_price),
              disp_discount: it.disp_discount != null ? Number(it.disp_discount) : 0,
              disp_currency: it.disp_currency ?? 'UZS',
              name: it.product_variants?.products?.name ?? '—',
              size: it.product_variants?.size ?? null,
              color: it.product_variants?.color ?? null,
              image: imgs[0] ? imageUrl(imgs[0].thumb_path || imgs[0].storage_path) : null,
            };
          }),
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

  // Buyurtma AYNAN mijoz ko'rgan valyutada ko'rsatiladi. Summa
  // buyurtma berilganda muzlatilgan (orders.disp_total) — kurs keyin
  // o'zgarsa ham eski buyurtma o'zgarmaydi.
  //
  // Avval bu yerda uchta shart bor edi (mijoz USD + har qator USD +
  // asl summa bor). Bitta qator baza narxida bo'lsa butun buyurtma
  // so'mga tushib ketardi. Endi o'girishni baza qiladi.
  function fmtQator(it: OrderItem): string {
    return formatNarx(it.disp_price - it.disp_discount, it.disp_currency);
  }
  function fmtQatorJami(it: OrderItem): string {
    return formatNarx((it.disp_price - it.disp_discount) * it.qty, it.disp_currency);
  }

  function cancelOrder(order: Order) {
    sorov(
      t('cancelOrderTitle'),
      t('cancelOrderBody', { num: order.order_number }),
      t('cancelOrderYes'),
      async () => {
        const { error } = await supabase.rpc('cancel_order', { p_order_id: order.id });
        if (error) xabar(t('error'), t('cancelOrderFailed'));
        load();
      },
      true
    );
  }

  function buildInvoiceHtml(order: Order): string {
    const dateStr = formatDateTime(order.created_at);
    const rows = order.items
      .map((it) => {
        const unit = fmtQator(it);
        const lineTotal = fmtQatorJami(it);
        return `<tr>
          <td>${it.image ? `<img src="${it.image}" style="width:40px;height:40px;object-fit:cover;border-radius:4px" />` : ''}</td>
          <td>${it.name}</td>
          <td>${[it.size, it.color].filter(Boolean).join(' / ') || '—'}</td>
          <td style="text-align:right">${formatQty(it.qty)}</td>
          <td style="text-align:right">${unit}</td>
          <td style="text-align:right"><b>${lineTotal}</b></td>
        </tr>`;
      })
      .join('');
    return `
      <html><head><meta charset="utf-8" />
      <style>
        body { font-family: sans-serif; padding: 24px; color: #14151A; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { color: #444; font-size: 14px; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; font-size: 13px; }
        th { background: #F2F3F7; }
        .total { margin-top: 20px; font-size: 16px; text-align: right; }
      </style></head><body>
      <h1>${seller?.orgName ?? 'YUKCHIBOLLA'}</h1>
      <div class="meta">${t('invoiceTitle')} — ${t('invoiceOrderLabel')} №${order.order_number}</div>
      <div class="meta">${t('invoiceDateLabel')}: ${dateStr}</div>
      <div class="meta">${t('invoiceCustomerLabel')}: ${seller?.customerName ?? ''} · ${seller?.customerPhone ?? ''}</div>
      ${seller?.managerName ? `<div class="meta">${t('invoiceManagerLabel')}: ${seller.managerName}</div>` : ''}
      <table>
        <thead><tr>
          <th>${t('invoiceItemImage')}</th>
          <th>${t('invoiceItemName')}</th>
          <th>${t('invoiceItemVariant')}</th>
          <th style="text-align:right">${t('invoiceItemQty')}</th>
          <th style="text-align:right">${t('invoiceItemPrice')}</th>
          <th style="text-align:right">${t('invoiceItemTotal')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="total">${t('invoiceGrandTotal')}: <b>${formatNarx(order.disp_total, order.disp_currency)}</b></p>
      </body></html>
    `;
  }

  // Fakturani serverda PDF qilib, mijozning Telegram chatiga yuboradi.
  // Telegram Mini App ichida yagona ishlaydigan yo'l — WebView'da na
  // window.open, na fayl yuklab olish ishlaydi.
  async function sendInvoiceToTelegram(order: Order): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('telegram-notify', {
        body: { order_id: order.id },
      });
      const xato = (data as any)?.error ? ((data as any).message ?? (data as any).error) : error?.message;
      if (xato) {
        xabar(t('invoiceShareTitle'), xato);
        return false;
      }
      xabar(t('invoiceShareTitle'), t('invoiceSentTelegram'));
      return true;
    } catch (e: any) {
      xabar(t('error'), e?.message ?? t('invoiceFailed'));
      return false;
    }
  }

  async function downloadInvoice(order: Order) {
    setInvoiceBusy(order.id);
    try {
      const html = buildInvoiceHtml(order);
      if (Platform.OS === 'web') {
        // expo-print/expo-sharing brauzerda faylga yoza olmaydi, shuning
        // uchun odatda yangi oynada ochib print dialogini chiqaramiz.
        // AMMO Telegram Mini App (WebView) window.open'ni bloklaydi va
        // null qaytaradi — o'sha holatda fakturani bot orqali yuboramiz.
        // Bu popup-blocker yoqilgan oddiy brauzerni ham qutqaradi.
        let win: Window | null = null;
        try {
          win = window.open('', '_blank');
        } catch {
          win = null;
        }
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          win.print();
        } else {
          await sendInvoiceToTelegram(order);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('invoiceShareTitle') });
        }
      }
    } catch {
      xabar(t('error'), t('invoiceFailed'));
    } finally {
      setInvoiceBusy(null);
    }
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
              <Text style={s.date}>{formatDateTime(item.created_at)}</Text>
              {item.items.map((it, idx) => {
                return (
                  <View key={idx} style={s.itemRow}>
                    <Text style={s.itemName} numberOfLines={1}>
                      {it.name}
                      {[it.size, it.color].filter(Boolean).length > 0
                        ? ` (${[it.size, it.color].filter(Boolean).join(', ')})`
                        : ''}
                    </Text>
                    <Text style={s.itemQty}>
                      {formatQty(it.qty)} × {fmtQator(it)}
                    </Text>
                  </View>
                );
              })}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{t('totalLabel')}</Text>
                <Text style={s.totalValue}>{formatNarx(item.disp_total, item.disp_currency)}</Text>
              </View>
              {item.status === 'new' && (
                <TouchableOpacity style={s.cancelBtn} onPress={() => cancelOrder(item)}>
                  <Text style={s.cancelBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
              )}
              {INVOICE_STATUSES.includes(item.status) && (
                <TouchableOpacity
                  style={[s.invoiceBtn, invoiceBusy === item.id && { opacity: 0.6 }]}
                  onPress={() => downloadInvoice(item)}
                  disabled={invoiceBusy === item.id}
                >
                  {invoiceBusy === item.id ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Text style={s.invoiceBtnText}>{t('downloadInvoice')}</Text>
                  )}
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
  invoiceBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  invoiceBtnText: { color: C.primary, fontWeight: '700', fontSize: 13 },
});
