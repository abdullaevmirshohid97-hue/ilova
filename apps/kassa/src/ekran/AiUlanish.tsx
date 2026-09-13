// =============================================================
//  AI ULANISH (MCP)
//
//  Foydalanuvchi o'z daftariga sun'iy intellekt agentini ulaydi:
//  telefondagi yordamchi yoki kompyuterdagi AI dasturi «qancha
//  pulim bor?», «bu oy qancha ketdi?», «kim qancha qarz?» degan
//  savolga javob bera olsin.
//
//  IKKI QOIDA ekranda ham ochiq yozilgan, chunki ular xavfsizlikning
//  o'zagi:
//   1. Kalit BIR MARTA ko'rsatiladi — bazada faqat uning xeshi
//      turadi, ya'ni biz ham uni qayta ko'rsata olmaymiz.
//   2. Yozish huquqi ALOHIDA so'raladi va standart holatda YO'Q.
//      Yoqilganda ham agent har yozuvdan oldin tasdiq so'raydi.
// =============================================================

import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { tokenlarOl, tokenYarat, tokenYop, type Token } from '../lib/baza';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { BoshHolat, Karta, Qator, Sarlavha, Tugma } from '../ui/qismlar';

const MANZIL = 'https://gnuddryjsmcrjchrbvyz.supabase.co/functions/v1/kassa-mcp';

