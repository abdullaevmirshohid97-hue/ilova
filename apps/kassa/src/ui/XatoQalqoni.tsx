// =============================================================
//  XATO QALQONI
//
//  React'da bitta komponent xato bersa, BUTUN daraxt yiqiladi va
//  ekran oppoq bo'lib qoladi. Foydalanuvchi uchun bu "ilova buzildi"
//  degani: u orqaga qaytolmaydi, hech narsa yozolmaydi va odatda
//  qaytib kelmaydi.
//
//  Qalqon shu holatni tutadi va o'qiladigan ekran ko'rsatadi:
//  nima bo'lgani, «Qayta urinish» tugmasi va xato matni (odam uni
//  nusxalab yubora olsin).
//
//  Xato yozuvi `lib/xatolar` ga topshiriladi — u serverga ham
//  yuboradi, chunki biz bunday holatni boshqa hech qayerdan
//  bilmaymiz.
//
//  Sinf komponenti ATAYLAB: `componentDidCatch` ning hook varianti
//  React'da yo'q. Ko'rinish esa funksiyada — rang temadan olinsin.
// =============================================================

import { Component, type ReactNode } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { O, useTema } from '../lib/tema';
import { xatoYoz } from '../lib/xatolar';

type Holat = { xato: Error | null };

export default class XatoQalqoni extends Component<{ children: ReactNode }, Holat> {
  state: Holat = { xato: null };

  static getDerivedStateFromError(xato: Error): Holat {
    return { xato };
  }

  componentDidCatch(xato: Error) {
    void xatoYoz('qalqon', xato);
  }

  render() {
    if (!this.state.xato) return this.props.children;
    return (
      <XatoEkrani
        xato={this.state.xato}
        qayta={() => this.setState({ xato: null })}
      />
    );
  }
}

function XatoEkrani({ xato, qayta }: { xato: Error; qayta: () => void }) {
  const { C } = useTema();
  return (
    <View style={{ flex: 1, backgroundColor: C.fon }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 90 }}>
        <Text style={{ fontSize: 40, textAlign: 'center' }}>⚠</Text>
        <Text
          style={{
            color: C.matn,
            fontSize: 19,
            fontWeight: '800',
            textAlign: 'center',
            marginTop: 14,
          }}
        >
          Ilovada nosozlik
        </Text>
        <Text
          style={{
            color: C.matn2,
            fontSize: 14,
            textAlign: 'center',
            marginTop: 10,
            lineHeight: 21,
          }}
        >
          Yozuvlaringiz joyida — ular telefonda saqlangan va yo‘qolmaydi.
          Nosozlik haqida bizga xabar ketdi.
        </Text>

        <TouchableOpacity
          onPress={qayta}
          style={{
            backgroundColor: C.faol,
            borderRadius: O.radiusKichik,
            minHeight: 48,
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: 26,
          }}
        >
          <Text style={{ color: C.faolMatn, fontSize: 16, fontWeight: '700' }}>
            Qayta urinish
          </Text>
        </TouchableOpacity>

        {/* Xato matni: yordam so'raganda odam shuni nusxalab yuboradi */}
        <View
          style={{
            backgroundColor: C.karta,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            padding: 12,
            marginTop: 26,
          }}
        >
          <Text style={{ color: C.xira, fontSize: 11, marginBottom: 6 }}>
            TEXNIK MA’LUMOT
          </Text>
          <Text selectable style={{ color: C.matn2, fontSize: 12, lineHeight: 18 }}>
            {xato.message || xato.name}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
