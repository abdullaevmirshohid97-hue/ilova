// =============================================================
//  BOSH EKRAN — bir qarashda manzara
//
//  Odam ilovani kuniga o'nlab marta ochadi va endi BOSHQA savol
//  bilan ochadi: "kim menga qarzdor?". Shuning uchun eng tepada
//  qarz turadi, keyin hisoblar va oxirgi yozuvlar.
//
//  20.09 da uchta blok OLIB TASHLANDI: «Umumiy balans», «Shu oy»
//  va «Oxirgi 7 kun» grafigi. Ular eski savolga — «qancha pulim
//  bor?» — javob berardi va ekranning eng qimmatli qismini
//  egallardi. Ma’lumot yo‘qolgani yo‘q: hisob qoldig‘i pastdagi
//  «Hisoblar» da, oylik kirim-chiqim esa «Yana → Hisobot» da.
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatla, hisobQoldiq, qarzYigindi } from '@ilova/kassa-yadro';
import type { Yozuv } from '@ilova/kassa-yadro';
import { kunBoshi, kunKaliti, sanaQisqa } from '../lib/davr';
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
  ochQoshish: () => void;
  ochTakror: (y: Yozuv) => void;
  ochYozuvlar: () => void;
  ochKontaktlar: () => void;
}) {
  const { C } = useTema();
  const s = uslublar(C);
  const { men, hisoblar, turkumlar, yozuvlar, bitimlar, tolovlar, yangila, yuklanmoqda } =
    useHolat();

  const asosiyValyuta = hisoblar[0]?.valyuta ?? 'UZS';

  // Qarz: kimdan olamiz, kimga qarzdormiz.
  //
  // Hamkor kartochkasi bilan AYNAN bir xil funksiya — bosh
  // ekrandagi jami kartochkalar yig‘indisiga teng chiqishi shart.
  const qarzlar = useMemo(
    () => qarzYigindi(bitimlar, tolovlar, yozuvlar),
    [bitimlar, tolovlar, yozuvlar],
  );

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

  // Bugun yozuv bo‘lganmi — kun yakuni taklifi shunga tayanadi.
  //
  // Avval bu 7 kunlik massivdan olinardi (grafik uchun yasalgan
  // edi). Grafik ketdi, savol qoldi — shuning uchun endi to‘g‘ridan
  // to‘g‘ri so‘raladi.
  const bugunYozuvBor = useMemo(() => {
    const bugun = kunKaliti(kunBoshi(new Date()));
    return yozuvlar.some(
      (y) => !y.bekor_at && !y.kochirma_id && kunKaliti(y.sana) === bugun,
    );
  }, [yozuvlar]);

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

  const yakunKerak = yakunYuklandi && yakunSorash(bugunYozuvBor);
  const yakunlandi = yakunYuklandi && bugunYakunlandi();

  return (
    <View style={s.ekran}>
      {/* Sarlavhada endi RAQAM yo‘q: umumiy balans olib tashlandi.
          Hisob qoldig‘i pastdagi «Hisoblar» bo‘limida turibdi. */}
      <View style={s.boshliq}>
        <Text style={s.boshliqMatn}>{men.biznes}</Text>
        <Text style={s.boshliqIzoh}>{tr('Oldi-berdi daftari')}</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={yuklanmoqda} onRefresh={yangila} tintColor={C.xira} />}
      >
        {/* Qarz — endi eng tepada va hamma vaqt ko‘rinadi, hatto
            nol bo‘lsa ham: «hech kim qarzdor emas» ham javob. */}
        <Sarlavha
          matn={tr('Qarzlar')}
          yon={
            <TouchableOpacity onPress={ochKontaktlar}>
              <Text style={{ color: C.matn2, fontSize: 12, fontWeight: '600' }}>{tr('Hammasi ›')}</Text>
            </TouchableOpacity>
          }
        />
        <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka, gap: 10 }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={ochKontaktlar}>
            <Karta uslub={{ paddingVertical: 14 }}>
              <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Bizga qarzdor')}</Text>
              <Text style={{ color: C.kirim, fontSize: 17, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                {formatla(qarzlar.olamiz, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
              </Text>
            </Karta>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} onPress={ochKontaktlar}>
            <Karta uslub={{ paddingVertical: 14 }}>
              <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Biz qarzdormiz')}</Text>
              <Text style={{ color: C.chiqim, fontSize: 17, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                {formatla(qarzlar.beramiz, asosiyValyuta, { belgisiz: true, kasrsiz: true })}
              </Text>
            </Karta>
          </TouchableOpacity>
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

      {/* Bitta tugma, ichida oltita aniq javob.

          Avval ikkita edi: «Kirim» va «Chiqim». Ular ATAMA, mahsulot
          esa endi oldi-berdi haqida — «oldim / berdim». */}
      <View style={{ padding: 10, backgroundColor: C.karta }}>
        <TouchableOpacity
          style={{
            backgroundColor: C.faol,
            minHeight: 52,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: O.radiusKichik,
          }}
          onPress={ochQoshish}
        >
          <Text style={{ color: C.faolMatn, fontSize: 16, fontWeight: '700' }}>
            {tr('+ Operatsiya')}
          </Text>
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
