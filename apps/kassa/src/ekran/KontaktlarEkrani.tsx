// =============================================================
//  KONTAKTLAR — mijoz va ta'minotchi qarzi
//
//  Mahsulotning nomi shu bo'limdan kelib chiqqan: "Credit Debit".
//  Ulgurji savdoda daftarning eng ko'p ochiladigan sahifasi shu —
//  kim qancha qarz, kim oldindan to'lagan.
//
//  BELGI: musbat qoldiq — BIZGA qarzdor (tovar berildi, pul kelmadi),
//  manfiy — oldindan to'lagan. Rang yolg'iz yetarli emas, shuning
//  uchun yonida so'z ham turadi ("qarzi", "oldindan").
// =============================================================

import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatla, klientQoldiq, solishtir } from '@ilova/kassa-yadro';
import type { Klient, Yozuv } from '@ilova/kassa-yadro';
import { klientQosh, klientTahrirla } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Chip, Qator, Tugma, YigindiPaneli, uslublar } from '../ui/qismlar';
import { YozuvQatori } from './BoshEkran';

type Filtr = 'hammasi' | 'qarzi' | 'oldindan';

export default function KontaktlarEkrani({
  qoshish,
}: {
  qoshish: (turi: 'kirim' | 'chiqim', klientId: string) => void;
}) {
  const { C } = useTema();
  const s = uslublar(C);
  const { klientlar, yozuvlar, turkumlar, yangila, yuklanmoqda } = useHolat();

  const [filtr, setFiltr] = useState<Filtr>('hammasi');
  const [qidiruv, setQidiruv] = useState('');
  const [ochiq, setOchiq] = useState<Klient | null>(null);
  const [yangiOyna, setYangiOyna] = useState(false);

  const valyuta = 'UZS' as const;

  const qoldiqlar = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of klientlar) m.set(k.id, klientQoldiq(k.id, yozuvlar));
    return m;
  }, [klientlar, yozuvlar]);

  const jami = useMemo(() => {
    let olamiz = 0;
    let beramiz = 0;
    for (const q of qoldiqlar.values()) {
      if (q > 0) olamiz += q;
      else beramiz += -q;
    }
    return { olamiz, beramiz, farq: olamiz - beramiz };
  }, [qoldiqlar]);

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    return klientlar
      .filter((k) => k.faol)
      .filter((k) => {
        const qoldiq = qoldiqlar.get(k.id) ?? 0;
        if (filtr === 'qarzi') return qoldiq > 0;
        if (filtr === 'oldindan') return qoldiq < 0;
        return true;
      })
      .filter((k) => (q ? k.ism.toLowerCase().includes(q) || (k.telefon ?? '').includes(q) : true))
      .sort((a, b) => Math.abs(qoldiqlar.get(b.id) ?? 0) - Math.abs(qoldiqlar.get(a.id) ?? 0));
  }, [klientlar, qoldiqlar, filtr, qidiruv]);

  return (
    <View style={s.ekran}>
      <View style={s.boshliq}>
        <Text style={s.boshliqMatn}>Kontaktlar</Text>
        <Text style={s.boshliqIzoh}>{korinadigan.length} ta · mijoz va ta'minotchi</Text>
      </View>

      <View style={{ backgroundColor: C.karta, paddingHorizontal: O.chekka, paddingTop: 10 }}>
        <TextInput
          value={qidiruv}
          onChangeText={setQidiruv}
          placeholder="Ism yoki telefon"
          placeholderTextColor={C.xira}
          style={{
            backgroundColor: C.fon,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            paddingHorizontal: 12,
            paddingVertical: 9,
            fontSize: 14,
            color: C.matn,
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
          <Chip matn="Hammasi" tanlangan={filtr === 'hammasi'} bos={() => setFiltr('hammasi')} />
          <Chip matn="Qarzi bor" tanlangan={filtr === 'qarzi'} bos={() => setFiltr('qarzi')} rang={filtr === 'qarzi' ? C.chiqim : undefined} />
          <Chip matn="Oldindan" tanlangan={filtr === 'oldindan'} bos={() => setFiltr('oldindan')} rang={filtr === 'oldindan' ? C.kirim : undefined} />
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={yuklanmoqda} onRefresh={yangila} tintColor={C.xira} />}
      >
        {korinadigan.length === 0 ? (
          <BoshHolat
            belgi="☺"
            matn={klientlar.length === 0 ? 'Kontakt yo‘q' : 'Bu filtrda hech kim yo‘q'}
            izoh="Mijoz yoki ta'minotchi qo‘shsangiz, kim qancha qarz — shu yerda ko‘rinadi"
          />
        ) : (
          korinadigan.map((k) => {
            const q = qoldiqlar.get(k.id) ?? 0;
            const holat = q > 0 ? 'qarzi' : q < 0 ? 'oldindan' : 'yopiq';
            return (
              <Qator
                key={k.id}
                nom={k.ism}
                izoh={`${k.turi === 'mijoz' ? 'Mijoz' : "Ta'minotchi"}${k.telefon ? ' · ' + k.telefon : ''}`}
                ong={q === 0 ? '—' : formatla(Math.abs(q), valyuta, { belgisiz: true, kasrsiz: true })}
                ongRang={q > 0 ? C.chiqim : q < 0 ? C.kirim : C.xira}
                ongIzoh={holat === 'yopiq' ? 'hisob yopiq' : holat === 'qarzi' ? 'qarzi' : 'oldindan'}
                bos={() => setOchiq(k)}
              />
            );
          })
        )}
        <View style={{ height: 12 }} />
      </ScrollView>

      <View style={{ padding: 10, backgroundColor: C.karta }}>
        <Tugma matn="+ Kontakt qo‘shish" bos={() => setYangiOyna(true)} />
      </View>

      <YigindiPaneli
        chap={{ yorliq: 'Bizga qarzdor', qiymat: formatla(jami.olamiz, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.chiqim }}
        orta={{ yorliq: 'Biz qarzdormiz', qiymat: formatla(jami.beramiz, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.kirim }}
        ong={{ yorliq: 'Farq', qiymat: formatla(jami.farq, valyuta, { belgisiz: true, kasrsiz: true }) }}
      />

      {ochiq && (
        <KontaktOynasi
          klient={ochiq}
          qoldiq={qoldiqlar.get(ochiq.id) ?? 0}
          yozuvlar={yozuvlar.filter((y) => y.klient_id === ochiq.id).sort((a, b) => solishtir(b, a))}
          turkumNomi={(id) => turkumlar.find((t) => t.id === id)?.nom}
          yopish={() => setOchiq(null)}
          qoshish={(turi) => {
            const id = ochiq.id;
            setOchiq(null);
            qoshish(turi, id);
          }}
          ochirildi={async () => {
            setOchiq(null);
            await yangila();
          }}
        />
      )}

      {yangiOyna && (
        <YangiKontakt
          yopish={() => setYangiOyna(false)}
          saqlandi={async () => {
            setYangiOyna(false);
            await yangila();
          }}
        />
      )}
    </View>
  );
}

function KontaktOynasi({
  klient,
  qoldiq,
  yozuvlar,
  turkumNomi,
  yopish,
  qoshish,
  ochirildi,
}: {
  klient: Klient;
  qoldiq: number;
  yozuvlar: Yozuv[];
  turkumNomi: (id?: string | null) => string | undefined;
  yopish: () => void;
  qoshish: (turi: 'kirim' | 'chiqim') => void;
  ochirildi: () => void;
}) {
  const { C } = useTema();

  function yashir() {
    Alert.alert(
      'Kontaktni yashirish',
      `${klient.ism} ro‘yxatdan olib tashlanadi. Yozuvlari va tarixi joyida qoladi.`,
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: 'Yashirish',
          style: 'destructive',
          onPress: async () => {
            try {
              await klientTahrirla(klient.id, { faol: false });
              ochirildi();
            } catch (e) {
              Alert.alert('Xatolik', xatoMatn(e));
            }
          },
        },
      ],
    );
  }

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
          }}
        >
          <View
            style={{
              backgroundColor: C.tun,
              paddingHorizontal: O.chekka,
              paddingVertical: 16,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.tunMatn, fontSize: 18, fontWeight: '800' }}>{klient.ism}</Text>
                <Text style={{ color: C.tunXira, fontSize: 12, marginTop: 2 }}>
                  {klient.turi === 'mijoz' ? 'Mijoz' : "Ta'minotchi"}
                  {klient.telefon ? ` · ${klient.telefon}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={yopish} hitSlop={12}>
                <Text style={{ color: C.tunMatn, fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 14 }}>
              <Text style={{ color: C.tunXira, fontSize: 12 }}>
                {qoldiq > 0 ? 'Bizga qarzdor' : qoldiq < 0 ? 'Oldindan to‘lagan' : 'Hisob yopiq'}
              </Text>
              <Text
                style={{
                  color: qoldiq > 0 ? C.chiqim : qoldiq < 0 ? C.kirim : C.tunMatn,
                  fontSize: 26,
                  fontWeight: '800',
                  marginTop: 2,
                }}
              >
                {formatla(Math.abs(qoldiq), 'UZS')}
              </Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 360 }}>
            {yozuvlar.length === 0 ? (
              <BoshHolat belgi="↑↓" matn="Yozuv yo‘q" izoh="Pastdagi tugmalar bilan birinchi amalni kiriting" />
            ) : (
              yozuvlar.map((y) => <YozuvQatori key={y.id} y={y} turkumNomi={turkumNomi(y.turkum_id)} />)
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', padding: 10, gap: 10, backgroundColor: C.karta }}>
            <Tugma
              matn="Tovar berdim"
              rang={C.chiqim}
              bos={() => qoshish('chiqim')}
              uslub={{ flex: 1 }}
            />
            <Tugma matn="Pul oldim" rang={C.kirim} bos={() => qoshish('kirim')} uslub={{ flex: 1 }} />
          </View>
          <TouchableOpacity onPress={yashir} style={{ paddingBottom: 16, alignItems: 'center' }}>
            <Text style={{ color: C.xira, fontSize: 13 }}>Kontaktni yashirish</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function YangiKontakt({ yopish, saqlandi }: { yopish: () => void; saqlandi: () => void }) {
  const { C } = useTema();
  const [ism, setIsm] = useState('');
  const [telefon, setTelefon] = useState('');
  const [turi, setTuri] = useState<Klient['turi']>('mijoz');
  const [kutmoqda, setKutmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  async function saqla() {
    if (ism.trim().length < 2) return setXato('Ismni kiriting.');
    setKutmoqda(true);
    try {
      await klientQosh({ ism, telefon, turi });
      saqlandi();
    } catch (e) {
      setXato(xatoMatn(e));
      setKutmoqda(false);
    }
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
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ flex: 1, color: C.matn, fontSize: 17, fontWeight: '800' }}>Yangi kontakt</Text>
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: C.matn2, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 8 }}>Ism</Text>
          <TextInput style={maydon} value={ism} onChangeText={setIsm} placeholder="Masalan: Ahmad" placeholderTextColor={C.xira} autoFocus />

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12 }}>Telefon (ixtiyoriy)</Text>
          <TextInput
            style={maydon}
            value={telefon}
            onChangeText={setTelefon}
            placeholder="+998 90 123 45 67"
            placeholderTextColor={C.xira}
            keyboardType="phone-pad"
          />

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12, marginBottom: 4 }}>Turi</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip matn="Mijoz" tanlangan={turi === 'mijoz'} bos={() => setTuri('mijoz')} />
            <Chip matn="Ta'minotchi" tanlangan={turi === 'taminotchi'} bos={() => setTuri('taminotchi')} />
          </View>

          {xato && <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 12 }}>{xato}</Text>}

          <Tugma matn="Saqlash" bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 18 }} />
        </View>
      </View>
    </Modal>
  );
}
