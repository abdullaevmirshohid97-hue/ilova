// =============================================================
//  YANA — hisoblar, turkumlar, hisobot, sozlama
//
//  Kam ishlatiladigan, lekin kerak bo'ladigan hamma narsa shu yerda.
//  Ichki ekranlar alohida fayl qilinmadi: ular kichik va bir-biriga
//  yaqin, alohida fayl ochilsa har birida bir xil qobiq takrorlanardi.
// =============================================================

import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { davrYigindi, formatla, hisobQoldiq, ifodaHisobla, tiyinga } from '@ilova/kassa-yadro';
import type { Hisob, Turkum } from '@ilova/kassa-yadro';
import {
  biznesNomiQoy,
  hisobniOchir,
  hisobQosh,
  hisobTahrirla,
  turkumQosh,
  turkumTahrirla,
} from '../lib/baza';
import { davrOraligi, oraliqdami, type DavrTuri } from '../lib/davr';
import AiModel from './AiModel';
import AiUlanish from './AiUlanish';
import { hisobotPdf, hisobotXlsx } from '../lib/hisobot';
import { ulash } from '../lib/ulash';
import { useHolat } from '../lib/holat';
import { supabase, xatoMatn } from '../lib/supabase';
import { O, useTema, type TemaRejimi } from '../lib/tema';
import { BoshHolat, Chip, DavrOqlari, Karta, Qator, Sarlavha, Tanlagich, Tugma, YigindiPaneli, uslublar } from '../ui/qismlar';

type Sahifa = 'asosiy' | 'hisoblar' | 'turkumlar' | 'hisobot' | 'sozlama' | 'ai' | 'aimodel';

