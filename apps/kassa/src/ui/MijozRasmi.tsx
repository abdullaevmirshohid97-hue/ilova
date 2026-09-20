// =============================================================
//  MIJOZ RASMI — doiracha
//
//  Ombor OCHIQ EMAS, ya'ni rasmni to'g'ridan-to'g'ri `<Image>` ga
//  berib bo'lmaydi: har biri uchun imzolangan havola olinadi.
//
//  Havolalar XOTIRADA saqlanadi (`keshi`). Usiz ro'yxat har
//  varaqlanganda o'nlab so'rov ketardi va rasmlar ko'z oldida
//  o'chib-yonardi. Havola bir soat yashaydi, kesh esa ilova
//  yopilgunicha — ikkinchisi birinchisidan qisqa, demak eskirgan
//  havola qolib ketmaydi.
//
//  Rasm ochilmasa harflar qoladi: ro'yxat baribir o'qiladi.
// =============================================================

import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { rasmHavola } from '../lib/rasm';
import { useTema } from '../lib/tema';

const keshi = new Map<string, string>();

export function MijozRasmi({
  yol,
  harflar,
  olcham = 42,
}: {
  yol?: string | null;
  harflar: string;
  olcham?: number;
}) {
  const { C } = useTema();
  const [uri, setUri] = useState<string | null>(yol ? (keshi.get(yol) ?? null) : null);

  useEffect(() => {
    if (!yol || keshi.has(yol)) return;
    let tirik = true;
    rasmHavola(yol).then((u) => {
      if (!u || !tirik) return;
      keshi.set(yol, u);
      setUri(u);
    });
    return () => {
      tirik = false;
    };
  }, [yol]);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: olcham,
          height: olcham,
          borderRadius: olcham / 2,
          backgroundColor: C.ajratgich,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: olcham,
        height: olcham,
        borderRadius: olcham / 2,
        backgroundColor: C.ajratgich,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: C.matn2, fontSize: olcham * 0.36, fontWeight: '700' }}>{harflar}</Text>
    </View>
  );
}
