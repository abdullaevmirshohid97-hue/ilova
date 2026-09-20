// =============================================================
//  BITIMLAR — hamma kirim-chiqim bir ro'yxatda
//
//  Har qatorda: sana, vaqt, mijoz rasmi va ismi, izoh, summa va
//  bu HAQmi yoki QARZmi.
//
//  YIL ham yoziladi. Odatda ilovalar joriy yilni tashlab ketadi,
//  lekin bu daftar yillab yuritiladi va «12.03» degan sana bir
//  necha yilga mos kelib qoladi — bahsda esa aynan yil kerak.
//
//  Pastda to'rtta raqam RANG bilan ajratilgan:
//    qabul qilingan (yashil) · to'langan (qizil) · balans · muddat
//
//  Jami raqamlar KO'RINADIGAN ro'yxat bo'yicha: bu ekranda filtr
//  odamning o'z tanlovi va u aynan tanlagan qismining yig'indisini
//  ko'rmoqchi bo'ladi. Bosh ekranda buning teskarisi — sabab
//  o'sha faylda yozilgan.
// =============================================================

import { useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bitimQoldiq, formatla, kechikkanKun } from '@ilova/kassa-yadro';
import type { Bitim, Klient, Tolov } from '@ilova/kassa-yadro';
import { boshHarflar } from '../lib/rasm';
import { useHolat } from '../lib/holat';
import { O, useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { sanaVaqtToliq } from '../lib/davr';
import { Lupa, Orqaga } from '../ui/ikonka';
import { MijozRasmi } from '../ui/MijozRasmi';
import { BoshHolat } from '../ui/qismlar';

type Qator =
  | { tur: 'bitim'; id: string; sana: string; bitim: Bitim }
  | { tur: 'tolov'; id: string; sana: string; tolov: Tolov };

export default function BitimlarEkrani({ yopish }: { yopish: () => void }) {
  const { C } = useTema();
  const chekka = useSafeAreaInsets();
  const { klientlar, bitimlar, tolovlar } = useHolat();
  const [qidiruv, setQidiruv] = useState('');

  const ismlar = useMemo(() => {
    const m = new Map<string, Klient>();
    for (const k of klientlar) m.set(k.id, k);
    return m;
  }, [klientlar]);

  const qatorlar = useMemo<Qator[]>(() => {
    const q = qidiruv.trim().toLowerCase();
    const mos = (klientId: string, matn: string, summa: number) => {
      if (!q) return true;
      const k = ismlar.get(klientId);
      const ism = [k?.ism, k?.familya].filter(Boolean).join(' ').toLowerCase();
      return (
        ism.includes(q) ||
        matn.toLowerCase().includes(q) ||
        String(Math.round(summa / 100)).includes(q)
      );
    };

    const b: Qator[] = bitimlar
      .filter((x) => mos(x.klient_id, (x.tovar_nom ?? '') + ' ' + (x.izoh ?? ''), x.summa))
      .map((x) => ({ tur: 'bitim', id: x.id, sana: x.sana, bitim: x }));
    const t: Qator[] = tolovlar
      .filter((x) => mos(x.klient_id, x.izoh ?? '', x.summa))
      .map((x) => ({ tur: 'tolov', id: x.id, sana: x.sana, tolov: x }));

    return [...b, ...t].sort((x, y) => Date.parse(y.sana) - Date.parse(x.sana));
  }, [bitimlar, tolovlar, ismlar, qidiruv]);

  /**
   * Pastki jami.
   *
   * QABUL QILINGAN — men bergan tovar/qarz, ya'ni mijoz qabul
   * qilgani. TO'LANGAN — qaytib kelgan pul. Ikkalasi ham MUSBAT
   * son bo'lib ko'rsatiladi, farqi rangda va yorliqda.
   */
  const jami = useMemo(() => {
    let qabul = 0;
    let tolangan = 0;
    let kechikkan = 0;
    for (const q of qatorlar) {
      if (q.tur === 'bitim') {
        if (q.bitim.holat === 'bekor') continue;
        if (q.bitim.yonalish === 'berdim') qabul += q.bitim.summa;
        if (kechikkanKun(q.bitim, tolovlar) > 0) kechikkan += bitimQoldiq(q.bitim, tolovlar);
      } else {
        if (q.tolov.holat === 'bekor') continue;
        if (q.tolov.yonalish === 'oldim') tolangan += q.tolov.summa;
      }
    }
    return { qabul, tolangan, balans: qabul - tolangan, kechikkan };
  }, [qatorlar, tolovlar]);

  const valyuta = bitimlar[0]?.valyuta ?? 'UZS';

  return (
    <Modal animationType="slide" onRequestClose={yopish}>
      <View style={{ flex: 1, backgroundColor: C.fon }}>
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
          <TouchableOpacity onPress={yopish} hitSlop={10} style={{ padding: 8 }}>
            <Orqaga rang={C.tunMatn} />
          </TouchableOpacity>
          <Text style={{ color: C.tunMatn, fontSize: 17, fontWeight: '700', marginLeft: 6 }}>
            {tr('Bitimlar')}
          </Text>
        </View>

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
            placeholder={tr('Mijoz, izoh yoki summa')}
            placeholderTextColor={C.xira}
            style={{ flex: 1, fontSize: 15, color: C.matn, paddingVertical: 4 }}
          />
          {qidiruv.length > 0 && (
            <TouchableOpacity onPress={() => setQidiruv('')} hitSlop={10}>
              <Text style={{ color: C.xira, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ flex: 1 }}>
          {qatorlar.length === 0 ? (
            <BoshHolat
              belgi="≡"
              matn={qidiruv ? tr('Topilmadi') : tr('Bitim yo‘q')}
              izoh={qidiruv ? tr('Boshqa so‘z bilan qidirib ko‘ring') : undefined}
            />
          ) : (
            qatorlar.map((q) =>
              q.tur === 'bitim' ? (
                <BitimQator
                  key={q.id}
                  b={q.bitim}
                  klient={ismlar.get(q.bitim.klient_id)}
                  tolovlar={tolovlar}
                />
              ) : (
                <TolovQator key={q.id} t={q.tolov} klient={ismlar.get(q.tolov.klient_id)} />
              ),
            )
          )}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: C.karta,
            borderTopWidth: 1,
            borderTopColor: C.ajratgich,
            paddingVertical: 10,
            paddingBottom: 10 + chekka.bottom,
          }}
        >
          <Ustun nom={tr('Qabul qilingan')} summa={jami.qabul} rang={C.kirim} valyuta={valyuta} />
          <Ustun nom={tr('To‘langan')} summa={jami.tolangan} rang={C.chiqim} valyuta={valyuta} />
          <Ustun
            nom={tr('Balans')}
            summa={jami.balans}
            rang={jami.balans >= 0 ? C.matn : C.chiqim}
            valyuta={valyuta}
            ishorali
          />
          <Ustun
            nom={tr('Muddati kelgan')}
            summa={jami.kechikkan}
            rang={jami.kechikkan > 0 ? C.ogoh : C.xira}
            valyuta={valyuta}
          />
        </View>
      </View>
    </Modal>
  );
}

function Ustun({
  nom,
  summa,
  rang,
  valyuta,
  ishorali,
}: {
  nom: string;
  summa: number;
  rang: string;
  valyuta: Bitim['valyuta'];
  ishorali?: boolean;
}) {
  const { C } = useTema();
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 3 }}>
      <Text style={{ color: C.xira, fontSize: 10 }} numberOfLines={1}>
        {nom}
      </Text>
      <Text style={{ color: rang, fontSize: 13, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
        {(ishorali && summa < 0 ? '−' : '') +
          formatla(Math.abs(summa), valyuta, { belgisiz: true, kasrsiz: true })}
      </Text>
    </View>
  );
}

