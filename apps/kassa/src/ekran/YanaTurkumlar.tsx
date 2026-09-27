// =============================================================
//  TURKUMLAR — pul nimaga ketdi va nimadan keldi
//
//  Ro'yxatdan o'tganda o'nta turkum tayyor beriladi; bu yerda
//  ular tahrirlanadi va O'CHIRILADI.
//
//  O'CHIRISH = `faol: false`. Bazadan qator olinmaydi, ikki sababga
//  ko'ra:
//    1. Sinx faqat `qosh` va `tahrir` ni biladi — o'chirish amali
//       yo'q. Bazadan olingan turkum boshqa telefonlarga «o'chdi»
//       deb yetib bormasdi va u yerda abadiy qolardi.
//    2. `kassa_yozuvlar.turkum_id` — `on delete restrict`. Eski
//       yozuvlar hisobotda turkum NOMI bilan ko'rinishi kerak.
//
//  Lekin foydalanuvchi uchun bu HAQIQIY o'chirish: tugma ko'rinib
//  turadi (avval uzoq bosish kerak edi va uni hech kim topmasdi),
//  turkum ro'yxatdan yo'qoladi (avval kulrang bo'lib qolib
//  ketardi) va yangi yozuvda tanlanmaydi. Adashib o'chirilgani
//  pastdagi «O'chirilganlar» dan qaytariladi — tayyor shablonlarni
//  qayta yozishga to'g'ri kelmaydi.
// =============================================================

import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Turkum } from '@ilova/kassa-yadro';
import { turkumQosh, turkumTahrirla } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Tanlagich, Tugma } from '../ui/qismlar';
import { Chiqindi } from '../ui/ikonka';
import { tr, trn } from '../lib/til';
import { Ogoh } from '../lib/ogoh';

export default function Turkumlar() {
  const { C } = useTema();
  // HAMMASI kerak: pastdagi «O‘chirilganlar» faqat shundan to‘ladi.
  // `turkumlar` faqat faollarni beradi va bo‘lim abadiy bo‘sh edi.
  const { barchaTurkumlar: turkumlar, yozuvlar, yangila } = useHolat();
  const [turi, setTuri] = useState<Turkum['turi']>('chiqim');
  const [yangiNom, setYangiNom] = useState('');
  const [kutmoqda, setKutmoqda] = useState(false);
  const [ochirilganlarOchiq, setOchirilganlarOchiq] = useState(false);

  const faollar = turkumlar.filter((t) => t.turi === turi && t.faol);
  const ochirilganlar = turkumlar.filter((t) => t.turi === turi && !t.faol);

  /** Har turkumdagi yozuvlar soni — bir marta hisoblanadi */
  const sonlar = useMemo(() => {
    const m = new Map<string, number>();
    for (const y of yozuvlar) {
      if (!y.turkum_id || y.bekor_at) continue;
      m.set(y.turkum_id, (m.get(y.turkum_id) ?? 0) + 1);
    }
    return m;
  }, [yozuvlar]);

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

  async function faolQoy(t: Turkum, faol: boolean) {
    try {
      await turkumTahrirla(t.id, { faol });
      await yangila();
    } catch (e) {
      Ogoh.alert(tr('Xatolik'), xatoMatn(e));
    }
  }

  function ochir(t: Turkum) {
    const soni = sonlar.get(t.id) ?? 0;
    // Yozuvi bor turkumda odam «yozuvlarim ham o'chadimi» deb
    // qo'rqadi — shuning uchun aniq aytamiz: yo'q.
    const izoh =
      soni > 0
        ? trn('Unga yozilgan {n} ta yozuv joyida qoladi va hisobotda shu nom bilan ko‘rinadi.', soni)
        : tr('Yangi yozuvda endi tanlanmaydi.');
    Ogoh.alert(`«${t.nom}» ${tr('o‘chirilsinmi?')}`, izoh, [
      { text: tr('Yo‘q'), style: 'cancel' },
      { text: tr('O‘chirish'), onPress: () => void faolQoy(t, false) },
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
        {faollar.map((t) => (
          <TurkumQatori key={t.id} nom={t.nom} soni={sonlar.get(t.id) ?? 0}>
            <TouchableOpacity
              onPress={() => ochir(t)}
              hitSlop={8}
              style={{ padding: 8 }}
              accessibilityLabel={tr('O‘chirish')}
            >
              <Chiqindi rang={C.chiqim} olcham={18} />
            </TouchableOpacity>
          </TurkumQatori>
        ))}
        {faollar.length === 0 && <BoshHolat belgi="□" matn={tr('Turkum yo‘q')} izoh={tr('Pastdan qo‘shing')} />}

        {ochirilganlar.length > 0 && (
          <>
            <TouchableOpacity
              onPress={() => setOchirilganlarOchiq((x) => !x)}
              style={{ paddingHorizontal: O.chekka, paddingVertical: 14, marginTop: 8 }}
            >
              <Text style={{ color: C.xira, fontSize: 13, fontWeight: '600' }}>
                {ochirilganlarOchiq ? '▾' : '▸'} {tr('O‘chirilganlar')} · {ochirilganlar.length}
              </Text>
            </TouchableOpacity>
            {ochirilganlarOchiq &&
              ochirilganlar.map((t) => (
                <TurkumQatori key={t.id} nom={t.nom} soni={sonlar.get(t.id) ?? 0} xira>
                  <TouchableOpacity onPress={() => void faolQoy(t, true)} hitSlop={8} style={{ padding: 8 }}>
                    <Text style={{ color: C.faol, fontSize: 14, fontWeight: '700' }}>{tr('Qaytarish')}</Text>
                  </TouchableOpacity>
                </TurkumQatori>
              ))}
          </>
        )}
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
          returnKeyType="done"
          onSubmitEditing={() => void qosh()}
        />
        <Tugma matn={tr('Qo‘shish')} bos={qosh} kutmoqda={kutmoqda} uslub={{ paddingHorizontal: 18 }} />
      </View>
    </>
  );
}

function TurkumQatori({
  nom,
  soni,
  xira,
  children,
}: {
  nom: string;
  soni: number;
  xira?: boolean;
  children: React.ReactNode;
}) {
  const { C } = useTema();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: O.chekka,
        paddingRight: O.chekka - 8,
        paddingVertical: 10,
        backgroundColor: C.karta,
        borderBottomWidth: 1,
        borderBottomColor: C.ajratgich,
        opacity: xira ? 0.6 : 1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.matn, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {nom}
        </Text>
        <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }}>{trn('{n} ta yozuv', soni)}</Text>
      </View>
      {children}
    </View>
  );
}
