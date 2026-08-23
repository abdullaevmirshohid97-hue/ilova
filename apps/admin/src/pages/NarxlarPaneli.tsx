import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================================
// NARX QO'YISH — ustama foiz va chegirma.
//
// Fayldan kelgan narx TANNARX bo'lib qoladi va mijozga ko'rinmaydi.
// Bu yerda ustiga qoida qo'yiladi, sotuv narxi shundan hisoblanadi.
//
// Har o'zgarishdan OLDIN oldindan ko'rish: nechta dori narxi o'zgaradi va
// misollari. Bazaga faqat tasdiqlagach yoziladi — 6900 dorining narxini
// tasodifan buzib qo'yish juda oson bo'lardi.
// ============================================================================

const C = {
  panel: '#0a1014',
  panel2: '#0d151a',
  line: '#16323a',
  neon: '#00e8c6',
  neon2: '#05d1ff',
  text: '#8fa8b0',
  textBright: '#d6ebf0',
  warn: '#ffb454',
  danger: '#ff3b5c',
};
const MONO = "ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";

type Umumiy = {
  jami: number;
  yaxlitlash: number;
  umumiy_ustama: number | null;
  umumiy_chegirma: number | null;
  ortacha_ustama: number | null;
  guruhlar: { grp: string; n: number }[];
};

type Qoida = {
  id: string;
  scope: 'global' | 'group' | 'product';
  target_key: string | null;
  nishon: string | null;
  markup_pct: number | null;
  discount_pct: number | null;
  note: string | null;
};

type Korish = {
  dorilar: number;
  ozgaradi: number;
  namuna: { name: string; tannarx: number; hozirgi: number; yangi: number }[];
};

