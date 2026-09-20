// =============================================================
//  BITIM OYNASI — tovar yoki qarz
//
//  Bitta o'lchov: odam «kim bilan · nima · qancha» degan uch
//  savolga javob bersa, bitim yozilishi kerak. Qolgani ixtiyoriy.
//
//  MIQDOR x NARX = JAMI o'zi hisoblanadi va KATTA qilib ko'rsatiladi.
//  Sabab: konsepsiyada 1 200 x $0.10 «$24 000» deb yozilgan edi,
//  aslida $120. Bir nol xatosi qarz bo'lib qoladi va oylar o'tib
//  chiqadi — shuning uchun odam saqlashdan OLDIN jamini ko'rsin.
//
//  Jamini QO'LDA ham yozsa bo'ladi: bozorda «karobkasi 100 mingdan,
//  jami 12 million» deb kelishiladi, donasini sanab o'tirmaydi.
//  Qo'lda yozilgach, avtomatik hisob to'xtaydi — aks holda odamning
//  raqami ustiga o'zimizniki yozilardi.
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cheklovTekshir, formatla, hamkorQoldiq, ifodaKorinish, tiyinga } from '@ilova/kassa-yadro';
import type { BitimNima, BitimYonalish } from '@ilova/kassa-yadro';
import { bitimQosh } from '../lib/baza';
import { useHolat } from '../lib/holat';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { xatoYoz } from '../lib/xatolar';
import { Chip, Karta, Tugma } from '../ui/qismlar';
import { MuddatMaydoni } from '../ui/MuddatMaydoni';

const BIRLIKLAR = ['dona', 'kg', 'metr', 'quti', 'litr'];

