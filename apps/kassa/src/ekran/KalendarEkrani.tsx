// =============================================================
//  KALENDAR — oy manzarasi bir ekranda
//
//  Har kunda ikki raqam: kirim (yashil, tepada) va chiqim (terakota,
//  pastda). Odam "qaysi kuni ko'p ketdi" degan savolga bir qarashda
//  javob oladi — ro'yxatni aylantirib chiqmaydi.
//
//  Raqamlar QISQARTIRILADI (1 200 000 → 1,2 mln): to'liq holida
//  hujayraga sig'maydi va kalendar o'qilmas bo'lib qoladi.
// =============================================================

import { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { davrYigindi, formatla, kunlarBoyicha, solishtir } from '@ilova/kassa-yadro';
import type { Yozuv } from '@ilova/kassa-yadro';
import { haftaKunlari, oylar, kunKaliti, oyTori, sanaQisqa } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { BoshHolat, DavrOqlari, YigindiPaneli, uslublar } from '../ui/qismlar';
import { YozuvQatori } from './BoshEkran';
import { tr } from '../lib/til';

/** 1 234 567 tiyin → "12 345" emas, "1,2 mln" — hujayraga sig'sin */
function qisqa(tiyin: number): string {
  const som = Math.round(tiyin / 100);
  if (som >= 1_000_000) {
    const m = som / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace('.', ',')} mln`;
  }
  if (som >= 1000) {
    const m = som / 1000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace('.', ',')}k`;
  }
  return String(som);
}

export default function KalendarEkrani({ tahrirla }: { tahrirla: (y: Yozuv) => void }) {
  const { C } = useTema();
  const s = uslublar(C);
  const { yozuvlar, turkumlar, klientlar, hisoblar } = useHolat();

  const bugun = new Date();
  const [yil, setYil] = useState(bugun.getFullYear());
  const [oy, setOy] = useState(bugun.getMonth());
  const [tanlangan, setTanlangan] = useState<string | null>(kunKaliti(bugun));

  const valyuta = hisoblar[0]?.valyuta ?? 'UZS';
  const kunlar = useMemo(() => kunlarBoyicha(yozuvlar), [yozuvlar]);
  const tor = useMemo(() => oyTori(yil, oy), [yil, oy]);

  const oylik = useMemo(() => {
    const shuOy = yozuvlar.filter((y) => {
      const d = new Date(y.sana);
      return d.getFullYear() === yil && d.getMonth() === oy;
    });
    return davrYigindi(shuOy);
  }, [yozuvlar, yil, oy]);

  const kunYozuvlari = useMemo(() => {
    if (!tanlangan) return [];
    return yozuvlar.filter((y) => kunKaliti(y.sana) === tanlangan).sort((a, b) => solishtir(b, a));
  }, [yozuvlar, tanlangan]);

  function siljit(qadam: number) {
    const d = new Date(yil, oy + qadam, 1);
    setYil(d.getFullYear());
    setOy(d.getMonth());
    setTanlangan(null);
  }

  const joriyOy = yil === bugun.getFullYear() && oy === bugun.getMonth();

  return (
    <View style={s.ekran}>
      <View style={s.boshliq}>
        <Text style={s.boshliqMatn}>{tr('Kalendar')}</Text>
        <Text style={s.boshliqIzoh}>{tr('Kunlar bo‘yicha kirim va chiqim')}</Text>
      </View>

      <DavrOqlari
        nom={`${oylar()[oy]} ${yil}`}
        oldin={() => siljit(-1)}
        keyin={() => siljit(1)}
        keyinOchiq={!joriyOy}
      />

      <ScrollView style={{ flex: 1 }}>
        {/* Hafta kunlari */}
        <View style={{ flexDirection: 'row', backgroundColor: C.karta, paddingTop: 8 }}>
          {haftaKunlari().map((k) => (
            <Text key={k} style={{ flex: 1, textAlign: 'center', color: C.xira, fontSize: 11, fontWeight: '600' }}>
              {k}
            </Text>
          ))}
        </View>

        {/* To'r */}
        <View style={{ backgroundColor: C.karta, paddingBottom: 8 }}>
          {tor.map((qator, i) => (
            <View key={i} style={{ flexDirection: 'row' }}>
              {qator.map((kun, j) => {
                if (!kun) return <View key={j} style={{ flex: 1, height: 58 }} />;
                const kalit = kunKaliti(kun);
                const q = kunlar[kalit];
                const shuKun =
                  kun.getDate() === bugun.getDate() &&
                  kun.getMonth() === bugun.getMonth() &&
                  kun.getFullYear() === bugun.getFullYear();
                const tanlanganmi = kalit === tanlangan;
                return (
                  <TouchableOpacity
                    key={j}
                    onPress={() => setTanlangan(tanlanganmi ? null : kalit)}
                    style={{
                      flex: 1,
                      height: 58,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      margin: 1,
                      backgroundColor: tanlanganmi ? C.faol : shuKun ? C.ajratgich : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: tanlanganmi ? C.faolMatn : C.matn,
                        fontSize: 13,
                        fontWeight: shuKun || tanlanganmi ? '800' : '500',
                      }}
                    >
                      {kun.getDate()}
                    </Text>
                    {q?.kirim ? (
                      <Text style={{ color: tanlanganmi ? C.faolMatn : C.kirim, fontSize: 9, marginTop: 1 }}>
                        {qisqa(q.kirim)}
                      </Text>
                    ) : null}
                    {q?.chiqim ? (
                      <Text style={{ color: tanlanganmi ? C.faolMatn : C.chiqim, fontSize: 9 }}>
                        {qisqa(q.chiqim)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Tanlangan kun */}
        {tanlangan && (
          <>
            <View
              style={{
                paddingHorizontal: O.chekka,
                paddingVertical: 10,
                backgroundColor: C.fon,
              }}
            >
              <Text style={{ color: C.matn2, fontSize: 13, fontWeight: '700' }}>
                {sanaQisqa(new Date(tanlangan + 'T12:00:00'))} · {kunYozuvlari.length} ta yozuv
              </Text>
            </View>
            {kunYozuvlari.length === 0 ? (
              <BoshHolat belgi="·" matn={tr('Bu kuni yozuv yo‘q')} />
            ) : (
              kunYozuvlari.map((y) => (
                <YozuvQatori
                  key={y.id}
                  y={y}
                  turkumNomi={turkumlar.find((t) => t.id === y.turkum_id)?.nom}
                  klientNomi={klientlar.find((k) => k.id === y.klient_id)?.ism}
                  bos={() => (y.bekor_at ? undefined : tahrirla(y))}
                />
              ))
            )}
          </>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      <YigindiPaneli
        chap={{ yorliq: tr('Oylik kirim'), qiymat: formatla(oylik.kirim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.kirim }}
        orta={{ yorliq: tr('Oylik chiqim'), qiymat: formatla(oylik.chiqim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.chiqim }}
        ong={{ yorliq: tr('Farq'), qiymat: formatla(oylik.farq, valyuta, { belgisiz: true, kasrsiz: true }) }}
      />
    </View>
  );
}
