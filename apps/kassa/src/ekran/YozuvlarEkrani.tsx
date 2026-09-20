// =============================================================
//  YOZUVLAR — ro'yxat, davr, qidiruv, tahrir
//
//  Uch narsa birga ishlaydi: davr tanlagichi (kunlik/haftalik/
//  oylik/hammasi), sana o'qlari va qidiruv. Pastda esa DOIMIY
//  yig'indi paneli — bozordagi ilovalardan olingan eng foydali
//  detal: odam ro'yxatni aylantirib yurganda ham jami ko'rinib
//  turadi.
//
//  Yuruvchi qoldiq faqat BITTA hisob tanlanganda ko'rsatiladi:
//  turli hisoblarning qatorlari aralashsa, ustundagi raqam hech
//  narsani bildirmaydi.
// =============================================================

import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { davrYigindi, formatla, hisobQoldiq, solishtir } from '@ilova/kassa-yadro';
import type { Yozuv } from '@ilova/kassa-yadro';
import { yozuvBekorQil } from '../lib/baza';
import { davrOraligi, oraliqdami, type DavrTuri } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Chip, DavrOqlari, Tanlagich, YigindiPaneli, uslublar } from '../ui/qismlar';
import { YozuvQatori } from '../ui/YozuvQatori';
import { BitimQatori } from '../ui/BitimQatori';
import { tr } from '../lib/til';

// `matn` — kalit, tarjima emas: modul faylni o‘qishda bir marta
// hisoblanadi, til esa keyinroq yuklanadi.
const DAVRLAR: { kalit: DavrTuri; matn: string }[] = [
  { kalit: 'kun', matn: 'Kunlik' },
  { kalit: 'hafta', matn: 'Haftalik' },
  { kalit: 'oy', matn: 'Oylik' },
  { kalit: 'hammasi', matn: 'Hammasi' },
];

/** Chizishda tarjima qilinadi */
function davrlar() {
  return DAVRLAR.map((d) => ({ ...d, matn: tr(d.matn) }));
}

