// ============================================================================
// KO'RSATISH UCHUN ASOSIY TARIF
//
// Panelning bir necha joyida "bitta narx" ko'rsatish kerak: mahsulotlar
// jadvalidagi narx ustuni, katalog hujjati, ombor qiymati hisoboti.
// Qaysi tarifning narxi ko'rsatilsin?
//
// Avval hamma joyda qat'iy `name === 'Standart'` yozilgan edi. Natijada
// tarifini boshqacha nomlagan biznesda (masalan yagona tarifi "vip")
// narx USTUNI BO'SH turardi — narx bazada bor, panel esa ko'rsatmasdi.
// Xuddi shunday katalogda ham "—" chiqardi.
//
// Xato ManagerPrices'da bir marta tuzatilgan edi, lekin qolgan uch joyga
// o'tkazilmagan. Shuning uchun endi mantiq shu yerda, bitta joyda.
//
// Tartib:
//   1. "Standart" nomli tarif — narxi bo'lsa
//   2. Mijozlar eng ko'p turgan tarif — narxi bo'lsa
//   3. Umuman narxi bor birinchi tarif
//
// Uchalasi ham topilmasa `undefined` — demak hech qayerda narx yo'q va
// ko'rsatadigan narsa ham yo'q.
// ============================================================================

export type Tarif = { id: string; name: string };

export function asosiyTarifId(
  guruhlar: Tarif[],
  /** Shu tarifda umuman narx bormi */
  narxBor: (guruhId: string) => boolean,
  /** Mijozlar ro'yxati — qaysi tarif ommaboproq ekanini bilish uchun */
  mijozlar: { price_group_id: string | null }[] = [],
): string | undefined {
  const std = guruhlar.find((g) => g.name.trim().toLowerCase() === 'standart')?.id;
  if (std && narxBor(std)) return std;

  const soni = new Map<string, number>();
  for (const m of mijozlar) {
    if (m.price_group_id) soni.set(m.price_group_id, (soni.get(m.price_group_id) ?? 0) + 1);
  }
  const ommabop = [...soni.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (ommabop && narxBor(ommabop)) return ommabop;

  return guruhlar.find((g) => narxBor(g.id))?.id;
}

/** Ustun sarlavhasi uchun: "Narx (vip)" — qaysi tarif ko'rsatilayotgani ayon bo'lsin */
export function tarifNomi(guruhlar: Tarif[], id: string | undefined): string {
  return guruhlar.find((g) => g.id === id)?.name ?? '—';
}
