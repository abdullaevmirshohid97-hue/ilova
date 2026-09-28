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
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
  asosiygaOgir,
  bitimQoldiq,
  formatla,
  hamkorQoldiq,
  muddatiOtgan,
  operatsiyaNomi,
  type HamkorQator,
} from '@ilova/kassa-yadro';
import type { Klient, Yozuv } from '@ilova/kassa-yadro';
import { boshHarflar } from '../lib/rasm';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { BoshHolat } from '../ui/qismlar';
import { MijozRasmi } from '../ui/MijozRasmi';
import MijozKartochka from './MijozKartochka';
import OperatsiyaOynasi from './OperatsiyaOynasi';
import { bitimHujjati, tasdiqYubor } from '../lib/bitim-amallar';
import XabarOynasi from './XabarOynasi';
import { xabarMatni } from '../lib/xabar';
import type { XabarTil } from '../lib/xabar-til';
import { Ogoh } from '../lib/ogoh';
import { klientTahrirla } from '../lib/baza';
import { xatoMatn } from '../lib/supabase';

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
  tahrirYozuv,
}: {
  /** Yuqoridagi lupa shu matnni to'ldiradi */
  qidiruv: string;
  ochMijoz: (k?: Klient) => void;
  ochBitimlar: () => void;
  ochOperatsiya: (klientId: string) => void;
  /** Kirim — `oldim`, chiqim — `berdim`. Ikkalasi ham bir xil sodda oyna. */
  ochTolov: (klientId: string, yonalish: 'oldim' | 'berdim') => void;
  /** Daftar yozuvini tahrirlash — App dagi `YozuvOynasi` ga */
  tahrirYozuv: (y: Yozuv) => void;
}) {
  const { C } = useTema();
  const {
    men,
    klientlar,
    barchaKlientlar,
    yozuvlar,
    bitimlar,
    tolovlar,
    valyutalar,
    yangila,
    yuklanmoqda,
  } = useHolat();
  const [ochirilganlarOchiq, setOchirilganlarOchiq] = useState(false);
  const [filtr, setFiltr] = useState<Filtr>('hammasi');
  const [tanlangan, setTanlangan] = useState<Klient | null>(null);
  // Xabar oynasi kartochkaning USTIDAN ochiladi: odam xabarni
  // yuborgach o‘sha mijozning tarixiga qaytishi kerak.
  // Matn EMAS, MATN YASOVCHI saqlanadi: xabar oynasida til
  // almashsa, matn shu funksiya bilan qaytadan yasaladi.
  const [xabar, setXabar] = useState<((til: XabarTil) => string) | null>(null);

  // Pastdagi jami ASOSIY valyutada: har hamkorning qoldig‘i
  // o‘z valyutasida, lekin ularni qo‘shish uchun bitta o‘lchov
  // kerak. O‘girmasak so‘m va dollar qo‘shilib, jim xato
  // chiqardi — balans.ts dagi 3-qoida.
  const asosiy = valyutalar.find((v) => v.asosiy)?.valyuta ?? 'UZS';
  const kursXarita = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of valyutalar) m.set(v.valyuta, v.kurs);
    return m;
  }, [valyutalar]);

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

  // O‘chirilgan hamkorlar — pastdagi bo‘lim uchun. Qoldig‘i ham
  // ko‘rsatiladi: pul qolgan hamkorni adashib o‘chirgan odam uni
  // shu raqamdan taniydi.
  const ochirilganlar = useMemo(
    () => barchaKlientlar.filter((k) => k.faol === false),
    [barchaKlientlar],
  );

  /**
   * Uzoq bosilganda — menyu. Ilgari uzoq bosish TO‘G‘RIDAN tahrir
   * oynasini ochardi va hamkorni o‘chirishning umuman yo‘li yo‘q edi.
   * Tahrirlash menyuning birinchi bandi bo‘lib qoldi — eski odat
   * buzilmaydi, faqat bir bosish qo‘shiladi.
   */
  function mijozAmallari(k: Klient) {
    Ogoh.alert(k.ism, k.telefon ?? undefined, [
      { text: tr('Tahrirlash'), onPress: () => ochMijoz(k) },
      { text: tr('O‘chirish'), style: 'destructive', onPress: () => mijozniOchir(k) },
      { text: tr('Bekor'), style: 'cancel' },
    ]);
  }

  /**
   * O‘CHIRISH = `faol: false`. Bazadan olinmaydi: sinxda o‘chirish
   * amali yo‘q (boshqa telefonlarda qolib ketardi) va hamkorning
   * bitim, to‘lov, yozuvlari unga bog‘langan — ular hisobotda uning
   * NOMI bilan ko‘rinishi kerak (`barchaKlientlar`).
   *
   * Qoldiq bor bo‘lsa ANIQ aytiladi: hamkor o‘chsa u bosh sahifadagi
   * jamidan chiqadi. Jimgina chiqib ketsa, odam «qarzlar kamaydi»
   * deb o‘ylardi.
   */
  function mijozniOchir(k: Klient) {
    const qoldiq = qoldiqlar.get(k.id) ?? 0;
    const summa = formatla(Math.abs(qoldiq), k.valyuta ?? 'UZS');
    const qarz =
      qoldiq > 0
        ? `${tr('Bu hamkor sizga qarzdor:')} ${summa}. `
        : qoldiq < 0
          ? `${tr('Siz bu hamkorga qarzdorsiz:')} ${summa}. `
          : '';
    const izoh =
      qarz +
      (qarz ? tr('O‘chirilsa, bosh sahifadagi jamidan chiqadi.') + ' ' : '') +
      tr('Yozuvlari o‘chmaydi — pastdagi «O‘chirilganlar» dan qaytarish mumkin.');
    Ogoh.alert(`«${k.ism}» ${tr('o‘chirilsinmi?')}`, izoh, [
      { text: tr('Yo‘q'), style: 'cancel' },
      {
        text: tr('O‘chirish'),
        style: 'destructive',
        onPress: () => void faolQoy(k, false),
      },
    ]);
  }

  async function faolQoy(k: Klient, faol: boolean) {
    try {
      await klientTahrirla(k.id, { faol });
      if (!faol && tanlangan?.id === k.id) setTanlangan(null);
      await yangila();
    } catch (e) {
      Ogoh.alert(tr('Xatolik'), xatoMatn(e));
    }
  }

  /**
   * Qator bosilganda.
   *
   * To‘liq operatsiya oynasi keyingi bosqichda. Hozircha
   * mavjud amallar beriladi — qator bosilib hech narsa
   * bo‘lmasligi eng yomon variant edi: odam ikki-uch marta
   * bosib, ilova qotib qoldi deb o‘ylardi.
   */
  const [tahrirQator, setTahrirQator] = useState<HamkorQator | null>(null);

  /**
   * Operatsiya qatori bosilganda — TO‘G‘RIDAN operatsiya oynasi.
   * Ilgari avval menyu chiqardi (Tahrirlash / Hujjat / Bekor) va
   * operatsiyani o‘chirish uchun tugma umuman yo‘q edi. Endi oyna
   * tepasida 🗑 turadi, bitimning hujjat va tasdiq havolasi esa
   * oyna pastida (2026-09-28, foydalanuvchi talabi).
   */
  function amallarKorsat(q: HamkorQator) {
    if (!tanlangan) return;

    // Daftar yozuvi O‘Z oynasida ochiladi: u hisob, turkum va
    // o‘tkazmani ham biladi.
    if (q.tur === 'yozuv') {
      tahrirYozuv(q.yozuv);
      return;
    }
    setTahrirQator(q);
  }

  /** Bitim oynasining pastidagi qo‘shimcha amallar */
  function bitimAmallari(q: HamkorQator | null): { matn: string; bos: () => void }[] {
    if (!q || q.tur !== 'bitim' || !tanlangan) return [];
    const b = q.bitim;
    const k = tanlangan;
    const royxat = [{ matn: tr('Hujjat (PDF)'), bos: () => void bitimHujjati(b, tolovlar, k, men.biznes) }];
    if (b.holat === 'kutilmoqda') {
      royxat.push({ matn: tr('Tasdiqlash havolasi'), bos: () => void tasdiqYubor(b, k, men.biznes) });
    }
    return royxat;
  }

  const jami = useMemo(() => {
    let haqlar = 0;
    let qarzlar = 0;
    for (const k of klientlar) {
      const q = qoldiqlar.get(k.id) ?? 0;
      if (q === 0) continue;
      const kv = k.valyuta ?? 'UZS';
      const asosiyda = kv === asosiy ? q : asosiygaOgir(q, kursXarita.get(kv) ?? 1);
      if (asosiyda > 0) haqlar += asosiyda;
      else qarzlar += -asosiyda;
    }
    return { haqlar, qarzlar, balans: haqlar - qarzlar };
  }, [klientlar, qoldiqlar, asosiy, kursXarita]);

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
              uzoqBos={() => mijozAmallari(k)}
            />
          ))
        )}

        {/* Filtr yoki qidiruv paytida ko‘rsatilmaydi: u yerda odam
            aniq narsani qidiryapti, o‘chirilganlar esa chalg‘itadi. */}
        {ochirilganlar.length > 0 && filtr === 'hammasi' && !qidiruv.trim() && (
          <View style={{ marginTop: 8, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setOchirilganlarOchiq((x) => !x)}
              style={{ paddingHorizontal: O.chekka, paddingVertical: 14 }}
            >
              <Text style={{ color: C.xira, fontSize: 13, fontWeight: '600' }}>
                {ochirilganlarOchiq ? '▾' : '▸'} {tr('O‘chirilganlar')} · {ochirilganlar.length}
              </Text>
            </TouchableOpacity>
            {ochirilganlarOchiq &&
              ochirilganlar.map((k) => {
                const q = hamkorQoldiq(k.id, bitimlar, tolovlar, yozuvlar);
                return (
                  <View
                    key={k.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingLeft: O.chekka,
                      paddingRight: O.chekka - 8,
                      paddingVertical: 10,
                      backgroundColor: C.karta,
                      borderBottomWidth: 1,
                      borderBottomColor: C.ajratgich,
                      opacity: 0.7,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.matn, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                        {k.ism}
                      </Text>
                      <Text style={{ color: q === 0 ? C.xira : q > 0 ? C.kirim : C.chiqim, fontSize: 12, marginTop: 3 }}>
                        {q === 0 ? tr('Hisob teng') : (q > 0 ? '+' : '−') + formatla(Math.abs(q), k.valyuta ?? 'UZS')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => void faolQoy(k, true)} hitSlop={8} style={{ padding: 8 }}>
                      <Text style={{ color: C.faol, fontSize: 14, fontWeight: '700' }}>{tr('Qaytarish')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
          </View>
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
        <JamiUstun nom={tr('Jami haqlar')} summa={jami.haqlar} rang={C.kirim} valyuta={asosiy} />
        <JamiUstun nom={tr('Jami qarzlar')} summa={jami.qarzlar} rang={C.chiqim} valyuta={asosiy} />
        <JamiUstun
          nom={tr('Balans')}
          summa={jami.balans}
          rang={jami.balans >= 0 ? C.kirim : C.chiqim}
          valyuta={asosiy}
          ishorali
        />
      </View>

      {/* Oyna O‘Z ko‘rinishini "qator" propi bilan boshqaradi —
          shuning uchun "tanlangan" shartidan TASHQARIDA turadi. */}
      <OperatsiyaOynasi
        qator={tahrirQator}
        yop={() => setTahrirQator(null)}
        saqlandi={() => void yangila()}
        amallar={bitimAmallari(tahrirQator)}
      />

      {tanlangan && (
        <MijozKartochka
          klient={tanlangan}
          yopish={() => setTanlangan(null)}
          ochKirim={() => ochTolov(tanlangan.id, 'oldim')}
          // Chiqim ham TO‘G‘RIDAN oynani ochadi. Ilgari avval oltita
          // tanlovli ro‘yxat chiqardi (tovar / qarz / pul / kassa) —
          // foydalanuvchi uni ortiqcha deb topdi (2026-09-28).
          ochChiqim={() => ochTolov(tanlangan.id, 'berdim')}
          ochOperatsiya={(q: HamkorQator) => amallarKorsat(q)}
          ochProfil={() => {
            const k = tanlangan;
            setTanlangan(null);
            ochMijoz(k);
          }}
          ochXabar={(qatorlar, qoldiq) =>
            // `setXabar` FUNKSIYA saqlaydi, shuning uchun
            // `() => fn`: aks holda React uni yangilovchi deb
            // o‘ylab darhol chaqirib yuborardi.
            setXabar(() => (til: XabarTil) =>
              xabarMatni({
                til,
                ism: [tanlangan.ism, tanlangan.familya].filter(Boolean).join(' '),
                telefon: tanlangan.telefon,
                biznes: men.biznes,
                valyuta: tanlangan.valyuta ?? 'UZS',
                qatorlar,
                qoldiq,
                // Muddati otgan va hali tolanmagan summa:
                // xabarning eng muhim qatori, aynan shu uchun
                // yoziladi.
                kechikkan: muddatiOtgan(bitimlar, tolovlar)
                  .filter((b) => b.klient_id === tanlangan.id)
                  .reduce((yig, b) => yig + bitimQoldiq(b, tolovlar), 0),
              }),
            )
          }
        />
      )}

      {tanlangan && xabar !== null && (
        <XabarOynasi klient={tanlangan} matnYasa={xabar} yopish={() => setXabar(null)} />
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
