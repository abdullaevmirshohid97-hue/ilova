import { useCallback, useEffect, useMemo, useState } from 'react';
import { xabarKorsat } from '../components/Xabar';
import { C, KESIM, KESIM_KICHIK, MONO, RADIUS, TEMALAR, sh, temaCssniUlash, temaniOl, temaniQoy, type Tema } from '../lib/sa-tema';
import { formatDate, genPassword, supabase, fnXato } from '../lib/supabase';
import NazoratMarkazi from '../components/NazoratMarkazi';
import DoriModuli from './DoriModuli';
import NarxlarPaneli from './NarxlarPaneli';
import DoriMijozlar from './DoriMijozlar';
import DoriSkladlar from './DoriSkladlar';
import DoriBuyurtmalar from './DoriBuyurtmalar';
import DoriMoslik from './DoriMoslik';
import DoriSotuv from './DoriSotuv';
import { TENANT_YONALISHLAR, yonalishTop } from '../lib/yonalishlar';

// ============================================================================
// Super-admin "boshqaruv markazi" — eDEX-UI uslubidagi HUD.
// Ataylab qolgan paneldan butunlay boshqacha: bu ekran tenantlarning ustidan
// turadigan operator konsoli, admin panelning oddiy oq varag'i emas.
// Ranglar shu fayl ichida (tailwind token'lari butun ilovaga tegib ketmasin).
// ============================================================================


type Bolim = 'tenantlar' | 'nazorat' | 'dori' | 'skladlar' | 'sotuv' | 'buyurtmalar' | 'moslik' | 'narxlar' | 'mijozlar';

type Modul = { key: Bolim; belgi: string; nom: string; izoh: string };

type Yonalish = {
  key: string;
  belgi: string;
  nom: string;
  izoh: string;
  rang: string;
  /** Bo'sh ro'yxat = yo'nalish hali ochilmagan (kartochka "tez orada" bo'lib turadi) */
  modullar: Modul[];
};

// ---------------------------------------------------------------------------
// Panel IKKI BOSQICHLI: avval yo'nalish tanlanadi, keyin uning ichidagi modul.
//
// Sabab: bitta yassi ro'yxatda to'qqizta bo'lim bor edi va ularning yettitasi
// faqat dorixona biznesiga tegishli. Boshqa yo'nalishlar qo'shilganda bu
// ro'yxat aralashib ketardi — qaysi modul qaysi biznesniki ekani bilinmasdi.
// ---------------------------------------------------------------------------
const YONALISHLAR: Yonalish[] = [
  {
    key: 'dorixona',
    belgi: '⚕',
    nom: 'DORI-DORIXONA',
    izoh: 'ulgurji dori savdosi',
    rang: C.neon,
    modullar: [
      { key: 'dori', belgi: '⚕', nom: 'DORI', izoh: 'katalog, sklad ustunlari' },
      { key: 'skladlar', belgi: '▥', nom: 'SKLADLAR', izoh: 'omborlar va prays' },
      { key: 'sotuv', belgi: '₮', nom: 'SOTUV', izoh: 'sklad -> mijoz, faktura' },
      { key: 'buyurtmalar', belgi: '⇄', nom: 'BUYURTMALAR', izoh: 'skladlarga taqsimot' },
      { key: 'moslik', belgi: '⊜', nom: 'MOSLASHTIRISH', izoh: 'bir xil dorini tanish' },
      { key: 'narxlar', belgi: '₴', nom: 'NARX QO‘YISH', izoh: 'ustama va chegirma' },
      { key: 'mijozlar', belgi: '☎', nom: 'MIJOZLAR', izoh: 'dorixonalar va login' },
    ],
  },
  {
    key: 'tizim',
    belgi: '▤',
    nom: 'TIZIM',
    izoh: 'platforma boshqaruvi',
    rang: C.neon2,
    modullar: [
      { key: 'tenantlar', belgi: '▤', nom: 'TENANTLAR', izoh: 'reestr va obuna' },
      { key: 'nazorat', belgi: '◉', nom: 'NAZORAT', izoh: 'harakatlar va xatolar' },
    ],
  },
  // Qolgan uchtasi — platformaning boshqa biznes tizimlari. Nomlari
  // lib/yonalishlar.ts dagi tenant ro'yxati bilan bir xil: super admin
  // tenantga aynan shu tizimlarni beradi, shuning uchun ikki joyda boshqacha
  // atalsa chalkashlik bo'lardi.
  { key: 'sklad', belgi: '📦', nom: 'SKLAD', izoh: 'tez orada', rang: C.text, modullar: [] },
  { key: 'ishlab_chiqarish', belgi: '🏭', nom: 'ISHLAB CHIQARISH', izoh: 'tez orada', rang: C.text, modullar: [] },
  { key: 'marketplace', belgi: '🛒', nom: 'MARKETPLACE', izoh: 'tez orada', rang: C.text, modullar: [] },
];

