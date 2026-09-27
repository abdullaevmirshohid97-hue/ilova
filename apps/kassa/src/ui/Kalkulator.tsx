// =============================================================
//  KALKULATOR — summa maydoni yonidagi panel
//
//  Nega kerak: bozorda summa deyarli hech qachon tayyor son
//  bo'lmaydi. «12 qop × 145 ming», «1 200 000 dan 300 mingi
//  to'landi». Odam telefon kalkulyatorini ochib, natijani
//  eslab, qaytib kelib yozardi — va bir raqamni adashtirardi.
//
//  YozuvOynasi da panel DOIMIY ko'rinadi, chunki u yerda
//  summa — yagona maydon. Bu yerda esa summa boshqa maydonlar
//  orasida, shuning uchun panel MODAL: tugma bosilganda
//  chiqadi, OK bosilganda natija maydonga yoziladi.
//
//  HISOB TIYINDA. `ifodaHisobla` `eval` ishlatmaydi va natijani
//  tiyinda qaytaradi — «0.10» kabi kasr yo'qolmaydi. Bu ilgari
//  hujjatda xato bergan joy edi.
//
//  Natija HAR BOSISHDA ko'rinadi: odam «=» ni qidirmasin.
// =============================================================

import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { formatla, ifodaHisobla, type Valyuta } from '@ilova/kassa-yadro';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';

const TUGMALAR = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '000', '.', '+'];

/** Ekrandagi belgilar hisob belgilariga: × → *, ÷ → /, − → - */
function hisobga(x: string): string {
  return x.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
}

export function Kalkulator({
  korinsin,
  boshlangich,
  valyuta,
  yop,
  tasdiq,
}: {
  korinsin: boolean;
  /** Maydondagi hozirgi matn — panel shundan davom etadi */
  boshlangich: string;
  valyuta: Valyuta;
  yop: () => void;
  /** Natija: maydonga yoziladigan MATN (so'mda, ajratgichsiz) */
  tasdiq: (matn: string) => void;
}) {
  const { C } = useTema();
  const [ifoda, setIfoda] = useState('');

  // Ochilganda maydondagi qiymatdan davom etadi
  const [oxirgiKorinsin, setOxirgiKorinsin] = useState(false);
  if (korinsin !== oxirgiKorinsin) {
    setOxirgiKorinsin(korinsin);
    if (korinsin) setIfoda(boshlangich.replace(/\s/g, ''));
  }

  const tiyin = useMemo(() => ifodaHisobla(hisobga(ifoda)), [ifoda]);

  function bos(t: string) {
    if (t === '⌫') return setIfoda((x) => x.slice(0, -1));
    setIfoda((x) => {
      // Ketma-ket ikki amal belgisi qo'yilmasin: «12++3» hisoblanmaydi
      // va odam nima xato qilganini tushunmasdi.
      if ('+−×÷'.includes(t) && (x === '' || '+−×÷'.includes(x.slice(-1)))) {
        return x === '' ? x : x.slice(0, -1) + t;
      }
      return x + t;
    });
  }

  const tayyor = tiyin !== null && tiyin > 0;

  return (
    <Modal visible={korinsin} transparent animationType="slide" onRequestClose={yop}>
      <Pressable style={{ flex: 1, backgroundColor: '#00000080' }} onPress={yop} />
      <View style={{ backgroundColor: C.karta, borderTopLeftRadius: O.radius, borderTopRightRadius: O.radius }}>
        {/* Ifoda va natija */}
        <View style={{ padding: O.chekka, borderBottomWidth: 1, borderBottomColor: C.ajratgich }}>
          <Text style={{ color: C.xira, fontSize: 13, minHeight: 18 }}>{ifoda || tr('Hisoblash')}</Text>
          <Text style={{ color: tayyor ? C.matn : C.xira, fontSize: 26, fontWeight: '700', marginTop: 4 }}>
            {tiyin === null ? '—' : formatla(tiyin, valyuta)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
          {TUGMALAR.map((t) => (
            <Pressable
              key={t}
              onPress={() => bos(t)}
              style={{ width: '25%', paddingVertical: 14, alignItems: 'center' }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '600',
                  color: '+−×÷'.includes(t) ? C.matn2 : C.matn,
                }}
              >
                {t}
              </Text>
            </Pressable>
          ))}

          {/* Uzoq bosilsa butunlay tozalaydi — bittalab o'chirish
              uzun ifodada zerikarli. */}
          <Pressable
            onPress={() => bos('⌫')}
            onLongPress={() => setIfoda('')}
            style={{ width: '25%', paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 22, fontWeight: '600', color: C.matn }}>⌫</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (!tayyor || tiyin === null) return;
              // Maydonga SO'M yoziladi, ajratgichsiz: maydonning
              // o'zi uni formatlaydi va ikki xil formatlash
              // bir-birini buzmasligi kerak.
              tasdiq((tiyin / 100).toString());
              yop();
            }}
            disabled={!tayyor}
            style={{
              width: '75%',
              paddingVertical: 16,
              alignItems: 'center',
              borderRadius: O.radiusKichik,
              backgroundColor: tayyor ? C.faol : C.karta2,
              marginTop: 4,
            }}
          >
            <Text
              style={{
                color: tayyor ? C.faolMatn : C.xira,
                fontSize: 16,
                fontWeight: '700',
              }}
            >
              {tr('OK')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
