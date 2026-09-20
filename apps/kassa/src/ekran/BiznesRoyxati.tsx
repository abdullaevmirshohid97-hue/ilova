// =============================================================
//  BIZNESLAR — tanlash, qo'shish, nomini o'zgartirish
//
//  Do'kondorda ko'pincha ikki-uch nuqta bo'ladi va ularning
//  daftari ALOHIDA yuritilishi kerak: bir kassaga qo'shib
//  yuborilsa, qaysi do'kon foyda qilayotgani ko'rinmay qoladi.
//
//  BIZNES ALMASHGANDA ILOVA QAYTA YUKLANADI. Sabab: qurilmadagi
//  ombor tozalanadi (`biznesTanla` shuni qiladi) va ekranda
//  turgan hamma ro'yxat bir zumda eskirib qoladi. Qismlarni
//  birma-bir yangilashga urinish — yarmi yangi, yarmi eski
//  ma'lumot ko'rsatadigan holatga olib borardi.
//
//  Ro'yxat RAQAMLANGAN: «uchinchi do'kon» deb eslab qolish
//  nomni o'qishdan tez, va do'konlar nomi ko'pincha o'xshash
//  bo'ladi («Baraka 1», «Baraka 2»).
// =============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bizneslarOl, biznesNomi, biznesQosh, biznesTanla, type Biznes } from '../lib/baza';
import { xatoMatn } from '../lib/supabase';
import { O, useTema } from '../lib/tema';
import { tr, trn } from '../lib/til';
import { Dokon, Lupa, Orqaga, Ruchka } from '../ui/ikonka';
import { BoshHolat, Tugma } from '../ui/qismlar';

