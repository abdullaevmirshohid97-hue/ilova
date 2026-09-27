// =============================================================
//  OPERATSIYA OYNASI — bitim yoki to'lovni tahrirlash
//
//  Rejaning 5.1 va 5.4 bandlari.
//
//  NIMA TAHRIRLANADI — bazadagi trigger belgilaydi:
//
//    holat = 'kutilmoqda'  -> summa, sana, vaqt, izoh, muddat
//    boshqa holatlarda     -> faqat izoh va muddat
//
//  Ekran summa maydonini o'chirib qo'yadi, LEKIN bu himoya emas —
//  qulaylik. Haqiqiy cheklov bazada, chunki sinx PostgREST orqali
//  to'g'ridan-to'g'ri `update` yuboradi va ekranni chetlab o'tish
//  mumkin. Server rad etsa, xabar tushunarli matnga aylanadi.
//
//  NEGA tasdiqlangan bitimning puli qotib qoladi: hamkor Telegram
//  orqali «1 200 000» ni tasdiqlaydi. Keyin summa 2 000 000
//  bo'lsa, tarixda «tasdiqlangan» deb turadi va hamkor nimani
//  tasdiqlaganini isbotlab bo'lmaydi.
//
//  SAQLASH FAQAT O'ZGARISH BO'LSA yonadi (5.4). O'zgarishsiz
//  bosilsa `versiya` bekorga o'sardi va sinx bo'sh ish qilardi —
//  har qurilmada bitta ortiqcha tortish.
//
//  SANA ISO SHAKLDA (`2026-10-05`), vaqt `14:30`. Tizim
//  tanlagichi ishlatilmaydi: `MuddatMaydoni` dagi bilan bir xil
//  qaror — u native modul talab qiladi, ISO esa chalkashmaydi va
//  `Intl` ham kerak emas.
// =============================================================

import { useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatla, ifodaKorinish, operatsiyaNomi, tiyinga, type HamkorQator } from '@ilova/kassa-yadro';
import { bitimTahrirla, tolovTahrirla } from '../lib/baza';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { Kalkulator } from '../ui/Kalkulator';
import { MuddatMaydoni } from '../ui/MuddatMaydoni';
import { Tugma } from '../ui/qismlar';
import { xatoYoz } from '../lib/xatolar';
import { Klaviaturali } from '../ui/Klaviaturali';

/** ISO dan `2026-10-05` va `14:30` ga. Mahalliy vaqtda. */
function boleklar(iso: string): { sana: string; vaqt: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    sana: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    vaqt: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/** `2026-10-05` + `14:30` dan ISO ga. Xato bo'lsa `null`. */
function isoYasa(sana: string, vaqt: string): string | null {
  const s = sana.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const v = vaqt.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!s || !v) return null;
  const soat = Number(v[1]);
  const daqiqa = Number(v[2]);
  if (soat > 23 || daqiqa > 59) return null;
  const d = new Date(Number(s[1]), Number(s[2]) - 1, Number(s[3]), soat, daqiqa, 0, 0);
  // `new Date(2026, 1, 31)` 3-martga siljiydi — shuni ushlaymiz,
  // aks holda odam yo'q kunni yozib, boshqa sanani olardi.
  if (d.getMonth() !== Number(s[2]) - 1 || d.getDate() !== Number(s[3])) return null;
  return d.toISOString();
}

