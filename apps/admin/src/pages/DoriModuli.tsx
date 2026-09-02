import { useCallback, useEffect, useState } from 'react';
import { tasdiqlaSoz } from '../components/Xabar';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// DORI — KATALOGNI SKLAD BO'YICHA KO'RISH
//
// Bu ekran endi YUKLASH joyi emas. Prays skladning ichida yuklanadi
// (SKLADLAR -> sklad -> PRAYS YUKLASH): u yerda sklad allaqachon
// tanlangan bo'ladi, ya'ni "qaysi skladga yozildi" degan xato umuman
// yuz bermaydi.
//
// Bu yerda esa hammasi ko'rinadi: sklad ustunini tanlaysiz va o'sha
// skladdagi dorilar chiqadi. HAMMASI tanlansa - dori har skladda
// alohida qator bo'lib turadi, chunki bir xil dori ikki skladda boshqa
// narxda bo'lishi mumkin va aynan shu farq muhim.
//
// Arxiv (o'qilgan fayllar nusxasi) ham shu yerda qoladi - u hujjat
// tarixi, skladga emas, umumiy modulga tegishli.
// ============================================================================

type Sklad = { id: string; name: string; is_default: boolean; pozitsiya: number };

type Qator = {
  id: string;
  name: string;
  manufacturer: string | null;
  grp: string | null;
  unit: string | null;
  sklad: string;
  warehouse_id: string;
  base_price: number | null;
  price: number | null;
  stock: number | null;
  muddat: string | null;
  seriya: string | null;
};