export default function BiznesRoyxati({
  yopish,
  almashdi,
}: {
  yopish: () => void;
  /** Biznes almashdi yoki qo'shildi — qobiq ilovani qayta yuklaydi */
  almashdi: () => void;
}) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();

  const [royxat, setRoyxat] = useState<Biznes[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [tahrir, setTahrir] = useState(false);
  const [band, setBand] = useState(false);
  const [qoshish, setQoshish] = useState(false);
  const [yangiNom, setYangiNom] = useState('');
  // Nomini o'zgartirish: qaysi biznes va qanday nom
  const [nomOyna, setNomOyna] = useState<{ id: string; nom: string } | null>(null);

  useEffect(() => {
    bizneslarOl()
      .then(setRoyxat)
      .catch((e) => {
        setRoyxat([]);
        setXato(xatoMatn(e));
      });
  }, []);

  const korinadigan = useMemo(() => {
    const q = qidiruv.trim().toLowerCase();
    if (!q) return royxat ?? [];
    return (royxat ?? []).filter((b) => b.nom.toLowerCase().includes(q));
  }, [royxat, qidiruv]);

  async function tanla(b: Biznes) {
    if (b.joriymi || band) return;
    setBand(true);
    try {
      await biznesTanla(b.org_id);
      almashdi();
    } catch (e) {
      setBand(false);
      Alert.alert(tr('Biznes almashmadi'), xatoMatn(e));
    }
  }

  async function qoshamiz() {
    const nom = yangiNom.trim();
    if (nom.length < 2) return;
    setBand(true);
    try {
      await biznesQosh(nom);
      setQoshish(false);
      almashdi();
    } catch (e) {
      setBand(false);
      Alert.alert(tr('Biznes qo‘shilmadi'), xatoMatn(e));
    }
  }

  async function nomniSaqla() {
    if (!nomOyna) return;
    const nom = nomOyna.nom.trim();
    if (nom.length < 2) return;
    setBand(true);
    try {
      const yangi = await biznesNomi(nomOyna.id, nom);
      setRoyxat((r) => (r ?? []).map((b) => (b.org_id === nomOyna.id ? { ...b, nom: yangi } : b)));
      setNomOyna(null);
    } catch (e) {
      Alert.alert(tr('Nom o‘zgarmadi'), xatoMatn(e));
    } finally {
      setBand(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.fon }}>
      {/* Sarlavha: chapda orqaga, o'rtada do'kon belgisi va nomi,
          o'ngda ruchka. */}
      <View
        style={{
          backgroundColor: C.tun,
          paddingTop: chekka.top + 8,
          paddingBottom: 10,
          paddingHorizontal: O.chekka - 4,
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: C.ajratgich,
        }}
      >
        <TouchableOpacity onPress={yopish} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Orqaga">
          <Orqaga rang={C.tunMatn} />
        </TouchableOpacity>

        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Dokon rang={C.tunMatn} olcham={18} />
          <Text style={{ color: C.tunMatn, fontSize: 17, fontWeight: '700' }}>{tr('Biznes')}</Text>
        </View>

        {/* Ruchka TUGMA holatini almashtiradi, darhol tahrirlamaydi:
            ro'yxatda tasodifan nomni o'zgartirib yubormaslik uchun. */}
        <TouchableOpacity
          onPress={() => setTahrir((x) => !x)}
          hitSlop={10}
          style={{
            padding: 8,
            borderRadius: 8,
            backgroundColor: tahrir ? C.ajratgich : 'transparent',
          }}
          accessibilityLabel="Tahrirlash"
        >
          <Ruchka rang={tahrir ? C.matn : C.tunMatn} />
        </TouchableOpacity>
      </View>

      {/* Qidiruv — sarlavhaning pastki qatorida */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: O.chekka,
          paddingVertical: 10,
          backgroundColor: C.karta,
          borderBottomWidth: 1,
          borderBottomColor: C.ajratgich,
        }}
      >
        <Lupa rang={C.xira} olcham={18} />
        <TextInput
          value={qidiruv}
          onChangeText={setQidiruv}
          placeholder={tr('Biznes nomi')}
          placeholderTextColor={C.xira}
          style={{ flex: 1, fontSize: 15, color: C.matn, paddingVertical: 4 }}
        />
        {qidiruv.length > 0 && (
          <TouchableOpacity onPress={() => setQidiruv('')} hitSlop={10}>
            <Text style={{ color: C.xira, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {tahrir && (
        <Text
          style={{
            color: C.matn2,
            fontSize: 12,
            paddingHorizontal: O.chekka,
            paddingTop: 10,
          }}
        >
          {tr('Nomini o‘zgartirish uchun biznesni bosing')}
        </Text>
      )}

      {royxat === null ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator color={C.xira} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: chekka.bottom + 24 }}>
          {xato && (
            <Text style={{ color: C.chiqim, fontSize: 13, padding: O.chekka }}>{xato}</Text>
          )}

          {korinadigan.length === 0 ? (
            <BoshHolat
              belgi="⌂"
              matn={qidiruv ? tr('Topilmadi') : tr('Biznes yo‘q')}
              izoh={qidiruv ? tr('Boshqa so‘z bilan qidirib ko‘ring') : undefined}
            />
          ) : (
            korinadigan.map((b, i) => (
              <TouchableOpacity
                key={b.org_id}
                disabled={band}
                onPress={() => (tahrir ? setNomOyna({ id: b.org_id, nom: b.nom }) : tanla(b))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingHorizontal: O.chekka,
                  paddingVertical: 15,
                  backgroundColor: C.karta,
                  borderBottomWidth: 1,
                  borderBottomColor: C.ajratgich,
                  opacity: band ? 0.5 : 1,
                }}
              >
                {/* Tartib raqami — «uchinchi do'kon» deb eslab qolish
                    nomni o'qishdan tez. Qidiruvda ham RO'YXATDAGI
                    o'rni ko'rsatiladi, umumiy raqami emas: ekranda
                    3-qator turib «5» deb yozilsa chalkashardi. */}
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: b.joriymi ? C.faol : C.ajratgich,
                  }}
                >
                  <Text
                    style={{
                      color: b.joriymi ? C.faolMatn : C.matn2,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: C.matn, fontSize: 15, fontWeight: b.joriymi ? '700' : '500' }}
                    numberOfLines={1}
                  >
                    {b.nom}
                  </Text>
                  {b.obuna && b.obuna !== 'active' && (
                    <Text style={{ color: C.xira, fontSize: 11, marginTop: 3 }}>{b.obuna}</Text>
                  )}
                </View>

                {tahrir ? (
                  <Ruchka rang={C.xira} olcham={16} />
                ) : b.joriymi ? (
                  <Text style={{ color: C.kirim, fontSize: 16, fontWeight: '700' }}>✓</Text>
                ) : (
                  <Text style={{ color: C.matn2, fontSize: 18 }}>›</Text>
                )}
              </TouchableOpacity>
            ))
          )}

          <View style={{ padding: O.chekka, paddingTop: 20 }}>
            <Tugma
              matn={tr('+ Biznes qo‘shish')}
              ikkilamchi
              bos={() => {
                setYangiNom('');
                setQoshish(true);
              }}
            />
            <Text style={{ color: C.xira, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              {trn('{n} ta biznes', royxat.length)}
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Yangi biznes */}
      {qoshish && (
        <NomOynasi
          sarlavha={tr('Yangi biznes')}
          izoh={tr('Yangi daftar ochiladi — eski biznesga tegmaydi')}
          qiymat={yangiNom}
          setQiymat={setYangiNom}
          band={band}
          yop={() => setQoshish(false)}
          saqla={qoshamiz}
        />
      )}

      {/* Nomini o'zgartirish */}
      {nomOyna && (
        <NomOynasi
          sarlavha={tr('Biznes nomi')}
          qiymat={nomOyna.nom}
          setQiymat={(v) => setNomOyna((x) => (x ? { ...x, nom: v } : x))}
          band={band}
          yop={() => setNomOyna(null)}
          saqla={nomniSaqla}
        />
      )}
    </View>
  );
}

/** Nom so'raydigan kichik oyna — qo'shishda ham, tahrirda ham bir xil */
function NomOynasi({
  sarlavha,
  izoh,
  qiymat,
  setQiymat,
  band,
  yop,
  saqla,
}: {
  sarlavha: string;
  izoh?: string;
  qiymat: string;
  setQiymat: (v: string) => void;
  band: boolean;
  yop: () => void;
  saqla: () => void;
}) {
  const { C } = useTema();
  return (
    <Modal transparent animationType="fade" onRequestClose={yop}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <View style={{ backgroundColor: C.karta, borderRadius: O.radius, padding: O.chekka }}>
          <Text style={{ color: C.matn, fontSize: 16, fontWeight: '800' }}>{sarlavha}</Text>
          {izoh ? (
            <Text style={{ color: C.xira, fontSize: 12, marginTop: 4 }}>{izoh}</Text>
          ) : null}
          <TextInput
            value={qiymat}
            onChangeText={setQiymat}
            autoFocus
            maxLength={80}
            placeholder={tr('Masalan: Baraka market')}
            placeholderTextColor={C.xira}
            style={{
              marginTop: 14,
              borderWidth: 1,
              borderColor: C.chegara,
              borderRadius: O.radiusKichik,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 15,
              color: C.matn,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Tugma matn={tr('Bekor')} ikkilamchi bos={yop} uslub={{ flex: 1 }} />
            <Tugma
              matn={band ? tr('Saqlanmoqda…') : tr('Saqlash')}
              bos={qiymat.trim().length >= 2 && !band ? saqla : () => {}}
              kutmoqda={band}
              uslub={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
