import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// SKLADLAR ARO NARX SOLISHTIRISH
//
// Katalog dorini har skladda ALOHIDA QATOR qilib ko'rsatadi: bir xil nom
// uch joyda uch qatorda, orasida yuzlab boshqa dori. "Qaysi skladda
// arzon?" degan savolga javob berish uchun ko'z bilan qidirish kerak edi.
//
// Bu yerda aksincha: qator — DORI NOMI, ustun — SKLAD. Bir qarashda uch
// narx yonma-yon turadi.
//
// NARX TANNARXDA (base_price), ustama QO'YILMAGAN holda. Sabab: ustama
// har skladda har xil, ya'ni sotuv narxi skladning arzonligini emas,
// bizning ustamamizni ko'rsatadi. Ta'minotchini tanlashda esa aynan
// tannarx kerak.
//
// Guruhlash NOM bo'yicha (name_norm): bir dori ikki skladda har xil
// yozilgan ishlab chiqaruvchi bilan kelishi mumkin — bazada ikki qator,
// odam uchun esa bitta dori. Katakning izohida (title) o'sha skladdagi
// ishlab chiqaruvchi turadi: narx farqi ko'pincha shundan chiqadi.
// ============================================================================

type Sklad = { id: string; name: string };

type Hujayra = {
  narx: number;
  /** Shu skladda shu nomdagi nechta taklif bor (ishlab chiqaruvchi har xil) */
  soni: number;
  qoldiq: number;
  ic: string | null;
};

type Qator = {
  nom: string;
  nom_norm: string;
  skladlar_soni: number;
  min_narx: number;
  max_narx: number;
  farq: number;
  farq_foiz: number;
  hujayralar: Record<string, Hujayra>;
};

type Saralash = 'nom' | 'farq' | 'skladlar';

const SARALASHLAR: { key: Saralash; nom: string; izoh: string }[] = [
  { key: 'nom', nom: 'NOM', izoh: 'alifbo bo‘yicha' },
  { key: 'farq', nom: 'FARQ', izoh: 'eng katta farq yuqorida' },
  { key: 'skladlar', nom: 'SKLAD SONI', izoh: 'hamma skladda bori yuqorida' },
];

