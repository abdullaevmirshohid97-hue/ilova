// =============================================================
//  BOSH EKRAN — MIJOZLAR VA QARZ
//
//  Biznes tanlangandan keyin odam shu ekranga tushadi. Bu yerda
//  bitta savolga javob bor: KIM MENGA QANCHA QARZDOR.
//
//  Tuzilishi:
//    tepada  — filtr: Hammasi · Qarzlarim · Haqlarim · Muddati kelgan
//    o'rtada — mijozlar, har birida qoldiq
//    pastda  — ikki tugma va uchta jami
//
//  ATAMALAR (chalkashtirmaslik uchun):
//    HAQ   — u menga qarzdor, men olaman   (qoldiq musbat)
//    QARZ  — men unga qarzdorman, beraman  (qoldiq manfiy)
//
//  Qoldiq hamkor kartochkasidagi bilan AYNAN bir funksiyadan
//  olinadi (`hamkorQoldiq`): ikki ekranda ikki xil raqam turishi
//  ishonchni bir zumda yo'qotadi.
//
//  Jami raqamlar EKRANDA KO'RINADIGAN ro'yxatga emas, HAMMA
//  mijozga tayanadi. Filtr «Qarzlarim» bo'lganda jami ham
//  o'zgarib ketsa, odam «pulim qayoqqa ketdi?» deb o'ylardi.
// =============================================================

import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatla, hamkorQoldiq, muddatiOtgan, type HamkorQator } from '@ilova/kassa-yadro';
import type { Klient } from '@ilova/kassa-yadro';
import { boshHarflar } from '../lib/rasm';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { BoshHolat } from '../ui/qismlar';
import { MijozRasmi } from '../ui/MijozRasmi';
import MijozKartochka from './MijozKartochka';
import { bitimHujjati, tasdiqYubor } from './KontaktlarEkrani';
import XabarOynasi from './XabarOynasi';
import { xabarMatni } from '../lib/xabar';

type Filtr = 'hammasi' | 'qarzlarim' | 'haqlarim' | 'muddat';

const FILTRLAR: { kalit: Filtr; matn: string }[] = [
  { kalit: 'hammasi', matn: 'Hammasi' },
  { kalit: 'qarzlarim', matn: 'Qarzlarim' },
  { kalit: 'haqlarim', matn: 'Haqlarim' },
  { kalit: 'muddat', matn: 'Muddati kelgan' },
];

