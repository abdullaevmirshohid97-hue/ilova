import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from '../components/Xabar';
import { formatSum, supabase } from '../lib/supabase';

// AGENTLAR — qarzdorlik yo'nalishi.
//
// Agentda auth hisobi YO'Q. U panelga kirmaydi: admin uni shu yerda
// ism/rayon/telefon bilan yaratadi, agent esa Telegram botga kirib
// KONTAKT ULASHADI. Bot telefonni shu ro'yxatdan topadi va o'shanda
// bog'lanish hosil bo'ladi.
//
// Shuning uchun telefon bu yerda eng muhim maydon: u agentning
// yagona kaliti. U global unikal — bir raqam ikki tenantda bo'lsa,
// bot kontakt kelganda qaysi korxona ekanini aniqlay olmasdi.

type Agent = {
  id: string;
  ism: string;
  rayon: string | null;
  telefon: string;
  faol: boolean;
  ulangan: boolean;
  klientlar: number;
  qarz: number;
};

const XATO_MATN: Record<string, string> = {
  TELEFON_BAND: 'Bu telefon raqami boshqa agentga biriktirilgan.',
  TELEFON_NOTOGRI: "Telefon raqam to'liq emas (kamida 9 raqam).",
  ISM_MAJBURIY: 'Ism kiritilmagan.',
  RUXSAT_YOQ: "Bu amal uchun ruxsat yo'q.",
};

function xato(e: any): string {
  const m = String(e?.message ?? e ?? '');
  for (const [k, v] of Object.entries(XATO_MATN)) if (m.includes(k)) return v;
  return m || 'Xatolik';
}

function AgentModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: Agent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ism, setIsm] = useState(agent?.ism ?? '');
  const [rayon, setRayon] = useState(agent?.rayon ?? '');
  const [telefon, setTelefon] = useState(agent?.telefon ?? '+998');
  const [faol, setFaol] = useState(agent?.faol ?? true);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [x, setX] = useState<string | null>(null);

  async function saqla() {
    setX(null);
    if (!ism.trim()) return setX('Ism majburiy');
    if (telefon.replace(/\D/g, '').length < 9) return setX("Telefon raqam to'liq emas");
    setSaqlanmoqda(true);
    try {
      const { error } = await supabase.rpc('qarz_agent_saqla', {
        p_id: agent?.id ?? null,
        p_ism: ism.trim(),
        p_rayon: rayon.trim() || null,
        p_telefon: telefon.trim(),
        p_faol: faol,
      });
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      setX(xato(e));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">
            {agent ? '✏️ Agentni tahrirlash' : '➕ Yangi agent'}
          </h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">ISM *</label>
            <input
              value={ism}
              onChange={(e) => setIsm(e.target.value)}
              className={inputCls}
              placeholder="Aliyev Valijon"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">RAYON</label>
            <input
              value={rayon}
              onChange={(e) => setRayon(e.target.value)}
              className={inputCls}
              placeholder="Chilonzor"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">TELEFON *</label>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              className={inputCls}
              placeholder="+998 90 123 45 67"
            />
            <p className="mt-1 text-xs text-gray-500">
              Agent botga <b>shu raqam bilan</b> kiradi — kontakt ulashganda topiladi.
              Raqam noto‘g‘ri bo‘lsa u kira olmaydi.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={faol} onChange={(e) => setFaol(e.target.checked)} />
            Faol (bloklansa botdan foydalana olmaydi)
          </label>
        </div>

        {x && <p className="mt-4 text-sm font-semibold text-red-500">{x}</p>}

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={saqla}
            disabled={saqlanmoqda}
            className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saqlanmoqda ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QarzAgentlar() {
  const [qatorlar, setQatorlar] = useState<Agent[]>([]);
  const [yuklandi, setYuklandi] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [ochiq, setOchiq] = useState<{ agent: Agent | null } | null>(null);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('qarz_agentlar', { p_q: qidiruv.trim() || null });
    if (error) {
      xabarKorsat('❌ ' + xato(error));
      setYuklandi(true);
      return;
    }
    setQatorlar((data ?? []) as Agent[]);
    setYuklandi(true);
  }, [qidiruv]);

  useEffect(() => {
    const t = setTimeout(yukla, 250);
    return () => clearTimeout(t);
  }, [yukla]);

  async function uzish(a: Agent) {
    if (
      !(await tasdiqlaSoz(
        `${a.ism} ning Telegram ulanishi uzilsinmi?\n\n` +
          `U botdan chiqib qoladi va qaytadan kontakt ulashishi kerak bo‘ladi. ` +
          `Klientlari va yozuvlari saqlanib qoladi.`,
      ))
    )
      return;
    const { error } = await supabase.rpc('qarz_agent_uzish', { p_id: a.id });
    if (error) xabarKorsat('❌ ' + xato(error));
    else {
      xabarKorsat('✅ Ulanish uzildi');
      yukla();
    }
  }

  const inputCls =
    'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        🤖 Agent panelga kirmaydi — u <b>Telegram bot</b> orqali ishlaydi. Bu yerda yaratilgan
        telefon raqami bilan botga kirib, kontaktini ulashadi va o‘z klientlarini ko‘radi.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={qidiruv}
          onChange={(e) => setQidiruv(e.target.value)}
          placeholder="Ism, rayon yoki telefon"
          className={inputCls + ' min-w-[16rem] flex-1'}
        />
        <button
          onClick={() => setOchiq({ agent: null })}
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Agent qo‘shish
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">Agent</th>
                <th className="px-6 py-3">Rayon</th>
                <th className="px-6 py-3">Telefon</th>
                <th className="px-6 py-3">Telegram</th>
                <th className="px-6 py-3 text-right">Klient</th>
                <th className="px-6 py-3 text-right">Qarz</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {!yuklandi && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {yuklandi && qatorlar.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    Agent yo‘q. «Agent qo‘shish» tugmasi bilan qo‘shing.
                  </td>
                </tr>
              )}
              {qatorlar.map((a) => (
                <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-6 py-3">
                    <div className="font-semibold text-gray-900">{a.ism}</div>
                    {!a.faol && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        bloklangan
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-500">{a.rayon ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{a.telefon}</td>
                  <td className="px-6 py-3">
                    {a.ulangan ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                        ✓ ulangan
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                        kutilmoqda
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">{a.klientlar}</td>
                  <td
                    className={`px-6 py-3 text-right font-bold ${
                      a.qarz > 0 ? 'text-red-500' : a.qarz < 0 ? 'text-emerald-600' : 'text-gray-500'
                    }`}
                  >
                    {formatSum(a.qarz)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setOchiq({ agent: a })}
                        className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-brand"
                      >
                        Tahrirlash
                      </button>
                      {a.ulangan && (
                        <button
                          onClick={() => uzish(a)}
                          className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                        >
                          Uzish
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ochiq && (
        <AgentModal
          agent={ochiq.agent}
          onClose={() => setOchiq(null)}
          onSaved={() => {
            xabarKorsat('✅ Saqlandi');
            yukla();
          }}
        />
      )}
    </div>
  );
}
