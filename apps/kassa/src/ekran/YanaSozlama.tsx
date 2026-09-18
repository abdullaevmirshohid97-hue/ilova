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

export default function Sozlama() {
  const { C, rejim, qoy } = useTema();
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
      setXabar('Saqlandi');
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
    Alert.alert(
      'Hisobni o‘chirish',
      `«${men.biznes}» va undagi hamma narsa o‘chadi:\n\n` +
        '· hisoblar va ularning qoldig‘i\n' +
        '· hamma kirim va chiqim yozuvlari\n' +
        '· kontaktlar va qarz tarixi\n' +
        '· kirish hisobingiz\n\n' +
        'Qaytarib bo‘lmaydi. Avval hisobotni Excel’ga chiqarib olishni maslahat beramiz.',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        { text: 'Davom etish', style: 'destructive', onPress: ochirishniTasdiqla },
      ],
    );
  }

  function ochirishniTasdiqla() {
    Alert.alert(
      'Oxirgi tasdiq',
      'Ma’lumot butunlay yo‘q qilinadi. Davom etasizmi?',
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: 'Ha, o‘chirilsin',
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
                'O‘chirildi',
                `${natija.tashkilot ?? 'Hisob'} va ${natija.yozuvlar} ta yozuv o‘chirildi.`,
              );
            } catch (e) {
              Alert.alert('O‘chirilmadi', xatoMatn(e));
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
      <Sarlavha matn="Biznes" />
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
          placeholder="Biznes nomi"
          placeholderTextColor={C.xira}
        />
        {xabar && (
          <Text style={{ color: xabar === 'Saqlandi' ? C.kirim : C.chiqim, fontSize: 13, marginTop: 8 }}>
            {xabar}
          </Text>
        )}
        <Tugma matn="Nomni saqlash" bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 10 }} />
      </View>

      <Sarlavha matn="Ko‘rinish" />
      <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka }}>
        {(
          [
            { k: 'tizim', m: 'Tizim' },
            { k: 'yorug', m: 'Yorug‘' },
            { k: 'qorongi', m: 'Tungi' },
          ] as { k: TemaRejimi; m: string }[]
        ).map((v) => (
          <Chip key={v.k} matn={v.m} tanlangan={rejim === v.k} bos={() => qoy(v.k)} />
        ))}
      </View>

      <Sarlavha matn="Hisob" />
      <Qator nom="Tashkilot" izoh={men.biznes} ong={men.obuna} />
      <Qator nom="Rol" izoh={men.rol === 'admin' ? 'Administrator' : men.rol} />
      <Qator
        nom="Chiqish"
        izoh="Boshqa hisob bilan kirish"
        bos={() =>
          Alert.alert('Chiqish', 'Hisobdan chiqasizmi?', [
            { text: 'Yo‘q', style: 'cancel' },
            { text: 'Chiqish', style: 'destructive', onPress: () => supabase.auth.signOut() },
          ])
        }
      />

      <Sarlavha matn="Xavfli zona" />
      <Qator
        nom="Hisobni o‘chirish"
        izoh="Tashkilot, hisoblar, yozuvlar va kontaktlar — hammasi"
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
