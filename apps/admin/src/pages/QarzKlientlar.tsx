import { useCallback, useEffect, useState } from 'react';
import { QarzBekorModal } from '../components/QarzBekorModal';
import { xabarKorsat } from '../components/Xabar';
import { formatSum, supabase } from '../lib/supabase';
import { altbilgi, blank, hujjatniYoz, logoniOl, oynaOch, sozlamaniOl, uslub } from '../lib/hujjat';
import { klientNomi, sanaYozuv, sverkaKitobi, sverkaTanasi } from '../lib/qarz-eksport';

// QARZDORLIK — klientlar va sverka.
//
// Klient ustiga bosilsa SVERKA ochiladi: davr bo'yicha chiqim, kirim
// (usullari bilan) va qoldiq, pastida har bir harakat.
//
// Paneldan ham chiqim/kirim yozish mumkin — agent botda bo'lmasa yoki
// admin o'zi kiritishi kerak bo'lsa. Yozish YO'LI BITTA: ikkalasi ham
// qarz_yozuv_qosh dan o'tadi, ya'ni chegara va tekshiruvlar bir joyda.

type Klient = {
  id: string;
  ism: string;
  familiya: string | null;
  apteka: string | null;
  telefon: string | null;
  agent_id: string | null;
  agent: string | null;
  faol: boolean;
  qarz: number;
};

type Amal = {
  id: string;
  tur: string;
  summa: number;
  sana: string;
  izoh: string | null;
  manba: string;
  usul: string | null;
  bekor: boolean;
  bekor_sabab: string | null;
};

type Sverka = {
  klient: any;
  boshlangich: number;
  chiqim: number;
  kirim: number;
  usullar: Record<string, number> | null;
  qoldiq: number;
  amallar: Amal[];
};

const USUL_NOM: Record<string, string> = {
  naqd: '💵 Naqd',
  plastik: '💳 Plastik',
  klik: '🔵 Click',
};

const DAVRLAR = [
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
  if (kalit === 'oy') return { dan: `${h.getFullYear()}-${ik(h.getMonth() + 1)}-01T00:00:00`, gacha: null };
  if (kalit === 'yil') return { dan: `${h.getFullYear()}-01-01T00:00:00`, gacha: null };
  return { dan: null, gacha: null };
}

// Sana qo'lda: toLocaleString ICU qirqilgan muhitda RangeError beradi
function sanaVaqt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const ik = (n: number) => String(n).padStart(2, '0');
  return `${ik(d.getDate())}.${ik(d.getMonth() + 1)}.${d.getFullYear()} ${ik(d.getHours())}:${ik(d.getMinutes())}`;
}

function qarzRang(n: number): string {
  return n > 0 ? 'text-red-600' : n < 0 ? 'text-emerald-600' : 'text-gray-500';
}

