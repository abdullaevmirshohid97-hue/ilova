// =============================================================
//  TAKRORLANADIGAN QISMLAR
//
//  Chip, karta, tugma, bo'sh holat — hamma ekranda bir xil ko'rinsin.
//  Har ekranda alohida yozilsa, biri 12, biri 14 piksel bo'lib qoladi
//  va ilova "yig'ma" ko'rinadi.
// =============================================================

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { O, useTema, type Ranglar } from '../lib/tema';

export function Chip({
  matn,
  tanlangan,
  bos,
  rang,
}: {
  matn: string;
  tanlangan: boolean;
  bos: () => void;
  rang?: string;
}) {
  const { C } = useTema();
  return (
    <TouchableOpacity
      onPress={bos}
      style={{
        backgroundColor: tanlangan ? (rang ?? C.faol) : C.karta,
        borderWidth: 1,
        borderColor: tanlangan ? (rang ?? C.faol) : C.chegara,
        borderRadius: 22,
        paddingHorizontal: 16,
        // Android va iOS talabi: tegish maydoni kamida 48 dp / 44 pt.
        // Avval 31 px edi va turkum tanlashda «tegmadi» bo'lardi —
        // bu esa kuniga o'nlab marta takrorlanadigan amal.
        minHeight: 44,
        justifyContent: 'center',
        marginRight: 8,
      }}
    >
      <Text
        style={{
          color: tanlangan ? (rang ? '#fff' : C.faolMatn) : C.matn2,
          fontSize: 13,
          fontWeight: tanlangan ? '700' : '500',
        }}
        numberOfLines={1}
      >
        {matn}
      </Text>
    </TouchableOpacity>
  );
}

export function Karta({ children, uslub }: { children: ReactNode; uslub?: StyleProp<ViewStyle> }) {
  const { C } = useTema();
  return (
    <View
      style={[
        {
          backgroundColor: C.karta,
          borderRadius: O.radius,
          borderWidth: 1,
          borderColor: C.chegara,
          padding: O.chekka,
        },
        uslub,
      ]}
    >
      {children}
    </View>
  );
}

export function Sarlavha({ matn, yon }: { matn: string; yon?: ReactNode }) {
  const { C } = useTema();
  return (
    <View style={s.sarlavhaQator}>
      <Text style={{ color: C.xira, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 }}>
        {matn.toUpperCase()}
      </Text>
      {yon}
    </View>
  );
}