export default function BitimOynasi({
  yonalish,
  nima,
  boshKlient,
  yopish,
  saqlandi,
}: {
  yonalish: BitimYonalish;
  nima: BitimNima;
  boshKlient?: string | null;
  yopish: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();
  const { hisoblar, klientlar, bitimlar, tolovlar, yozuvlar, valyutalar } = useHolat();
  const chekka = useSafeAreaInsets();

  const faolHisoblar = hisoblar.filter((h) => h.faol);
  const tovarmi = nima === 'tovar';

  const [klientId, setKlientId] = useState<string | null>(boshKlient ?? null);
  const [qidiruv, setQidiruv] = useState('');
  const [tovarNom, setTovarNom] = useState('');
  const [birlik, setBirlik] = useState('dona');
  const [miqdor, setMiqdor] = useState('');
  const [narx, setNarx] = useState('');
  const [jami, setJami] = useState('');
  const [jamiQolda, setJamiQolda] = useState(false);
  const [hisobId, setHisobId] = useState(faolHisoblar[0]?.id ?? '');
  const [izoh, setIzoh] = useState('');
  const [muddat, setMuddat] = useState<string | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const klient = klientlar.find((k) => k.id === klientId);
  // Valyuta: hamkorniki standart, lekin ALMASHTIRSA bo‘ladi —
  // bir hamkor bilan ham so‘mda, ham dollarda ishlash odatiy.
  const boshValyuta = klient?.valyuta ?? hisoblar[0]?.valyuta ?? 'UZS';
  const [valyuta, setValyuta] = useState(boshValyuta);
  const [qoldaTanlandi, setQoldaTanlandi] = useState(false);

  // Hamkor almashsa valyuta unga moslanadi — lekin odam qo‘lda
  // tanlagan bo‘lsa tegilmaydi: tanlovini bekor qilish
  // kutilmagan bo‘lardi.
  useEffect(() => {
    if (!qoldaTanlandi) setValyuta(boshValyuta);
  }, [boshValyuta, qoldaTanlandi]);

  // KURS shu yerda olinadi va yozuvga NUSXALANADI. Ertaga kurs
  // o‘zgarsa, bu yozuv o‘zgarmaydi — kelishuv o‘sha kunniki.
  const kurs = valyutalar.find((v) => v.valyuta === valyuta)?.kurs ?? 1;

  // Miqdor x narx. Qo'lda yozilgan bo'lsa tegilmaydi.
  const hisoblangan = useMemo(() => {
    const m = Number(miqdor.replace(',', '.'));
    const n = tiyinga(narx);
    if (!m || !n) return null;
    return Math.round(m * n);
  }, [miqdor, narx]);

  const jamiTiyin = jamiQolda || hisoblangan === null ? tiyinga(jami) : hisoblangan;

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    const royxat = klientlar.filter((k) => k.faol !== false);
    if (!q) return royxat.slice(0, 12);
    return royxat.filter(
      (k) => k.ism.toLowerCase().includes(q) || (k.telefon ?? '').includes(q),
    );
  }, [klientlar, qidiruv]);

  /**
   * Cheklov buzilsa — so‘raydi, to‘smaydi.
   *
   * «Ha» desa `true` qaytadi. Promise bilan yozilgan, chunki
   * `Alert` javobini kutish kerak: usiz bitim so‘roq ekranda
   * turganda ham yozilib ketardi.
   */
  function cheklovSora(): Promise<boolean> {
    const k = klientlar.find((x) => x.id === klientId);
    if (!k?.cheklov) return Promise.resolve(true);

    const joriy = hamkorQoldiq(k.id, bitimlar, tolovlar, yozuvlar);
    const ishora = yonalish === 'berdim' ? 1 : -1;
    const n = cheklovTekshir(k.cheklov, joriy, ishora * (jamiTiyin ?? 0));
    if (!n?.oshdi) return Promise.resolve(true);

    const pul = (x: number) => formatla(x, valyuta, { belgisiz: true, kasrsiz: true });
    return new Promise((javob) => {
      Alert.alert(
        tr('Cheklovdan oshdi'),
        k.ism +
          '\n\n' +
          tr('Bo‘ladi:') + ' ' + pul(n.yangi) +
          '\n' +
          tr('Cheklov:') + ' ' + pul(n.cheklov) +
          '\n' +
          tr('Oshib ketdi:') + ' ' + pul(n.oshgan),
        [
          { text: tr('Bekor'), style: 'cancel', onPress: () => javob(false) },
          { text: tr('Davom etish'), onPress: () => javob(true) },
        ],
        { cancelable: true, onDismiss: () => javob(false) },
      );
    });
  }

  async function yubor() {
    if (!klientId) return setXato(tr('Hamkorni tanlang.'));
    if (tovarmi && !tovarNom.trim()) return setXato(tr('Tovar nomini yozing.'));
    if (!jamiTiyin || jamiTiyin <= 0) return setXato(tr('Summani kiriting.'));
    if (!tovarmi && !hisobId) return setXato(tr('Hisobni tanlang.'));

    setXato(null);
    // Cheklov SAQLASHDAN OLDIN: odam «bekor» desa hech narsa
    // yozilmasligi kerak.
    if (!(await cheklovSora())) return;
    setSaqlanmoqda(true);
    try {
      await bitimQosh({
        klient_id: klientId,
        yonalish,
        nima,
        summa: jamiTiyin,
        tovar_nom: tovarmi ? tovarNom : null,
        birlik: tovarmi ? birlik : null,
        miqdor: tovarmi && miqdor ? Number(miqdor.replace(',', '.')) : null,
        narx: tovarmi && narx ? tiyinga(narx) : null,
        valyuta,
        kurs,
        izoh,
        muddat,
        hisob_id: tovarmi ? null : hisobId,
      });
      saqlandi();
      yopish();
    } catch (e) {
      void xatoYoz('BitimOynasi.yubor', e);
      setXato(xatoMatn(e));
      setSaqlanmoqda(false);
    }
  }

  const sarlavha = tovarmi
    ? yonalish === 'oldim'
      ? tr('Tovar oldim')
      : tr('Tovar berdim')
    : yonalish === 'oldim'
      ? tr('Qarz oldim')
      : tr('Qarz berdim');

  // «Oldim» — men qarzdor bo'laman (chiqim rangi), «berdim» — menga
  // qarzdor bo'ladi (kirim rangi). Rang shu ma'noni takrorlaydi.
  const rang = yonalish === 'berdim' ? C.kirim : C.chiqim;

  const maydon = {
    backgroundColor: C.karta,
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    minHeight: 46,
    fontSize: 15,
    color: C.matn,
  };

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
            paddingBottom: chekka.bottom,
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

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            {/* ---------- Hamkor ---------- */}
            <Yorliq matn={tr('Kim bilan')} />
            {klient ? (
              <View style={{ paddingHorizontal: O.chekka }}>
                <Karta uslub={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, color: C.matn, fontSize: 16, fontWeight: '700' }}>
                    {klient.ism}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setKlientId(null)}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
                  >
                    <Text style={{ color: C.matn2, fontSize: 13 }}>{tr('Almashtirish')}</Text>
                  </TouchableOpacity>
                </Karta>
              </View>
            ) : (
              <View style={{ paddingHorizontal: O.chekka }}>
                <TextInput
                  style={maydon}
                  value={qidiruv}
                  onChangeText={setQidiruv}
                  placeholder={tr('Ism yoki telefon')}
                  placeholderTextColor={C.xira}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                  {korinadigan.map((k) => (
                    <View key={k.id} style={{ marginBottom: 8 }}>
                      <Chip matn={k.ism} tanlangan={false} bos={() => setKlientId(k.id)} />
                    </View>
                  ))}
                </View>
                {klientlar.length === 0 && (
                  <Text style={{ color: C.xira, fontSize: 12, marginTop: 4 }}>
                    {tr('Avval «Hamkorlar» bo‘limidan hamkor qo‘shing')}
                  </Text>
                )}
              </View>
            )}

            {/* ---------- Tovar ---------- */}
            {tovarmi && (
              <>
                <Yorliq matn={tr('Tovar')} />
                <View style={{ paddingHorizontal: O.chekka }}>
                  <TextInput
                    style={maydon}
                    value={tovarNom}
                    onChangeText={setTovarNom}
                    placeholder={tr('Masalan: Karobka')}
                    placeholderTextColor={C.xira}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput
                      style={{ ...maydon, flex: 1 }}
                      value={miqdor}
                      onChangeText={(x) => {
                        setXato(null);
                        setMiqdor(x);
                      }}
                      keyboardType="numeric"
                      placeholder={tr('Miqdor')}
                      placeholderTextColor={C.xira}
                    />
                    <TextInput
                      style={{ ...maydon, flex: 1 }}
                      value={narx}
                      onChangeText={(x) => {
                        setXato(null);
                        setNarx(x);
                      }}
                      keyboardType="numeric"
                      placeholder={tr('Narxi')}
                      placeholderTextColor={C.xira}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                    {BIRLIKLAR.map((b) => (
                      <View key={b} style={{ marginBottom: 8 }}>
                        <Chip matn={tr(b)} tanlangan={b === birlik} bos={() => setBirlik(b)} />
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* ---------- Jami ---------- */}
            <Yorliq matn={tr('Jami')} />
            <View style={{ paddingHorizontal: O.chekka }}>
              <TextInput
                style={{
                  ...maydon,
                  minHeight: 58,
                  fontSize: 26,
                  fontWeight: '800',
                  color: rang,
                  textAlign: 'right',
                }}
                value={jamiQolda || hisoblangan === null ? ifodaKorinish(jami) : ifodaKorinish(String(hisoblangan / 100))}
                onChangeText={(x) => {
                  setXato(null);
                  setJamiQolda(true);
                  setJami(x.replace(/\s/g, ''));
                }}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={C.xira}
              />
              {!jamiQolda && hisoblangan !== null && (
                <Text style={{ color: C.xira, fontSize: 12, marginTop: 6 }}>
                  {miqdor} × {narx} = {formatla(hisoblangan, valyuta)}
                </Text>
              )}
              {jamiQolda && hisoblangan !== null && (
                <TouchableOpacity
                  onPress={() => {
                    setJamiQolda(false);
                    setJami('');
                  }}
                  style={{ minHeight: 40, justifyContent: 'center' }}
                >
                  <Text style={{ color: C.matn2, fontSize: 12 }}>
                    {tr('Miqdor × narx bo‘yicha hisoblash')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ---------- Hisob (faqat pul harakati bo'lsa) ---------- */}
            {!tovarmi && (
              <>
                <Yorliq matn={tr('Qaysi hisobdan')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
                  {faolHisoblar.map((h) => (
                    <Chip key={h.id} matn={h.nom} tanlangan={h.id === hisobId} bos={() => setHisobId(h.id)} />
                  ))}
                </ScrollView>
              </>
            )}

            {/* ---------- Izoh ---------- */}
            {/* Valyuta — faqat BITTADAN ORTIQ bo‘lsa ko‘rinadi:
                bitta valyutada ishlaydigan odamga ortiqcha qator. */}
            {valyutalar.length > 1 && (
              <>
                <Yorliq matn={tr('Valyuta')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: O.chekka }}>
                  {valyutalar.map((v) => (
                    <Chip
                      key={v.valyuta}
                      matn={v.valyuta}
                      tanlangan={v.valyuta === valyuta}
                      bos={() => {
                        setValyuta(v.valyuta);
                        setQoldaTanlandi(true);
                      }}
                    />
                  ))}
                </ScrollView>
              </>
            )}
            <Yorliq matn={tr('Izoh')} />
            <View style={{ paddingHorizontal: O.chekka }}>
              <TextInput
                style={maydon}
                value={izoh}
                onChangeText={setIzoh}
                placeholder={tr('Nima uchun')}
                placeholderTextColor={C.xira}
              />
            </View>

            {/* Muddat — tovar va qarzda. Pul harakatida ham
                kerak bolishi mumkin, lekin bu yerda bitim
                ozining muddatiga ega. */}
            <View style={{ paddingHorizontal: O.chekka, marginTop: 14 }}>
              <MuddatMaydoni
                qiymat={muddat}
                setQiymat={setMuddat}
                izoh={tr('Qachonga kelishdingiz')}
              />
            </View>

            {/* ---------- Natija ---------- */}
            {klient && jamiTiyin > 0 && (
              <View style={{ paddingHorizontal: O.chekka, marginTop: 16 }}>
                <Karta>
                  <Text style={{ color: C.xira, fontSize: 12 }}>{tr('Shundan keyin')}</Text>
                  <Text style={{ color: C.matn, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
                    {yonalish === 'berdim'
                      ? `${klient.ism} ${tr('sizga qarzdor bo‘ladi')}: ${formatla(jamiTiyin, valyuta)}`
                      : `${tr('Siz qarzdor bo‘lasiz')}: ${formatla(jamiTiyin, valyuta)}`}
                  </Text>
                  {tovarmi && (
                    <Text style={{ color: C.xira, fontSize: 12, marginTop: 6 }}>
                      {tr('Kassaga tegmaydi — bu faqat qarz')}
                    </Text>
                  )}
                </Karta>
              </View>
            )}

            {xato && (
              <Text style={{ color: C.chiqim, fontSize: 13, paddingHorizontal: O.chekka, marginTop: 12 }}>
                {xato}
              </Text>
            )}

            <View style={{ paddingHorizontal: O.chekka, marginTop: 18 }}>
              <Tugma matn={tr('Saqlash')} bos={yubor} kutmoqda={saqlanmoqda} rang={rang} />
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
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {matn}
    </Text>
  );
}
