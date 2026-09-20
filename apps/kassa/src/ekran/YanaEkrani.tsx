// =============================================================
//  YANA — hisoblar, turkumlar, hisobot, sozlama
//
//  Kam ishlatiladigan, lekin kerak bo'ladigan hamma narsa shu yerda.
//
//  Bu fayl FAQAT menyu va ichki sahifalar orasidagi yo'l. Ekranlarning
//  o'zi qo'shni fayllarda (YanaHisoblar, YanaTurkumlar, YanaHisobot,
//  YanaSozlama): bir faylda 770 qator bo‘lganda bitta tugmani
//  topish uchun ham butun faylni varaqlashga to'g'ri kelardi.
// =============================================================

import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatla, hisobQoldiq } from '@ilova/kassa-yadro';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { Qator, Sarlavha, uslublar } from '../ui/qismlar';
import AiModel from './AiModel';
import AiUlanish from './AiUlanish';
import Hisoblar from './YanaHisoblar';
import Hisobot from './YanaHisobot';
import Sozlama from './YanaSozlama';
import Turkumlar from './YanaTurkumlar';
import { tr, trn } from '../lib/til';

type Sahifa = 'asosiy' | 'hisoblar' | 'turkumlar' | 'hisobot' | 'sozlama' | 'ai' | 'aimodel';

export type { Sahifa as YanaSahifa };

/**
 * Sahifa holati TASHQARIDAN boshqariladi: Android'ning «orqaga»
 * tugmasi ichki sahifadan qaytarishi kerak, buning uchun qobiq
 * qayerda turganimizni bilishi shart.
 */
export default function YanaEkrani({
  kochirma,
  sahifa,
  setSahifa,
}: {
  kochirma: () => void;
  sahifa: Sahifa;
  setSahifa: (s: Sahifa) => void;
}) {
  const { C } = useTema();
  const s = uslublar(C);
  const { men, hisoblar, yozuvlar } = useHolat();

  if (sahifa !== 'asosiy') {
    const sarlavhalar: Record<Exclude<Sahifa, 'asosiy'>, string> = {
      hisoblar: tr('Hisoblar'),
      turkumlar: tr('Turkumlar'),
      hisobot: tr('Hisobot'),
      sozlama: tr('Sozlamalar'),
      ai: tr('AI ulanish'),
      aimodel: tr('AI modeli'),
    };
    return (
      <View style={s.ekran}>
        <View style={[s.boshliq, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <TouchableOpacity onPress={() => setSahifa('asosiy')} hitSlop={12}>
            <Text style={{ color: C.tunMatn, fontSize: 20, fontWeight: '700' }}>‹</Text>
          </TouchableOpacity>
          <Text style={s.boshliqMatn}>{sarlavhalar[sahifa as Exclude<Sahifa, 'asosiy'>]}</Text>
        </View>
        {sahifa === 'hisoblar' && <Hisoblar kochirma={kochirma} />}
        {sahifa === 'turkumlar' && <Turkumlar />}
        {sahifa === 'hisobot' && <Hisobot />}
        {sahifa === 'sozlama' && <Sozlama />}
        {sahifa === 'ai' && <AiUlanish />}
        {sahifa === 'aimodel' && <AiModel />}
      </View>
    );
  }

  const jamiQoldiq = hisoblar
    .filter((h) => h.faol)
    .reduce((yig, h) => yig + hisobQoldiq(h, yozuvlar), 0);

  return (
    <View style={s.ekran}>
      <View style={s.boshliq}>
        <Text style={s.boshliqMatn}>{tr('Yana')}</Text>
        <Text style={s.boshliqIzoh}>{men.biznes}</Text>
      </View>

      <ScrollView>
        <Sarlavha matn={tr('Boshqaruv')} />
        <Qator
          nom={tr('Hisoblar')}
          izoh={`${trn('{n} ta', hisoblar.filter((h) => h.faol).length)} · ${tr('jami')} ${formatla(jamiQoldiq, hisoblar[0]?.valyuta ?? 'UZS', { kasrsiz: true })}`}
          ong="›"
          bos={() => setSahifa('hisoblar')}
        />
        <Qator nom={tr('Turkumlar')} izoh={tr('Kirim va chiqim turkumlari')} ong="›" bos={() => setSahifa('turkumlar')} />
        <Qator nom={tr('Hisoblararo o‘tkazma')} izoh={tr('Bir hisobdan ikkinchisiga')} ong="›" bos={kochirma} />

        <Sarlavha matn={tr('Tahlil')} />
        <Qator nom={tr('Hisobot')} izoh={tr('Davr, turkum va hisob kesimida')} ong="›" bos={() => setSahifa('hisobot')} />

        <Sarlavha matn={tr('AI')} />
        <Qator
          nom={tr('AI modeli')}
          izoh={tr('O‘z obunangizni ulang: Claude, ChatGPT yoki Gemini')}
          ong="›"
          bos={() => setSahifa('aimodel')}
        />
        <Qator
          nom={tr('AI ulanish')}
          izoh={tr('Sun’iy intellekt agentini daftaringizga ulash')}
          ong="›"
          bos={() => setSahifa('ai')}
        />

        <Sarlavha matn={tr('Sozlamalar')} />
        <Qator nom={tr('Sozlamalar')} izoh={tr('Biznes nomi, ko‘rinish, chiqish')} ong="›" bos={() => setSahifa('sozlama')} />

        <View style={{ padding: O.chekka, paddingTop: 24 }}>
          <Text style={{ color: C.xira, fontSize: 12, textAlign: 'center' }}>{tr('Clary · Yukchibolla platformasi')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
