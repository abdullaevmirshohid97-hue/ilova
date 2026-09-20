// =============================================================
//  MIJOZ KARTOCHKASI — to'liq ekran
//
//  Hamkor bilan bo'lgan butun tarix: har qatorda sanasi, turi,
//  izohi va O'SHA PAYTDAGI qoldiq.
//
//  YURUVCHI BALANS eng nozik joy: oxirgi qatordagi raqam pastdagi
//  «Balans» bilan AYNAN teng bo'lishi shart. Shuning uchun
//  ikkalasi ham bitta manbadan — `hamkorYuruvchi` dan — olinadi
//  va invariant `kassa-balans` sinovida tekshiriladi.
//
//  Balans ustuni YOQIB-O'CHIRILADI. Ba'zi do'kondor uni kerak
//  demaydi va ustun qatorni tig'izlashtiradi; kerak bo'lganda
//  bir tegishda qaytariladi.
//
//  O'CHIRILGANLAR ham shu yerda. Daftar qo'shib yoziladigan:
//  bekor qilingan yozuv o'chmaydi, faqat yig'indidan chiqadi.
//  Ya'ni tarix allaqachon saqlanib turibdi — uni ko'rsatish
//  qolgan, xolos.
// =============================================================

import { useMemo, useState } from 'react';
import { Alert, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  bitimQoldiq,
  formatla,
  hamkorQoldiq,
  hamkorYuruvchi,
  kechikkanKun,
  operatsiyaNomi,
  type HamkorQator,
} from '@ilova/kassa-yadro';
import type { Klient } from '@ilova/kassa-yadro';
import { davrOraligi, oraliqdami, sanaHaftaToliq, sanaQisqa, type DavrTuri } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { boshHarflar } from '../lib/rasm';
import { O, useTema } from '../lib/tema';
import { tr, trn } from '../lib/til';
import { Menyu, Orqaga, UchNuqta } from '../ui/ikonka';
import { MijozRasmi } from '../ui/MijozRasmi';
import { AmallarMenyusi } from '../ui/YuqoriOynalar';
import { BoshHolat } from '../ui/qismlar';

type Saralash = 'yangi' | 'eski' | 'qabul' | 'tolangan';

const FILTRLAR: { kalit: DavrTuri; matn: string }[] = [
  { kalit: 'hammasi', matn: 'Hammasi' },
  { kalit: 'kun', matn: 'Kunlik' },
  { kalit: 'hafta', matn: 'Haftalik' },
  { kalit: 'oy', matn: 'Oylik' },
  { kalit: 'yil', matn: 'Yillik' },
];

