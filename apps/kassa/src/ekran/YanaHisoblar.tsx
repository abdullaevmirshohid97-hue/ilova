// =============================================================
//  HISOBLAR — pul qayerda turadi
//
//  Naqd, karta, bank... Har birining boshlang'ich qoldig'i bor,
//  keyingi hammasi yozuvlardan hisoblanadi. Hisob O‘CHIRILMAYDI,
//  faqat nofaol qilinadi: uning ostidagi yozuvlar tarixda qoladi.
// =============================================================

import { useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatla, hisobQoldiq, ifodaHisobla, tiyinga } from '@ilova/kassa-yadro';
import type { Hisob } from '@ilova/kassa-yadro';
import { hisobQosh, hisobTahrirla } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Chip, Qator, Tugma } from '../ui/qismlar';
import { tr } from '../lib/til';

export default function Hisoblar({ kochirma }: { kochirma: () => void }) {
  const { C } = useTema();
  const { hisoblar, yozuvlar, yangila } = useHolat();
  const [oyna, setOyna] = useState<Hisob | 'yangi' | null>(null);

  return (
    <>
      <ScrollView style={{ flex: 1 }}>
        {hisoblar.map((h) => (
          <Qator
            key={h.id}
            nom={h.nom}
            izoh={`${tr(h.turi)}${h.faol ? '' : ' · ' + tr('yashirilgan')}`}
            ong={formatla(hisobQoldiq(h, yozuvlar), h.valyuta, { kasrsiz: true })}
            ongIzoh={h.valyuta}
            sozilgan={!h.faol}
            bos={() => setOyna(h)}
          />
        ))}
        {hisoblar.length === 0 && <BoshHolat belgi="□" matn={tr('Hisob yo‘q')} />}
        <View style={{ height: 12 }} />
      </ScrollView>
      <View style={{ padding: 10, gap: 8, backgroundColor: C.karta }}>
        <Tugma matn={tr('+ Hisob qo‘shish')} bos={() => setOyna('yangi')} />
        <Tugma matn={tr('Hisoblararo o‘tkazma')} ikkilamchi bos={kochirma} />
      </View>
      {oyna && (
        <HisobOynasi
          hisob={oyna === 'yangi' ? null : oyna}
          yopish={() => setOyna(null)}
          saqlandi={async () => {
            setOyna(null);
            await yangila();
          }}
        />
      )}
    </>
  );
}

function HisobOynasi({
  hisob,
  yopish,
  saqlandi,
}: {
  hisob: Hisob | null;
  yopish: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();
  const [nom, setNom] = useState(hisob?.nom ?? '');
  const [turi, setTuri] = useState<Hisob['turi']>(hisob?.turi ?? 'naqd');
  const [valyuta, setValyuta] = useState<Hisob['valyuta']>(hisob?.valyuta ?? 'UZS');
  const [boshlangich, setBoshlangich] = useState(hisob ? String(hisob.boshlangich / 100) : '');
  const [kutmoqda, setKutmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  async function saqla() {
    if (nom.trim().length < 1) return setXato(tr('Nomni kiriting.'));
    const boshTiyin = boshlangich.trim() ? (ifodaHisobla(boshlangich) ?? tiyinga(boshlangich)) : 0;
    setKutmoqda(true);
    try {
      if (hisob) await hisobTahrirla(hisob.id, { nom, turi, boshlangich: boshTiyin });
      else await hisobQosh({ nom, turi, valyuta, boshlangich: boshTiyin });
      saqlandi();
    } catch (e) {
      setXato(xatoMatn(e));
      setKutmoqda(false);
    }
  }

  function yashir() {
    if (!hisob) return;
    Alert.alert(
      hisob.faol ? tr('Hisobni yashirish') : tr('Hisobni qaytarish'),
      hisob.faol
        ? tr('Hisob ro‘yxatdan olib tashlanadi. Yozuvlari va qoldig‘i saqlanadi — istalgan vaqt qaytarasiz.')
        : tr('Hisob yana ro‘yxatda ko‘rinadi.'),
      [
        { text: tr('Yo‘q'), style: 'cancel' },
        {
          text: hisob.faol ? tr('Yashirish') : tr('Qaytarish'),
          onPress: async () => {
            try {
              await hisobTahrirla(hisob.id, { faol: !hisob.faol });
              saqlandi();
            } catch (e) {
              Alert.alert(tr('Xatolik'), xatoMatn(e));
            }
          },
        },
      ],
    );
  }

  const maydon = {
    backgroundColor: C.fon,
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.matn,
    marginTop: 8,
  };

  return (
    <Modal visible animationType="slide" onRequestClose={yopish} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: C.karta,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: O.chekka,
            paddingBottom: 28,
            width: '100%',
            maxWidth: 520,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: C.matn, fontSize: 17, fontWeight: '800' }}>
              {hisob ? tr('Hisobni tahrirlash') : tr('Yangi hisob')}
            </Text>
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: C.matn2, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12 }}>{tr('Nom')}</Text>
          <TextInput style={maydon} value={nom} onChangeText={setNom} placeholder={tr('Naqd, Karta, Bank...')} placeholderTextColor={C.xira} />

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12, marginBottom: 4 }}>{tr('Turi')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
            {/* Qiymat bazaga o‘zgarmas holda yoziladi, ekranda esa
                tarjima ko‘rinadi */}
            {(['naqd', 'karta', 'bank', 'boshqa'] as const).map((x) => (
              <Chip key={x} matn={tr(x)} tanlangan={turi === x} bos={() => setTuri(x)} />
            ))}
          </View>

          {!hisob && (
            <>
              <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12, marginBottom: 4 }}>{tr('Valyuta')}</Text>
              <View style={{ flexDirection: 'row' }}>
                {(['UZS', 'USD'] as const).map((v) => (
                  <Chip key={v} matn={v} tanlangan={valyuta === v} bos={() => setValyuta(v)} />
                ))}
              </View>
            </>
          )}

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12 }}>
            {tr('Boshlang‘ich qoldiq')}{hisob ? '' : ' ' + tr('(hozir hisobda qancha bor)')}
          </Text>
          <TextInput
            style={maydon}
            value={boshlangich}
            onChangeText={setBoshlangich}
            placeholder="0"
            placeholderTextColor={C.xira}
            keyboardType="numeric"
          />

          {xato && <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 12 }}>{xato}</Text>}

          <Tugma matn={tr('Saqlash')} bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 18 }} />
          {hisob && (
            <TouchableOpacity onPress={yashir} style={{ alignItems: 'center', marginTop: 14 }}>
              <Text style={{ color: C.xira, fontSize: 13 }}>
                {hisob.faol ? tr('Hisobni yashirish') : tr('Hisobni qaytarish')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
