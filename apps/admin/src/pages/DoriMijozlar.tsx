import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { genPassword, supabase } from '../lib/supabase';

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

export default function DoriMijozlar() {
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

    const x = (data as any)?.error ?? error?.message;
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
    if (!confirm(`${m.name ?? m.phone} uchun yangi parol: ${yangi}\n\nO‘rnatilsinmi?`)) return;
    setIsh('Parol almashtirilmoqda...');
    const { data, error } = await supabase.functions.invoke('dori-mijoz', {
      body: { amal: 'parol', phone: m.phone, password: yangi },
    });
    setIsh(null);
    const x = (data as any)?.error ?? error?.message;
    if (x) return setXato(x);
    setNatija({ phone: m.phone, password: yangi });
    yukla();
  }

  async function bloklash(m: Mijoz) {
    if (!confirm(`${m.name ?? m.phone} ${m.is_blocked ? 'blokdan chiqarilsinmi' : 'bloklansinmi'}?`)) return;
    await supabase.rpc('dori_customer_block', { p_id: m.id, p_blocked: !m.is_blocked });
    yukla();
  }

  async function uzish(m: Mijoz) {
    if (!confirm(`${m.name ?? m.phone} ning Telegram ulanishi uzilsinmi?`)) return;
    await supabase.rpc('dori_customer_unlink', { p_id: m.id });
    yukla();
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
