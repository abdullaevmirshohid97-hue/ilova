// =============================================================
//  SINXRONIZATSIYA BELGISI
//
//  Offline ilovada eng yomon narsa — JIMLIK. Foydalanuvchi yozuv
//  kiritadi, u ekranda turadi, lekin serverga ketmagan. Ikkinchi
//  telefonda ochib ko'radi — yo'q. Ishonch shu yerda sinadi.
//
//  Shuning uchun holat doim ko'rinadi, lekin BEZOR QILMAYDI:
//  hammasi joyida bo'lsa — hech narsa chiqmaydi.
//
//  Ziddiyat esa alohida: u o'z-o'zidan yo'qolmaydi, foydalanuvchi
//  ko'rib, yopishi kerak.
// =============================================================

import { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { Tugma } from './qismlar';

export default function SinxBelgi() {
  const { C } = useTema();
  const { sinxHolat, sinxlanmoqda, navbatda, ziddiyatlar, doimiy, sinxlash, ziddiyatniYop } = useHolat();
  const [royxat, setRoyxat] = useState(false);

  // Hammasi joyida — ekranni band qilmaymiz
  if (doimiy && sinxHolat === 'sinxron' && !sinxlanmoqda) return null;

  const { matn, rang, fon, bosiladi } = korinish();

  function korinish() {
    if (!doimiy) {
      return {
        matn: 'Bu qurilmada saqlash ishlamayapti — ilova internetsiz ochilmaydi',
        rang: C.ogoh,
        fon: C.ogohYumshoq,
        bosiladi: false,
      };
    }
    if (sinxHolat === 'ziddiyat') {
      return {
        matn: `${ziddiyatlar.length} ta o‘zgarish qo‘llanmadi — ko‘rish`,
        rang: C.chiqim,
        fon: C.chiqimYumshoq,
        bosiladi: true,
      };
    }
    if (sinxHolat === 'oflayn') {
      return {
        matn: navbatda
          ? `Internet yo‘q · ${navbatda} ta yozuv navbatda`
          : 'Internet yo‘q — yozuvlar qurilmada saqlanyapti',
        rang: C.ogoh,
        fon: C.ogohYumshoq,
        bosiladi: false,
      };
    }
    if (navbatda > 0) {
      return {
        matn: `${navbatda} ta yozuv yuborilmoqda…`,
        rang: C.matn2,
        fon: C.ajratgich,
        bosiladi: false,
      };
    }
    return { matn: 'Sinxronlanmoqda…', rang: C.matn2, fon: C.ajratgich, bosiladi: false };
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={bosiladi ? 0.7 : 1}
        onPress={() => (bosiladi ? setRoyxat(true) : sinxlash())}
        style={{
          backgroundColor: fon,
          paddingVertical: 7,
          paddingHorizontal: O.chekka,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: rang }} />
        <Text style={{ color: rang, fontSize: 12, flex: 1 }} numberOfLines={1}>
          {matn}
        </Text>
        {bosiladi && <Text style={{ color: rang, fontSize: 12, fontWeight: '700' }}>›</Text>}
      </TouchableOpacity>

      {royxat && (
        <Modal transparent animationType="slide" onRequestClose={() => setRoyxat(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.5)', justifyContent: 'flex-end' }}>
            <View
              style={{
                backgroundColor: C.fon,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: '80%',
                width: '100%',
                maxWidth: 520,
                alignSelf: 'center',
                padding: O.chekka,
                paddingBottom: 28,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ flex: 1, color: C.matn, fontSize: 17, fontWeight: '800' }}>
                  Qo‘llanmagan o‘zgarishlar
                </Text>
                <TouchableOpacity onPress={() => setRoyxat(false)} hitSlop={12}>
                  <Text style={{ color: C.matn2, fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: C.xira, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                Bu yozuvlar boshqa qurilmada o‘zgargan yoki server qabul qilmagan.
                Serverdagi qiymat saqlanib qoldi — kerak bo‘lsa qaytadan
                tahrirlang.
              </Text>

              <ScrollView style={{ maxHeight: 300 }}>
                {ziddiyatlar.map((z) => (
                  <View
                    key={z.id}
                    style={{
                      backgroundColor: C.karta,
                      borderWidth: 1,
                      borderColor: C.chegara,
                      borderRadius: O.radiusKichik,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: C.matn, fontSize: 14 }}>{z.sabab}</Text>
                    <Text style={{ color: C.xira, fontSize: 11, marginTop: 4 }}>
                      {z.jadval} · {z.yozuv_id.slice(0, 8)}
                    </Text>
                    <TouchableOpacity onPress={() => ziddiyatniYop(z.id)} style={{ marginTop: 8 }}>
                      <Text style={{ color: C.matn2, fontSize: 13, fontWeight: '600' }}>Tushunarli</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {ziddiyatlar.length === 0 && (
                  <Text style={{ color: C.xira, fontSize: 13 }}>Ro‘yxat bo‘sh</Text>
                )}
              </ScrollView>

              <Tugma matn="Yopish" bos={() => setRoyxat(false)} uslub={{ marginTop: 12 }} />
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
