// =============================================================
//  BOSH EKRAN — hisoblar, yozuvlar, yig'indi
//
//  Tuzilishi bozordagi "Cash Book" ilovalaridan olingan, chunki u
//  sinovdan o'tgan: yuqorida balans, o'rtada yozuvlar, PASTDA
//  DOIMIY YIG'INDI va ikkita katta tugma. Odam ilovani kuniga
//  o'nlab marta ochadi — har safar qidirmasin.
//
//  Qoldiq bu yerda HISOBLANADI (`@ilova/kassa-yadro`), bazadan
//  tayyor raqam so'ralmaydi: 2-bosqichda ilova internetsiz ham
//  aynan shu ko'rinishda ishlashi kerak.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  davrYigindi,
  formatla,
  hisobQoldiq,
  umumiyBalans,
  yuruvchiQoldiq,
} from '@ilova/kassa-yadro';
import type { Hisob, Turkum, Yozuv, YozuvTuri } from '@ilova/kassa-yadro';
import {
  hisoblarOl,
  turkumlarOl,
  yozuvBekorQil,
  yozuvlarOl,
  yozuvQosh,
  type Men,
} from '../lib/baza';
import { sanaMatn, supabase, xatoMatn } from '../lib/supabase';
import { C, O } from '../lib/tema';
import YozuvOynasi from './YozuvOynasi';

