import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// SOTILGAN FAKTURANI TAHRIRLASH
//
// Miqdor xato yozilgan, dori almashgan, mijoz noto'g'ri tanlangan —
// bunday hollarda sotuvni bekor qilib qaytadan qilish tarixni buzadi
// va faktura raqami ham o'zgaradi. Tuzatish kerak.
//
// UCH TO'SIQ ataylab qo'yilgan, chunki bu yakunlangan moliyaviy hujjat:
//
//   1. SABAB majburiy. Izsiz tahrir — hujjatni jimgina o'zgartirish.
//   2. Avval QURUQ SINOV: nima o'zgarishi va qoldiq qanchaga
//      siljishi ko'rsatiladi, keyin tasdiq.
//   3. Har tahrir IZ qoldiradi: kim, qachon, oldingi holat qanday edi.
//      Izni panel orqali o'chirib bo'lmaydi (RLS'da yozish siyosati yo'q).
//
// Bekor qilingan sotuv tahrirlanmaydi: uning qoldig'i allaqachon
// qaytarilgan, tahrir uni ikki marta qaytarardi.
// ============================================================================

type Qator = {
  product_id: string;
  name: string;
  manufacturer: string | null;
  qty: number;
  birlik: 'pachka' | 'dona';
  pachka: number;
  price: number;
  sklad_narx: number | null;
  stock: number | null;
  bor: boolean;
};

type Sotuv = {
  id: string;
  sale_no: number;
  status: string;
  warehouse_id: string;
  sklad: string | null;
  mijoz: string | null;
  pharmacy: string | null;
  comment: string | null;
  total: number;
  tahrirlar: number;
  qatorlar: Qator[];
};

type Topilgan = {
  id: string;
  name: string;
  manufacturer: string | null;
  price: number;
  stock: number | null;
  pachka: number;
};

