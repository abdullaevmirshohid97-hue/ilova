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
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  BackHandler,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import type { BitimNima, BitimYonalish, Klient, Yozuv } from '@ilova/kassa-yadro';
import { muddatiOtgan } from '@ilova/kassa-yadro';
import { menKim, type Men } from './src/lib/baza';
import { HolatProvider, useHolat } from './src/lib/holat';
import { supabase, xatoMatn } from './src/lib/supabase';
import { joriyTilniQoy, TilKontekst, tr, type Til } from './src/lib/til';
import {
  O,
  QORONGI,
  SHIFO,
  SHIFO_TUN,
  TemaKontekst,
  YORUG,
  useTema,
  type TemaRejimi,
} from './src/lib/tema';
import KirishEkrani from './src/ekran/KirishEkrani';
import BiznesEkrani from './src/ekran/BiznesEkrani';
import BoshEkran from './src/ekran/BoshEkran';
import YozuvlarEkrani from './src/ekran/YozuvlarEkrani';
import Hisoblar from './src/ekran/YanaHisoblar';
import Turkumlar from './src/ekran/YanaTurkumlar';
import Hisobot from './src/ekran/YanaHisobot';
import Sozlama from './src/ekran/YanaSozlama';
import AiUlanish from './src/ekran/AiUlanish';
import AiModel from './src/ekran/AiModel';
import KalendarEkrani from './src/ekran/KalendarEkrani';
import KunYakuni from './src/ekran/KunYakuni';
import BiznesRoyxati from './src/ekran/BiznesRoyxati';
import MijozOynasi from './src/ekran/MijozOynasi';
import BitimlarEkrani from './src/ekran/BitimlarEkrani';
import ValyutaSozlama from './src/ekran/ValyutaSozlama';
import YozuvOynasi, { type OynaRejimi } from './src/ekran/YozuvOynasi';
import BitimOynasi from './src/ekran/BitimOynasi';
import TolovOynasi from './src/ekran/TolovOynasi';
import SinxBelgi from './src/ui/SinxBelgi';
import { YuqoriQator } from './src/ui/YuqoriQator';
import { YonPanel, type PanelBolim } from './src/ui/YonPanel';
import { AmallarMenyusi, BildirishnomaOyna } from './src/ui/YuqoriOynalar';
import XatoQalqoni from './src/ui/XatoQalqoni';
import { xatolarniTut } from './src/lib/xatolar';

const TEMA_KALIT = 'kassa.tema';
const TIL_KALIT = 'kassa.til';

