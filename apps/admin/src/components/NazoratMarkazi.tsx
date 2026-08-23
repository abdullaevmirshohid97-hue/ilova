import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================================
// NAZORAT MARKAZI — super-admin uchun jonli audit oqimi.
//
// Ma'lumot bazadagi trigger'lar orqali yig'iladi (audit_log), ya'ni panel
// orqali ham, bot orqali ham, to'g'ridan-to'g'ri SQL orqali ham bo'lgan
// o'zgarish shu yerda ko'rinadi.
//
// Menejer narxlari ATAYLAB "yopiq" bo'lib keladi: harakat fakti yoziladi,
// qiymati emas — aks holda ustama shu ekran orqali ochilib qolardi.
//
// Uslub SuperAdminPanel bilan bir xil (HUD) — bu shu panelning bir qismi.
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

type Yozuv = {
  id: number;
  at: string;
  entity: string;
  entity_id: string | null;
  action: 'insert' | 'update' | 'delete';
  diff: any;
  actor_role: string | null;
  actor_name: string;
  org_name: string | null;
};

type Xulosa = {
  jami: number;
  jadval_boyicha: { entity: string; n: number }[];
  xodim_boyicha: { actor_name: string; actor_role: string | null; n: number }[];
  tenant_boyicha: { org_name: string; n: number }[];
};

type XatoGuruh = {
  fingerprint: string;
  message: string;
  screen: string | null;
  app: string;
  hodisalar: number;
  foydalanuvchilar: number;
  oxirgi: string;
  platformalar: (string | null)[];
};

const AMAL: Record<string, { belgi: string; rang: string }> = {
  insert: { belgi: '+', rang: '#00e8c6' },
  update: { belgi: '~', rang: '#05d1ff' },
  delete: { belgi: '−', rang: '#ff3b5c' },
};

// Jadval nomlari — texnik nom o'rniga odam tushunadigan nom
const JADVAL: Record<string, string> = {
  products: 'Mahsulot',
  product_variants: 'Variant',
  prices: 'Narx',
  price_groups: 'Narx guruhi',
  categories: 'Kategoriya',
  customers: 'Mijoz',
  managers: 'Menejer',
  profiles: 'Foydalanuvchi',
  organizations: 'Tenant',
  orders: 'Buyurtma',
  order_items: 'Buyurtma qatori',
  manager_prices: 'Menejer narxi',
  manager_customer_prices: 'Menejer narxi (mijozga)',
  ledger_entries: 'Hisob yozuvi',
  payments: "To'lov",
  stock_movements: 'Ombor harakati',
};

