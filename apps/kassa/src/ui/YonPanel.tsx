// =============================================================
//  YON PANEL (sidebar)
//
//  Pastki bo'limlar qatori olib tashlangani uchun (20.09 qarori)
//  BUTUN navigatsiya shu yerda. Demak bo'limlardan birortasi
//  ro'yxatdan tushib qolsa, unga boradigan yo'l qolmaydi — yangi
//  ekran qo'shilsa, avval shu faylga qo'shiladi.
//
//  Animatsiya ATAYLAB yo'q. `Animated` bilan surilib chiqadigan
//  panel chiroyliroq, lekin arzon telefonda birinchi ochilishda
//  sakraydi va odam ikki marta bosadi. Modal esa darrov ochiladi.
//
//  Panel o'ngida qorong'i maydon bor va u bosilsa yopiladi — bu
//  odamlar Android'da o'rgangan harakat.
// =============================================================

import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';

export type PanelBolim =
  | 'bosh'
  | 'yozuvlar'
  | 'hisoblar'
  | 'turkumlar'
  | 'hisobot'
  | 'kalendar'
  | 'yakun'
  | 'aimodel'
  | 'ai'
  | 'sozlama';

type Qator = { kalit: PanelBolim; belgi: string; matn: string };

// Guruhlar: har biri ajratgich bilan bo'linadi. Tartib tasodifiy
// emas — yuqorida kunda o'nlab marta ochiladigani, pastda oyda
// bir marta ochiladigani.
const GURUHLAR: Qator[][] = [
  [
    { kalit: 'bosh', belgi: '☺', matn: 'Mijozlar' },
    { kalit: 'yozuvlar', belgi: '≡', matn: 'Operatsiyalar' },
  ],
  [
    { kalit: 'hisoblar', belgi: '▤', matn: 'Hisoblar' },
    { kalit: 'turkumlar', belgi: '▦', matn: 'Turkumlar' },
    { kalit: 'hisobot', belgi: '▥', matn: 'Hisobot' },
    { kalit: 'kalendar', belgi: '▩', matn: 'Kalendar' },
    { kalit: 'yakun', belgi: '◑', matn: 'Kun yakuni' },
  ],
  [
    { kalit: 'aimodel', belgi: '✦', matn: 'AI modeli' },
    { kalit: 'ai', belgi: '✧', matn: 'AI ulanish' },
    { kalit: 'sozlama', belgi: '⚙', matn: 'Sozlamalar' },
  ],
];

export function YonPanel({
  ochiq,
  joriy,
  biznes,
  yop,
  tanla,
}: {
  ochiq: boolean;
  joriy: PanelBolim;
  biznes: string;
  yop: () => void;
  tanla: (b: PanelBolim) => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  if (!ochiq) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={yop}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View
          style={{
            width: '78%',
            maxWidth: 300,
            backgroundColor: C.karta,
            borderRightWidth: 1,
            borderRightColor: C.chegara,
          }}
        >
          <View
            style={{
              paddingTop: chekka.top + 18,
              paddingBottom: 18,
              paddingHorizontal: O.chekka,
              borderBottomWidth: 1,
              borderBottomColor: C.ajratgich,
            }}
          >
            <Text style={{ color: C.matn, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>
              {biznes}
            </Text>
            <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }}>{tr('Oldi-berdi daftari')}</Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: chekka.bottom + 16 }}>
            {GURUHLAR.map((guruh, i) => (
              <View key={i}>
                {i > 0 && (
                  <View style={{ height: 1, backgroundColor: C.ajratgich, marginVertical: 8, marginHorizontal: O.chekka }} />
                )}
                {guruh.map((q) => {
                  const faolmi = q.kalit === joriy;
                  return (
                    <TouchableOpacity
                      key={q.kalit}
                      onPress={() => tanla(q.kalit)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        paddingVertical: 13,
                        paddingHorizontal: O.chekka,
                        backgroundColor: faolmi ? C.ajratgich : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 17, color: faolmi ? C.matn : C.matn2, width: 22 }}>{q.belgi}</Text>
                      <Text
                        style={{
                          fontSize: 15,
                          color: faolmi ? C.matn : C.matn2,
                          fontWeight: faolmi ? '700' : '500',
                        }}
                      >
                        {tr(q.matn)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Qorong'i maydon — bosilsa yopiladi */}
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} activeOpacity={1} onPress={yop} />
      </View>
    </Modal>
  );
}