export default function App() {
  const tizimTemasi = useColorScheme();
  const [rejim, setRejim] = useState<TemaRejimi>('tizim');
  const [til, setTil] = useState<Til>('uz');
  const [sessiya, setSessiya] = useState<Session | null>(null);
  const [tekshirildi, setTekshirildi] = useState(false);
  const [men, setMen] = useState<Men | null>(null);
  const [menYuklandi, setMenYuklandi] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  // Tutilmagan xatolar ilova ochilishida BIR MARTA ulanadi.
  // Busiz telefondagi nosozlik hech qayerga yetib bormasdi: odam
  // «ishlamayapti» deydi, biz esa nima bo'lganini bilmaymiz.
  useEffect(() => {
    xatolarniTut();
  }, []);

  // Tema tanlovi qurilmada qoladi — har ochilganda qayta so'ralmasin
  useEffect(() => {
    AsyncStorage.getItem(TEMA_KALIT).then((x) => {
      if (x === 'yorug' || x === 'qorongi' || x === 'tizim' || x === 'shifo') setRejim(x);
    });
  }, []);

  // Til ham qurilmada qoladi. `joriyTilniQoy` — komponentdan
  // tashqaridagi kod uchun (sana formatlagich, hisobot).
  useEffect(() => {
    AsyncStorage.getItem(TIL_KALIT).then((x) => {
      if (x === 'uz' || x === 'ru') {
        joriyTilniQoy(x);
        setTil(x);
      }
    });
  }, []);

  const tilQoy = useCallback((x: Til) => {
    joriyTilniQoy(x);
    setTil(x);
    AsyncStorage.setItem(TIL_KALIT, x).catch(() => {
      /* saqlanmasa ham ilova ishlayveradi */
    });
  }, []);

  const tilHolati = useMemo(() => ({ til, qoy: tilQoy }), [til, tilQoy]);

  const temaQoy = useCallback((r: TemaRejimi) => {
    setRejim(r);
    AsyncStorage.setItem(TEMA_KALIT, r).catch(() => {
      /* saqlanmasa ham ilova ishlayveradi */
    });
  }, []);

  // «shifo» ham tungi rejimga BO‘YSUNADI: odam kechqurun
  // ilovani ochganda mavzu o‘zgargani uchun ko‘zi qamashmasin.
  const qorongi =
    rejim === 'qorongi' ||
    ((rejim === 'tizim' || rejim === 'shifo') && tizimTemasi === 'dark');
  const shifo = rejim === 'shifo';
  const tema = useMemo(
    () => ({
      C: shifo ? (qorongi ? SHIFO_TUN : SHIFO) : qorongi ? QORONGI : YORUG,
      rejim,
      qorongi,
      qoy: temaQoy,
    }),
    [shifo, qorongi, rejim, temaQoy],
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
          <Text style={{ color: C.tun, fontSize: 15, fontWeight: '700' }}>{tr('Qayta urinish')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={{ color: C.tunXira, fontSize: 13, marginTop: 18 }}>{tr('Chiqish')}</Text>
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
      // `key` MUHIM: biznes almashganda butun daraxt qaytadan
      // quriladi. Usiz ekranda avvalgi biznesning ro‘yxatlari
      // turib qolardi — ombor tozalangan bo‘lsa ham, React
      // eski holatni saqlab qolardi.
      <HolatProvider key={men.org_id} men={men}>
        <Qobiq
          qaytaYukla={() => {
            setMen(null);
            setMenYuklandi(false);
          }}
        />
      </HolatProvider>
    );

  return (
    // SafeAreaProvider eng tashqarida: Android‘da ilova tizim
    // tugmalari OSTIGA ham chiziladi (edge-to-edge) va pastki
    // bo‘limlar o‘sha panel tagida qolib ketadi.
    <SafeAreaProvider>
    <TilKontekst.Provider value={tilHolati}>
    <TemaKontekst.Provider value={tema}>
      {/* Oq temada tizim paneli belgilari QORA bo‘lishi kerak:
          avval doim "light" edi va oq sarlavhada soat ham,
          batareya ham ko‘rinmay qolardi. */}
      <StatusBar style={qorongi ? 'light' : 'dark'} />
      {/* Qalqon TEMADAN ICHKARIDA: yiqilgan ekran ham tungi
          rejimda to‘g‘ri rangda chiqsin */}
      <XatoQalqoni>{ichki}</XatoQalqoni>
    </TemaKontekst.Provider>
    </TilKontekst.Provider>
    </SafeAreaProvider>
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

// Bo‘lim ro‘yxati endi YON PANELDA (src/ui/YonPanel.tsx).
// Pastki qator 20.09 da olib tashlandi — shuning uchun bu yerda
// faqat tur va sarlavhalar qoldi.
type Bolim = PanelBolim;

// `matn` TARJIMA EMAS, kalit: modul bir marta o‘qiladi, til esa
// keyinroq yuklanadi. Tarjima chizishda qilinadi.
const SARLAVHA: Record<Exclude<Bolim, 'yakun'>, string> = {
  bosh: 'Clary',
  yozuvlar: 'Operatsiyalar',
  hisoblar: 'Hisoblar',
  turkumlar: 'Turkumlar',
  hisobot: 'Hisobot',
  kalendar: 'Kalendar',
  aimodel: 'AI modeli',
  ai: 'AI ulanish',
  valyuta: 'Valyuta va kurs',
  sozlama: 'Sozlamalar',
};

// Bosh sahifadan boshqasi — ichki sahifa: u yerda ☰ o‘rniga ‹
// turadi va orqaga qaytaradi. Aks holda bir tugmada ikki amal
// bo‘lib, odam qaysi biri chiqishini bilmasdi.
const ICHKI = (b: Bolim) => b !== 'bosh';

function Qobiq({ qaytaYukla }: { qaytaYukla: () => void }) {
  const { C } = useTema();
  const { men, yangila, yuklanmoqda, xato, bitimlar, tolovlar, klientlar } = useHolat();
  // Pastdagi tizim paneli balandligi: Samsung‘larda 3 ta tugma,
  // boshqalarida ishora chizig‘i — ikkalasi ham joy egallaydi.
  const chekka = useSafeAreaInsets();
  const [bolim, setBolim] = useState<Bolim>('bosh');
  const [oyna, setOyna] = useState<{
    rejim: OynaRejimi;
    tahrir?: Yozuv | null;
    namuna?: Yozuv | null;
    klient?: string | null;
  } | null>(null);
  const [tanlov, setTanlov] = useState(false);
  // Hamkor kartochkasidan ochilsa, u oldindan tanlangan bo'ladi
  const [tanlovKlient, setTanlovKlient] = useState<string | null>(null);
  // Oldi-berdi oynalari: bitim (tovar/qarz) va to‘lov (pul)
  const [bitimOyna, setBitimOyna] = useState<{
    yonalish: BitimYonalish;
    nima: BitimNima;
    klient?: string | null;
  } | null>(null);
  const [tolovOyna, setTolovOyna] = useState<{
    yonalish: BitimYonalish;
    klient?: string | null;
    bitim?: string | null;
  } | null>(null);
  const [yonPanel, setYonPanel] = useState(false);
  const [biznesOyna, setBiznesOyna] = useState(false);
  const [bitimlarOyna, setBitimlarOyna] = useState(false);
  // `undefined` — oyna yopiq, `null` — yangi mijoz,
  // obyekt — tahrirlash. Uchta holatni bitta o‘zgaruvchida
  // saqlash ikkita bayroqdan sodda va ular bir-biriga zid
  // bo‘lib qolishi mumkin emas.
  const [mijozOyna, setMijozOyna] = useState<Klient | null | undefined>(undefined);
  // Yuqoridagi lupa shu maydonni ochadi
  const [qidiruvOchiq, setQidiruvOchiq] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [bildirishnoma, setBildirishnoma] = useState(false);
  const [amallar, setAmallar] = useState(false);
  const [yakunOynasi, setYakunOynasi] = useState(false);

  // Kechikkan qarzlar — qo‘ng‘iroq ustidagi qizil nuqta shunga
  // tayanadi. Push-bildirishnoma yo‘q (qaror 20.09): telefon
  // jiringlashi bilan odam ilovani o‘chirib qo‘yadi.
  const kechikkanlar = useMemo(
    () => muddatiOtgan(bitimlar, tolovlar),
    [bitimlar, tolovlar],
  );

  /**
   * Android «orqaga» tugmasi.
   *
   * Busiz ilova HAR SAFAR yopilardi: foydalanuvchi «Yozuvlar»
   * bo'limida turib orqaga bossa, ilovadan chiqib ketardi va buni
   * buzuqlik deb qabul qilardi.
   *
   * Tartib: tanlov oynasi -> oldi-berdi oynalari -> yon panel ->
   * bo'lim -> bosh sahifa -> ilovadan chiqish (false qaytarsak
   * tizim yopadi).
   *
   * Modallar bu yerda YO'Q: React Native ularni `onRequestClose`
   * orqali o'zi yopadi.
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const obuna = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tanlov) {
        setTanlov(false);
        return true;
      }
      if (bitimOyna) {
        setBitimOyna(null);
        return true;
      }
      if (tolovOyna) {
        setTolovOyna(null);
        return true;
      }
      if (biznesOyna) {
        setBiznesOyna(false);
        return true;
      }
      if (qidiruvOchiq) {
        setQidiruvOchiq(false);
        setQidiruv('');
        return true;
      }
      if (yonPanel) {
        setYonPanel(false);
        return true;
      }
      if (bolim !== 'bosh') {
        setBolim('bosh');
        return true;
      }
      return false;
    });
    return () => obuna.remove();
  }, [bolim, yonPanel, biznesOyna, qidiruvOchiq, tanlov, bitimOyna, tolovOyna]);

  if (yuklanmoqda) return <Kutish />;

  return (
    // KENG EKRAN: planshet va brauzerda kontent butun enni egallab,
    // yozuvlar ro'yxati o'qib bo'lmas darajada cho'zilib ketardi.
    // Shuning uchun hamma narsa markazdagi 640 px ustunda turadi —
    // telefonda hech narsa o'zgarmaydi.
    <View style={{ flex: 1, backgroundColor: C.fon, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 640 }}>
      {/* Yuqori qator — HAMMA bo‘limda bir xil. Pastki qator
          olib tashlangani uchun ☰ yo‘qolsa odam ilovada qamalib
          qolardi, shuning uchun u ixtiyoriy emas. */}
      <YuqoriQator
        sarlavha={bolim === 'bosh' ? men.biznes : tr(SARLAVHA[bolim as Exclude<Bolim, 'yakun'>])}
        izoh={bolim === 'bosh' ? tr('Oldi-berdi daftari') : undefined}
        sarlavhaBos={bolim === 'bosh' ? () => setBiznesOyna(true) : undefined}
        menyu={() => setYonPanel(true)}
        orqaga={ICHKI(bolim) ? () => setBolim('bosh') : undefined}
        qidiruv={() => {
          if (bolim === 'bosh') setQidiruvOchiq((x) => !x);
          else setBolim('yozuvlar');
        }}
        bildirishnoma={() => setBildirishnoma(true)}
        oqilmagan={kechikkanlar.length > 0}
        uchNuqta={() => setAmallar(true)}
      />

      {/* Qidiruv — lupa bosilganda ochiladi. Doim ko‘rinib
          tursa, bo‘sh ekranda ham joy egallardi. */}
      {qidiruvOchiq && bolim === 'bosh' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: O.chekka,
            paddingVertical: 10,
            backgroundColor: C.karta,
            borderBottomWidth: 1,
            borderBottomColor: C.ajratgich,
          }}
        >
          <TextInput
            value={qidiruv}
            onChangeText={setQidiruv}
            autoFocus
            placeholder={tr('Mijoz, telefon yoki kategoriya')}
            placeholderTextColor={C.xira}
            style={{ flex: 1, fontSize: 15, color: C.matn, paddingVertical: 4 }}
          />
          <TouchableOpacity
            onPress={() => {
              setQidiruvOchiq(false);
              setQidiruv('');
            }}
            hitSlop={10}
          >
            <Text style={{ color: C.xira, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sinx belgisi va xato YUQORI QATORDAN KEYIN turadi.
          Avval ular tepada edi va tizim paneli (soat, batareya)
          ostida qolib ketardi: yuqori qator o'z ustki chekkasini
          o'zi hisoblaydi, bu ikkisi esa hisoblamaydi. */}
      <SinxBelgi />

      {xato && (
        <View style={{ backgroundColor: C.chiqimYumshoq, padding: 10 }}>
          <Text style={{ color: C.chiqim, fontSize: 13, textAlign: 'center' }}>{xato}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {bolim === 'bosh' && (
          <BoshEkran
            qidiruv={qidiruv}
            ochMijoz={(k) => setMijozOyna(k ?? null)}
            ochBitimlar={() => setBitimlarOyna(true)}
            ochOperatsiya={(klientId) => {
              setTanlovKlient(klientId);
              setTanlov(true);
            }}
            ochTolov={(klientId) => setTolovOyna({ yonalish: 'oldim', klient: klientId })}
          />
        )}
        {bolim === 'yozuvlar' && (
          <YozuvlarEkrani ichki tahrirla={(y) => setOyna({ rejim: y.turi, tahrir: y })} />
        )}
        {/* «Hamkorlar» bo‘limi OLIB TASHLANDI: bosh ekran endi
            aynan shu ro‘yxat. Ikkita bir xil ekran bir-biridan
            uzoqlashib ketardi. `KontaktlarEkrani` fayli qoldi —
            hamkor kartochkasi (`KontaktOynasi`) va qatorlar shu
            yerda va bosh ekran ularni ishlatadi. */}
        {bolim === 'hisoblar' && <Hisoblar kochirma={() => setOyna({ rejim: 'kochirma' })} />}
        {bolim === 'turkumlar' && <Turkumlar />}
        {bolim === 'hisobot' && <Hisobot />}
        {bolim === 'kalendar' && (
          <KalendarEkrani ichki tahrirla={(y) => setOyna({ rejim: y.turi, tahrir: y })} />
        )}
        {bolim === 'aimodel' && <AiModel />}
        {bolim === 'ai' && <AiUlanish />}
        {bolim === 'valyuta' && <ValyutaSozlama />}
        {bolim === 'sozlama' && <Sozlama />}
      </View>

      {/* Suzuvchi «+» tugmasi OLIB TASHLANDI (21.09 qarori).
          Endi operatsiya hamkor kartochkasidan qo‘shiladi: bosh
          sahifada mijozni tanlash → kirim/chiqim. Bu ilovaning
          o‘z modeliga mos — har bitim hamkor nomi bo‘yicha
          yuritiladi, ya’ni hamkorsiz operatsiya baribir yo‘q. */}

      {/* Pastki bo‘limlar qatori OLIB TASHLANDI (20.09 qarori).
          Navigatsiya yon paneldan boradi — ekran balandroq,
          lekin har bo‘limga ikki tegish kerak: ☰ → bo‘lim. */}
      </View>

      {/* Nima qildingiz? — olti aniq javob.

          «Credit / Debit» emas, «Oldim / Berdim»: do'kondor uchun
          birinchisi atama, ikkinchisi — o‘zi kun bo‘yi aytadigan
          so‘z. Pastdagi xira qator esa hamkorsiz kirim-chiqim
          (ijara, benzin) — eski oqim shu yerga tushdi. */}
      {tanlov && (
        <Modal transparent animationType="fade" onRequestClose={() => {
          setTanlov(false);
          setTanlovKlient(null);
        }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.45)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => {
              setTanlov(false);
              setTanlovKlient(null);
            }}
          >
            <View
              style={{
                backgroundColor: C.karta,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 12,
                paddingBottom: 20 + chekka.bottom,
                width: '100%',
                maxWidth: 520,
                alignSelf: 'center',
              }}
            >
              <Text style={{ color: C.xira, fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingBottom: 8 }}>
                {tr('Nima qildingiz?')}
              </Text>

              {(
                [
                  { y: 'oldim' as const, n: 'tovar' as const, belgi: '▣', m: tr('Tovar oldim') },
                  { y: 'berdim' as const, n: 'tovar' as const, belgi: '▣', m: tr('Tovar berdim') },
                  { y: 'oldim' as const, n: 'qarz' as const, belgi: '●', m: tr('Qarz oldim') },
                  { y: 'berdim' as const, n: 'qarz' as const, belgi: '●', m: tr('Qarz berdim') },
                ]
              ).map((v) => (
                <TouchableOpacity
                  key={v.y + v.n}
                  onPress={() => {
                    setTanlov(false);
                    setBitimOyna({ yonalish: v.y, nima: v.n, klient: tanlovKlient });
                    setTanlovKlient(null);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 52,
                    paddingHorizontal: 16,
                    borderRadius: O.radiusKichik,
                    backgroundColor: C.fon,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: v.y === 'berdim' ? C.kirim : C.chiqim, fontSize: 15 }}>
                    {v.belgi}
                  </Text>
                  <Text style={{ color: C.matn, fontSize: 16, fontWeight: '700' }}>{v.m}</Text>
                </TouchableOpacity>
              ))}

              {(
                [
                  { y: 'oldim' as const, m: tr('Pul oldim'), rang: C.kirim },
                  { y: 'berdim' as const, m: tr('Pul berdim'), rang: C.chiqim },
                ]
              ).map((v) => (
                <TouchableOpacity
                  key={v.y}
                  onPress={() => {
                    setTanlov(false);
                    setTolovOyna({ yonalish: v.y, klient: tanlovKlient });
                    setTanlovKlient(null);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 52,
                    paddingHorizontal: 16,
                    borderRadius: O.radiusKichik,
                    backgroundColor: C.fon,
                    marginTop: 8,
                  }}
                >
                  <Text style={{ color: v.rang, fontSize: 15 }}>▬</Text>
                  <Text style={{ color: C.matn, fontSize: 16, fontWeight: '700' }}>{v.m}</Text>
                </TouchableOpacity>
              ))}

              {/* Hamkorsiz kirim-chiqim — ikkinchi darajada */}
              <View style={{ borderTopWidth: 1, borderTopColor: C.ajratgich, marginTop: 12, paddingTop: 6 }}>
                {(
                  [
                    { r: 'kirim' as const, m: tr('Kassa kirimi'), rang: C.kirim },
                    { r: 'chiqim' as const, m: tr('Kassa chiqimi'), rang: C.chiqim },
                    { r: 'kochirma' as const, m: tr('Hisoblararo o‘tkazma'), rang: C.matn2 },
                  ]
                ).map((v) => (
                  <TouchableOpacity
                    key={v.r}
                    onPress={() => {
                      setTanlov(false);
                      setOyna({ rejim: v.r });
                    }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
                  >
                    <Text style={{ color: C.matn2, fontSize: 14 }}>{v.m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {bitimOyna && (
        <BitimOynasi
          yonalish={bitimOyna.yonalish}
          nima={bitimOyna.nima}
          boshKlient={bitimOyna.klient ?? null}
          yopish={() => setBitimOyna(null)}
          saqlandi={yangila}
        />
      )}

      {tolovOyna && (
        <TolovOynasi
          yonalish={tolovOyna.yonalish}
          boshKlient={tolovOyna.klient ?? null}
          boshBitim={tolovOyna.bitim ?? null}
          yopish={() => setTolovOyna(null)}
          saqlandi={yangila}
        />
      )}
      {biznesOyna && (
        <Modal animationType="slide" onRequestClose={() => setBiznesOyna(false)}>
          <BiznesRoyxati yopish={() => setBiznesOyna(false)} almashdi={qaytaYukla} />
        </Modal>
      )}

      {mijozOyna !== undefined && (
        <MijozOynasi
          tahrir={mijozOyna}
          yopish={() => setMijozOyna(undefined)}
          saqlandi={yangila}
        />
      )}

      {bitimlarOyna && <BitimlarEkrani yopish={() => setBitimlarOyna(false)} />}

      <YonPanel
        ochiq={yonPanel}
        joriy={bolim}
        biznes={men.biznes}
        yop={() => setYonPanel(false)}
        tanla={(b) => {
          setYonPanel(false);
          // «Kun yakuni» bo‘lim emas, oyna: uni tanlash joriy
          // ekrandan olib ketmasligi kerak.
          if (b === 'yakun') setYakunOynasi(true);
          else setBolim(b);
        }}
      />

      <BildirishnomaOyna
        ochiq={bildirishnoma}
        yop={() => setBildirishnoma(false)}
        kechikkanlar={kechikkanlar}
        tolovlar={tolovlar}
        klientlar={klientlar}
        // Bildirishnomadan mijozga o‘tish: bosh ekran endi
        // aynan mijozlar ro‘yxati, ya’ni boshqa joyga borish
        // shart emas.
        och={() => setBolim('bosh')}
      />

      <AmallarMenyusi
        ochiq={amallar}
        yop={() => setAmallar(false)}
        amallar={[
          { matn: tr('Yangilash'), bos: yangila },
          { matn: tr('Hisoblararo o‘tkazma'), bos: () => setOyna({ rejim: 'kochirma' }) },
          { matn: tr('Kun yakuni'), bos: () => setYakunOynasi(true) },
          { matn: tr('Sozlamalar'), bos: () => setBolim('sozlama') },
        ]}
      />

      {yakunOynasi && (
        <KunYakuni yopish={() => setYakunOynasi(false)} yakunlandi={() => setYakunOynasi(false)} />
      )}

      {oyna && (
        <YozuvOynasi
          rejim={oyna.rejim}
          tahrir={oyna.tahrir ?? null}
          namuna={oyna.namuna ?? null}
          boshKlient={oyna.klient ?? null}
          yopish={() => setOyna(null)}
          saqlandi={yangila}
        />
      )}
    </View>
  );
}
