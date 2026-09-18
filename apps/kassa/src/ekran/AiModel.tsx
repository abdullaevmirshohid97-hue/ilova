// =============================================================
//  AI MODELI — mijoz o'z obunasini ulaydi
//
//  Foydalanuvchi xohlagan modelni tanlaydi: Claude, ChatGPT yoki
//  Gemini. Obunasi bo'lsa — o'z API kalitini qo'yadi va token
//  puli ham uning hisobidan ketadi.
//
//  EKRANDA OCHIQ AYTILADI:
//   · kalit shifrlangan holda saqlanadi va qayta ko'rsatilmaydi;
//   · to'lov mijozning provayderdagi hisobidan ketadi;
//   · kalitsiz ham ilova to'liq ishlaydi — robot ixtiyoriy.
// =============================================================

import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  aiHolat,
  aiKalitOchir,
  aiKalitOl,
  aiKalitSaqla,
  aiSina,
  type AiKalit,
  type AiProvayder,
} from '../lib/baza';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Chip, Karta, Sarlavha, Tugma } from '../ui/qismlar';
import { tr } from '../lib/til';

const PROVAYDERLAR: {
  kalit: AiProvayder;
  nom: string;
  model: string;
  qayerdan: string;
  boshi: string;
}[] = [
  {
    kalit: 'anthropic',
    nom: 'Claude',
    model: 'claude-opus-5',
    qayerdan: 'console.anthropic.com → API keys',
    boshi: 'sk-ant-',
  },
  {
    kalit: 'openai',
    nom: 'ChatGPT',
    model: 'gpt-5',
    qayerdan: 'platform.openai.com → API keys',
    boshi: 'sk-',
  },
  {
    kalit: 'google',
    nom: 'Gemini',
    model: 'gemini-2.5-pro',
    qayerdan: 'aistudio.google.com → Get API key',
    boshi: 'AIza',
  },
];