/** `ichki` — sarlavhani qobiq chizadi, ekran o‘zinikini bermaydi */
export default function YozuvlarEkrani({
  tahrirla,
  ichki,
}: {
  tahrirla: (y: Yozuv) => void;
  ichki?: boolean;
}) {
  const { C } = useTema();
  const s = uslublar(C);
  const { hisoblar, turkumlar, klientlar, yozuvlar, bitimlar, tolovlar, yangila, yuklanmoqda } =
    useHolat();

  const [davr, setDavr] = useState<DavrTuri>('oy');
  const [siljish, setSiljish] = useState(0);
  const [hisobId, setHisobId] = useState<string | null>(null);
  const [qidiruv, setQidiruv] = useState('');

  const oraliq = useMemo(() => davrOraligi(davr, siljish), [davr, siljish]);

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    return yozuvlar
      .filter((y) => oraliqdami(y.sana, oraliq))
      .filter((y) => (hisobId ? y.hisob_id === hisobId : true))
      .filter((y) => {
        if (!q) return true;
        const turkum = turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? '';
        const klient = klientlar.find((k) => k.id === y.klient_id)?.ism ?? '';
        const summa = String(Math.round(y.summa / 100));
        return (
          (y.izoh ?? '').toLowerCase().includes(q) ||
          turkum.toLowerCase().includes(q) ||
          klient.toLowerCase().includes(q) ||
          summa.includes(q)
        );
      })
      .sort((a, b) => solishtir(b, a)); // yangisi tepada
  }, [yozuvlar, oraliq, hisobId, qidiruv, turkumlar, klientlar]);

  const yigindi = useMemo(() => davrYigindi(korinadigan), [korinadigan]);

  // -------------------------------------------------------------
  //  BITIMLAR ham shu ro‘yxatda
  //
  //  Qoida: BITIM — har doim, YOZUV — faqat bitimga bog‘lanmagani.
  //  Sabab: qarz bitimi va unga tegishli to‘lov daftarga ham yozuv
  //  tushiradi. Ikkalasini ko‘rsatsak, bitta amal ro‘yxatda ikki
  //  marta chiqardi va odam «men buni ikki marta yozdimmi?» deb
  //  o‘ylardi.
  //
  //  Hisob tanlangan bo‘lsa bitim ko‘rsatilmaydi: u kassa ko‘rinishi,
  //  bitim esa hisobga bog‘lanmagan.
  // -------------------------------------------------------------
  const bitimRoyxat = useMemo(() => {
    if (hisobId) return [];
    const q = qidiruv.trim().toLowerCase();
    return bitimlar
      .filter((b) => oraliqdami(b.sana, oraliq))
      .filter((b) => {
        if (!q) return true;
        const klient = klientlar.find((k) => k.id === b.klient_id)?.ism ?? '';
        return (
          (b.tovar_nom ?? '').toLowerCase().includes(q) ||
          (b.izoh ?? '').toLowerCase().includes(q) ||
          klient.toLowerCase().includes(q) ||
          String(Math.round(b.summa / 100)).includes(q)
        );
      });
  }, [bitimlar, oraliq, hisobId, qidiruv, klientlar]);

  /** Bitim va yozuv bitta ro‘yxatda, sana bo‘yicha teskari tartibda */
  const aralash = useMemo(() => {
    const b = bitimRoyxat.map((x) => ({
      tur: 'bitim' as const,
      id: x.id,
      sana: x.sana,
      bitim: x,
    }));
    const y = korinadigan
      .filter((x) => !x.bitim_id)
      .map((x) => ({ tur: 'yozuv' as const, id: x.id, sana: x.sana, yozuv: x }));
    return [...b, ...y].sort((x, z) => Date.parse(z.sana) - Date.parse(x.sana));
  }, [bitimRoyxat, korinadigan]);
  const hisob = hisoblar.find((h) => h.id === hisobId) ?? null;
  const valyuta = hisob?.valyuta ?? hisoblar[0]?.valyuta ?? 'UZS';

  // Yuruvchi qoldiq: eng eskisidan boshlab yig'iladi, ro'yxat esa
  // teskari ko'rsatiladi — shuning uchun alohida hisoblanadi.
  const qoldiqlar = useMemo(() => {
    if (!hisob) return new Map<string, number>();
    const xarita = new Map<string, number>();
    let q = hisob.boshlangich;
    const barchasi = yozuvlar
      .filter((y) => y.hisob_id === hisob.id && !y.bekor_at)
      .sort(solishtir);
    for (const y of barchasi) {
      q += y.turi === 'kirim' ? y.summa : -y.summa;
      xarita.set(y.id, q);
    }
    return xarita;
  }, [yozuvlar, hisob]);

  function bekor(y: Yozuv) {
    if (y.bekor_at) return;
    Alert.alert(tr('Yozuvni bekor qilish'),
      `${formatla(y.summa, y.valyuta)} — ${tr('hisobdan chiqadi, lekin tarixda qoladi.')}`,
      [
        { text: tr('Yo‘q'), style: 'cancel' },
        {
          text: tr('Bekor qilish'),
          style: 'destructive',
          onPress: async () => {
            try {
              await yozuvBekorQil(y.id, 'ilovadan bekor qilindi');
              await yangila();
            } catch (e) {
              Alert.alert(tr('Xatolik'), xatoMatn(e));
            }
          },
        },
      ],
    );
  }

  return (
    <View style={s.ekran}>
      {!ichki && (
        <View style={s.boshliq}>
          <Text style={s.boshliqMatn}>{tr('Yozuvlar')}</Text>
          <Text style={s.boshliqIzoh}>
            {korinadigan.length} ta · {oraliq.nom}
          </Text>
        </View>
      )}

      {/* Qidiruv */}
      <View style={{ backgroundColor: C.karta, paddingHorizontal: O.chekka, paddingTop: 10 }}>
        <TextInput
          value={qidiruv}
          onChangeText={setQidiruv}
          placeholder={tr('Izoh, turkum, kontakt yoki summa')}
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
      </View>

      <View style={{ backgroundColor: C.karta }}>
        <Tanlagich
          qiymat={davr}
          variantlar={davrlar()}
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

      {/* Hisob filtri */}
      {/* tanlovsiz-mayli: bitta hisob bo‘lsa filtr ortiqcha —
            hamma yozuv o‘shanikidir. */}
      {hisoblar.length > 1 && (
        <View style={{ backgroundColor: C.karta, borderBottomWidth: 1, borderBottomColor: C.chegara }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10 }}>
            <Chip matn={tr('Hamma hisob')} tanlangan={hisobId === null} bos={() => setHisobId(null)} />
            {hisoblar
              .filter((h) => h.faol)
              .map((h) => (
                <Chip key={h.id} matn={h.nom} tanlangan={h.id === hisobId} bos={() => setHisobId(h.id)} />
              ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={yuklanmoqda} onRefresh={yangila} tintColor={C.xira} />}
      >
        {aralash.length === 0 ? (
          <BoshHolat
            belgi="⌕"
            matn={qidiruv ? tr('Topilmadi') : tr('Bu davrda yozuv yo‘q')}
            izoh={qidiruv ? tr('Boshqa so‘z bilan qidirib ko‘ring') : tr('Davrni almashtiring yoki yangi yozuv qo‘shing')}
          />
        ) : (
          aralash.map((x) =>
            x.tur === 'bitim' ? (
              <BitimQatori key={x.id} b={x.bitim} tolovlar={tolovlar} />
            ) : (
              <YozuvQatori
                key={x.id}
                y={x.yozuv}
                turkumNomi={turkumlar.find((t) => t.id === x.yozuv.turkum_id)?.nom}
                klientNomi={klientlar.find((k) => k.id === x.yozuv.klient_id)?.ism}
                qoldiq={hisob ? (qoldiqlar.get(x.yozuv.id) ?? null) : null}
                bos={() => (x.yozuv.bekor_at ? undefined : tahrirla(x.yozuv))}
                uzoqBos={() => bekor(x.yozuv)}
              />
            ),
          )
        )}
        {aralash.length > 0 && (
          <Text
            style={{
              color: C.xira,
              fontSize: 11,
              textAlign: 'center',
              paddingHorizontal: O.chekka,
              paddingTop: 14,
            }}
          >{tr('Tahrirlash uchun teging · bekor qilish uchun bosib turing')}</Text>
        )}
        <View style={{ height: 12 }} />
      </ScrollView>

      <YigindiPaneli
        chap={{
          yorliq: tr('Kirim'),
          qiymat: formatla(yigindi.kirim, valyuta, { belgisiz: true, kasrsiz: true }),
          rang: C.kirim,
        }}
        orta={{
          yorliq: tr('Chiqim'),
          qiymat: formatla(yigindi.chiqim, valyuta, { belgisiz: true, kasrsiz: true }),
          rang: C.chiqim,
        }}
        ong={{
          yorliq: hisob ? tr('Qoldiq') : tr('Farq'),
          qiymat: formatla(
            hisob ? hisobQoldiq(hisob, yozuvlar) : yigindi.farq,
            valyuta,
            { belgisiz: true, kasrsiz: true },
          ),
        }}
      />
    </View>
  );
}
