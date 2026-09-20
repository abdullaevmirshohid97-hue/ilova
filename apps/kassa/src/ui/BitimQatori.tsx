// =============================================================
//  BITIM QATORI — bitta oldi-berdi
//
//  Operatsiyalar ro‘yxatida ishlatiladi. Muddati o‘tgan bitim
//  QIZIL bo‘lib turadi — bildirishnoma yo‘q (qaror 20.09),
//  ro‘yxatning o‘zi eslatadi.
// =============================================================

import { bitimQoldiq, formatla, kechikkanKun } from '@ilova/kassa-yadro';
import type { Bitim, Tolov } from '@ilova/kassa-yadro';
import { sanaQisqa } from '../lib/davr';
import { useTema } from '../lib/tema';
import { tr, trn } from '../lib/til';
import { Qator } from './qismlar';

export function BitimQatori({
  b,
  tolovlar,
  hujjat,
}: {
  b: Bitim;
  tolovlar: Tolov[];
  hujjat?: () => void;
}) {
  const { C } = useTema();
  const qoldi = bitimQoldiq(b, tolovlar);
  const berdim = b.yonalish === 'berdim';
  // Muddati o‘tgan qarz ro‘yxatning o‘zida ko‘rinadi —
  // bildirishnoma yubormaymiz (qaror 20.09).
  const kechikdi = kechikkanKun(b, tolovlar);
  const nomi = b.tovar_nom || (b.nima === 'qarz' ? tr('Qarz') : tr('Tovar'));
  const tafsilot = [
    sanaQisqa(b.sana),
    b.miqdor ? `${b.miqdor} ${tr(b.birlik ?? 'dona')}` : null,
    b.holat === 'yopilgan' ? tr('yopilgan') : qoldi > 0 ? `${formatla(qoldi, b.valyuta, { belgisiz: true, kasrsiz: true })} ${tr('qoldi')}` : null,
    b.holat === 'bekor' ? tr('bekor') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Qator
      nom={nomi}
      izoh={tafsilot}
      ong={`${berdim ? '+' : '−'} ${formatla(b.summa, b.valyuta, { belgisiz: true, kasrsiz: true })}`}
      ongRang={berdim ? C.kirim : C.chiqim}
      ongIzoh={
        kechikdi > 0 ? trn('{n} kun kechikdi', kechikdi) : b.holat === 'kutilmoqda' ? tr('kutilmoqda') : undefined
      }
      ongIzohRang={kechikdi > 0 ? C.chiqim : undefined}
      uzoqBos={hujjat}
      sozilgan={b.holat === 'bekor'}
    />
  );
}
