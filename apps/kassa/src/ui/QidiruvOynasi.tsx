// =============================================================
//  QIDIRUV OYNASI — hamkor daftarida topish
//
//  To'rt maydon bitta oynada: kalit so'z, miqdor, boshlanish va
//  tugash sanasi. Ular BIRGA ishlaydi.
//
//  Mantiq bu yerda EMAS — u `lib/qidiruv.ts` da va sinovga
//  tushadi. Bu fayl faqat maydonlarni ko'rsatadi. Sabab: «500
//  mingdan katta» chegarasi ekran ichida yozilsa, uni faqat
//  qo'lda bosib tekshirish qolardi.
//
//  «Tozalash» tugmasi ALOHIDA va ko'rinib turadi: filtr qolib
//  ketsa, odam «yozuvlarim yo'qoldi» deb o'ylaydi — bu eng ko'p
//  uchraydigan yolg'on nosozlik.
// =============================================================

import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { BOSH_QIDIRUV, type MiqdorTuri, type Qidiruv } from '../lib/qidiruv';
import { MuddatMaydoni } from './MuddatMaydoni';

const MIQDOR_TURLARI: { k: MiqdorTuri; m: string }[] = [
  { k: 'yoq', m: 'Hammasi' },
  { k: 'katta', m: 'Kattaroq' },
  { k: 'kichik', m: 'Kichikroq' },
  { k: 'teng', m: 'Aynan' },
];

export function QidiruvOynasi({
  ochiq,
  qidiruv,
  qoy,
  yop,
}: {
  ochiq: boolean;
  qidiruv: Qidiruv;
  qoy: (q: Qidiruv) => void;
  yop: () => void;
}) {
  const { C } = useTema();

  const maydon = {
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.matn,
    backgroundColor: C.karta2,
  };

  return (
    <Modal visible={ochiq} transparent animationType="slide" onRequestClose={yop}>
      <Pressable style={{ flex: 1, backgroundColor: C.parda }} onPress={yop} />
      <View
        style={{
          backgroundColor: C.karta,
          borderTopLeftRadius: O.radius,
          borderTopRightRadius: O.radius,
          maxHeight: '80%',
        }}
      >
        <ScrollView contentContainerStyle={{ padding: O.chekka }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: C.matn, fontSize: 17, fontWeight: '700', marginBottom: 14 }}>
            {tr('Qidiruv')}
          </Text>

          <Text style={{ color: C.matn2, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
            {tr('Kalit so‘z')}
          </Text>
          <TextInput
            style={maydon}
            value={qidiruv.matn}
            onChangeText={(x) => qoy({ ...qidiruv, matn: x })}
            placeholder={tr('Izoh yoki tovar nomidan')}
            placeholderTextColor={C.xira}
          />

          <Text style={{ color: C.matn2, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 }}>
            {tr('Miqdor')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {MIQDOR_TURLARI.map((v) => {
              const faol = qidiruv.miqdorTuri === v.k;
              return (
                <TouchableOpacity
                  key={v.k}
                  onPress={() => qoy({ ...qidiruv, miqdorTuri: v.k })}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: faol ? C.faol : C.chegara,
                    backgroundColor: faol ? C.faol : 'transparent',
                  }}
                >
                  <Text style={{ color: faol ? C.faolMatn : C.matn2, fontSize: 13, fontWeight: '600' }}>
                    {tr(v.m)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {qidiruv.miqdorTuri !== 'yoq' && (
            <TextInput
              style={maydon}
              value={qidiruv.miqdor}
              onChangeText={(x) => qoy({ ...qidiruv, miqdor: x })}
              keyboardType="numeric"
              placeholder="500000"
              placeholderTextColor={C.xira}
            />
          )}

          <View style={{ marginTop: 16 }}>
            <MuddatMaydoni
              qiymat={qidiruv.sanaBosh || null}
              setQiymat={(v) => qoy({ ...qidiruv, sanaBosh: v ?? '' })}
              izoh={tr('Shu kundan')}
            />
            <MuddatMaydoni
              qiymat={qidiruv.sanaOxir || null}
              setQiymat={(v) => qoy({ ...qidiruv, sanaOxir: v ?? '' })}
              izoh={tr('Shu kungacha')}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => qoy({ ...BOSH_QIDIRUV })}
              style={{
                flex: 1,
                paddingVertical: 13,
                borderRadius: O.radiusKichik,
                borderWidth: 1,
                borderColor: C.chegara,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: C.matn2, fontSize: 15, fontWeight: '600' }}>{tr('Tozalash')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={yop}
              style={{
                flex: 1,
                paddingVertical: 13,
                borderRadius: O.radiusKichik,
                backgroundColor: C.faol,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: C.faolMatn, fontSize: 15, fontWeight: '700' }}>{tr('Yopish')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