export default function YanaEkrani({ kochirma }: { kochirma: () => void }) {
  const { C } = useTema();
  const s = uslublar(C);
  const [sahifa, setSahifa] = useState<Sahifa>('asosiy');
  const { men, hisoblar, yozuvlar } = useHolat();

  if (sahifa !== 'asosiy') {
    const sarlavhalar: Record<Exclude<Sahifa, 'asosiy'>, string> = {
      hisoblar: 'Hisoblar',
      turkumlar: 'Turkumlar',
      hisobot: 'Hisobot',
      sozlama: 'Sozlamalar',
      ai: 'AI ulanish',
      aimodel: 'AI modeli',
    };
    return (
      <View style={s.ekran}>
        <View style={[s.boshliq, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <TouchableOpacity onPress={() => setSahifa('asosiy')} hitSlop={12}>
            <Text style={{ color: C.tunMatn, fontSize: 20, fontWeight: '700' }}>‹</Text>
          </TouchableOpacity>
          <Text style={s.boshliqMatn}>{sarlavhalar[sahifa as Exclude<Sahifa, 'asosiy'>]}</Text>
        </View>
        {sahifa === 'hisoblar' && <Hisoblar kochirma={kochirma} />}
        {sahifa === 'turkumlar' && <Turkumlar />}
        {sahifa === 'hisobot' && <Hisobot />}
        {sahifa === 'sozlama' && <Sozlama />}
        {sahifa === 'ai' && <AiUlanish />}
        {sahifa === 'aimodel' && <AiModel />}
      </View>
    );
  }

  const jamiQoldiq = hisoblar
    .filter((h) => h.faol)
    .reduce((yig, h) => yig + hisobQoldiq(h, yozuvlar), 0);

  return (
    <View style={s.ekran}>
      <View style={s.boshliq}>
        <Text style={s.boshliqMatn}>Yana</Text>
        <Text style={s.boshliqIzoh}>{men.biznes}</Text>
      </View>

      <ScrollView>
        <Sarlavha matn="Boshqaruv" />
        <Qator
          nom="Hisoblar"
          izoh={`${hisoblar.filter((h) => h.faol).length} ta · jami ${formatla(jamiQoldiq, hisoblar[0]?.valyuta ?? 'UZS', { kasrsiz: true })}`}
          ong="›"
          bos={() => setSahifa('hisoblar')}
        />
        <Qator nom="Turkumlar" izoh="Kirim va chiqim turkumlari" ong="›" bos={() => setSahifa('turkumlar')} />
        <Qator nom="Hisoblararo o‘tkazma" izoh="Bir hisobdan ikkinchisiga" ong="›" bos={kochirma} />

        <Sarlavha matn="Tahlil" />
        <Qator nom="Hisobot" izoh="Davr, turkum va hisob kesimida" ong="›" bos={() => setSahifa('hisobot')} />

        <Sarlavha matn="AI" />
        <Qator
          nom="AI modeli"
          izoh="O‘z obunangizni ulang: Claude, ChatGPT yoki Gemini"
          ong="›"
          bos={() => setSahifa('aimodel')}
        />
        <Qator
          nom="AI ulanish"
          izoh="Sun’iy intellekt agentini daftaringizga ulash"
          ong="›"
          bos={() => setSahifa('ai')}
        />

        <Sarlavha matn="Sozlamalar" />
        <Qator nom="Sozlamalar" izoh="Biznes nomi, ko‘rinish, chiqish" ong="›" bos={() => setSahifa('sozlama')} />

        <View style={{ padding: O.chekka, paddingTop: 24 }}>
          <Text style={{ color: C.xira, fontSize: 12, textAlign: 'center' }}>
            Credit Debit · Yukchibolla platformasi
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// =============================================================
//  HISOBLAR
// =============================================================
function Hisoblar({ kochirma }: { kochirma: () => void }) {
  const { C } = useTema();
  const { hisoblar, yozuvlar, yangila } = useHolat();
  const [oyna, setOyna] = useState<Hisob | 'yangi' | null>(null);

  return (
    <>
      <ScrollView style={{ flex: 1 }}>
        {hisoblar.map((h) => (
          <Qator
            key={h.id}
            nom={h.nom}
            izoh={`${h.turi}${h.faol ? '' : ' · yashirilgan'}`}
            ong={formatla(hisobQoldiq(h, yozuvlar), h.valyuta, { kasrsiz: true })}
            ongIzoh={h.valyuta}
            sozilgan={!h.faol}
            bos={() => setOyna(h)}
          />
        ))}
        {hisoblar.length === 0 && <BoshHolat belgi="□" matn="Hisob yo‘q" />}
        <View style={{ height: 12 }} />
      </ScrollView>
      <View style={{ padding: 10, gap: 8, backgroundColor: C.karta }}>
        <Tugma matn="+ Hisob qo‘shish" bos={() => setOyna('yangi')} />
        <Tugma matn="Hisoblararo o‘tkazma" ikkilamchi bos={kochirma} />
      </View>
      {oyna && (
        <HisobOynasi
          hisob={oyna === 'yangi' ? null : oyna}
          yopish={() => setOyna(null)}
          saqlandi={async () => {
            setOyna(null);
            await yangila();
          }}
        />
      )}
    </>
  );
}

function HisobOynasi({
  hisob,
  yopish,
  saqlandi,
}: {
  hisob: Hisob | null;
  yopish: () => void;
  saqlandi: () => void;
}) {
  const { C } = useTema();
  const [nom, setNom] = useState(hisob?.nom ?? '');
  const [turi, setTuri] = useState<Hisob['turi']>(hisob?.turi ?? 'naqd');
  const [valyuta, setValyuta] = useState<Hisob['valyuta']>(hisob?.valyuta ?? 'UZS');
  const [boshlangich, setBoshlangich] = useState(hisob ? String(hisob.boshlangich / 100) : '');
  const [kutmoqda, setKutmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  async function saqla() {
    if (nom.trim().length < 1) return setXato('Nomni kiriting.');
    const boshTiyin = boshlangich.trim() ? (ifodaHisobla(boshlangich) ?? tiyinga(boshlangich)) : 0;
    setKutmoqda(true);
    try {
      if (hisob) await hisobTahrirla(hisob.id, { nom, turi, boshlangich: boshTiyin });
      else await hisobQosh({ nom, turi, valyuta, boshlangich: boshTiyin });
      saqlandi();
    } catch (e) {
      setXato(xatoMatn(e));
      setKutmoqda(false);
    }
  }

  function yashir() {
    if (!hisob) return;
    Alert.alert(
      hisob.faol ? 'Hisobni yashirish' : 'Hisobni qaytarish',
      hisob.faol
        ? 'Hisob ro‘yxatdan olib tashlanadi. Yozuvlari va qoldig‘i saqlanadi — istalgan vaqt qaytarasiz.'
        : 'Hisob yana ro‘yxatda ko‘rinadi.',
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: hisob.faol ? 'Yashirish' : 'Qaytarish',
          onPress: async () => {
            try {
              await hisobTahrirla(hisob.id, { faol: !hisob.faol });
              saqlandi();
            } catch (e) {
              Alert.alert('Xatolik', xatoMatn(e));
            }
          },
        },
      ],
    );
  }

  const maydon = {
    backgroundColor: C.fon,
    borderWidth: 1,
    borderColor: C.chegara,
    borderRadius: O.radiusKichik,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: C.matn,
    marginTop: 8,
  };

  return (
    <Modal visible animationType="slide" onRequestClose={yopish} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(11,18,26,0.5)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: C.karta,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: O.chekka,
            paddingBottom: 28,
            width: '100%',
            maxWidth: 520,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, color: C.matn, fontSize: 17, fontWeight: '800' }}>
              {hisob ? 'Hisobni tahrirlash' : 'Yangi hisob'}
            </Text>
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={{ color: C.matn2, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12 }}>Nom</Text>
          <TextInput style={maydon} value={nom} onChangeText={setNom} placeholder="Naqd, Karta, Bank..." placeholderTextColor={C.xira} />

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12, marginBottom: 4 }}>Turi</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0 }}>
            {(['naqd', 'karta', 'bank', 'boshqa'] as const).map((t) => (
              <Chip key={t} matn={t} tanlangan={turi === t} bos={() => setTuri(t)} />
            ))}
          </View>

          {!hisob && (
            <>
              <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12, marginBottom: 4 }}>Valyuta</Text>
              <View style={{ flexDirection: 'row' }}>
                {(['UZS', 'USD'] as const).map((v) => (
                  <Chip key={v} matn={v} tanlangan={valyuta === v} bos={() => setValyuta(v)} />
                ))}
              </View>
            </>
          )}

          <Text style={{ color: C.matn2, fontSize: 13, marginTop: 12 }}>
            Boshlang‘ich qoldiq{hisob ? '' : ' (hozir hisobda qancha bor)'}
          </Text>
          <TextInput
            style={maydon}
            value={boshlangich}
            onChangeText={setBoshlangich}
            placeholder="0"
            placeholderTextColor={C.xira}
            keyboardType="numeric"
          />

          {xato && <Text style={{ color: C.chiqim, fontSize: 13, marginTop: 12 }}>{xato}</Text>}

          <Tugma matn="Saqlash" bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 18 }} />
          {hisob && (
            <TouchableOpacity onPress={yashir} style={{ alignItems: 'center', marginTop: 14 }}>
              <Text style={{ color: C.xira, fontSize: 13 }}>
                {hisob.faol ? 'Hisobni yashirish' : 'Hisobni qaytarish'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// =============================================================
//  TURKUMLAR
// =============================================================
function Turkumlar() {
  const { C } = useTema();
  const { turkumlar, yozuvlar, yangila } = useHolat();
  const [turi, setTuri] = useState<Turkum['turi']>('chiqim');
  const [yangiNom, setYangiNom] = useState('');
  const [kutmoqda, setKutmoqda] = useState(false);

  const royxat = turkumlar.filter((t) => t.turi === turi);

  async function qosh() {
    if (yangiNom.trim().length < 2) return;
    setKutmoqda(true);
    try {
      await turkumQosh(yangiNom, turi);
      setYangiNom('');
      await yangila();
    } catch (e) {
      Alert.alert('Xatolik', xatoMatn(e));
    } finally {
      setKutmoqda(false);
    }
  }

  function yashir(t: Turkum) {
    Alert.alert('Turkumni yashirish', `«${t.nom}» yangi yozuvlarda ko‘rinmaydi. Eski yozuvlar o‘zgarmaydi.`, [
      { text: 'Yo‘q', style: 'cancel' },
      {
        text: 'Yashirish',
        onPress: async () => {
          try {
            await turkumTahrirla(t.id, { faol: false });
            await yangila();
          } catch (e) {
            Alert.alert('Xatolik', xatoMatn(e));
          }
        },
      },
    ]);
  }

  return (
    <>
      <View style={{ backgroundColor: C.karta }}>
        <Tanlagich
          qiymat={turi}
          variantlar={[
            { kalit: 'chiqim' as const, matn: 'Chiqim' },
            { kalit: 'kirim' as const, matn: 'Kirim' },
          ]}
          qoy={setTuri}
        />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {royxat.map((t) => {
          const soni = yozuvlar.filter((y) => y.turkum_id === t.id && !y.bekor_at).length;
          return (
            <Qator
              key={t.id}
              nom={t.nom}
              izoh={`${soni} ta yozuv`}
              ong={t.faol ? '' : 'yashirilgan'}
              sozilgan={!t.faol}
              uzoqBos={() => t.faol && yashir(t)}
            />
          );
        })}
        {royxat.length === 0 && <BoshHolat belgi="□" matn="Turkum yo‘q" izoh="Pastdan qo‘shing" />}
        <View style={{ height: 12 }} />
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: C.karta }}>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: C.fon,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            color: C.matn,
          }}
          value={yangiNom}
          onChangeText={setYangiNom}
          placeholder={turi === 'chiqim' ? 'Yangi chiqim turkumi' : 'Yangi kirim turkumi'}
          placeholderTextColor={C.xira}
        />
        <Tugma matn="Qo‘shish" bos={qosh} kutmoqda={kutmoqda} uslub={{ paddingHorizontal: 18 }} />
      </View>
      <Text style={{ color: C.xira, fontSize: 11, textAlign: 'center', paddingBottom: 10, backgroundColor: C.karta }}>
        Turkumni yashirish uchun uzoq bosing
      </Text>
    </>
  );
}

