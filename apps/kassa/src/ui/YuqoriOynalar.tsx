// =============================================================
//  YUQORI QATORDAGI IKKI OYNA
//
//  1. Qo'ng'iroq -> KECHIKKAN QARZLAR.
//
//     Push-bildirishnoma ATAYLAB yo'q (qaror 20.09): telefon
//     jiringlashi bilan odam ilovani o'chirib qo'yadi. Lekin
//     «muddati o'tdi» degan xabar baribir kerak — u shu yerda,
//     odam O'ZI ochganda ko'rinadi.
//
//  2. ⋮ -> kam ishlatiladigan amallar.
//
//     Menyu yuqori o'ng burchakdan tushadi, chunki tugma o'sha
//     yerda: markazdagi oyna qayerdan chiqqani bilinmasdi.
// =============================================================

import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bitimQoldiq, formatla, kechikkanKun } from '@ilova/kassa-yadro';
import type { Bitim, Klient, Tolov } from '@ilova/kassa-yadro';
import { O, useTema } from '../lib/tema';
import { sanaQisqa } from '../lib/davr';
import { tr, trn } from '../lib/til';
import { BoshHolat } from './qismlar';

export function BildirishnomaOyna({
  ochiq,
  yop,
  kechikkanlar,
  tolovlar,
  klientlar,
  och,
}: {
  ochiq: boolean;
  yop: () => void;
  kechikkanlar: Bitim[];
  tolovlar: Tolov[];
  klientlar: Klient[];
  /** Qatorni bosganda hamkorlar ekraniga o'tadi */
  och: (klientId: string) => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  if (!ochiq) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={yop}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} activeOpacity={1} onPress={yop}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={{
            marginTop: chekka.top + 56,
            marginHorizontal: 12,
            backgroundColor: C.karta,
            borderRadius: O.radius,
            borderWidth: 1,
            borderColor: C.chegara,
            maxHeight: '70%',
            overflow: 'hidden',
          }}
        >
          <View style={{ padding: O.chekka, borderBottomWidth: 1, borderBottomColor: C.ajratgich }}>
            <Text style={{ color: C.matn, fontSize: 15, fontWeight: '800' }}>{tr('Kechikkan qarzlar')}</Text>
            <Text style={{ color: C.xira, fontSize: 12, marginTop: 2 }}>
              {kechikkanlar.length === 0
                ? tr('Muddati o‘tgani yo‘q')
                : trn('{n} ta', kechikkanlar.length)}
            </Text>
          </View>

          {kechikkanlar.length === 0 ? (
            <BoshHolat belgi="✓" matn={tr('Hammasi muddatida')} izoh={tr('Kechikkan qarz yo‘q')} />
          ) : (
            <ScrollView>
              {kechikkanlar.map((b) => {
                const kun = kechikkanKun(b, tolovlar);
                const qoldi = bitimQoldiq(b, tolovlar);
                const ism = klientlar.find((k) => k.id === b.klient_id)?.ism ?? tr('Hamkor');
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => {
                      yop();
                      och(b.klient_id);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: O.chekka,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: C.ajratgich,
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.matn, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                        {ism}
                      </Text>
                      <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                        {(b.tovar_nom || tr('Qarz')) + ' · ' + sanaQisqa(b.muddat ?? b.sana)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: C.matn, fontSize: 15, fontWeight: '700' }}>
                        {formatla(qoldi, b.valyuta, { belgisiz: true, kasrsiz: true })}
                      </Text>
                      <Text style={{ color: C.chiqim, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
                        {trn('{n} kun kechikdi', kun)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export type Amal = { matn: string; bos: () => void };

export function AmallarMenyusi({
  ochiq,
  yop,
  amallar,
}: {
  ochiq: boolean;
  yop: () => void;
  amallar: Amal[];
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  if (!ochiq) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={yop}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} activeOpacity={1} onPress={yop}>
        <View
          style={{
            position: 'absolute',
            top: chekka.top + 50,
            right: 10,
            minWidth: 200,
            backgroundColor: C.karta,
            borderRadius: O.radiusKichik,
            borderWidth: 1,
            borderColor: C.chegara,
            paddingVertical: 4,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          {amallar.map((a) => (
            <TouchableOpacity
              key={a.matn}
              onPress={() => {
                yop();
                a.bos();
              }}
              style={{ paddingVertical: 12, paddingHorizontal: 16 }}
            >
              <Text style={{ color: C.matn, fontSize: 15 }}>{a.matn}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
