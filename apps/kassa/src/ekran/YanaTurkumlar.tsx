// =============================================================
//  TURKUMLAR — pul nimaga ketdi va nimadan keldi
//
//  Ro'yxatdan o'tganda o'nta turkum tayyor beriladi; bu yerda
//  ular tahrirlanadi. Turkum ham o'chirilmaydi — nofaol bo'ladi,
//  aks holda eski yozuvlar "turkumsiz" bo'lib qolardi.
// =============================================================

import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import type { Turkum } from '@ilova/kassa-yadro';
import { turkumQosh, turkumTahrirla } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Qator, Tanlagich, Tugma } from '../ui/qismlar';
import { tr, trn } from '../lib/til';
import { Ogoh } from '../lib/ogoh';

export default function Turkumlar() {
  const { C } = useTema();
  const { turkumlar, yozuvlar, yangila } = useHolat();
  const [turi, setTuri] = useState<Turkum['turi']>('chiqim');
  const [yangiNom, setYangiNom] = useState('');
  const [kutmoqda, setKutmoqda] = useState(false);

  const royxat = turkumlar.filter((t) => t.turi === turi);

  async function qosh() {
    if (yangiNom.trim().length < 2) return;
    setKutmoqda(true);
    try {
      await turkumQosh(yangiNom, turi);
      setYangiNom('');
      await yangila();
    } catch (e) {
      Ogoh.alert(tr('Xatolik'), xatoMatn(e));
    } finally {
      setKutmoqda(false);
    }
  }

  function yashir(t: Turkum) {
    Ogoh.alert(tr('Turkumni yashirish'), `«${t.nom}» ${tr('yangi yozuvlarda ko‘rinmaydi. Eski yozuvlar o‘zgarmaydi.')}`, [
      { text: tr('Yo‘q'), style: 'cancel' },
      {
        text: tr('Yashirish'),
        onPress: async () => {
          try {
            await turkumTahrirla(t.id, { faol: false });
            await yangila();
          } catch (e) {
            Ogoh.alert(tr('Xatolik'), xatoMatn(e));
          }
        },
      },
    ]);
  }

  return (
    <>
      <View style={{ backgroundColor: C.karta }}>
        <Tanlagich
          qiymat={turi}
          variantlar={[
            { kalit: 'chiqim' as const, matn: tr('Chiqim') },
            { kalit: 'kirim' as const, matn: tr('Kirim') },
          ]}
          qoy={setTuri}
        />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {royxat.map((t) => {
          const soni = yozuvlar.filter((y) => y.turkum_id === t.id && !y.bekor_at).length;
          return (
            <Qator
              key={t.id}
              nom={t.nom}
              izoh={trn('{n} ta yozuv', soni)}
              ong={t.faol ? '' : tr('yashirilgan')}
              sozilgan={!t.faol}
              uzoqBos={() => t.faol && yashir(t)}
            />
          );
        })}
        {royxat.length === 0 && <BoshHolat belgi="□" matn={tr('Turkum yo‘q')} izoh={tr('Pastdan qo‘shing')} />}
        <View style={{ height: 12 }} />
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: C.karta }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: C.fon,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            color: C.matn,
          }}
          value={yangiNom}
          onChangeText={setYangiNom}
          placeholder={turi === 'chiqim' ? tr('Yangi chiqim turkumi') : tr('Yangi kirim turkumi')}
          placeholderTextColor={C.xira}
        />
        <Tugma matn={tr('Qo‘shish')} bos={qosh} kutmoqda={kutmoqda} uslub={{ paddingHorizontal: 18 }} />
      </View>
      <Text style={{ color: C.xira, fontSize: 11, textAlign: 'center', paddingBottom: 10, backgroundColor: C.karta }}>
        Turkumni yashirish uchun uzoq bosing
      </Text>
    </>
  );
}
