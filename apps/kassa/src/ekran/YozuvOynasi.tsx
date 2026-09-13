// =============================================================
//  YOZUV OYNASI — kirim, chiqim, o'tkazma va tahrir
//
//  Eng ko'p ochiladigan ekran. Bitta o'lchov bor: yozuv UCH BOSISHDA
//  kiritilsin — summa, turkum, saqlash. Hisob va sana oldindan
//  to'ldirilgan holda keladi.
//
//  Klaviatura ILOVANING O'ZIDA (tizim klaviaturasi emas): raqamlar
//  katta, `+ − × ÷` bor. Bozordagi ilovalardan ko'chirilgan odat:
//  odam "1200+300" deb yozadi va javobini o'zi hisoblamaydi.
//
//  O'TKAZMA shu yerda, alohida ekranda emas: odam uchun bu ham
//  "pul harakati", faqat ikki hisob orasida.
// =============================================================

import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatla, ifodaHisobla, tiyinga } from '@ilova/kassa-yadro';
import type { Yozuv } from '@ilova/kassa-yadro';
import { kochirmaYarat, yozuvQosh, yozuvTahrirla } from '../lib/baza';
import { sanaQisqa } from '../lib/davr';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { Chip } from '../ui/qismlar';

const TUGMALAR = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '000', '.', '+'];

export type OynaRejimi = 'kirim' | 'chiqim' | 'kochirma';