export default function AiModel() {
  const { C } = useTema();
  const [bor, setBor] = useState<AiKalit | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [provayder, setProvayder] = useState<AiProvayder>('anthropic');
  const [model, setModel] = useState('claude-opus-5');
  const [kalit, setKalit] = useState('');
  const [kutmoqda, setKutmoqda] = useState<'saqlash' | 'sinov' | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  const [sarf, setSarf] = useState<{ oy_soralgan: number; oy_narx_usd: number } | null>(null);

  const tanlangan = PROVAYDERLAR.find((p) => p.kalit === provayder)!;

  async function yukla() {
    try {
      const k = await aiKalitOl();
      setBor(k);
      if (k) {
        setProvayder(k.provayder);
        setModel(k.model);
      }
      const h = await aiHolat();
      setSarf({ oy_soralgan: h.oy_soralgan, oy_narx_usd: Number(h.oy_narx_usd) });
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setYuklanmoqda(false);
    }
  }

  useEffect(() => {
    yukla();
  }, []);

  function provayderniTanla(p: AiProvayder) {
    setProvayder(p);
    setModel(PROVAYDERLAR.find((x) => x.kalit === p)!.model);
    setXato(null);
    setXabar(null);
  }

  async function saqla() {
    setXato(null);
    setXabar(null);
    if (kalit.trim().length < 20) return setXato(tr('Kalitni to‘liq ko‘chirib qo‘ying.'));
    setKutmoqda('saqlash');
    try {
      await aiKalitSaqla(provayder, model.trim(), kalit.trim());
      setKalit('');
      await yukla();
      setXabar(tr('Saqlandi. Endi «Ulanishni sinash» bilan tekshiring.'));
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setKutmoqda(null);
    }
  }

  async function sina() {
    setXato(null);
    setXabar(null);
    setKutmoqda('sinov');
    try {
      const javob = await aiSina();
      setXabar(`${tr('Ulanish ishlayapti. Model javobi:')} «${javob.trim().slice(0, 40)}»`);
      await yukla();
    } catch (e) {
      setXato(xatoMatn(e));
      await yukla();
    } finally {
      setKutmoqda(null);
    }
  }

  function ochir() {
    Alert.alert(tr('Kalitni o‘chirish'), tr('AI ulanishi o‘chadi. Ilova o‘zi ishlayveradi.'), [
      { text: tr('Yo‘q'), style: 'cancel' },
      {
        text: tr('O‘chirish'),
        style: 'destructive',
        onPress: async () => {
          try {
            await aiKalitOchir();
            setBor(null);
            await yukla();
          } catch (e) {
            Alert.alert(tr('Xatolik'), xatoMatn(e));
          }
        },
      },
    ]);
  }

  const maydon = {
    backgroundColor: C.karta,
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.matn,
  };

  if (yuklanmoqda) return <BoshHolat belgi="…" matn={tr('Yuklanmoqda')} />;

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: O.chekka }}>
        <Text style={{ color: C.matn2, fontSize: 13, lineHeight: 20 }}>
          Ilovadagi robot uchun xohlagan modelni tanlang. Kalit sizniki bo‘lgani
          uchun <Text style={{ fontWeight: '700' }}>to‘lov ham sizning hisobingizdan</Text> ketadi —
          biz hech narsa qo‘shmaymiz.
        </Text>
      </View>

      {/* Hozirgi holat */}
      {bor && (
        <View style={{ marginHorizontal: O.chekka }}>
          <Karta uslub={{ borderColor: bor.faol ? C.kirim : C.chiqim }}>
            <Text style={{ color: C.matn, fontSize: 15, fontWeight: '700' }}>
              {PROVAYDERLAR.find((p) => p.kalit === bor.provayder)?.nom ?? bor.provayder}
            </Text>
            <Text style={{ color: C.xira, fontSize: 12, marginTop: 3 }}>
              {bor.model} · {bor.niqob}
            </Text>
            <Text
              style={{
                color: bor.faol ? C.kirim : C.chiqim,
                fontSize: 12,
                marginTop: 8,
                lineHeight: 17,
              }}
            >
              {bor.faol
                ? bor.oxirgi_sinov
                  ? tr('✓ Ulanish tekshirilgan va ishlayapti')
                  : tr('Saqlangan — hali sinalmagan')
                : `✕ ${bor.oxirgi_xato ?? tr('Kalit ishlamayapti')}`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Tugma
                matn={tr('Ulanishni sinash')}
                bos={sina}
                kutmoqda={kutmoqda === 'sinov'}
                uslub={{ flex: 1 }}
              />
              <Tugma matn={tr('O‘chirish')} ikkilamchi rang={C.chiqim} bos={ochir} uslub={{ flex: 1 }} />
            </View>
          </Karta>
        </View>
      )}

      {sarf && sarf.oy_soralgan > 0 && (
        <View style={{ marginHorizontal: O.chekka, marginTop: 10 }}>
          <Karta>
            <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Shu oy')}</Text>
            <Text style={{ color: C.matn, fontSize: 15, fontWeight: '700', marginTop: 3 }}>
              {sarf.oy_soralgan} ta so‘rov
              {sarf.oy_narx_usd > 0 ? ` · ~$${sarf.oy_narx_usd.toFixed(2)}` : ''}
            </Text>
            {sarf.oy_narx_usd === 0 && (
              <Text style={{ color: C.xira, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                Narx faqat Claude modellari uchun hisoblanadi — boshqa provayderlarning
                tariflari tez o‘zgaradi va taxmin qilib ko‘rsatish noto‘g‘ri bo‘lardi.
              </Text>
            )}
          </Karta>
        </View>
      )}

      <Sarlavha matn={bor ? tr('Boshqa kalit qo‘yish') : tr('Kalit ulash')} />

      <View style={{ paddingHorizontal: O.chekka }}>
        <Text style={{ color: C.matn2, fontSize: 13, marginBottom: 8 }}>{tr('Provayder')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {PROVAYDERLAR.map((p) => (
            <Chip
              key={p.kalit}
              matn={p.nom}
              tanlangan={p.kalit === provayder}
              bos={() => provayderniTanla(p.kalit)}
            />
          ))}
        </View>

        <Text style={{ color: C.matn2, fontSize: 13, marginTop: 14, marginBottom: 6 }}>{tr('Model')}</Text>
        <TextInput
          style={maydon}
          value={model}
          onChangeText={setModel}
          placeholder={tanlangan.model}
          placeholderTextColor={C.xira}
          autoCapitalize="none"
        />

        <Text style={{ color: C.matn2, fontSize: 13, marginTop: 14, marginBottom: 6 }}>
          API kaliti
        </Text>
        <TextInput
          style={maydon}
          value={kalit}
          onChangeText={setKalit}
          placeholder={tanlangan.boshi + '...'}
          placeholderTextColor={C.xira}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={{ color: C.xira, fontSize: 11, marginTop: 6, lineHeight: 16 }}>
          Qayerdan olinadi: {tanlangan.qayerdan}
        </Text>

        {xato && <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 12, lineHeight: 19 }}>{xato}</Text>}
        {xabar && <Text style={{ color: C.kirim, fontSize: 13, marginTop: 12, lineHeight: 19 }}>{xabar}</Text>}

        <Tugma
          matn={tr('Saqlash')}
          bos={saqla}
          kutmoqda={kutmoqda === 'saqlash'}
          uslub={{ marginTop: 16 }}
        />
      </View>

      <View style={{ padding: O.chekka, paddingTop: 22 }}>
        <Text style={{ color: C.xira, fontSize: 11, lineHeight: 17 }}>
          Kalit bazada shifrlangan holda saqlanadi va qayta ko‘rsatilmaydi — biz ham
          uni o‘qiy olmaymiz, u faqat so‘rov paytida modelga yuboriladi. Kalitsiz ham
          ilova to‘liq ishlaydi: robot — ixtiyoriy qo‘shimcha.
        </Text>
      </View>
    </ScrollView>
  );
}