export function BoshHolat({
  belgi,
  matn,
  izoh,
}: {
  belgi: string;
  matn: string;
  izoh?: string;
}) {
  const { C } = useTema();
  return (
    <View style={s.bosh}>
      <Text style={{ fontSize: 34, color: C.xira }}>{belgi}</Text>
      <Text style={{ color: C.matn2, fontSize: 16, fontWeight: '600', marginTop: 10 }}>{matn}</Text>
      {izoh ? (
        <Text style={{ color: C.xira, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
          {izoh}
        </Text>
      ) : null}
    </View>
  );
}

export function Tugma({
  matn,
  bos,
  rang,
  ikkilamchi,
  kutmoqda,
  uslub,
}: {
  matn: string;
  bos: () => void;
  rang?: string;
  ikkilamchi?: boolean;
  kutmoqda?: boolean;
  uslub?: StyleProp<ViewStyle>;
}) {
  const { C } = useTema();
  const asosiy = rang ?? C.faol;
  return (
    <TouchableOpacity
      onPress={bos}
      disabled={kutmoqda}
      style={[
        {
          backgroundColor: ikkilamchi ? 'transparent' : asosiy,
          borderWidth: ikkilamchi ? 1.5 : 0,
          borderColor: asosiy,
          borderRadius: O.radiusKichik,
          paddingVertical: 13,
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: kutmoqda ? 0.6 : 1,
        },
        uslub,
      ]}
    >
      {kutmoqda ? (
        <ActivityIndicator color={ikkilamchi ? asosiy : C.faolMatn} />
      ) : (
        <Text
          style={{
            color: ikkilamchi ? asosiy : rang ? '#fff' : C.faolMatn,
            fontSize: 15,
            fontWeight: '700',
          }}
        >
          {matn}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/** Gorizontal tanlagich: davr, filtr, tur */
export function Tanlagich<T extends string>({
  qiymat,
  variantlar,
  qoy,
}: {
  qiymat: T;
  variantlar: { kalit: T; matn: string }[];
  qoy: (k: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tanlagich}>
      {variantlar.map((v) => (
        <Chip key={v.kalit} matn={v.matn} tanlangan={v.kalit === qiymat} bos={() => qoy(v.kalit)} />
      ))}
    </ScrollView>
  );
}

/** Ro'yxat qatori: chapda nom va izoh, o'ngda qiymat */
export function Qator({
  nom,
  izoh,
  ong,
  ongIzoh,
  ongRang,
  bos,
  uzoqBos,
  sozilgan,
  belgi,
}: {
  nom: string;
  izoh?: string;
  ong?: string;
  ongIzoh?: string;
  ongRang?: string;
  bos?: () => void;
  uzoqBos?: () => void;
  sozilgan?: boolean;
  belgi?: ReactNode;
}) {
  const { C } = useTema();
  const ichki = (
    <>
      {belgi}
      <View style={{ flex: 1 }}>
        <Text
          style={[
            { color: C.matn, fontSize: 15, fontWeight: '600' },
            sozilgan && { textDecorationLine: 'line-through', opacity: 0.55 },
          ]}
          numberOfLines={1}
        >
          {nom}
        </Text>
        {izoh ? (
          <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {izoh}
          </Text>
        ) : null}
      </View>
      {ong ? (
        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
          <Text
            style={[
              { color: ongRang ?? C.matn, fontSize: 15, fontWeight: '700' },
              sozilgan && { textDecorationLine: 'line-through', opacity: 0.55 },
            ]}
          >
            {ong}
          </Text>
          {ongIzoh ? (
            <Text style={{ color: C.xira, fontSize: 11, marginTop: 3 }}>{ongIzoh}</Text>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const uslub = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: C.karta,
    paddingHorizontal: O.chekka,
    paddingVertical: 13,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: C.ajratgich,
    gap: 10,
  };

  if (!bos && !uzoqBos) return <View style={uslub}>{ichki}</View>;
  return (
    <TouchableOpacity style={uslub} onPress={bos} onLongPress={uzoqBos} delayLongPress={400}>
      {ichki}
    </TouchableOpacity>
  );
}

/** Pastdagi uch xonali yig'indi paneli — har ro'yxatda bir xil */
export function YigindiPaneli({
  chap,
  orta,
  ong,
}: {
  chap: { yorliq: string; qiymat: string; rang?: string };
  orta: { yorliq: string; qiymat: string; rang?: string };
  ong: { yorliq: string; qiymat: string; rang?: string };
}) {
  const { C } = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: C.karta,
        borderTopWidth: 1,
        borderTopColor: C.chegara,
        paddingVertical: 9,
      }}
    >
      {[chap, orta, ong].map((q, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: C.xira, fontSize: 11 }}>{q.yorliq}</Text>
          <Text
            style={{ color: q.rang ?? C.matn, fontSize: 14, fontWeight: '700', marginTop: 2 }}
            numberOfLines={1}
          >
            {q.qiymat}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Sana o'qlari: ‹ Sentabr › */
export function DavrOqlari({
  nom,
  oldin,
  keyin,
  keyinOchiq,
}: {
  nom: string;
  oldin: () => void;
  keyin: () => void;
  keyinOchiq: boolean;
}) {
  const { C } = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: C.karta,
        borderBottomWidth: 1,
        borderBottomColor: C.chegara,
        paddingHorizontal: 8,
        paddingVertical: 8,
      }}
    >
      <TouchableOpacity onPress={oldin} hitSlop={12} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ color: C.matn2, fontSize: 18, fontWeight: '700' }}>‹</Text>
      </TouchableOpacity>
      <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>{nom}</Text>
      <TouchableOpacity onPress={keyin} hitSlop={12} disabled={!keyinOchiq} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ color: keyinOchiq ? C.matn2 : C.chegara, fontSize: 18, fontWeight: '700' }}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

export function uslublar(C: Ranglar) {
  return StyleSheet.create({
    ekran: { flex: 1, backgroundColor: C.fon },
    boshliq: {
      backgroundColor: C.tun,
      paddingTop: 46,
      paddingBottom: 14,
      paddingHorizontal: O.chekka,
    },
    boshliqMatn: { color: C.tunMatn, fontSize: 17, fontWeight: '800' },
    boshliqIzoh: { color: C.tunXira, fontSize: 12, marginTop: 2 },
  });
}

const s = StyleSheet.create({
  sarlavhaQator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: O.chekka,
    marginTop: 18,
    marginBottom: 8,
  },
  bosh: { alignItems: 'center', paddingTop: 54, paddingHorizontal: 40 },
  tanlagich: { paddingHorizontal: O.chekka, paddingVertical: 10 },
});
