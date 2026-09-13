// =============================================================
//  CREDIT DEBIT — ilovaning kirish nuqtasi va qobig'i
//
//  Uch holat bor va uchalasi ham HAQIQIY:
//    1. Sessiya yo'q             → kirish / ro'yxatdan o'tish
//    2. Sessiya bor, profil yo'q → biznes nomi so'raladi
//       (ro'yxatdan o'tish ikki qadam, ikkinchisiga yetmay qolgan
//        bo'lishi mumkin — ilova yopildi, internet uzildi)
//    3. Hammasi joyida           → bo'limlar
//
//  Navigatsiya kutubxonasi ATAYLAB yo'q: besh bo'lim va bir nechta
//  oyna uchun react-navigation 300 KB olib keladi va Expo web
//  eksportini sekinlashtiradi. Bo'lim — oddiy holat.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import type { Yozuv } from '@ilova/kassa-yadro';
import { menKim, type Men } from './src/lib/baza';
import { HolatProvider, useHolat } from './src/lib/holat';
import { supabase, xatoMatn } from './src/lib/supabase';
import {
  O,
  QORONGI,
  TemaKontekst,
  YORUG,
  useTema,
  type TemaRejimi,
} from './src/lib/tema';
import KirishEkrani from './src/ekran/KirishEkrani';
import BiznesEkrani from './src/ekran/BiznesEkrani';
import BoshEkran from './src/ekran/BoshEkran';
import YozuvlarEkrani from './src/ekran/YozuvlarEkrani';
import KontaktlarEkrani from './src/ekran/KontaktlarEkrani';
import KalendarEkrani from './src/ekran/KalendarEkrani';
import YanaEkrani from './src/ekran/YanaEkrani';
import YozuvOynasi, { type OynaRejimi } from './src/ekran/YozuvOynasi';
import SinxBelgi from './src/ui/SinxBelgi';

const TEMA_KALIT = 'kassa.tema';

export default function App() {
  const tizimTemasi = useColorScheme();
  const [rejim, setRejim] = useState<TemaRejimi>('tizim');
  const [sessiya, setSessiya] = useState<Session | null>(null);
  const [tekshirildi, setTekshirildi] = useState(false);
  const [men, setMen] = useState<Men | null>(null);
  const [menYuklandi, setMenYuklandi] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  // Tema tanlovi qurilmada qoladi — har ochilganda qayta so'ralmasin
  useEffect(() => {
    AsyncStorage.getItem(TEMA_KALIT).then((x) => {
      if (x === 'yorug' || x === 'qorongi' || x === 'tizim') setRejim(x);
    });
  }, []);

  const temaQoy = useCallback((r: TemaRejimi) => {
    setRejim(r);
    AsyncStorage.setItem(TEMA_KALIT, r).catch(() => {
      /* saqlanmasa ham ilova ishlayveradi */
    });
  }, []);

  const qorongi = rejim === 'qorongi' || (rejim === 'tizim' && tizimTemasi === 'dark');
  const tema = useMemo(
    () => ({ C: qorongi ? QORONGI : YORUG, rejim, qorongi, qoy: temaQoy }),
    [qorongi, rejim, temaQoy],
  );

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

  const C = tema.C;

  let ichki: React.ReactNode;
  if (!tekshirildi) ichki = <Kutish />;
  else if (!sessiya) ichki = <KirishEkrani />;
  else if (!menYuklandi) ichki = <Kutish />;
  else if (xato)
    ichki = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tun, padding: 24 }}>
        <Text style={{ color: C.tunMatn, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>{xato}</Text>
        <TouchableOpacity
          style={{ backgroundColor: C.tunMatn, borderRadius: O.radiusKichik, paddingHorizontal: 24, paddingVertical: 12, marginTop: 20 }}
          onPress={() => {
            setMenYuklandi(false);
            menniYukla();
          }}
        >
          <Text style={{ color: C.tun, fontSize: 15, fontWeight: '700' }}>Qayta urinish</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={{ color: C.tunXira, fontSize: 13, marginTop: 18 }}>Chiqish</Text>
        </TouchableOpacity>
      </View>
    );
  else if (!men)
    ichki = (
      <BiznesEkrani
        tayyor={() => {
          setMenYuklandi(false);
          menniYukla();
        }}
      />
    );
  else
    ichki = (
      <HolatProvider men={men}>
        <Qobiq />
      </HolatProvider>
    );

  return (
    <TemaKontekst.Provider value={tema}>
      <StatusBar style="light" />
      {ichki}
    </TemaKontekst.Provider>
  );
}

function Kutish() {
  const { C } = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tun }}>
      <ActivityIndicator size="large" color={C.tunMatn} />
    </View>
  );
}

type Bolim = 'bosh' | 'yozuvlar' | 'kontaktlar' | 'kalendar' | 'yana';

