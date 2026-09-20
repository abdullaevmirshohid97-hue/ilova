// =============================================================
//  TO'LOV OYNASI
//
//  «Pul oldim» va «Pul berdim» shu yerga tushadi. Bitim bilan ham,
//  bitimsiz ham ishlaydi: bozorda «Tonirokka 500 ming berdim»
//  deyiladi, qaysi bitimga tegishli ekani aytilmaydi. Hamkor esa
//  har doim ma'lum.
//
//  Tepada hamkorning JORIY QOLDIG'I turadi va to'lovdan keyin
//  qancha qolishi ko'rsatiladi. Odam raqamni saqlashdan oldin
//  ko'rsa, noto'g'ri summa kamdan-kam o'tadi.
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bitimQoldiq, formatla, hamkorQoldiq, ifodaKorinish, tiyinga } from '@ilova/kassa-yadro';
import type { BitimYonalish } from '@ilova/kassa-yadro';
import { tolovQosh } from '../lib/baza';
import { sanaQisqa } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { xatoYoz } from '../lib/xatolar';
import { Chip, Karta, Tugma } from '../ui/qismlar';
import { MuddatMaydoni } from '../ui/MuddatMaydoni';

const USULLAR: { k: 'naqd' | 'karta' | 'bank' | 'tovar'; m: string }[] = [
  { k: 'naqd', m: 'Naqd' },
  { k: 'karta', m: 'Karta' },
  { k: 'bank', m: 'Bank' },
];