const SAHIFA = 100;

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export default function NarxSolishtirish() {
  const [skladlar, setSkladlar] = useState<Sklad[]>([]);
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [jami, setJami] = useState(0);
  const [q, setQ] = useState('');
  const [faqatUmumiy, setFaqatUmumiy] = useState(true);
  const [saralash, setSaralash] = useState<Saralash>('nom');
  const [ofset, setOfset] = useState(0);
  const [yuklandi, setYuklandi] = useState(false);
  const [ish, setIsh] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(
    async (qidiruv: string, umumiy: boolean, sara: Saralash, off: number) => {
      setIsh(true);
      const { data, error } = await supabase.rpc('dori_narx_solishtir', {
        p_q: qidiruv || null,
        p_faqat_umumiy: umumiy,
        p_saralash: sara,
        p_offset: off,
        p_limit: SAHIFA,
      });
      setIsh(false);
      setYuklandi(true);
      if (error) { setXato('O‘qib bo‘lmadi: ' + error.message); return; }
      setXato(null);
      const d = data as { skladlar: Sklad[]; jami: number; items: Qator[] };
      setSkladlar(d?.skladlar ?? []);
      setJami(Number(d?.jami ?? 0));
      setQatorlar(off === 0 ? (d?.items ?? []) : (p) => [...p, ...(d?.items ?? [])]);
    },
    [],
  );

  // Qidiruvda har harfga so'rov ketmasin: 9 000 nom ustidan guruhlash
  // arzon emas va operator yozib bo'lgunicha bir necha so'rov ketardi.
  useEffect(() => {
    const t = setTimeout(() => {
      setOfset(0);
      yukla(q, faqatUmumiy, saralash, 0);
    }, 250);
    return () => clearTimeout(t);
  }, [q, faqatUmumiy, saralash, yukla]);

  const inpStyle = {
    background: C.field,
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
  };

  return (
    <div>
      {xato && (
        <div className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
             style={{ color: C.danger, border: `1px solid ${C.danger}`, background: sh(C.danger, 8) }}>
          <span>{xato}</span>
          <button onClick={() => setXato(null)} style={{ color: C.danger }}>✕</button>
        </div>
      )}

      <div className="mb-3 text-[11px]" style={{ color: C.text }}>
        Qator — dori nomi, ustun — sklad. Narx <b style={{ color: C.textBright }}>TANNARXDA</b>,
        ustama qo‘yilmagan holda: ustama har skladda har xil, u skladning arzonligini
        emas, bizning foydamizni ko‘rsatadi.
      </div>

      {/* ---------- qidiruv va saralash ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="dori nomi yoki ishlab chiqaruvchi — kirill yoki lotin"
          className="px-3 py-2 text-[13px] outline-none"
          style={{ ...inpStyle, width: 340 }}
        />

        <label className="flex cursor-pointer items-center gap-2 text-[11px]" style={{ color: C.text }}>
          <input type="checkbox" checked={faqatUmumiy}
                 onChange={(e) => setFaqatUmumiy(e.target.checked)} />
          faqat bir nechta skladda bori
        </label>

        <span className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: sh(C.text, 80) }}>SARALASH</span>
          {SARALASHLAR.map((s) => (
            <button
              key={s.key}
              onClick={() => setSaralash(s.key)}
              title={s.izoh}
              className="px-2 py-1 text-[10px] font-bold tracking-[0.1em]"
              style={{
                color: saralash === s.key ? C.onAccent : C.text,
                background: saralash === s.key ? C.neon : 'transparent',
                border: `1px solid ${saralash === s.key ? C.neon : C.line}`,
                borderRadius: RADIUS,
              }}
            >
              {s.nom}
            </button>
          ))}
        </span>

        <span className="text-[12px]" style={{ color: C.text }}>
          topildi: <b style={{ color: C.neon }}>{son(jami)}</b>
        </span>
        {ish && <span className="text-[11px]" style={{ color: C.neon2 }}>Yuklanmoqda…</span>}
      </div>

      {/* ---------- jadval ---------- */}
      <div className="overflow-x-auto"
           style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <table className="w-full text-[11px]"
               style={{ borderCollapse: 'collapse', minWidth: 480 + skladlar.length * 130 }}>
          <thead>
            <tr style={{ color: sh(C.text, 80) }}>
              <th className="px-2 py-2 text-left text-[9px] font-bold tracking-[0.14em]"
                  style={{ borderBottom: `1px solid ${C.line}`, minWidth: 260 }}>
                DORI
              </th>
              {skladlar.map((w) => (
                <th key={w.id} className="px-2 py-2 text-right text-[9px] font-bold tracking-[0.14em]"
                    style={{ borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap', color: C.neon2 }}>
                  {w.name}
                </th>
              ))}
              <th className="px-2 py-2 text-right text-[9px] font-bold tracking-[0.14em]"
                  style={{ borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>
                FARQ
              </th>
            </tr>
          </thead>
          <tbody>
            {qatorlar.map((r, i) => (
              <tr key={r.nom_norm} style={{ background: i % 2 ? C.zebra : 'transparent' }}>
                <td className="px-2 py-1.5" style={{ color: C.textBright }}>
                  {r.nom}
                  <span className="ml-1 text-[10px]" style={{ color: sh(C.text, 70) }}>
                    · {r.skladlar_soni} skladda
                  </span>
                </td>

                {skladlar.map((w) => {
                  const h = r.hujayralar[w.id];
                  if (!h) {
                    return (
                      <td key={w.id} className="px-2 py-1.5 text-right" style={{ color: sh(C.text, 45) }}>
                        —
                      </td>
                    );
                  }
                  // Eng arzon va eng qimmat ajratiladi: jadval bo'ylab
                  // raqamlarni solishtirib chiqish shusiz ko'z ishi edi
                  const arzon = Number(h.narx) === Number(r.min_narx);
                  const qimmat = Number(h.narx) === Number(r.max_narx) && r.skladlar_soni > 1;
                  return (
                    <td
                      key={w.id}
                      className="px-2 py-1.5 text-right"
                      title={[
                        h.ic ?? 'ishlab chiqaruvchi ko‘rsatilmagan',
                        `qoldiq ${son(h.qoldiq)}`,
                        h.soni > 1 ? `${h.soni} ta taklif, eng arzoni ko‘rsatilgan` : null,
                      ].filter(Boolean).join(' · ')}
                      style={{
                        color: arzon ? C.neon : qimmat ? C.danger : C.textBright,
                        fontWeight: arzon || qimmat ? 700 : 400,
                        whiteSpace: 'nowrap',
                        background: arzon && r.skladlar_soni > 1 ? sh(C.neon, 8) : 'transparent',
                      }}
                    >
                      {son(h.narx)}
                      {h.soni > 1 && (
                        <span className="ml-1 text-[9px]" style={{ color: C.warn }}>×{h.soni}</span>
                      )}
                    </td>
                  );
                })}

                <td className="px-2 py-1.5 text-right" style={{ whiteSpace: 'nowrap' }}>
                  {r.skladlar_soni > 1 ? (
                    <>
                      <span style={{ color: C.textBright }}>{son(r.farq)}</span>
                      <span className="ml-1" style={{ color: C.warn }}>
                        {son(r.farq_foiz)}%
                      </span>
                    </>
                  ) : (
                    <span style={{ color: sh(C.text, 45) }}>—</span>
                  )}
                </td>
              </tr>
            ))}

            {qatorlar.length === 0 && yuklandi && !ish && (
              <tr>
                <td colSpan={skladlar.length + 2} className="px-4 py-8 text-center text-[12px]"
                    style={{ color: C.text }}>
                  {faqatUmumiy
                    ? 'Bir nechta skladda turgan bir xil nomli dori topilmadi. Belgini olib tashlab, hammasini ko‘ring.'
                    : 'Topilmadi.'}
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
              yukla(q, faqatUmumiy, saralash, y);
            }}
            className="w-full py-2 text-[11px] font-bold"
            style={{ color: C.text, borderTop: `1px solid ${C.line}` }}
          >
            YANA {son(Math.min(SAHIFA, jami - qatorlar.length))} TA
          </button>
        )}
      </div>

      <div className="mt-2 text-[10px]" style={{ color: sh(C.text, 70) }}>
        <b style={{ color: C.neon }}>yashil</b> — eng arzon sklad ·{' '}
        <b style={{ color: C.danger }}>qizil</b> — eng qimmat ·{' '}
        <b style={{ color: C.warn }}>×2</b> — shu skladda bir xil nomdagi bir nechta taklif bor
        (eng arzoni ko‘rsatilgan) · katak ustiga olib borsangiz ishlab chiqaruvchi va qoldiq chiqadi
      </div>
    </div>
  );
}