export default function BoshEkran({
  qidiruv,
  ochMijoz,
  ochBitimlar,
  ochOperatsiya,
  ochTolov,
}: {
  /** Yuqoridagi lupa shu matnni to'ldiradi */
  qidiruv: string;
  ochMijoz: (k?: Klient) => void;
  ochBitimlar: () => void;
  ochOperatsiya: (klientId: string) => void;
  ochTolov: (klientId: string) => void;
}) {
  const { C } = useTema();
  const { men, klientlar, yozuvlar, bitimlar, tolovlar, yangila, yuklanmoqda } = useHolat();
  const [filtr, setFiltr] = useState<Filtr>('hammasi');
  const [tanlangan, setTanlangan] = useState<Klient | null>(null);
  // Xabar oynasi kartochkaning USTIDAN ochiladi: odam xabarni
  // yuborgach o‘sha mijozning tarixiga qaytishi kerak.
  const [xabar, setXabar] = useState<string | null>(null);

  const valyuta = klientlar[0]?.valyuta ?? 'UZS';

  /** Har mijozning qoldig'i — bir marta hisoblanadi */
  const qoldiqlar = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of klientlar) m.set(k.id, hamkorQoldiq(k.id, bitimlar, tolovlar, yozuvlar));
    return m;
  }, [klientlar, bitimlar, tolovlar, yozuvlar]);

  /** Kechikkan bitimi bor mijozlar */
  const kechikkanlar = useMemo(() => {
    const m = new Set<string>();
    for (const b of muddatiOtgan(bitimlar, tolovlar)) m.add(b.klient_id);
    return m;
  }, [bitimlar, tolovlar]);

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    return klientlar
      .filter((k) => {
        const qoldiq = qoldiqlar.get(k.id) ?? 0;
        if (filtr === 'qarzlarim' && qoldiq >= 0) return false;
        if (filtr === 'haqlarim' && qoldiq <= 0) return false;
        if (filtr === 'muddat' && !kechikkanlar.has(k.id)) return false;
        if (!q) return true;
        return (
          k.ism.toLowerCase().includes(q) ||
          (k.familya ?? '').toLowerCase().includes(q) ||
          (k.telefon ?? '').includes(q) ||
          (k.kategoriya ?? '').toLowerCase().includes(q)
        );
      })
      // Kattaroq qarz tepada: odam ertalab aynan shuni qidiradi.
      .sort((a, b) => Math.abs(qoldiqlar.get(b.id) ?? 0) - Math.abs(qoldiqlar.get(a.id) ?? 0));
  }, [klientlar, qoldiqlar, kechikkanlar, filtr, qidiruv]);

  /**
   * Qator bosilganda.
   *
   * To‘liq operatsiya oynasi keyingi bosqichda. Hozircha
   * mavjud amallar beriladi — qator bosilib hech narsa
   * bo‘lmasligi eng yomon variant edi: odam ikki-uch marta
   * bosib, ilova qotib qoldi deb o‘ylardi.
   */
  function amallarKorsat(q: HamkorQator) {
    if (q.tur !== 'bitim' || !tanlangan) return;
    const b = q.bitim;
    const tugmalar: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      {
        text: tr('Hujjat (PDF)'),
        onPress: () => bitimHujjati(b, tolovlar, tanlangan, men.biznes),
      },
    ];
    if (b.holat === 'kutilmoqda') {
      tugmalar.push({
        text: tr('Tasdiqlash havolasi'),
        onPress: () => tasdiqYubor(b, tanlangan, men.biznes),
      });
    }
    tugmalar.push({ text: tr('Bekor'), style: 'cancel' });
    Alert.alert(b.tovar_nom || tr('Bitim'), formatla(b.summa, b.valyuta), tugmalar);
  }

  const jami = useMemo(() => {
    let haqlar = 0;
    let qarzlar = 0;
    for (const q of qoldiqlar.values()) {
      if (q > 0) haqlar += q;
      else qarzlar += -q;
    }
    return { haqlar, qarzlar, balans: haqlar - qarzlar };
  }, [qoldiqlar]);

  return (
    <View style={{ flex: 1, backgroundColor: C.fon }}>
      {/* Filtr */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: C.ajratgich, backgroundColor: C.karta }}>
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

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={yuklanmoqda} onRefresh={yangila} tintColor={C.xira} />
        }
      >
        {korinadigan.length === 0 ? (
          <BoshHolat
            belgi="☺"
            matn={
              qidiruv
                ? tr('Topilmadi')
                : filtr === 'hammasi'
                  ? tr('Mijoz yo‘q')
                  : tr('Bu filtrga mos mijoz yo‘q')
            }
            izoh={
              qidiruv || filtr !== 'hammasi'
                ? undefined
                : tr('Pastdagi «+ Mijoz» tugmasi bilan birinchisini qo‘shing')
            }
          />
        ) : (
          korinadigan.map((k) => (
            <MijozQatori
              key={k.id}
              k={k}
              qoldiq={qoldiqlar.get(k.id) ?? 0}
              kechikkan={kechikkanlar.has(k.id)}
              bos={() => setTanlangan(k)}
              uzoqBos={() => ochMijoz(k)}
            />
          ))
        )}
      </ScrollView>

      {/* Tugmalar */}
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
          onPress={() => ochMijoz()}
          style={{
            flex: 1,
            backgroundColor: C.faol,
            borderRadius: O.radiusKichik,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: C.faolMatn, fontSize: 14, fontWeight: '700' }}>
            {tr('+ Mijoz qo‘shish')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={ochBitimlar}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>{tr('Bitimlar')}</Text>
        </TouchableOpacity>
      </View>

      {/* Jami — HAMMA mijoz bo'yicha, filtrdan qat'i nazar */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: C.karta,
          borderTopWidth: 1,
          borderTopColor: C.ajratgich,
          paddingVertical: 10,
        }}
      >
        <JamiUstun nom={tr('Jami haqlar')} summa={jami.haqlar} rang={C.kirim} valyuta={valyuta} />
        <JamiUstun nom={tr('Jami qarzlar')} summa={jami.qarzlar} rang={C.chiqim} valyuta={valyuta} />
        <JamiUstun
          nom={tr('Balans')}
          summa={jami.balans}
          rang={jami.balans >= 0 ? C.kirim : C.chiqim}
          valyuta={valyuta}
          ishorali
        />
      </View>

      {tanlangan && (
        <MijozKartochka
          klient={tanlangan}
          yopish={() => setTanlangan(null)}
          ochKirim={() => ochTolov(tanlangan.id)}
          ochChiqim={() => ochOperatsiya(tanlangan.id)}
          ochOperatsiya={(q: HamkorQator) => amallarKorsat(q)}
          ochProfil={() => {
            const k = tanlangan;
            setTanlangan(null);
            ochMijoz(k);
          }}
          ochXabar={(qatorlar, qoldiq) =>
            setXabar(
              xabarMatni({
                ism: [tanlangan.ism, tanlangan.familya].filter(Boolean).join(' '),
                biznes: men.biznes,
                valyuta: tanlangan.valyuta ?? 'UZS',
                qatorlar,
                qoldiq,
              }),
            )
          }
        />
      )}

      {tanlangan && xabar !== null && (
        <XabarOynasi klient={tanlangan} matn={xabar} yopish={() => setXabar(null)} />
      )}
    </View>
  );
}

function JamiUstun({
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
  /** Balansda ishora ma'noli: manfiy bo'lsa qarzim ko'p */
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

function MijozQatori({
  k,
  qoldiq,
  kechikkan,
  bos,
  uzoqBos,
}: {
  k: Klient;
  qoldiq: number;
  kechikkan: boolean;
  bos: () => void;
  /** Uzoq bosish — tahrirlash. Ilovada bu harakat allaqachon tanish. */
  uzoqBos: () => void;
}) {
  const { C } = useTema();
  const nol = qoldiq === 0;
  const ism = [k.ism, k.familya].filter(Boolean).join(' ');
  const tafsilot = [k.kategoriya, k.telefon].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={bos}
      onLongPress={uzoqBos}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: O.chekka,
        paddingVertical: 12,
        backgroundColor: C.karta,
        borderBottomWidth: 1,
        borderBottomColor: C.ajratgich,
      }}
    >
      <MijozRasmi yol={k.rasm_path} harflar={boshHarflar(k.ism, k.familya)} olcham={42} />

      <View style={{ flex: 1 }}>
        <Text style={{ color: C.matn, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {ism}
        </Text>
        {tafsilot ? (
          <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {tafsilot}
          </Text>
        ) : null}
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            color: nol ? C.xira : qoldiq > 0 ? C.kirim : C.chiqim,
            fontSize: 15,
            fontWeight: '700',
          }}
        >
          {nol
            ? '—'
            : (qoldiq > 0 ? '+' : '−') +
              ' ' +
              formatla(Math.abs(qoldiq), k.valyuta ?? 'UZS', { belgisiz: true, kasrsiz: true })}
        </Text>
        {kechikkan && (
          <Text style={{ color: C.chiqim, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
            {tr('muddati o‘tdi')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