const BOLIMLAR: { kalit: Bolim; belgi: string; matn: string }[] = [
  { kalit: 'bosh', belgi: '⌂', matn: 'Bosh' },
  { kalit: 'yozuvlar', belgi: '≡', matn: 'Yozuvlar' },
  { kalit: 'kontaktlar', belgi: '☺', matn: 'Kontakt' },
  { kalit: 'kalendar', belgi: '▦', matn: 'Kalendar' },
  { kalit: 'yana', belgi: '⋯', matn: 'Yana' },
];

function Qobiq() {
  const { C } = useTema();
  const { yangila, yuklanmoqda, xato } = useHolat();
  const [bolim, setBolim] = useState<Bolim>('bosh');
  const [oyna, setOyna] = useState<{
    rejim: OynaRejimi;
    tahrir?: Yozuv | null;
    klient?: string | null;
  } | null>(null);
  const [tanlov, setTanlov] = useState(false);

  if (yuklanmoqda) return <Kutish />;

  return (
    <View style={{ flex: 1, backgroundColor: C.fon }}>
      <SinxBelgi />

      {xato && (
        <View style={{ backgroundColor: C.chiqimYumshoq, padding: 10 }}>
          <Text style={{ color: C.chiqim, fontSize: 13, textAlign: 'center' }}>{xato}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {bolim === 'bosh' && (
          <BoshEkran
            ochQoshish={(turi) => setOyna({ rejim: turi })}
            ochYozuvlar={() => setBolim('yozuvlar')}
            ochKontaktlar={() => setBolim('kontaktlar')}
          />
        )}
        {bolim === 'yozuvlar' && <YozuvlarEkrani tahrirla={(y) => setOyna({ rejim: y.turi, tahrir: y })} />}
        {bolim === 'kontaktlar' && (
          <KontaktlarEkrani qoshish={(turi, klientId) => setOyna({ rejim: turi, klient: klientId })} />
        )}
        {bolim === 'kalendar' && <KalendarEkrani tahrirla={(y) => setOyna({ rejim: y.turi, tahrir: y })} />}
        {bolim === 'yana' && <YanaEkrani kochirma={() => setOyna({ rejim: 'kochirma' })} />}
      </View>

      {/* Suzuvchi + tugmasi. Bosh ekranda ikkita katta tugma bor,
          shuning uchun u yerda takrorlanmaydi. */}
      {bolim !== 'bosh' && (
        <TouchableOpacity
          onPress={() => setTanlov(true)}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 78,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: C.faol,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
          }}
        >
          <Text style={{ color: C.faolMatn, fontSize: 28, fontWeight: '300', marginTop: -3 }}>+</Text>
        </TouchableOpacity>
      )}

      {/* Pastki bo'limlar */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: C.karta,
          borderTopWidth: 1,
          borderTopColor: C.chegara,
          paddingBottom: 6,
          paddingTop: 6,
        }}
      >
        {BOLIMLAR.map((b) => {
          const faolmi = b.kalit === bolim;
          return (
            <TouchableOpacity
              key={b.kalit}
              onPress={() => setBolim(b.kalit)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}
            >
              <Text style={{ fontSize: 18, color: faolmi ? C.matn : C.xira }}>{b.belgi}</Text>
              <Text
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: faolmi ? C.matn : C.xira,
                  fontWeight: faolmi ? '700' : '500',
                }}
              >
                {b.matn}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Nima qo'shamiz — uch yo'l */}
      {tanlov && (
        <Modal transparent animationType="fade" onRequestClose={() => setTanlov(false)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.45)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setTanlov(false)}
          >
            <View
              style={{
                backgroundColor: C.karta,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 12,
                paddingBottom: 28,
                width: '100%',
                maxWidth: 520,
                alignSelf: 'center',
              }}
            >
              {(
                [
                  { r: 'kirim' as const, m: '↑  Kirim', rang: C.kirim },
                  { r: 'chiqim' as const, m: '↓  Chiqim', rang: C.chiqim },
                  { r: 'kochirma' as const, m: '⇄  Hisoblararo o‘tkazma', rang: C.matn2 },
                ]
              ).map((v) => (
                <TouchableOpacity
                  key={v.r}
                  onPress={() => {
                    setTanlov(false);
                    setOyna({ rejim: v.r });
                  }}
                  style={{
                    paddingVertical: 15,
                    paddingHorizontal: 16,
                    borderRadius: O.radiusKichik,
                    backgroundColor: C.fon,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: v.rang, fontSize: 16, fontWeight: '700' }}>{v.m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {oyna && (
        <YozuvOynasi
          rejim={oyna.rejim}
          tahrir={oyna.tahrir ?? null}
          boshKlient={oyna.klient ?? null}
          yopish={() => setOyna(null)}
          saqlandi={yangila}
        />
      )}
    </View>
  );
}