// Qaysi yo'nalishda turgani SESSIYA xotirasida saqlanadi (localStorage emas).
// Farqi muhim: F5 bosilganda yoki sahifa qayta yuklanganda odam o'z joyida
// qoladi, lekin PANELGA QAYTA KIRGANDA doim yo'nalishlar ekrani chiqadi —
// aynan shu so'ralgan edi.
const XOTIRA = 'sa-yonalish';


type Org = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  subscription_status: string;
  plan: string;
  created_at: string;
  yonalishlar: string[] | null;
  customers_count: number;
  products_count: number;
  orders_count: number;
  admins_count: number;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  trial: { label: 'SINOV', color: C.warn },
  active: { label: 'FAOL', color: C.ok },
  suspended: { label: "TO'XTATILGAN", color: C.danger },
};

// ---------------------------------------------------------------- primitives

/** Burchaklari kesilgan HUD paneli — eDEX'ning asosiy vizual belgisi */
function Panel({
  title,
  right,
  children,
  pad = true,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <section
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        clipPath: KESIM, borderRadius: RADIUS,
      }}
    >
      {title && (
        <header
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{ borderBottom: `1px solid ${C.line}`, background: C.panel2 }}
        >
          <h2
            className="text-[11px] font-bold tracking-[0.22em]"
            style={{ color: C.neon, fontFamily: MONO }}
          >
            [ {title} ]
          </h2>
          {right}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div
      className="relative px-4 py-3.5"
      style={{
        background: C.panel,
        border: `1px solid ${C.line}`,
        clipPath: KESIM_KICHIK, borderRadius: RADIUS,
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: C.text, fontFamily: MONO }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-extrabold tabular-nums"
        style={{ color: accent ?? C.textBright, fontFamily: MONO, textShadow: `0 0 18px ${sh(accent ?? C.neon, 27)}` }}
      >
        {value}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  background: C.field,
  border: `1px solid ${C.line}`,
  color: C.textBright,
  fontFamily: MONO,
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: C.text, fontFamily: MONO }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2.5 text-sm outline-none focus:border-current"
        style={{ ...fieldStyle, letterSpacing: mono ? '0.05em' : undefined }}
        onFocus={(e) => (e.currentTarget.style.borderColor = C.neon)}
        onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
      />
    </label>
  );
}

