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
import { Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type { Klient } from '@ilova/kassa-yadro';
import { raqamToza } from '../lib/xabar';
import { XABAR_TILLAR, type XabarTil } from '../lib/xabar-til';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { Orqaga } from '../ui/ikonka';
import { Ogoh } from '../lib/ogoh';

export default function XabarOynasi({
  klient,
  matnYasa,
  yopish,
}: {
  klient: Klient;
  /** Tanlangan tilda matn qaytaradi */
  matnYasa: (til: XabarTil) => string;
  yopish: () => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  const [til, setTil] = useState<XabarTil>('uz');
  const [tahrir, setTahrir] = useState(() => matnYasa('uz'));

  // Til almashsa matn QAYTADAN yasaladi — qo‘lda kiritilgan
  // tahrir yo‘qoladi. Buni yashirmaymiz: matn ko‘z oldida
  // almashadi va odam nima bo‘lganini ko‘rib turadi.
  function tilniQoy(yangi: XabarTil) {
    setTil(yangi);
    setTahrir(matnYasa(yangi));
  }

  const raqam = raqamToza(klient.telefon);
  const raqamBor = raqam.length >= 7;

  async function och(url: string, nomi: string) {
    try {
      const bormi = await Linking.canOpenURL(url);
      if (!bormi) {
        // `canOpenURL` false qaytarishi = ilova o'rnatilmagan.
        // Baribir ochishga urinish foydasiz va xato ekranda
        // tushunarsiz chiqardi.
        Ogoh.alert(tr('Ilova topilmadi'), nomi + ' ' + tr('bu telefonda yo‘q'));
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Ogoh.alert(tr('Ochilmadi'), String((e as Error)?.message ?? e));
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

        {/* TIL TANLAGICH — matndan OLDIN: odam avval tilni
            tanlaydi, keyin matnni o‘qiydi. Teskarisi bo‘lsa
            o‘qib bo‘lgandan keyin hammasi almashardi. */}
        <View style={{ backgroundColor: C.karta, borderBottomWidth: 1, borderBottomColor: C.ajratgich }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: O.chekka - 4, paddingVertical: 8, gap: 6 }}
          >
            {XABAR_TILLAR.map((t) => {
              const faolmi = t.kalit === til;
              return (
                <TouchableOpacity
                  key={t.kalit}
                  onPress={() => tilniQoy(t.kalit)}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: faolmi ? C.faol : 'transparent',
                    borderWidth: 1,
                    borderColor: faolmi ? C.faol : C.chegara,
                  }}
                >
                  <Text
                    style={{
                      color: faolmi ? C.faolMatn : C.matn2,
                      fontSize: 13,
                      fontWeight: faolmi ? '700' : '500',
                    }}
                  >
                    {t.nom}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
              Ogoh.alert(tr('Nusxa olindi'), tr('Xabar matni buferga ko‘chirildi'));
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