function vaqt(iso: string): string {
  const d = new Date(iso);
  const bugun = new Date().toDateString() === d.toDateString();
  return bugun
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// O'zgarishni bitta qatorga sig'adigan qilib yozadi
function ozgarish(diff: any, action: string): string {
  if (!diff || typeof diff !== 'object') return '';
  const kalitlar = Object.keys(diff).filter((k) => !['updated_at', 'created_at'].includes(k));
  if (kalitlar.length === 0) return '';

  if (action === 'update') {
    return kalitlar
      .slice(0, 3)
      .map((k) => {
        const v = diff[k];
        if (v === 'yopiq') return `${k}: •••`;
        if (v && typeof v === 'object' && 'eski' in v) {
          return `${k}: ${qisqa(v.eski)} → ${qisqa(v.yangi)}`;
        }
        return `${k}: ${qisqa(v)}`;
      })
      .join(' · ');
  }
  return kalitlar
    .slice(0, 3)
    .map((k) => `${k}: ${diff[k] === 'yopiq' ? '•••' : qisqa(diff[k])}`)
    .join(' · ');
}

function qisqa(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 28 ? s.slice(0, 28) + '…' : s;
}

export default function NazoratMarkazi() {
  const [yozuvlar, setYozuvlar] = useState<Yozuv[]>([]);
  const [xulosa, setXulosa] = useState<Xulosa | null>(null);
  const [xatolar, setXatolar] = useState<XatoGuruh[]>([]);
  const [kun, setKun] = useState(7);
  const [jadval, setJadval] = useState<string>('');
  const [jonli, setJonli] = useState(true);
  const [tab, setTab] = useState<'oqim' | 'xatolar'>('oqim');

  const yukla = useCallback(async () => {
    const [feed, sum, err] = await Promise.all([
      supabase.rpc('audit_feed', { p_days: kun, p_entity: jadval || null, p_limit: 150 }),
      supabase.rpc('audit_summary', { p_days: kun }),
      supabase.rpc('client_error_groups', { p_days: kun, p_limit: 30 }),
    ]);
    setYozuvlar((feed.data ?? []) as Yozuv[]);
    setXulosa((sum.data ?? null) as Xulosa | null);
    setXatolar((err.data ?? []) as XatoGuruh[]);
  }, [kun, jadval]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  // Jonli oqim: yangi yozuv paydo bo'lishi bilan ro'yxat yangilanadi
  useEffect(() => {
    if (!jonli) return;
    const ch = supabase
      .channel('audit-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, () => yukla())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [jonli, yukla]);

  const jadvallar = useMemo(
    () => (xulosa?.jadval_boyicha ?? []).map((j) => j.entity),
    [xulosa]
  );

  const sel =
    'bg-transparent px-2 py-1 text-[11px] font-bold outline-none';
  const selStyle = { color: C.textBright, border: `1px solid ${C.line}`, fontFamily: MONO };

  return (
    <div style={{ fontFamily: MONO }}>
      {/* ---------- yuqori qator ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['oqim', 'xatolar'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]"
            style={{
              color: tab === k ? '#05080a' : C.text,
              background: tab === k ? C.neon : 'transparent',
              border: `1px solid ${tab === k ? C.neon : C.line}`,
            }}
          >
            {k === 'oqim' ? 'HARAKATLAR OQIMI' : `XATOLIKLAR (${xatolar.length})`}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select value={kun} onChange={(e) => setKun(Number(e.target.value))} className={sel} style={selStyle}>
            <option value={1}>1 KUN</option>
            <option value={7}>7 KUN</option>
            <option value={30}>30 KUN</option>
          </select>

          {tab === 'oqim' && (
            <select value={jadval} onChange={(e) => setJadval(e.target.value)} className={sel} style={selStyle}>
              <option value="">HAMMASI</option>
              {jadvallar.map((j) => (
                <option key={j} value={j}>
                  {(JADVAL[j] ?? j).toUpperCase()}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setJonli((v) => !v)}
            className="px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]"
            style={{
              color: jonli ? '#05080a' : C.text,
              background: jonli ? C.neon2 : 'transparent',
              border: `1px solid ${jonli ? C.neon2 : C.line}`,
            }}
          >
            {jonli ? '● JONLI' : '○ TO‘XTATILGAN'}
          </button>
        </div>
      </div>

      {tab === 'oqim' ? (
        <>
          {/* ---------- xulosa ---------- */}
          {xulosa && (
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <Quti sarlavha={`JAMI HARAKAT · ${kun} KUN`}>
                <div className="text-3xl font-extrabold" style={{ color: C.neon }}>
                  {xulosa.jami.toLocaleString('ru-RU')}
                </div>
              </Quti>
              <Quti sarlavha="ENG FAOL XODIM">
                {(xulosa.xodim_boyicha ?? []).slice(0, 3).map((x, i) => (
                  <Qator key={i} chap={x.actor_name} ong={String(x.n)} izoh={x.actor_role ?? ''} />
                ))}
                {(xulosa.xodim_boyicha ?? []).length === 0 && <Bosh />}
              </Quti>
              <Quti sarlavha="TENANT KESIMI">
                {(xulosa.tenant_boyicha ?? []).slice(0, 3).map((x, i) => (
                  <Qator key={i} chap={x.org_name} ong={String(x.n)} />
                ))}
                {(xulosa.tenant_boyicha ?? []).length === 0 && <Bosh />}
              </Quti>
            </div>
          )}

          {/* ---------- oqim ---------- */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            {yozuvlar.length === 0 && (
              <div className="p-10 text-center text-xs" style={{ color: C.text }}>
                Bu davrda harakat yo‘q
              </div>
            )}
            {yozuvlar.map((y, i) => {
              const a = AMAL[y.action] ?? { belgi: '?', rang: C.text };
              const matn = ozgarish(y.diff, y.action);
              return (
                <div
                  key={y.id}
                  className="grid gap-3 px-4 py-2 text-[12px]"
                  style={{
                    gridTemplateColumns: '78px 18px 1fr',
                    borderTop: i ? `1px solid ${C.line}55` : 'none',
                    background: i % 2 ? '#0a1014' : 'transparent',
                  }}
                >
                  <span style={{ color: `${C.text}cc` }}>{vaqt(y.at)}</span>
                  <span style={{ color: a.rang, fontWeight: 800 }}>{a.belgi}</span>
                  <div className="min-w-0">
                    <span style={{ color: C.textBright, fontWeight: 700 }}>
                      {JADVAL[y.entity] ?? y.entity}
                    </span>
                    {matn && (
                      <span style={{ color: C.text }} className="ml-2">
                        {matn}
                      </span>
                    )}
                    <div className="mt-0.5 text-[10px]" style={{ color: `${C.text}99` }}>
                      {y.actor_name}
                      {y.actor_role ? ` · ${y.actor_role}` : ''}
                      {y.org_name ? ` · ${y.org_name}` : ''}
                      {y.entity_id ? ` · ${String(y.entity_id).slice(0, 8)}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* ---------- xatoliklar ---------- */
        <div style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          {xatolar.length === 0 && (
            <div className="p-10 text-center text-xs" style={{ color: C.text }}>
              Bu davrda xatolik qayd etilmagan
            </div>
          )}
          {xatolar.map((x, i) => (
            <div
              key={x.fingerprint}
              className="px-4 py-3"
              style={{
                borderTop: i ? `1px solid ${C.line}55` : 'none',
                background: i % 2 ? '#0a1014' : 'transparent',
              }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="px-2 py-0.5 text-[10px] font-bold"
                  style={{ color: '#05080a', background: x.hodisalar > 20 ? C.danger : C.warn }}
                >
                  {x.hodisalar}×
                </span>
                <span style={{ color: C.textBright, fontWeight: 700 }} className="text-[13px]">
                  {x.message}
                </span>
              </div>
              <div className="mt-1 text-[10px]" style={{ color: `${C.text}aa` }}>
                {x.app} · {x.screen ?? 'ekran nomalum'} · {x.foydalanuvchilar} foydalanuvchi ·
                oxirgi: {vaqt(x.oxirgi)}
                {x.platformalar?.filter(Boolean).length
                  ? ' · ' + x.platformalar.filter(Boolean).join(', ')
                  : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- yordamchi
function Quti({ sarlavha, children }: { sarlavha: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}` }} className="p-4">
      <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${C.text}cc` }}>
        {sarlavha}
      </div>
      {children}
    </div>
  );
}

function Qator({ chap, ong, izoh }: { chap: string; ong: string; izoh?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="truncate text-[12px]" style={{ color: C.textBright }}>
        {chap}
        {izoh ? <span style={{ color: `${C.text}88` }} className="ml-1 text-[10px]">{izoh}</span> : null}
      </span>
      <span className="text-[12px] font-bold" style={{ color: C.neon }}>
        {ong}
      </span>
    </div>
  );
}

function Bosh() {
  return (
    <div className="py-1 text-[11px]" style={{ color: `${C.text}88` }}>
      ma'lumot yo‘q
    </div>
  );
}