// =============================================================
//  HISOBOT
// =============================================================
function Hisobot() {
  const { C } = useTema();
  const { men, yozuvlar, turkumlar, hisoblar, klientlar } = useHolat();
  const [davr, setDavr] = useState<DavrTuri>('oy');
  const [siljish, setSiljish] = useState(0);
  const [chiqarmoqda, setChiqarmoqda] = useState<'xlsx' | 'pdf' | null>(null);

  const oraliq = useMemo(() => davrOraligi(davr, siljish), [davr, siljish]);
  const davrniki = useMemo(() => yozuvlar.filter((y) => oraliqdami(y.sana, oraliq)), [yozuvlar, oraliq]);
  const yigindi = useMemo(() => davrYigindi(davrniki), [davrniki]);
  const valyuta = hisoblar[0]?.valyuta ?? 'UZS';

  const turkumKesimi = useMemo(() => {
    const m = new Map<string, { nom: string; turi: string; summa: number }>();
    for (const y of davrniki) {
      if (y.bekor_at || y.kochirma_id) continue;
      const kalit = y.turkum_id ?? `yoq-${y.turi}`;
      const nom = turkumlar.find((t) => t.id === y.turkum_id)?.nom ?? 'Turkumsiz';
      const bor = m.get(kalit) ?? { nom, turi: y.turi, summa: 0 };
      bor.summa += y.summa;
      m.set(kalit, bor);
    }
    return [...m.values()].sort((a, b) => b.summa - a.summa);
  }, [davrniki, turkumlar]);

  const chiqimlar = turkumKesimi.filter((t) => t.turi === 'chiqim');
  const kirimlar = turkumKesimi.filter((t) => t.turi === 'kirim');
  const engKatta = Math.max(1, ...turkumKesimi.map((t) => t.summa));

  async function chiqar(tur: 'xlsx' | 'pdf') {
    if (davrniki.length === 0) {
      Alert.alert('Bo‘sh hisobot', 'Bu davrda yozuv yo‘q — avval davrni almashtiring.');
      return;
    }
    setChiqarmoqda(tur);
    try {
      const manba = {
        biznes: men.biznes,
        davr: oraliq.nom,
        yozuvlar: davrniki,
        hisoblar,
        turkumlar,
        klientlar,
      };
      const bayt = tur === 'xlsx' ? hisobotXlsx(manba) : hisobotPdf(manba);
      await ulash(`${men.biznes}-${oraliq.nom}`, bayt, tur);
    } catch (e) {
      Alert.alert('Chiqarib bo‘lmadi', xatoMatn(e));
    } finally {
      setChiqarmoqda(null);
    }
  }

  return (
    <>
      <View style={{ backgroundColor: C.karta }}>
        <Tanlagich
          qiymat={davr}
          variantlar={[
            { kalit: 'kun' as const, matn: 'Kunlik' },
            { kalit: 'hafta' as const, matn: 'Haftalik' },
            { kalit: 'oy' as const, matn: 'Oylik' },
            { kalit: 'hammasi' as const, matn: 'Hammasi' },
          ]}
          qoy={(k) => {
            setDavr(k);
            setSiljish(0);
          }}
        />
      </View>
      {davr !== 'hammasi' && (
        <DavrOqlari
          nom={oraliq.nom}
          oldin={() => setSiljish((x) => x - 1)}
          keyin={() => setSiljish((x) => Math.min(0, x + 1))}
          keyinOchiq={siljish < 0}
        />
      )}

      <ScrollView style={{ flex: 1 }}>
        {turkumKesimi.length === 0 ? (
          <BoshHolat belgi="▤" matn="Bu davrda yozuv yo‘q" />
        ) : (
          <>
            <Sarlavha matn="Chiqim turkumlari" />
            {chiqimlar.length === 0 && (
              <Text style={{ color: C.xira, fontSize: 13, paddingHorizontal: O.chekka }}>Chiqim yo‘q</Text>
            )}
            {chiqimlar.map((t) => (
              <UstunQator key={t.nom + t.turi} nom={t.nom} summa={t.summa} eng={engKatta} rang={C.chiqim} valyuta={valyuta} />
            ))}

            <Sarlavha matn="Kirim turkumlari" />
            {kirimlar.length === 0 && (
              <Text style={{ color: C.xira, fontSize: 13, paddingHorizontal: O.chekka }}>Kirim yo‘q</Text>
            )}
            {kirimlar.map((t) => (
              <UstunQator key={t.nom + t.turi} nom={t.nom} summa={t.summa} eng={engKatta} rang={C.kirim} valyuta={valyuta} />
            ))}

            <Sarlavha matn="Hisoblar" />
            <View style={{ paddingHorizontal: O.chekka, gap: 8 }}>
              {hisoblar
                .filter((h) => h.faol)
                .map((h) => {
                  const shu = davrniki.filter((y) => y.hisob_id === h.id);
                  const yg = davrYigindi(shu, { kochirmalarHam: true });
                  return (
                    <Karta key={h.id} uslub={{ paddingVertical: 12 }}>
                      <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>{h.nom}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 6, gap: 16 }}>
                        <Text style={{ color: C.kirim, fontSize: 13 }}>
                          ↑ {formatla(yg.kirim, h.valyuta, { belgisiz: true, kasrsiz: true })}
                        </Text>
                        <Text style={{ color: C.chiqim, fontSize: 13 }}>
                          ↓ {formatla(yg.chiqim, h.valyuta, { belgisiz: true, kasrsiz: true })}
                        </Text>
                        <Text style={{ color: C.matn2, fontSize: 13, marginLeft: 'auto' }}>
                          {formatla(hisobQoldiq(h, yozuvlar), h.valyuta, { belgisiz: true, kasrsiz: true })}
                        </Text>
                      </View>
                    </Karta>
                  );
                })}
            </View>
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Eksport — hisobot ekranining asosiy maqsadi: buxgalterga
          yoki hamkorga yuborish. Fayl qurilmada yasaladi. */}
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, backgroundColor: C.karta }}>
        <Tugma
          matn="Excel"
          ikkilamchi
          kutmoqda={chiqarmoqda === 'xlsx'}
          bos={() => chiqar('xlsx')}
          uslub={{ flex: 1 }}
        />
        <Tugma
          matn="PDF"
          ikkilamchi
          kutmoqda={chiqarmoqda === 'pdf'}
          bos={() => chiqar('pdf')}
          uslub={{ flex: 1 }}
        />
      </View>

      <YigindiPaneli
        chap={{ yorliq: 'Kirim', qiymat: formatla(yigindi.kirim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.kirim }}
        orta={{ yorliq: 'Chiqim', qiymat: formatla(yigindi.chiqim, valyuta, { belgisiz: true, kasrsiz: true }), rang: C.chiqim }}
        ong={{
          yorliq: 'Farq',
          qiymat: formatla(yigindi.farq, valyuta, { belgisiz: true, kasrsiz: true }),
          rang: yigindi.farq >= 0 ? C.kirim : C.chiqim,
        }}
      />
    </>
  );
}

