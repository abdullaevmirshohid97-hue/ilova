// =============================================================
//  QULF EKRANI
//
//  Ilova qulflangan bo'lsa, daftar o'rniga shu ko'rinadi.
//
//  Ikki tugma bor va ikkinchisi birinchisidan kam muhim emas:
//
//   · «Ochish»            — barmoq izi / PIN / chizma so'raladi
//   · «Parol bilan kirish» — CHIQISH YO'LI
//
//  Chiqish yo'li shart. Odam barmog'ini shikastlantirsa, telefon
//  chizmasini o'zgartirsa yoki sensor buzilsa — u o'z daftaridan
//  butunlay ajralib qolmasligi kerak. U hisobdan chiqadi va
//  parol bilan qaytib kiradi.
//
//  Ekran ochilishi bilan qulf SO'RALADI: odam ortiqcha bir marta
//  bosmasin. Rad etsa tugma qoladi va u qayta urinadi.
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { O, useTema, type Ranglar } from '../lib/tema';
import { tr } from '../lib/til';
import { ochishniSora } from '../lib/qulf';

export function QulfEkrani({ ochildi, chiqish }: { ochildi: () => void; chiqish: () => void }) {
  const { C } = useTema();
  const s = useMemo(() => uslublar(C), [C]);
  const [band, setBand] = useState(true);
  const [rad, setRad] = useState(false);

  async function sora() {
    setBand(true);
    setRad(false);
    const n = await ochishniSora();
    setBand(false);
    // `imkonsiz` — qurilmada qulf qolmagan. Ushlab qolish ZARAR:
    // odam ilovasiga umuman kira olmasdi.
    if (n === 'ochildi' || n === 'imkonsiz') ochildi();
    else setRad(true);
  }

  // Ochilishi bilan bir marta so'raladi
  useEffect(() => {
    void sora();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.tashqi}>
      <View style={s.belgi}>
        <Text style={s.belgiYuqori}>↑</Text>
        <Text style={s.belgiPast}>↓</Text>
      </View>
      <Text style={s.nom}>{tr('CLARY')}</Text>
      <Text style={s.izoh}>{tr('Daftar qulflangan')}</Text>

      {rad && <Text style={s.rad}>{tr('Ochilmadi. Qayta urinib ko‘ring.')}</Text>}

      <TouchableOpacity style={s.tugma} onPress={sora} disabled={band}>
        {band ? (
          <ActivityIndicator color={C.faolMatn} />
        ) : (
          <Text style={s.tugmaMatn}>{tr('Ochish')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={chiqish} disabled={band}>
        <Text style={s.chiqish}>{tr('Parol bilan kirish')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function uslublar(C: Ranglar) {
  return StyleSheet.create({
    tashqi: {
      flex: 1,
      backgroundColor: C.fon,
      alignItems: 'center',
      justifyContent: 'center',
      padding: O.chekka,
    },
    belgi: { flexDirection: 'row', gap: 4 },
    belgiYuqori: { color: C.kirim, fontSize: 54, fontWeight: '800', marginBottom: -6 },
    belgiPast: { color: C.chiqim, fontSize: 54, fontWeight: '800', marginTop: -6 },
    nom: { color: C.matn, fontSize: 26, fontWeight: '800', letterSpacing: 2, marginTop: 8 },
    izoh: { color: C.xira, fontSize: 14, marginTop: 4, marginBottom: 28 },
    rad: { color: C.chiqim, fontSize: 13, marginBottom: 12, textAlign: 'center' },
    tugma: {
      backgroundColor: C.faol,
      borderRadius: O.radiusKichik,
      paddingVertical: 14,
      paddingHorizontal: 48,
      alignItems: 'center',
      minWidth: 200,
    },
    tugmaMatn: { color: C.faolMatn, fontSize: 16, fontWeight: '700' },
    chiqish: { color: C.matn2, fontSize: 14, marginTop: 22 },
  });
}
