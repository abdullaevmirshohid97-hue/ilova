// =============================================================
//  SOZLAMALAR — biznes nomi, ko‘rinish, hisobdan chiqish
// =============================================================

import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { biznesNomiQoy, hisobniOchir } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { supabase, xatoMatn } from '../lib/supabase';
import { O, useTema, type TemaRejimi } from '../lib/tema';
import { Chip, Qator, Sarlavha, Tugma } from '../ui/qismlar';
import { tr, trn, useTil, type Til } from '../lib/til';

export default function Sozlama() {
  const { C, rejim, qoy } = useTema();
  const { til, qoy: tilQoy } = useTil();
  const { men, nomniQoy } = useHolat();
  const [nom, setNom] = useState(men.biznes);
  const [kutmoqda, setKutmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  async function saqla() {
    setKutmoqda(true);
    setXabar(null);
    try {
      const yangi = await biznesNomiQoy(nom);
      nomniQoy(yangi);
      setXabar(tr('Saqlandi'));
    } catch (e) {
      setXabar(xatoMatn(e));
    } finally {
      setKutmoqda(false);
    }
  }

  /**
   * Hisobni o'chirish — IKKI QADAM.
   *
   * Bitta "ishonchingiz komilmi" yetarli emas: odam odatlanib,
   * o'qimasdan bosadi. Ikkinchi oynada nima yo'qolishi ro'yxat
   * bilan yoziladi va tugma matni ham boshqacha.
   */
  function ochirishniBoshla() {
    Alert.alert(tr('Hisobni o‘chirish'),
      `«${men.biznes}» ${tr('va undagi hamma narsa o‘chadi:')}\n\n` +
        tr('· hisoblar va ularning qoldig‘i') + '\n' +
        tr('· hamma kirim va chiqim yozuvlari') + '\n' +
        tr('· kontaktlar va qarz tarixi') + '\n' +
        tr('· kirish hisobingiz') + '\n\n' +
        tr('Qaytarib bo‘lmaydi. Avval hisobotni Excel’ga chiqarib olishni maslahat beramiz.'),
      [
        { text: tr('Bekor qilish'), style: 'cancel' },
        { text: tr('Davom etish'), style: 'destructive', onPress: ochirishniTasdiqla },
      ],
    );
  }

  function ochirishniTasdiqla() {
    Alert.alert(
      tr('Oxirgi tasdiq'),
      tr('Ma’lumot butunlay yo‘q qilinadi. Davom etasizmi?'),
      [
        { text: tr('Yo‘q'), style: 'cancel' },
        {
          text: tr('Ha, o‘chirilsin'),
          style: 'destructive',
          onPress: async () => {
            setKutmoqda(true);
            try {
              const natija = await hisobniOchir();
              // Sessiyani ham tozalaymiz: auth hisobi allaqachon yo'q,
              // lekin qurilmadagi token qolib, ilova "xato" ekranida
              // osilib turardi.
              await supabase.auth.signOut();
              Alert.alert(
                tr('O‘chirildi'),
                `${natija.tashkilot ?? tr('Hisob')} — ${trn('{n} ta yozuv o‘chirildi.', natija.yozuvlar)}`,
              );
            } catch (e) {
              Alert.alert(tr('O‘chirilmadi'), xatoMatn(e));
            } finally {
              setKutmoqda(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <Sarlavha matn={tr('Biznes')} />
      <View style={{ paddingHorizontal: O.chekka }}>
        <TextInput
          style={{
            backgroundColor: C.karta,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            paddingHorizontal: 12,
            paddingVertical: 11,
            fontSize: 15,
            color: C.matn,
          }}
          value={nom}
          onChangeText={setNom}
          placeholder={tr('Biznes nomi')}
          placeholderTextColor={C.xira}
        />
        {xabar && (
          <Text style={{ color: xabar === tr('Saqlandi') ? C.kirim : C.chiqim, fontSize: 13, marginTop: 8 }}>
            {xabar}
          </Text>
        )}
        <Tugma matn={tr('Nomni saqlash')} bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 10 }} />
      </View>

      <Sarlavha matn={tr('Ko‘rinish')} />
      <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka }}>
        {(
          [
            { k: 'tizim', m: tr('Tizim') },
            { k: 'yorug', m: tr('Yorug‘') },
            { k: 'qorongi', m: tr('Tungi') },
          ] as { k: TemaRejimi; m: string }[]
        ).map((v) => (
          <Chip key={v.k} matn={v.m} tanlangan={rejim === v.k} bos={() => qoy(v.k)} />
        ))}
      </View>

      {/* Til — ko‘rinishning yonida: ikkalasi ham «ilova qanday
          ko‘rinadi» degan bitta savolga javob beradi */}
      <Sarlavha matn={tr('Til')} />
      <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka }}>
        {(
          [
            { k: 'uz', m: tr('O‘zbekcha') },
            { k: 'ru', m: tr('Ruscha') },
          ] as { k: Til; m: string }[]
        ).map((v) => (
          <Chip key={v.k} matn={v.m} tanlangan={til === v.k} bos={() => tilQoy(v.k)} />
        ))}
      </View>

      <Sarlavha matn={tr('Hisob')} />
      <Qator nom={tr('Tashkilot')} izoh={men.biznes} ong={men.obuna} />
      <Qator nom={tr('Rol')} izoh={men.rol === 'admin' ? tr('Administrator') : men.rol} />
      <Qator
        nom={tr('Chiqish')}
        izoh={tr('Boshqa hisob bilan kirish')}
        bos={() =>
          Alert.alert(tr('Chiqish'), tr('Hisobdan chiqasizmi?'), [
            { text: tr('Yo‘q'), style: 'cancel' },
            { text: tr('Chiqish'), style: 'destructive', onPress: () => supabase.auth.signOut() },
          ])
        }
      />

      <Sarlavha matn={tr('Xavfli zona')} />
      <Qator
        nom={tr('Hisobni o‘chirish')}
        izoh={tr('Tashkilot, hisoblar, yozuvlar va kontaktlar — hammasi')}
        ongRang={C.chiqim}
        ong="›"
        bos={ochirishniBoshla}
      />

      <View style={{ padding: O.chekka, paddingTop: 20 }}>
        <Text style={{ color: C.xira, fontSize: 11, lineHeight: 17 }}>
          Ma'lumotlaringiz bulutda saqlanadi va faqat sizga ko‘rinadi. Hisobni
          o‘chirsangiz, ular butunlay yo‘q qilinadi va qaytarib bo‘lmaydi.
        </Text>
      </View>
    </ScrollView>
  );
}
