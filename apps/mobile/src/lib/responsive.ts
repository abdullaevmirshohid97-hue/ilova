import { useWindowDimensions } from 'react-native';

// Telefon/planshet/kompyuter uchun bitta umumiy chegara — App.tsx (sidebar),
// CatalogScreen va ProductSheet shu yerdan foydalanadi, mos kelmaslikka yo'l qo'ymaslik uchun.
export const WIDE_BREAKPOINT = 900;

export function useIsWide(breakpoint: number = WIDE_BREAKPOINT): boolean {
  const { width } = useWindowDimensions();
  return width >= breakpoint;
}
