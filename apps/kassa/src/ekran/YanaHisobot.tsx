// =============================================================
//  HISOBOT — davr kesimi va faylga chiqarish
//
//  Excel va PDF QURILMADA yasaladi (lib/hisobot.ts), shuning
//  uchun internetsiz ham ishlaydi. Bu yerda faqat ko'rinish.
// =============================================================

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { davrYigindi, formatla, hisobQoldiq, qarzTasdiqBoyicha } from '@ilova/kassa-yadro';
import type { Hisob, QarzJami } from '@ilova/kassa-yadro';
import { davrOraligi, oraliqdami, type DavrTuri } from '../lib/davr';
import { hisobotPdf, hisobotXlsx } from '../lib/hisobot';
import { ulash } from '../lib/ulash';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, DavrOqlari, Karta, Sarlavha, Tanlagich, Tugma, YigindiPaneli } from '../ui/qismlar';
import { tr } from '../lib/til';
import { Ogoh } from '../lib/ogoh';

export default function Hisobot() {
  const { C } = useTema();
  const { men, yozuvlar, turkumlar, hisoblar, klientlar, bitimlar, tolovlar } = useHolat();
  const [davr, setDavr] = useState<DavrTuri>('oy');
  const [siljish, setSiljish] = useState(0);
  const [chiqarmoqda, setChiqarmoqda] = useState<'xlsx' | 'pdf' | null>(null);

  const oraliq = useMemo(() => davrOraligi(davr, siljish), [davr, siljish]);
  const davrniki = useMemo(() => yozuvlar.filter((y) => oraliqdami(y.sana, oraliq)), [yozuvlar, oraliq]);
  const yigindi = useMemo(() => davrYigindi(davrniki), [davrniki]);

  // Qarz davrga bogliq emas: bugungi holat
  const qarz = useMemo(
    () => qarzTasdiqBoyicha(bitimlar, tolovlar, yozuvlar),
    [bitimlar, tolovlar, yozuvlar],
  );
  const valyuta = hisoblar[0]?.valyuta ?? 'UZS';

  const turkumKesimi = useMemo(() => {
    const m = new Map<string, { nom: string; turi: string; summa: number }>();
    for (const y of davrniki) {
      if (y.bekor_at || y.kochirma_id) continue;
      const kalit = y.turkum_id ?? `yoq-${y.turi}`;
      const nom = turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? tr('Turkumsiz');
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
      Ogoh.alert(tr('Bo‘sh hisobot'), tr('Bu davrda yozuv yo‘q — avval davrni almashtiring.'));
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
      Ogoh.alert(tr('Chiqarib bo‘lmadi'), xatoMatn(e));
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
            { kalit: 'kun' as const, matn: tr('Kunlik') },
            { kalit: 'hafta' as const, matn: tr('Haftalik') },
            { kalit: 'oy' as const, matn: tr('Oylik') },
            { kalit: 'hammasi' as const, matn: tr('Hammasi') },
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
          <BoshHolat belgi="▤" matn={tr('Bu davrda yozuv yo‘q')} />
        ) : (
          <>
            <Sarlavha matn={tr('Chiqim turkumlari')} />
            {chiqimlar.length === 0 && (
              <Text style={{ color: C.xira, fontSize: 13, paddingHorizontal: O.chekka }}>{tr('Chiqim yo‘q')}</Text>
            )}
            {chiqimlar.map((t) => (
              <UstunQator key={t.nom + t.turi} nom={t.nom} summa={t.summa} eng={engKatta} rang={C.chiqim} valyuta={valyuta} />
            ))}

            <Sarlavha matn={tr('Kirim turkumlari')} />
            {kirimlar.length === 0 && (
              <Text style={{ color: C.xira, fontSize: 13, paddingHorizontal: O.chekka }}>{tr('Kirim yo‘q')}</Text>
            )}
            {kirimlar.map((t) => (
              <UstunQator key={t.nom + t.turi} nom={t.nom} summa={t.summa} eng={engKatta} rang={C.kirim} valyuta={valyuta} />
            ))}

            {/* Qarz DAVRGA bog‘liq emas: u bugungi holat, oqim
                emas. Shuning uchun davr o‘qlari unga ta‘sir
                qilmaydi — sarlavhada shu aytilgan. */}
            <Sarlavha matn={tr('Qarzlar — bugungi holat')} />
            <View style={{ paddingHorizontal: O.chekka, gap: 8 }}>
              <QarzQatori
                nom={tr('Tasdiqlangan')}
                izoh={tr('Hamkor Telegramda tan olgan')}
                jami={qarz.tasdiqlangan}
                valyuta={valyuta}
              />
              <QarzQatori
                nom={tr('Tasdiqlanmagan')}
                izoh={tr('Daftarda bor, hamkor hali tasdiqlamagan')}
                jami={qarz.tasdiqlanmagan}
                valyuta={valyuta}
              />
            </View>

            <Sarlavha matn={tr('Hisoblar')} />
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
          matn={tr('Excel')}
          ikkilamchi
          kutmoqda={chiqarmoqda === 'xlsx'}
          bos={() => chiqar('xlsx')}
          uslub={{ flex: 1 }}
        />
        <Tugma
          matn={tr('PDF')}
          ikkilamchi
          kutmoqda={chiqarmoqda === 'pdf'}
          bos={() => chiqar('pdf')}
          uslub={{ flex: 1 }}
        />
      </View>

      <YigindiPaneli
        chap={{ yorliq: tr('Kirim'), qiymat: formatla(yigindi.kirim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.kirim }}
        orta={{ yorliq: tr('Chiqim'), qiymat: formatla(yigindi.chiqim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.chiqim }}
        ong={{
          yorliq: tr('Farq'),
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

/**
 * Tasdiq holati bo'yicha qarz qatori.
 *
 * Ikki raqam yonma-yon turadi, chunki savol ham ikkitadir: «menga
 * qancha qarzdor» va «men qancha qarzdorman». Bittasi nol bo'lsa
 * ham ko'rsatiladi — bo'shligi ham javob.
 */
function QarzQatori({
  nom,
  izoh,
  jami,
  valyuta,
}: {
  nom: string;
  izoh: string;
  jami: QarzJami;
  valyuta: Hisob['valyuta'];
}) {
  const { C } = useTema();
  return (
    <Karta uslub={{ paddingVertical: 12 }}>
      <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>{nom}</Text>
      <Text style={{ color: C.xira, fontSize: 11, marginTop: 2 }}>{izoh}</Text>
      <View style={{ flexDirection: 'row', marginTop: 8, gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.xira, fontSize: 11 }}>{tr('Bizga qarzdor')}</Text>
          <Text style={{ color: C.kirim, fontSize: 14, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
            {formatla(jami.olamiz, valyuta, { belgisiz: true, kasrsiz: true })}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.xira, fontSize: 11 }}>{tr('Biz qarzdormiz')}</Text>
          <Text style={{ color: C.chiqim, fontSize: 14, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
            {formatla(jami.beramiz, valyuta, { belgisiz: true, kasrsiz: true })}
          </Text>
        </View>
      </View>
    </Karta>
  );
}
