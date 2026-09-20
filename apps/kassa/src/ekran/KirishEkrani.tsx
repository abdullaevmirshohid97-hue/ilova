// =============================================================
//  KIRISH VA RO'YXATDAN O'TISH
//
//  Platformaning qolgan qismida hisobni admin beradi. Bu ilova
//  Play Market'da tarqaladi — ya'ni odam o'zi ro'yxatdan o'tadi.
//  Shuning uchun BIRINCHI ko'rinish ro'yxatdan o'tish bo'ladi:
//  ilovani endi yuklab olgan odam uchun aynan shu kerak, kirish
//  esa qaytib kelganlar uchun.
//
//  IKKI TUGMA YUQORIDA, matn havolasi emas. Avval pastda kichkina
//  «Hisob yo'qmi? Ro'yxatdan o'tish» yozuvi turardi va uni odam
//  topmasdi — ekran «kirish» bo'lib ochilardi, u esa hali
//  ro'yxatdan o'tmagan bo'lardi.
//
//  RANGLAR TEMADAN OLINADI. Bu yerda bir vaqt qotirib yozilgan
//  ranglar bor edi va ular oq temaga o'tilganda ekranni buzgan:
//  `tugma` foni ham, ekran foni ham `C.tun` (oq) bo'lib qolgan,
//  matni esa oq — tugma BUTUNLAY ko'rinmasdi. Sarlavha ham oq
//  fonda #F2F4F7 edi. Shuning uchun uslublar endi temadan
//  yasaladi, StyleSheet modul darajasida emas.
//
//  Email tasdiqlash loyihada YOQILGAN (`mailer_autoconfirm = false`).
//  Shuning uchun `signUp` ikki xil javob qaytaradi:
//    · sessiya keldi  → darhol ichkariga kiradi
//    · sessiya yo'q   → pochtani tasdiqlash kerak, shuni aytamiz
//  Ikkinchi holat jimgina qoldirilsa, odam "tugma ishlamadi" deb
//  o'ylab ilovani o'chirib tashlardi.
// =============================================================

import { useMemo, useState } from 'react';
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
import { O, useTema, type Ranglar } from '../lib/tema';
import { tr } from '../lib/til';

export default function KirishEkrani() {
  const { C } = useTema();
  const s = useMemo(() => uslublar(C), [C]);

  // Yangi odam uchun standart — RO'YXATDAN O'TISH.
  const [royxat, setRoyxat] = useState(true);
  const [email, setEmail] = useState('');
  const [parol, setParol] = useState('');
  const [ism, setIsm] = useState('');
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  function rejimQoy(yangi: boolean) {
    setRoyxat(yangi);
    setXato(null);
    setXabar(null);
  }

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
          {/* Ikki tugma — qaysi rejimda ekani DARHOL ko‘rinadi */}
          <View style={s.qator}>
            {(
              [
                { k: true, m: tr('Ro‘yxatdan o‘tish') },
                { k: false, m: tr('Kirish') },
              ] as { k: boolean; m: string }[]
            ).map((v) => {
              const tanlangan = royxat === v.k;
              return (
                <TouchableOpacity
                  key={String(v.k)}
                  onPress={() => rejimQoy(v.k)}
                  style={[s.rejim, tanlangan && s.rejimFaol]}
                >
                  <Text style={[s.rejimMatn, tanlangan && s.rejimMatnFaol]}>{v.m}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.yorliq}>{tr('Email')}</Text>
          <TextInput
            style={s.maydon}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            // Parol menejerlari (Samsung Pass, Google) shu ikki
            // belgiga qarab maydonni taniydi: `autoComplete` —
            // Android, `textContentType` — iOS. Belgisiz maydon
            // ularga umuman ko‘rinmaydi va odam parolini qo‘lda
            // yozishga majbur bo‘ladi.
            autoComplete="email"
            textContentType="emailAddress"
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
                autoComplete="name"
                textContentType="name"
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
            // Ro'yxatda YANGI parol, kirishda ESKISI: telefon
            // parol saqlagichi shu belgiga qarab to'g'ri taklif beradi.
            autoComplete={royxat ? 'password-new' : 'password'}
            textContentType={royxat ? 'newPassword' : 'password'}
            placeholder={tr('kamida 6 ta belgi')}
            placeholderTextColor={C.xira}
          />

          {xato && <Text style={s.xato}>{xato}</Text>}
          {xabar && <Text style={s.xabar}>{xabar}</Text>}

          <TouchableOpacity style={s.tugma} onPress={yubor} disabled={yuklanmoqda}>
            {yuklanmoqda ? (
              <ActivityIndicator color={C.faolMatn} />
            ) : (
              <Text style={s.tugmaMatn}>{royxat ? tr('Ro‘yxatdan o‘tish') : tr('Kirish')}</Text>
            )}
          </TouchableOpacity>

          <Text style={s.past}>
            {royxat
              ? tr('Pochtangizga tasdiqlash xati keladi — havolani bosing.')
              : tr('Parolni unutdingizmi? Pochtangizdan tiklash havolasini so‘rang.')}
          </Text>
        </View>

        <Text style={s.tag}>{tr('Yukchibolla platformasi · yukchibolla.com')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function uslublar(C: Ranglar) {
  return StyleSheet.create({
    tashqi: { flex: 1, backgroundColor: C.fon },
    ichki: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: O.chekka,
      maxWidth: 460,
      width: '100%',
      alignSelf: 'center',
    },
    belgi: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
    belgiYuqori: { color: C.kirim, fontSize: 54, fontWeight: '800', marginBottom: -6 },
    belgiPast: { color: C.chiqim, fontSize: 54, fontWeight: '800', marginTop: -6 },
    nom: {
      color: C.matn,
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: 2,
      marginTop: 8,
    },
    izoh: { color: C.xira, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 22 },

    karta: {
      backgroundColor: C.karta,
      borderRadius: O.radius,
      padding: O.chekka,
      borderWidth: 1,
      borderColor: C.chegara,
    },

    qator: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    rejim: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: O.radiusKichik,
      borderWidth: 1,
      borderColor: C.chegara,
      alignItems: 'center',
    },
    rejimFaol: { backgroundColor: C.faol, borderColor: C.faol },
    rejimMatn: { color: C.matn2, fontSize: 14, fontWeight: '600' },
    rejimMatnFaol: { color: C.faolMatn },

    yorliq: { color: C.matn2, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
    maydon: {
      borderWidth: 1,
      borderColor: C.chegara,
      borderRadius: O.radiusKichik,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      color: C.matn,
      backgroundColor: C.karta2,
    },

    xato: { color: C.chiqim, fontSize: 13, marginTop: 12, lineHeight: 19 },
    xabar: { color: C.kirim, fontSize: 13, marginTop: 12, lineHeight: 19 },

    tugma: {
      backgroundColor: C.faol,
      borderRadius: O.radiusKichik,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 18,
    },
    tugmaMatn: { color: C.faolMatn, fontSize: 16, fontWeight: '700' },

    past: { color: C.xira, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 17 },
    tag: { color: C.xira, fontSize: 12, textAlign: 'center', marginTop: 24 },
  });
}
