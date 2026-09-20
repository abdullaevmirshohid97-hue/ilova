// =============================================================
//  YUQORI QATOR — hamma ekranning tepasida
//
//  Chapda ☰ (yon panel), o'ngda ⌕ qidiruv, qo'ng'iroq va ⋮.
//
//  Pastki bo'limlar qatori OLIB TASHLANGANI uchun (20.09 qarori)
//  navigatsiya faqat shu yerdan boradi: ☰ tugmasi yo'qolsa odam
//  ilovada qamalib qolardi. Shuning uchun u HAR DOIM bor va
//  ixtiyoriy qilinmagan.
//
//  Ichki sahifada (masalan «Hisoblar») ☰ o'rniga ‹ turadi: o'sha
//  joyda ikki xil amal bo'lsa odam qaysi biri chiqishini bilmasdi.
// =============================================================

import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { O, useTema } from '../lib/tema';
import { Lupa, Menyu, Orqaga, Qongiroq, UchNuqta } from './ikonka';

export function YuqoriQator({
  sarlavha,
  izoh,
  sarlavhaBos,
  menyu,
  orqaga,
  qidiruv,
  bildirishnoma,
  oqilmagan,
  uchNuqta,
  ong,
}: {
  sarlavha: string;
  izoh?: string;
  /** Sarlavha bosilganda — bosh sahifada biznes ro'yxatini ochadi */
  sarlavhaBos?: () => void;
  /** ☰ bosilganda. `orqaga` berilgan bo'lsa ishlatilmaydi. */
  menyu?: () => void;
  /** ‹ bosilganda — ichki sahifalarda */
  orqaga?: () => void;
  qidiruv?: () => void;
  bildirishnoma?: () => void;
  /** Qo'ng'iroq ustidagi qizil nuqta: kechikkan qarz bormi */
  oqilmagan?: boolean;
  uchNuqta?: () => void;
  /** Qo'shimcha element (kamdan-kam) */
  ong?: ReactNode;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: C.tun,
        // Tizim paneli (soat, batareya) ostida qolmasin. Statik
        // 46 px yetmaydi: qirqimli ekranlarda sarlavha soat bilan
        // ustma-ust tushardi.
        paddingTop: chekka.top + 8,
        paddingBottom: 10,
        paddingHorizontal: O.chekka - 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: C.ajratgich,
      }}
    >
      <TouchableOpacity
        onPress={orqaga ?? menyu}
        hitSlop={10}
        style={{ padding: 8 }}
        accessibilityLabel={orqaga ? 'Orqaga' : 'Menyu'}
      >
        {orqaga ? <Orqaga rang={C.tunMatn} /> : <Menyu rang={C.tunMatn} />}
      </TouchableOpacity>

      {/* Sarlavha bosiladigan bo‘lsa, bosish mumkinligi
          KO‘RINISHI kerak — shuning uchun yonida › turadi.
          Usiz odam bu yerni bosish xayoliga ham kelmasdi. */}
      <TouchableOpacity
        disabled={!sarlavhaBos}
        onPress={sarlavhaBos}
        style={{ flex: 1, marginLeft: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: C.tunMatn, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
            {sarlavha}
          </Text>
          {izoh ? (
            <Text style={{ color: C.tunXira, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              {izoh}
            </Text>
          ) : null}
        </View>
        {sarlavhaBos && <Text style={{ color: C.tunXira, fontSize: 16 }}>›</Text>}
      </TouchableOpacity>

      {ong}
      {qidiruv && (
        <TouchableOpacity onPress={qidiruv} hitSlop={8} style={{ padding: 8 }} accessibilityLabel="Qidiruv">
          <Lupa rang={C.tunMatn} />
        </TouchableOpacity>
      )}
      {bildirishnoma && (
        <TouchableOpacity
          onPress={bildirishnoma}
          hitSlop={8}
          style={{ padding: 8 }}
          accessibilityLabel="Bildirishnoma"
        >
          <Qongiroq rang={C.tunMatn} nuqta={oqilmagan} nuqtaRang={C.chiqim} />
        </TouchableOpacity>
      )}
      {uchNuqta && (
        <TouchableOpacity onPress={uchNuqta} hitSlop={8} style={{ padding: 8 }} accessibilityLabel="Yana">
          <UchNuqta rang={C.tunMatn} />
        </TouchableOpacity>
      )}
    </View>
  );
}