function NeonButton({
  children,
  onClick,
  disabled,
  tone = 'neon',
  full,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'neon' | 'ghost' | 'danger';
  full?: boolean;
}) {
  const color = tone === 'danger' ? C.danger : tone === 'ghost' ? C.text : C.neon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] transition disabled:opacity-40 ${full ? 'w-full' : ''}`}
      style={{
        fontFamily: MONO,
        color,
        background: tone === 'neon' ? `${sh(C.neon, 8)}` : 'transparent',
        border: `1px solid ${tone === 'ghost' ? C.line : color}`,
        clipPath: KESIM_KICHIK, borderRadius: RADIUS,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.boxShadow = `0 0 18px ${sh(color, 33)}`;
      }}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      {children}
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
      style={{ background: C.overlay, backdropFilter: 'blur(3px)' }}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------- yangi tenant

/**
 * Tenantga qaysi tizim(lar) berilishi.
 *
 * Kamida bittasi tanlangan bo'lishi shart: yo'nalishsiz tenant paneli bo'sh
 * ochiladi va odam nima qilishni bilmay qoladi. Shuning uchun oxirgi
 * belgini olib tashlab bo'lmaydi.
 */
function YonalishTanlagich({
  tanlangan,
  onChange,
}: {
  tanlangan: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: C.text, fontFamily: MONO }}>
        Yo‘nalish (tizim) *
      </span>
      <div className="mt-2 space-y-1.5">
        {TENANT_YONALISHLAR.map((y) => {
          const belgilangan = tanlangan.includes(y.key);
          const oxirgisi = belgilangan && tanlangan.length === 1;
          return (
            <button
              key={y.key}
              onClick={() =>
                onChange(
                  belgilangan
                    ? tanlangan.filter((k) => k !== y.key)
                    : [...tanlangan, y.key],
                )
              }
              disabled={oxirgisi}
              title={oxirgisi ? 'Kamida bitta yo‘nalish qolishi kerak' : undefined}
              className="flex w-full items-center gap-3 px-3 py-2 text-left"
              style={{
                background: belgilangan ? sh(C.neon, 12) : 'transparent',
                border: `1px solid ${belgilangan ? C.neon : C.line}`,
                borderRadius: 'var(--sa-radius)',
                cursor: oxirgisi ? 'default' : 'pointer',
              }}
            >
              <span
                className="grid h-4 w-4 shrink-0 place-items-center text-[10px] font-bold"
                style={{
                  border: `1px solid ${belgilangan ? C.neon : C.line}`,
                  background: belgilangan ? C.neon : 'transparent',
                  color: C.onAccent,
                }}
              >
                {belgilangan ? '✓' : ''}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold tracking-[0.1em]" style={{ color: C.textBright }}>
                  {y.nom}
                </span>
                <span className="block text-[9px]" style={{ color: sh(C.text, 65) }}>
                  {y.modullar.length ? y.izoh : y.izoh + ' · hali qurilmagan'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NewOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState(genPassword());
  // Standart — ulgurji savdo: hozir to'liq ishlaydigan yagona tizim
  const [yonalishlar, setYonalishlar] = useState<string[]>(['b2b']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  async function create() {
    setError(null);
    if (!orgName.trim()) return setError('Tenant nomi majburiy');
    if (!adminEmail.trim()) return setError('Admin email majburiy');
    if (!yonalishlar.length) return setError('Kamida bitta yo‘nalish tanlang');
    setSaving(true);
    try {
      const { data, error: e } = await supabase.functions.invoke('super-admin-create-org', {
        body: {
          org_name: orgName.trim(),
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          admin_full_name: adminFullName.trim() || null,
          admin_email: adminEmail.trim(),
          admin_password: password,
          yonalishlar,
        },
      });
      if (e) throw new Error(await fnXato(e));
      if (data?.error) throw new Error(data.error);
      setDone({ email: adminEmail.trim(), password });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Overlay>
        <div className="w-full max-w-md">
          <Panel title="TENANT YARATILDI">
            <div className="text-center text-4xl" style={{ color: C.neon }}>
              ✓
            </div>
            <div className="mt-4 space-y-2 px-1" style={{ fontFamily: MONO }}>
              <div className="flex justify-between gap-4 text-sm">
                <span style={{ color: C.text }}>EMAIL</span>
                <b style={{ color: C.textBright }}>{done.email}</b>
              </div>
              <div className="flex justify-between gap-4 text-sm">
                <span style={{ color: C.text }}>PAROL</span>
                <b style={{ color: C.neon }}>{done.password}</b>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <NeonButton
                full
                onClick={() => navigator.clipboard.writeText(`Email: ${done.email}\nParol: ${done.password}`)}
              >
                nusxalash
              </NeonButton>
              <NeonButton full tone="ghost" onClick={onClose}>
                yopish
              </NeonButton>
            </div>
          </Panel>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className="w-full max-w-xl">
        <Panel
          title="YANGI TENANT"
          right={
            <button onClick={onClose} style={{ color: C.text, fontFamily: MONO }} className="text-lg hover:opacity-70">
              ✕
            </button>
          }
        >
          <div className="space-y-4">
            <Field label="Tenant (biznes) nomi *" value={orgName} onChange={setOrgName} placeholder="Andijon to'qimachilik" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kontakt ism" value={contactName} onChange={setContactName} />
              <Field label="Kontakt telefon" value={contactPhone} onChange={setContactPhone} placeholder="+998 90 123 45 67" />
            </div>

            <YonalishTanlagich tanlangan={yonalishlar} onChange={setYonalishlar} />

            <div style={{ borderTop: `1px dashed ${C.line}` }} className="pt-4">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ color: C.neon2, fontFamily: MONO }}
              >
                — birinchi admin —
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Ism familiya" value={adminFullName} onChange={setAdminFullName} />
                <Field label="Email *" value={adminEmail} onChange={setAdminEmail} placeholder="admin@misol.uz" />
              </div>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Parol" value={password} onChange={setPassword} mono />
                </div>
                <button
                  onClick={() => setPassword(genPassword())}
                  title="Yangi parol"
                  className="px-3 py-2.5 text-sm"
                  style={{ ...fieldStyle, color: C.neon }}
                >
                  ⟳
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-xs font-bold" style={{ color: C.danger, fontFamily: MONO }}>
              ! {error}
            </p>
          )}

          <div className="mt-6">
            <NeonButton full onClick={create} disabled={saving}>
              {saving ? 'yaratilmoqda...' : 'tenant yaratish'}
            </NeonButton>
          </div>
        </Panel>
      </div>
    </Overlay>
  );
}

// --------------------------------------------------------------- tahrirlash

function EditOrgModal({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [contactName, setContactName] = useState(org.contact_name ?? '');
  const [contactPhone, setContactPhone] = useState(org.contact_phone ?? '');
  const [yonalishlar, setYonalishlar] = useState<string[]>(org.yonalishlar ?? ['b2b']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError('Tenant nomi majburiy');
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('update_org_profile', {
        p_org_id: org.id,
        p_name: name.trim(),
        p_contact_name: contactName.trim() || null,
        p_contact_phone: contactPhone.trim() || null,
      });
      if (e) throw e;
      // Yo'nalish alohida RPC: update_org_profile'ni tenant admin ham
      // chaqira oladi, yo'nalishni esa faqat super admin o'zgartirsin.
      const { error: e2 } = await supabase.rpc('org_yonalish_qoy', {
        p_org_id: org.id,
        p_yonalishlar: yonalishlar,
      });
      if (e2) throw e2;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay>
      <div className="w-full max-w-md">
        <Panel
          title="TENANTNI TAHRIRLASH"
          right={
            <button onClick={onClose} style={{ color: C.text, fontFamily: MONO }} className="text-lg hover:opacity-70">
              ✕
            </button>
          }
        >
          <div className="space-y-4">
            <Field label="Tenant (biznes) nomi *" value={name} onChange={setName} />
            <Field label="Kontakt ism" value={contactName} onChange={setContactName} />
            <Field label="Kontakt telefon" value={contactPhone} onChange={setContactPhone} placeholder="+998 90 123 45 67" />
            <YonalishTanlagich tanlangan={yonalishlar} onChange={setYonalishlar} />
          </div>

          {error && (
            <p className="mt-4 text-xs font-bold" style={{ color: C.danger, fontFamily: MONO }}>
              ! {error}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <NeonButton tone="ghost" onClick={onClose}>
              bekor
            </NeonButton>
            <div className="flex-1">
              <NeonButton full onClick={save} disabled={saving}>
                {saving ? 'saqlanmoqda...' : 'saqlash'}
              </NeonButton>
            </div>
          </div>
        </Panel>
      </div>
    </Overlay>
  );
}

// -------------------------------------------------------------------- panel

export default function SuperAdminPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [search, setSearch] = useState('');
  const [clock, setClock] = useState(new Date());
  // Tanlangan yo'nalish. null = yo'nalish tanlash ekrani (birinchi bosqich).
  // Oxirgi tanlov brauzerda saqlanadi: sahifa yangilanganda odam har safar
  // boshidan yo'l topib yurmasin.
  const [yonalish, setYonalish] = useState<string | null>(() => {
    try {
      const y = sessionStorage.getItem(XOTIRA);
      return y && YONALISHLAR.some((x) => x.key === y && x.modullar.length) ? y : null;
    } catch {
      return null;
    }
  });
  // Sidebar bo'limi — panel bitta uzun varaq bo'lib ketmasin.
  // Saqlangan yo'nalish tiklansa, uning BIRINCHI moduli ochiladi: aks holda
  // dorixonaga kirib turib TENANTLAR ro'yxatini ko'rib qolish mumkin edi.
  const [bolim, setBolim] = useState<Bolim>(
    () => YONALISHLAR.find((y) => y.key === yonalish)?.modullar[0].key ?? 'tenantlar',
  );

  const joriy = YONALISHLAR.find((y) => y.key === yonalish) ?? null;

  /** Yo'nalishga kirish — ichidagi birinchi modul ochiladi */
  function yonalishgaKir(y: Yonalish) {
    if (!y.modullar.length) return; // "tez orada" — hali ochilmaydi
    setYonalish(y.key);
    setBolim(y.modullar[0].key);
    try {
      sessionStorage.setItem(XOTIRA, y.key);
    } catch {
      /* shaxsiy oyna — eslab qolmasa ham panel ishlayveradi */
    }
  }

  function yonalishlargaQayt() {
    setYonalish(null);
    try {
      sessionStorage.removeItem(XOTIRA);
    } catch {
      /* xotira yopiq bo'lsa ham qaytish ishlaydi */
    }
  }
  // Dizayn tanlovi brauzerda eslab qolinadi — har kim o'ziga qulayida ishlaydi
  const [tema, setTema] = useState<Tema>(() => temaniOl());

  useEffect(() => {
    temaCssniUlash();
  }, []);

  useEffect(() => {
    temaniQoy(tema);
  }, [tema]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [{ data: orgRows }, { data: stats }] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at'),
      supabase.rpc('super_admin_org_stats'),
    ]);
    const statMap = new Map((stats ?? []).map((s: any) => [s.org_id, s]));
    setOrgs(
      (orgRows ?? []).map((o: any) => {
        const s = statMap.get(o.id) as any;
        return {
          ...o,
          customers_count: Number(s?.customers_count ?? 0),
          products_count: Number(s?.products_count ?? 0),
          orders_count: Number(s?.orders_count ?? 0),
          admins_count: Number(s?.admins_count ?? 0),
        };
      })
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(org: Org, status: string) {
    const { error } = await supabase.from('organizations').update({ subscription_status: status }).eq('id', org.id);
    if (error) xabarKorsat('Xatolik: ' + error.message);
    load();
  }

  const jami = useMemo(
    () =>
      orgs.reduce(
        (a, o) => ({
          customers: a.customers + o.customers_count,
          products: a.products + o.products_count,
          orders: a.orders + o.orders_count,
          faol: a.faol + (o.subscription_status === 'active' ? 1 : 0),
        }),
        { customers: 0, products: 0, orders: 0, faol: 0 }
      ),
    [orgs]
  );

  const korinadigan = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.contact_name ?? '').toLowerCase().includes(q) ||
        (o.contact_phone ?? '').toLowerCase().includes(q)
    );
  }, [orgs, search]);

  const th = 'px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em]';
  const td = 'px-4 py-3 text-sm';

  return (
    <div id="sa-tema-root" data-sa-tema={tema} className="min-h-screen" style={{ background: C.bg, fontFamily: MONO }}>
      {/* fon: nozik grid + yuqoridan neon yorug'lik */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `linear-gradient(${sh(C.line, 13)} 1px, transparent 1px), linear-gradient(90deg, ${sh(C.line, 13)} 1px, transparent 1px)`,
          backgroundSize: '38px 38px',
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-64"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${sh(C.neon, 7)}, transparent 70%)` }}
      />

      <div className="relative">
        {/* ---------------------------------------------------------- header */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
          style={{ borderBottom: `1px solid ${C.line}`, background: `${sh(C.panel, 87)}` }}
        >
          <div className="flex items-center gap-4">
            <div
              className="grid h-10 w-10 place-items-center text-lg font-extrabold"
              style={{
                color: C.bg,
                background: C.neon,
                clipPath: KESIM_KICHIK, borderRadius: RADIUS,
              }}
            >
              Y
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-[0.3em]" style={{ color: C.textBright }}>
                YUKCHIBOLLA
              </div>
              <div className="text-[10px] tracking-[0.28em]" style={{ color: C.neon }}>
                SUPER ADMIN · BOSHQARUV MARKAZI
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden text-right sm:block">
              <div className="text-lg font-bold tabular-nums" style={{ color: C.textBright }}>
                {clock.toLocaleTimeString('ru-RU')}
              </div>
              <div className="text-[10px] tracking-[0.15em]" style={{ color: C.text }}>
                {clock.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: C.ok, boxShadow: `0 0 10px ${C.ok}` }}
              />
              <span className="text-[10px] tracking-[0.15em]" style={{ color: C.text }}>
                ONLAYN
              </span>
            </div>
            {/* Dizayn tanlovi — panelning o'zi uch xil ko'rinishda ishlaydi */}
            <div className="flex items-center gap-1" title="Dizayn">
              {TEMALAR.map((t) => {
                const faol = tema === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTema(t.key)}
                    className="px-2.5 py-1.5 text-[10px] font-bold tracking-[0.1em]"
                    style={{
                      color: faol ? C.onAccent : C.text,
                      background: faol ? C.neon : 'transparent',
                      border: `1px solid ${faol ? C.neon : C.line}`,
                      borderRadius: 'var(--sa-radius)',
                    }}
                  >
                    {t.nom}
                  </button>
                );
              })}
            </div>

            <NeonButton tone="danger" onClick={() => supabase.auth.signOut()}>
              chiqish
            </NeonButton>
          </div>
        </header>

        {/* -------------------------------------------- 1-bosqich: yo'nalish */}
        {!joriy && (
          <div className="mx-auto max-w-[1100px] px-6 py-10">
            <div className="mb-6">
              <h1 className="text-lg font-extrabold tracking-[0.24em]" style={{ color: C.textBright }}>
                YO‘NALISHLAR
              </h1>
              <p className="mt-1 text-[11px] tracking-[0.14em]" style={{ color: sh(C.text, 70) }}>
                qaysi biznes bilan ishlaysiz
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {YONALISHLAR.map((y) => {
                const ochiq = y.modullar.length > 0;
                return (
                  <button
                    key={y.key}
                    onClick={() => yonalishgaKir(y)}
                    disabled={!ochiq}
                    className="p-5 text-left transition-transform"
                    style={{
                      background: C.panel,
                      border: `1px solid ${ochiq ? sh(y.rang, 45) : C.line}`,
                      clipPath: KESIM,
                      borderRadius: RADIUS,
                      cursor: ochiq ? 'pointer' : 'default',
                      opacity: ochiq ? 1 : 0.45,
                    }}
                  >
                    <div
                      className="text-3xl"
                      style={{ color: y.rang, textShadow: ochiq ? `0 0 22px ${sh(y.rang, 40)}` : 'none' }}
                    >
                      {y.belgi}
                    </div>
                    <div
                      className="mt-3 text-[13px] font-extrabold tracking-[0.18em]"
                      style={{ color: ochiq ? C.textBright : C.text, fontFamily: MONO }}
                    >
                      {y.nom}
                    </div>
                    <div className="mt-1 text-[10px] tracking-[0.12em]" style={{ color: sh(C.text, 70) }}>
                      {y.izoh}
                    </div>

                    {ochiq ? (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {y.modullar.map((m) => (
                          <span
                            key={m.key}
                            className="px-2 py-1 text-[9px] font-bold tracking-[0.1em]"
                            style={{
                              color: C.text,
                              border: `1px solid ${C.line}`,
                              borderRadius: 'var(--sa-radius)',
                            }}
                          >
                            {m.nom}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="mt-4 inline-block px-2 py-1 text-[9px] font-bold tracking-[0.16em]"
                        style={{ color: sh(C.text, 60), border: `1px dashed ${C.line}`, borderRadius: 'var(--sa-radius)' }}
                      >
                        TEZ ORADA
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------- 2-bosqich: modullar */}
        {joriy && (
        <div className="mx-auto flex max-w-[1600px] flex-col gap-0 lg:flex-row">
        {/* ---------------------------------------------------------- sidebar */}
        <aside
          className="hidden w-52 shrink-0 flex-col gap-1 p-4 lg:flex"
          style={{ borderRight: `1px solid ${C.line}` }}
        >
          {/* Yo'nalishlarga qaytish — qaysi yo'nalishda turganini ham ko'rsatadi */}
          <button
            onClick={yonalishlargaQayt}
            className="mb-2 flex items-center gap-2 px-3 py-2 text-left"
            style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: 'var(--sa-radius)' }}
          >
            <span className="text-sm">◀</span>
            <span className="min-w-0">
              <span className="block text-[9px] tracking-[0.16em]" style={{ color: sh(C.text, 60) }}>
                YO‘NALISH
              </span>
              <span className="block text-[11px] font-bold tracking-[0.12em]" style={{ color: joriy.rang }}>
                {joriy.nom}
              </span>
            </span>
          </button>

          {joriy.modullar.map((b) => {
            const faol = bolim === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setBolim(b.key)}
                className="flex items-center gap-3 px-3 py-2.5 text-left"
                style={{
                  color: faol ? C.onAccent : C.text,
                  background: faol ? C.neon : 'transparent',
                  border: `1px solid ${faol ? C.neon : 'transparent'}`,
                }}
              >
                <span className="text-base">{b.belgi}</span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-[0.14em]">{b.nom}</span>
                  <span className="block text-[9px]" style={{ color: faol ? '#05080a99' : `${sh(C.text, 53)}` }}>
                    {b.izoh}
                  </span>
                </span>
              </button>
            );
          })}
        </aside>

        {/* telefon/planshet uchun gorizontal tanlov */}
        <div className="flex gap-1 overflow-x-auto p-3 lg:hidden" style={{ borderBottom: `1px solid ${C.line}` }}>
          <button
            onClick={yonalishlargaQayt}
            className="whitespace-nowrap px-3 py-1.5 text-[11px] font-bold tracking-[0.12em]"
            style={{ color: joriy.rang, border: `1px solid ${C.line}` }}
          >
            ◀ {joriy.nom}
          </button>
          {joriy.modullar.map((b) => (
            <button
              key={b.key}
              onClick={() => setBolim(b.key)}
              className="whitespace-nowrap px-3 py-1.5 text-[11px] font-bold tracking-[0.12em]"
              style={{
                color: bolim === b.key ? C.onAccent : C.text,
                background: bolim === b.key ? C.neon : 'transparent',
                border: `1px solid ${bolim === b.key ? C.neon : C.line}`,
              }}
            >
              {b.belgi} {b.nom}
            </button>
          ))}
        </div>

        <main className="min-w-0 flex-1 space-y-5 p-6">
          {bolim === 'dori' && <DoriModuli />}
          {bolim === 'skladlar' && <DoriSkladlar />}
          {bolim === 'sotuv' && <DoriSotuv />}
          {bolim === 'buyurtmalar' && <DoriBuyurtmalar />}
          {bolim === 'moslik' && <DoriMoslik />}
          {bolim === 'narxlar' && <NarxlarPaneli />}
          {bolim === 'mijozlar' && <DoriMijozlar />}
          {bolim === 'nazorat' && <NazoratMarkazi />}

          {bolim === 'tenantlar' && (<>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Tenantlar" value={orgs.length} accent={C.neon} />
            <Stat label="Faol obuna" value={jami.faol} accent={C.ok} />
            <Stat label="Jami mijozlar" value={jami.customers.toLocaleString('ru-RU')} />
            <Stat label="Jami mahsulot" value={jami.products.toLocaleString('ru-RU')} />
            <Stat label="Jami buyurtma" value={jami.orders.toLocaleString('ru-RU')} accent={C.neon2} />
          </div>

          <Panel
            title={`TENANTLAR REESTRI — ${korinadigan.length}/${orgs.length}`}
            pad={false}
            right={
              <div className="flex items-center gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="qidirish..."
                  className="px-3 py-1.5 text-xs outline-none"
                  style={fieldStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.neon)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.line)}
                />
                <NeonButton onClick={() => setModalOpen(true)}>+ yangi tenant</NeonButton>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr style={{ background: C.panel2, color: C.text }}>
                    <th className={th + ' text-left'}>Tenant</th>
                    <th className={th + ' text-left'}>Kontakt</th>
                    <th className={th + ' text-left'}>Tizim</th>
                    <th className={th + ' text-left'}>Obuna</th>
                    <th className={th + ' text-right'}>Admin</th>
                    <th className={th + ' text-right'}>Mijoz</th>
                    <th className={th + ' text-right'}>Mahsulot</th>
                    <th className={th + ' text-right'}>Buyurtma</th>
                    <th className={th + ' text-left'}>Yaratilgan</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {korinadigan.map((o, i) => {
                    const meta = STATUS_META[o.subscription_status] ?? { label: o.subscription_status, color: C.text };
                    return (
                      <tr
                        key={o.id}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                          background: i % 2 ? C.zebra : 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = `${sh(C.neon, 5)}`)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 ? C.zebra : 'transparent')}
                      >
                        <td className={td}>
                          <div className="font-bold" style={{ color: C.textBright }}>
                            {o.name}
                          </div>
                          <div className="text-[10px]" style={{ color: `${sh(C.text, 60)}` }}>
                            {o.id.slice(0, 8)}
                          </div>
                        </td>
                        <td className={td} style={{ color: C.text }}>
                          {o.contact_name ?? '—'}
                          {o.contact_phone && (
                            <div className="text-xs" style={{ color: `${sh(C.text, 67)}` }}>
                              {o.contact_phone}
                            </div>
                          )}
                        </td>
                        <td className={td}>
                          {/* Tenant qaysi tizimda ishlaydi — ro'yxatdan darrov ko'rinsin */}
                          <div className="flex flex-wrap gap-1">
                            {(o.yonalishlar ?? []).map((k) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em]"
                                style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: 'var(--sa-radius)' }}
                              >
                                {yonalishTop(k)?.nom ?? k}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={td}>
                          <select
                            value={o.subscription_status}
                            onChange={(e) => changeStatus(o, e.target.value)}
                            className="px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] outline-none"
                            style={{
                              background: sh(meta.color, 8),
                              border: `1px solid ${sh(meta.color, 40)}`,
                              color: meta.color,
                              fontFamily: MONO,
                            }}
                          >
                            <option value="trial" style={{ background: C.panel }}>
                              SINOV
                            </option>
                            <option value="active" style={{ background: C.panel }}>
                              FAOL
                            </option>
                            <option value="suspended" style={{ background: C.panel }}>
                              TO'XTATILGAN
                            </option>
                          </select>
                        </td>
                        <td className={td + ' text-right tabular-nums'} style={{ color: C.text }}>
                          {o.admins_count}
                        </td>
                        <td className={td + ' text-right tabular-nums'} style={{ color: C.textBright }}>
                          {o.customers_count}
                        </td>
                        <td className={td + ' text-right tabular-nums'} style={{ color: C.textBright }}>
                          {o.products_count}
                        </td>
                        <td className={td + ' text-right tabular-nums font-bold'} style={{ color: C.neon2 }}>
                          {o.orders_count}
                        </td>
                        <td className={td + ' text-xs'} style={{ color: `${sh(C.text, 67)}` }}>
                          {formatDate(o.created_at)}
                        </td>
                        <td className={td + ' text-right'}>
                          <NeonButton tone="ghost" onClick={() => setEditOrg(o)}>
                            tahrir
                          </NeonButton>
                        </td>
                      </tr>
                    );
                  })}
                  {korinadigan.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-14 text-center text-sm" style={{ color: C.text }}>
                        {orgs.length === 0
                          ? "// tenant yo'q — «+ YANGI TENANT» bilan birinchisini qo'shing"
                          : '// qidiruvga mos tenant topilmadi'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="pb-4 text-center text-[10px] tracking-[0.2em]" style={{ color: `${sh(C.text, 40)}` }}>
            YUKCHIBOLLA CONTROL · {orgs.length} TENANT · {jami.orders.toLocaleString('ru-RU')} BUYURTMA
          </div>
          </>)}
        </main>
        </div>
        )}
      </div>

      {modalOpen && <NewOrgModal onClose={() => setModalOpen(false)} onCreated={load} />}
      {editOrg && <EditOrgModal org={editOrg} onClose={() => setEditOrg(null)} onSaved={load} />}
    </div>
  );
}
