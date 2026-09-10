import { useEffect, useState } from 'react';

// BEKOR QILISH — sabab so'raladigan oyna.
//
// Sabab qattiq yozib qo'yilgan matn BO'LMASLIGI kerak. Bu yo'nalishda
// yozuv o'chirilmaydi, faqat bekor qilinadi va yagona nazorat — audit
// jurnali. Har bekorda bir xil "Panel orqali bekor qilindi" yozilsa,
// jurnalda qator ko'p, ma'lumot esa nol bo'lardi.
//
// Baza ham shuni talab qiladi: qarz_yozuv_bekor sababi 3 belgidan
// qisqa bo'lsa xato beradi. Shu chegara shu yerda ham ko'rsatilgan —
// foydalanuvchi tugmani bosgandan keyin emas, oldin bilsin.

export function QarzBekorModal({
  sarlavha,
  tafsilot,
  onYopish,
  onTasdiq,
}: {
  sarlavha: string;
  tafsilot?: string;
  onYopish: () => void;
  onTasdiq: (sabab: string) => Promise<void> | void;
}) {
  const [sabab, setSabab] = useState('');
  const [ketmoqda, setKetmoqda] = useState(false);
  const yetarli = sabab.trim().length >= 3;

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onYopish();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onYopish]);

  async function tasdiqla() {
    if (!yetarli || ketmoqda) return;
    setKetmoqda(true);
    try {
      await onTasdiq(sabab.trim());
    } finally {
      setKetmoqda(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-extrabold text-gray-900">{sarlavha}</h3>
        {tafsilot && <p className="mt-1 text-sm text-gray-500">{tafsilot}</p>}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Yozuv <b>o‘chmaydi</b> — hisobdan chiqadi va audit jurnalida sabab bilan qoladi.
        </div>

        <label className="mt-4 block text-sm font-semibold text-gray-700">
          Bekor qilish sababi
        </label>
        <textarea
          autoFocus
          rows={3}
          value={sabab}
          onChange={(e) => setSabab(e.target.value)}
          placeholder="Masalan: summa xato kiritildi, to‘lov qaytarildi..."
          className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-brand"
        />
        <p className={`mt-1 text-xs ${yetarli ? 'text-gray-500' : 'text-amber-600'}`}>
          Kamida 3 ta belgi.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onYopish}
            disabled={ketmoqda}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 hover:border-gray-300 disabled:opacity-40"
          >
            Voz kechish
          </button>
          <button
            onClick={tasdiqla}
            disabled={!yetarli || ketmoqda}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
          >
            {ketmoqda ? 'Bekor qilinmoqda...' : 'Bekor qilish'}
          </button>
        </div>
      </div>
    </div>
  );
}