export default function OperatsiyaOynasi({
  qator,
  yop,
  saqlandi,
}: {
  qator: HamkorQator | null;
  yop: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();

  const boshlangich = useMemo(() => {
    if (!qator) return null;
    const b = boleklar(qator.sana);
    if (qator.tur === 'bitim') {
      return {
        holat: qator.bitim.holat,
        valyuta: qator.bitim.valyuta,
        summa: String(qator.bitim.summa / 100),
        // TIYIN ham saqlanadi: «Hozir:» ni ko‘rsatish uchun
        // matnni qaytib ko‘paytirsak `12.34 * 100` 1233.99…
        // berardi — pul hech qachon suzuvchi nuqtadan o‘tmaydi.
        tiyin: qator.bitim.summa,
        izoh: qator.bitim.izoh ?? '',
        muddat: qator.bitim.muddat ?? null,
        ...b,
      };
    }
    if (qator.tur === 'tolov') {
      return {
        holat: qator.tolov.holat,
        valyuta: qator.tolov.valyuta,
        summa: String(qator.tolov.summa / 100),
        // TIYIN ham saqlanadi: «Hozir:» ni ko‘rsatish uchun
        // matnni qaytib ko‘paytirsak `12.34 * 100` 1233.99…
        // berardi — pul hech qachon suzuvchi nuqtadan o‘tmaydi.
        tiyin: qator.tolov.summa,
        izoh: qator.tolov.izoh ?? '',
        muddat: qator.tolov.muddat ?? null,
        ...b,
      };
    }
    // Daftar yozuvi bu oynada tahrirlanmaydi — uning o'z oynasi bor
    return null;
  }, [qator]);

  const [summa, setSumma] = useState('');
  const [sana, setSana] = useState('');
  const [vaqt, setVaqt] = useState('');
  const [izoh, setIzoh] = useState('');
  const [muddat, setMuddat] = useState<string | null>(null);
  const [kalkulator, setKalkulator] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);

  // Oyna ochilganda maydonlar to'ldiriladi
  const [oxirgiId, setOxirgiId] = useState<string | null>(null);
  if (qator && boshlangich && qator.id !== oxirgiId) {
    setOxirgiId(qator.id);
    setSumma(boshlangich.summa);
    setSana(boshlangich.sana);
    setVaqt(boshlangich.vaqt);
    setIzoh(boshlangich.izoh);
    setMuddat(boshlangich.muddat);
    setXato(null);
  }

  const kutilmoqda = boshlangich?.holat === 'kutilmoqda';

  const ozgardi =
    boshlangich !== null &&
    (izoh !== boshlangich.izoh ||
      muddat !== boshlangich.muddat ||
      (kutilmoqda &&
        (summa !== boshlangich.summa || sana !== boshlangich.sana || vaqt !== boshlangich.vaqt)));

  async function saqla() {
    if (!qator || !boshlangich || !ozgardi) return;
    setXato(null);

    const patch: Record<string, unknown> = {};
    if (izoh !== boshlangich.izoh) patch.izoh = izoh;
    if (muddat !== boshlangich.muddat) patch.muddat = muddat;

    if (kutilmoqda) {
      if (summa !== boshlangich.summa) {
        const t = tiyinga(summa);
        if (!t || t <= 0) return setXato(tr('Summani to‘g‘ri kiriting.'));
        patch.summa = t;
      }
      if (sana !== boshlangich.sana || vaqt !== boshlangich.vaqt) {
        const iso = isoYasa(sana, vaqt);
        if (!iso) return setXato(tr('Sana yoki vaqt noto‘g‘ri. Namuna: 2026-10-05 va 14:30'));
        patch.sana = iso;
      }
    }

    setBand(true);
    try {
      if (qator.tur === 'bitim') await bitimTahrirla(qator.id, patch);
      else await tolovTahrirla(qator.id, patch);
      saqlandi();
      yop();
    } catch (e) {
      void xatoYoz('OperatsiyaOynasi.saqla', e);
      setXato(xatoMatn(e));
    } finally {
      setBand(false);
    }
  }

  const maydon = {
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.matn,
    backgroundColor: C.karta2,
  };

  return (
    <Modal visible={qator !== null && boshlangich !== null} animationType="slide" onRequestClose={yop}>
      <Klaviaturali uslub={{ backgroundColor: C.fon }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: O.chekka,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: C.ajratgich,
            backgroundColor: C.tun,
          }}
        >
          <TouchableOpacity onPress={yop} hitSlop={10} style={{ padding: 4 }}>
            <Text style={{ color: C.tunMatn, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, color: C.tunMatn, fontSize: 16, fontWeight: '700', marginLeft: 12 }}>
            {qator ? tr(operatsiyaNomi(qator)) : ''}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {!kutilmoqda && boshlangich && (
            <View
              style={{
                margin: O.chekka,
                padding: 12,
                borderRadius: O.radiusKichik,
                backgroundColor: C.ogohYumshoq,
              }}
            >
              <Text style={{ color: C.ogoh, fontSize: 13, lineHeight: 19 }}>
                {tr('Bu operatsiya tasdiqlangan. Summa va sana o‘zgarmaydi — faqat izoh va muddat.')}
              </Text>
            </View>
          )}

          <Yorliq matn={tr('Summa')} />
          <View style={{ paddingHorizontal: O.chekka }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={{ ...maydon, flex: 1, fontSize: 22, fontWeight: '700', textAlign: 'right' }}
                value={ifodaKorinish(summa)}
                onChangeText={(x) => {
                  setXato(null);
                  setSumma(x.replace(/\s/g, ''));
                }}
                editable={kutilmoqda}
                keyboardType="numeric"
              />
              {kutilmoqda && (
                <TouchableOpacity
                  onPress={() => setKalkulator(true)}
                  style={{
                    width: 52,
                    borderRadius: O.radiusKichik,
                    borderWidth: 1,
                    borderColor: C.chegara,
                    backgroundColor: C.karta2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: C.matn2, fontSize: 18, fontWeight: '700' }}>=</Text>
                </TouchableOpacity>
              )}
            </View>
            {boshlangich && (
              <Text style={{ color: C.xira, fontSize: 12, marginTop: 6 }}>
                {tr('Hozir:')} {formatla(boshlangich.tiyin, boshlangich.valyuta)}
              </Text>
            )}
          </View>

          <Yorliq matn={tr('Sana va vaqt')} />
          <View style={{ paddingHorizontal: O.chekka, flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={{ ...maydon, flex: 2 }}
              value={sana}
              onChangeText={(x) => {
                setXato(null);
                setSana(x);
              }}
              editable={kutilmoqda}
              placeholder="2026-10-05"
              placeholderTextColor={C.xira}
            />
            <TextInput
              style={{ ...maydon, flex: 1 }}
              value={vaqt}
              onChangeText={(x) => {
                setXato(null);
                setVaqt(x);
              }}
              editable={kutilmoqda}
              placeholder="14:30"
              placeholderTextColor={C.xira}
            />
          </View>

          <Yorliq matn={tr('Izoh')} />
          <View style={{ paddingHorizontal: O.chekka }}>
            <TextInput
              style={{ ...maydon, minHeight: 80, textAlignVertical: 'top' }}
              value={izoh}
              onChangeText={setIzoh}
              multiline
              placeholder={tr('Nima uchun')}
              placeholderTextColor={C.xira}
            />
          </View>

          <View style={{ paddingHorizontal: O.chekka, marginTop: 14 }}>
            <MuddatMaydoni qiymat={muddat} setQiymat={setMuddat} izoh={tr('Qachonga kelishdingiz')} />
          </View>

          {xato && (
            <Text style={{ color: C.chiqim, fontSize: 13, paddingHorizontal: O.chekka, marginTop: 8 }}>
              {xato}
            </Text>
          )}

          <View style={{ paddingHorizontal: O.chekka, marginTop: 18 }}>
            {/* O'zgarishsiz bosilsa versiya bekorga o'sardi (5.4) */}
            {/* O‘zgarish bo‘lmasa tugma xiralashadi va saqla() ham
                darhol qaytadi — ikki tomondan qo‘riqlangan. */}
            <Tugma
              matn={tr('Saqlash')}
              bos={saqla}
              kutmoqda={band}
              uslub={{ opacity: ozgardi ? 1 : 0.45 }}
            />
            {!ozgardi && (
              <Text style={{ color: C.xira, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                {tr('O‘zgarish yo‘q')}
              </Text>
            )}
          </View>
        </ScrollView>

        {boshlangich && (
          <Kalkulator
            korinsin={kalkulator}
            boshlangich={summa}
            valyuta={boshlangich.valyuta}
            yop={() => setKalkulator(false)}
            tasdiq={(m) => {
              setXato(null);
              setSumma(m);
            }}
          />
        )}
      </Klaviaturali>
    </Modal>
  );
}

/** Maydon yorlig‘i — BitimOynasi dagi bilan bir xil ko‘rinish. */
function Yorliq({ matn }: { matn: string }) {
  const { C } = useTema();
  return (
    <Text
      style={{
        color: C.matn2,
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: O.chekka,
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {matn}
    </Text>
  );
}
