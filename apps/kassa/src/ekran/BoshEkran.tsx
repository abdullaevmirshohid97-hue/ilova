// =============================================================
//  BOSH EKRAN — bir qarashda manzara
//
//  Odam ilovani kuniga o'nlab marta ochadi va odatda BITTA savol
//  bilan ochadi: "hozir qancha pulim bor?". Shuning uchun eng tepada
//  balans, keyin shu oyning kirim-chiqimi, keyin oxirgi yozuvlar.
//
//  Grafik ataylab sodda: ettita ustun, kutubxonasiz. Kutubxona
//  qo'shilsa bundle 200 KB o'sardi va sekin internetda ilova
//  kechikib ochilardi — bitta ustun uchun bu qimmat.
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import {
  davrYigindi,
  formatla,
  hisobQoldiq,
  klientQoldiq,
  umumiyBalans,
} from '@ilova/kassa-yadro';
import type { Yozuv } from '@ilova/kassa-yadro';
import { davrOraligi, kunBoshi, kunKaliti, oraliqdami, sanaQisqa } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Karta, Qator, Sarlavha, uslublar } from '../ui/qismlar';
import { bugunYakunlandi, yakunniBelgila, yakunniYukla, yakunSorash } from '../lib/yakun';
import KunYakuni from './KunYakuni';
import { tr } from '../lib/til';

