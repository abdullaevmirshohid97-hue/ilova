import { useCallback, useEffect, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { fnXato, genPassword, supabase } from '../lib/supabase';
import { imperTabOch } from '../lib/impersonatsiya';
import { yonalishTop } from '../lib/yonalishlar';

// ============================================================================
// TENANT KARTOCHKASI — ma'lumot, sanoq va ESHIKLAR
//
// Obunachi qo'ng'iroq qiladi: «parolni unutdim», «bu yer nega
// ishlamayapti». Reestrdagi qator bunga javob bermaydi — u faqat nom va
// obuna holatini ko'rsatadi.
//
// Kartochkada esa ESHIKLAR bor: tenantning har bir hisobi. Super admin
// birini tanlaydi, SABABINI yozadi va ichkariga kiradi.
//
// PAROL KO'RSATILMAYDI va ko'rsatib ham bo'lmaydi: Supabase uni bcrypt
// hash qilib saqlaydi. Kirish bir martalik token bilan bo'ladi, ya'ni
// obunachining paroli o'zgarmaydi va oshkor bo'lmaydi.
//
// Ikki rejim ataylab ajratilgan:
//   ozi   — eshik egasining O'ZI sifatida. «Menda bu tugma chiqmayapti»
//           degan savolga javob shu yerda: u ko'rgan ekran ko'rinadi.
//   admin — tenant ADMINI sifatida. To'liq huquq bilan tuzatish uchun.
//           Mijoz hisobi ustiga bosilganda faqat shu rejim ishlaydi:
//           mijoz roli admin paneliga umuman kira olmaydi.
// ============================================================================

type Eshik = {
  id: string;
  role: string;
  full_name: string;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  egasi: boolean;
  lavozim: string | null;
  menejer_nom: string | null;
  panelga_kiradi: boolean;
};

type Kirish = {
  at: string;
  super_admin_nom: string | null;
  eshik_nom: string | null;
  kirgan_nom: string | null;
  kirgan_rol: string | null;
  rejim: 'ozi' | 'admin';
  sabab: string;
};

type Kartochka = {
  org: {
    id: string;
    name: string;
    contact_name: string | null;
    contact_phone: string | null;
    owner_user_id: string | null;
    owner_email: string | null;
    subscription_status: string;
    plan: string;
    yonalishlar: string[];
    created_at: string;
  } | null;
  sanoq: {
    mijozlar: number;
    mahsulot: number;
    buyurtma: number;
    menejer: number;
    xodim: number;
    oxirgi_buyurtma: string | null;
  };
  eshiklar: Eshik[];
  kirishlar: Kirish[];
};

/** Sabab shuncha belgidan qisqa bo'lsa kirish tugmasi ishlamaydi */
const SABAB_ENG_KAM = 10;

const ROL_NOM: Record<string, string> = {
  admin: 'ADMIN',
  manager: 'MENEJER',
  customer: 'MIJOZ',
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU');

const sana = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');
const vaqt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function TenantKartochka({
  orgId,
  onQaytish,
}: {
  orgId: string;
  onQaytish: () => void;
}) {
  const [d, setD] = useState<Kartochka | null>(null);
  const [ish, setIsh] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  // Kirish oynasi qaysi eshik uchun ochiq
  const [kirishEshik, setKirishEshik] = useState<Eshik | null>(null);
  const [yangiHisob, setYangiHisob] = useState(false);

  const yukla = useCallback(async () => {
    setIsh(true);
    const { data, error } = await supabase.rpc('tenant_kartochka', { p_org_id: orgId });
    setIsh(false);
    if (error) {
      setXato('Kartochkani o‘qib bo‘lmadi: ' + error.message);
      return;
    }
    setD(data as Kartochka);
  }, [orgId]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const org = d?.org;

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && (
        <div
          className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
          style={{ color: C.danger, border: `1px solid ${C.danger}`, background: sh(C.danger, 8) }}
        >
          <span>{xato}</span>
          <button onClick={() => setXato(null)} style={{ color: C.danger }}>✕</button>
        </div>
      )}
      {xabar && (
        <div
          className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
          style={{ color: C.neon, border: `1px solid ${C.neon}`, background: sh(C.neon, 8) }}
        >
          <span>{xabar}</span>
          <button onClick={() => setXabar(null)} style={{ color: C.neon }}>✕</button>
        </div>
      )}

      {/* ---------- sarlavha ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          onClick={onQaytish}
          className="px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]"
          style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
        >
          ◀ REESTR
        </button>
        <div className="min-w-0">
          <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
            {org?.name ?? 'Yuklanmoqda…'}
          </div>
          <div className="text-[11px]" style={{ color: C.text }}>
            tenant kartochkasi · eshiklar va favqulodda kirish
          </div>
        </div>
        {ish && <span className="text-[11px]" style={{ color: C.neon2 }}>Yuklanmoqda…</span>}
      </div>

      {org && (
        <>
          {/* ---------- ma'lumot ---------- */}
          <div
            className="mb-3 grid gap-x-6 gap-y-2 p-4 text-[12px] sm:grid-cols-2 xl:grid-cols-3"
            style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
          >
            <Qator nom="OWNER" qiymat={org.contact_name ?? '—'} />
            <Qator nom="TELEFON" qiymat={org.contact_phone ?? '—'} />
            <Qator nom="OWNER EMAIL" qiymat={org.owner_email ?? '—'} />
            <Qator nom="OBUNA" qiymat={`${org.subscription_status} · ${org.plan}`} />
            <Qator nom="OCHILGAN" qiymat={sana(org.created_at)} />
            <Qator
              nom="YO‘NALISHLAR"
              qiymat={
                (org.yonalishlar ?? [])
                  .map((k) => yonalishTop(k)?.nom ?? k)
                  .join(', ') || '—'
              }
            />
          </div>

          {/* ---------- sanoq ---------- */}
          <div className="mb-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Sanoq nom="MIJOZ" qiymat={son(d?.sanoq.mijozlar)} />
            <Sanoq nom="MAHSULOT" qiymat={son(d?.sanoq.mahsulot)} />
            <Sanoq nom="BUYURTMA" qiymat={son(d?.sanoq.buyurtma)} accent={C.neon2} />
            <Sanoq nom="MENEJER" qiymat={son(d?.sanoq.menejer)} />
            <Sanoq nom="XODIM" qiymat={son(d?.sanoq.xodim)} />
            <Sanoq nom="OXIRGI BUYURTMA" qiymat={sana(d?.sanoq.oxirgi_buyurtma ?? null)} />
          </div>
        </>
      )}

      {/* ---------- eshiklar ---------- */}
      <div
        className="mb-4"
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
          style={{ borderBottom: `1px solid ${C.line}` }}
        >
          <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
            ESHIKLAR — {d?.eshiklar.length ?? 0} HISOB
          </span>
          <button
            onClick={() => setYangiHisob(true)}
            className="px-2 py-1 text-[10px] font-bold tracking-[0.12em]"
            style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
          >
            + HISOB YARATISH
          </button>
        </div>

        {d && d.eshiklar.length === 0 && (
          <div className="px-4 py-6 text-center text-[12px]" style={{ color: C.text }}>
            Bu tenantda birorta ham hisob yo‘q — kiradigan eshik ham yo‘q.
            <br />
            «HISOB YARATISH» bilan admin hisobi oching.
          </div>
        )}

        {d && d.eshiklar.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr style={{ color: sh(C.text, 80) }}>
                  {['ROL', 'ISM', 'EMAIL', 'LAVOZIM', 'OXIRGI KIRISH', ''].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 text-left text-[9px] font-bold tracking-[0.14em]"
                      style={{ borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.eshiklar.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 ? C.zebra : 'transparent' }}>
                    <td className="px-2 py-1.5" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: e.egasi ? C.neon : C.text }}>
                        {ROL_NOM[e.role] ?? e.role}
                      </span>
                      {e.egasi && (
                        <span className="ml-1 text-[9px] font-bold" style={{ color: C.neon }}>
                          EGASI
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: C.textBright, minWidth: 150 }}>
                      {e.full_name}
                      {e.menejer_nom && (
                        <span className="text-[10px]" style={{ color: sh(C.text, 70) }}>
                          {' '}· {e.menejer_nom}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{e.email ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{e.lavozim ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text, whiteSpace: 'nowrap' }}>
                      {e.last_sign_in_at ? vaqt(e.last_sign_in_at) : 'hech qachon'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => setKirishEshik(e)}
                        className="px-2 py-1 text-[10px] font-bold tracking-[0.12em]"
                        style={{ color: C.neon, border: `1px solid ${C.neon}`, borderRadius: RADIUS }}
                      >
                        KIRISH
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- oxirgi kirishlar ---------- */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div
          className="px-4 py-2 text-[10px] font-bold tracking-[0.16em]"
          style={{ color: sh(C.text, 80), borderBottom: `1px solid ${C.line}` }}
        >
          SHU TENANTGA OXIRGI KIRISHLAR
        </div>
        {(d?.kirishlar.length ?? 0) === 0 ? (
          <div className="px-4 py-5 text-center text-[12px]" style={{ color: C.text }}>
            Hali kirilmagan.
          </div>
        ) : (
          (d?.kirishlar ?? []).map((k, i) => (
            <div
              key={k.at + i}
              className="grid gap-3 px-4 py-2 text-[11px]"
              style={{
                gridTemplateColumns: '120px 1fr',
                borderTop: i ? `1px solid ${sh(C.line, 27)}` : 'none',
              }}
            >
              <span style={{ color: sh(C.text, 80) }}>{vaqt(k.at)}</span>
              <span style={{ color: C.text }}>
                <b style={{ color: C.textBright }}>{k.super_admin_nom ?? 'super admin'}</b>
                {' → '}
                <span style={{ color: C.neon2 }}>{k.kirgan_nom ?? '—'}</span>
                {k.rejim === 'admin' && (
                  <span style={{ color: C.warn }}> (admin sifatida)</span>
                )}
                {k.eshik_nom && k.eshik_nom !== k.kirgan_nom && (
                  <span style={{ color: sh(C.text, 70) }}> · eshik: {k.eshik_nom}</span>
                )}
                <span className="block" style={{ color: sh(C.text, 75) }}>
                  {k.sabab}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {kirishEshik && org && (
        <KirishOyna
          eshik={kirishEshik}
          orgId={org.id}
          orgNom={org.name}
          onYopish={() => setKirishEshik(null)}
          onKirdi={(x) => {
            setKirishEshik(null);
            setXabar(x);
            yukla();
          }}
        />
      )}

      {yangiHisob && org && (
        <HisobOyna
          orgId={org.id}
          orgNom={org.name}
          onYopish={() => setYangiHisob(false)}
          onYaratildi={(x) => {
            setYangiHisob(false);
            setXabar(x);
            yukla();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Qator({ nom, qiymat }: { nom: string; qiymat: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-[9px] tracking-[0.16em]" style={{ color: sh(C.text, 65), minWidth: 96 }}>
        {nom}
      </span>
      <span className="min-w-0 break-words" style={{ color: C.textBright }}>{qiymat}</span>
    </div>
  );
}

function Sanoq({ nom, qiymat, accent }: { nom: string; qiymat: string; accent?: string }) {
  return (
    <div className="px-3 py-2" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
      <div className="text-[9px] tracking-[0.16em]" style={{ color: sh(C.text, 65) }}>{nom}</div>
      <div className="text-[15px] font-bold" style={{ color: accent ?? C.textBright }}>{qiymat}</div>
    </div>
  );
}

function Oyna({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: C.overlay }}
    >
      <div
        className="w-full max-w-lg p-4"
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS, fontFamily: MONO }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KIRISH OYNASI — sabab va rejim
//
// Sabab kamida 10 belgi. Bu yerda tugma bloklanadi, chekka funksiyada
// qayta tekshiriladi va bazada CHECK cheklovi turibdi: uchta joyda,
// chunki izsiz kirish bu funksiyani xavfga aylantiradi.
// ---------------------------------------------------------------------------
function KirishOyna({
  eshik,
  orgId,
  orgNom,
  onYopish,
  onKirdi,
}: {
  eshik: Eshik;
  orgId: string;
  orgNom: string;
  onYopish: () => void;
  onKirdi: (xabar: string) => void;
}) {
  // Mijoz hisobi bilan admin paneli ochilmaydi — u yerda faqat «admin
  // sifatida» mantiqiy, shuning uchun standart ham shu
  const [rejim, setRejim] = useState<'ozi' | 'admin'>(eshik.panelga_kiradi ? 'ozi' : 'admin');
  const [sabab, setSabab] = useState('');
  const [ish, setIsh] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const yetarli = sabab.trim().length >= SABAB_ENG_KAM;

  async function kir() {
    if (!yetarli || ish) return;
    setIsh(true);
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('super-admin-kirish', {
        body: { org_id: orgId, eshik_user_id: eshik.id, rejim, sabab: sabab.trim() },
      });
      if (error) throw new Error(await fnXato(error));
      if ((data as any)?.error) throw new Error((data as any).error);

      const r = data as any;
      const ochildi = imperTabOch({
        token_hash: r.token_hash,
        tur: r.tur,
        nom: r.nishon.nom,
        rol: r.nishon.rol,
        eshik_nom: r.eshik.nom,
        eshik_rol: r.eshik.rol,
        org: r.org.name,
        rejim: r.rejim,
        sabab: r.sabab,
      });

      // Oyna bloklansa foydalanuvchi hech narsa ko'rmaydi va «ishlamadi»
      // deb o'ylaydi. Kirish esa allaqachon YOZILGAN — shuni ochiq aytamiz.
      onKirdi(
        ochildi
          ? `${r.nishon.nom} sifatida yangi tabda ochildi.`
          : 'Brauzer yangi oynani bloqladi — ruxsat bering va qaytadan urinib ko‘ring. Kirish jurnalga yozildi.',
      );
    } catch (e: any) {
      setXato(e?.message ?? 'Xatolik');
    } finally {
      setIsh(false);
    }
  }

  return (
    <Oyna>
      <div className="mb-3 text-[13px] font-bold tracking-[0.12em]" style={{ color: C.textBright }}>
        FAVQULODDA KIRISH
      </div>
      <div className="mb-3 text-[12px]" style={{ color: C.text }}>
        <b style={{ color: C.textBright }}>{eshik.full_name}</b> ({ROL_NOM[eshik.role] ?? eshik.role})
        {' · '}
        {orgNom}
      </div>

      {/* ---------- rejim ---------- */}
      <div className="mb-3 grid gap-1">
        <Tanlov
          faol={rejim === 'ozi'}
          ochiq={eshik.panelga_kiradi}
          nom="shu hisob sifatida"
          izoh={
            eshik.panelga_kiradi
              ? 'u ko‘rgan ekranni aynan ko‘rasiz'
              : 'mijoz hisobi bilan admin paneli ochilmaydi'
          }
          bos={() => eshik.panelga_kiradi && setRejim('ozi')}
        />
        <Tanlov
          faol={rejim === 'admin'}
          ochiq
          nom="tenant admini sifatida"
          izoh="to‘liq huquq: sklad, buyurtma, moliya, sozlama"
          bos={() => setRejim('admin')}
        />
      </div>

      {/* ---------- sabab ---------- */}
      <label className="mb-1 block text-[10px] tracking-[0.14em]" style={{ color: sh(C.text, 70) }}>
        SABAB — KAMIDA {SABAB_ENG_KAM} BELGI
      </label>
      <textarea
        value={sabab}
        onChange={(e) => setSabab(e.target.value)}
        rows={3}
        placeholder="masalan: owner parolni unutdi, sklad qoldig‘ini tekshirish kerak"
        className="w-full px-2 py-1.5 text-[12px] outline-none"
        style={{ background: C.field, border: `1px solid ${C.line}`, color: C.textBright, fontFamily: MONO }}
      />
      <div className="mt-1 text-[10px]" style={{ color: yetarli ? C.neon : C.warn }}>
        {sabab.trim().length} / {SABAB_ENG_KAM}
        {!yetarli && ' — sababsiz kirib bo‘lmaydi'}
      </div>

      <div className="mt-2 text-[10px]" style={{ color: sh(C.text, 70) }}>
        Kirish jurnalga yoziladi va o‘chirilmaydi. Obunachining paroli o‘zgarmaydi.
      </div>

      {xato && (
        <div className="mt-3 px-2 py-1.5 text-[11px]" style={{ color: C.danger, border: `1px solid ${C.danger}` }}>
          {xato}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={kir}
          disabled={!yetarli || ish}
          className="flex-1 py-2 text-[11px] font-bold tracking-[0.14em] disabled:opacity-40"
          style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}`, borderRadius: RADIUS }}
        >
          {ish ? 'KIRILMOQDA…' : 'KIRISH'}
        </button>
        <button
          onClick={onYopish}
          className="px-4 py-2 text-[11px] font-bold tracking-[0.14em]"
          style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
        >
          BEKOR
        </button>
      </div>
    </Oyna>
  );
}

function Tanlov({
  faol,
  ochiq,
  nom,
  izoh,
  bos,
}: {
  faol: boolean;
  ochiq: boolean;
  nom: string;
  izoh: string;
  bos: () => void;
}) {
  return (
    <button
      onClick={bos}
      disabled={!ochiq}
      className="flex w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-40"
      style={{
        background: faol ? sh(C.neon, 12) : 'transparent',
        border: `1px solid ${faol ? C.neon : C.line}`,
        borderRadius: RADIUS,
      }}
    >
      <span
        className="grid h-4 w-4 shrink-0 place-items-center text-[10px] font-bold"
        style={{
          border: `1px solid ${faol ? C.neon : C.line}`,
          background: faol ? C.neon : 'transparent',
          color: C.onAccent,
        }}
      >
        {faol ? '✓' : ''}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold tracking-[0.1em]" style={{ color: C.textBright }}>
          {nom}
        </span>
        <span className="block text-[9px]" style={{ color: sh(C.text, 70) }}>{izoh}</span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// HISOB YARATISH — eshiksiz tenant uchun
// ---------------------------------------------------------------------------
function HisobOyna({
  orgId,
  orgNom,
  onYopish,
  onYaratildi,
}: {
  orgId: string;
  orgNom: string;
  onYopish: () => void;
  onYaratildi: (xabar: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<'admin' | 'manager'>('admin');
  const [parol, setParol] = useState(genPassword);
  const [ish, setIsh] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [tayyor, setTayyor] = useState<{ email: string; parol: string } | null>(null);

  async function yarat() {
    if (ish) return;
    setXato(null);
    if (!nom.trim()) return setXato('Ism-familya majburiy');
    if (!email.trim()) return setXato('Email majburiy');
    if (parol.length < 8) return setXato('Parol kamida 8 ta belgi');
    setIsh(true);
    try {
      const { data, error } = await supabase.functions.invoke('super-admin-hisob', {
        body: { org_id: orgId, email: email.trim(), password: parol, full_name: nom.trim(), role: rol },
      });
      if (error) throw new Error(await fnXato(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      setTayyor({ email: email.trim(), parol });
    } catch (e: any) {
      setXato(e?.message ?? 'Xatolik');
    } finally {
      setIsh(false);
    }
  }

  const inp = {
    background: C.field,
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
  };

  if (tayyor) {
    return (
      <Oyna>
        <div className="mb-3 text-[13px] font-bold tracking-[0.12em]" style={{ color: C.neon }}>
          HISOB YARATILDI
        </div>
        <div className="space-y-1 text-[12px]">
          <div style={{ color: C.text }}>EMAIL: <b style={{ color: C.textBright }}>{tayyor.email}</b></div>
          <div style={{ color: C.text }}>PAROL: <b style={{ color: C.neon }}>{tayyor.parol}</b></div>
        </div>
        <div className="mt-2 text-[10px]" style={{ color: sh(C.text, 70) }}>
          Parol boshqa hech qayerda saqlanmaydi — hozir nusxalab oling.
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(`Email: ${tayyor.email}\nParol: ${tayyor.parol}`)}
            className="flex-1 py-2 text-[11px] font-bold tracking-[0.14em]"
            style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
          >
            NUSXALASH
          </button>
          <button
            onClick={() => onYaratildi(`${tayyor.email} hisobi yaratildi.`)}
            className="px-4 py-2 text-[11px] font-bold tracking-[0.14em]"
            style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}`, borderRadius: RADIUS }}
          >
            YOPISH
          </button>
        </div>
      </Oyna>
    );
  }

  return (
    <Oyna>
      <div className="mb-1 text-[13px] font-bold tracking-[0.12em]" style={{ color: C.textBright }}>
        YANGI HISOB
      </div>
      <div className="mb-3 text-[11px]" style={{ color: C.text }}>{orgNom}</div>

      <div className="grid gap-2">
        <input
          value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ism familya"
          className="px-2 py-1.5 text-[12px] outline-none" style={inp}
        />
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email (login sifatida ishlatiladi)"
          className="px-2 py-1.5 text-[12px] outline-none" style={inp}
        />
        <div className="flex gap-1">
          {(['admin', 'manager'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRol(r)}
              className="flex-1 py-1.5 text-[10px] font-bold tracking-[0.12em]"
              style={{
                color: rol === r ? C.onAccent : C.text,
                background: rol === r ? C.neon : 'transparent',
                border: `1px solid ${rol === r ? C.neon : C.line}`,
                borderRadius: RADIUS,
              }}
            >
              {r === 'admin' ? 'ADMIN' : 'MENEJER'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={parol} onChange={(e) => setParol(e.target.value)} placeholder="parol (8+)"
            className="flex-1 px-2 py-1.5 text-[12px] outline-none" style={inp}
          />
          <button
            onClick={() => setParol(genPassword())}
            className="px-3 text-[10px] font-bold tracking-[0.12em]"
            style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
          >
            YANGILASH
          </button>
        </div>
      </div>

      {xato && (
        <div className="mt-3 px-2 py-1.5 text-[11px]" style={{ color: C.danger, border: `1px solid ${C.danger}` }}>
          {xato}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={yarat}
          disabled={ish}
          className="flex-1 py-2 text-[11px] font-bold tracking-[0.14em] disabled:opacity-40"
          style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}`, borderRadius: RADIUS }}
        >
          {ish ? 'YARATILMOQDA…' : 'YARATISH'}
        </button>
        <button
          onClick={onYopish}
          className="px-4 py-2 text-[11px] font-bold tracking-[0.14em]"
          style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
        >
          BEKOR
        </button>
      </div>
    </Oyna>
  );
}