type Saqlangan = {
  id: string;
  created_at: string;
  file_name: string;
  supplier: string | null;
  rows_count: number;
  total_computed: number | null;
  jami_mos_emas: boolean;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const sana = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');

const SAHIFA = 100;

export default function DoriModuli() {
  const [skladlar, setSkladlar] = useState<Sklad[]>([]);
  // null = HAMMASI
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [jami, setJami] = useState(0);
  const [q, setQ] = useState('');
  const [ofset, setOfset] = useState(0);
  const [saqlanganlar, setSaqlanganlar] = useState<Saqlangan[]>([]);
  const [belgilangan, setBelgilangan] = useState<Set<string>>(new Set());
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const skladlarniYukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('dori_skladlar');
    if (error) { setXato('Skladlarni o‘qib bo‘lmadi: ' + error.message); return; }
    setSkladlar((data ?? []) as Sklad[]);
  }, []);

  const arxivYukla = useCallback(async () => {
    const { data } = await supabase.rpc('dori_invoice_list', { p_limit: 20 });
    setSaqlanganlar((data ?? []) as Saqlangan[]);
  }, []);

  const royxatYukla = useCallback(async (wh: string | null, qidiruv: string, off: number) => {
    setIsh('Yuklanmoqda...');
    const { data, error } = await supabase.rpc('dori_katalog_royxat', {
      p_warehouse_id: wh,
      p_q: qidiruv || null,
      p_offset: off,
      p_limit: SAHIFA,
    });
    setIsh(null);
    if (error) { setXato('O‘qib bo‘lmadi: ' + error.message); return; }
    const d = data as { jami: number; items: Qator[] };
    setJami(Number(d?.jami ?? 0));
    setQatorlar(off === 0 ? (d?.items ?? []) : (p) => [...p, ...(d?.items ?? [])]);
  }, []);

  useEffect(() => { skladlarniYukla(); arxivYukla(); }, [skladlarniYukla, arxivYukla]);
  useEffect(() => { royxatYukla(tanlangan, q, 0); setOfset(0); /* eslint-disable-next-line */ }, [tanlangan]);

  function qidir(s: string) {
    setQ(s);
    setOfset(0);
    royxatYukla(tanlangan, s, 0);
  }

  async function arxivniOchir() {
    const ids = [...belgilangan];
    if (!ids.length) return;
    if (!await tasdiqlaSoz(`${ids.length} ta arxiv yozuvi o‘chirilsinmi?\n\nKatalogdagi dorilarga ta'sir qilmaydi.`)) return;
    setIsh('O‘chirilmoqda...');
    const { error } = await supabase.rpc('dori_invoice_ochir', { p_ids: ids });
    setIsh(null);
    if (error) { setXato('O‘chirilmadi: ' + error.message); return; }
    setBelgilangan(new Set());
    await arxivYukla();
  }

  const inpStyle = {
    background: C.field,
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
  };

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && (
        <div className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
             style={{ color: C.danger, border: `1px solid ${C.danger}`, background: sh(C.danger, 8) }}>
          <span>{xato}</span>
          <button onClick={() => setXato(null)} style={{ color: C.danger }}>✕</button>
        </div>
      )}

      <div className="mb-3">
        <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
          DORI KATALOGI
        </div>
        <div className="text-[11px]" style={{ color: C.text }}>
          sklad bo‘yicha ko‘rish · prays SKLADLAR bo‘limida, skladning ichida yuklanadi
        </div>
      </div>

      {/* ---------- sklad ustunlari ---------- */}
      <div className="mb-3 flex flex-wrap gap-1">
        <Tab
          faol={tanlangan === null}
          nom="HAMMASI"
          izoh={`${skladlar.reduce((s, w) => s + Number(w.pozitsiya || 0), 0)} pozitsiya`}
          bos={() => setTanlangan(null)}
        />
        {skladlar.map((w) => (
          <Tab
            key={w.id}
            faol={tanlangan === w.id}
            nom={w.name}
            izoh={`${son(w.pozitsiya)} pozitsiya`}
            bos={() => setTanlangan(w.id)}
          />
        ))}
      </div>

      {/* ---------- qidiruv ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => qidir(e.target.value)}
          placeholder="dori nomi yoki ishlab chiqaruvchi — kirill yoki lotin"
          className="px-3 py-2 text-[13px] outline-none"
          style={{ ...inpStyle, width: 340 }}
        />
        <span className="text-[12px]" style={{ color: C.text }}>
          topildi: <b style={{ color: C.neon }}>{son(jami)}</b>
        </span>
        {ish && <span className="text-[11px]" style={{ color: C.neon2 }}>{ish}</span>}
      </div>

      {/* ---------- jadval ---------- */}
      <div className="mb-4 overflow-x-auto"
           style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ color: sh(C.text, 80) }}>
              {['DORI', 'ISHLAB CHIQARUVCHI', 'SKLAD', 'QOLDIQ', 'TANNARX', 'SOTUV', 'SERIYA', 'MUDDAT'].map((h) => (
                <th key={h} className="px-2 py-2 text-left text-[9px] font-bold tracking-[0.14em]"
                    style={{ borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {qatorlar.map((r, i) => (
              <tr key={r.warehouse_id + r.id} style={{ background: i % 2 ? C.zebra : 'transparent' }}>
                <td className="px-2 py-1.5" style={{ color: C.textBright, minWidth: 240 }}>{r.name}</td>
                <td className="px-2 py-1.5" style={{ color: C.text }}>{r.manufacturer ?? '—'}</td>
                <td className="px-2 py-1.5" style={{ color: C.neon2, whiteSpace: 'nowrap' }}>{r.sklad}</td>
                <td className="px-2 py-1.5" style={{ color: r.stock === null ? C.text : Number(r.stock) > 0 ? C.text : C.danger }}>
                  {r.stock === null ? '—' : son(r.stock)}
                </td>
                <td className="px-2 py-1.5" style={{ color: C.text }}>{son(r.base_price)}</td>
                <td className="px-2 py-1.5 font-bold" style={{ color: C.neon }}>{son(r.price)}</td>
                <td className="px-2 py-1.5" style={{ color: C.text }}>{r.seriya ?? '—'}</td>
                <td className="px-2 py-1.5" style={{ color: C.text, whiteSpace: 'nowrap' }}>{sana(r.muddat)}</td>
              </tr>
            ))}
            {qatorlar.length === 0 && !ish && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[12px]" style={{ color: C.text }}>
                  {q ? 'Topilmadi.' : 'Bu skladda hali prays yo‘q — SKLADLAR bo‘limidan yuklang.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {qatorlar.length < jami && (
          <button
            onClick={() => {
              const y = ofset + SAHIFA;
              setOfset(y);
              royxatYukla(tanlangan, q, y);
            }}
            className="w-full py-2 text-[11px] font-bold"
            style={{ color: C.text, borderTop: `1px solid ${C.line}` }}
          >
            YANA {son(Math.min(SAHIFA, jami - qatorlar.length))} TA
          </button>
        )}
      </div>

      {/* ---------- arxiv ---------- */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="px-4 py-2 text-[10px] font-bold tracking-[0.16em]"
             style={{ color: sh(C.text, 80), borderBottom: `1px solid ${C.line}` }}>
          O‘QILGAN FAYLLAR ARXIVI — {saqlanganlar.length}
          {belgilangan.size > 0 && (
            <>
              <button onClick={arxivniOchir} className="ml-3 px-2 py-1 text-[10px] font-bold"
                      style={{ color: C.danger, border: `1px solid ${C.danger}` }}>
                {belgilangan.size} TASINI O‘CHIRISH
              </button>
              <button onClick={() => setBelgilangan(new Set())} className="ml-1 px-2 py-1 text-[10px]"
                      style={{ color: C.text, border: `1px solid ${C.line}` }}>
                BEKOR
              </button>
            </>
          )}
        </div>

        {saqlanganlar.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px]" style={{ color: C.text }}>
            Arxiv bo‘sh.
          </div>
        )}

        {saqlanganlar.map((s, i) => (
          <div key={s.id} className="grid gap-3 px-4 py-2 text-[11px]"
               style={{
                 gridTemplateColumns: '26px 110px 1fr 100px 110px 90px',
                 borderTop: i ? `1px solid ${sh(C.line, 27)}` : 'none',
               }}>
            <input
              type="checkbox"
              checked={belgilangan.has(s.id)}
              onChange={(e) => {
                const y = new Set(belgilangan);
                if (e.target.checked) y.add(s.id); else y.delete(s.id);
                setBelgilangan(y);
              }}
            />
            <span style={{ color: sh(C.text, 80) }}>{sana(s.created_at)}</span>
            <span className="truncate" style={{ color: C.textBright }}>
              {s.file_name}
              {s.supplier ? <span style={{ color: sh(C.text, 60) }}> · {s.supplier}</span> : null}
            </span>
            <span style={{ color: C.text }}>{s.rows_count} qator</span>
            <span className="text-right" style={{ color: C.textBright }}>{son(s.total_computed)}</span>
            <span style={{ color: s.jami_mos_emas ? C.danger : C.neon }}>
              {s.jami_mos_emas ? 'jami ≠' : 'ok'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tab({ faol, nom, izoh, bos }: { faol: boolean; nom: string; izoh: string; bos: () => void }) {
  return (
    <button
      onClick={bos}
      className="px-3 py-2 text-left"
      style={{
        background: faol ? C.neon : 'transparent',
        color: faol ? C.onAccent : C.text,
        border: `1px solid ${faol ? C.neon : C.line}`,
        borderRadius: RADIUS,
      }}
    >
      <div className="text-[12px] font-bold tracking-[0.1em]">{nom}</div>
      <div className="text-[10px]" style={{ opacity: 0.75 }}>{izoh}</div>
    </button>
  );
}
