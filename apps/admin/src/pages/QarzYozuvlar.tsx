import { useCallback, useEffect, useMemo, useState } from 'react';
import { QarzBekorModal } from '../components/QarzBekorModal';
import { xabarKorsat } from '../components/Xabar';
import { formatSum, supabase } from '../lib/supabase';

// QARZDORLIK — chiqim va kirim yozuvlari.
//
// Avval yozuvni ko'rishning yagona yo'li SVERKA edi, ya'ni bitta
// klient kesimida. "Bugun jami qancha pul kirdi va kimlardan" degan
// savolga javob berish uchun har bir klientni birma-bir ochish
// kerak bo'lardi.
//
// JAMI BAZADAN KELADI, ekrandagi qatorlardan qo'shilmaydi. Sahifada
// 100 ta qator turadi; jami shu qatorlardan hisoblansa, ikkinchi
// sahifaga o'tganda raqam o'zgarib ketardi.

type Yozuv = {
  id: string;
  tur: string;
  summa: number;
  usul: string | null;
  sana: string;
  izoh: string | null;
  manba: string | null;
  bekor: boolean;
  bekor_sabab: string | null;
  client_id: string;
  klient: string | null;
  telefon: string | null;
  agent: string | null;
};

type Jami = {
  chiqim: number;
  kirim: number;
  naqd: number;
  plastik: number;
  klik: number;
  soni: number;
  bekor: number;
};

type Agent = { id: string; ism: string };

const SAHIFA = 100;

const DAVRLAR = [
  { key: 'bugun', nom: 'Bugun' },
  { key: 'hafta', nom: 'Shu hafta' },
  { key: 'oy', nom: 'Shu oy' },
  { key: 'hammasi', nom: 'Hammasi' },
  { key: 'oraliq', nom: 'Sanadan — sanagacha' },
];

const TURLAR = [
  { key: '', nom: 'Hammasi' },
  { key: 'chiqim', nom: '📦 Tovar chiqimi' },
  { key: 'kirim', nom: '💰 Pul kirimi' },
];

const USULLAR = [
  { key: '', nom: 'Har qanday usul' },
  { key: 'naqd', nom: '💵 Naqd' },
  { key: 'plastik', nom: '💳 Plastik' },
  { key: 'klik', nom: '🔵 Click' },
];

const USUL_NOM: Record<string, string> = {
  naqd: '💵 Naqd',
  plastik: '💳 Plastik',
  klik: '🔵 Click',
};

function ik(n: number): string {
  return String(n).padStart(2, '0');
}

function kunKaliti(d: Date): string {
  return `${d.getFullYear()}-${ik(d.getMonth() + 1)}-${ik(d.getDate())}`;
}

function davrOraliq(kalit: string, dan: string, gacha: string) {
  const h = new Date();
  if (kalit === 'bugun') {
    const k = kunKaliti(h);
    return { dan: `${k}T00:00:00`, gacha: `${k}T23:59:59` };
  }
  if (kalit === 'hafta') {
    // Dushanbadan boshlanadi: yakshanba (0) oldingi haftaning oxiri
    const b = new Date(h);
    const kun = (b.getDay() + 6) % 7;
    b.setDate(b.getDate() - kun);
    return { dan: `${kunKaliti(b)}T00:00:00`, gacha: null };
  }
  if (kalit === 'oy') {
    return { dan: `${h.getFullYear()}-${ik(h.getMonth() + 1)}-01T00:00:00`, gacha: null };
  }
  if (kalit === 'oraliq') {
    return {
      dan: dan ? `${dan}T00:00:00` : null,
      // Oxirgi kun ICHIGA kiradi: aks holda "1—30" deb tanlagan odam
      // 30-kunning yozuvlarini ko'rmasdi
      gacha: gacha ? `${gacha}T23:59:59` : null,
    };
  }
  return { dan: null, gacha: null };
}

