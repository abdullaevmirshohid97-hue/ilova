import { useCallback, useEffect, useState } from 'react';
import { tasdiqlaSoz } from '../components/Xabar';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { genPassword, supabase, fnXato } from '../lib/supabase';

// ============================================================================
// DORI MIJOZLARI — adminni yaratadi.
//
// Avval mijoz botga o'zi kirib telefon yuborsa yozilardi, ya'ni istalgan
// odam narxlarni ko'rib buyurtma bera olardi. Ulgurji savdoda bu to'g'ri
// emas: mijozni admin ro'yxatga oladi, bot esa faqat ro'yxatdagi raqamni
// taniydi.
//
// Har mijozga login ham yaratiladi (telefon + parol) — Mini App'ni
// Telegramdan tashqarida ochish uchun kerak bo'ladi.
// ============================================================================

type Mijoz = {
  id: string;
  name: string | null;
  phone: string;
  pharmacy: string | null;
  address: string | null;
  is_blocked: boolean;
  telegram_ulangan: boolean;
  login_bor: boolean;
  created_at: string;
  last_seen: string | null;
  buyurtmalar: number;
  jami_summa: number;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU');

type PushMijoz = {
  id: string;
  nom: string | null;
  phone: string | null;
  ulangan: boolean;
  is_blocked: boolean;
};

type PushTarix = {
  id: string;
  matn: string;
  jami: number;
  yuborildi: number;
  xato: number;
  created_at: string;
};

export default function DoriMijozlar() {
  // Yangilik xabari: mijozlar tanlanadi (bittalab yoki hammasi) va
  // Telegram bot orqali xabar ketadi. Botga ULANMAGAN mijozga xabar
  // bormaydi - Telegram uni chat_id'siz topa olmaydi.
  const [pushOchiq, setPushOchiq] = useState(false);
  const [pushMijozlar, setPushMijozlar] = useState<PushMijoz[]>([]);
  const [pushQ, setPushQ] = useState('');
  const [pushTanlangan, setPushTanlangan] = useState<Set<string>>(new Set());
  const [pushMatn, setPushMatn] = useState('');
  const [pushTarix, setPushTarix] = useState<PushTarix[]>([]);
  const [pushXabar, setPushXabar] = useState<string | null>(null);
  const [royxat, setRoyxat] = useState<Mijoz[]>([]);
  const [q, setQ] = useState('');
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yangiOchiq, setYangiOchiq] = useState(false);
  const [natija, setNatija] = useState<{ phone: string; password: string } | null>(null);

  // forma
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [pharmacy, setPharmacy] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState(genPassword());

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('dori_customers_list', { p_q: q || null, p_limit: 200 });
    if (error) setXato(error.message);
    setRoyxat((data ?? []) as Mijoz[]);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(yukla, 250);
    return () => clearTimeout(t);
  }, [yukla]);

  async function saqla() {
    setXato(null);
    if (!phone.replace(/\D/g, '') || phone.replace(/\D/g, '').length < 9) {
      return setXato('Telefon raqam to‘liq emas');
    }
    if (password.length < 6) return setXato('Parol kamida 6 belgi');

    setIsh('Yaratilmoqda...');
    const { data, error } = await supabase.functions.invoke('dori-mijoz', {
      body: {
        amal: 'yaratish',
        name: name.trim() || null,
        phone: phone.trim(),
        pharmacy: pharmacy.trim() || null,
        address: address.trim() || null,
        password,
      },
    });
    setIsh(null);

    const x = (data as any)?.error ?? (error ? await fnXato(error) : null);
    if (x) return setXato(x === 'TELEFON_BAND' ? 'Bu raqam allaqachon ro‘yxatda' : x);

    setNatija({ phone: phone.trim(), password });
    setName('');
    setPhone('+998');
    setPharmacy('');
    setAddress('');
    setPassword(genPassword());
    setYangiOchiq(false);
    yukla();
  }

  async function parolniAlmashtir(m: Mijoz) {
    const yangi = genPassword();
    if (!await tasdiqlaSoz(`${m.name ?? m.phone} uchun yangi parol: ${yangi}\n\nO‘rnatilsinmi?`)) return;
    setIsh('Parol almashtirilmoqda...');
    const { data, error } = await supabase.functions.invoke('dori-mijoz', {
      body: { amal: 'parol', phone: m.phone, password: yangi },
    });
    setIsh(null);
    const x = (data as any)?.error ?? (error ? await fnXato(error) : null);
    if (x) return setXato(x);
    setNatija({ phone: m.phone, password: yangi });
    yukla();
  }

  async function bloklash(m: Mijoz) {
    if (!await tasdiqlaSoz(`${m.name ?? m.phone} ${m.is_blocked ? 'blokdan chiqarilsinmi' : 'bloklansinmi'}?`)) return;
    await supabase.rpc('dori_customer_block', { p_id: m.id, p_blocked: !m.is_blocked });
    yukla();
  }

  async function uzish(m: Mijoz) {
    if (!await tasdiqlaSoz(`${m.name ?? m.phone} ning Telegram ulanishi uzilsinmi?`)) return;
    await supabase.rpc('dori_customer_unlink', { p_id: m.id });
    yukla();
  }

  async function pushYukla(qidiruv = '') {
    const { data } = await supabase.rpc('dori_push_mijozlar', { p_q: qidiruv || null });
    setPushMijozlar((data ?? []) as PushMijoz[]);
    const { data: t } = await supabase.rpc('dori_push_tarix', { p_limit: 10 });
    setPushTarix((t ?? []) as PushTarix[]);
  }

  async function pushOch() {
    setPushOchiq(true);
    setPushXabar(null);
    await pushYukla('');
  }

  async function pushYubor(hammasi: boolean) {
    const matn = pushMatn.trim();
    if (!matn) { setXato('Xabar matnini yozing'); return; }

    const ids = hammasi ? null : [...pushTanlangan];
    if (!hammasi && (!ids || ids.length === 0)) { setXato('Mijoz tanlang'); return; }

    const nechta = hammasi ? pushMijozlar.filter((m) => m.ulangan && !m.is_blocked).length : ids!.length;
    if (!await tasdiqlaSoz(`${nechta} ta mijozga xabar yuborilsinmi?\n\n${matn.slice(0, 200)}`)) return;

    setXato(null);
    setIsh('Xabar tayyorlanmoqda...');
    const { data: tayyor, error: e1 } = await supabase.rpc('dori_push_tayyorla', {
      p_matn: matn,
      p_ids: ids,
      p_faqat_ulangan: true,
    });
    if (e1) { setIsh(null); setXato('Tayyorlanmadi: ' + e1.message); return; }

    const bId = (tayyor as any)?.broadcast_id;
    setIsh(`Yuborilmoqda... (${(tayyor as any)?.jami} ta)`);

    try {
      const { data, error } = await supabase.functions.invoke('dori-push', {
        body: { broadcast_id: bId },
      });
      if (error) throw new Error(await fnXato(error));
      const r = data as { jami: number; yuborildi: number; xato: number };
      setPushXabar(`${r.yuborildi} ta yuborildi${r.xato ? `, ${r.xato} tasiga yetmadi` : ''}`);
      setPushMatn('');
      setPushTanlangan(new Set());
      await pushYukla(pushQ);
    } catch (e: any) {
      let sabab = e?.message ?? '';
      try { const j = await e?.context?.json?.(); if (j?.error) sabab = j.error; } catch { /* javob o'qilmadi */ }
      setXato('Yuborilmadi: ' + sabab);
    } finally {
      setIsh(null);
    }
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
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger}>{xato}</Xabar>}
      {ish && <Xabar rang={C.neon2}>{ish}</Xabar>}
      {pushXabar && <Xabar rang={C.neon}>{pushXabar}</Xabar>}

      <div className="mb-3">
        <button
          onClick={() => (pushOchiq ? setPushOchiq(false) : pushOch())}
          className={btn}
          style={{
            color: pushOchiq ? C.onAccent : C.neon2,
            background: pushOchiq ? C.neon2 : 'transparent',
            border: `1px solid ${C.neon2}`,
            borderRadius: RADIUS,
          }}
        >
          📣 YANGILIK XABARI
        </button>
      </div>

      {pushOchiq && (
        <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}>
          <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
            MIJOZLARGA XABAR — TELEGRAM BOT ORQALI
          </div>

          <textarea
            value={pushMatn}
            onChange={(e) => setPushMatn(e.target.value)}
            rows={3}
            placeholder="Yangi dorilar keldi! Katalogni ko'ring..."
            className="w-full px-3 py-2 text-[13px] outline-none"
            style={inpStyle}
          />
          <div className="mt-1 text-[10px]" style={{ color: sh(C.text, 70) }}>
            &lt;b&gt;qalin&lt;/b&gt; va &lt;i&gt;qiya&lt;/i&gt; yozuv ishlaydi
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={pushQ}
              onChange={(e) => { setPushQ(e.target.value); pushYukla(e.target.value); }}
              placeholder="mijoz qidirish"
              className="px-2 py-1.5 text-[12px] outline-none"
              style={{ ...inpStyle, width: 200 }}
            />
            <button
              onClick={() =>
                setPushTanlangan(
                  new Set(pushMijozlar.filter((m) => m.ulangan && !m.is_blocked).map((m) => m.id))
                )
              }
              className="px-2 py-1 text-[10px] font-bold"
              style={{ color: C.text, border: `1px solid ${C.line}` }}
            >
              HAMMASINI BELGILASH
            </button>
            <button onClick={() => setPushTanlangan(new Set())} className="px-2 py-1 text-[10px]"
                    style={{ color: C.text, border: `1px solid ${C.line}` }}>
              TOZALASH
            </button>
            <span className="text-[11px]" style={{ color: C.text }}>
              belgilangan: <b style={{ color: C.neon }}>{pushTanlangan.size}</b> ·
              botga ulangan: <b style={{ color: C.textBright }}>
                {pushMijozlar.filter((m) => m.ulangan && !m.is_blocked).length}
              </b> / {pushMijozlar.length}
            </span>
          </div>

          <div className="mt-2 grid gap-1" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {pushMijozlar.map((m) => (
              <label key={m.id} className="flex items-center gap-2 px-2 py-1 text-[11px]"
                     style={{ border: `1px solid ${sh(C.line, 50)}`, opacity: m.ulangan ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  disabled={!m.ulangan || m.is_blocked}
                  checked={pushTanlangan.has(m.id)}
                  onChange={(e) => {
                    const y = new Set(pushTanlangan);
                    if (e.target.checked) y.add(m.id); else y.delete(m.id);
                    setPushTanlangan(y);
                  }}
                />
                <span style={{ color: C.textBright }}>{m.nom ?? '—'}</span>
                <span style={{ color: C.text }}>{m.phone ?? ''}</span>
                {!m.ulangan && <span style={{ color: C.warn }}>· botga ulanmagan</span>}
                {m.is_blocked && <span style={{ color: C.danger }}>· bloklangan</span>}
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => pushYubor(false)} disabled={!!ish} className={btn}
                    style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}`, borderRadius: RADIUS }}>
              BELGILANGANLARGA YUBORISH
            </button>
            <button onClick={() => pushYubor(true)} disabled={!!ish} className={btn}
                    style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}>
              HAMMASIGA YUBORISH
            </button>
          </div>

          {pushTarix.length > 0 && (
            <div className="mt-3 pt-2" style={{ borderTop: `1px dashed ${C.line}` }}>
              <div className="mb-1 text-[10px] tracking-[0.14em]" style={{ color: sh(C.text, 70) }}>
                OXIRGI XABARLAR
              </div>
              {pushTarix.map((t) => (
                <div key={t.id} className="text-[11px]" style={{ color: C.text }}>
                  {new Date(t.created_at).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                  {' · '}
                  <b style={{ color: C.neon }}>{t.yuborildi}</b>/{t.jami}
                  {t.xato > 0 && <span style={{ color: C.warn }}> · {t.xato} xato</span>}
                  {' · '}
                  <span style={{ color: sh(C.text, 70) }}>{t.matn.slice(0, 60)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Yaratilgach login ma'lumotini bir marta ko'rsatamiz — parol
          keyin ochib bo'lmaydigan qilib saqlanadi */}
      {natija && (
        <div
          className="mb-3 p-4"
          style={{ background: sh(C.neon, 10), border: `1px solid ${C.neon}`, borderRadius: RADIUS }}
        >
          <div className="text-[11px] font-bold tracking-[0.16em]" style={{ color: C.neon }}>
            LOGIN MA'LUMOTLARI — MIJOZGA YUBORING
          </div>
          <div className="mt-2 text-[14px]" style={{ color: C.textBright }}>
            Telefon: <b>{natija.phone}</b> · Parol: <b>{natija.password}</b>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `Idaa Farm — kirish ma'lumotlari\nTelefon: ${natija.phone}\nParol: ${natija.password}`
                )
              }
              className={btn}
              style={{ color: C.onAccent, background: C.neon, borderRadius: RADIUS }}
            >
              NUSXALASH
            </button>
            <button
              onClick={() => setNatija(null)}
              className={btn}
              style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
            >
              YOPISH
            </button>
          </div>
        </div>
      )}

      {/* ---------- yuqori qator ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ism, telefon yoki dorixona..."
          className="w-full max-w-sm px-3 py-2 text-[13px] outline-none"
          style={inpStyle}
        />
        <button
          onClick={() => setYangiOchiq((v) => !v)}
          className={`${btn} ml-auto`}
          style={{ color: C.onAccent, background: C.neon, borderRadius: RADIUS }}
        >
          {yangiOchiq ? '✕ BEKOR' : '+ YANGI MIJOZ'}
        </button>
      </div>

      {/* ---------- yangi mijoz ---------- */}
      {yangiOchiq && (
        <div
          className="mb-4 p-4"
          style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
        >
          <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
            YANGI MIJOZ
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Maydon nom="ISM" qiymat={name} ozgar={setName} joy="Alisher aka" style={inpStyle} />
            <Maydon nom="TELEFON *" qiymat={phone} ozgar={setPhone} joy="+998 90 123 45 67" style={inpStyle} />
            <Maydon nom="DORIXONA" qiymat={pharmacy} ozgar={setPharmacy} joy="Dorixona №7" style={inpStyle} />
            <Maydon nom="MANZIL" qiymat={address} ozgar={setAddress} joy="Chilonzor 12" style={inpStyle} />
            <div>
              <label className="mb-1 block text-[10px]" style={{ color: C.text }}>PAROL *</label>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)}
                       className="flex-1 px-3 py-2 text-[13px] outline-none" style={inpStyle} />
                <button onClick={() => setPassword(genPassword())} className={btn}
                        style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
                  🎲
                </button>
              </div>
            </div>
          </div>
          <button onClick={saqla} className={`${btn} mt-4`}
                  style={{ color: C.onAccent, background: C.neon, borderRadius: RADIUS }}>
            YARATISH
          </button>
        </div>
      )}

      {/* ---------- ro'yxat ---------- */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="px-4 py-2 text-[10px] font-bold tracking-[0.16em]"
             style={{ color: sh(C.text, 80), borderBottom: `1px solid ${C.line}` }}>
          MIJOZLAR — {royxat.length}
        </div>

        {royxat.length === 0 && (
          <div className="p-10 text-center text-[12px]" style={{ color: C.text }}>
            Mijoz yo‘q — «+ YANGI MIJOZ» bilan birinchisini qo‘shing
          </div>
        )}

        {royxat.map((m, i) => (
          <div
            key={m.id}
            className="grid items-center gap-3 px-4 py-3 text-[12px]"
            style={{
              gridTemplateColumns: '1fr 130px 90px 110px 150px',
              borderTop: i ? `1px solid ${sh(C.line, 60)}` : 'none',
              background: i % 2 ? C.zebra : 'transparent',
              opacity: m.is_blocked ? 0.5 : 1,
            }}
          >
            <div className="min-w-0">
              <div className="truncate font-bold" style={{ color: C.textBright }}>
                {m.name ?? '—'}
                {m.is_blocked && (
                  <span className="ml-2 text-[10px]" style={{ color: C.danger }}>BLOKLANGAN</span>
                )}
              </div>
              <div className="truncate text-[11px]" style={{ color: sh(C.text, 80) }}>
                {m.phone}
                {m.pharmacy ? ` · ${m.pharmacy}` : ''}
              </div>
            </div>

            <div className="text-[11px]">
              <span style={{ color: m.telegram_ulangan ? C.neon : sh(C.text, 60) }}>
                {m.telegram_ulangan ? '🟢 Telegram' : '⚪ ulanmagan'}
              </span>
              <div style={{ color: m.login_bor ? C.neon2 : sh(C.text, 60) }}>
                {m.login_bor ? '🔑 login bor' : 'login yo‘q'}
              </div>
            </div>

            <div className="text-right" style={{ color: C.text }}>
              {son(m.buyurtmalar)} ta
            </div>
            <div className="text-right font-bold" style={{ color: C.textBright }}>
              {son(m.jami_summa)}
            </div>

            <div className="flex justify-end gap-1">
              <button onClick={() => parolniAlmashtir(m)} className="px-2 py-1 text-[10px] font-bold"
                      style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
                      title="Yangi parol">
                🔑
              </button>
              {m.telegram_ulangan && (
                <button onClick={() => uzish(m)} className="px-2 py-1 text-[10px] font-bold"
                        style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
                        title="Telegram ulanishini uzish">
                  ✕TG
                </button>
              )}
              <button onClick={() => bloklash(m)} className="px-2 py-1 text-[10px] font-bold"
                      style={{
                        color: m.is_blocked ? C.neon : C.danger,
                        border: `1px solid ${sh(m.is_blocked ? C.neon : C.danger, 45)}`,
                        borderRadius: RADIUS,
                      }}>
                {m.is_blocked ? '✓' : '🚫'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Maydon({
  nom, qiymat, ozgar, joy, style,
}: {
  nom: string; qiymat: string; ozgar: (v: string) => void; joy?: string; style: React.CSSProperties;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px]" style={{ color: C.text }}>{nom}</label>
      <input value={qiymat} onChange={(e) => ozgar(e.target.value)} placeholder={joy}
             className="w-full px-3 py-2 text-[13px] outline-none" style={style} />
    </div>
  );
}

function Xabar({ rang, children }: { rang: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 px-3 py-2 text-[11px]"
         style={{ color: rang, background: sh(rang, 8), border: `1px solid ${sh(rang, 35)}`, borderRadius: RADIUS }}>
      {children}
    </div>
  );
}
