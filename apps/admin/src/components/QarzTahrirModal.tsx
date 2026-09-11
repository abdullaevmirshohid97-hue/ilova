import { useEffect, useState } from 'react';
import { formatSum } from '../lib/supabase';

// YOZUVNI TAHRIRLASH.
//
// Avval summani to'g'rilashning yagona yo'li "bekor qilib, qayta
// yozish" edi. Bu ishlaydi-yu, sverkada bitta xato o'rniga uchta qator
// qoladi va mijozga ko'rsatib bo'lmaydi.
//
// TAHRIR O'CHIRISH EMAS: eski qiymat audit jurnaliga to'liq yoziladi
// va sabab MAJBURIY — bekor qilishdagi kabi. Baza ham shuni talab
// qiladi (SABAB_MAJBURIY), shu chegara shu yerda ham ko'rsatilgan.
//
// TUR o'zgarmaydi. Chiqimni kirimga aylantirish qoldiqni ikki barobar
// siljitadi va buni "tahrir" deb atash chalg'itardi — bunday holda
// eskisi bekor qilinib, yangisi yoziladi.

const USULLAR: { key: string; nom: string }[] = [
  { key: 'naqd', nom: '💵 Naqd' },
  { key: 'plastik', nom: '💳 Plastik' },
  { key: 'klik', nom: '🔵 Click' },
];

export type TahrirYozuv = {
  id: string;
  tur: string;
  summa: number;
  usul: string | null;
  sana: string;
  klient?: string | null;
};

/** timestamptz -> <input type="datetime-local"> qiymati (MAHALLIY vaqt) */
function mahalliy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${ik(d.getMonth() + 1)}-${ik(d.getDate())}T${ik(d.getHours())}:${ik(d.getMinutes())}`;
}

export function QarzTahrirModal({
  yozuv,
  onYopish,
  onTasdiq,
}: {
  yozuv: TahrirYozuv;
  onYopish: () => void;
  onTasdiq: (x: {
    summa: number;
    sana: string;
    usul: string | null;
    sabab: string;
  }) => Promise<void> | void;
}) {
  const chiqimmi = yozuv.tur === 'chiqim';
  const [summa, setSumma] = useState(String(Math.round(Number(yozuv.summa) || 0)));
  const [sana, setSana] = useState(mahalliy(yozuv.sana));
  const [usul, setUsul] = useState(yozuv.usul ?? 'naqd');
  const [sabab, setSabab] = useState('');
  const [ketmoqda, setKetmoqda] = useState(false);
  const [x, setX] = useState<string | null>(null);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onYopish();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYopish]);

  const n = Number(String(summa).replace(/\D/g, '')) || 0;
  const eski = Math.round(Number(yozuv.summa) || 0);
  const farq = n - eski;
  const ozgardi =
    n !== eski || sana !== mahalliy(yozuv.sana) || (!chiqimmi && usul !== (yozuv.usul ?? ''));
  const yetarli = n > 0 && sabab.trim().length >= 3 && ozgardi;

  async function saqla() {
    setX(null);
    if (n <= 0) return setX('Summani kiriting');
    if (!ozgardi) return setX('Hech narsa o‘zgarmadi');
    if (sabab.trim().length < 3) return setX('Sababni yozing (kamida 3 ta belgi)');
    // Kelajak sanani baza ham rad etadi (SANA_KELAJAKDA) — lekin
    // foydalanuvchi buni saqlashdan OLDIN bilsin
    if (sana && new Date(sana).getTime() > Date.now() + 60000) {
      return setX('Sana kelajakda bo‘lishi mumkin emas');
    }
    setKetmoqda(true);
    try {
      await onTasdiq({
        summa: n,
        sana: sana ? new Date(sana).toISOString() : yozuv.sana,
        usul: chiqimmi ? null : usul,
        sabab: sabab.trim(),
      });
    } finally {
      setKetmoqda(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-gray-900">
              {chiqimmi ? '📦 Tovar chiqimi' : '💰 Pul kirimi'} — tahrir
            </h3>
            {yozuv.klient && <p className="mt-0.5 text-sm text-gray-500">{yozuv.klient}</p>}
          </div>
          <button onClick={onYopish} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Eski qiymat <b>audit jurnalida</b> sabab bilan qoladi. Amal turini
          ({chiqimmi ? 'chiqim' : 'kirim'}) o‘zgartirib bo‘lmaydi — buning uchun
          yozuvni bekor qilib, yangisini yozing.
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">SUMMA (SO‘M) *</label>
            <input
              value={n ? n.toLocaleString('ru-RU') : ''}
              onChange={(e) => setSumma(e.target.value)}
              className={inputCls + ' text-lg font-bold'}
              autoFocus
            />
            {farq !== 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Eski: <b>{formatSum(eski)}</b> · farq{' '}
                <b className={farq > 0 ? 'text-red-600' : 'text-emerald-700'}>
                  {farq > 0 ? '+' : '−'}
                  {formatSum(Math.abs(farq))}
                </b>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500">SANA VA VAQT</label>
            <input
              type="datetime-local"
              value={sana}
              onChange={(e) => setSana(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">
              O‘tgan kunga ko‘chirish mumkin — kunlar kesimidagi hisob shunga qarab qayta quriladi.
            </p>
          </div>

          {!chiqimmi && (
            <div>
              <label className="text-xs font-semibold text-gray-500">TO‘LOV USULI</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {USULLAR.map((u) => (
                  <button
                    key={u.key}
                    onClick={() => setUsul(u.key)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                      usul === u.key
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {u.nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500">O‘ZGARTIRISH SABABI *</label>
            <textarea
              rows={2}
              value={sabab}
              onChange={(e) => setSabab(e.target.value)}
              placeholder="Masalan: summa xato kiritilgan, haqiqiysi 1 250 000"
              className={inputCls + ' resize-none'}
            />
            <p className={`mt-1 text-xs ${sabab.trim().length >= 3 ? 'text-gray-500' : 'text-amber-600'}`}>
              Kamida 3 ta belgi.
            </p>
          </div>
        </div>

        {x && <p className="mt-4 text-sm font-semibold text-red-500">{x}</p>}

        <div className="mt-7 flex justify-end gap-3">
          <button
            onClick={onYopish}
            disabled={ketmoqda}
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            Voz kechish
          </button>
          <button
            onClick={saqla}
            disabled={!yetarli || ketmoqda}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {ketmoqda ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
