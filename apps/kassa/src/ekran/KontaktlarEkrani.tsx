// =============================================================
//  KONTAKTLAR — mijoz va ta’minotchi qarzi
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
import { bitimQoldiq, formatla, hamkorQoldiq, solishtir } from '@ilova/kassa-yadro';
import type { Bitim, Klient, Tolov } from '@ilova/kassa-yadro';
import { klientQosh, klientTahrirla } from '../lib/baza';
import { sanaQisqa } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Chip, Qator, Tugma, YigindiPaneli, uslublar } from '../ui/qismlar';
import { YozuvQatori } from './BoshEkran';
import { tr } from '../lib/til';

type Filtr = 'hammasi' | 'qarzi' | 'oldindan';

export default function KontaktlarEkrani({
  ochOperatsiya,
  ochTolov,
}: {
  ochOperatsiya: (klientId: string) => void;
  ochTolov: (klientId: string) => void;
}) {
  const { C } = useTema();
  const s = uslublar(C);
  const { klientlar, yozuvlar, turkumlar, bitimlar, tolovlar, yangila, yuklanmoqda } = useHolat();

  const [filtr, setFiltr] = useState<Filtr>('hammasi');
  const [qidiruv, setQidiruv] = useState('');
  const [ochiq, setOchiq] = useState<Klient | null>(null);
  const [yangiOyna, setYangiOyna] = useState(false);

  const valyuta = 'UZS' as const;

  // Qoldiq endi DAFTARDAN emas, BITIMDAN hisoblanadi.
  //
  // Eski usulda hamkor qarzi kirim/chiqim yozuvlaridan chiqarilardi:
  // «tovar berdim» chiqim bo‘lgani uchun kassadan ham pul yechilib,
  // bir amal ikki marta hisoblanardi. Endi tovar kassaga tegmaydi,
  // qarz esa bitim va to‘lovdan chiqadi.
  const qoldiqlar = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of klientlar) m.set(k.id, hamkorQoldiq(k.id, bitimlar, tolovlar, yozuvlar));
    return m;
  }, [klientlar, bitimlar, tolovlar]);

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
        <Text style={s.boshliqMatn}>{tr('Kontaktlar')}</Text>
        <Text style={s.boshliqIzoh}>{korinadigan.length} · {tr('mijoz va ta’minotchi')}</Text>
      </View>

      <View style={{ backgroundColor: C.karta, paddingHorizontal: O.chekka, paddingTop: 10 }}>
        <TextInput
          value={qidiruv}
          onChangeText={setQidiruv}
          placeholder={tr('Ism yoki telefon')}
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
          <Chip matn={tr('Hammasi')} tanlangan={filtr === 'hammasi'} bos={() => setFiltr('hammasi')} />
          <Chip matn={tr('Qarzi bor')} tanlangan={filtr === 'qarzi'} bos={() => setFiltr('qarzi')} rang={filtr === 'qarzi' ? C.chiqim : undefined} />
          <Chip matn={tr('Oldindan')} tanlangan={filtr === 'oldindan'} bos={() => setFiltr('oldindan')} rang={filtr === 'oldindan' ? C.kirim : undefined} />
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={yuklanmoqda} onRefresh={yangila} tintColor={C.xira} />}
      >
        {korinadigan.length === 0 ? (
          <BoshHolat
            belgi="☺"
            matn={klientlar.length === 0 ? tr('Kontakt yo‘q') : tr('Bu filtrda hech kim yo‘q')}
            izoh={tr('Mijoz yoki ta’minotchi qo‘shsangiz, kim qancha qarz — shu yerda ko‘rinadi')}
          />
        ) : (
          korinadigan.map((k) => {
            const q = qoldiqlar.get(k.id) ?? 0;
            const holat = q > 0 ? 'qarzi' : q < 0 ? 'oldindan' : 'yopiq';
            return (
              <Qator
                key={k.id}
                nom={k.ism}
                izoh={`${k.turi === 'mijoz' ? tr('Mijoz') : tr('Ta’minotchi')}${k.telefon ? ' · ' + k.telefon : ''}`}
                ong={q === 0 ? '—' : formatla(Math.abs(q), valyuta, { belgisiz: true, kasrsiz: true })}
                ongRang={q > 0 ? C.chiqim : q < 0 ? C.kirim : C.xira}
                ongIzoh={holat === 'yopiq' ? tr('hisob yopiq') : holat === 'qarzi' ? tr('qarzi') : tr('oldindan')}
                bos={() => setOchiq(k)}
              />
            );
          })
        )}
        <View style={{ height: 12 }} />
      </ScrollView>

      <View style={{ padding: 10, backgroundColor: C.karta }}>
        <Tugma matn={tr('+ Kontakt qo‘shish')} bos={() => setYangiOyna(true)} />
      </View>

      <YigindiPaneli
        chap={{ yorliq: tr('Bizga qarzdor'), qiymat: formatla(jami.olamiz, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.chiqim }}
        orta={{ yorliq: tr('Biz qarzdormiz'), qiymat: formatla(jami.beramiz, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.kirim }}
        ong={{ yorliq: tr('Farq'), qiymat: formatla(jami.farq, valyuta, { belgisiz: true, kasrsiz: true }) }}
      />

      {ochiq && (
        <KontaktOynasi
          klient={ochiq}
          qoldiq={qoldiqlar.get(ochiq.id) ?? 0}
          bitimlar={bitimlar}
          tolovlar={tolovlar}
          yopish={() => setOchiq(null)}
          ochOperatsiya={() => {
            const id = ochiq.id;
            setOchiq(null);
            ochOperatsiya(id);
          }}
          ochTolov={() => {
            const id = ochiq.id;
            setOchiq(null);
            ochTolov(id);
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
  bitimlar,
  tolovlar,
  yopish,
  ochOperatsiya,
  ochTolov,
  ochirildi,
}: {
  klient: Klient;
  qoldiq: number;
  bitimlar: Bitim[];
  tolovlar: Tolov[];
  yopish: () => void;
  ochOperatsiya: () => void;
  ochTolov: () => void;
  ochirildi: () => void;
}) {
  const { C } = useTema();
  const valyuta = klient.valyuta ?? 'UZS';

  // Bitim va to‘lov bitta ro‘yxatda, sana bo‘yicha teskari
  // tartibda — hamkor bilan bo‘lgan hamma narsa bir joyda.
  const tarix = useMemo(() => {
    const b = bitimlar
      .filter((x) => x.klient_id === klient.id)
      .map((x) => ({ tur: 'bitim' as const, id: x.id, sana: x.sana, bitim: x }));
    const t = tolovlar
      .filter((x) => x.klient_id === klient.id)
      .map((x) => ({ tur: 'tolov' as const, id: x.id, sana: x.sana, tolov: x }));
    return [...b, ...t].sort((x, y) => Date.parse(y.sana) - Date.parse(x.sana));
  }, [bitimlar, tolovlar, klient.id]);

  function yashir() {
    Alert.alert(tr('Kontaktni yashirish'),
      `${klient.ism} ${tr('ro‘yxatdan olib tashlanadi. Yozuvlari va tarixi joyida qoladi.')}`,
      [
        { text: tr('Yo‘q'), style: 'cancel' },
        {
          text: tr('Yashirish'),
          style: 'destructive',
          onPress: async () => {
            try {
              await klientTahrirla(klient.id, { faol: false });
              ochirildi();
            } catch (e) {
              Alert.alert(tr('Xatolik'), xatoMatn(e));
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
                  {klient.turi === 'mijoz' ? tr('Mijoz') : tr('Ta’minotchi')}
                  {klient.telefon ? ` · ${klient.telefon}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={yopish} hitSlop={12}>
                <Text style={{ color: C.tunMatn, fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 14 }}>
              <Text style={{ color: C.tunXira, fontSize: 12 }}>
                {qoldiq > 0 ? tr('Sizga qarzdor') : qoldiq < 0 ? tr('Siz qarzdorsiz') : tr('Hisob yopiq')}
              </Text>
              <Text
                style={{
                  color: qoldiq > 0 ? C.kirim : qoldiq < 0 ? C.chiqim : C.tunMatn,
                  fontSize: 26,
                  fontWeight: '800',
                  marginTop: 2,
                }}
              >
                {formatla(Math.abs(qoldiq), valyuta)}
              </Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 360 }}>
            {tarix.length === 0 ? (
              <BoshHolat
                belgi="▣"
                matn={tr('Bitim yo‘q')}
                izoh={tr('Pastdagi tugmalar bilan birinchi amalni kiriting')}
              />
            ) : (
              tarix.map((x) =>
                x.tur === 'bitim' ? (
                  <BitimQatori key={x.id} b={x.bitim} tolovlar={tolovlar} />
                ) : (
                  <TolovQatori key={x.id} t={x.tolov} />
                ),
              )
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', padding: 10, gap: 10, backgroundColor: C.karta }}>
            <Tugma matn={tr('+ Operatsiya')} bos={ochOperatsiya} uslub={{ flex: 1 }} />
            <Tugma
              matn={tr('+ To‘lov')}
              ikkilamchi
              bos={ochTolov}
              uslub={{ flex: 1 }}
            />
          </View>
          <TouchableOpacity onPress={yashir} style={{ paddingBottom: 16, alignItems: 'center' }}>
            <Text style={{ color: C.xira, fontSize: 13 }}>{tr('Kontaktni yashirish')}</Text>
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
    if (ism.trim().length < 2) return setXato(tr('Ismni kiriting.'));
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
            <Text style={{ flex: 1, color: C.matn, fontSize: 17, fontWeight: '800' }}>{tr('Yangi kontakt')}</Text>
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: C.matn2, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 8 }}>{tr('Ism')}</Text>
          <TextInput style={maydon} value={ism} onChangeText={setIsm} placeholder={tr('Masalan: Ahmad')} placeholderTextColor={C.xira} autoFocus />

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12 }}>{tr('Telefon (ixtiyoriy)')}</Text>
          <TextInput
            style={maydon}
            value={telefon}
            onChangeText={setTelefon}
            placeholder="+998 90 123 45 67"
            placeholderTextColor={C.xira}
            keyboardType="phone-pad"
          />

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12, marginBottom: 4 }}>{tr('Turi')}</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip matn={tr('Mijoz')} tanlangan={turi === 'mijoz'} bos={() => setTuri('mijoz')} />
            <Chip matn={tr('Ta’minotchi')} tanlangan={turi === 'taminotchi'} bos={() => setTuri('taminotchi')} />
          </View>

          {xato && <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 12 }}>{xato}</Text>}

          <Tugma matn={tr('Saqlash')} bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 18 }} />
        </View>
      </View>
    </Modal>
  );
}

/** Bitim qatori: tovar/qarz, qoldig‘i va holati */
export function BitimQatori({ b, tolovlar }: { b: Bitim; tolovlar: Tolov[] }) {
  const { C } = useTema();
  const qoldi = bitimQoldiq(b, tolovlar);
  const berdim = b.yonalish === 'berdim';
  const nomi = b.tovar_nom || (b.nima === 'qarz' ? tr('Qarz') : tr('Tovar'));
  const tafsilot = [
    sanaQisqa(b.sana),
    b.miqdor ? `${b.miqdor} ${tr(b.birlik ?? 'dona')}` : null,
    b.holat === 'yopilgan' ? tr('yopilgan') : qoldi > 0 ? `${formatla(qoldi, b.valyuta, { belgisiz: true, kasrsiz: true })} ${tr('qoldi')}` : null,
    b.holat === 'bekor' ? tr('bekor') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Qator
      nom={nomi}
      izoh={tafsilot}
      ong={`${berdim ? '+' : '−'} ${formatla(b.summa, b.valyuta, { belgisiz: true, kasrsiz: true })}`}
      ongRang={berdim ? C.kirim : C.chiqim}
      ongIzoh={b.holat === 'kutilmoqda' ? tr('kutilmoqda') : undefined}
      sozilgan={b.holat === 'bekor'}
    />
  );
}

/** To‘lov qatori */
export function TolovQatori({ t }: { t: Tolov }) {
  const { C } = useTema();
  const berdim = t.yonalish === 'berdim';
  return (
    <Qator
      nom={tr('To‘lov')}
      izoh={[sanaQisqa(t.sana), tr(t.usuli)].filter(Boolean).join(' · ')}
      ong={`${berdim ? '+' : '−'} ${formatla(t.summa, t.valyuta, { belgisiz: true, kasrsiz: true })}`}
      ongRang={berdim ? C.kirim : C.chiqim}
      sozilgan={t.holat === 'bekor'}
    />
  );
}
