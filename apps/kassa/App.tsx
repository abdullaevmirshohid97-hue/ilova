// =============================================================
//  CREDIT DEBIT — ilovaning kirish nuqtasi
//
//  Uch holat bor va uchalasi ham HAQIQIY:
//    1. Sessiya yo'q          → kirish / ro'yxatdan o'tish
//    2. Sessiya bor, profil yo'q → biznes nomi so'raladi
//       (ro'yxatdan o'tish ikki qadam, ikkinchisiga yetmay qolgan
//        bo'lishi mumkin — ilova yopildi, internet uzildi)
//    3. Hammasi joyida        → bosh ekran
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { menKim, type Men } from './src/lib/baza';
import { supabase, xatoMatn } from './src/lib/supabase';
import { C, O } from './src/lib/tema';
import KirishEkrani from './src/ekran/KirishEkrani';
import BiznesEkrani from './src/ekran/BiznesEkrani';
import BoshEkran from './src/ekran/BoshEkran';

export default function App() {
  const [sessiya, setSessiya] = useState<Session | null>(null);
  const [tekshirildi, setTekshirildi] = useState(false);
  const [men, setMen] = useState<Men | null>(null);
  const [menYuklandi, setMenYuklandi] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessiya(data.session);
      setTekshirildi(true);
    });
    const { data: obuna } = supabase.auth.onAuthStateChange((_hodisa, s) => {
      setSessiya(s);
      setMen(null);
      setMenYuklandi(false);
    });
    return () => obuna.subscription.unsubscribe();
  }, []);

  const menniYukla = useCallback(async () => {
    if (!sessiya) return;
    setXato(null);
    try {
      setMen(await menKim());
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setMenYuklandi(true);
    }
  }, [sessiya]);

  useEffect(() => {
    if (sessiya && !menYuklandi) menniYukla();
  }, [sessiya, menYuklandi, menniYukla]);

  if (!tekshirildi) return <Kutish />;

  if (!sessiya) {
    return (
      <>
        <StatusBar style="light" />
        <KirishEkrani />
      </>
    );
  }

  if (!menYuklandi) return <Kutish />;

  // Tarmoq uzilgan bo'lsa — sababni ko'rsatamiz. Avvalgi ilovalarda
  // bu holat "abadiy aylanadigan g'ildirak" bo'lib qolardi.
  if (xato) {
    return (
      <View style={s.xatoEkran}>
        <StatusBar style="light" />
        <Text style={s.xatoMatn}>{xato}</Text>
        <TouchableOpacity
          style={s.qayta}
          onPress={() => {
            setMenYuklandi(false);
            menniYukla();
          }}
        >
          <Text style={s.qaytaMatn}>Qayta urinish</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={s.chiqish}>Chiqish</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!men) {
    return (
      <>
        <StatusBar style="light" />
        <BiznesEkrani
          tayyor={() => {
            setMenYuklandi(false);
            menniYukla();
          }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <BoshEkran men={men} />
    </>
  );
}

function Kutish() {
  return (
    <View style={s.kutish}>
      <StatusBar style="light" />
      <ActivityIndicator size="large" color="#F2F4F7" />
    </View>
  );
}

const s = StyleSheet.create({
  kutish: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tun },
  xatoEkran: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tun, padding: 24 },
  xatoMatn: { color: '#F2F4F7', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  qayta: {
    backgroundColor: '#F2F4F7', borderRadius: O.radiusKichik,
    paddingHorizontal: 24, paddingVertical: 12, marginTop: 20,
  },
  qaytaMatn: { color: C.tun, fontSize: 15, fontWeight: '700' },
  chiqish: { color: '#7C8CA1', fontSize: 13, marginTop: 18 },
});
