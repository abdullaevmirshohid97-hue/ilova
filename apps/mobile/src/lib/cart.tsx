import { createContext, useContext, useMemo, useState, ReactNode } from 'react';

export type CartItem = {
  variantId: string;
  productName: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
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
  total: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const api = useMemo<CartCtx>(() => {
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    return {
      items,
      total,
      count: items.length,
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
  }, [items]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart CartProvider ichida chaqirilishi kerak');
  return ctx;
}
