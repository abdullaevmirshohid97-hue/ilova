// =============================================================
//  VALYUTA SOZLAMASI
//
//  Do'kondor asosiy valyutasini tanlaydi (O'zbekistonda so'm) va
//  yoniga bir-ikkitasini qo'shadi: dollar, rubl, tenge. Har
//  biriga kurs kiritadi — «1 dollar 11 850 so'm».
//
//  KURS FAQAT YANGI YOZUVLARGA TA'SIR QILADI. Har yozuvda o'z
//  kursi saqlanadi va u yozilgan kunda muzlatiladi. Kurs ertaga
//  o'zgarsa, kechagi bitim o'zgarmaydi — aks holda kecha 11 850
//  ga kelishilgan qarz bugun 12 000 bo'lib qolardi va hamkor
//  buni darrov sezardi.
//
//  Shu sababli ekranda buni OCHIQ yozib qo'yamiz: odam kursni
//  o'zgartirsa, eski raqamlar nega o'zgarmaganini so'ramasin.
// =============================================================

import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatla, VALYUTALAR, type Valyuta, type ValyutaKurs } from '@ilova/kassa-yadro';
import { asosiyValyutaQoy, valyutaOchir, valyutaSaqla } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { Chiqindi } from '../ui/ikonka';
import { Karta, Sarlavha, Tugma } from '../ui/qismlar';
import { Ogoh } from '../lib/ogoh';