function BitimQator({
  b,
  klient,
  tolovlar,
}: {
  b: Bitim;
  klient?: Klient;
  tolovlar: Tolov[];
}) {
  const { C } = useTema();
  // «berdim» = tovar/qarz mendan ketdi = u menga qarzdor = HAQ
  const haq = b.yonalish === 'berdim';
  const kechikdi = kechikkanKun(b, tolovlar);
  const nomi = b.tovar_nom || (b.nima === 'qarz' ? tr('Qarz') : tr('Tovar'));

  return (
    <Qator
      klient={klient}
      sana={b.sana}
      nom={nomi}
      izoh={b.izoh}
      summa={b.summa}
      valyuta={b.valyuta}
      haq={haq}
      yorliq={haq ? tr('HAQ') : tr('QARZ')}
      bekor={b.holat === 'bekor'}
      qoshimcha={
        kechikdi > 0
          ? { matn: tr('muddati o‘tdi'), rang: C.chiqim }
          : b.holat === 'kutilmoqda'
            ? { matn: tr('kutilmoqda'), rang: C.xira }
            : null
      }
    />
  );
}

function TolovQator({ t, klient }: { t: Tolov; klient?: Klient }) {
  const { C } = useTema();
  // To'lovda «oldim» = pul menga keldi
  const kirim = t.yonalish === 'oldim';
  return (
    <Qator
      klient={klient}
      sana={t.sana}
      nom={tr('To‘lov')}
      izoh={t.izoh}
      summa={t.summa}
      valyuta={t.valyuta}
      haq={!kirim}
      yorliq={kirim ? tr('TO‘LANDI') : tr('TO‘LADIM')}
      bekor={t.holat === 'bekor'}
      qoshimcha={t.usuli ? { matn: tr(t.usuli), rang: C.xira } : null}
    />
  );
}

