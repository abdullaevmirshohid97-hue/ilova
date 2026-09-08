import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const STORAGE_KEY = '@ilova/cart';

export type CartItem = {
  variantId: string;
  productName: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number; // so'mdagi narx — buyurtma shu bo'yicha yoziladi
  currency: string; // narx qaysi valyutada KIRITILGAN (manba)
  origPrice: number | null; // manba USD bo'lsa asl dollar summasi
  // Mijozga KO'RSATILADIGAN narx va valyuta. Ikkalasini ham baza
  // hisoblaydi (my_effective_prices) — ilova taxmin qilmaydi.
  dispPrice: number;
  dispCurrency: string;
  qty: number;
  image: string | null;
  maxQty: number; // joriy qoldiq — undan ko'p qo'shib bo'lmaydi
};

type CartCtx = {
  items: CartItem[];
  add: (item: CartItem) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  total: number; // so'mda
  dispTotal: number; // ko'rsatiladigan valyutada
  count: number;
  // Mijoz narxlarni qaysi valyutada ko'radi ('UZS' | 'USD').
  // mijoz_valyuta() RPC'dan: u kurs yo'qligini ham hisobga oladi —
  // customers.display_currency ni to'g'ridan-to'g'ri o'qish yetarli emas.
  displayCurrency: string;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState('UZS');
  const hydrated = useRef(false);

  // Ilova ochilganda saqlangan savatni tiklaymiz
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setItems(JSON.parse(raw));
      })
      .finally(() => {
        hydrated.current = true;
      });
    // Amaldagi valyuta — customers.display_currency emas, mijoz_valyuta().
    // Farqi: mijoz "USD" deb belgilangan bo'lsa ham menejerning kursi
    // yo'q bo'lsa dollarga o'girib bo'lmaydi va baza so'mga qaytaradi.
    // Ikkovi ajralib qolsa summa dollarda, yozuvi so'mda chiqardi.
    supabase
      .rpc('mijoz_valyuta')
      .then(({ data }) => {
        const q = Array.isArray(data) ? data[0] : data;
        if (q) setDisplayCurrency((q as any).valyuta ?? 'UZS');
      });
  }, []);

  // Har o'zgarishda saqlaymiz (birinchi tiklashdan keyin — bo'sh savat bilan ustidan yozib yubormaslik uchun)
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const api = useMemo<CartCtx>(() => {
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const dispTotal = items.reduce((s, i) => s + i.dispPrice * i.qty, 0);
    return {
      items,
      total,
      dispTotal,
      count: items.length,
      displayCurrency,
      add: (item) =>
        setItems((prev) => {
          const ex = prev.find((i) => i.variantId === item.variantId);
          if (ex) {
            return prev.map((i) =>
              i.variantId === item.variantId
                ? { ...i, qty: Math.min(i.qty + item.qty, i.maxQty) }
                : i
            );
          }
          return [...prev, item];
        }),
      setQty: (variantId, qty) =>
        setItems((prev) =>
          prev.map((i) =>
            i.variantId === variantId
              ? { ...i, qty: Math.max(1, Math.min(qty, i.maxQty)) }
              : i
          )
        ),
      remove: (variantId) =>
        setItems((prev) => prev.filter((i) => i.variantId !== variantId)),
      clear: () => setItems([]),
    };
  }, [items, displayCurrency]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart CartProvider ichida chaqirilishi kerak');
  return ctx;
}
