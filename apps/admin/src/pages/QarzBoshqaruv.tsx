import { useCallback, useEffect, useState } from 'react';
import { formatSum, supabase } from '../lib/supabase';

// QARZDORLIK — boshqaruv paneli.
//
// Uchta savolga javob beradi va shu tartibda:
//   1. Qancha tovar chiqdi
//   2. Qancha pul keldi — va QAYSI usulda
//   3. Qancha qarz qoldi
//
// Usul ajratilishi shunchaki chiroy emas: oy oxirida "kassada qancha
// naqd bo'lishi kerak" degan savolga javob aynan shundan chiqadi.
//
// QARZ DAVRGA BOG'LIQ EMAS. U bugungi holat — "shu oyning farqi"
// emas. Davr bilan cheklansa raqam mutlaqo boshqa ma'no berardi va
// buni faqat hisob to'g'ri kelmaganda sezilardi.

type Hisobot = {
  chiqim: number;
  kirim: number;
  naqd: number;
  plastik: number;
  klik: number;
  qarz: number;
  klientlar: number;
  agentlar: number;
};

type Agent = { id: string; ism: string };

const DAVRLAR: { key: string; nom: string }[] = [
  { key: 'bugun', nom: 'Bugun' },
  { key: 'oy', nom: 'Shu oy' },
  { key: 'yil', nom: 'Shu yil' },
  { key: 'hammasi', nom: 'Hammasi' },
];

function davrOraliq(kalit: string): { dan: string | null; gacha: string | null } {
  const h = new Date();
  const ik = (n: number) => String(n).padStart(2, '0');
  if (kalit === 'bugun') {
    const k = `${h.getFullYear()}-${ik(h.getMonth() + 1)}-${ik(h.getDate())}`;
    return { dan: `${k}T00:00:00`, gacha: `${k}T23:59:59` };
  }
  if (kalit === 'oy') {
    return { dan: `${h.getFullYear()}-${ik(h.getMonth() + 1)}-01T00:00:00`, gacha: null };
  }
  if (kalit === 'yil') return { dan: `${h.getFullYear()}-01-01T00:00:00`, gacha: null };
  return { dan: null, gacha: null };
}

function Karta({
  yorliq,
  qiymat,
  izoh,
  rang = 'oq',
  katta = false,
}: {
  yorliq: string;
  qiymat: string;
  izoh?: string;
  rang?: 'oq' | 'yashil' | 'qizil' | 'kok';
  katta?: boolean;
}) {
  const uslub = {
    oq: 'border-gray-200 bg-white',
    yashil: 'border-emerald-200 bg-emerald-50',
    qizil: 'border-red-200 bg-red-50',
    kok: 'border-sky-200 bg-sky-50',
  }[rang];
  const matnRang = {
    oq: 'text-gray-900',
    yashil: 'text-emerald-700',
    qizil: 'text-red-600',
    kok: 'text-sky-800',
  }[rang];
  const yorliqRang = {
    oq: 'text-gray-500',
    yashil: 'text-emerald-700',
    qizil: 'text-red-600',
    kok: 'text-sky-700',
  }[rang];

  return (
    <div className={`rounded-2xl border p-5 ${uslub}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${yorliqRang}`}>{yorliq}</div>
      <div className={`mt-1 font-extrabold ${matnRang} ${katta ? 'text-3xl' : 'text-2xl'}`}>
        {qiymat}
      </div>
      {izoh && <p className={`mt-1 text-xs ${yorliqRang}`}>{izoh}</p>}
    </div>
  );
}

export default function QarzBoshqaruv() {
  const [davr, setDavr] = useState('oy');
  const [agentId, setAgentId] = useState('');
  const [agentlar, setAgentlar] = useState<Agent[]>([]);
  const [h, setH] = useState<Hisobot | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('qarz_agentlar').then(({ data }) => {
      setAgentlar(((data ?? []) as any[]).map((a) => ({ id: a.id, ism: a.ism })));
    });
  }, []);

  const yukla = useCallback(async () => {
    setXato(null);
    const d = davrOraliq(davr);
    const { data, error } = await supabase.rpc('qarz_hisobot', {
      p_dan: d.dan,
      p_gacha: d.gacha,
      p_agent_id: agentId || null,
    });
    if (error) {
      setXato(error.message);
      return;
    }
    setH(data as unknown as Hisobot);
  }, [davr, agentId]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const kirim = Number(h?.kirim ?? 0);
  const ulush = (n: number) => (kirim > 0 ? Math.round((n / kirim) * 100) : 0);

  return (
    <div className="space-y-5">
      {/* ---- filtrlar ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white">
          {DAVRLAR.map((d) => (
            <button
              key={d.key}
              onClick={() => setDavr(d.key)}
              className={`px-4 py-2.5 text-sm font-bold transition ${
                davr === d.key ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {d.nom}
            </button>
          ))}
        </div>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        >
          <option value="">Barcha agentlar</option>
          {agentlar.map((a) => (
            <option key={a.id} value={a.id}>
              {a.ism}
            </option>
          ))}
        </select>
      </div>

      {xato && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {xato}
        </div>
      )}

      {/* ---- asosiy uchlik ---- */}
      <div className="grid gap-4 md:grid-cols-3">
        <Karta
          yorliq="Tovar chiqimi"
          qiymat={formatSum(h?.chiqim ?? 0)}
          izoh="tanlangan davrda"
          katta
        />
        <Karta
          yorliq="Pul kirimi"
          qiymat={formatSum(kirim)}
          izoh="tanlangan davrda"
          rang="yashil"
          katta
        />
        <Karta
          yorliq="Qarzdorlik"
          qiymat={formatSum(h?.qarz ?? 0)}
          izoh="bugungi holat — davrga bog‘liq emas"
          rang="qizil"
          katta
        />
      </div>

      {/* ---- kirim usullari ---- */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold text-gray-900">Pul kirimi qanday olindi</h3>
          <span className="text-sm text-gray-500">Jami {formatSum(kirim)}</span>
        </div>

        <div className="mt-5 space-y-4">
          {[
            { nom: '💵 Naqd', qiy: Number(h?.naqd ?? 0), rang: 'bg-emerald-500' },
            { nom: '💳 Plastik', qiy: Number(h?.plastik ?? 0), rang: 'bg-sky-500' },
            { nom: '🔵 Click', qiy: Number(h?.klik ?? 0), rang: 'bg-indigo-500' },
          ].map((u) => (
            <div key={u.nom}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-gray-700">{u.nom}</span>
                <span className="font-bold text-gray-900">
                  {formatSum(u.qiy)}
                  <span className="ml-2 text-xs font-normal text-gray-500">{ulush(u.qiy)}%</span>
                </span>
              </div>
              {/* Ustun uzunligi ulushga mos: raqamni o'qimasdan ham
                  qaysi usul ustunligi ko'rinadi */}
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${u.rang} transition-all`}
                  style={{ width: `${ulush(u.qiy)}%` }}
                />
              </div>
            </div>
          ))}
          {kirim === 0 && (
            <p className="pt-2 text-sm text-gray-500">Bu davrda pul kirimi bo‘lmagan.</p>
          )}
        </div>
      </div>

      {/* ---- kichik ko'rsatkichlar ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Karta yorliq="Klientlar" qiymat={String(h?.klientlar ?? 0)} rang="kok" />
        <Karta yorliq="Agentlar" qiymat={String(h?.agentlar ?? 0)} rang="kok" />
      </div>
    </div>
  );
}
