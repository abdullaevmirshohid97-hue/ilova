import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// DORILARNI MOSLASHTIRISH
//
// Ikki sklad bir xil dorini boshqacha yozadi:
//   "Анальгин 0,5 г №10"  va  "Анальгин таб 0.5мг №10"
// Robot kalit bo'yicha nomzod topadi, lekin O'ZI birlashtirmaydi —
// ishlab chiqaruvchisi har xil bo'lsa qaror odamniki. Xato birlashtirish
// noto'g'ri narx va noto'g'ri buyurtma degani.
//
// Tasdiqlangan juftlik eslab qolinadi: keyingi yuklashlarda o'zi ishlaydi.
// ============================================================================

type Tomon = {
  id: string;
  name: string;
  manufacturer: string | null;
  price: number | null;
  base_price: number | null;
  sklad: string | null;
};

type Juft = {
  id: number;
  kalit: string | null;
  oxshashlik: number | null;
  yangi: Tomon;
  mavjud: Tomon;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export default function DoriMoslik() {
  const [items, setItems] = useState<Juft[]>([]);
  const [jami, setJami] = useState(0);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('dori_moslik_royxat', { p_limit: 40, p_offset: 0 });
    if (error) { setXato('O‘qib bo‘lmadi: ' + error.message); return; }
    const d = data as { jami: number; items: Juft[] };
    setJami(Number(d?.jami ?? 0));
    setItems(d?.items ?? []);
  }, []);

  useEffect(() => { yukla(); }, [yukla]);

  async function qaror(j: Juft, tasdiq: boolean) {
    setIsh(tasdiq ? 'Birlashtirilmoqda...' : 'Rad etilmoqda...');
    setXato(null);
    const { error } = await supabase.rpc('dori_moslik_qaror', { p_id: j.id, p_tasdiq: tasdiq });
    setIsh(null);
    if (error) { setXato('Bajarilmadi: ' + error.message); return; }
    setItems((p) => p.filter((x) => x.id !== j.id));
    setJami((n) => Math.max(0, n - 1));
    setXabar(tasdiq ? `«${j.yangi.name}» birlashtirildi` : 'Rad etildi — bu juftlik boshqa so‘ralmaydi');
  }

  async function nomzodQidir() {
    setIsh('Nomzodlar qidirilmoqda...');
    setXato(null);
    const { data, error } = await supabase.rpc('dori_nomzod_yig', { p_limit: 1000 });
    setIsh(null);
    if (error) { setXato('Qidirilmadi: ' + error.message); return; }
    const r = data as { navbatga: number };
    setXabar(`${r.navbatga} ta yangi nomzod topildi`);
    await yukla();
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger} yop={() => setXato(null)}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon} yop={() => setXabar(null)}>{xabar}</Xabar>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
            DORILARNI MOSLASHTIRISH
          </div>
          <div className="text-[11px]" style={{ color: C.text }}>
            bir xil dori ikki skladda boshqacha yozilgan · tasdiq kutmoqda:{' '}
            <b style={{ color: C.warn }}>{son(jami)}</b>
          </div>
        </div>
        <button onClick={nomzodQidir} disabled={!!ish} className={btn}
                style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}>
          NOMZOD QIDIRISH
        </button>
      </div>

      {ish && <div className="mb-3 text-[11px]" style={{ color: C.neon2 }}>{ish}</div>}

      {items.length === 0 && !ish && (
        <div className="p-6 text-center text-[12px]" style={{ color: C.text, border: `1px dashed ${C.line}` }}>
          Tasdiq kutayotgan juftlik yo‘q.
        </div>
      )}

      <div className="grid gap-2">
        {items.map((j) => (
          <div key={j.id} className="p-3"
               style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
            <div className="mb-2 text-[10px] tracking-[0.14em]" style={{ color: sh(C.text, 70) }}>
              KALIT: {j.kalit ?? '—'}
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <Tomonlar t={j.yangi} sarlavha="YANGI KELGAN" rang={C.warn} />
              <Tomonlar t={j.mavjud} sarlavha="KATALOGDAGI" rang={C.neon2} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => qaror(j, true)} disabled={!!ish} className={btn}
                      style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
                BIR XIL — BIRLASHTIR
              </button>
              <button onClick={() => qaror(j, false)} disabled={!!ish} className={btn}
                      style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
                BOSHQA DORI
              </button>
              <span className="text-[11px]" style={{ color: C.text }}>
                Birlashtirilsa: ikkala skladning narxi bitta kartochkada bo‘ladi va
                mijozga arzoni ko‘rinadi.
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tomonlar({ t, sarlavha, rang }: { t: Tomon; sarlavha: string; rang: string }) {
  return (
    <div className="p-2" style={{ border: `1px solid ${C.line}`, background: C.panel2 }}>
      <div className="mb-1 text-[9px] font-bold tracking-[0.16em]" style={{ color: rang }}>
        {sarlavha}
      </div>
      <div className="text-[12px] font-bold" style={{ color: C.textBright }}>{t.name}</div>
      <div className="text-[11px]" style={{ color: C.text }}>
        {t.manufacturer ?? 'ishlab chiqaruvchi ko‘rsatilmagan'}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: C.text }}>
        {t.sklad ?? '—'} · tannarx <b style={{ color: C.textBright }}>{son(t.base_price)}</b> ·
        sotuv <b style={{ color: C.neon }}>{son(t.price)}</b>
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