type Quruq = {
  ok: boolean;
  error?: string;
  eski?: { total: number };
  yangi?: { total: number };
  qoldiq_ozgarishi?: { name: string; eski: number; yangi: number; farq: number }[];
  kam?: { name: string; kerak: number; bor: number }[];
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** Tanlangan birlikdagi narx — bazadagi dori_qator_hisob bilan bir xil */
function birlikNarx(pachkaNarx: number, pachka: number, birlik: 'pachka' | 'dona'): number {
  return birlik === 'dona' ? Math.ceil(pachkaNarx / Math.max(pachka || 1, 1)) : pachkaNarx;
}

export default function SotuvTahrir({
  saleId,
  yop,
  tayyor,
}: {
  saleId: string;
  yop: () => void;
  /** Saqlangach chaqiriladi — tashqaridagi ro'yxat yangilansin */
  tayyor: () => void;
}) {
  const [s, setS] = useState<Sotuv | null>(null);
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [sabab, setSabab] = useState('');
  const [izoh, setIzoh] = useState('');
  const [q, setQ] = useState('');
  const [topilgan, setTopilgan] = useState<Topilgan[]>([]);
  const [quruq, setQuruq] = useState<Quruq | null>(null);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    setIsh('Yuklanmoqda...');
    const { data, error } = await supabase.rpc('dori_sotuv_ochish', { p_sale_id: saleId });
    setIsh(null);
    if (error) return setXato('Ochilmadi: ' + error.message);
    const d = data as Sotuv | null;
    if (!d?.id) return setXato('Sotuv topilmadi');
    setS(d);
    setQatorlar(d.qatorlar ?? []);
    setIzoh(d.comment ?? '');
  }, [saleId]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  // Har o'zgarishdan keyin quruq sinov eskiradi — uni tozalaymiz,
  // aks holda operator eski hisobga qarab tasdiqlab yuborardi
  function ozgardi(f: (p: Qator[]) => Qator[]) {
    setQatorlar(f);
    setQuruq(null);
  }

  async function qidir(v: string) {
    setQ(v);
    if (!s || v.trim().length < 2) return setTopilgan([]);
    const { data, error } = await supabase.rpc('dori_sotuv_qidir', {
      p_warehouse_id: s.warehouse_id,
      p_q: v,
      p_limit: 15,
    });
    if (error) return setXato('Qidiruv xatosi: ' + error.message);
    setTopilgan((data ?? []) as Topilgan[]);
  }

  function qoshish(d: Topilgan) {
    ozgardi((p) =>
      p.some((x) => x.product_id === d.id)
        ? p.map((x) => (x.product_id === d.id ? { ...x, qty: Number(x.qty) + 1 } : x))
        : [
            ...p,
            {
              product_id: d.id,
              name: d.name,
              manufacturer: d.manufacturer,
              qty: 1,
              birlik: 'pachka',
              pachka: d.pachka,
              price: d.price,
              sklad_narx: d.price,
              stock: d.stock,
              bor: true,
            },
          ],
    );
    setQ('');
    setTopilgan([]);
  }

  const qoladi = qatorlar.filter((x) => Number(x.qty) > 0);
  const yangiJami = qoladi.reduce(
    (a, x) => a + birlikNarx(Number(x.sklad_narx ?? x.price), x.pachka, x.birlik) * Number(x.qty),
    0,
  );
  const yoq = qoladi.filter((x) => !x.bor);

  function tanaYasa(qollash: boolean) {
    return {
      p_sale_id: saleId,
      p_items: qoladi.map((x) => ({
        product_id: x.product_id,
        qty: Number(x.qty),
        birlik: x.birlik,
      })),
      p_customer_id: null,
      p_comment: izoh.trim() || null,
      p_sabab: sabab.trim() || null,
      p_qollash: qollash,
    };
  }

  async function korish() {
    setXato(null);
    setIsh('Hisoblanmoqda...');
    const { data, error } = await supabase.rpc('dori_sotuv_tahrir', tanaYasa(false));
    setIsh(null);
    if (error) return setXato(xatoMatni(error.message));
    setQuruq(data as Quruq);
  }

  async function saqla() {
    if (!sabab.trim()) return setXato('Sabab yozing — tahrir izsiz qolmasligi kerak');
    setXato(null);
    setIsh('Saqlanmoqda...');
    const { data, error } = await supabase.rpc('dori_sotuv_tahrir', tanaYasa(true));
    setIsh(null);
    if (error) return setXato(xatoMatni(error.message));
    const r = data as Quruq;
    if (!r?.ok) {
      if (r?.error === 'QOLDIQ_YETMAYDI') {
        return setXato(
          'Qoldiq yetmaydi: ' +
            (r.kam ?? []).map((k) => `${k.name} — kerak ${son(k.kerak)}, bor ${son(k.bor)}`).join('; '),
        );
      }
      return setXato('Saqlanmadi: ' + (r?.error ?? 'nomalum'));
    }
    tayyor();
    yop();
  }

  function xatoMatni(m: string): string {
    if (m.includes('SABAB_KERAK')) return 'Sabab yozing — tahrir izsiz qolmasligi kerak';
    if (m.includes('FAQAT_YOPILGAN_SOTUV')) return 'Faqat yopilgan sotuvni tahrirlash mumkin';
    if (m.includes('POZITSIYA_YOQ')) return 'Kamida bitta dori qolishi kerak';
    if (m.includes('TAKLIF_TOPILMADI')) return 'Bu dorilar sotuv skladida topilmadi';
    if (m.includes('RUXSAT_YOQ')) return 'Ruxsat yo‘q';
    return m;
  }

  const inpStyle = {
    background: C.field,
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
    borderRadius: RADIUS,
  };
  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: C.overlay, fontFamily: MONO }}
    >
      <div
        className="w-full max-w-4xl p-4"
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[14px] font-bold tracking-[0.12em]" style={{ color: C.textBright }}>
              FAKTURANI TAHRIRLASH{s ? ` — №${s.sale_no}` : ''}
            </div>
            <div className="text-[11px]" style={{ color: C.text }}>
              {s ? `${s.pharmacy || s.mijoz || '—'} · ${s.sklad ?? '—'} · hozirgi jami ${son(s.total)}` : ''}
              {s && s.tahrirlar > 0 && (
                <span style={{ color: C.warn }}> · avval {s.tahrirlar} marta tahrirlangan</span>
              )}
            </div>
          </div>
          <button onClick={yop} className="text-[16px]" style={{ color: C.text }}>✕</button>
        </div>

        {xato && (
          <div
            className="mb-3 px-3 py-2 text-[12px]"
            style={{ color: C.danger, border: `1px solid ${C.danger}`, borderRadius: RADIUS }}
          >
            {xato}
          </div>
        )}
        {ish && <div className="mb-2 text-[11px]" style={{ color: C.neon2 }}>{ish}</div>}

        {s && (
          <>
            {/* ---------- qatorlar ---------- */}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: sh(C.text, 80) }}>
                    {['DORI', 'BIRLIK', 'NARX', 'MIQDOR', 'SUMMA', ''].map((h) => (
                      <th
                        key={h}
                        className="px-2 py-1.5 text-left text-[9px] font-bold tracking-[0.14em]"
                        style={{ borderBottom: `1px solid ${C.line}` }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qatorlar.map((x, i) => {
                    const narx = birlikNarx(Number(x.sklad_narx ?? x.price), x.pachka, x.birlik);
                    return (
                      <tr
                        key={x.product_id}
                        style={{ background: !x.bor ? sh(C.danger, 10) : i % 2 ? C.zebra : 'transparent' }}
                      >
                        <td className="px-2 py-1.5" style={{ color: C.textBright, minWidth: 190 }}>
                          {x.name}
                          {!x.bor && (
                            <span className="font-bold" style={{ color: C.danger }}> · SKLADDA YO‘Q</span>
                          )}
                          {/* Sotuvdan keyin sklad narxi o'zgargan bo'lishi
                              mumkin — tahrir YANGI narx bilan hisoblanadi,
                              buni yashirmaymiz */}
                          {x.bor && Number(x.sklad_narx) !== Number(x.price) && x.birlik === 'pachka' && (
                            <span style={{ color: C.warn }}> · narx o‘zgargan: {son(x.price)} → {son(x.sklad_narx)}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {x.pachka > 1 ? (
                            <span className="inline-flex" style={{ border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
                              {(['pachka', 'dona'] as const).map((b) => (
                                <button
                                  key={b}
                                  onClick={() =>
                                    ozgardi((p) =>
                                      p.map((y) => (y.product_id === x.product_id ? { ...y, birlik: b } : y)),
                                    )
                                  }
                                  className="px-2 py-0.5 text-[10px] font-bold"
                                  style={{
                                    color: x.birlik === b ? C.onAccent : C.text,
                                    background: x.birlik === b ? C.neon2 : 'transparent',
                                  }}
                                >
                                  {b === 'pachka' ? 'PACHKA' : 'DONA'}
                                </button>
                              ))}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: sh(C.text, 60) }}>dona</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5" style={{ color: C.text }}>{son(narx)}</td>
                        <td className="px-2 py-1.5">
                          <input
                            value={x.qty}
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(',', '.'));
                              ozgardi((p) =>
                                p.map((y) =>
                                  y.product_id === x.product_id
                                    ? { ...y, qty: Number.isFinite(n) ? n : 0 }
                                    : y,
                                ),
                              );
                            }}
                            className="w-20 px-2 py-1 text-right text-[12px] outline-none"
                            style={inpStyle}
                          />
                        </td>
                        <td className="px-2 py-1.5 font-bold" style={{ color: C.neon }}>
                          {son(narx * Number(x.qty || 0))}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => ozgardi((p) => p.filter((y) => y.product_id !== x.product_id))}
                            style={{ color: C.danger }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {yoq.length > 0 && (
              <div className="mt-2 px-3 py-2 text-[11px]" style={{ color: C.danger, border: `1px solid ${C.danger}`, borderRadius: RADIUS }}>
                {yoq.length} ta dori bu skladda endi yo‘q — ularni o‘chiring, aks holda saqlab bo‘lmaydi.
              </div>
            )}

            {/* ---------- dori qo'shish ---------- */}
            <div className="mt-3">
              <input
                value={q}
                onChange={(e) => qidir(e.target.value)}
                placeholder="dori qo‘shish — nomidan 2 ta belgi"
                className="w-full px-2 py-1.5 text-[12px] outline-none"
                style={inpStyle}
              />
              {topilgan.length > 0 && (
                <div className="mt-1 grid gap-1" style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {topilgan.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => qoshish(d)}
                      className="flex items-center justify-between gap-3 p-2 text-left"
                      style={{ border: `1px solid ${C.line}`, background: C.panel2 }}
                    >
                      <span>
                        <span className="text-[12px]" style={{ color: C.textBright }}>{d.name}</span>
                        <span className="block text-[10px]" style={{ color: C.text }}>
                          {d.manufacturer ?? '—'}
                          {d.pachka > 1 && ` · 1 pachka = ${d.pachka} dona`}
                        </span>
                      </span>
                      <b className="text-[12px]" style={{ color: C.neon }}>{son(d.price)}</b>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ---------- sabab va izoh ---------- */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px]" style={{ color: C.warn }}>
                  TAHRIR SABABI * — izga yoziladi
                </span>
                <input
                  value={sabab}
                  onChange={(e) => setSabab(e.target.value)}
                  placeholder="masalan: operator 10 o‘rniga 20 dona bergan"
                  className="w-full px-2 py-1.5 text-[12px] outline-none"
                  style={{ ...inpStyle, borderColor: sabab.trim() ? C.line : C.warn }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px]" style={{ color: C.text }}>FAKTURA IZOHI</span>
                <input
                  value={izoh}
                  onChange={(e) => setIzoh(e.target.value)}
                  className="w-full px-2 py-1.5 text-[12px] outline-none"
                  style={inpStyle}
                />
              </label>
            </div>

            {/* ---------- quruq sinov natijasi ---------- */}
            {quruq?.ok && (
              <div
                className="mt-3 p-3 text-[11px]"
                style={{ border: `1px solid ${C.neon2}`, background: sh(C.neon2, 8), borderRadius: RADIUS }}
              >
                <div style={{ color: C.textBright }}>
                  Jami: <b>{son(quruq.eski?.total)}</b> → <b style={{ color: C.neon }}>{son(quruq.yangi?.total)}</b>
                </div>
                {(quruq.qoldiq_ozgarishi ?? []).length > 0 ? (
                  <div className="mt-1" style={{ color: C.text }}>
                    Qoldiq o‘zgaradi:
                    {(quruq.qoldiq_ozgarishi ?? []).map((k) => (
                      <div key={k.name}>
                        · {k.name}: {son(k.farq > 0 ? -k.farq : -k.farq)} pachka
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1" style={{ color: C.text }}>Qoldiq o‘zgarmaydi.</div>
                )}
              </div>
            )}
            {quruq && !quruq.ok && quruq.error === 'QOLDIQ_YETMAYDI' && (
              <div
                className="mt-3 p-3 text-[11px]"
                style={{ border: `1px solid ${C.danger}`, color: C.danger, borderRadius: RADIUS }}
              >
                Qoldiq yetmaydi:{' '}
                {(quruq.kam ?? []).map((k) => `${k.name} — kerak ${son(k.kerak)}, bor ${son(k.bor)}`).join('; ')}
              </div>
            )}

            {/* ---------- amallar ---------- */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-auto text-[12px]" style={{ color: C.text }}>
                Yangi jami: <b style={{ color: C.neon }}>{son(yangiJami)}</b>
              </span>
              <button
                onClick={korish}
                disabled={!!ish || qoladi.length === 0}
                className={btn}
                style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
              >
                AVVAL KO‘RISH
              </button>
              <button
                onClick={saqla}
                disabled={!!ish || qoladi.length === 0 || yoq.length > 0 || !sabab.trim()}
                className={btn}
                style={{
                  color: C.onAccent,
                  background: sabab.trim() && yoq.length === 0 ? C.neon : sh(C.neon, 30),
                  border: `1px solid ${C.neon}`,
                  borderRadius: RADIUS,
                }}
              >
                SAQLASH
              </button>
              <button
                onClick={yop}
                className={btn}
                style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
              >
                BEKOR
              </button>
            </div>

            <div className="mt-2 text-[10px]" style={{ color: sh(C.text, 65) }}>
              Tahrir izi saqlanadi va o‘chirilmaydi. Fakturani qaytadan chop eting —
              mijozdagi nusxa eskirgan bo‘ladi.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
