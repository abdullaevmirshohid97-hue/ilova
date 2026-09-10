import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat } from '../components/Xabar';
import { formatSum, supabase } from '../lib/supabase';

// AUDIT JURNALI — kim, qachon, nima qildi.
//
// Bu yo'nalishda bu savol ayniqsa muhim: agent o'z klientining
// yozuvini ISTAGAN VAQT bekor qila oladi, ya'ni yopilgan oyning
// raqami ham o'zgarishi mumkin. Yagona nazorat — shu jurnal.
//
// Jurnal FAQAT O'QILADI. Uni tahrirlash yoki tozalash tugmasi
// ataylab yo'q: o'chirib tashlanadigan nazorat nazorat emas.

type Yozuv = {
  id: number;
  amal: string;
  jadval: string;
  yozuv_id: string | null;
  agent: string | null;
  foydalanuvchi: string | null;
  klient: string | null;
  eski: any;
  yangi: any;
  sabab: string | null;
  created_at: string;
};

const AMAL: Record<string, { nom: string; cls: string }> = {
  qoshildi: { nom: 'Qo‘shildi', cls: 'bg-emerald-100 text-emerald-700' },
  bekor: { nom: 'Bekor qilindi', cls: 'bg-red-100 text-red-600' },
  tahrir: { nom: 'Tahrirlandi', cls: 'bg-amber-100 text-amber-700' },
  telegram_ulandi: { nom: 'Telegram ulandi', cls: 'bg-sky-100 text-sky-700' },
  telegram_uzildi: { nom: 'Telegram uzildi', cls: 'bg-gray-100 text-gray-600' },
};

const JADVAL: Record<string, string> = {
  qarz_transactions: 'Yozuv',
  qarz_clients: 'Klient',
  qarz_agents: 'Agent',
};

const FILTRLAR = [
  { key: '', nom: 'Hammasi' },
  { key: 'bekor', nom: 'Faqat bekor qilinganlar' },
  { key: 'qoshildi', nom: 'Qo‘shilganlar' },
];

const SAHIFA = 100;

function sanaVaqt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()} ${ik(d.getHours())}:${ik(d.getMinutes())}`;
}

/** Jurnaldagi jsonb'dan odam o'qiydigan tavsif */
function tafsilot(y: Yozuv): string {
  const d = y.yangi ?? y.eski ?? {};
  const qism: string[] = [];
  if (d.tur) qism.push(d.tur === 'chiqim' ? '📦 Tovar chiqimi' : '💰 Pul kirimi');
  if (d.summa != null) qism.push(formatSum(Number(d.summa)));
  if (d.usul) qism.push({ naqd: '💵 Naqd', plastik: '💳 Plastik', klik: '🔵 Click' }[d.usul as string] ?? d.usul);
  if (d.ism) qism.push(String(d.ism));
  if (d.telefon) qism.push(String(d.telefon));
  return qism.join(' · ');
}

export default function QarzAudit() {
  const [qatorlar, setQatorlar] = useState<Yozuv[]>([]);
  const [yuklandi, setYuklandi] = useState(false);
  const [amal, setAmal] = useState('');
  const [sahifa, setSahifa] = useState(0);
  const [yana, setYana] = useState(false);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('qarz_audit_royxat', {
      p_dan: null,
      p_gacha: null,
      p_amal: amal || null,
      p_agent_id: null,
      p_limit: SAHIFA,
      p_offset: sahifa * SAHIFA,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      setYuklandi(true);
      return;
    }
    const r = (data ?? []) as Yozuv[];
    setQatorlar(r);
    setYana(r.length === SAHIFA);
    setYuklandi(true);
  }, [amal, sahifa]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  useEffect(() => {
    setSahifa(0);
  }, [amal]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        📋 Har bir qo‘shish va bekor qilish shu yerda qoladi. Jurnal <b>faqat o‘qiladi</b> —
        uni tahrirlash yoki tozalash mumkin emas.
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTRLAR.map((f) => (
          <button
            key={f.key}
            onClick={() => setAmal(f.key)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              amal === f.key
                ? 'bg-brand text-white'
                : 'border border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            {f.nom}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">Vaqt</th>
                <th className="px-6 py-3">Amal</th>
                <th className="px-6 py-3">Nima</th>
                <th className="px-6 py-3">Klient</th>
                <th className="px-6 py-3">Kim</th>
                <th className="px-6 py-3">Sabab</th>
              </tr>
            </thead>
            <tbody>
              {!yuklandi && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {yuklandi && qatorlar.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    Jurnal bo‘sh.
                  </td>
                </tr>
              )}
              {qatorlar.map((y) => {
                const a = AMAL[y.amal] ?? { nom: y.amal, cls: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={y.id} className="border-t border-gray-50">
                    <td className="whitespace-nowrap px-6 py-3 text-gray-500">
                      {sanaVaqt(y.created_at)}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${a.cls}`}>
                        {a.nom}
                      </span>
                      <div className="mt-1 text-xs text-gray-500">
                        {JADVAL[y.jadval] ?? y.jadval}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-gray-700">{tafsilot(y) || '—'}</td>
                    <td className="px-6 py-3 text-gray-700">{y.klient ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {y.agent ? (
                        <span>
                          🤖 {y.agent}
                          <div className="text-xs text-gray-500">agent · Telegram</div>
                        </span>
                      ) : (
                        <span>
                          {y.foydalanuvchi ?? '—'}
                          <div className="text-xs text-gray-500">panel</div>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{y.sabab ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(sahifa > 0 || yana) && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setSahifa((s) => Math.max(0, s - 1))}
            disabled={sahifa === 0}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
          >
            ← Oldingi
          </button>
          <button
            onClick={() => setSahifa((s) => s + 1)}
            disabled={!yana}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
          >
            Keyingi →
          </button>
        </div>
      )}
    </div>
  );
}