// ---------- Yozuv qo'shish oynasi ----------
function YozuvModal({
  klient,
  tur,
  onClose,
  onSaved,
}: {
  klient: Klient;
  tur: 'chiqim' | 'kirim';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [summa, setSumma] = useState('');
  const [usul, setUsul] = useState('naqd');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [x, setX] = useState<string | null>(null);

  const n = Number(summa.replace(/\D/g, '')) || 0;
  const yangiQarz = tur === 'chiqim' ? klient.qarz + n : klient.qarz - n;

  async function saqla() {
    setX(null);
    if (n <= 0) return setX('Summani kiriting');
    setBand(true);
    try {
      const { error } = await supabase.rpc('qarz_yozuv_qosh', {
        p_client_id: klient.id,
        p_tur: tur,
        p_summa: n,
        p_izoh: izoh.trim() || null,
        p_sana: null,
        p_agent_id: null,
        p_usul: tur === 'kirim' ? usul : null,
      });
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      setX(String(e?.message ?? e));
    } finally {
      setBand(false);
    }
  }

  const chiqimmi = tur === 'chiqim';
  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">
            {chiqimmi ? '📦 Tovar chiqimi' : '💰 Pul kirimi'}
          </h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">{klient.apteka || klient.ism}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">SUMMA (SO‘M) *</label>
            <input
              value={n ? n.toLocaleString('ru-RU') : ''}
              onChange={(e) => setSumma(e.target.value)}
              className={inputCls + ' text-lg font-bold'}
              placeholder="1 250 000"
              autoFocus
            />
          </div>

          {!chiqimmi && (
            <div>
              <label className="text-xs font-semibold text-gray-500">TO‘LOV USULI</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {Object.entries(USUL_NOM).map(([k, nom]) => (
                  <button
                    key={k}
                    onClick={() => setUsul(k)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                      usul === k
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500">IZOH (ixtiyoriy)</label>
            <input value={izoh} onChange={(e) => setIzoh(e.target.value)} className={inputCls} />
          </div>

          {/* Natijani OLDINDAN ko'rsatamiz: xato summa kiritilsa
              saqlashdan oldin bilinadi */}
          <div className="rounded-xl bg-gray-50 p-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Hozirgi qarz</span>
              <b className={qarzRang(klient.qarz)}>{formatSum(klient.qarz)}</b>
            </div>
            <div className="mt-1 flex justify-between text-gray-600">
              <span>{chiqimmi ? 'Chiqim' : 'To‘lov'}</span>
              <b>{chiqimmi ? '+' : '−'}{formatSum(n)}</b>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-gray-900">
              <span className="font-semibold">Qolgan qarz</span>
              <b className={qarzRang(yangiQarz)}>{formatSum(yangiQarz)}</b>
            </div>
          </div>
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
            disabled={band}
            className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {band ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Sverka oynasi ----------
function SverkaModal({ klient, onClose, onOzgardi }: { klient: Klient; onClose: () => void; onOzgardi: () => void }) {
  const [davr, setDavr] = useState('oy');
  const [s, setS] = useState<Sverka | null>(null);
  const [yozuv, setYozuv] = useState<'chiqim' | 'kirim' | null>(null);
  const [bekorAmal, setBekorAmal] = useState<Amal | null>(null);

  const yukla = useCallback(async () => {
    const d = davrOraliq(davr);
    const { data, error } = await supabase.rpc('qarz_sverka', {
      p_client_id: klient.id,
      p_dan: d.dan,
      p_gacha: d.gacha,
      p_agent_id: null,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      return;
    }
    setS(data as unknown as Sverka);
  }, [klient.id, davr]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  // Sabab HAR SAFAR so'raladi. Avval qattiq yozilgan bir xil matn
  // ketardi — jurnalda qator ko'p, ma'lumot esa nol bo'lardi.
  async function bekor(sabab: string) {
    if (!bekorAmal) return;
    const { error } = await supabase.rpc('qarz_yozuv_bekor', {
      p_id: bekorAmal.id,
      p_sabab: sabab,
      p_agent_id: null,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      return;
    }
    setBekorAmal(null);
    xabarKorsat('✅ Bekor qilindi');
    await yukla();
    onOzgardi();
  }

  const usullar = s?.usullar ?? {};
  const davrNomi = DAVRLAR.find((d) => d.key === davr)?.nom ?? '';

  async function excelga() {
    if (!s) return;
    try {
      const { data: soz } = await supabase
        .from('dori_settings')
        .select('firma_nomi')
        .maybeSingle();
      const bayt = await sverkaKitobi(
        s as any,
        (soz as any)?.firma_nomi || 'IDAA FARM',
        davrNomi,
      );
      const url = URL.createObjectURL(
        new Blob([bayt], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `sverka-${klientNomi(s.klient).replace(/[^\wа-яА-Я\- ]/g, '')}-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      xabarKorsat('❌ ' + (e?.message ?? 'Hujjat yasalmadi'));
    }
  }

  async function chopEt() {
    if (!s) return;
    // Oyna DARHOL ochiladi — await'dan keyin ochilsa brauzer bloklaydi
    // va hech qanday xato ham chiqmaydi
    const w = oynaOch();
    if (!w) return;
    const soz = await sozlamaniOl();
    const logo = await logoniOl(soz);
    hujjatniYoz(w, {
      nom: 'Sverka — ' + klientNomi(s.klient),
      uslub: uslub(soz),
      tana:
        blank(soz, null, logo, { turi: 'SVERKA', sana: sanaYozuv(new Date()) }) +
        sverkaTanasi(s as any, davrNomi) +
        altbilgi(soz),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">
              {klient.apteka || klient.ism}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {[klient.ism, klient.familiya].filter(Boolean).join(' ')}
              {klient.telefon ? ` · ${klient.telefon}` : ''}
              {klient.agent ? ` · agent: ${klient.agent}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-xl border border-gray-200">
            {DAVRLAR.map((d) => (
              <button
                key={d.key}
                onClick={() => setDavr(d.key)}
                className={`px-4 py-2 text-sm font-bold transition ${
                  davr === d.key ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {d.nom}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={excelga}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:border-brand"
            >
              📥 Excel
            </button>
            <button
              onClick={chopEt}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:border-brand"
            >
              📄 PDF / Chop etish
            </button>
            <button
              onClick={() => setYozuv('chiqim')}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:border-brand"
            >
              📦 Chiqim
            </button>
            <button
              onClick={() => setYozuv('kirim')}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              💰 Kirim
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase text-gray-500">Boshlang‘ich</div>
            <div className="mt-1 text-lg font-extrabold text-gray-900">
              {formatSum(s?.boshlangich ?? 0)}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase text-gray-500">Chiqim</div>
            <div className="mt-1 text-lg font-extrabold text-gray-900">{formatSum(s?.chiqim ?? 0)}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase text-emerald-700">Kirim</div>
            <div className="mt-1 text-lg font-extrabold text-emerald-700">
              {formatSum(s?.kirim ?? 0)}
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-emerald-700">
              {Object.entries(usullar)
                .filter(([, v]) => Number(v) > 0)
                .map(([k, v]) => (
                  <div key={k}>
                    {USUL_NOM[k] ?? k}: {formatSum(Number(v))}
                  </div>
                ))}
            </div>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="text-xs font-semibold uppercase text-red-600">Qoldiq</div>
            <div className="mt-1 text-lg font-extrabold text-red-600">{formatSum(s?.qoldiq ?? 0)}</div>
          </div>
        </div>

        <div className="mt-6 max-h-[45vh] overflow-y-auto">
          {(s?.amallar ?? []).length === 0 && (
            <p className="py-8 text-center text-gray-500">Bu davrda harakat yo‘q.</p>
          )}
          {(s?.amallar ?? []).map((a) => (
            <div
              key={a.id}
              className={`flex flex-wrap items-center gap-3 border-b border-gray-50 py-3 ${
                a.bekor ? 'opacity-50' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  {a.tur === 'chiqim' ? '📦 Tovar chiqimi' : '💰 Pul kirimi'}
                  {a.usul ? ` · ${USUL_NOM[a.usul] ?? a.usul}` : ''}
                  {a.manba === 'telegram' ? ' · 🤖' : ''}
                </div>
                <div className="text-xs text-gray-500">
                  {sanaVaqt(a.sana)}
                  {a.izoh ? ` · ${a.izoh}` : ''}
                  {a.bekor ? ` · BEKOR: ${a.bekor_sabab ?? ''}` : ''}
                </div>
              </div>
              <div
                className={`shrink-0 font-bold ${
                  a.tur === 'chiqim' ? 'text-gray-900' : 'text-emerald-600'
                }`}
              >
                {a.tur === 'chiqim' ? '+' : '−'}
                {formatSum(a.summa)}
              </div>
              {!a.bekor && (
                <button
                  onClick={() => setBekorAmal(a)}
                  className="shrink-0 rounded-xl border border-red-200 px-3 py-1 text-xs font-bold text-red-500 hover:bg-red-50"
                >
                  Bekor
                </button>
              )}
            </div>
          ))}
        </div>

        {yozuv && (
          <YozuvModal
            klient={{ ...klient, qarz: s?.qoldiq ?? klient.qarz }}
            tur={yozuv}
            onClose={() => setYozuv(null)}
            onSaved={async () => {
              xabarKorsat('✅ Saqlandi');
              await yukla();
              onOzgardi();
            }}
          />
        )}

        {bekorAmal && (
          <QarzBekorModal
            sarlavha={
              (bekorAmal.tur === 'chiqim' ? 'Tovar chiqimi' : 'Pul kirimi') +
              ' — ' +
              formatSum(bekorAmal.summa)
            }
            tafsilot={sanaVaqt(bekorAmal.sana)}
            onYopish={() => setBekorAmal(null)}
            onTasdiq={bekor}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Klient qo'shish / tahrirlash ----------
function KlientModal({
  klient,
  agentlar,
  onClose,
  onSaved,
}: {
  klient: Klient | null;
  agentlar: { id: string; ism: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ism, setIsm] = useState(klient?.ism ?? '');
  const [familiya, setFamiliya] = useState(klient?.familiya ?? '');
  const [apteka, setApteka] = useState(klient?.apteka ?? '');
  const [telefon, setTelefon] = useState(klient?.telefon ?? '');
  const [agentId, setAgentId] = useState(klient?.agent_id ?? '');
  const [faol, setFaol] = useState(klient?.faol ?? true);
  const [band, setBand] = useState(false);
  const [x, setX] = useState<string | null>(null);

  async function saqla() {
    setX(null);
    if (!ism.trim()) return setX('Ism majburiy');
    setBand(true);
    try {
      const { error } = await supabase.rpc('qarz_klient_saqla', {
        p_id: klient?.id ?? null,
        p_ism: ism.trim(),
        p_familiya: familiya.trim() || null,
        p_apteka: apteka.trim() || null,
        p_telefon: telefon.trim() || null,
        p_agent_id: agentId || null,
        p_izoh: null,
        p_faol: faol,
      });
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      setX(String(e?.message ?? e));
    } finally {
      setBand(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900">
            {klient ? '✏️ Klientni tahrirlash' : '➕ Yangi klient'}
          </h2>
          <button onClick={onClose} className="text-2xl text-gray-300 hover:text-gray-500">
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-500">ISM *</label>
              <input value={ism} onChange={(e) => setIsm(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">FAMILIYA</label>
              <input
                value={familiya}
                onChange={(e) => setFamiliya(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">APTEKA NOMI</label>
            <input value={apteka} onChange={(e) => setApteka(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">TELEFON</label>
            <input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              className={inputCls}
              placeholder="+998 90 123 45 67"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">AGENT</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className={inputCls}
            >
              <option value="">— biriktirilmagan —</option>
              {agentlar.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ism}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Agent biriktirilmasa, klient <b>Telegram botda ko‘rinmaydi</b> — bot
              «faqat o‘z klienti» qoidasiga tayanadi.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={faol} onChange={(e) => setFaol(e.target.checked)} />
            Faol
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
            disabled={band}
            className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {band ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Asosiy ekran ----------
export default function QarzKlientlar() {
  const [qatorlar, setQatorlar] = useState<Klient[]>([]);
  const [yuklandi, setYuklandi] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [tanlangan, setTanlangan] = useState<Klient | null>(null);
  const [tahrir, setTahrir] = useState<{ klient: Klient | null } | null>(null);
  const [agentlar, setAgentlar] = useState<{ id: string; ism: string }[]>([]);

  useEffect(() => {
    supabase.rpc('qarz_agentlar').then(({ data }) => {
      setAgentlar(((data ?? []) as any[]).map((a) => ({ id: a.id, ism: a.ism })));
    });
  }, []);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('qarz_klientlar', {
      p_agent_id: null,
      p_q: qidiruv.trim() || null,
    });
    if (error) {
      xabarKorsat('❌ ' + error.message);
      setYuklandi(true);
      return;
    }
    setQatorlar((data ?? []) as Klient[]);
    setYuklandi(true);
  }, [qidiruv]);

  useEffect(() => {
    const t = setTimeout(yukla, 250);
    return () => clearTimeout(t);
  }, [yukla]);

  const jami = qatorlar.reduce((s, k) => s + Number(k.qarz || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={qidiruv}
          onChange={(e) => setQidiruv(e.target.value)}
          placeholder="Ism, apteka yoki telefon"
          className="min-w-[16rem] flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
        />
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm">
          <span className="text-gray-500">Jami qarz: </span>
          <b className={qarzRang(jami)}>{formatSum(jami)}</b>
        </div>
        <button
          onClick={() => setTahrir({ klient: null })}
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 hover:opacity-90"
        >
          ➕ Klient qo‘shish
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-6 py-3">Klient</th>
                <th className="px-6 py-3">Telefon</th>
                <th className="px-6 py-3">Agent</th>
                <th className="px-6 py-3 text-right">Qarz</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {!yuklandi && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    Yuklanmoqda...
                  </td>
                </tr>
              )}
              {yuklandi && qatorlar.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    Klient yo‘q. Ularni agentlar Telegram bot orqali qo‘shadi.
                  </td>
                </tr>
              )}
              {qatorlar.map((k) => (
                <tr
                  key={k.id}
                  onClick={() => setTanlangan(k)}
                  className="cursor-pointer border-t border-gray-50 hover:bg-gray-50/60"
                >
                  <td className="px-6 py-3">
                    <div className="font-semibold text-gray-900">{k.apteka || k.ism}</div>
                    {k.apteka && (
                      <div className="text-xs text-gray-500">
                        {[k.ism, k.familiya].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{k.telefon ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-500">{k.agent ?? '—'}</td>
                  <td className={`px-6 py-3 text-right font-bold ${qarzRang(k.qarz)}`}>
                    {formatSum(k.qarz)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {/* Qator bosilsa sverka ochiladi — tugma o'sha
                        bosishni to'sib qolishi kerak */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTahrir({ klient: k });
                      }}
                      className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:border-brand"
                    >
                      Tahrirlash
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {tanlangan && (
        <SverkaModal
          klient={tanlangan}
          onClose={() => setTanlangan(null)}
          onOzgardi={yukla}
        />
      )}

      {tahrir && (
        <KlientModal
          klient={tahrir.klient}
          agentlar={agentlar}
          onClose={() => setTahrir(null)}
          onSaved={() => {
            xabarKorsat('✅ Saqlandi');
            yukla();
          }}
        />
      )}
    </div>
  );
}