function UstunQator({
  nom,
  summa,
  eng,
  rang,
  valyuta,
}: {
  nom: string;
  summa: number;
  eng: number;
  rang: string;
  valyuta: Hisob['valyuta'];
}) {
  const { C } = useTema();
  return (
    <View style={{ paddingHorizontal: O.chekka, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: C.matn, fontSize: 14 }}>{nom}</Text>
        <Text style={{ color: C.matn, fontSize: 14, fontWeight: '700' }}>
          {formatla(summa, valyuta, { belgisiz: true, kasrsiz: true })}
        </Text>
      </View>
      {/* Ustun uzunligi — eng kattasiga nisbatan. Raqamni o'qimasdan
          ham qaysi turkum og'irligi ko'rinadi. */}
      <View style={{ height: 6, backgroundColor: C.ajratgich, borderRadius: 3 }}>
        <View style={{ height: 6, width: `${Math.max(2, (summa / eng) * 100)}%`, backgroundColor: rang, borderRadius: 3 }} />
      </View>
    </View>
  );
}

// =============================================================
//  SOZLAMA
// =============================================================
function Sozlama() {
  const { C, rejim, qoy } = useTema();
  const { men, nomniQoy } = useHolat();
  const [nom, setNom] = useState(men.biznes);
  const [kutmoqda, setKutmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  async function saqla() {
    setKutmoqda(true);
    setXabar(null);
    try {
      const yangi = await biznesNomiQoy(nom);
      nomniQoy(yangi);
      setXabar('Saqlandi');
    } catch (e) {
      setXabar(xatoMatn(e));
    } finally {
      setKutmoqda(false);
    }
  }

  /**
   * Hisobni o'chirish — IKKI QADAM.
   *
   * Bitta "ishonchingiz komilmi" yetarli emas: odam odatlanib,
   * o'qimasdan bosadi. Ikkinchi oynada nima yo'qolishi ro'yxat
   * bilan yoziladi va tugma matni ham boshqacha.
   */
  function ochirishniBoshla() {
    Alert.alert(
      'Hisobni o‘chirish',
      `«${men.biznes}» va undagi hamma narsa o‘chadi:\n\n` +
        '· hisoblar va ularning qoldig‘i\n' +
        '· hamma kirim va chiqim yozuvlari\n' +
        '· kontaktlar va qarz tarixi\n' +
        '· kirish hisobingiz\n\n' +
        'Qaytarib bo‘lmaydi. Avval hisobotni Excel’ga chiqarib olishni maslahat beramiz.',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        { text: 'Davom etish', style: 'destructive', onPress: ochirishniTasdiqla },
      ],
    );
  }

  function ochirishniTasdiqla() {
    Alert.alert(
      'Oxirgi tasdiq',
      'Ma’lumot butunlay yo‘q qilinadi. Davom etasizmi?',
      [
        { text: 'Yo‘q', style: 'cancel' },
        {
          text: 'Ha, o‘chirilsin',
          style: 'destructive',
          onPress: async () => {
            setKutmoqda(true);
            try {
              const natija = await hisobniOchir();
              // Sessiyani ham tozalaymiz: auth hisobi allaqachon yo'q,
              // lekin qurilmadagi token qolib, ilova "xato" ekranida
              // osilib turardi.
              await supabase.auth.signOut();
              Alert.alert(
                'O‘chirildi',
                `${natija.tashkilot ?? 'Hisob'} va ${natija.yozuvlar} ta yozuv o‘chirildi.`,
              );
            } catch (e) {
              Alert.alert('O‘chirilmadi', xatoMatn(e));
            } finally {
              setKutmoqda(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1 }}>
      <Sarlavha matn="Biznes" />
      <View style={{ paddingHorizontal: O.chekka }}>
        <TextInput
          style={{
            backgroundColor: C.karta,
            borderWidth: 1,
            borderColor: C.chegara,
            borderRadius: O.radiusKichik,
            paddingHorizontal: 12,
            paddingVertical: 11,
            fontSize: 15,
            color: C.matn,
          }}
          value={nom}
          onChangeText={setNom}
          placeholder="Biznes nomi"
          placeholderTextColor={C.xira}
        />
        {xabar && (
          <Text style={{ color: xabar === 'Saqlandi' ? C.kirim : C.chiqim, fontSize: 13, marginTop: 8 }}>
            {xabar}
          </Text>
        )}
        <Tugma matn="Nomni saqlash" bos={saqla} kutmoqda={kutmoqda} uslub={{ marginTop: 10 }} />
      </View>

      <Sarlavha matn="Ko‘rinish" />
      <View style={{ flexDirection: 'row', paddingHorizontal: O.chekka }}>
        {(
          [
            { k: 'tizim', m: 'Tizim' },
            { k: 'yorug', m: 'Yorug‘' },
            { k: 'qorongi', m: 'Tungi' },
          ] as { k: TemaRejimi; m: string }[]
        ).map((v) => (
          <Chip key={v.k} matn={v.m} tanlangan={rejim === v.k} bos={() => qoy(v.k)} />
        ))}
      </View>

      <Sarlavha matn="Hisob" />
      <Qator nom="Tashkilot" izoh={men.biznes} ong={men.obuna} />
      <Qator nom="Rol" izoh={men.rol === 'admin' ? 'Administrator' : men.rol} />
      <Qator
        nom="Chiqish"
        izoh="Boshqa hisob bilan kirish"
        bos={() =>
          Alert.alert('Chiqish', 'Hisobdan chiqasizmi?', [
            { text: 'Yo‘q', style: 'cancel' },
            { text: 'Chiqish', style: 'destructive', onPress: () => supabase.auth.signOut() },
          ])
        }
      />

      <Sarlavha matn="Xavfli zona" />
      <Qator
        nom="Hisobni o‘chirish"
        izoh="Tashkilot, hisoblar, yozuvlar va kontaktlar — hammasi"
        ongRang={C.chiqim}
        ong="›"
        bos={ochirishniBoshla}
      />

      <View style={{ padding: O.chekka, paddingTop: 20 }}>
        <Text style={{ color: C.xira, fontSize: 11, lineHeight: 17 }}>
          Ma'lumotlaringiz bulutda saqlanadi va faqat sizga ko‘rinadi. Hisobni
          o‘chirsangiz, ular butunlay yo‘q qilinadi va qaytarib bo‘lmaydi.
        </Text>
      </View>
    </ScrollView>
  );
}
