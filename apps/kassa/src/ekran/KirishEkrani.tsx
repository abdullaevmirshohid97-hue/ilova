// =============================================================
//  KIRISH VA RO'YXATDAN O'TISH
//
//  Platformaning qolgan qismida hisobni admin beradi. Bu ilova
//  Play Market'da tarqaladi — ya'ni odam o'zi ro'yxatdan o'tadi.
//
//  Email tasdiqlash loyihada YOQILGAN (`mailer_autoconfirm = false`).
//  Shuning uchun `signUp` ikki xil javob qaytaradi:
//    · sessiya keldi  → darhol ichkariga kiradi
//    · sessiya yo'q   → pochtani tasdiqlash kerak, shuni aytamiz
//  Ikkinchi holat jimgina qoldirilsa, odam "tugma ishlamadi" deb
//  o'ylab ilovani o'chirib tashlardi.
// =============================================================

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase, xatoMatn } from '../lib/supabase';
import { C, O } from '../lib/tema';
import { tr } from '../lib/til';

export default function KirishEkrani() {
  const [royxat, setRoyxat] = useState(false);
  const [email, setEmail] = useState('');
  const [parol, setParol] = useState('');
  const [ism, setIsm] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  async function yubor() {
    setXato(null);
    setXabar(null);
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return setXato(tr('Email manzilini to‘liq kiriting.'));
    if (parol.length < 6) return setXato(tr('Parol kamida 6 ta belgi bo‘lsin.'));

    setYuklanmoqda(true);
    try {
      if (royxat) {
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password: parol,
          // `kassa: 'true'` — bazadagi trigger uchun belgi: bu odamga
          // profil YARATILMAYDI, chunki tashkiloti hali yo'q. Uni
          // keyingi ekran `kassa_royxatdan_ot()` bilan ochadi.
          options: { data: { kassa: 'true', full_name: ism.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          setXabar(
            tr('Ro‘yxatdan o‘tdingiz. Pochtangizga tasdiqlash xati yuborildi — havolani bosing va shu yerga qaytib kiring.'),
          );
          setRoyxat(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password: parol });
        if (error) throw error;
      }
    } catch (err) {
      setXato(xatoMatn(err));
    } finally {
      setYuklanmoqda(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.tashqi} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.ichki} keyboardShouldPersistTaps="handled">
        <View style={s.belgi}>
          <Text style={s.belgiYuqori}>↑</Text>
          <Text style={s.belgiPast}>↓</Text>
        </View>
        <Text style={s.nom}>{tr('CLARY')}</Text>
        <Text style={s.izoh}>{tr('Hisob-kitob daftari')}</Text>

        <View style={s.karta}>
          <Text style={s.yorliq}>{tr('Email')}</Text>
          <TextInput
            style={s.maydon}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={tr('ism@pochta.com')}
            placeholderTextColor={C.xira}
          />

          {royxat && (
            <>
              <Text style={s.yorliq}>{tr('Ism-familiya')}</Text>
              <TextInput
                style={s.maydon}
                value={ism}
                onChangeText={setIsm}
                placeholder={tr('Ixtiyoriy')}
                placeholderTextColor={C.xira}
              />
            </>
          )}

          <Text style={s.yorliq}>{tr('Parol')}</Text>
          <TextInput
            style={s.maydon}
            value={parol}
            onChangeText={setParol}
            secureTextEntry
            placeholder={tr('kamida 6 ta belgi')}
            placeholderTextColor={C.xira}
          />

          {xato && <Text style={s.xato}>{xato}</Text>}
          {xabar && <Text style={s.xabar}>{xabar}</Text>}

          <TouchableOpacity style={s.tugma} onPress={yubor} disabled={yuklanmoqda}>
            {yuklanmoqda ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.tugmaMatn}>{royxat ? tr('Ro‘yxatdan o‘tish') : tr('Kirish')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setRoyxat(!royxat);
              setXato(null);
              setXabar(null);
            }}
          >
            <Text style={s.almash}>
              {royxat ? tr('Hisobingiz bormi? Kirish') : tr('Hisob yo‘qmi? Ro‘yxatdan o‘tish')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.past}>{tr('Yukchibolla platformasi · yukchibolla.com')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  tashqi: { flex: 1, backgroundColor: C.tun },
  ichki: { flexGrow: 1, justifyContent: 'center', padding: O.chekka, maxWidth: 460, width: '100%', alignSelf: 'center' },
  belgi: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  belgiYuqori: { color: C.kirim, fontSize: 54, fontWeight: '800', marginBottom: -6 },
  belgiPast: { color: C.chiqim, fontSize: 54, fontWeight: '800', marginTop: -6 },
  nom: { color: '#F2F4F7', fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 2, marginTop: 8 },
  izoh: { color: '#9AA7B8', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 22 },
  karta: { backgroundColor: C.karta, borderRadius: O.radius, padding: O.chekka },
  yorliq: { color: C.matn2, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  maydon: {
    borderWidth: 1, borderColor: C.chegara, borderRadius: O.radiusKichik,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: C.matn, backgroundColor: '#FBFCFD',
  },
  xato: { color: C.chiqim, fontSize: 13, marginTop: 12, lineHeight: 19 },
  xabar: { color: C.kirim, fontSize: 13, marginTop: 12, lineHeight: 19 },
  tugma: {
    backgroundColor: C.tun, borderRadius: O.radiusKichik, paddingVertical: 14,
    alignItems: 'center', marginTop: 18,
  },
  tugmaMatn: { color: '#fff', fontSize: 16, fontWeight: '700' },
  almash: { color: C.matn2, fontSize: 14, textAlign: 'center', marginTop: 16 },
  past: { color: '#63748A', fontSize: 12, textAlign: 'center', marginTop: 24 },
});
