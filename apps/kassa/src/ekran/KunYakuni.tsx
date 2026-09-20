// =============================================================
//  KUN YAKUNI — kassani sanash
//
//  Do'kondor kunni baribir yopadi: kechqurun kassani ochib, pulni
//  sanaydi. Bu ish ALLAQACHON qilinadi, shunchaki qog'ozda yoki
//  boshda. Ilova o'sha marosimni o'z ichiga oladi — va shu bilan
//  kunda bir marta ochilishning sababi bo'ladi.
//
//  Ikkinchi foydasi ma'lumot sifatida: farq chiqsa, demak bir
//  yozuv tushmay qolgan. Farqni kunida topish oy oxirida
//  «hisob to'g'ri kelmayapti» deb bosh qotirishdan ancha oson.
//
//  YANGI JADVAL YO'Q: farq oddiy yozuv bo'lib tushadi. Daftar
//  qo'shib yozadigan (append-only) bo'lib qoladi va qoldiq
//  har doim yozuvlardan hisoblanaveradi — bu loyihaning asosiy
//  qoidasi, uni sanoq uchun buzish mumkin emas.
// =============================================================

import { useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { davrYigindi, formatla, hisobQoldiq, ifodaHisobla } from '@ilova/kassa-yadro';
import type { Hisob } from '@ilova/kassa-yadro';
import { yozuvQosh } from '../lib/baza';
import { davrOraligi, oraliqdami } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { O, useTema } from '../lib/tema';
import { tr, trn } from '../lib/til';
import { xatoYoz } from '../lib/xatolar';
import { Chip, Karta, Tugma } from '../ui/qismlar';

export default function KunYakuni({
  yopish,
  yakunlandi,
}: {
  yopish: () => void;
  yakunlandi: () => void;
}) {
  const { C } = useTema();
  const { hisoblar, yozuvlar, yangila } = useHolat();
  const chekka = useSafeAreaInsets();

  // Sanaladigan hisob — naqd. Kartadagi pulni qo'lda sanab
  // bo'lmaydi, shuning uchun standart holatda naqd tanlanadi.
  const naqdlar = useMemo(
    () => hisoblar.filter((h) => h.faol && h.valyuta === (hisoblar[0]?.valyuta ?? 'UZS')),
    [hisoblar],
  );
  const [hisobId, setHisobId] = useState(
    naqdlar.find((h) => h.turi === 'naqd')?.id ?? naqdlar[0]?.id ?? '',
  );
  const hisob: Hisob | undefined = hisoblar.find((h) => h.id === hisobId);

  const [kiritilgan, setKiritilgan] = useState('');
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const bugun = useMemo(() => davrOraligi('kun', 0), []);
  const bugungi = useMemo(
    () => yozuvlar.filter((y) => oraliqdami(y.sana, bugun)),
    [yozuvlar, bugun],
  );
  const yigindi = useMemo(() => davrYigindi(bugungi), [bugungi]);
  const kutilgan = hisob ? hisobQoldiq(hisob, yozuvlar) : 0;

  const sanalgan = useMemo(() => ifodaHisobla(kiritilgan), [kiritilgan]);
  const farq = sanalgan === null ? null : sanalgan - kutilgan;

  async function saqla() {
    if (!hisob) return setXato(tr('Hisobni tanlang.'));
    if (sanalgan === null) return setXato(tr('Summani kiriting.'));
    setXato(null);
    setSaqlanmoqda(true);
    try {
      // Farq bo'lsa — to'g'rilash yozuvi. Nolga teng bo'lsa hech
      // narsa yozilmaydi: bo'sh yozuv daftarni faqat shovqinga
      // to'ldiradi.
      if (farq !== null && farq !== 0) {
        await yozuvQosh({
          hisob_id: hisob.id,
          turi: farq > 0 ? 'kirim' : 'chiqim',
          summa: Math.abs(farq),
          turkum_id: null,
          klient_id: null,
          izoh: tr('Kassa sanog‘i'),
          sana: new Date().toISOString(),
        });
        await yangila();
      }
      yakunlandi();
      yopish();
    } catch (e) {
      void xatoYoz('KunYakuni.saqla', e);
      setXato(xatoMatn(e));
      setSaqlanmoqda(false);
    }
  }

  const valyuta = hisob?.valyuta ?? 'UZS';

  return (
    <Modal visible animationType="slide" onRequestClose={yopish} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: C.fon,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '92%',
            width: '100%',
            maxWidth: 520,
            alignSelf: 'center',
            paddingBottom: chekka.bottom,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: C.tun,
              paddingHorizontal: O.chekka,
              paddingVertical: 14,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: C.tunMatn, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ color: C.tunMatn, fontSize: 17, fontWeight: '700' }}>
              {tr('Kun yakuni')}
            </Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Bugun nima bo'ldi */}
            <View style={{ padding: O.chekka }}>
              <Text style={{ color: C.xira, fontSize: 12, marginBottom: 8 }}>
                {trn('{n} ta yozuv', bugungi.length)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Karta uslub={{ flex: 1, paddingVertical: 12 }}>
                  <Text style={{ color: C.xira, fontSize: 11 }}>{tr('Kirim')}</Text>
                  <Text
                    style={{ color: C.kirim, fontSize: 15, fontWeight: '800', marginTop: 3 }}
                    numberOfLines={1}
                  >
                    {formatla(yigindi.kirim, valyuta, { belgisiz: true, kasrsiz: true })}
                  </Text>
                </Karta>
                <Karta uslub={{ flex: 1, paddingVertical: 12 }}>
                  <Text style={{ color: C.xira, fontSize: 11 }}>{tr('Chiqim')}</Text>
                  <Text
                    style={{ color: C.chiqim, fontSize: 15, fontWeight: '800', marginTop: 3 }}
                    numberOfLines={1}
                  >
                    {formatla(yigindi.chiqim, valyuta, { belgisiz: true, kasrsiz: true })}
                  </Text>
                </Karta>
              </View>
            </View>

            {/* Qaysi hisob sanaladi */}
            {/* tanlovsiz-mayli: bitta naqd hisob bo‘lsa tanlaydigan
          narsa yo‘q — u o‘zi tanlangan bo‘lib turadi. */}
            {naqdlar.length > 1 && (
              <View style={{ paddingHorizontal: O.chekka, paddingBottom: 6 }}>
                <Text style={{ color: C.matn2, fontSize: 13, marginBottom: 8 }}>{tr('Hisob')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {naqdlar.map((h) => (
                    <View key={h.id} style={{ marginBottom: 8 }}>
                      <Chip matn={h.nom} tanlangan={h.id === hisobId} bos={() => setHisobId(h.id)} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Sanoq */}
            <View style={{ paddingHorizontal: O.chekka }}>
              <Text style={{ color: C.matn2, fontSize: 13, marginBottom: 8 }}>
                {tr('Kassada haqiqatda qancha bor?')}
              </Text>
              <TextInput
                style={{
                  backgroundColor: C.karta,
                  borderWidth: 1,
                  borderColor: C.chegara,
                  borderRadius: O.radiusKichik,
                  paddingHorizontal: 14,
                  minHeight: 52,
                  fontSize: 20,
                  fontWeight: '700',
                  color: C.matn,
                  textAlign: 'right',
                }}
                value={kiritilgan}
                onChangeText={(x) => {
                  setXato(null);
                  setKiritilgan(x);
                }}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={C.xira}
              />
              <Text style={{ color: C.xira, fontSize: 11, marginTop: 6 }}>
                {tr('Pulni sanang va shu yerga yozing')}
              </Text>
            </View>

            {/* Natija */}
            <View style={{ paddingHorizontal: O.chekka, marginTop: 16 }}>
              <Karta>
                <Qator2 yorliq={tr('Daftar bo‘yicha')} qiymat={formatla(kutilgan, valyuta)} rang={C.matn2} />
                {sanalgan !== null && (
                  <Qator2 yorliq={tr('Sanalgan')} qiymat={formatla(sanalgan, valyuta)} rang={C.matn} />
                )}
                {farq !== null && (
                  <View style={{ borderTopWidth: 1, borderTopColor: C.ajratgich, marginTop: 8, paddingTop: 8 }}>
                    <Qator2
                      yorliq={tr('Farq')}
                      qiymat={(farq > 0 ? '+' : '') + formatla(farq, valyuta)}
                      rang={farq === 0 ? C.kirim : farq > 0 ? C.kirim : C.chiqim}
                      qalin
                    />
                  </View>
                )}
              </Karta>

              {/* Farq nimani anglatishini ochiq aytamiz: odam "ilova
                  xato hisoblabdi" deb o'ylamasin */}
              {farq !== null && farq !== 0 && (
                <Text style={{ color: C.xira, fontSize: 12, marginTop: 10, lineHeight: 18 }}>
                  {farq > 0
                    ? tr('Kassada daftardagidan ko‘p. Ehtimol bir kirim yozilmagan — farq «Kassa sanog‘i» yozuvi bo‘lib tushadi.')
                    : tr('Kassada daftardagidan kam. Ehtimol bir chiqim yozilmagan — farq «Kassa sanog‘i» yozuvi bo‘lib tushadi.')}
                </Text>
              )}
              {farq === 0 && (
                <Text style={{ color: C.kirim, fontSize: 13, marginTop: 10, fontWeight: '600' }}>
                  {tr('Hammasi to‘g‘ri keldi.')}
                </Text>
              )}

              {xato && (
                <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 10 }}>{xato}</Text>
              )}

              <Tugma
                matn={farq === null || farq === 0 ? tr('Kunni yopish') : tr('Farqni yozib, yopish')}
                bos={saqla}
                kutmoqda={saqlanmoqda}
                uslub={{ marginTop: 18 }}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Qator2({
  yorliq,
  qiymat,
  rang,
  qalin,
}: {
  yorliq: string;
  qiymat: string;
  rang: string;
  qalin?: boolean;
}) {
  const { C } = useTema();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: C.xira, fontSize: 13 }}>{yorliq}</Text>
      <Text style={{ color: rang, fontSize: qalin ? 16 : 14, fontWeight: qalin ? '800' : '600' }}>
        {qiymat}
      </Text>
    </View>
  );
}