function sanaVaqt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()} ${ik(d.getHours())}:${ik(d.getMinutes())}`;
}

export default function QarzYozuvlar() {
  const [davr, setDavr] = useState('oy');
  const [dan, setDan] = useState('');
  const [gacha, setGacha] = useState('');
  const [tur, setTur] = useState('');
  const [usul, setUsul] = useState('');
  const [agentId, setAgentId] = useState('');
  const [bekorlar, setBekorlar] = useState(false);
  const [q, setQ] = useState('');
  const [qidiruv, setQidiruv] = useState('');

  const [agentlar, setAgentlar] = useState<Agent[]>([]);
  const [qatorlar, setQatorlar] = useState<Yozuv[]>([]);
  const [jami, setJami] = useState<Jami | null>(null);
  const [sahifa, setSahifa] = useState(0);
  const [yuklandi, setYuklandi] = useState(false);
  const [bekorYozuv, setBekorYozuv] = useState<Yozuv | null>(null);

  useEffect(() => {
    supabase.rpc('qarz_agentlar').then(({ data }) => {
      setAgentlar(((data ?? []) as any[]).map((a) => ({ id: a.id, ism: a.ism })));
    });
  }, []);

  // Qidiruv har harfda so'rov yubormasin
  useEffect(() => {
    const t = setTimeout(() => setQidiruv(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const oraliq = useMemo(() => davrOraliq(davr, dan, gacha), [davr, dan, gacha]);

  const yukla = useCallback(async () => {
    setYuklandi(false);
    const { data, error } = await supabase.rpc('qarz_yozuvlar', {
      p_dan: oraliq.dan,
      p_gacha: oraliq.gacha,
      p_tur: tur || null,
      p_usul: usul || null,
      p_agent_id: agentId || null,
      p_client_id: null,
      // Bekor qilinganlar ODATDA ko'rinadi: ularni yashirish "raqam
      // nega to'g'ri kelmayapti" degan savolni javobsiz qoldirardi
      p_bekor: bekorlar ? true : null,
      p_q: qidiruv || null,
      p_limit: SAHIFA,
      p_offset: sahifa * SAHIFA,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      setYuklandi(true);
      return;
    }
    const r = data as any;
    setQatorlar((r?.qatorlar ?? []) as Yozuv[]);
    setJami((r?.jami ?? null) as Jami | null);
    setYuklandi(true);
  }, [oraliq.dan, oraliq.gacha, tur, usul, agentId, bekorlar, qidiruv, sahifa]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  // Filtr o'zgarsa birinchi sahifaga qaytamiz — aks holda bo'sh
  // sahifada turib "yozuv yo'q" degan xulosa chiqarish mumkin edi
  useEffect(() => {
    setSahifa(0);
  }, [davr, dan, gacha, tur, usul, agentId, bekorlar, qidiruv]);

  async function bekorQil(sabab: string) {
    if (!bekorYozuv) return;
    const { error } = await supabase.rpc('qarz_yozuv_bekor', {
      p_id: bekorYozuv.id,
      p_sabab: sabab,
      p_agent_id: null,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      return;
    }
    setBekorYozuv(null);
    xabarKorsat('✅ Bekor qilindi');
    await yukla();
  }

  const yana = qatorlar.length === SAHIFA;

  return (
    <div className="space-y-4">
      {/* ---- xulosa ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Tovar chiqimi
          </div>
          <div className="mt-1 text-2xl font-extrabold text-gray-900">
            {formatSum(jami?.chiqim ?? 0)}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Pul kirimi
          </div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700">
            {formatSum(jami?.kirim ?? 0)}
          </div>
          <p className="mt-1 text-xs text-emerald-700">
            💵 {formatSum(jami?.naqd ?? 0)} · 💳 {formatSum(jami?.plastik ?? 0)} · 🔵{' '}
            {formatSum(jami?.klik ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Yozuvlar
          </div>
          <div className="mt-1 text-2xl font-extrabold text-gray-900">{jami?.soni ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Bekor qilingan
          </div>
          <div className="mt-1 text-2xl font-extrabold text-red-600">{jami?.bekor ?? 0}</div>
          <p className="mt-1 text-xs text-gray-500">jamiga kirmaydi</p>
        </div>
      </div>

      {/* ---- filtrlar ---- */}
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-gray-200">
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

          {davr === 'oraliq' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dan}
                onChange={(e) => setDan(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
              <span className="text-gray-500">—</span>
              <input
                type="date"
                value={gacha}
                onChange={(e) => setGacha(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tur}
            onChange={(e) => setTur(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand"
          >
            {TURLAR.map((t) => (
              <option key={t.key} value={t.key}>
                {t.nom}
              </option>
            ))}
          </select>

          {/* Usul faqat kirimda bo'ladi — chiqim to'lov emas, qarz yozuvi */}
          <select
            value={usul}
            onChange={(e) => setUsul(e.target.value)}
            disabled={tur === 'chiqim'}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-40"
          >
            {USULLAR.map((u) => (
              <option key={u.key} value={u.key}>
                {u.nom}
              </option>
            ))}
          </select>

          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Barcha agentlar</option>
            {agentlar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ism}
              </option>
            ))}
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Klient, apteka, telefon yoki izoh..."
            className="min-w-[240px] flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand"
          />

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={bekorlar}
              onChange={(e) => setBekorlar(e.target.checked)}
              className="h-4 w-4 accent-red-600"
            />
            Faqat bekor qilinganlar
          </label>
        </div>
      </div>

      {/* ---- jadval ---- */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Sana</th>
                <th className="px-5 py-3">Klient</th>
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Amal</th>
                <th className="px-5 py-3 text-right">Summa</th>
                <th className="px-5 py-3">Izoh</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {!yuklandi && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {yuklandi && qatorlar.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                    Bu shartlarga mos yozuv yo‘q.
                  </td>
                </tr>
              )}
              {qatorlar.map((y) => (
                <tr
                  key={y.id}
                  className={`border-t border-gray-50 ${y.bekor ? 'bg-red-50/60' : ''}`}
                >
                  <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                    {sanaVaqt(y.sana)}
                    {y.manba === 'bot' && (
                      <div className="text-xs text-gray-500">🤖 botdan</div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-gray-800">{y.klient ?? '—'}</div>
                    {y.telefon && <div className="text-xs text-gray-500">{y.telefon}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{y.agent ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        y.tur === 'chiqim'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {y.tur === 'chiqim' ? '📦 Chiqim' : '💰 Kirim'}
                    </span>
                    {y.usul && (
                      <div className="mt-1 text-xs text-gray-500">
                        {USUL_NOM[y.usul] ?? y.usul}
                      </div>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-3 text-right font-bold ${
                      y.bekor
                        ? 'text-gray-500 line-through'
                        : y.tur === 'chiqim'
                          ? 'text-gray-900'
                          : 'text-emerald-700'
                    }`}
                  >
                    {y.tur === 'chiqim' ? '+' : '−'}
                    {formatSum(y.summa)}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {y.bekor ? (
                      <span className="text-red-600">
                        <b>BEKOR</b>
                        {y.bekor_sabab ? ' — ' + y.bekor_sabab : ''}
                      </span>
                    ) : (
                      y.izoh ?? '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!y.bekor && (
                      <button
                        onClick={() => setBekorYozuv(y)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                      >
                        Bekor qilish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(sahifa > 0 || yana) && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setSahifa((s) => Math.max(0, s - 1))}
            disabled={sahifa === 0}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
          >
            ← Oldingi
          </button>
          <span className="text-sm text-gray-500">{sahifa + 1}-sahifa</span>
          <button
            onClick={() => setSahifa((s) => s + 1)}
            disabled={!yana}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-bold text-gray-600 disabled:opacity-40"
          >
            Keyingi →
          </button>
        </div>
      )}

      {bekorYozuv && (
        <QarzBekorModal
          sarlavha={
            (bekorYozuv.tur === 'chiqim' ? 'Tovar chiqimi' : 'Pul kirimi') +
            ' — ' +
            formatSum(bekorYozuv.summa)
          }
          tafsilot={`${bekorYozuv.klient ?? ''} · ${sanaVaqt(bekorYozuv.sana)}`}
          onYopish={() => setBekorYozuv(null)}
          onTasdiq={bekorQil}
        />
      )}
    </div>
  );
}