export default function TolovOynasi({
  yonalish,
  boshKlient,
  boshBitim,
  yopish,
  saqlandi,
}: {
  yonalish: BitimYonalish;
  boshKlient?: string | null;
  boshBitim?: string | null;
  yopish: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();
  const { hisoblar, klientlar, bitimlar, tolovlar, valyutalar } = useHolat();
  const chekka = useSafeAreaInsets();

  const faolHisoblar = hisoblar.filter((h) => h.faol);
  const [klientId, setKlientId] = useState<string | null>(boshKlient ?? null);
  const [bitimId, setBitimId] = useState<string | null>(boshBitim ?? null);
  const [qidiruv, setQidiruv] = useState('');
  const [summa, setSumma] = useState('');
  const [hisobId, setHisobId] = useState(faolHisoblar[0]?.id ?? '');
  const [usuli, setUsuli] = useState<'naqd' | 'karta' | 'bank' | 'tovar'>('naqd');
  const [izoh, setIzoh] = useState('');
  const [muddat, setMuddat] = useState<string | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const klient = klientlar.find((k) => k.id === klientId);
  // Valyuta: hamkorniki standart, lekin ALMASHTIRSA bo‘ladi —
  // bir hamkor bilan ham so‘mda, ham dollarda ishlash odatiy.
  const boshValyuta = klient?.valyuta ?? hisoblar[0]?.valyuta ?? 'UZS';
  const [valyuta, setValyuta] = useState(boshValyuta);
  const [qoldaTanlandi, setQoldaTanlandi] = useState(false);

  // Hamkor almashsa valyuta unga moslanadi — lekin odam qo‘lda
  // tanlagan bo‘lsa tegilmaydi: tanlovini bekor qilish
  // kutilmagan bo‘lardi.
  useEffect(() => {
    if (!qoldaTanlandi) setValyuta(boshValyuta);
  }, [boshValyuta, qoldaTanlandi]);

  // KURS shu yerda olinadi va yozuvga NUSXALANADI. Ertaga kurs
  // o‘zgarsa, bu yozuv o‘zgarmaydi — kelishuv o‘sha kunniki.
  // Ro‘yxat bo‘sh bo‘lsa (migratsiya hali qo‘llanmagan yoki
  // yangi biznes) hisoblardagi valyutalardan yig‘amiz: ilova
  // valyutasiz ham ishlashi kerak.
  const valyutaRoyxat = useMemo(() => {
    if (valyutalar.length > 0) return valyutalar;
    const bor = [...new Set(hisoblar.map((h) => h.valyuta))];
    return bor.map((v) => ({
      id: v,
      valyuta: v,
      kurs: 1,
      asosiy: v === bor[0],
      faol: true,
      versiya: 1,
    }));
  }, [valyutalar, hisoblar]);

  const kurs = valyutaRoyxat.find((v) => v.valyuta === valyuta)?.kurs ?? 1;
  const tiyin = tiyinga(summa);

  const joriy = useMemo(
    () => (klientId ? hamkorQoldiq(klientId, bitimlar, tolovlar) : 0),
    [klientId, bitimlar, tolovlar],
  );

  // To'lov shu hamkorning YOPILMAGAN va TESKARI yo'nalishdagi
  // bitimlariga bog'lanishi mumkin. Bir xil yo'nalishdagisi
  // ko'rsatilmaydi — u qarzni kamaytirmaydi, oshiradi.
  const ochiqBitimlar = useMemo(() => {
    if (!klientId) return [];
    return bitimlar.filter(
      (b) =>
        b.klient_id === klientId &&
        b.holat !== 'bekor' &&
        b.yonalish !== yonalish &&
        bitimQoldiq(b, tolovlar) > 0,
    );
  }, [klientId, bitimlar, tolovlar, yonalish]);

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    const royxat = klientlar.filter((k) => k.faol !== false);
    if (!q) return royxat.slice(0, 12);
    return royxat.filter((k) => k.ism.toLowerCase().includes(q) || (k.telefon ?? '').includes(q));
  }, [klientlar, qidiruv]);

  // Ishora qoidasi: berdim +, oldim −
  const keyingi = joriy + (yonalish === 'berdim' ? tiyin : -tiyin);

  async function yubor() {
    if (!klientId) return setXato(tr('Hamkorni tanlang.'));
    if (!hisobId) return setXato(tr('Hisobni tanlang.'));
    if (!tiyin || tiyin <= 0) return setXato(tr('Summani kiriting.'));

    setXato(null);
    setSaqlanmoqda(true);
    try {
      await tolovQosh({
        klient_id: klientId,
        yonalish,
        summa: tiyin,
        hisob_id: hisobId,
        bitim_id: bitimId,
        usuli,
        valyuta,
        kurs,
        izoh,
        muddat,
      });
      saqlandi();
      yopish();
    } catch (e) {
      void xatoYoz('TolovOynasi.yubor', e);
      setXato(xatoMatn(e));
      setSaqlanmoqda(false);
    }
  }

  const rang = yonalish === 'oldim' ? C.kirim : C.chiqim;
  const maydon = {
    backgroundColor: C.karta,
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    minHeight: 46,
    fontSize: 15,
    color: C.matn,
  };

  return (
    <Modal visible animationType="slide" onRequestClose={yopish} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: C.fon,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '94%',
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
              backgroundColor: rang,
              paddingHorizontal: O.chekka,
              paddingVertical: 14,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
              {yonalish === 'oldim' ? tr('Pul oldim') : tr('Pul berdim')}
            </Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            <Yorliq matn={tr('Kim bilan')} />
            {klient ? (
              <View style={{ paddingHorizontal: O.chekka }}>
                <Karta uslub={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.matn, fontSize: 16, fontWeight: '700' }}>{klient.ism}</Text>
                    <Text
                      style={{
                        color: joriy > 0 ? C.kirim : joriy < 0 ? C.chiqim : C.xira,
                        fontSize: 13,
                        marginTop: 3,
                      }}
                    >
                      {joriy === 0
                        ? tr('Hisob yopiq')
                        : joriy > 0
                          ? `${tr('Sizga qarzdor')}: ${formatla(joriy, valyuta)}`
                          : `${tr('Siz qarzdorsiz')}: ${formatla(-joriy, valyuta)}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setKlientId(null);
                      setBitimId(null);
                    }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
                  >
                    <Text style={{ color: C.matn2, fontSize: 13 }}>{tr('Almashtirish')}</Text>
                  </TouchableOpacity>
                </Karta>
              </View>
            ) : (
              <View style={{ paddingHorizontal: O.chekka }}>
                <TextInput
                  style={maydon}
                  value={qidiruv}
                  onChangeText={setQidiruv}
                  placeholder={tr('Ism yoki telefon')}
                  placeholderTextColor={C.xira}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {korinadigan.map((k) => (
                    <View key={k.id} style={{ marginBottom: 8 }}>
                      <Chip matn={k.ism} tanlangan={false} bos={() => setKlientId(k.id)} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Yorliq matn={tr('Summa')} />
            <View style={{ paddingHorizontal: O.chekka }}>
              <TextInput
                style={{
                  ...maydon,
                  minHeight: 58,
                  fontSize: 26,
                  fontWeight: '800',
                  color: rang,
                  textAlign: 'right',
                }}
                value={ifodaKorinish(summa)}
                onChangeText={(x) => {
                  setXato(null);
                  setSumma(x.replace(/\s/g, ''));
                }}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={C.xira}
              />
            </View>

            {/* Qaysi bitimga — ixtiyoriy */}
            {ochiqBitimlar.length > 0 && (
              <>
                <Yorliq matn={tr('Qaysi bitimga (ixtiyoriy)')} />
                <View style={{ paddingHorizontal: O.chekka }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    <View style={{ marginBottom: 8 }}>
                      <Chip matn={tr('Umumiy qarzga')} tanlangan={!bitimId} bos={() => setBitimId(null)} />
                    </View>
                    {ochiqBitimlar.map((b) => (
                      <View key={b.id} style={{ marginBottom: 8 }}>
                        <Chip
                          matn={`${b.tovar_nom || tr('Qarz')} · ${formatla(bitimQoldiq(b, tolovlar), b.valyuta, { belgisiz: true, kasrsiz: true })}`}
                          tanlangan={b.id === bitimId}
                          bos={() => {
                            setBitimId(b.id);
                            if (!summa) setSumma(String(bitimQoldiq(b, tolovlar) / 100));
                          }}
                        />
                      </View>
                    ))}
                  </View>
                  {bitimId && (
                    <Text style={{ color: C.xira, fontSize: 12 }}>
                      {tr('Sana')}: {sanaQisqa(ochiqBitimlar.find((b) => b.id === bitimId)?.sana ?? '')}
                    </Text>
                  )}
                </View>
              </>
            )}

            <Yorliq matn={tr('Qaysi hisobdan')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
              {faolHisoblar.map((h) => (
                <Chip key={h.id} matn={h.nom} tanlangan={h.id === hisobId} bos={() => setHisobId(h.id)} />
              ))}
            </ScrollView>

            {/* Valyuta BITTA bo‘lsa ham ko‘rinadi: u shu yozuv qaysi
                valyutada ekanini aytadi va boshqasi ham bo‘lishi
                mumkinligini ko‘rsatadi. Avval «birdan ortiq
                bo‘lsa» sharti bor edi va tanlagich hech qachon
                chiqmasdi — odam valyuta borligini bilmasdi. */}
            {valyutaRoyxat.length > 0 && (
              <>
                <Yorliq matn={tr('Valyuta')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
                  {valyutaRoyxat.map((v) => (
                    <Chip
                      key={v.valyuta}
                      matn={v.valyuta}
                      tanlangan={v.valyuta === valyuta}
                      bos={() => {
                        setValyuta(v.valyuta);
                        setQoldaTanlandi(true);
                      }}
                    />
                  ))}
                </ScrollView>
              </>
            )}
            <Yorliq matn={tr('Usuli')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
              {USULLAR.map((u) => (
                <Chip key={u.k} matn={tr(u.m)} tanlangan={u.k === usuli} bos={() => setUsuli(u.k)} />
              ))}
            </ScrollView>

            <Yorliq matn={tr('Izoh')} />
            <View style={{ paddingHorizontal: O.chekka }}>
              <TextInput
                style={maydon}
                value={izoh}
                onChangeText={setIzoh}
                placeholder={tr('Nima uchun')}
                placeholderTextColor={C.xira}
              />
            </View>

            {/* Muddat KIRIMDA HAM, CHIQIMDA HAM: do‘kondor
                kelishuvni ikkala tomonda yozadi — «500 mingni
                oldim, qolganini 5-oktabrga kelishdik». */}
            <View style={{ paddingHorizontal: O.chekka, marginTop: 14 }}>
              <MuddatMaydoni
                qiymat={muddat}
                setQiymat={setMuddat}
                izoh={tr('Qolganini qachonga kelishdingiz')}
              />
            </View>

            {klient && tiyin > 0 && (
              <View style={{ paddingHorizontal: O.chekka, marginTop: 16 }}>
                <Karta>
                  <Qator2 yorliq={tr('Hozir')} qiymat={formatla(joriy, valyuta)} rang={C.matn2} />
                  <View style={{ borderTopWidth: 1, borderTopColor: C.ajratgich, marginTop: 8, paddingTop: 8 }}>
                    <Qator2
                      yorliq={tr('To‘lovdan keyin')}
                      qiymat={formatla(keyingi, valyuta)}
                      rang={keyingi === 0 ? C.kirim : keyingi > 0 ? C.kirim : C.chiqim}
                      qalin
                    />
                  </View>
                  {keyingi === 0 && (
                    <Text style={{ color: C.kirim, fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                      {tr('✓ Oldi-berdi yakunlanadi')}
                    </Text>
                  )}
                </Karta>
              </View>
            )}

            {xato && (
              <Text style={{ color: C.chiqim, fontSize: 13, paddingHorizontal: O.chekka, marginTop: 12 }}>
                {xato}
              </Text>
            )}

            <View style={{ paddingHorizontal: O.chekka, marginTop: 18 }}>
              <Tugma matn={tr('Saqlash')} bos={yubor} kutmoqda={saqlanmoqda} rang={rang} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Yorliq({ matn }: { matn: string }) {
  const { C } = useTema();
  return (
    <Text
      style={{
        color: C.matn2,
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: O.chekka,
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {matn}
    </Text>
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
