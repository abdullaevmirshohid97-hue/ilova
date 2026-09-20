// =============================================================
//  MUDDAT MAYDONI
//
//  «Qachonga kelishdik?» — bitimda ham, to'lovda ham bir xil
//  savol, shuning uchun bitta qism.
//
//  TIZIM SANA TANLAGICHI ISHLATILMAYDI. U native modul talab
//  qiladi (`@react-native-community/datetimepicker`) va APK ni
//  qayta yig'ishga majbur qilardi. Muddat esa amalda ikki-uch
//  variantdan iborat: «bir hafta», «bir oy», «aniq kun». Tayyor
//  tugmalar shu uchtasini bir tegishda beradi va qolganini
//  qo'lda yozsa bo'ladi.
//
//  Sana ISO KUN ko'rinishida saqlanadi (`2026-10-05`), chunki
//  bazada ustun turi `date`. Soat qo'shilsa «5-oktabr 00:00 da
//  kechikdi» degan holat chiqib, odam bir kun oldin
//  ogohlantirish olardi.
// =============================================================

import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { sanaQisqa } from '../lib/davr';
import { O, useTema } from '../lib/tema';
import { tr, trn } from '../lib/til';

/** `2026-10-05` — mahalliy vaqt bo'yicha, UTC siljishisiz */
function kunIso(d: Date): string {
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${ik(d.getMonth() + 1)}-${ik(d.getDate())}`;
}

function kunQoshib(kun: number): string {
  const d = new Date();
  d.setDate(d.getDate() + kun);
  return kunIso(d);
}

const TAYYOR = [7, 14, 30];

export function MuddatMaydoni({
  qiymat,
  setQiymat,
  izoh,
}: {
  qiymat: string | null;
  setQiymat: (v: string | null) => void;
  izoh?: string;
}) {
  const { C } = useTema();

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, color: C.matn2, fontSize: 12 }}>{tr('Muddat')}</Text>
        {qiymat ? (
          <TouchableOpacity onPress={() => setQiymat(null)} hitSlop={10}>
            <Text style={{ color: C.xira, fontSize: 12 }}>{tr('olib tashlash')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {TAYYOR.map((kun) => {
          const sana = kunQoshib(kun);
          const faolmi = qiymat === sana;
          return (
            <TouchableOpacity
              key={kun}
              onPress={() => setQiymat(faolmi ? null : sana)}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: O.radiusKichik,
                borderWidth: 1,
                borderColor: faolmi ? C.faol : C.chegara,
                backgroundColor: faolmi ? C.faol : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: faolmi ? C.faolMatn : C.matn2,
                  fontSize: 12,
                  fontWeight: faolmi ? '700' : '500',
                }}
              >
                {trn('{n} kun', kun)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Aniq kun — qo'lda. Namunasi ko'rsatilgan, chunki
          «05.10.2026» va «2026-10-05» ni chalkashtirish oson. */}
      <TextInput
        value={qiymat ?? ''}
        onChangeText={(v) => setQiymat(v.trim() || null)}
        placeholder="2026-10-05"
        placeholderTextColor={C.xira}
        style={{
          marginTop: 6,
          borderWidth: 1,
          borderColor: C.chegara,
          borderRadius: O.radiusKichik,
          paddingHorizontal: 12,
          paddingVertical: 9,
          fontSize: 14,
          color: C.matn,
          backgroundColor: C.karta,
        }}
      />

      <Text style={{ color: C.xira, fontSize: 11, marginTop: 5 }}>
        {qiymat && !Number.isNaN(Date.parse(qiymat))
          ? sanaQisqa(qiymat)
          : (izoh ?? tr('Bo‘sh qoldirilsa muddat yo‘q'))}
      </Text>
    </View>
  );
}