export default function BoshEkran({ men }: { men: Men }) {
  const [hisoblar, setHisoblar] = useState<Hisob[]>([]);
  const [turkumlar, setTurkumlar] = useState<Turkum[]>([]);
  const [yozuvlar, setYozuvlar] = useState<Yozuv[]>([]);
  const [tanlangan, setTanlangan] = useState<string | null>(null); // null = hammasi
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [yangilanmoqda, setYangilanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [oyna, setOyna] = useState<YozuvTuri | null>(null);

  const yukla = useCallback(async () => {
    try {
      setXato(null);
      const [h, t, y] = await Promise.all([hisoblarOl(), turkumlarOl(), yozuvlarOl()]);
      setHisoblar(h);
      setTurkumlar(t);
      setYozuvlar(y);
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setYuklanmoqda(false);
      setYangilanmoqda(false);
    }
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const korinadigan = useMemo(
    () => (tanlangan ? yozuvlar.filter((y) => y.hisob_id === tanlangan) : yozuvlar),
    [yozuvlar, tanlangan],
  );

  const hisob = hisoblar.find((h) => h.id === tanlangan) ?? null;
  const yigindi = useMemo(() => davrYigindi(korinadigan), [korinadigan]);

  // Yuruvchi qoldiq faqat BITTA hisob tanlanganda ma'noli: turli
  // hisoblarning qatorlari aralashsa, ustundagi raqam hech narsani
  // bildirmaydi (va valyutalar ham har xil bo'lishi mumkin).
  const qatorlar = useMemo(() => {
    if (!hisob) return korinadigan.map((y) => ({ yozuv: y, qoldiq: null as number | null }));
    return yuruvchiQoldiq(korinadigan, hisob.boshlangich)
      .reverse()
      .map((x) => ({ yozuv: x.yozuv, qoldiq: x.qoldiq }));
  }, [korinadigan, hisob]);

  const balanslar = useMemo(() => umumiyBalans(hisoblar, yozuvlar), [hisoblar, yozuvlar]);
  const valyuta = hisob?.valyuta ?? 'UZS';

  async function saqla(p: {
    hisob_id: string;
    summa: number;
    turkum_id: string | null;
    izoh: string;
    sana: string;
  }) {
    if (!oyna) return;
    await yozuvQosh({ ...p, turi: oyna });
    await yukla();
  }

  function bekorQil(y: Yozuv) {
    if (y.bekor_at) return;
    Alert.alert(
      'Yozuvni bekor qilish',
      `${formatla(y.summa, y.valyuta)} — bu yozuv hisobdan chiqadi, lekin tarixda qoladi.`,
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: 'Bekor qilish',
          style: 'destructive',
          onPress: async () => {
            try {
              await yozuvBekorQil(y.id, 'ilovadan bekor qilindi');
              await yukla();
            } catch (e) {
              setXato(xatoMatn(e));
            }
          },
        },
      ],
    );
  }

  if (yuklanmoqda) {
    return (
      <View style={s.yuklash}>
        <ActivityIndicator size="large" color={C.tun} />
      </View>
    );
  }

  return (
    <View style={s.tashqi}>
      {/* Sarlavha */}
      <View style={s.sarlavha}>
        <View style={{ flex: 1 }}>
          <Text style={s.biznes} numberOfLines={1}>{men.biznes}</Text>
          <Text style={s.balansYorliq}>Umumiy balans</Text>
          {balanslar.length === 0 ? (
            <Text style={s.balans}>{formatla(0, 'UZS')}</Text>
          ) : (
            balanslar.map((b) => (
              <Text key={b.valyuta} style={s.balans}>
                {formatla(b.qoldiq, b.valyuta)}
              </Text>
            ))
          )}
        </View>
        <TouchableOpacity onPress={() => supabase.auth.signOut()} hitSlop={10}>
          <Text style={s.chiqish}>Chiqish</Text>
        </TouchableOpacity>
      </View>

      {/* Hisoblar */}
      <View style={s.hisoblarQator}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hisoblar}>
          <Chip matn="Hammasi" tanlangan={tanlangan === null} bos={() => setTanlangan(null)} />
          {hisoblar.filter((h) => h.faol).map((h) => (
            <Chip
              key={h.id}
              matn={`${h.nom} · ${formatla(hisobQoldiq(h, yozuvlar), h.valyuta, { kasrsiz: true, belgisiz: true })}`}
              tanlangan={h.id === tanlangan}
              bos={() => setTanlangan(h.id)}
            />
          ))}
        </ScrollView>
      </View>

      {xato && <Text style={s.xato}>{xato}</Text>}

      {/* Yozuvlar */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={yangilanmoqda}
            onRefresh={() => {
              setYangilanmoqda(true);
              yukla();
            }}
          />
        }
      >
        {qatorlar.length === 0 && (
          <View style={s.bosh}>
            <Text style={s.boshBelgi}>↑↓</Text>
            <Text style={s.boshMatn}>Hali yozuv yo‘q</Text>
            <Text style={s.boshIzoh}>Pastdagi «Kirim» yoki «Chiqim» tugmasi bilan boshlang</Text>
          </View>
        )}

        {qatorlar.map(({ yozuv: y, qoldiq }) => {
          const turkum = turkumlar.find((t) => t.id === y.turkum_id);
          const kirim = y.turi === 'kirim';
          return (
            <TouchableOpacity key={y.id} style={s.qator} onLongPress={() => bekorQil(y)} delayLongPress={400}>
              <View style={{ flex: 1 }}>
                <Text style={[s.qatorNom, y.bekor_at && s.bekor]} numberOfLines={1}>
                  {y.izoh || turkum?.nom || (kirim ? 'Kirim' : 'Chiqim')}
                </Text>
                <Text style={s.qatorIzoh} numberOfLines={1}>
                  {sanaMatn(y.sana)}
                  {turkum ? ` · ${turkum.nom}` : ''}
                  {y.bekor_at ? ' · BEKOR QILINGAN' : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    s.qatorSumma,
                    { color: kirim ? C.kirim : C.chiqim },
                    y.bekor_at && s.bekor,
                  ]}
                >
                  {kirim ? '+' : '−'} {formatla(y.summa, y.valyuta, { belgisiz: true })}
                </Text>
                {qoldiq !== null && !y.bekor_at && (
                  <Text style={s.qatorQoldiq}>{formatla(qoldiq, valyuta, { belgisiz: true, kasrsiz: true })}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 12 }} />
      </ScrollView>

      {/* Pastdagi yig'indi — har doim ko'rinadi */}
      <View style={s.yigindi}>
        <View style={s.yigindiQism}>
          <Text style={s.yigindiYorliq}>Kirim</Text>
          <Text style={[s.yigindiSon, { color: C.kirim }]} numberOfLines={1}>
            {formatla(yigindi.kirim, valyuta, { belgisiz: true, kasrsiz: true })}
          </Text>
        </View>
        <View style={s.yigindiQism}>
          <Text style={s.yigindiYorliq}>Chiqim</Text>
          <Text style={[s.yigindiSon, { color: C.chiqim }]} numberOfLines={1}>
            {formatla(yigindi.chiqim, valyuta, { belgisiz: true, kasrsiz: true })}
          </Text>
        </View>
        <View style={s.yigindiQism}>
          <Text style={s.yigindiYorliq}>{hisob ? 'Qoldiq' : 'Farq'}</Text>
          <Text style={s.yigindiSon} numberOfLines={1}>
            {formatla(
              hisob ? hisobQoldiq(hisob, yozuvlar) : yigindi.farq,
              valyuta,
              { belgisiz: true, kasrsiz: true },
            )}
          </Text>
        </View>
      </View>

      {/* Ikki katta tugma */}
      <View style={s.tugmalar}>
        <TouchableOpacity style={[s.katta, { backgroundColor: C.kirim }]} onPress={() => setOyna('kirim')}>
          <Text style={s.kattaMatn}>↑ Kirim</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.katta, { backgroundColor: C.chiqim }]} onPress={() => setOyna('chiqim')}>
          <Text style={s.kattaMatn}>↓ Chiqim</Text>
        </TouchableOpacity>
      </View>

      {oyna && (
        <YozuvOynasi
          turi={oyna}
          hisoblar={hisoblar}
          turkumlar={turkumlar}
          boshHisob={tanlangan}
          yopish={() => setOyna(null)}
          saqla={saqla}
        />
      )}
    </View>
  );
}

function Chip({ matn, tanlangan, bos }: { matn: string; tanlangan: boolean; bos: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, tanlangan && s.chipTanlangan]} onPress={bos}>
      <Text style={[s.chipMatn, tanlangan && s.chipMatnTanlangan]} numberOfLines={1}>
        {matn}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  tashqi: { flex: 1, backgroundColor: C.fon },
  yuklash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.fon },

  sarlavha: {
    backgroundColor: C.tun, paddingTop: 48, paddingBottom: 18, paddingHorizontal: O.chekka,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  biznes: { color: '#C7D2E0', fontSize: 14, fontWeight: '600' },
  balansYorliq: { color: '#7C8CA1', fontSize: 12, marginTop: 10 },
  balans: { color: '#F2F4F7', fontSize: 26, fontWeight: '800', marginTop: 2 },
  chiqish: { color: '#8A97A8', fontSize: 13 },

  hisoblarQator: { backgroundColor: C.karta, borderBottomWidth: 1, borderBottomColor: C.chegara },
  hisoblar: { paddingHorizontal: O.chekka, paddingVertical: 10 },
  chip: {
    backgroundColor: C.fon, borderWidth: 1, borderColor: C.chegara,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, maxWidth: 220,
  },
  chipTanlangan: { backgroundColor: C.tun, borderColor: C.tun },
  chipMatn: { color: C.matn2, fontSize: 13 },
  chipMatnTanlangan: { color: '#fff', fontWeight: '600' },

  xato: { color: C.chiqim, fontSize: 13, padding: O.chekka, backgroundColor: C.chiqimYumshoq },

  bosh: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  boshBelgi: { fontSize: 40, color: C.xira, letterSpacing: -4 },
  boshMatn: { color: C.matn2, fontSize: 16, fontWeight: '600', marginTop: 12 },
  boshIzoh: { color: C.xira, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  qator: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.karta,
    paddingHorizontal: O.chekka, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: C.ajratgich,
  },
  qatorNom: { color: C.matn, fontSize: 15, fontWeight: '600' },
  qatorIzoh: { color: C.xira, fontSize: 12, marginTop: 3 },
  qatorSumma: { fontSize: 15, fontWeight: '700' },
  qatorQoldiq: { color: C.xira, fontSize: 11, marginTop: 3 },
  bekor: { textDecorationLine: 'line-through', opacity: 0.55 },

  yigindi: {
    flexDirection: 'row', backgroundColor: C.karta,
    borderTopWidth: 1, borderTopColor: C.chegara, paddingVertical: 10,
  },
  yigindiQism: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  yigindiYorliq: { color: C.xira, fontSize: 11 },
  yigindiSon: { color: C.matn, fontSize: 15, fontWeight: '700', marginTop: 2 },

  tugmalar: { flexDirection: 'row', padding: 10, gap: 10, backgroundColor: C.karta },
  katta: { flex: 1, paddingVertical: 15, borderRadius: O.radiusKichik, alignItems: 'center' },
  kattaMatn: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