export default function ValyutaSozlama() {
  const { C } = useTema();
  const { valyutalar, hisoblar, yangila } = useHolat();

  const asosiy = valyutalar.find((v) => v.asosiy)?.valyuta ?? 'UZS';
  const qoshimcha = valyutalar.filter((v) => !v.asosiy);

  // Kurs maydonlari: id -> matn. Har harfda saqlamaymiz, chunki
  // yozayotganda «118» ham kurs bo'lib tushib qolardi.
  const [kurslar, setKurslar] = useState<Record<string, string>>({});
  const [band, setBand] = useState(false);

  // ASOSIY VALYUTA BO‘LMASA — o‘zi yaratiladi.
  //
  // Migratsiya mavjud tashkilotlarga qator qo‘shadi, lekin
  // yangi biznesda u yo‘q. Usiz ekran ochiladi-yu, hech narsa
  // tanlab bo‘lmasdi: har tugma «o‘zgartirish» deb so‘rardi va
  // ro‘yxat baribir bo‘sh qolardi.
  useEffect(() => {
    if (valyutalar.some((v) => v.asosiy)) return;
    const bosh = hisoblar[0]?.valyuta ?? 'UZS';
    asosiyValyutaQoy(bosh)
      .then(() => yangila())
      .catch(() => {
        /* internetsiz bo‘lsa keyingi ochilishda qayta urinadi */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valyutalar.length]);

  useEffect(() => {
    setKurslar((eski) => {
      const yangi = { ...eski };
      for (const v of qoshimcha) {
        if (yangi[v.id] === undefined) yangi[v.id] = String(v.kurs);
      }
      return yangi;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valyutalar.length]);

  async function asosiyniQoy(v: Valyuta) {
    if (v === asosiy || band) return;
    Ogoh.alert(
      tr('Asosiy valyuta'),
      tr('Asosiy valyuta o‘zgaradi. Eski yozuvlar o‘z valyutasida qoladi.'),
      [
        { text: tr('Bekor'), style: 'cancel' },
        {
          text: tr('O‘zgartirish'),
          onPress: async () => {
            setBand(true);
            try {
              await asosiyValyutaQoy(v);
              await yangila();
            } catch (e) {
              Ogoh.alert(tr('Saqlanmadi'), xatoMatn(e));
            } finally {
              setBand(false);
            }
          },
        },
      ],
    );
  }

  async function qosh(v: Valyuta) {
    setBand(true);
    try {
      await valyutaSaqla({ valyuta: v, kurs: 1 });
      await yangila();
    } catch (e) {
      Ogoh.alert(tr('Saqlanmadi'), xatoMatn(e));
    } finally {
      setBand(false);
    }
  }

  async function kursniSaqla(v: ValyutaKurs) {
    const son = Number((kurslar[v.id] ?? '').replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(son) || son <= 0) {
      Ogoh.alert(tr('Kurs noto‘g‘ri'), tr('Kurs noldan katta son bo‘lishi kerak'));
      return;
    }
    setBand(true);
    try {
      await valyutaSaqla({ valyuta: v.valyuta, kurs: son });
      await yangila();
    } catch (e) {
      Ogoh.alert(tr('Saqlanmadi'), xatoMatn(e));
    } finally {
      setBand(false);
    }
  }

  const qolgan = VALYUTALAR.filter((v) => !valyutalar.some((x) => x.valyuta === v));

  return (
    <ScrollView style={{ flex: 1 }}>
      <Sarlavha matn={tr('Asosiy valyuta')} />
      <View style={{ paddingHorizontal: O.chekka }}>
        <Text style={{ color: C.xira, fontSize: 12, marginBottom: 10 }}>
          {tr('Bosh sahifadagi umumiy balans shu valyutada ko‘rsatiladi')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {VALYUTALAR.map((v) => {
            const faolmi = v === asosiy;
            return (
              <TouchableOpacity
                key={v}
                onPress={() => asosiyniQoy(v)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
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
                  {v}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Sarlavha matn={tr('Qo‘shimcha valyutalar')} />
      <View style={{ paddingHorizontal: O.chekka }}>
        <Text style={{ color: C.xira, fontSize: 12, marginBottom: 10 }}>
          {tr('Kurs faqat YANGI yozuvlarga qo‘llanadi — eskilari o‘zgarmaydi')}
        </Text>

        {qoshimcha.length === 0 ? (
          <Text style={{ color: C.xira, fontSize: 13, marginBottom: 10 }}>
            {tr('Qo‘shimcha valyuta yo‘q')}
          </Text>
        ) : (
          qoshimcha.map((v) => (
            <Karta key={v.id} uslub={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: C.matn, fontSize: 15, fontWeight: '700', width: 46 }}>
                  {v.valyuta}
                </Text>
                <Text style={{ color: C.xira, fontSize: 12 }}>1 =</Text>
                <TextInput
                  value={kurslar[v.id] ?? ''}
                  onChangeText={(x) => setKurslar((k) => ({ ...k, [v.id]: x }))}
                  keyboardType="numeric"
                  placeholder="11850"
                  placeholderTextColor={C.xira}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: C.chegara,
                    borderRadius: O.radiusKichik,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    fontSize: 15,
                    color: C.matn,
                  }}
                />
                <Text style={{ color: C.matn2, fontSize: 13 }}>{asosiy}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    setBand(true);
                    try {
                      await valyutaOchir(v.id);
                      await yangila();
                    } finally {
                      setBand(false);
                    }
                  }}
                  hitSlop={10}
                  style={{ padding: 4 }}
                >
                  <Chiqindi rang={C.chiqim} olcham={16} />
                </TouchableOpacity>
              </View>

              {/* Namuna: odam kursni to'g'ri kiritganini darrov
                  ko'radi. «11 850» va «1 1850» ni adashtirish oson. */}
              <Text style={{ color: C.xira, fontSize: 11, marginTop: 8 }}>
                100 {v.valyuta} ={' '}
                {formatla(
                  Math.round(10000 * (Number((kurslar[v.id] ?? '0').replace(',', '.')) || 0)),
                  asosiy,
                  { kasrsiz: true },
                )}
              </Text>

              <Tugma
                matn={tr('Kursni saqlash')}
                ikkilamchi
                kutmoqda={band}
                bos={() => kursniSaqla(v)}
                uslub={{ marginTop: 10 }}
              />
            </Karta>
          ))
        )}

        {qolgan.length > 0 && (
          <View style={{ marginTop: 6, marginBottom: 24 }}>
            <Text style={{ color: C.matn2, fontSize: 12, marginBottom: 8 }}>{tr('Qo‘shish')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {qolgan.map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => qosh(v)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: C.chegara,
                  }}
                >
                  <Text style={{ color: C.matn2, fontSize: 13 }}>+ {v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
