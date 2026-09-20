// =============================================================
//  MIJOZGA XABAR — avval KO'RSATADI, keyin yuboradi
//
//  Matn oldin ko'rinishi SHART. Tayyor xabar to'g'ridan-to'g'ri
//  jo'nab qolsa, xato raqam yoki noto'g'ri qoldiq mijozga borardi
//  va uni qaytarib bo'lmasdi — pul haqidagi xabarda bu jiddiy.
//
//  Matn TAHRIRLANADI ham: do'kondor «aka» qo'shishi, yoki bitta
//  qatorni olib tashlashi mumkin. Tayyor shablon — taklif, buyruq
//  emas.
//
//  YUBORISHNI O'ZIMIZ QILMAYMIZ. Tizim ilovasi ochiladi va odam
//  o'zi «yuborish» ni bosadi: ilova o'zi SMS jo'natsa, u pulli
//  bo'lishi va odam buni kutmasligi mumkin.
// =============================================================

import { useState } from 'react';
import { Alert, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type { Klient } from '@ilova/kassa-yadro';
import { raqamToza } from '../lib/xabar';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { Orqaga } from '../ui/ikonka';

export default function XabarOynasi({
  klient,
  matn,
  yopish,
}: {
  klient: Klient;
  matn: string;
  yopish: () => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  const [tahrir, setTahrir] = useState(matn);

  const raqam = raqamToza(klient.telefon);
  const raqamBor = raqam.length >= 7;

  async function och(url: string, nomi: string) {
    try {
      const bormi = await Linking.canOpenURL(url);
      if (!bormi) {
        // `canOpenURL` false qaytarishi = ilova o'rnatilmagan.
        // Baribir ochishga urinish foydasiz va xato ekranda
        // tushunarsiz chiqardi.
        Alert.alert(tr('Ilova topilmadi'), nomi + ' ' + tr('bu telefonda yo‘q'));
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(tr('Ochilmadi'), String((e as Error)?.message ?? e));
    }
  }

  const matnKod = encodeURIComponent(tahrir);

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
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={{ color: C.tunMatn, fontSize: 17, fontWeight: '700' }}>{tr('Xabar')}</Text>
            <Text style={{ color: C.tunXira, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              {klient.ism}
              {klient.telefon ? ' · ' + klient.telefon : ' · ' + tr('raqam yo‘q')}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: O.chekka }}>
          <Text style={{ color: C.matn2, fontSize: 12, marginBottom: 8 }}>
            {tr('Matnni o‘zgartirsangiz ham bo‘ladi')}
          </Text>
          {/* Teng kenglikdagi shrift: ustunlar bo'shliq bilan
              tekislangan va oddiy shriftda ular qiyshayib
              ko'rinardi. */}
          <TextInput
            value={tahrir}
            onChangeText={setTahrir}
            multiline
            style={{
              borderWidth: 1,
              borderColor: C.chegara,
              borderRadius: O.radiusKichik,
              padding: 12,
              fontSize: 13,
              lineHeight: 19,
              color: C.matn,
              backgroundColor: C.karta,
              minHeight: 220,
              textAlignVertical: 'top',
              fontFamily: 'monospace',
            }}
          />
        </ScrollView>

        <View
          style={{
            padding: O.chekka,
            paddingBottom: O.chekka + chekka.bottom,
            backgroundColor: C.karta,
            borderTopWidth: 1,
            borderTopColor: C.ajratgich,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Yol
              matn="SMS"
              ochiq={raqamBor}
              bos={() => och(`sms:${raqam}?body=${matnKod}`, 'SMS')}
            />
            <Yol
              matn="Telegram"
              ochiq
              bos={() => och(`https://t.me/share/url?url=&text=${matnKod}`, 'Telegram')}
            />
            <Yol
              matn="WhatsApp"
              ochiq={raqamBor}
              bos={() => och(`https://wa.me/${raqam}?text=${matnKod}`, 'WhatsApp')}
            />
          </View>

          <TouchableOpacity
            onPress={async () => {
              await Clipboard.setStringAsync(tahrir);
              Alert.alert(tr('Nusxa olindi'), tr('Xabar matni buferga ko‘chirildi'));
            }}
            style={{
              borderWidth: 1,
              borderColor: C.chegara,
              borderRadius: O.radiusKichik,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: C.matn, fontSize: 14, fontWeight: '600' }}>
              {tr('Nusxa olish')}
            </Text>
          </TouchableOpacity>

          {!raqamBor && (
            <Text style={{ color: C.xira, fontSize: 11, textAlign: 'center' }}>
              {tr('SMS va WhatsApp uchun mijoz raqami kerak')}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Raqamsiz mijozda SMS va WhatsApp XIRA turadi: bosilib keyin
    «raqam yo'q» deyilishi ortiqcha qadam bo'lardi. */
function Yol({ matn, ochiq, bos }: { matn: string; ochiq: boolean; bos: () => void }) {
  const { C } = useTema();
  return (
    <TouchableOpacity
      onPress={ochiq ? bos : undefined}
      disabled={!ochiq}
      style={{
        flex: 1,
        backgroundColor: ochiq ? C.faol : C.ajratgich,
        borderRadius: O.radiusKichik,
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <Text
        style={{ color: ochiq ? C.faolMatn : C.xira, fontSize: 13, fontWeight: '700' }}
        numberOfLines={1}
      >
        {matn}
      </Text>
    </TouchableOpacity>
  );
}
