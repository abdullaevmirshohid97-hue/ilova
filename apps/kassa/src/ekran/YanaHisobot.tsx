// =============================================================
//  HISOBOT — davr kesimi va faylga chiqarish
//
//  Excel va PDF QURILMADA yasaladi (lib/hisobot.ts), shuning
//  uchun internetsiz ham ishlaydi. Bu yerda faqat ko'rinish.
// =============================================================

import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { davrYigindi, formatla, hisobQoldiq } from '@ilova/kassa-yadro';
import type { Hisob } from '@ilova/kassa-yadro';
import { davrOraligi, oraliqdami, type DavrTuri } from '../lib/davr';
import { hisobotPdf, hisobotXlsx } from '../lib/hisobot';
import { ulash } from '../lib/ulash';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, DavrOqlari, Karta, Sarlavha, Tanlagich, Tugma, YigindiPaneli } from '../ui/qismlar';

export default function Hisobot() {
  const { C } = useTema();
  const { men, yozuvlar, turkumlar, hisoblar, klientlar } = useHolat();
  const [davr, setDavr] = useState<DavrTuri>('oy');
  const [siljish, setSiljish] = useState(0);
  const [chiqarmoqda, setChiqarmoqda] = useState<'xlsx' | 'pdf' | null>(null);

  const oraliq = useMemo(() => davrOraligi(davr, siljish), [davr, siljish]);
  const davrniki = useMemo(() => yozuvlar.filter((y) => oraliqdami(y.sana, oraliq)), [yozuvlar, oraliq]);
  const yigindi = useMemo(() => davrYigindi(davrniki), [davrniki]);
  const valyuta = hisoblar[0]?.valyuta ?? 'UZS';

  const turkumKesimi = useMemo(() => {
    const m = new Map<string, { nom: string; turi: string; summa: number }>();
    for (const y of davrniki) {
      if (y.bekor_at || y.kochirma_id) continue;
      const kalit = y.turkum_id ?? `yoq-${y.turi}`;
      const nom = turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? 'Turkumsiz';
      const bor = m.get(kalit) ?? { nom, turi: y.turi, summa: 0 };
      bor.summa += y.summa;
      m.set(kalit, bor);
    }
    return [...m.values()].sort((a, b) => b.summa - a.summa);
  }, [davrniki, turkumlar]);

  const chiqimlar = turkumKesimi.filter((t) => t.turi === 'chiqim');
  const kirimlar = turkumKesimi.filter((t) => t.turi === 'kirim');
  const engKatta = Math.max(1, ...turkumKesimi.map((t) => t.summa));

  async function chiqar(tur: 'xlsx' | 'pdf') {
    if (davrniki.length === 0) {
      Alert.alert('Bo‘sh hisobot', 'Bu davrda yozuv yo‘q — avval davrni almashtiring.');
      return;
    }
    setChiqarmoqda(tur);
    try {
      const manba = {
        biznes: men.biznes,
        davr: oraliq.nom,
        yozuvlar: davrniki,
        hisoblar,
        turkumlar,
        klientlar,
      };
      const bayt = tur === 'xlsx' ? hisobotXlsx(manba) : hisobotPdf(manba);
      await ulash(`${men.biznes}-${oraliq.nom}`, bayt, tur);
    } catch (e) {
      Alert.alert('Chiqarib bo‘lmadi', xatoMatn(e));
    } finally {
      setChiqarmoqda(null);
    }
  }

  return (
    <>
      <View style={{ backgroundColor: C.karta }}>
        <Tanlagich
          qiymat={davr}
          variantlar={[
            { kalit: 'kun' as const, matn: 'Kunlik' },
            { kalit: 'hafta' as const, matn: 'Haftalik' },
            { kalit: 'oy' as const, matn: 'Oylik' },
            { kalit: 'hammasi' as const, matn: 'Hammasi' },
          ]}
          qoy={(k) => {
            setDavr(k);
            setSiljish(0);
          }}
        />
      </View>
      {davr !== 'hammasi' && (
        <DavrOqlari
          nom={oraliq.nom}
          oldin={() => setSiljish((x) => x - 1)}
          keyin={() => setSiljish((x) => Math.min(0, x + 1))}
          keyinOchiq={siljish < 0}
        />
      )}

      <ScrollView style={{ flex: 1 }}>
        {turkumKesimi.length === 0 ? (
          <BoshHolat belgi="▤" matn="Bu davrda yozuv yo‘q" />
        ) : (
          <>
            <Sarlavha matn="Chiqim turkumlari" />
            {chiqimlar.length === 0 && (
              <Text style={{ color: C.xira, fontSize: 13, paddingHorizontal: O.chekka }}>Chiqim yo‘q</Text>
            )}
            {chiqimlar.map((t) => (
              <UstunQator key={t.nom + t.turi} nom={t.nom} summa={t.summa} eng={engKatta} rang={C.chiqim} valyuta={valyuta} />
            ))}

            <Sarlavha matn="Kirim turkumlari" />
            {kirimlar.length === 0 && (
              <Text style={{ color: C.xira, fontSize: 13, paddingHorizontal: O.chekka }}>Kirim yo‘q</Text>
            )}
            {kirimlar.map((t) => (
              <UstunQator key={t.nom + t.turi} nom={t.nom} summa={t.summa} eng={engKatta} rang={C.kirim} valyuta={valyuta} />
            ))}

            <Sarlavha matn="Hisoblar" />
            <View style={{ paddingHorizontal: O.chekka, gap: 8 }}>
              {hisoblar
                .filter((h) => h.faol)
                .map((h) => {
                  const shu = davrniki.filter((y) => y.hisob_id === h.id);
                  const yg = davrYigindi(shu, { kochirmalarHam: true });
                  return (
                    <Karta key={h.id} uslub={{ paddingVertical: 12 }}>
                      <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>{h.nom}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 6, gap: 16 }}>
                        <Text style={{ color: C.kirim, fontSize: 13 }}>
                          ↑ {formatla(yg.kirim, h.valyuta, { belgisiz: true, kasrsiz: true })}
                        </Text>
                        <Text style={{ color: C.chiqim, fontSize: 13 }}>
                          ↓ {formatla(yg.chiqim, h.valyuta, { belgisiz: true, kasrsiz: true })}
                        </Text>
                        <Text style={{ color: C.matn2, fontSize: 13, marginLeft: 'auto' }}>
                          {formatla(hisobQoldiq(h, yozuvlar), h.valyuta, { belgisiz: true, kasrsiz: true })}
                        </Text>
                      </View>
                    </Karta>
                  );
                })}
            </View>
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Eksport — hisobot ekranining asosiy maqsadi: buxgalterga
          yoki hamkorga yuborish. Fayl qurilmada yasaladi. */}
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: C.karta }}>
        <Tugma
          matn="Excel"
          ikkilamchi
          kutmoqda={chiqarmoqda === 'xlsx'}
          bos={() => chiqar('xlsx')}
          uslub={{ flex: 1 }}
        />
        <Tugma
          matn="PDF"
          ikkilamchi
          kutmoqda={chiqarmoqda === 'pdf'}
          bos={() => chiqar('pdf')}
          uslub={{ flex: 1 }}
        />
      </View>

      <YigindiPaneli
        chap={{ yorliq: 'Kirim', qiymat: formatla(yigindi.kirim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.kirim }}
        orta={{ yorliq: 'Chiqim', qiymat: formatla(yigindi.chiqim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.chiqim }}
        ong={{
          yorliq: 'Farq',
          qiymat: formatla(yigindi.farq, valyuta, { belgisiz: true, kasrsiz: true }),
          rang: yigindi.farq >= 0 ? C.kirim : C.chiqim,
        }}
      />
    </>
  );
}

function UstunQator({
  nom,
  summa,
  eng,
  rang,
  valyuta,
}: {
  nom: string;
  summa: number;
  eng: number;
  rang: string;
  valyuta: Hisob['valyuta'];
}) {
  const { C } = useTema();
  return (
    <View style={{ paddingHorizontal: O.chekka, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: C.matn, fontSize: 14 }}>{nom}</Text>
        <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>
          {formatla(summa, valyuta, { belgisiz: true, kasrsiz: true })}
        </Text>
      </View>
      {/* Ustun uzunligi — eng kattasiga nisbatan. Raqamni o'qimasdan
          ham qaysi turkum og'irligi ko'rinadi. */}
      <View style={{ height: 6, backgroundColor: C.ajratgich, borderRadius: 3 }}>
        <View style={{ height: 6, width: `${Math.max(2, (summa / eng) * 100)}%`, backgroundColor: rang, borderRadius: 3 }} />
      </View>
    </View>
  );
}
