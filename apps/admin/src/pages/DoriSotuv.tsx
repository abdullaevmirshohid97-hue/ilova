import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// SOTUV
//
// Bot buyurtmasidan farqli: bu yerda operator o'zi sklad tanlaydi, dorini
// qidiradi, donada miqdor yozadi, mijozni tanlaydi va sotadi. Faktura shu
// zahoti shakllanadi — chop etish yoki PDF saqlash.
//
// NARX OPERATORDAN OLINMAYDI: u faqat miqdorni beradi. Narx tanlangan
// skladning taklifidan olinadi va sotuvda muzlatiladi — aks holda ekranda
// bir narx, hujjatda boshqasi chiqib qolardi.
//
// FOYDA darhol ko'rinadi: mijoz to'laydigan summa, skladga tegishlisi va
// farqi. Sotuvchi nima bilan savdo qilayotganini bilib tursin.
// ============================================================================

type Topilgan = {
  id: string;
  name: string;
  manufacturer: string | null;
  unit: string | null;
  price: number;
  base_price: number | null;
  stock: number | null;
  expiry: string | null;
  series: string | null;
};

type Savat = Topilgan & { qty: number };

type Mijoz = { id: string; name: string | null; phone: string | null; pharmacy: string | null };

type Sotuv = {
  id: string;
  sale_no: number;
  created_at: string;
  status: string;
  total: number;
  base_total: number;
  foyda: number;
  customer_name: string | null;
  pharmacy: string | null;
  sklad: string | null;
  pozitsiya: number;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const sana = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');
const vaqt = (s: string) =>
  new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function DoriSotuv() {
  const [skladlar, setSkladlar] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [sklad, setSklad] = useState('');
  const [q, setQ] = useState('');
  const [topilgan, setTopilgan] = useState<Topilgan[]>([]);
  const [savat, setSavat] = useState<Savat[]>([]);
  const [mijozQ, setMijozQ] = useState('');
  const [mijozlar, setMijozlar] = useState<Mijoz[]>([]);
  const [mijoz, setMijoz] = useState<Mijoz | null>(null);
  const [izoh, setIzoh] = useState('');
  const [oxirgi, setOxirgi] = useState<{ sale_id: string; sale_no: number; total: number; foyda: number } | null>(null);
  const [tarix, setTarix] = useState<Sotuv[]>([]);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const tarixYukla = useCallback(async () => {
    const { data } = await supabase.rpc('dori_sotuvlar', { p_limit: 15 });
    setTarix((data ?? []) as Sotuv[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('dori_skladlar');
      const r = (data ?? []) as { id: string; name: string; is_default: boolean }[];
      setSkladlar(r);
      setSklad((o) => o || r.find((x) => x.is_default)?.id || r[0]?.id || '');
    })();
    tarixYukla();
  }, [tarixYukla]);

  useEffect(() => {
    if (!mijozQ.trim() && mijozlar.length) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('dori_sotuv_mijozlar', { p_q: mijozQ || null, p_limit: 20 });
      setMijozlar((data ?? []) as Mijoz[]);
    }, 250);
    return () => clearTimeout(t);
  }, [mijozQ, mijozlar.length]);

  async function qidir(s: string) {
    setQ(s);
    if (!sklad || s.trim().length < 2) { setTopilgan([]); return; }
    const { data, error } = await supabase.rpc('dori_sotuv_qidir', {
      p_warehouse_id: sklad, p_q: s, p_limit: 20,
    });
    if (error) { setXato('Qidiruv xatosi: ' + error.message); return; }
    setTopilgan((data ?? []) as Topilgan[]);
  }

  function savatga(d: Topilgan) {
    setSavat((p) => {
      const bor = p.find((x) => x.id === d.id);
      if (bor) return p.map((x) => (x.id === d.id ? { ...x, qty: x.qty + 1 } : x));
      return [...p, { ...d, qty: 1 }];
    });
    setQ('');
    setTopilgan([]);
  }

  function miqdorQoy(id: string, v: string) {
    const n = Number(v.replace(',', '.'));
    setSavat((p) => p.map((x) => (x.id === id ? { ...x, qty: Number.isFinite(n) ? n : 0 } : x)));
  }

  const jami = savat.reduce((s, x) => s + x.price * (x.qty || 0), 0);
  const tannarx = savat.reduce((s, x) => s + Number(x.base_price ?? 0) * (x.qty || 0), 0);

  async function sot() {
    if (!sklad) return setXato('Sklad tanlang');
    if (!mijoz) return setXato('Mijoz tanlang');
    const items = savat.filter((x) => x.qty > 0).map((x) => ({ product_id: x.id, qty: x.qty }));
    if (!items.length) return setXato('Dori qo‘shing va miqdorini yozing');

    setIsh('Sotuv rasmiylashtirilmoqda...');
    setXato(null);
    const { data, error } = await supabase.rpc('dori_sotuv_yarat', {
      p_warehouse_id: sklad,
      p_customer_id: mijoz.id,
      p_items: items,
      p_comment: izoh || null,
    });
    setIsh(null);
    if (error) return setXato('Sotilmadi: ' + error.message);

    const r = data as any;
    if (!r?.ok) {
      if (r?.error === 'QOLDIQ_YETMAYDI') {
        const kam = (r.kam ?? []) as { name: string; soralgan: number; bor: number }[];
        setXato(
          'Qoldiq yetmaydi: ' + kam.map((k) => `${k.name} — so‘ralgan ${son(k.soralgan)}, bor ${son(k.bor)}`).join('; ')
        );
      } else setXato('Sotilmadi: ' + (r?.error ?? 'nomalum'));
      return;
    }

    setOxirgi({ sale_id: r.sale_id, sale_no: r.sale_no, total: r.total, foyda: r.foyda });
    setXabar(`Sotuv №${r.sale_no} rasmiylashtirildi · ${son(r.total)} so‘m · foyda ${son(r.foyda)} so‘m`);
    setSavat([]);
    setIzoh('');
    tarixYukla();
  }

  // Faktura chekka funksiyada yasaladi va base64 bo'lib qaytadi
  async function faktura(saleId: string, amal: 'print' | 'pdf' | 'excel') {
    setIsh('Faktura tayyorlanmoqda...');
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('dori-faktura', {
        body: { rejim: 'sotuv', sale_id: saleId },
      });
      if (error) throw error;
      const r = data as { nom: string; pdf: string; xlsx: string };
      const b64 = amal === 'excel' ? r.xlsx : r.pdf;
      const tur = amal === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';

      const xom = atob(b64);
      const bayt = new Uint8Array(xom.length);
      for (let i = 0; i < xom.length; i++) bayt[i] = xom.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bayt], { type: tur }));

      if (amal === 'print') {
        // Yangi oynada ochamiz va chop etish oynasini chaqiramiz.
        // Brauzer bloklasa — foydalanuvchi o'zi ochadi, shuning uchun
        // oyna baribir ochiq qoladi.
        const w = window.open(url, '_blank');
        if (w) w.addEventListener('load', () => w.print());
        else setXato('Brauzer yangi oynani blokladi — PDF SAQLASH tugmasidan foydalaning');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${r.nom}.${amal === 'excel' ? 'xlsx' : 'pdf'}`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch (e: any) {
      let sabab = e?.message ?? '';
      try { const j = await e?.context?.json?.(); if (j?.error) sabab = j.error; } catch { /* javob o'qilmadi */ }
      setXato('Faktura tayyorlanmadi: ' + sabab);
    } finally {
      setIsh(null);
    }
  }

  async function bekorQil(s: Sotuv) {
    if (!confirm(`Sotuv №${s.sale_no} bekor qilinsinmi? Qoldiq skladga qaytariladi.`)) return;
    const { error } = await supabase.rpc('dori_sotuv_bekor', { p_sale_id: s.id });
    if (error) { setXato('Bekor qilinmadi: ' + error.message); return; }
    setXabar(`Sotuv №${s.sale_no} bekor qilindi`);
    tarixYukla();
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';
  const inpStyle = { background: C.field, border: `1px solid ${C.line}`, color: C.textBright, fontFamily: MONO };

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger} yop={() => setXato(null)}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon} yop={() => setXabar(null)}>{xabar}</Xabar>}

      <div className="mb-4">
        <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
          SOTUV
        </div>
        <div className="text-[11px]" style={{ color: C.text }}>
          sklad tanlanadi · dori qidiriladi · miqdor donada · mijoz tanlanadi · faktura
        </div>
      </div>

      {ish && <div className="mb-3 text-[11px]" style={{ color: C.neon2 }}>{ish}</div>}

      {/* ---------- oxirgi sotuv: faktura tugmalari ---------- */}
      {oxirgi && (
        <div className="mb-4 p-3" style={{ border: `1px solid ${C.neon}`, background: sh(C.neon, 8) }}>
          <div className="text-[13px] font-bold" style={{ color: C.textBright }}>
            Sotuv №{oxirgi.sale_no} tayyor · {son(oxirgi.total)} so‘m ·{' '}
            <span style={{ color: C.neon }}>foyda {son(oxirgi.foyda)} so‘m</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => faktura(oxirgi.sale_id, 'print')} className={btn}
                    style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
              CHOP ETISH
            </button>
            <button onClick={() => faktura(oxirgi.sale_id, 'pdf')} className={btn}
                    style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}>
              PDF SAQLASH
            </button>
            <button onClick={() => faktura(oxirgi.sale_id, 'excel')} className={btn}
                    style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
              EXCEL
            </button>
            <button onClick={() => setOxirgi(null)} className={btn}
                    style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
              YOPISH
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* ---------- chap: qidiruv va savat ---------- */}
        <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px]" style={{ color: C.text }}>SKLAD</span>
              <select value={sklad} onChange={(e) => { setSklad(e.target.value); setSavat([]); setTopilgan([]); }}
                      className="px-2 py-1.5 text-[12px] outline-none" style={{ ...inpStyle, minWidth: 170 }}>
                {skladlar.length === 0 && <option value="">— sklad yo‘q —</option>}
                {skladlar.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[10px]" style={{ color: C.text }}>DORI QIDIRISH</span>
              <input value={q} onChange={(e) => qidir(e.target.value)}
                     placeholder="nomi — kirill yoki lotin"
                     className="w-full px-2 py-1.5 text-[13px] outline-none" style={inpStyle} />
            </label>
          </div>

          {topilgan.length > 0 && (
            <div className="mb-3 grid gap-1" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {topilgan.map((d) => (
                <button key={d.id} onClick={() => savatga(d)}
                        className="flex items-center justify-between gap-3 p-2 text-left"
                        style={{ border: `1px solid ${C.line}`, background: C.panel2 }}>
                  <span>
                    <span className="text-[12px] font-bold" style={{ color: C.textBright }}>{d.name}</span>
                    <span className="block text-[11px]" style={{ color: C.text }}>
                      {d.manufacturer ?? '—'}
                      {d.stock != null && <> · qoldiq {son(d.stock)}</>}
                      {d.expiry && <> · muddat {sana(d.expiry)}</>}
                    </span>
                  </span>
                  <b className="text-[13px]" style={{ color: C.neon }}>{son(d.price)}</b>
                </button>
              ))}
            </div>
          )}

          {savat.length === 0 ? (
            <div className="p-6 text-center text-[12px]" style={{ color: C.text, border: `1px dashed ${C.line}` }}>
              Dori qidiring va ro‘yxatdan tanlang.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: sh(C.text, 80) }}>
                    {['DORI', 'NARX', 'DONA', 'SUMMA', ''].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left text-[9px] font-bold tracking-[0.14em]"
                          style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {savat.map((x, i) => (
                    <tr key={x.id} style={{ background: i % 2 ? C.zebra : 'transparent' }}>
                      <td className="px-2 py-1.5" style={{ color: C.textBright, minWidth: 200 }}>
                        {x.name}
                        {x.stock != null && x.qty > x.stock && (
                          <span style={{ color: C.danger }}> · qoldiq {son(x.stock)}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: C.text }}>{son(x.price)}</td>
                      <td className="px-2 py-1.5">
                        <input value={x.qty} onChange={(e) => miqdorQoy(x.id, e.target.value)}
                               className="w-20 px-2 py-1 text-right text-[12px] outline-none" style={inpStyle} />
                      </td>
                      <td className="px-2 py-1.5 font-bold" style={{ color: C.neon }}>
                        {son(x.price * (x.qty || 0))}
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setSavat((p) => p.filter((y) => y.id !== x.id))}
                                style={{ color: C.danger }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- o'ng: mijoz va yakun ---------- */}
        <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
          <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
            MIJOZ
          </div>

          {mijoz ? (
            <div className="mb-3 p-2" style={{ border: `1px solid ${C.neon}`, background: sh(C.neon, 6) }}>
              <div className="text-[12px] font-bold" style={{ color: C.textBright }}>
                {mijoz.pharmacy || mijoz.name || '—'}
              </div>
              <div className="text-[11px]" style={{ color: C.text }}>{mijoz.phone ?? '—'}</div>
              <button onClick={() => setMijoz(null)} className="mt-1 text-[10px]" style={{ color: C.neon2 }}>
                boshqasini tanlash
              </button>
            </div>
          ) : (
            <>
              <input value={mijozQ} onChange={(e) => setMijozQ(e.target.value)}
                     placeholder="nomi yoki telefon"
                     className="mb-2 w-full px-2 py-1.5 text-[12px] outline-none" style={inpStyle} />
              <div className="mb-3 grid gap-1" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {mijozlar.map((m) => (
                  <button key={m.id} onClick={() => setMijoz(m)} className="p-2 text-left"
                          style={{ border: `1px solid ${C.line}` }}>
                    <span className="text-[12px]" style={{ color: C.textBright }}>
                      {m.pharmacy || m.name || '—'}
                    </span>
                    <span className="block text-[10px]" style={{ color: C.text }}>{m.phone ?? '—'}</span>
                  </button>
                ))}
                {mijozlar.length === 0 && (
                  <span className="text-[11px]" style={{ color: C.text }}>Mijoz topilmadi</span>
                )}
              </div>
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>IZOH</span>
            <input value={izoh} onChange={(e) => setIzoh(e.target.value)}
                   className="w-full px-2 py-1.5 text-[12px] outline-none" style={inpStyle} />
          </label>

          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
            <Qator nom="Mijoz to‘laydi" qiymat={son(jami)} rang={C.neon} katta />
            <Qator nom="Skladga tegishli" qiymat={son(tannarx)} rang={C.text} />
            <Qator nom="Foyda" qiymat={son(jami - tannarx)} rang={jami - tannarx > 0 ? C.neon2 : C.warn} katta />
          </div>

          <button onClick={sot} disabled={!!ish || savat.length === 0 || !mijoz}
                  className="mt-3 w-full py-2.5 text-[12px] font-bold tracking-[0.14em]"
                  style={{
                    color: C.onAccent,
                    background: savat.length && mijoz ? C.neon : sh(C.neon, 30),
                    border: `1px solid ${C.neon}`,
                  }}>
            SOTUV
          </button>
        </div>
      </div>

      {/* ---------- tarix ---------- */}
      <div className="mt-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
          OXIRGI SOTUVLAR
        </div>
        {tarix.length === 0 && (
          <div className="text-[11px]" style={{ color: C.text }}>Hali sotuv yo‘q.</div>
        )}
        <div className="grid gap-1">
          {tarix.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2"
                 style={{ border: `1px solid ${C.line}`, opacity: s.status === 'cancelled' ? 0.5 : 1 }}>
              <span className="text-[11px]" style={{ color: C.textBright }}>
                №{s.sale_no} · {vaqt(s.created_at)} · {s.pharmacy || s.customer_name || '—'}
                <span style={{ color: C.text }}> · {s.sklad ?? '—'} · {s.pozitsiya} pozitsiya</span>
                {s.status === 'cancelled' && <span style={{ color: C.danger }}> · BEKOR</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: C.text }}>
                  <b style={{ color: C.neon }}>{son(s.total)}</b> · foyda {son(s.foyda)}
                </span>
                <button onClick={() => faktura(s.id, 'print')} className="px-2 py-1 text-[10px] font-bold"
                        style={{ color: C.neon2, border: `1px solid ${C.line}` }}>CHOP</button>
                <button onClick={() => faktura(s.id, 'pdf')} className="px-2 py-1 text-[10px] font-bold"
                        style={{ color: C.text, border: `1px solid ${C.line}` }}>PDF</button>
                {s.status === 'done' && (
                  <button onClick={() => bekorQil(s)} className="px-2 py-1 text-[10px] font-bold"
                          style={{ color: C.danger, border: `1px solid ${C.line}` }}>BEKOR</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Qator({ nom, qiymat, rang, katta }: { nom: string; qiymat: string; rang: string; katta?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px]" style={{ color: C.text }}>{nom}</span>
      <b className={katta ? 'text-[15px]' : 'text-[12px]'} style={{ color: rang }}>{qiymat}</b>
    </div>
  );
}

function Xabar({ rang, yop, children }: { rang: string; yop: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
         style={{ color: rang, border: `1px solid ${rang}`, background: sh(rang, 8) }}>
      <span>{children}</span>
      <button onClick={yop} style={{ color: rang }}>✕</button>
    </div>
  );
}
