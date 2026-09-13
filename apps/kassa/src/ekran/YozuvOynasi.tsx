// =============================================================
//  YANGI YOZUV — kirim yoki chiqim
//
//  Eng ko'p ochiladigan ekran. Shuning uchun bitta o'lchov bor:
//  yozuv UCH BOSISHDA kiritilsin — summa, turkum, saqlash. Turkum
//  va hisob oldindan tanlangan holda keladi.
//
//  Klaviatura ILOVANING O'ZIDA (tizim klaviaturasi emas): raqamlar
//  katta, `+ − × ÷` bor. Sabab — bozordagi ilovalardan ko'chirilgan
//  odat: odam "1200+300" deb yozadi va javobini o'zi hisoblamaydi.
// =============================================================

import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatla, ifodaHisobla } from '@ilova/kassa-yadro';
import type { Hisob, Turkum, YozuvTuri } from '@ilova/kassa-yadro';
import { C, O } from '../lib/tema';

const TUGMALAR = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '000', '.', '+'];

export default function YozuvOynasi({
  turi,
  hisoblar,
  turkumlar,
  boshHisob,
  yopish,
  saqla,
}: {
  turi: YozuvTuri;
  hisoblar: Hisob[];
  turkumlar: Turkum[];
  boshHisob: string | null;
  yopish: () => void;
  saqla: (p: { hisob_id: string; summa: number; turkum_id: string | null; izoh: string; sana: string }) => Promise<void>;
}) {
  const [ifoda, setIfoda] = useState('');
  const [hisobId, setHisobId] = useState(boshHisob ?? hisoblar[0]?.id ?? '');
  const [turkumId, setTurkumId] = useState<string | null>(null);
  const [izoh, setIzoh] = useState('');
  const [kecha, setKecha] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const kerakli = useMemo(() => turkumlar.filter((t) => t.turi === turi), [turkumlar, turi]);
  const hisob = hisoblar.find((h) => h.id === hisobId);

  // Ifodani har bosishda hisoblaymiz: odam natijani DARHOL ko'rsin,
  // "=" ni qidirmasin.
  const tiyin = useMemo(() => ifodaHisobla(ifoda.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')), [ifoda]);
  const rang = turi === 'kirim' ? C.kirim : C.chiqim;

  function bos(t: string) {
    setXato(null);
    if (t === '⌫') return setIfoda((x) => x.slice(0, -1));
    // Ketma-ket ikki amal belgisi qo'yilmasin: "12++3" hisoblanmaydi
    if ('+−×÷'.includes(t) && (ifoda === '' || '+−×÷'.includes(ifoda.slice(-1)))) return;
    setIfoda((x) => x + t);
  }

  async function yubor() {
    if (!hisobId) return setXato('Hisobni tanlang.');
    if (tiyin === null || tiyin <= 0) return setXato('Summani kiriting.');
    setSaqlanmoqda(true);
    try {
      const sana = new Date();
      if (kecha) sana.setDate(sana.getDate() - 1);
      await saqla({ hisob_id: hisobId, summa: tiyin, turkum_id: turkumId, izoh, sana: sana.toISOString() });
      yopish();
    } catch (e) {
      setXato((e as { message?: string })?.message ?? 'Saqlanmadi');
      setSaqlanmoqda(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={yopish} transparent>
      <View style={s.orqafon}>
        <View style={s.oyna}>
          <View style={[s.sarlavha, { backgroundColor: rang }]}>
            <TouchableOpacity onPress={yopish} hitSlop={12}>
              <Text style={s.yopish}>✕</Text>
            </TouchableOpacity>
            <Text style={s.sarlavhaMatn}>{turi === 'kirim' ? 'Kirim' : 'Chiqim'}</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Summa */}
            <View style={s.summaQator}>
              <Text style={[s.summa, { color: rang }]} numberOfLines={1} adjustsFontSizeToFit>
                {ifoda || '0'}
              </Text>
              {tiyin !== null && /[+−×÷]/.test(ifoda) && (
                <Text style={s.natija}>= {formatla(tiyin, hisob?.valyuta ?? 'UZS')}</Text>
              )}
            </View>

            {/* Hisob */}
            <Text style={s.yorliq}>Hisob</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chiplar}>
              {hisoblar.filter((h) => h.faol).map((h) => (
                <Chip key={h.id} tanlangan={h.id === hisobId} matn={h.nom} bos={() => setHisobId(h.id)} />
              ))}
            </ScrollView>

            {/* Turkum */}
            <Text style={s.yorliq}>Turkum</Text>
            <View style={s.turkumlar}>
              {kerakli.map((t) => (
                <Chip
                  key={t.id}
                  tanlangan={t.id === turkumId}
                  matn={t.nom}
                  bos={() => setTurkumId(t.id === turkumId ? null : t.id)}
                />
              ))}
              {kerakli.length === 0 && <Text style={s.bosh}>Turkum yo‘q — keyin qo‘shasiz</Text>}
            </View>

            {/* Izoh va sana */}
            <Text style={s.yorliq}>Izoh</Text>
            <TextInput
              style={s.izoh}
              value={izoh}
              onChangeText={setIzoh}
              placeholder="Ixtiyoriy: nima uchun"
              placeholderTextColor={C.xira}
            />

            <View style={s.sanaQator}>
              <Chip tanlangan={!kecha} matn="Bugun" bos={() => setKecha(false)} />
              <Chip tanlangan={kecha} matn="Kecha" bos={() => setKecha(true)} />
            </View>

            {xato && <Text style={s.xato}>{xato}</Text>}

            {/* Klaviatura */}
            <View style={s.klaviatura}>
              {TUGMALAR.map((t) => (
                <Pressable key={t} style={s.tugma} onPress={() => bos(t)}>
                  <Text style={[s.tugmaMatn, '+−×÷'.includes(t) && { color: C.matn2 }]}>{t}</Text>
                </Pressable>
              ))}
              <Pressable style={s.tugma} onPress={() => bos('⌫')} onLongPress={() => setIfoda('')}>
                <Text style={s.tugmaMatn}>⌫</Text>
              </Pressable>
              <Pressable
                style={[s.saqla, { backgroundColor: rang }, saqlanmoqda && { opacity: 0.6 }]}
                onPress={yubor}
                disabled={saqlanmoqda}
              >
                <Text style={s.saqlaMatn}>{saqlanmoqda ? '...' : 'Saqlash'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ matn, tanlangan, bos }: { matn: string; tanlangan: boolean; bos: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, tanlangan && s.chipTanlangan]} onPress={bos}>
      <Text style={[s.chipMatn, tanlangan && s.chipMatnTanlangan]}>{matn}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  orqafon: { flex: 1, backgroundColor: 'rgba(22,32,46,0.45)', justifyContent: 'flex-end' },
  oyna: { backgroundColor: C.fon, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '94%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  sarlavha: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: O.chekka, paddingVertical: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  sarlavhaMatn: { color: '#fff', fontSize: 17, fontWeight: '700' },
  yopish: { color: '#fff', fontSize: 18, fontWeight: '700' },
  summaQator: { paddingHorizontal: O.chekka, paddingTop: 18, paddingBottom: 6 },
  summa: { fontSize: 40, fontWeight: '800', textAlign: 'right' },
  natija: { color: C.xira, fontSize: 14, textAlign: 'right', marginTop: 4 },
  yorliq: { color: C.matn2, fontSize: 13, fontWeight: '600', paddingHorizontal: O.chekka, marginTop: 14, marginBottom: 8 },
  chiplar: { paddingHorizontal: O.chekka, gap: 8 },
  turkumlar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: O.chekka },
  bosh: { color: C.xira, fontSize: 13 },
  chip: {
    backgroundColor: C.karta, borderWidth: 1, borderColor: C.chegara,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 4,
  },
  chipTanlangan: { backgroundColor: C.tun, borderColor: C.tun },
  chipMatn: { color: C.matn2, fontSize: 14 },
  chipMatnTanlangan: { color: '#fff', fontWeight: '600' },
  izoh: {
    marginHorizontal: O.chekka, backgroundColor: C.karta, borderWidth: 1, borderColor: C.chegara,
    borderRadius: O.radiusKichik, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.matn,
  },
  sanaQator: { flexDirection: 'row', paddingHorizontal: O.chekka, marginTop: 12, gap: 8 },
  xato: { color: C.chiqim, fontSize: 13, paddingHorizontal: O.chekka, marginTop: 10 },
  klaviatura: {
    flexDirection: 'row', flexWrap: 'wrap', padding: 8, marginTop: 12,
  },
  tugma: {
    width: '25%', paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  tugmaMatn: { fontSize: 22, fontWeight: '600', color: C.matn },
  saqla: { width: '75%', paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderRadius: O.radiusKichik, margin: 4 },
  saqlaMatn: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
