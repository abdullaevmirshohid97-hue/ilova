import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// BUYURTMALAR VA SKLADLARGA TAQSIMOT
//
// Mijoz buyurtma bergan zahoti tizim uni skladlarga bo'ladi va har skladga
// Telegramda so'rov yuboradi. Bu ekran o'sha jarayonni ko'rsatadi: qaysi
// sklad nimani oldi, javob berdimi, nima yetishmadi.
//
// IKKI SUMMA: mijoz to'laydigan (ustama bilan) va skladga to'lanadigan
// (tannarx). Farqi — foyda. Ular bir joyda tursin, aks holda "bu buyurtma
// bizga nima berdi" degan savol javobsiz qoladi.
// ============================================================================

type Poz = { name: string; qty: number; price: number; sum: number; yetishmadi: number | null };

type Taqsim = {
  split_id: string;
  sklad: string | null;
  status: string;
  base_total: number;
  sell_total: number;
  sent_at: string | null;
  ulangan: boolean;
  faktura_no?: string | null;
  qabul_at?: string | null;
  pozitsiyalar: { name: string; qty: number }[];
};

type Buyurtma = {
  id: string;
  order_no: number;
  name: string | null;
  phone: string | null;
  pharmacy: string | null;
  status: string;
  total: number;
  comment: string | null;
  created_at: string;
  pozitsiyalar: Poz[];
  taqsimot: Taqsim[];
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const vaqt = (s: string) => new Date(s).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const HOLAT: Record<string, { nom: string; rang: string }> = {
  new: { nom: 'yangi', rang: 'var(--sa-accent2)' },
  sent: { nom: 'yuborildi', rang: 'var(--sa-accent2)' },
  accepted: { nom: 'qabul qilindi', rang: 'var(--sa-accent)' },
  rejected: { nom: 'rad etildi', rang: 'var(--sa-danger)' },
  done: { nom: 'bajarildi', rang: 'var(--sa-accent)' },
  cancelled: { nom: 'bekor', rang: 'var(--sa-text)' },
  confirmed: { nom: 'tasdiqlangan', rang: 'var(--sa-accent)' },
};

export default function DoriBuyurtmalar() {
  const [royxat, setRoyxat] = useState<Buyurtma[]>([]);
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('dori_buyurtmalar', { p_limit: 30 });
    if (error) { setXato('O‘qib bo‘lmadi: ' + error.message); return; }
    setRoyxat((data ?? []) as Buyurtma[]);
  }, []);

  useEffect(() => { yukla(); }, [yukla]);

  // Taqsimlash va yuborish edge funksiyada: u Telegramga xabar yozadi,
  // panel esa faqat natijani ko'rsatadi
  async function skladlargaYubor(b: Buyurtma) {
    setIsh(`№${b.order_no} skladlarga yuborilmoqda...`);
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('dori-sklad-yubor', {
        body: { order_id: b.id },
      });
      if (error) throw error;
      const r = data as { yuborildi: number; ulanmagan_sklad: number; taqsimot: any };
      const yetishmadi = (r.taqsimot?.yetishmadi ?? []) as { name: string; qty: number }[];
      setXabar(
        `№${b.order_no}: ${r.yuborildi} skladga so‘rov ketdi` +
          (r.ulanmagan_sklad ? `, ${r.ulanmagan_sklad} sklad Telegramga ulanmagan` : '') +
          (yetishmadi.length ? `, ${yetishmadi.length} pozitsiya yetishmadi` : '')
      );
      await yukla();
    } catch (e: any) {
      // Edge funksiya xatosi ko'pincha javob ichida bo'ladi, e.message
      // esa quruq "Edge Function returned a non-2xx status code" bo'lib
      // qoladi - sababni ko'rsatmasak, tekshirib bo'lmaydi
      let sabab = e?.message ?? 'nomalum xato';
      try {
        const j = await e?.context?.json?.();
        if (j?.error) sabab = j.error;
      } catch {
        /* javobni o'qib bo'lmadi - asl xabar qoladi */
      }
      setXato('Yuborilmadi: ' + sabab);
    } finally {
      setIsh(null);
    }
  }

  // Base64 -> fayl. Chekka funksiya hujjatni JSON ichida qaytaradi,
  // chunki uni Telegramga emas, brauzerga berish kerak.
  function faylniSaqla(b64: string, nom: string, tur: string) {
    const xom = atob(b64);
    const bayt = new Uint8Array(xom.length);
    for (let i = 0; i < xom.length; i++) bayt[i] = xom.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bayt], { type: tur }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function faktura(t: Taqsim, tur: 'pdf' | 'xlsx') {
    setIsh(`${t.sklad ?? 'Sklad'} fakturasi tayyorlanmoqda...`);
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('dori-faktura', {
        body: { rejim: 'sklad', split_id: t.split_id },
      });
      if (error) throw error;
      const r = data as { nom: string; pdf: string; xlsx: string };
      if (tur === 'pdf') faylniSaqla(r.pdf, `${r.nom}.pdf`, 'application/pdf');
      else faylniSaqla(r.xlsx, `${r.nom}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e: any) {
      let sabab = e?.message ?? '';
      try { const j = await e?.context?.json?.(); if (j?.error) sabab = j.error; } catch { /* javob o'qilmadi */ }
      setXato('Faktura tayyorlanmadi: ' + sabab);
    } finally {
      setIsh(null);
    }
  }

  // Sklad tovarni yubordi - super admin uni qabul qiladi va skladning
  // o'z faktura raqamini yozib qo'yadi
  async function qabulQil(t: Taqsim) {
    const no = prompt(`${t.sklad ?? 'Sklad'} fakturasi raqami (ixtiyoriy):`, t.faktura_no ?? '');
    if (no === null) return;
    setIsh('Qabul qilinmoqda...');
    const { error } = await supabase.rpc('dori_sklad_qabul', {
      p_split_id: t.split_id, p_faktura_no: no.trim() || null,
    });
    setIsh(null);
    if (error) { setXato('Qabul qilinmadi: ' + error.message); return; }
    setXabar(`${t.sklad ?? 'Sklad'} tovari qabul qilindi`);
    await yukla();
  }

  async function holatQoy(b: Buyurtma, status: string) {
    const { error } = await supabase.rpc('dori_buyurtma_holat', { p_order_id: b.id, p_status: status });
    if (error) { setXato('O‘zgartirilmadi: ' + error.message); return; }
    await yukla();
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger} yop={() => setXato(null)}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon} yop={() => setXabar(null)}>{xabar}</Xabar>}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
            BUYURTMALAR
          </div>
          <div className="text-[11px]" style={{ color: C.text }}>
            mijoz buyurtmasi va uning skladlarga bo‘linishi
          </div>
        </div>
        <button onClick={yukla} className={btn}
                style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
          YANGILASH
        </button>
      </div>

      {ish && <div className="mb-3 text-[11px]" style={{ color: C.neon2 }}>{ish}</div>}

      {royxat.length === 0 && (
        <div className="p-6 text-center text-[12px]" style={{ color: C.text, border: `1px dashed ${C.line}` }}>
          Hali buyurtma yo‘q.
        </div>
      )}

      <div className="grid gap-2">
        {royxat.map((b) => {
          const ochilgan = ochiq === b.id;
          const yetishmagan = b.pozitsiyalar.filter((p) => Number(p.yetishmadi) > 0);
          const skladJami = b.taqsimot.reduce((s, t) => s + Number(t.base_total || 0), 0);

          return (
            <div key={b.id} className="p-3"
                 style={{ background: ochilgan ? C.panel2 : C.panel,
                          border: `1px solid ${ochilgan ? C.neon : C.line}`, borderRadius: RADIUS }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => setOchiq(ochilgan ? null : b.id)} className="text-left">
                  <div className="text-[13px] font-bold" style={{ color: C.textBright }}>
                    №{b.order_no} · {b.pharmacy || b.name || 'mijoz'}
                    <span className="ml-2 px-1.5 py-0.5 text-[9px]"
                          style={{ color: HOLAT[b.status]?.rang ?? C.text, border: `1px solid ${C.line}` }}>
                      {HOLAT[b.status]?.nom ?? b.status}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: C.text }}>
                    {vaqt(b.created_at)} · {b.pozitsiyalar.length} pozitsiya · mijoz{' '}
                    <b style={{ color: C.neon }}>{son(b.total)}</b>
                    {skladJami > 0 && <> · sklad {son(skladJami)} · farq {son(Number(b.total) - skladJami)}</>}
                  </div>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {b.taqsimot.length === 0 ? (
                    <span className="text-[11px]" style={{ color: C.warn }}>taqsimlanmagan</span>
                  ) : (
                    b.taqsimot.map((t) => (
                      <span key={t.split_id} className="px-2 py-0.5 text-[10px]"
                            style={{ color: HOLAT[t.status]?.rang ?? C.text, border: `1px solid ${C.line}` }}>
                        {t.sklad ?? '—'} · {HOLAT[t.status]?.nom ?? t.status}
                      </span>
                    ))
                  )}
                  <button onClick={() => skladlargaYubor(b)} disabled={!!ish} className={btn}
                          style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
                    SKLADLARGA YUBORISH
                  </button>
                </div>
              </div>

              {ochilgan && (
                <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
                  <div className="mb-1 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
                    MIJOZ SO‘RAGANI
                  </div>
                  {b.pozitsiyalar.map((p, i) => (
                    <div key={i} className="text-[11px]" style={{ color: C.text }}>
                      {p.name} · <b style={{ color: C.textBright }}>{son(p.qty)}</b> × {son(p.price)} ={' '}
                      <b style={{ color: C.neon }}>{son(p.sum)}</b>
                      {Number(p.yetishmadi) > 0 && (
                        <span style={{ color: C.danger }}> · {son(p.yetishmadi)} ta YETISHMADI</span>
                      )}
                    </div>
                  ))}

                  {b.comment && (
                    <div className="mt-2 text-[11px]" style={{ color: C.text }}>Izoh: {b.comment}</div>
                  )}
                  {b.phone && (
                    <div className="mt-1 text-[11px]" style={{ color: C.text }}>Telefon: {b.phone}</div>
                  )}

                  {b.taqsimot.length > 0 && (
                    <>
                      <div className="mb-1 mt-3 text-[10px] font-bold tracking-[0.16em]"
                           style={{ color: sh(C.text, 80) }}>
                        SKLADLARGA BO‘LINISHI
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {b.taqsimot.map((t) => (
                          <div key={t.split_id} className="p-2"
                               style={{ border: `1px solid ${C.line}`, background: C.panel }}>
                            <div className="text-[12px] font-bold" style={{ color: C.textBright }}>
                              {t.sklad ?? '—'}
                              <span className="ml-2 text-[10px]"
                                    style={{ color: HOLAT[t.status]?.rang ?? C.text }}>
                                {HOLAT[t.status]?.nom ?? t.status}
                              </span>
                              {!t.ulangan && (
                                <span className="ml-2 text-[10px]" style={{ color: C.warn }}>
                                  · Telegramga ulanmagan
                                </span>
                              )}
                            </div>
                            {t.pozitsiyalar.map((p, i) => (
                              <div key={i} className="text-[11px]" style={{ color: C.text }}>
                                {p.name} — <b style={{ color: C.textBright }}>{son(p.qty)}</b>
                              </div>
                            ))}
                            <div className="mt-1 text-[11px]" style={{ color: C.text }}>
                              skladga <b style={{ color: C.textBright }}>{son(t.base_total)}</b> ·
                              mijozga <b style={{ color: C.neon }}>{son(t.sell_total)}</b>
                              {t.faktura_no ? <> · faktura {t.faktura_no}</> : null}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {t.status !== 'done' && (
                                <button onClick={() => qabulQil(t)} disabled={!!ish}
                                        className="px-2 py-1 text-[10px] font-bold"
                                        style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
                                  QABUL QILISH
                                </button>
                              )}
                              <button onClick={() => faktura(t, 'pdf')} disabled={!!ish}
                                      className="px-2 py-1 text-[10px] font-bold"
                                      style={{ color: C.neon2, border: `1px solid ${C.line}` }}>
                                FAKTURA PDF
                              </button>
                              <button onClick={() => faktura(t, 'xlsx')} disabled={!!ish}
                                      className="px-2 py-1 text-[10px] font-bold"
                                      style={{ color: C.text, border: `1px solid ${C.line}` }}>
                                EXCEL
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {yetishmagan.length > 0 && (
                    <div className="mt-3 p-2 text-[11px]"
                         style={{ color: C.danger, border: `1px solid ${C.danger}`, background: sh(C.danger, 6) }}>
                      Yetishmadi: {yetishmagan.map((p) => `${p.name} — ${son(p.yetishmadi)}`).join(' · ')}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.status !== 'confirmed' && (
                      <button onClick={() => holatQoy(b, 'confirmed')} className={btn}
                              style={{ color: C.neon, background: 'transparent', border: `1px solid ${C.neon}` }}>
                        TASDIQLASH
                      </button>
                    )}
                    {b.status !== 'done' && (
                      <button onClick={() => holatQoy(b, 'done')} className={btn}
                              style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
                        BAJARILDI
                      </button>
                    )}
                    {b.status !== 'cancelled' && (
                      <button onClick={() => holatQoy(b, 'cancelled')} className={btn}
                              style={{ color: C.danger, background: 'transparent', border: `1px solid ${C.line}` }}>
                        BEKOR QILISH
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