export default function YozuvOynasi({
  rejim,
  tahrir,
  boshHisob,
  boshKlient,
  yopish,
  saqlandi,
}: {
  rejim: OynaRejimi;
  tahrir?: Yozuv | null;
  boshHisob?: string | null;
  boshKlient?: string | null;
  yopish: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();
  const { hisoblar, turkumlar, klientlar } = useHolat();

  const faolHisoblar = hisoblar.filter((h) => h.faol);
  const [ifoda, setIfoda] = useState(tahrir ? String(tahrir.summa / 100) : '');
  const [hisobId, setHisobId] = useState(tahrir?.hisob_id ?? boshHisob ?? faolHisoblar[0]?.id ?? '');
  const [hisobId2, setHisobId2] = useState(faolHisoblar[1]?.id ?? '');
  const [turkumId, setTurkumId] = useState<string | null>(tahrir?.turkum_id ?? null);
  const [klientId, setKlientId] = useState<string | null>(tahrir?.klient_id ?? boshKlient ?? null);
  const [izoh, setIzoh] = useState(tahrir?.izoh ?? '');
  const [sana, setSana] = useState<Date>(tahrir ? new Date(tahrir.sana) : new Date());
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const kochirma = rejim === 'kochirma';
  const turi = rejim === 'kirim' ? 'kirim' : 'chiqim';
  const rang = kochirma ? C.matn2 : rejim === 'kirim' ? C.kirim : C.chiqim;

  const kerakli = useMemo(() => turkumlar.filter((t) => t.turi === turi && t.faol), [turkumlar, turi]);
  const hisob = hisoblar.find((h) => h.id === hisobId);

  // Ifodani har bosishda hisoblaymiz: odam natijani DARHOL ko'rsin,
  // "=" ni qidirmasin.
  const tiyin = useMemo(
    () => ifodaHisobla(ifoda.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')),
    [ifoda],
  );

  function bos(t: string) {
    setXato(null);
    if (t === '⌫') return setIfoda((x) => x.slice(0, -1));
    // Ketma-ket ikki amal belgisi qo'yilmasin: "12++3" hisoblanmaydi
    if ('+−×÷'.includes(t) && (ifoda === '' || '+−×÷'.includes(ifoda.slice(-1)))) return;
    setIfoda((x) => x + t);
  }

  function sanaSiljit(kun: number) {
    const y = new Date(sana);
    y.setDate(y.getDate() + kun);
    // Kelajakka yozib bo'lmaydi: "ertangi kirim" daftarni buzadi
    if (y.getTime() > Date.now() + 60_000) return;
    setSana(y);
  }

  async function yubor() {
    if (!hisobId) return setXato('Hisobni tanlang.');
    if (kochirma && !hisobId2) return setXato('Qaysi hisobga o‘tkazilishini tanlang.');
    if (kochirma && hisobId === hisobId2) return setXato('Ikki xil hisob tanlang.');
    if (tiyin === null || tiyin <= 0) return setXato('Summani kiriting.');

    if (kochirma) {
      const a = hisoblar.find((h) => h.id === hisobId);
      const b = hisoblar.find((h) => h.id === hisobId2);
      if (a && b && a.valyuta !== b.valyuta) {
        return setXato('Valyutalari har xil hisoblar orasida o‘tkazma hozircha yo‘q.');
      }
    }

    setSaqlanmoqda(true);
    try {
      if (tahrir) {
        await yozuvTahrirla(tahrir.id, {
          hisob_id: hisobId,
          turi,
          summa: tiyin,
          turkum_id: turkumId,
          klient_id: klientId,
          izoh,
          sana: sana.toISOString(),
        });
      } else if (kochirma) {
        await kochirmaYarat({
          kimdan: hisobId,
          kimga: hisobId2,
          summa: tiyin,
          izoh,
          sana: sana.toISOString(),
        });
      } else {
        await yozuvQosh({
          hisob_id: hisobId,
          turi,
          summa: tiyin,
          turkum_id: turkumId,
          klient_id: klientId,
          izoh,
          sana: sana.toISOString(),
        });
      }
      saqlandi();
      yopish();
    } catch (e) {
      setXato(xatoMatn(e));
      setSaqlanmoqda(false);
    }
  }

  const sarlavha = tahrir
    ? 'Yozuvni tahrirlash'
    : kochirma
      ? 'Hisoblararo o‘tkazma'
      : rejim === 'kirim'
        ? 'Kirim'
        : 'Chiqim';

  return (
    <Modal visible animationType="slide" onRequestClose={yopish} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: C.fon,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '94%',
            width: '100%',
            maxWidth: 520,
            alignSelf: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: rang,
              paddingHorizontal: O.chekka,
              paddingVertical: 14,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{sarlavha}</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Summa */}
            <View style={{ paddingHorizontal: O.chekka, paddingTop: 18, paddingBottom: 6 }}>
              <Text
                style={{ color: rang, fontSize: 40, fontWeight: '800', textAlign: 'right' }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {ifoda || '0'}
              </Text>
              {tiyin !== null && /[+−×÷]/.test(ifoda) && (
                <Text style={{ color: C.xira, fontSize: 14, textAlign: 'right', marginTop: 4 }}>
                  = {formatla(tiyin, hisob?.valyuta ?? 'UZS')}
                </Text>
              )}
            </View>

            {/* Hisob(lar) */}
            <Yorliq matn={kochirma ? 'Qaysi hisobdan' : 'Hisob'} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
              {faolHisoblar.map((h) => (
                <Chip key={h.id} matn={h.nom} tanlangan={h.id === hisobId} bos={() => setHisobId(h.id)} />
              ))}
            </ScrollView>

            {kochirma && (
              <>
                <Yorliq matn="Qaysi hisobga" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
                  {faolHisoblar.map((h) => (
                    <Chip
                      key={h.id}
                      matn={h.nom}
                      tanlangan={h.id === hisobId2}
                      bos={() => setHisobId2(h.id)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Turkum va kontakt — o'tkazmada ma'nosiz */}
            {!kochirma && (
              <>
                <Yorliq matn="Turkum" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: O.chekka }}>
                  {kerakli.map((t) => (
                    <View key={t.id} style={{ marginBottom: 8 }}>
                      <Chip
                        matn={t.nom}
                        tanlangan={t.id === turkumId}
                        bos={() => setTurkumId(t.id === turkumId ? null : t.id)}
                      />
                    </View>
                  ))}
                  {kerakli.length === 0 && (
                    <Text style={{ color: C.xira, fontSize: 13 }}>Turkum yo‘q — «Yana» bo‘limidan qo‘shasiz</Text>
                  )}
                </View>

                {klientlar.length > 0 && (
                  <>
                    <Yorliq matn="Kim bilan (ixtiyoriy)" />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
                      {klientlar.map((k) => (
                        <Chip
                          key={k.id}
                          matn={k.ism}
                          tanlangan={k.id === klientId}
                          bos={() => setKlientId(k.id === klientId ? null : k.id)}
                        />
                      ))}
                    </ScrollView>
                  </>
                )}
              </>
            )}

            {/* Izoh */}
            <Yorliq matn="Izoh" />
            <TextInput
              style={{
                marginHorizontal: O.chekka,
                backgroundColor: C.karta,
                borderWidth: 1,
                borderColor: C.chegara,
                borderRadius: O.radiusKichik,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
                color: C.matn,
              }}
              value={izoh}
              onChangeText={setIzoh}
              placeholder="Nima uchun"
              placeholderTextColor={C.xira}
            />

            {/* Sana */}
            <Yorliq matn="Sana" />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: O.chekka, gap: 8 }}>
              <TouchableOpacity onPress={() => sanaSiljit(-1)} hitSlop={10} style={{ padding: 6 }}>
                <Text style={{ color: C.matn2, fontSize: 18, fontWeight: '700' }}>‹</Text>
              </TouchableOpacity>
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor: C.karta,
                  borderWidth: 1,
                  borderColor: C.chegara,
                  borderRadius: O.radiusKichik,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: C.matn, fontSize: 14, fontWeight: '600' }}>{sanaQisqa(sana)}</Text>
              </View>
              <TouchableOpacity onPress={() => sanaSiljit(1)} hitSlop={10} style={{ padding: 6 }}>
                <Text style={{ color: C.matn2, fontSize: 18, fontWeight: '700' }}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSana(new Date())} style={{ padding: 6 }}>
                <Text style={{ color: C.matn2, fontSize: 13 }}>Bugun</Text>
              </TouchableOpacity>
            </View>

            {xato && (
              <Text style={{ color: C.chiqim, fontSize: 13, paddingHorizontal: O.chekka, marginTop: 10 }}>
                {xato}
              </Text>
            )}

            {/* Klaviatura */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, marginTop: 12 }}>
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
              <Pressable
                onPress={() => bos('⌫')}
                onLongPress={() => setIfoda('')}
                style={{ width: '25%', paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 22, fontWeight: '600', color: C.matn }}>⌫</Text>
              </Pressable>
              <Pressable
                onPress={yubor}
                disabled={saqlanmoqda}
                style={{
                  width: '75%',
                  paddingVertical: 16,
                  alignItems: 'center',
                  borderRadius: O.radiusKichik,
                  margin: 4,
                  backgroundColor: rang,
                  opacity: saqlanmoqda ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>
                  {saqlanmoqda ? '...' : tahrir ? 'Saqlash' : 'Qo‘shish'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Yorliq({ matn }: { matn: string }) {
  const { C } = useTema();
  return (
    <Text
      style={{
        color: C.matn2,
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: O.chekka,
        marginTop: 14,
        marginBottom: 8,
      }}
    >
      {matn}
    </Text>
  );
}

/** Yozuvni tiyinga o'girish kerak bo'lgan joyda ishlatiladi */
export { tiyinga };