export default function BoshEkran({
  ochQoshish,
  ochTakror,
  ochYozuvlar,
  ochKontaktlar,
}: {
  ochQoshish: (turi: 'kirim' | 'chiqim') => void;
  ochTakror: (y: Yozuv) => void;
  ochYozuvlar: () => void;
  ochKontaktlar: () => void;
}) {
  const { C } = useTema();
  const s = uslublar(C);
  const { men, hisoblar, turkumlar, klientlar, yozuvlar, yangila, yuklanmoqda } = useHolat();

  const balanslar = useMemo(() => umumiyBalans(hisoblar, yozuvlar), [hisoblar, yozuvlar]);
  const asosiyValyuta = hisoblar[0]?.valyuta ?? 'UZS';

  const oy = useMemo(() => davrOraligi('oy', 0), []);
  const oylik = useMemo(
    () => davrYigindi(yozuvlar.filter((y) => oraliqdami(y.sana, oy))),
    [yozuvlar, oy],
  );

  // Qarz: kimdan olamiz, kimga qarzdormiz
  const qarzlar = useMemo(() => {
    let olamiz = 0;
    let beramiz = 0;
    for (const k of klientlar) {
      const q = klientQoldiq(k.id, yozuvlar);
      if (q > 0) olamiz += q;
      else beramiz += -q;
    }
    return { olamiz, beramiz };
  }, [klientlar, yozuvlar]);

  const oxirgilar = useMemo(
    () => [...yozuvlar].sort((a, b) => Date.parse(b.sana) - Date.parse(a.sana)).slice(0, 6),
    [yozuvlar],
  );

  // -------------------------------------------------------------
  //  TAKRORLASH
  //
  //  Kunlik yozuvlarning kattagina qismi — kechagining aynan
  //  o‘zi: o‘sha turkum, o‘sha hisob, ko‘pincha o‘sha summa.
  //  Shuning uchun oxirgi yozuv pastda tayyor turadi: bosildi —
  //  hammasi to‘ldirilgan oyna ochiladi, faqat tasdiqlash qoladi.
  //
  //  ATAYLAB darhol yozilmaydi: pul yozuvini bir tegish bilan
  //  jimgina qo‘shish xavfli — cho‘ntakda bosilib ketishi mumkin.
  // -------------------------------------------------------------
  const takror = useMemo(() => {
    let eng: Yozuv | null = null;
    for (const y of yozuvlar) {
      if (y.bekor_at || y.kochirma_id) continue;
      if (!eng || Date.parse(y.sana) > Date.parse(eng.sana)) eng = y;
    }
    return eng;
  }, [yozuvlar]);

  // Oxirgi 7 kun — grafik uchun
  const kunlar = useMemo(() => {
    const natija: { kun: string; kirim: number; chiqim: number; sana: Date }[] = [];
    const bugun = kunBoshi(new Date());
    for (let i = 6; i >= 0; i--) {
      const d = new Date(bugun);
      d.setDate(d.getDate() - i);
      natija.push({ kun: kunKaliti(d), kirim: 0, chiqim: 0, sana: d });
    }
    const xarita = new Map(natija.map((x) => [x.kun, x]));
    for (const y of yozuvlar) {
      if (y.bekor_at || y.kochirma_id) continue;
      const x = xarita.get(kunKaliti(y.sana));
      if (!x) continue;
      if (y.turi === 'kirim') x.kirim += y.summa;
      else x.chiqim += y.summa;
    }
    return natija;
  }, [yozuvlar]);

  const eng = Math.max(1, ...kunlar.map((k) => Math.max(k.kirim, k.chiqim)));

  // -------------------------------------------------------------
  //  KUN YAKUNI
  //
  //  Do'kondor kassani kechqurun baribir sanaydi — qog'ozda yoki
  //  boshida. Taklif o'sha marosimga qo'shiladi: kuniga bir marta,
  //  soat 17:00 dan keyin va faqat bugun yozuv bo‘lgan bo‘lsa.
  // -------------------------------------------------------------
  const [yakunOynasi, setYakunOynasi] = useState(false);
  const [yakunYuklandi, setYakunYuklandi] = useState(false);

  useEffect(() => {
    yakunniYukla().then(() => setYakunYuklandi(true));
  }, []);

  const bugunYozuvBor = kunlar[kunlar.length - 1]
    ? kunlar[kunlar.length - 1].kirim > 0 || kunlar[kunlar.length - 1].chiqim > 0
    : false;
  const yakunKerak = yakunYuklandi && yakunSorash(bugunYozuvBor);
  const yakunlandi = yakunYuklandi && bugunYakunlandi();

  return (
    <View style={s.ekran}>
      <View style={s.boshliq}>
        <Text style={s.boshliqIzoh}>{men.biznes}</Text>
        <Text style={s.boshliqMatn}>{tr('Umumiy balans')}</Text>
        <View style={{ marginTop: 6 }}>
          {balanslar.length === 0 ? (
            <Text style={{ color: C.tunMatn, fontSize: 28, fontWeight: '800' }}>
              {formatla(0, asosiyValyuta)}
            </Text>
          ) : (
            balanslar.map((b) => (
              <Text key={b.valyuta} style={{ color: C.tunMatn, fontSize: 28, fontWeight: '800' }}>
                {formatla(b.qoldiq, b.valyuta)}
              </Text>
            ))
          )}
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={yuklanmoqda} onRefresh={yangila} tintColor={C.xira} />}
      >
        {/* Shu oy */}
        <Sarlavha matn={`${tr('Shu oy')} · ${oy.nom}`} />
        <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka, gap: 10 }}>
          <Karta uslub={{ flex: 1, paddingVertical: 14 }}>
            <Text style={{ color: C.xira, fontSize: 12 }}>{tr('↑ Kirim')}</Text>
            <Text style={{ color: C.kirim, fontSize: 17, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
              {formatla(oylik.kirim, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
            </Text>
          </Karta>
          <Karta uslub={{ flex: 1, paddingVertical: 14 }}>
            <Text style={{ color: C.xira, fontSize: 12 }}>{tr('↓ Chiqim')}</Text>
            <Text style={{ color: C.chiqim, fontSize: 17, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
              {formatla(oylik.chiqim, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
            </Text>
          </Karta>
          <Karta uslub={{ flex: 1, paddingVertical: 14 }}>
            <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Farq')}</Text>
            <Text
              style={{
                color: oylik.farq >= 0 ? C.kirim : C.chiqim,
                fontSize: 17,
                fontWeight: '800',
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {formatla(oylik.farq, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
            </Text>
          </Karta>
        </View>

        {/* Kun yakuni taklifi */}
        {yakunKerak && (
          <TouchableOpacity onPress={() => setYakunOynasi(true)} style={{ paddingHorizontal: O.chekka, marginTop: 18 }}>
            <Karta
              uslub={{
                borderColor: C.faol,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 20 }}>◑</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.matn, fontSize: 15, fontWeight: '700' }}>
                  {tr('Kunni yakunlang')}
                </Text>
                <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }}>
                  {tr('Kassani sanang — farq bo‘lsa bugun topiladi')}
                </Text>
              </View>
              <Text style={{ color: C.matn2, fontSize: 18 }}>›</Text>
            </Karta>
          </TouchableOpacity>
        )}
        {yakunlandi && (
          <Text
            style={{
              color: C.kirim,
              fontSize: 12,
              textAlign: 'center',
              marginTop: 16,
            }}
          >
            {tr('✓ Bugungi kassa sanab bo‘lindi')}
          </Text>
        )}

        {/* 7 kunlik grafik */}
        <Sarlavha matn={tr('Oxirgi 7 kun')} />
        <Karta uslub={{ marginHorizontal: O.chekka }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 6 }}>
            {kunlar.map((k) => (
              <View key={k.kun} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 72 }}>
                  <View
                    style={{
                      width: 7,
                      height: Math.max(2, (k.kirim / eng) * 72),
                      backgroundColor: C.kirim,
                      borderRadius: 3,
                    }}
                  />
                  <View
                    style={{
                      width: 7,
                      height: Math.max(2, (k.chiqim / eng) * 72),
                      backgroundColor: C.chiqim,
                      borderRadius: 3,
                    }}
                  />
                </View>
                <Text style={{ color: C.xira, fontSize: 10, marginTop: 6 }}>{k.sana.getDate()}</Text>
              </View>
            ))}
          </View>
        </Karta>

        {/* Qarz */}
        {klientlar.length > 0 && (
          <>
            <Sarlavha
              matn={tr('Qarzlar')}
              yon={
                <TouchableOpacity onPress={ochKontaktlar}>
                  <Text style={{ color: C.matn2, fontSize: 12, fontWeight: '600' }}>{tr('Hammasi ›')}</Text>
                </TouchableOpacity>
              }
            />
            <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka, gap: 10 }}>
              <Karta uslub={{ flex: 1, paddingVertical: 14 }}>
                <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Bizga qarzdor')}</Text>
                <Text style={{ color: C.kirim, fontSize: 16, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                  {formatla(qarzlar.olamiz, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
                </Text>
              </Karta>
              <Karta uslub={{ flex: 1, paddingVertical: 14 }}>
                <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Biz qarzdormiz')}</Text>
                <Text style={{ color: C.chiqim, fontSize: 16, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                  {formatla(qarzlar.beramiz, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
                </Text>
              </Karta>
            </View>
          </>
        )}

        {/* Hisoblar */}
        <Sarlavha matn={tr('Hisoblar')} />
        <View style={{ paddingHorizontal: O.chekka, gap: 8 }}>
          {hisoblar
            .filter((h) => h.faol)
            .map((h) => (
              <Karta key={h.id} uslub={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
                <Text style={{ flex: 1, color: C.matn, fontSize: 15, fontWeight: '600' }}>{h.nom}</Text>
                <Text style={{ color: C.matn, fontSize: 15, fontWeight: '700' }}>
                  {formatla(hisobQoldiq(h, yozuvlar), h.valyuta, { kasrsiz: true })}
                </Text>
              </Karta>
            ))}
        </View>

        {/* Oxirgi yozuvlar */}
        <Sarlavha
          matn={tr('Oxirgi yozuvlar')}
          yon={
            <TouchableOpacity onPress={ochYozuvlar}>
              <Text style={{ color: C.matn2, fontSize: 12, fontWeight: '600' }}>{tr('Hammasi ›')}</Text>
            </TouchableOpacity>
          }
        />
        {oxirgilar.length === 0 ? (
          <BoshHolat
            belgi="↑↓"
            matn={tr('Hali yozuv yo‘q')}
            izoh={tr('Pastdagi + tugmasi bilan birinchi yozuvni kiriting')}
          />
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: C.chegara }}>
            {oxirgilar.map((y) => (
              <YozuvQatori key={y.id} y={y} turkumNomi={turkumlar.find((t) => t.id === y.turkum_id)?.nom} />
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {yakunOynasi && (
        <KunYakuni
          yopish={() => setYakunOynasi(false)}
          yakunlandi={() => {
            void yakunniBelgila();
            setYakunYuklandi(false);
            setYakunYuklandi(true);
          }}
        />
      )}

      {/* Takrorlash — kechagi yozuvni tayyor holda ochadi */}
      {takror && (
        <TouchableOpacity
          onPress={() => ochTakror(takror)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: C.karta,
            borderTopWidth: 1,
            borderTopColor: C.chegara,
            paddingHorizontal: O.chekka,
            minHeight: 46,
          }}
        >
          <Text style={{ color: C.matn2, fontSize: 15 }}>↺</Text>
          <Text style={{ flex: 1, color: C.matn2, fontSize: 13 }} numberOfLines={1}>
            Takrorlash:{' '}
            {takror.izoh ||
              turkumlar.find((t) => t.id === takror.turkum_id)?.nom ||
              (takror.turi === 'kirim' ? tr('Kirim') : tr('Chiqim'))}
          </Text>
          <Text
            style={{
              color: takror.turi === 'kirim' ? C.kirim : C.chiqim,
              fontSize: 13,
              fontWeight: '700',
            }}
          >
            {takror.turi === 'kirim' ? '+' : '−'}{' '}
            {formatla(takror.summa, takror.valyuta, { belgisiz: true, kasrsiz: true })}
          </Text>
        </TouchableOpacity>
      )}

      {/* Ikki katta tugma — eng ko‘p ishlatiladigan ikki amal */}
      <View style={{ flexDirection: 'row', padding: 10, gap: 10, backgroundColor: C.karta }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: C.kirim, paddingVertical: 14, borderRadius: O.radiusKichik, alignItems: 'center' }}
          onPress={() => ochQoshish('kirim')}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{tr('↑ Kirim')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: C.chiqim, paddingVertical: 14, borderRadius: O.radiusKichik, alignItems: 'center' }}
          onPress={() => ochQoshish('chiqim')}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{tr('↓ Chiqim')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function YozuvQatori({
  y,
  turkumNomi,
  klientNomi,
  bos,
  uzoqBos,
  qoldiq,
}: {
  y: Yozuv;
  turkumNomi?: string;
  klientNomi?: string;
  bos?: () => void;
  uzoqBos?: () => void;
  qoldiq?: number | null;
}) {
  const { C } = useTema();
  const kirim = y.turi === 'kirim';
  const izohlar = [sanaQisqa(y.sana), turkumNomi, klientNomi, y.kochirma_id ? tr('o‘tkazma') : null, y.bekor_at ? tr('BEKOR QILINGAN') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Qator
      nom={y.izoh || turkumNomi || (kirim ? tr('Kirim') : tr('Chiqim'))}
      izoh={izohlar}
      ong={`${kirim ? '+' : '−'} ${formatla(y.summa, y.valyuta, { belgisiz: true, kasrsiz: true })}`}
      ongRang={y.kochirma_id ? C.matn2 : kirim ? C.kirim : C.chiqim}
      ongIzoh={qoldiq !== null && qoldiq !== undefined ? formatla(qoldiq, y.valyuta, { belgisiz: true, kasrsiz: true }) : undefined}
      sozilgan={!!y.bekor_at}
      bos={bos}
      uzoqBos={uzoqBos}
    />
  );
}
