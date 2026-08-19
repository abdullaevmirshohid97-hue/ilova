import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, genPassword, supabase } from '../lib/supabase';

// ============================================================================
// Super-admin "boshqaruv markazi" — eDEX-UI uslubidagi HUD.
// Ataylab qolgan paneldan butunlay boshqacha: bu ekran tenantlarning ustidan
// turadigan operator konsoli, admin panelning oddiy oq varag'i emas.
// Ranglar shu fayl ichida (tailwind token'lari butun ilovaga tegib ketmasin).
// ============================================================================

const C = {
  bg: '#05080a',
  panel: '#0a1014',
  panel2: '#0d151a',
  line: '#16323a',
  neon: '#00e8c6',
  neon2: '#05d1ff',
  text: '#8fa8b0',
  textBright: '#d6ebf0',
  warn: '#ffb454',
  danger: '#ff3b5c',
  ok: '#00e8c6',
};

const MONO = "ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";

type Org = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  subscription_status: string;
  plan: string;
  created_at: string;
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
        clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
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
        clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
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
        style={{ color: accent ?? C.textBright, fontFamily: MONO, textShadow: `0 0 18px ${(accent ?? C.neon)}44` }}
      >
        {value}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  background: '#060b0e',
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
        background: tone === 'neon' ? `${C.neon}14` : 'transparent',
        border: `1px solid ${tone === 'ghost' ? C.line : color}`,
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.boxShadow = `0 0 18px ${color}55`;
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
      style={{ background: 'rgba(2,6,8,0.82)', backdropFilter: 'blur(3px)' }}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------- yangi tenant

function NewOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  async function create() {
    setError(null);
    if (!orgName.trim()) return setError('Tenant nomi majburiy');
    if (!adminEmail.trim()) return setError('Admin email majburiy');
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
        },
      });
      if (e) throw new Error(e.message);
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
    if (error) alert('Xatolik: ' + error.message);
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
    <div className="min-h-screen" style={{ background: C.bg, fontFamily: MONO }}>
      {/* fon: nozik grid + yuqoridan neon yorug'lik */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `linear-gradient(${C.line}22 1px, transparent 1px), linear-gradient(90deg, ${C.line}22 1px, transparent 1px)`,
          backgroundSize: '38px 38px',
        }}
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-64"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${C.neon}12, transparent 70%)` }}
      />

      <div className="relative">
        {/* ---------------------------------------------------------- header */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"
          style={{ borderBottom: `1px solid ${C.line}`, background: `${C.panel}dd` }}
        >
          <div className="flex items-center gap-4">
            <div
              className="grid h-10 w-10 place-items-center text-lg font-extrabold"
              style={{
                color: C.bg,
                background: C.neon,
                clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
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
            <NeonButton tone="danger" onClick={() => supabase.auth.signOut()}>
              chiqish
            </NeonButton>
          </div>
        </header>

        {/* ------------------------------------------------------------ main */}
        <main className="mx-auto max-w-[1600px] space-y-5 p-6">
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
                          background: i % 2 ? '#0a1014' : 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = `${C.neon}0c`)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 ? '#0a1014' : 'transparent')}
                      >
                        <td className={td}>
                          <div className="font-bold" style={{ color: C.textBright }}>
                            {o.name}
                          </div>
                          <div className="text-[10px]" style={{ color: `${C.text}99` }}>
                            {o.id.slice(0, 8)}
                          </div>
                        </td>
                        <td className={td} style={{ color: C.text }}>
                          {o.contact_name ?? '—'}
                          {o.contact_phone && (
                            <div className="text-xs" style={{ color: `${C.text}aa` }}>
                              {o.contact_phone}
                            </div>
                          )}
                        </td>
                        <td className={td}>
                          <select
                            value={o.subscription_status}
                            onChange={(e) => changeStatus(o, e.target.value)}
                            className="px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] outline-none"
                            style={{
                              background: `${meta.color}14`,
                              border: `1px solid ${meta.color}66`,
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
                        <td className={td + ' text-xs'} style={{ color: `${C.text}aa` }}>
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
                      <td colSpan={9} className="px-4 py-14 text-center text-sm" style={{ color: C.text }}>
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

          <div className="pb-4 text-center text-[10px] tracking-[0.2em]" style={{ color: `${C.text}66` }}>
            YUKCHIBOLLA CONTROL · {orgs.length} TENANT · {jami.orders.toLocaleString('ru-RU')} BUYURTMA
          </div>
        </main>
      </div>

      {modalOpen && <NewOrgModal onClose={() => setModalOpen(false)} onCreated={load} />}
      {editOrg && <EditOrgModal org={editOrg} onClose={() => setEditOrg(null)} onSaved={load} />}
    </div>
  );
}