type Dori = {
  id: string;
  name: string;
  grp: string | null;
  tannarx: number;
  sotuv: number;
  oz_ustamasi: number | null;
  oz_chegirmasi: number | null;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const SCOPE_NOM: Record<string, string> = {
  global: 'Hamma doriga',
  group: 'Guruh',
  product: 'Alohida dori',
};

export default function NarxlarPaneli() {
  const [umumiy, setUmumiy] = useState<Umumiy | null>(null);
  const [qoidalar, setQoidalar] = useState<Qoida[]>([]);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  // umumiy ustama
  const [ustama, setUstama] = useState('');
  const [chegirma, setChegirma] = useState('');
  const [korish, setKorish] = useState<Korish | null>(null);

  // tanlangan dorilar
  const [q, setQ] = useState('');
  const [topilgan, setTopilgan] = useState<Dori[]>([]);
  const [tanlangan, setTanlangan] = useState<Record<string, Dori>>({});
  const [tanlUstama, setTanlUstama] = useState('');
  const [tanlChegirma, setTanlChegirma] = useState('');

  const yukla = useCallback(async () => {
    const [o, r] = await Promise.all([
      supabase.rpc('dori_price_overview'),
      supabase.rpc('dori_price_rules_list'),
    ]);
    setUmumiy((o.data ?? null) as Umumiy | null);
    setQoidalar((r.data ?? []) as Qoida[]);
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const foiz = (s: string): number | null => {
    const t = s.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  async function oldindanKor() {
    setXato(null);
    setXabar(null);
    setIsh('Hisoblanmoqda...');
    const { data, error } = await supabase.rpc('dori_price_preview', {
      p_scope: 'global',
      p_target_key: null,
      p_markup_pct: foiz(ustama),
      p_discount_pct: foiz(chegirma),
    });
    setIsh(null);
    if (error) return setXato(error.message);
    setKorish(data as Korish);
  }

  async function umumiyQolla() {
    setIsh('Narxlar yangilanmoqda...');
    const { data, error } = await supabase.rpc('dori_price_rule_set', {
      p_scope: 'global',
      p_target_key: null,
      p_markup_pct: foiz(ustama),
      p_discount_pct: foiz(chegirma),
      p_note: null,
    });
    setIsh(null);
    if (error) return setXato(error.message);
    setKorish(null);
    setXabar(`Qo‘llandi: ${(data as any)?.ozgargan_narx ?? 0} ta dori narxi yangilandi.`);
    yukla();
  }

  async function qidir(matn: string) {
    setQ(matn);
    if (matn.trim().length < 2) return setTopilgan([]);
    const { data } = await supabase.rpc('dori_admin_search', { p_q: matn, p_limit: 30 });
    setTopilgan((data ?? []) as Dori[]);
  }

  function tanla(d: Dori) {
    setTanlangan((t) => {
      const yangi = { ...t };
      if (yangi[d.id]) delete yangi[d.id];
      else yangi[d.id] = d;
      return yangi;
    });
  }

  async function tanlanganlargaQolla() {
    const ids = Object.keys(tanlangan);
    if (!ids.length) return setXato('Avval dori tanlang');
    setIsh('Tanlanganlarga qo‘llanmoqda...');
    const { data, error } = await supabase.rpc('dori_price_rule_bulk', {
      p_ids: ids,
      p_markup_pct: foiz(tanlUstama),
      p_discount_pct: foiz(tanlChegirma),
      p_note: null,
    });
    setIsh(null);
    if (error) return setXato(error.message);
    setXabar(
      `${(data as any)?.dorilar ?? 0} ta doriga qo‘llandi, ${(data as any)?.ozgargan_narx ?? 0} ta narx yangilandi.`
    );
    setTanlangan({});
    setTanlUstama('');
    setTanlChegirma('');
    if (q) qidir(q);
    yukla();
  }

  async function qoidaniOchir(r: Qoida) {
    if (!confirm(`${SCOPE_NOM[r.scope]}${r.nishon ? ' · ' + r.nishon : ''} qoidasi o‘chirilsinmi?`)) return;
    setIsh('O‘chirilmoqda...');
    // Qoidani o'chirish = foizlarni bo'sh qilib yuborish. RPC shuni
    // "o'chirish" deb tushunadi va narxlarni qayta hisoblaydi.
    const { error } =
      r.scope === 'product'
        ? await supabase.rpc('dori_price_rule_bulk', {
            p_ids: [r.target_key],
            p_markup_pct: null,
            p_discount_pct: null,
          })
        : await supabase.rpc('dori_price_rule_set', {
            p_scope: r.scope,
            p_target_key: r.target_key,
            p_markup_pct: null,
            p_discount_pct: null,
          });
    setIsh(null);
    if (error) return setXato(error.message);
    yukla();
  }

  async function yaxlitlashniOzgartir(v: number) {
    await supabase.from('dori_settings').update({ rounding: v }).eq('id', true);
    await supabase.rpc('dori_narx_hisobla', { p_ids: null });
    yukla();
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';
  const inp = 'w-24 px-2 py-1.5 text-[13px] outline-none';
  const inpStyle = {
    background: '#060b0e',
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
  };

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon}>{xabar}</Xabar>}
      {ish && <Xabar rang={C.neon2}>{ish}</Xabar>}

      {/* ---------- holat ---------- */}
      {umumiy && (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <Quti sarlavha="KATALOGDA">
            <span className="text-2xl font-extrabold" style={{ color: C.neon }}>
              {son(umumiy.jami)}
            </span>
          </Quti>
          <Quti sarlavha="UMUMIY USTAMA">
            <span className="text-2xl font-extrabold" style={{ color: C.textBright }}>
              {umumiy.umumiy_ustama != null ? `${umumiy.umumiy_ustama}%` : '—'}
            </span>
          </Quti>
          <Quti sarlavha="O‘RTACHA USTAMA">
            <span className="text-2xl font-extrabold" style={{ color: C.neon2 }}>
              {umumiy.ortacha_ustama != null ? `${umumiy.ortacha_ustama}%` : '—'}
            </span>
          </Quti>
          <Quti sarlavha="YAXLITLASH">
            <select
              value={umumiy.yaxlitlash}
              onChange={(e) => yaxlitlashniOzgartir(Number(e.target.value))}
              className="w-full px-2 py-1 text-[12px] outline-none"
              style={inpStyle}
            >
              <option value={0}>yaxlitlamaslik</option>
              <option value={10}>10 so‘m</option>
              <option value={100}>100 so‘m</option>
              <option value={1000}>1000 so‘m</option>
            </select>
          </Quti>
        </div>
      )}

      {/* ---------- umumiy ustama ---------- */}
      <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${C.text}cc` }}>
          HAMMA DORIGA — USTAMA VA CHEGIRMA
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>USTAMA %</span>
            <input value={ustama} onChange={(e) => setUstama(e.target.value)} placeholder="5"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>CHEGIRMA %</span>
            <input value={chegirma} onChange={(e) => setChegirma(e.target.value)} placeholder="0"
                   className={inp} style={inpStyle} />
          </label>
          <button onClick={oldindanKor} className={btn}
                  style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}>
            OLDINDAN KO‘RISH
          </button>
          {korish && (
            <button onClick={umumiyQolla} className={btn}
                    style={{ color: '#05080a', background: C.neon, border: `1px solid ${C.neon}` }}>
              TASDIQLAB QO‘LLASH
            </button>
          )}
        </div>

        {korish && (
          <div className="mt-3" style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12 }}>
            <div className="text-[12px]" style={{ color: C.textBright }}>
              {son(korish.dorilar)} dori · <b style={{ color: C.warn }}>{son(korish.ozgaradi)}</b> tasining narxi o‘zgaradi
            </div>
            <div className="mt-2 grid gap-1">
              {korish.namuna.map((n, i) => (
                <div key={i} className="text-[11px]" style={{ color: C.text }}>
                  {n.name.slice(0, 46)} · tannarx {son(n.tannarx)} ·{' '}
                  <span style={{ color: C.text }}>{son(n.hozirgi)}</span> →{' '}
                  <b style={{ color: C.neon }}>{son(n.yangi)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- tanlanganlarga ---------- */}
      <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${C.text}cc` }}>
          TANLANGAN DORILARGA — CHEGIRMA YOKI ALOHIDA USTAMA
        </div>

        <input
          value={q}
          onChange={(e) => qidir(e.target.value)}
          placeholder="dori nomini yozing (kirill yoki lotin)..."
          className="mb-3 w-full max-w-md px-3 py-2 text-[13px] outline-none"
          style={inpStyle}
        />

        {topilgan.length > 0 && (
          <div className="mb-3 max-h-72 overflow-y-auto" style={{ border: `1px solid ${C.line}` }}>
            {topilgan.map((d, i) => {
              const belgilangan = !!tanlangan[d.id];
              return (
                <div
                  key={d.id}
                  onClick={() => tanla(d)}
                  className="grid cursor-pointer gap-3 px-3 py-2 text-[11px]"
                  style={{
                    gridTemplateColumns: '18px 1fr 90px 90px 70px',
                    background: belgilangan ? `${C.neon}18` : i % 2 ? '#0a1014' : 'transparent',
                    borderTop: i ? `1px solid ${C.line}44` : 'none',
                  }}
                >
                  <span style={{ color: belgilangan ? C.neon : C.text }}>{belgilangan ? '☑' : '☐'}</span>
                  <span className="truncate" style={{ color: C.textBright }}>{d.name}</span>
                  <span className="text-right" style={{ color: `${C.text}aa` }}>{son(d.tannarx)}</span>
                  <span className="text-right" style={{ color: C.textBright }}>{son(d.sotuv)}</span>
                  <span className="text-right" style={{ color: C.warn }}>
                    {d.oz_chegirmasi ? `−${d.oz_chegirmasi}%` : d.oz_ustamasi ? `+${d.oz_ustamasi}%` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[12px]" style={{ color: C.textBright }}>
            Tanlandi: <b style={{ color: C.neon }}>{Object.keys(tanlangan).length}</b>
          </span>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>USTAMA %</span>
            <input value={tanlUstama} onChange={(e) => setTanlUstama(e.target.value)} placeholder="—"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>CHEGIRMA %</span>
            <input value={tanlChegirma} onChange={(e) => setTanlChegirma(e.target.value)} placeholder="5"
                   className={inp} style={inpStyle} />
          </label>
          <button
            onClick={tanlanganlargaQolla}
            disabled={!Object.keys(tanlangan).length}
            className={btn}
            style={{
              color: '#05080a',
              background: C.warn,
              border: `1px solid ${C.warn}`,
              opacity: Object.keys(tanlangan).length ? 1 : 0.4,
            }}
          >
            SKIDKA / USTAMA QO‘YISH
          </button>
        </div>
      </div>

      {/* ---------- amaldagi qoidalar ---------- */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="px-4 py-2 text-[10px] font-bold tracking-[0.16em]"
             style={{ color: `${C.text}cc`, borderBottom: `1px solid ${C.line}` }}>
          AMALDAGI QOIDALAR — {qoidalar.length}
        </div>
        {qoidalar.length === 0 && (
          <div className="p-8 text-center text-[11px]" style={{ color: C.text }}>
            Qoida yo‘q — narx tannarxga teng
          </div>
        )}
        {qoidalar.map((r, i) => (
          <div key={r.id} className="grid gap-3 px-4 py-2 text-[11px]"
               style={{ gridTemplateColumns: '110px 1fr 80px 80px 30px', borderTop: i ? `1px solid ${C.line}44` : 'none' }}>
            <span style={{ color: `${C.text}cc` }}>{SCOPE_NOM[r.scope]}</span>
            <span className="truncate" style={{ color: C.textBright }}>{r.nishon ?? '—'}</span>
            <span className="text-right" style={{ color: C.neon }}>
              {r.markup_pct != null ? `+${r.markup_pct}%` : ''}
            </span>
            <span className="text-right" style={{ color: C.warn }}>
              {r.discount_pct != null ? `−${r.discount_pct}%` : ''}
            </span>
            <button onClick={() => qoidaniOchir(r)} style={{ color: `${C.text}88` }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Quti({ sarlavha, children }: { sarlavha: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}` }} className="p-3">
      <div className="mb-1 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${C.text}cc` }}>
        {sarlavha}
      </div>
      {children}
    </div>
  );
}

function Xabar({ rang, children }: { rang: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 px-3 py-2 text-[11px]"
         style={{ color: rang, background: `${rang}12`, border: `1px solid ${rang}55` }}>
      {children}
    </div>
  );
}