export default function AiUlanish() {
  const { C } = useTema();
  const [tokenlar, setTokenlar] = useState<Token[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [nom, setNom] = useState('');
  const [yozishi, setYozishi] = useState(false);
  const [yangi, setYangi] = useState<string | null>(null);
  const [kutmoqda, setKutmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [kochirildi, setKochirildi] = useState<string | null>(null);

  async function yukla() {
    try {
      setTokenlar(await tokenlarOl());
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setYuklanmoqda(false);
    }
  }

  useEffect(() => {
    yukla();
  }, []);

  async function kochir(matn: string, belgi: string) {
    await Clipboard.setStringAsync(matn);
    setKochirildi(belgi);
    setTimeout(() => setKochirildi(null), 2000);
  }

  async function yarat() {
    setXato(null);
    setKutmoqda(true);
    try {
      const j = await tokenYarat(nom.trim() || 'AI ulanish', yozishi);
      setYangi(j.token);
      setNom('');
      setYozishi(false);
      await yukla();
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setKutmoqda(false);
    }
  }

  function yop(t: Token) {
    Alert.alert('Ulanishni yopish', `«${t.nom}» endi ishlamaydi. Davom etamizmi?`, [
      { text: 'Yo‘q', style: 'cancel' },
      {
        text: 'Yopish',
        style: 'destructive',
        onPress: async () => {
          try {
            await tokenYop(t.id);
            await yukla();
          } catch (e) {
            Alert.alert('Xatolik', xatoMatn(e));
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

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={{ padding: O.chekka }}>
        <Text style={{ color: C.matn2, fontSize: 13, lineHeight: 20 }}>
          Daftaringizga sun’iy intellekt agentini ulashingiz mumkin — u pul,
          qarz va hisobot savollariga javob beradi. Agent faqat SIZNING
          ma’lumotingizni ko‘radi.
        </Text>
      </View>

      {yangi && (
        <View style={{ marginHorizontal: O.chekka }}>
          <Karta uslub={{ borderColor: C.kirim }}>
            <Text style={{ color: C.kirim, fontSize: 13, fontWeight: '700' }}>
              Ulanish kaliti — HOZIR ko‘chirib oling
            </Text>
            <Text style={{ color: C.xira, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
              Bu kalit boshqa ko‘rsatilmaydi: bazada faqat uning izi saqlanadi.
              Yo‘qotsangiz — yangisini yaratasiz.
            </Text>
            <Text
              selectable
              style={{
                color: C.matn,
                fontSize: 13,
                marginTop: 10,
                padding: 10,
                backgroundColor: C.fon,
                borderRadius: O.radiusKichik,
              }}
            >
              {yangi}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Tugma
                matn={kochirildi === 'token' ? '✓ Ko‘chirildi' : 'Kalitni ko‘chirish'}
                bos={() => kochir(yangi, 'token')}
                uslub={{ flex: 1 }}
              />
              <Tugma matn="Yopish" ikkilamchi bos={() => setYangi(null)} uslub={{ flex: 1 }} />
            </View>
          </Karta>
        </View>
      )}

      <Sarlavha matn="Server manzili" />
      <View style={{ paddingHorizontal: O.chekka }}>
        <Text selectable style={{ ...maydon, fontSize: 12 }}>
          {MANZIL}
        </Text>
        <Tugma
          matn={kochirildi === 'manzil' ? '✓ Ko‘chirildi' : 'Manzilni ko‘chirish'}
          ikkilamchi
          bos={() => kochir(MANZIL, 'manzil')}
          uslub={{ marginTop: 8 }}
        />
        <Text style={{ color: C.xira, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
          AI dasturingizda «MCP server» qo‘shing: manzil sifatida shuni, kalit
          sifatida yuqoridagini qo‘ying.
        </Text>
      </View>

      <Sarlavha matn="Yangi ulanish" />
      <View style={{ paddingHorizontal: O.chekka }}>
        <TextInput
          style={maydon}
          value={nom}
          onChangeText={setNom}
          placeholder="Nomi (masalan: Telefondagi yordamchi)"
          placeholderTextColor={C.xira}
        />
        <TouchableOpacity
          onPress={() => setYozishi(!yozishi)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: yozishi ? C.chiqim : C.chegara,
              backgroundColor: yozishi ? C.chiqim : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {yozishi && <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.matn, fontSize: 14 }}>Yozuv qo‘sha olsin</Text>
            <Text style={{ color: C.xira, fontSize: 11, marginTop: 2, lineHeight: 16 }}>
              Belgilanmasa, agent faqat o‘qiydi. Yozish yoqilsa ham, u har
              yozuvdan oldin sizdan tasdiq so‘raydi.
            </Text>
          </View>
        </TouchableOpacity>

        {xato && <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 10 }}>{xato}</Text>}

        <Tugma matn="Ulanish yaratish" bos={yarat} kutmoqda={kutmoqda} uslub={{ marginTop: 14 }} />
      </View>

      <Sarlavha matn="Mavjud ulanishlar" />
      {yuklanmoqda && <BoshHolat belgi="…" matn="Yuklanmoqda" />}
      {!yuklanmoqda && tokenlar.length === 0 && (
        <BoshHolat belgi="⚯" matn="Ulanish yo‘q" izoh="Yuqoridan yangi ulanish yarating" />
      )}
      {tokenlar.map((t) => (
        <Qator
          key={t.id}
          nom={t.nom}
          izoh={
            `${t.prefiks}…  ·  ${t.yozishi ? 'o‘qish + yozish' : 'faqat o‘qish'}` +
            (t.oxirgi_ishlatilgan ? `  ·  ${t.soralgan_soni} so‘rov` : '  ·  ishlatilmagan')
          }
          ong={t.faol ? 'yopish' : 'yopilgan'}
          ongRang={t.faol ? C.chiqim : C.xira}
          sozilgan={!t.faol}
          bos={() => t.faol && yop(t)}
        />
      ))}

      <View style={{ padding: O.chekka, paddingTop: 20 }}>
        <Text style={{ color: C.xira, fontSize: 11, lineHeight: 17 }}>
          Agentning har bir so‘rovi jurnalga yoziladi. Kunlik chegara — 500
          so‘rov. Ulanishni istalgan vaqtda yopsangiz, kalit o‘sha zahoti
          ishlamay qoladi.
        </Text>
      </View>
    </ScrollView>
  );
}