function Qator({
  klient,
  sana,
  nom,
  izoh,
  summa,
  valyuta,
  haq,
  yorliq,
  bekor,
  qoshimcha,
}: {
  klient?: Klient;
  sana: string;
  nom: string;
  izoh?: string | null;
  summa: number;
  valyuta: Bitim['valyuta'];
  haq: boolean;
  yorliq: string;
  bekor: boolean;
  qoshimcha: { matn: string; rang: string } | null;
}) {
  const { C } = useTema();
  const ism = klient ? [klient.ism, klient.familya].filter(Boolean).join(' ') : tr('Hamkor');

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: O.chekka,
        paddingVertical: 12,
        backgroundColor: C.karta,
        borderBottomWidth: 1,
        borderBottomColor: C.ajratgich,
        opacity: bekor ? 0.5 : 1,
      }}
    >
      <MijozRasmi
        yol={klient?.rasm_path}
        harflar={boshHarflar(klient?.ism ?? '?', klient?.familya)}
        olcham={40}
      />

      <View style={{ flex: 1 }}>
        <Text style={{ color: C.matn, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {ism}
        </Text>
        <Text style={{ color: C.matn2, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
          {nom}
          {izoh ? ' · ' + izoh : ''}
        </Text>
        {/* Sana, vaqt va YIL — bahsda aynan shular kerak */}
        <Text style={{ color: C.xira, fontSize: 11, marginTop: 3 }}>
          {sanaVaqtToliq(sana)}
          {qoshimcha ? ' · ' : ''}
          {qoshimcha ? <Text style={{ color: qoshimcha.rang, fontWeight: '700' }}>{qoshimcha.matn}</Text> : null}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            color: haq ? C.kirim : C.chiqim,
            fontSize: 15,
            fontWeight: '700',
            textDecorationLine: bekor ? 'line-through' : 'none',
          }}
        >
          {(haq ? '+' : '−') + ' ' + formatla(summa, valyuta, { belgisiz: true, kasrsiz: true })}
        </Text>
        <Text
          style={{
            color: haq ? C.kirim : C.chiqim,
            fontSize: 10,
            fontWeight: '800',
            marginTop: 3,
            letterSpacing: 0.4,
          }}
        >
          {bekor ? tr('BEKOR') : yorliq}
        </Text>
      </View>
    </View>
  );
}
