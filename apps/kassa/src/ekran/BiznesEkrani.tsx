// =============================================================
//  BIZNES OCHISH — ro'yxatdan o'tishning ikkinchi qadami
//
//  Odam tizimga kirdi, lekin tashkiloti yo'q. Bu holat ikki sababdan
//  bo'ladi: (1) endigina ro'yxatdan o'tdi; (2) birinchi urinishda
//  ilova yopilib qolgan. Ikkalasida ham yo'l bitta — nomni so'raymiz
//  va `kassa_royxatdan_ot()` tashkilot ochadi.
//
//  KLAVIATURA. Maydonda `autoFocus` bor, ya'ni klaviatura ekran
//  OCHILISHI BILAN chiqadi. Edge-to-edge Android'da esa u
//  «Boshlash» tugmasini darhol bosib qoladi — odam ro'yxatdan
//  o'tib, shu ekranda qotib qolardi. `KirishEkrani` dagi bilan
//  bir xil xato, sababi `lib/klaviatura.ts` da.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { biznesOch } from '../lib/baza';
import { useKlaviaturaBalandligi } from '../lib/klaviatura';
import { supabase, xatoMatn } from '../lib/supabase';
import { C, O } from '../lib/tema';
import { tr } from '../lib/til';

export default function BiznesEkrani({ tayyor }: { tayyor: () => void }) {
  const [nom, setNom] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const klaviatura = useKlaviaturaBalandligi();
  const varaq = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (klaviatura === 0) return;
    const t = setTimeout(() => varaq.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [klaviatura]);

  async function och() {
    setXato(null);
    if (nom.trim().length < 2) return setXato(tr('Biznes nomi kamida 2 ta belgi bo‘lsin.'));
    setYuklanmoqda(true);
    try {
      await biznesOch(nom.trim());
      tayyor();
    } catch (err) {
      setXato(xatoMatn(err));
    } finally {
      setYuklanmoqda(false);
    }
  }

  return (
    <View style={s.tashqi}>
      <ScrollView
        ref={varaq}
        contentContainerStyle={[s.ichki, { paddingBottom: O.chekka + klaviatura }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.sarlavha}>{tr('Biznesingiz nomi')}</Text>
        <Text style={s.izoh}>
          Bu nom hisobotlarda va hujjatlarda ko‘rinadi. Keyin o‘zgartirsa bo‘ladi.
        </Text>

        <View style={s.karta}>
          <TextInput
            style={s.maydon}
            value={nom}
            onChangeText={setNom}
            placeholder={tr('Masalan: Anvar do‘koni')}
            placeholderTextColor={C.xira}
            autoFocus
            // Klaviaturadan ham yuborilsin — tugma ko'rinmasa ham
            // odam bu ekranda qotib qolmaydi.
            returnKeyType="go"
            onSubmitEditing={() => void och()}
          />
          {xato && <Text style={s.xato}>{xato}</Text>}

          <TouchableOpacity style={s.tugma} onPress={och} disabled={yuklanmoqda}>
            {yuklanmoqda ? <ActivityIndicator color="#fff" /> : <Text style={s.tugmaMatn}>{tr('Boshlash')}</Text>}
          </TouchableOpacity>

          <Text style={s.qadam}>
            Sizga «Naqd» va «Karta» hisoblari hamda odatiy turkumlar tayyor holda ochiladi.
          </Text>
        </View>

        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={s.chiqish}>{tr('Boshqa hisob bilan kirish')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tashqi: { flex: 1, backgroundColor: C.tun },
  ichki: { flexGrow: 1, justifyContent: 'center', padding: O.chekka, maxWidth: 460, width: '100%', alignSelf: 'center' },
  sarlavha: { color: '#F2F4F7', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  izoh: { color: '#9AA7B8', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 22, lineHeight: 20 },
  karta: { backgroundColor: C.karta, borderRadius: O.radius, padding: O.chekka },
  maydon: {
    borderWidth: 1, borderColor: C.chegara, borderRadius: O.radiusKichik,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 17, color: C.matn, backgroundColor: '#FBFCFD',
  },
  xato: { color: C.chiqim, fontSize: 13, marginTop: 12 },
  tugma: { backgroundColor: C.tun, borderRadius: O.radiusKichik, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  tugmaMatn: { color: '#fff', fontSize: 16, fontWeight: '700' },
  qadam: { color: C.xira, fontSize: 12, marginTop: 14, lineHeight: 18, textAlign: 'center' },
  chiqish: { color: '#63748A', fontSize: 13, textAlign: 'center', marginTop: 22 },
});
