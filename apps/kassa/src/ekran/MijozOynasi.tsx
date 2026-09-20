// =============================================================
//  MIJOZ QO'SHISH VA TAHRIRLASH
//
//  Yuqorida FAQAT to'rt narsa: rasm, ism, familya, telefon.
//  Qolgani «Barchasi» ostida yashiringan.
//
//  Sabab: bozorda mijoz qo'shish bir daqiqada bo'lishi kerak va
//  ko'p hollarda ism bilan telefon yetadi. Hamma maydonni birdan
//  ko'rsatsak, odam yarmini bo'sh qoldirib «to'liq to'ldirmadim»
//  degan xijolat bilan chiqardi — yoki umuman qo'shmay qo'yardi.
//
//  RASM SERVERGA ketadi va INTERNET talab qiladi. Mijozning o'zi
//  esa internetsiz ham saqlanadi: rasm keyinroq qo'shiladi.
//  Shuning uchun rasm yuklanmasa saqlash TO'XTAMAYDI, faqat
//  ogohlantiradi.
//
//  JONLI JOYLASHUV — «shu yerdaman» tugmasi. Do'kondor mijozning
//  do'koni oldida turib bosadi va manzilni yozib o'tirmaydi.
// =============================================================

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Contacts from 'expo-contacts';
import { formatla, ifodaHisobla } from '@ilova/kassa-yadro';
import type { Klient } from '@ilova/kassa-yadro';
import { klientQosh, klientTahrirla } from '../lib/baza';
import { boshHarflar, rasmHavola, rasmYukla } from '../lib/rasm';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { uuid } from '../lib/sinx';
import { Kitob, Orqaga } from '../ui/ikonka';
import { Tugma } from '../ui/qismlar';