export default function MijozKartochka({
  klient,
  yopish,
  ochKirim,
  ochChiqim,
  ochOperatsiya,
  ochProfil,
  ochXabar,
}: {
  klient: Klient;
  yopish: () => void;
  ochKirim: () => void;
  ochChiqim: () => void;
  ochOperatsiya: (q: HamkorQator) => void;
  ochProfil: () => void;
  ochXabar: (qatorlar: { qator: HamkorQator; ozgarish: number }[], qoldiq: number) => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  const { bitimlar, tolovlar, yozuvlar } = useHolat();

  const [filtr, setFiltr] = useState<DavrTuri>('hammasi');
  const [balansKorinsin, setBalansKorinsin] = useState(true);
  const [saralash, setSaralash] = useState<Saralash>('yangi');
  const [ochirilganlar, setOchirilganlar] = useState(false);
  const [menyu, setMenyu] = useState(false);
  const [amallar, setAmallar] = useState(false);

  const valyuta = klient.valyuta ?? 'UZS';
  const ism = [klient.ism, klient.familya].filter(Boolean).join(' ');

  // Yuruvchi balans HAMMA qator bo'yicha hisoblanadi, filtrdan
  // oldin. Aks holda «bu oy» filtrida balans noldan boshlanib,
  // o'tgan oylardagi qarz yo'qolgandek ko'rinardi.
  const hammasi = useMemo(
    () => hamkorYuruvchi(klient.id, bitimlar, tolovlar, yozuvlar),
    [klient.id, bitimlar, tolovlar, yozuvlar],
  );

  const jamiQoldiq = useMemo(
    () => hamkorQoldiq(klient.id, bitimlar, tolovlar, yozuvlar),
    [klient.id, bitimlar, tolovlar, yozuvlar],
  );

  /** Bekor qilinganlar — alohida, faqat so'ralganda */
  const bekorlar = useMemo(() => {
    if (!ochirilganlar) return [];
    const b = bitimlar
      .filter((x) => x.klient_id === klient.id && x.holat === 'bekor')
      .map((x) => ({ tur: 'bitim' as const, id: x.id, sana: x.sana, bitim: x }));
    const t = tolovlar
      .filter((x) => x.klient_id === klient.id && x.holat === 'bekor')
      .map((x) => ({ tur: 'tolov' as const, id: x.id, sana: x.sana, tolov: x }));
    const y = yozuvlar
      .filter((x) => x.klient_id === klient.id && !x.bitim_id && x.bekor_at)
      .map((x) => ({ tur: 'yozuv' as const, id: x.id, sana: x.sana, yozuv: x }));
    return [...b, ...t, ...y] as HamkorQator[];
  }, [ochirilganlar, klient.id, bitimlar, tolovlar, yozuvlar]);

  const korinadigan = useMemo(() => {
    const oraliq = davrOraligi(filtr, 0);
    const royxat = hammasi.filter((x) => filtr === 'hammasi' || oraliqdami(x.qator.sana, oraliq));

    const nusxa = [...royxat];
    if (saralash === 'yangi') nusxa.reverse();
    else if (saralash === 'qabul') {
      // «Qabul qilingan» — men BERGANIM, ya'ni musbat o'zgarish
      nusxa.sort((a, b) => b.ozgarish - a.ozgarish);
    } else if (saralash === 'tolangan') {
      nusxa.sort((a, b) => a.ozgarish - b.ozgarish);
    }
    return nusxa;
  }, [hammasi, filtr, saralash]);

  const jami = useMemo(() => {
    let kirim = 0;
    let chiqim = 0;
    for (const x of korinadigan) {
      if (x.ozgarish > 0) kirim += x.ozgarish;
      else chiqim += -x.ozgarish;
    }
    return { kirim, chiqim };
  }, [korinadigan]);

  function qongiroq() {
    const raqam = (klient.telefon ?? '').trim();
    if (!raqam) {
      Alert.alert(tr('Raqam yo‘q'), tr('Bu mijozga telefon raqami kiritilmagan'));
      return;
    }
    Linking.openURL('tel:' + raqam.replace(/\s/g, ''));
  }

  return (
    <Modal animationType="slide" onRequestClose={yopish}>
      <View style={{ flex: 1, backgroundColor: C.fon }}>
        {/* Sarlavha */}
        <View
          style={{
            backgroundColor: C.tun,
            paddingTop: chekka.top + 8,
            paddingBottom: 10,
            paddingHorizontal: O.chekka - 4,
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: C.ajratgich,
          }}
        >
          <TouchableOpacity onPress={yopish} hitSlop={10} style={{ padding: 8 }}>
            <Orqaga rang={C.tunMatn} />
          </TouchableOpacity>

          <MijozRasmi
            yol={klient.rasm_path}
            harflar={boshHarflar(klient.ism, klient.familya)}
            olcham={30}
          />
          <Text
            style={{ flex: 1, color: C.tunMatn, fontSize: 16, fontWeight: '700', marginLeft: 10 }}
            numberOfLines={1}
          >
            {ism}
          </Text>

          <TouchableOpacity onPress={() => setMenyu(true)} hitSlop={8} style={{ padding: 8 }}>
            <Menyu rang={C.tunMatn} olcham={18} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAmallar(true)} hitSlop={8} style={{ padding: 8 }}>
            <UchNuqta rang={C.tunMatn} olcham={18} />
          </TouchableOpacity>
        </View>

        {/* Soni va balans kaliti */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: O.chekka,
            paddingVertical: 10,
            backgroundColor: C.karta,
            borderBottomWidth: 1,
            borderBottomColor: C.ajratgich,
          }}
        >
          <Text style={{ flex: 1, color: C.matn2, fontSize: 13 }}>
            {trn('{n} ta operatsiya', korinadigan.length)}
          </Text>
          <TouchableOpacity
            onPress={() => setBalansKorinsin((x) => !x)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ color: balansKorinsin ? C.matn : C.xira, fontSize: 13 }}>
              {tr('Balans')}
            </Text>
            <View
              style={{
                width: 34,
                height: 20,
                borderRadius: 10,
                padding: 2,
                backgroundColor: balansKorinsin ? C.faol : C.chegara,
                alignItems: balansKorinsin ? 'flex-end' : 'flex-start',
              }}
            >
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.karta }} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Filtr */}
        <View style={{ backgroundColor: C.karta, borderBottomWidth: 1, borderBottomColor: C.ajratgich }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: O.chekka - 4, paddingVertical: 8, gap: 6 }}
          >
            {FILTRLAR.map((f) => {
              const faolmi = f.kalit === filtr;
              return (
                <TouchableOpacity
                  key={f.kalit}
                  onPress={() => setFiltr(f.kalit)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: faolmi ? C.faol : 'transparent',
                    borderWidth: 1,
                    borderColor: faolmi ? C.faol : C.chegara,
                  }}
                >
                  <Text
                    style={{
                      color: faolmi ? C.faolMatn : C.matn2,
                      fontSize: 13,
                      fontWeight: faolmi ? '700' : '500',
                    }}
                  >
                    {tr(f.matn)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView style={{ flex: 1 }}>
          {korinadigan.length === 0 ? (
            <BoshHolat
              belgi="≡"
              matn={tr('Bu davrda operatsiya yo‘q')}
              izoh={filtr === 'hammasi' ? tr('Pastdagi tugmalar bilan birinchisini yozing') : undefined}
            />
          ) : (
            korinadigan.map((x) => (
              <Qator
                key={x.qator.id}
                q={x.qator}
                ozgarish={x.ozgarish}
                qoldiq={balansKorinsin ? x.qoldiq : null}
                valyuta={valyuta}
                tolovlar={tolovlar}
                bos={() => ochOperatsiya(x.qator)}
              />
            ))
          )}

          {/* O'chirilganlar */}
          {ochirilganlar && bekorlar.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text
                style={{
                  color: C.xira,
                  fontSize: 12,
                  fontWeight: '700',
                  paddingHorizontal: O.chekka,
                  paddingVertical: 8,
                }}
              >
                {tr('O‘CHIRILGANLAR')} · {bekorlar.length}
              </Text>
              {bekorlar.map((q) => (
                <Qator
                  key={q.id}
                  q={q}
                  ozgarish={0}
                  qoldiq={null}
                  valyuta={valyuta}
                  tolovlar={tolovlar}
                  bekor
                  bos={() => ochOperatsiya(q)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {/* Kirim / chiqim */}
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: O.chekka,
            paddingVertical: 10,
            backgroundColor: C.karta,
            borderTopWidth: 1,
            borderTopColor: C.ajratgich,
          }}
        >
          <TouchableOpacity
            onPress={ochKirim}
            style={{
              flex: 1,
              backgroundColor: C.kirimYumshoq,
              borderWidth: 1,
              borderColor: C.kirim,
              borderRadius: O.radiusKichik,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: C.kirim, fontSize: 15, fontWeight: '800' }}>{tr('+ Kirim')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={ochChiqim}
            style={{
              flex: 1,
              backgroundColor: C.chiqimYumshoq,
              borderWidth: 1,
              borderColor: C.chiqim,
              borderRadius: O.radiusKichik,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: C.chiqim, fontSize: 15, fontWeight: '800' }}>{tr('− Chiqim')}</Text>
          </TouchableOpacity>
        </View>

        {/* Jami */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: C.karta,
            borderTopWidth: 1,
            borderTopColor: C.ajratgich,
            paddingVertical: 10,
            paddingBottom: 10 + chekka.bottom,
          }}
        >
          <Ustun nom={tr('Jami kirim')} summa={jami.kirim} rang={C.kirim} valyuta={valyuta} />
          <Ustun nom={tr('Jami chiqim')} summa={jami.chiqim} rang={C.chiqim} valyuta={valyuta} />
          {/* Balans HAMMA qator bo'yicha: filtr uni o'zgartirmaydi,
              chunki qarz «bu oyniki» bo'lmaydi. */}
          <Ustun
            nom={tr('Balans')}
            summa={jamiQoldiq}
            rang={jamiQoldiq >= 0 ? C.kirim : C.chiqim}
            valyuta={valyuta}
            ishorali
          />
        </View>

        {/* ☰ — mijoz menyusi */}
        <AmallarMenyusi
          ochiq={menyu}
          yop={() => setMenyu(false)}
          amallar={[
            { matn: tr('Profilga'), bos: ochProfil },
            {
              matn: ochirilganlar ? tr('O‘chirilganlarni yashirish') : tr('O‘chirilgan operatsiyalar'),
              bos: () => setOchirilganlar((x) => !x),
            },
            { matn: tr('Xabar yuborish'), bos: () => ochXabar(korinadigan, jamiQoldiq) },
          ]}
        />

        {/* ⋮ — amallar va saralash */}
        <AmallarMenyusi
          ochiq={amallar}
          yop={() => setAmallar(false)}
          amallar={[
            { matn: tr('Tahrirlash'), bos: ochProfil },
            { matn: tr('Qo‘ng‘iroq'), bos: qongiroq },
            { matn: '— ' + tr('Saralash') + ' —', bos: () => {} },
            { matn: (saralash === 'yangi' ? '✓ ' : '') + tr('Sana ↓ (yangisi)'), bos: () => setSaralash('yangi') },
            { matn: (saralash === 'eski' ? '✓ ' : '') + tr('Sana ↑ (eskisi)'), bos: () => setSaralash('eski') },
            { matn: (saralash === 'qabul' ? '✓ ' : '') + tr('Qabul qilingan'), bos: () => setSaralash('qabul') },
            { matn: (saralash === 'tolangan' ? '✓ ' : '') + tr('To‘langan'), bos: () => setSaralash('tolangan') },
          ]}
        />
      </View>
    </Modal>
  );
}

function Ustun({
  nom,
  summa,
  rang,
  valyuta,
  ishorali,
}: {
  nom: string;
  summa: number;
  rang: string;
  valyuta: Klient['valyuta'];
  ishorali?: boolean;
}) {
  const { C } = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
      <Text style={{ color: C.xira, fontSize: 11 }} numberOfLines={1}>
        {nom}
      </Text>
      <Text style={{ color: rang, fontSize: 14, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
        {(ishorali && summa < 0 ? '−' : '') +
          formatla(Math.abs(summa), valyuta ?? 'UZS', { belgisiz: true, kasrsiz: true })}
      </Text>
    </View>
  );
}

function Qator({
  q,
  ozgarish,
  qoldiq,
  valyuta,
  tolovlar,
  bekor,
  bos,
}: {
  q: HamkorQator;
  ozgarish: number;
  /** null bo'lsa balans ustuni o'chirilgan */
  qoldiq: number | null;
  valyuta: Klient['valyuta'];
  tolovlar: Parameters<typeof bitimQoldiq>[1];
  bekor?: boolean;
  bos: () => void;
}) {
  const { C } = useTema();
  const kirim = ozgarish > 0;
  const nomi = tr(operatsiyaNomi(q));

  // Tovar nomi bo'lsa u ham ko'rsatiladi: «Tovar berdim» yolg'iz
  // nima berilganini aytmaydi.
  const tafsilot = q.tur === 'bitim' ? q.bitim.tovar_nom : null;
  const izoh =
    q.tur === 'bitim' ? q.bitim.izoh : q.tur === 'tolov' ? q.tolov.izoh : q.yozuv.izoh;

  const muddat = q.tur === 'bitim' ? q.bitim.muddat : null;
  const kechikdi = q.tur === 'bitim' && !bekor ? kechikkanKun(q.bitim, tolovlar) : 0;

  const summa = q.tur === 'bitim' ? q.bitim.summa : q.tur === 'tolov' ? q.tolov.summa : q.yozuv.summa;

  return (
    <TouchableOpacity
      onPress={bos}
      style={{
        paddingHorizontal: O.chekka,
        paddingVertical: 12,
        backgroundColor: C.karta,
        borderBottomWidth: 1,
        borderBottomColor: C.ajratgich,
        opacity: bekor ? 0.55 : 1,
      }}
    >
      {/* Sana: hafta kuni, kun, oy, YIL, soat */}
      <Text style={{ color: C.xira, fontSize: 11 }}>{sanaHaftaToliq(q.sana)}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 10 }}>
        <Text style={{ flex: 1, color: C.matn, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {nomi}
          {tafsilot ? <Text style={{ color: C.matn2, fontWeight: '400' }}> · {tafsilot}</Text> : null}
        </Text>
        <Text
          style={{
            color: bekor ? C.xira : kirim ? C.kirim : C.chiqim,
            fontSize: 15,
            fontWeight: '700',
            textDecorationLine: bekor ? 'line-through' : 'none',
          }}
        >
          {(bekor ? '' : kirim ? '+ ' : '− ') +
            formatla(summa, valyuta ?? 'UZS', { belgisiz: true, kasrsiz: true })}
        </Text>
      </View>

      {muddat ? (
        <Text style={{ color: kechikdi > 0 ? C.chiqim : C.xira, fontSize: 11, marginTop: 4, fontWeight: kechikdi > 0 ? '700' : '400' }}>
          {tr('muddat')} {sanaQisqa(muddat)}
          {kechikdi > 0 ? ' · ' + trn('{n} kun kechikdi', kechikdi) : ''}
        </Text>
      ) : null}

      {/* Izoh TO'LIQ ko'rinadi: bozorda u «akasi kelib to'laydi»
          kabi jumla bo'ladi va qisqartirilsa aynan kerakli qismi
          yo'qolardi. */}
      {izoh ? (
        <View
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: O.radiusKichik,
            backgroundColor: C.karta2,
            borderWidth: 1,
            borderColor: C.ajratgich,
          }}
        >
          <Text style={{ color: C.matn2, fontSize: 13, lineHeight: 18 }}>{izoh}</Text>
        </View>
      ) : null}

      {qoldiq !== null && (
        <Text style={{ color: C.xira, fontSize: 11, marginTop: 6, textAlign: 'right' }}>
          {tr('balans')} {(qoldiq < 0 ? '−' : '') +
            formatla(Math.abs(qoldiq), valyuta ?? 'UZS', { belgisiz: true, kasrsiz: true })}
        </Text>
      )}
    </TouchableOpacity>
  );
}
