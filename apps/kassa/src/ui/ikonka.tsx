// =============================================================
//  IKONKALAR — kutubxonasiz
//
//  `@expo/vector-icons` qo'shish oson edi, lekin u shrift fayli
//  bilan keladi va bundle'ni yuzlab KB o'stiradi. To'rtta ikonka
//  uchun bu qimmat — loyihada grafik kutubxonasi ham shu sababli
//  olinmagan (tema faylidagi izohga qarang).
//
//  Shrift belgisi (☰, ⌕, ⋮) ham yo'l edi, lekin qo'ng'iroq uchun
//  ishonchli belgi YO'Q: Unicode'da u faqat emoji bo'lib keladi va
//  Android'da rangli chiqib, qolgan monoxrom ikonkalardan ajralib
//  turardi. Shuning uchun hammasi bir xil usulda — oddiy View'lar
//  bilan — chiziladi.
//
//  Har biri `rang` va `olcham` oladi, ya'ni tungi rejimda ham
//  o'zi moslashadi.
// =============================================================

import { View } from 'react-native';

type Imkon = { rang: string; olcham?: number };

/** ☰ — yon panelni ochadi */
export function Menyu({ rang, olcham = 20 }: Imkon) {
  const en = olcham;
  const qalin = Math.max(2, Math.round(olcham / 10));
  return (
    <View style={{ width: en, height: en, justifyContent: 'center', gap: qalin + 2 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: en, height: qalin, backgroundColor: rang, borderRadius: qalin }} />
      ))}
    </View>
  );
}

/** ⌕ — qidiruv */
export function Lupa({ rang, olcham = 20 }: Imkon) {
  const d = Math.round(olcham * 0.68);
  const qalin = Math.max(2, Math.round(olcham / 10));
  const dast = Math.round(olcham * 0.34);
  return (
    <View style={{ width: olcham, height: olcham }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: d,
          height: d,
          borderRadius: d / 2,
          borderWidth: qalin,
          borderColor: rang,
        }}
      />
      {/* Dasta — 45 daraja burilgan chiziq. Aylananing pastki o'ng
          chetidan boshlanadi, aks holda u «uzilib» ko'rinardi. */}
      <View
        style={{
          position: 'absolute',
          top: d - qalin,
          left: d - qalin,
          width: dast,
          height: qalin,
          backgroundColor: rang,
          borderRadius: qalin,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** Qo'ng'iroq — bildirishnoma. `nuqta` — o'qilmagani bor belgisi */
export function Qongiroq({ rang, olcham = 20, nuqta, nuqtaRang }: Imkon & { nuqta?: boolean; nuqtaRang?: string }) {
  const qalin = Math.max(2, Math.round(olcham / 10));
  const gumbazEn = Math.round(olcham * 0.64);
  const gumbazBoy = Math.round(olcham * 0.56);
  const asosEn = Math.round(olcham * 0.86);
  const tilChap = Math.round(olcham * 0.5 - olcham * 0.08);
  return (
    <View style={{ width: olcham, height: olcham, alignItems: 'center' }}>
      {/* Gumbaz: tepasi yumaloq, pasti ochiq */}
      <View
        style={{
          width: gumbazEn,
          height: gumbazBoy,
          marginTop: Math.round(olcham * 0.1),
          borderWidth: qalin,
          borderBottomWidth: 0,
          borderColor: rang,
          borderTopLeftRadius: gumbazEn / 2,
          borderTopRightRadius: gumbazEn / 2,
        }}
      />
      {/* Asos — gumbazdan kengroq, qo'ng'iroq shaklini beradi */}
      <View style={{ width: asosEn, height: qalin, backgroundColor: rang, borderRadius: qalin }} />
      {/* Til */}
      <View
        style={{
          width: qalin * 2,
          height: qalin * 1.6,
          marginTop: qalin * 0.4,
          backgroundColor: rang,
          borderBottomLeftRadius: qalin,
          borderBottomRightRadius: qalin,
        }}
      />
      {nuqta && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: tilChap - Math.round(olcham * 0.34),
            width: Math.round(olcham * 0.34),
            height: Math.round(olcham * 0.34),
            borderRadius: olcham,
            backgroundColor: nuqtaRang ?? rang,
          }}
        />
      )}
    </View>
  );
}

/** ⋮ — qo'shimcha amallar */
export function UchNuqta({ rang, olcham = 20 }: Imkon) {
  const d = Math.max(3, Math.round(olcham / 6));
  return (
    <View style={{ width: olcham, height: olcham, alignItems: 'center', justifyContent: 'center', gap: d * 0.8 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: d, height: d, borderRadius: d, backgroundColor: rang }} />
      ))}
    </View>
  );
}

/** ‹ — orqaga */
export function Orqaga({ rang, olcham = 20 }: Imkon) {
  const q = Math.max(2, Math.round(olcham / 10));
  const uz = Math.round(olcham * 0.42);
  return (
    <View style={{ width: olcham, height: olcham, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: uz,
          height: uz,
          borderLeftWidth: q,
          borderBottomWidth: q,
          borderColor: rang,
          transform: [{ rotate: '45deg' }],
          marginLeft: q,
        }}
      />
    </View>
  );
}