export default function MijozOynasi({
  tahrir,
  yopish,
  saqlandi,
}: {
  tahrir?: Klient | null;
  yopish: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  const { men } = useHolat();

  // Id OLDINDAN yasaladi: rasm undan oldin yuklanadi va yo'lda
  // klient id kerak bo'ladi. Aks holda avval saqlab, keyin
  // rasmni qo'shib, ikkinchi marta yozishga to'g'ri kelardi.
  const [id] = useState(() => tahrir?.id ?? uuid());

  const [ism, setIsm] = useState(tahrir?.ism ?? '');
  const [familya, setFamilya] = useState(tahrir?.familya ?? '');
  const [telefon, setTelefon] = useState(tahrir?.telefon ?? '');
  const [rasmUri, setRasmUri] = useState<string | null>(null);
  const [rasmYol, setRasmYol] = useState<string | null>(tahrir?.rasm_path ?? null);

  const [barchasi, setBarchasi] = useState(false);
  const [manzil, setManzil] = useState(tahrir?.manzil ?? '');
  const [kategoriya, setKategoriya] = useState(tahrir?.kategoriya ?? '');
  const [cheklov, setCheklov] = useState(
    tahrir?.cheklov ? String(Math.round(tahrir.cheklov / 100)) : '',
  );
  const [izoh, setIzoh] = useState(tahrir?.izoh ?? '');
  const [lat, setLat] = useState<number | null>(tahrir?.lat ?? null);
  const [lng, setLng] = useState<number | null>(tahrir?.lng ?? null);

  const [band, setBand] = useState(false);
  const [joylashuvBand, setJoylashuvBand] = useState(false);

  // Mavjud rasmni ko'rsatish uchun imzolangan havola kerak:
  // ombor ochiq emas.
  useEffect(() => {
    if (!tahrir?.rasm_path) return;
    rasmHavola(tahrir.rasm_path).then((u) => {
      if (u) setRasmUri(u);
    });
  }, [tahrir?.rasm_path]);

  async function rasmTanla() {
    const ruxsat = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!ruxsat.granted) {
      Alert.alert(tr('Ruxsat yo‘q'), tr('Galereyaga kirish uchun ruxsat bering'));
      return;
    }
    const natija = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Kvadrat: ro'yxatda hamma rasm doiracha bo'lib chiziladi,
      // cho'zilgan rasm u yerda qiyshayib ko'rinardi.
      aspect: [1, 1],
      quality: 0.6,
    });
    if (natija.canceled || !natija.assets?.[0]) return;
    setRasmUri(natija.assets[0].uri);
  }

  /**
   * Telefon kontaktlaridan tanlash.
   *
   * Ism/familya BO‘SH bo‘lsagina to‘ldiriladi: odam allaqachon
   * bir nimani yozgan bo‘lsa, uni kontakt ustiga yozib yuborish
   * kutilmagan yo‘qotish bo‘lardi.
   */
  async function kontaktdanOl() {
    try {
      const k = await Contacts.presentContactPickerAsync();
      if (!k) return;

      // Android’da ko‘pincha faqat `name` to‘ladi, `firstName`
      // esa bo‘sh qoladi — shunda nomni bo‘shliq bo‘yicha o‘zimiz
      // ajratamiz: birinchi so‘z ism, qolgani familya.
      let yangiIsm = (k.firstName ?? '').trim();
      let yangiFamilya = (k.lastName ?? '').trim();
      if (!yangiIsm && !yangiFamilya) {
        const bolaklar = (k.name ?? '').trim().split(/\s+/).filter(Boolean);
        yangiIsm = bolaklar[0] ?? '';
        yangiFamilya = bolaklar.slice(1).join(' ');
      }

      // Asosiy raqam bo‘lsa o‘sha, bo‘lmasa birinchisi
      const raqamlar = k.phoneNumbers ?? [];
      const raqam = raqamlar.find((x) => x.isPrimary) ?? raqamlar[0];
      const nomer = (raqam?.number ?? raqam?.digits ?? '').trim();

      if (yangiIsm && !ism.trim()) setIsm(yangiIsm);
      if (yangiFamilya && !familya.trim()) setFamilya(yangiFamilya);
      if (nomer && !telefon.trim()) setTelefon(nomer);

      if (!yangiIsm && !yangiFamilya && !nomer) {
        Alert.alert(tr('Kontakt bo‘sh'), tr('Bu kontaktda ism ham, raqam ham yo‘q'));
      }
    } catch (e) {
      Alert.alert(tr('Kontakt ochilmadi'), xatoMatn(e));
    }
  }

  async function joylashuvOl() {
    setJoylashuvBand(true);
    try {
      const ruxsat = await Location.requestForegroundPermissionsAsync();
      if (!ruxsat.granted) {
        Alert.alert(tr('Ruxsat yo‘q'), tr('Joylashuv uchun ruxsat bering'));
        return;
      }
      const joy = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(joy.coords.latitude);
      setLng(joy.coords.longitude);
    } catch (e) {
      Alert.alert(tr('Joylashuv olinmadi'), xatoMatn(e));
    } finally {
      setJoylashuvBand(false);
    }
  }

  async function saqla() {
    if (ism.trim().length < 2 || band) return;
    setBand(true);

    // Rasm AVVAL yuklanadi: yo'l mijoz qatoriga birga tushsin.
    let yol = rasmYol;
    const yangiRasm = rasmUri && !rasmUri.startsWith('http');
    if (yangiRasm) {
      try {
        yol = await rasmYukla(men.org_id, id, rasmUri);
      } catch (e) {
        // Rasm yuklanmasa ham mijoz saqlanadi: aks holda
        // internetsiz joyda mijoz umuman qo'shilmasdi.
        Alert.alert(tr('Rasm yuklanmadi'), xatoMatn(e) + '\n\n' + tr('Mijoz rasmsiz saqlanadi'));
        yol = rasmYol;
      }
    }
    setRasmYol(yol);

    // `ifodaHisobla` tiyin qaytaradi va «10 000 000» kabi
    // bo‘shliqli yozuvni ham tushunadi. Tushunmasa null — u
    // holda cheklov qo‘yilmaydi, yolg‘on raqam yozilmaydi.
    const cheklovTiyin = cheklov.trim() ? ifodaHisobla(cheklov) : null;
    const maydonlar = {
      ism,
      familya,
      telefon,
      manzil,
      kategoriya,
      lat,
      lng,
      cheklov: cheklovTiyin,
      rasm_path: yol,
      izoh,
    };

    try {
      if (tahrir) await klientTahrirla(id, maydonlar);
      else await klientQosh({ ...maydonlar, id, turi: 'hamkor' });
      saqlandi();
      yopish();
    } catch (e) {
      setBand(false);
      Alert.alert(tr('Saqlanmadi'), xatoMatn(e));
    }
  }

  const harflar = boshHarflar(ism, familya);

  return (
    <Modal animationType="slide" onRequestClose={yopish}>
      <View style={{ flex: 1, backgroundColor: C.fon }}>
        <View
          style={{
            backgroundColor: C.tun,
            paddingTop: chekka.top + 8,
            paddingBottom: 10,
            paddingHorizontal: O.chekka - 4,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: C.ajratgich,
          }}
        >
          <TouchableOpacity onPress={yopish} hitSlop={10} style={{ padding: 8 }}>
            <Orqaga rang={C.tunMatn} />
          </TouchableOpacity>
          <Text style={{ color: C.tunMatn, fontSize: 17, fontWeight: '700', marginLeft: 6 }}>
            {tahrir ? tr('Mijozni tahrirlash') : tr('Mijoz qo‘shish')}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: O.chekka, paddingBottom: chekka.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Rasm */}
          <TouchableOpacity onPress={rasmTanla} style={{ alignSelf: 'center', marginBottom: 20 }}>
            {rasmUri ? (
              <Image
                source={{ uri: rasmUri }}
                style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.ajratgich }}
              />
            ) : (
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: C.ajratgich,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: C.chegara,
                }}
              >
                <Text style={{ color: C.matn2, fontSize: 28, fontWeight: '700' }}>{harflar}</Text>
              </View>
            )}
            <Text style={{ color: C.matn2, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
              {rasmUri ? tr('Rasmni almashtirish') : tr('Rasm qo‘shish')}
            </Text>
          </TouchableOpacity>

          {/* Kontaktlardan olish — ism maydonining TEPASIDA:
              odam yozishni boshlagandan keyin taklif qilish kech
              bo‘lardi.

              Brauzerda tizim kontakt tanlagichi YO‘Q: tugma
              bosilsa faqat xato chiqardi, shuning uchun u yerda
              umuman ko‘rsatilmaydi. */}
          {Platform.OS !== 'web' && (
          <TouchableOpacity
            onPress={kontaktdanOl}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderRadius: O.radiusKichik,
              borderWidth: 1,
              borderColor: C.chegara,
              marginBottom: 16,
            }}
          >
            <Kitob rang={C.matn2} olcham={18} />
            <Text style={{ flex: 1, color: C.matn, fontSize: 14 }}>
              {tr('Kontaktlardan tanlash')}
            </Text>
            <Text style={{ color: C.matn2, fontSize: 18 }}>›</Text>
          </TouchableOpacity>
          )}

          <Maydon nom={tr('Ism')} qiymat={ism} setQiymat={setIsm} autoFocus />
          <Maydon nom={tr('Familya')} qiymat={familya} setQiymat={setFamilya} />
          <Maydon
            nom={tr('Telefon')}
            qiymat={telefon}
            setQiymat={setTelefon}
            klaviatura="phone-pad"
            namuna="+998 90 123 45 67"
          />

          {/* «Barchasi» — qolgan maydonlar */}
          <TouchableOpacity
            onPress={() => setBarchasi((x) => !x)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 14,
              marginTop: 8,
              borderTopWidth: 1,
              borderTopColor: C.ajratgich,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.matn, fontSize: 15, fontWeight: '600' }}>{tr('Barchasi')}</Text>
              <Text style={{ color: C.xira, fontSize: 12, marginTop: 2 }}>
                {tr('Manzil, kategoriya, cheklov, izoh')}
              </Text>
            </View>
            <Switch
              value={barchasi}
              onValueChange={setBarchasi}
              trackColor={{ true: C.faol, false: C.chegara }}
              thumbColor={Platform.OS === 'android' ? C.karta : undefined}
            />
          </TouchableOpacity>

          {barchasi && (
            <View>
              <Maydon nom={tr('Manzil')} qiymat={manzil} setQiymat={setManzil} />

              {/* Jonli joylashuv */}
              <TouchableOpacity
                onPress={joylashuvOl}
                disabled={joylashuvBand}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: O.radiusKichik,
                  borderWidth: 1,
                  borderColor: lat === null ? C.chegara : C.kirim,
                  marginBottom: 14,
                }}
              >
                {joylashuvBand ? (
                  <ActivityIndicator color={C.xira} />
                ) : (
                  <Text style={{ fontSize: 16, color: lat === null ? C.matn2 : C.kirim }}>◎</Text>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.matn, fontSize: 14 }}>
                    {lat === null ? tr('Shu yerdaman — joylashuvni qo‘yish') : tr('Joylashuv qo‘yildi')}
                  </Text>
                  {lat !== null && (
                    <Text style={{ color: C.xira, fontSize: 11, marginTop: 2 }}>
                      {lat.toFixed(5)}, {(lng ?? 0).toFixed(5)}
                    </Text>
                  )}
                </View>
                {lat !== null && (
                  <TouchableOpacity
                    onPress={() => {
                      setLat(null);
                      setLng(null);
                    }}
                    hitSlop={10}
                  >
                    <Text style={{ color: C.xira, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <Maydon
                nom={tr('Kategoriya')}
                qiymat={kategoriya}
                setQiymat={setKategoriya}
                namuna={tr('Masalan: Bozor, Optom, Doimiy')}
              />
              <Maydon
                nom={tr('Balans cheklovi')}
                qiymat={cheklov}
                setQiymat={setCheklov}
                klaviatura="numeric"
                namuna={tr('Masalan: 10 000 000')}
                izoh={
                  cheklov.trim()
                    ? tr('Cheklovdan oshsa ogohlantiradi, lekin to‘smaydi') +
                      ' · ' +
                      formatla(ifodaHisobla(cheklov) ?? 0, 'UZS', { kasrsiz: true })
                    : tr('Bo‘sh qoldirilsa cheklov yo‘q')
                }
              />
              <Maydon nom={tr('Izoh')} qiymat={izoh} setQiymat={setIzoh} kopQatorli />
            </View>
          )}

          <Tugma
            matn={tahrir ? tr('Saqlash') : tr('Qo‘shish')}
            bos={ism.trim().length >= 2 && !band ? saqla : () => {}}
            kutmoqda={band}
            uslub={{ marginTop: 20 }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

function Maydon({
  nom,
  qiymat,
  setQiymat,
  namuna,
  izoh,
  klaviatura,
  autoFocus,
  kopQatorli,
}: {
  nom: string;
  qiymat: string;
  setQiymat: (v: string) => void;
  namuna?: string;
  izoh?: string;
  klaviatura?: 'phone-pad' | 'numeric';
  autoFocus?: boolean;
  kopQatorli?: boolean;
}) {
  const { C } = useTema();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: C.matn2, fontSize: 12, marginBottom: 6 }}>{nom}</Text>
      <TextInput
        value={qiymat}
        onChangeText={setQiymat}
        placeholder={namuna}
        placeholderTextColor={C.xira}
        keyboardType={klaviatura}
        autoFocus={autoFocus}
        multiline={kopQatorli}
        style={{
          borderWidth: 1,
          borderColor: C.chegara,
          borderRadius: O.radiusKichik,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          color: C.matn,
          backgroundColor: C.karta,
          minHeight: kopQatorli ? 76 : undefined,
          textAlignVertical: kopQatorli ? 'top' : 'center',
        }}
      />
      {izoh ? <Text style={{ color: C.xira, fontSize: 11, marginTop: 5 }}>{izoh}</Text> : null}
    </View>
  );
}
