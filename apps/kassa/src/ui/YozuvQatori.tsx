// =============================================================
//  DAFTAR YOZUVI — bitta qator
//
//  Uch ekranda ishlatiladi: Operatsiyalar, Kalendar va hamkor
//  kartochkasi. Avval u BoshEkran ichida turardi va o'sha uch
//  ekran bosh ekrandan import qilardi — bosh sahifa bo'shatilganda
//  (20.09) uchalasi ham buzildi. Endi o'z joyida.
//
//  Ishora RANGDAN TASHQARI ham bor (+ / −): rang ajratmaydigan
//  odam ham kirimni chiqimdan farqlay olishi kerak.
// =============================================================

import { formatla } from '@ilova/kassa-yadro';
import type { Yozuv } from '@ilova/kassa-yadro';
import { sanaQisqa } from '../lib/davr';
import { useTema } from '../lib/tema';
import { tr } from '../lib/til';
import { Qator } from './qismlar';

export function YozuvQatori({
  y,
  turkumNomi,
  klientNomi,
  bos,
  uzoqBos,
  qoldiq,
}: {
  y: Yozuv;
  turkumNomi?: string;
  klientNomi?: string;
  bos?: () => void;
  uzoqBos?: () => void;
  qoldiq?: number | null;
}) {
  const { C } = useTema();
  const kirim = y.turi === 'kirim';
  const izohlar = [
    sanaQisqa(y.sana),
    turkumNomi,
    klientNomi,
    y.kochirma_id ? tr('o‘tkazma') : null,
    y.bekor_at ? tr('BEKOR QILINGAN') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Qator
      nom={y.izoh || turkumNomi || (kirim ? tr('Kirim') : tr('Chiqim'))}
      izoh={izohlar}
      ong={`${kirim ? '+' : '−'} ${formatla(y.summa, y.valyuta, { belgisiz: true, kasrsiz: true })}`}
      ongRang={y.kochirma_id ? C.matn2 : kirim ? C.kirim : C.chiqim}
      ongIzoh={
        qoldiq !== null && qoldiq !== undefined
          ? formatla(qoldiq, y.valyuta, { belgisiz: true, kasrsiz: true })
          : undefined
      }
      sozilgan={!!y.bekor_at}
      bos={bos}
      uzoqBos={uzoqBos}
    />
  );
}
