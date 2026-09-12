import { useCallback, useEffect, useState } from 'react';
import { xabarKorsat, tasdiqlaSoz } from '../components/Xabar';
import { formatDate, formatSum, genPassword, imageUrl, resizeImage, supabase, fnXato } from '../lib/supabase';
import ChangePasswordPanel from '../components/ChangePasswordPanel';
import XodimlarPanel from '../components/XodimlarPanel';
import DirektorlarPanel from '../components/DirektorlarPanel';
import HujjatSozlamaPanel from '../components/HujjatSozlamaPanel';
import StaffTelegramPanel from '../components/StaffTelegramPanel';

type Category = { id: string; name: string; sort_order: number };
type Group = { id: string; name: string };
type CancelledDesignOrder = {
  id: string;
  customer: string;
  phone: string;
  qty: number;
  total: number;
  createdAt: string;
};

const rowInputCls =
  'flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand';

// Biznes nomi — fakturalarda, pick-list'larda va hisobotlarda chiqadi,
// shuning uchun admin uni o'zi to'g'rilay olishi kerak. Obuna holati va
// tarif bu yerda YO'Q — ularni faqat super-admin o'zgartiradi
// (update_org_profile RPC ham faqat shu uchta maydonni yangilaydi).
function OrgProfilePanel() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, contact_name, contact_phone')
      .limit(1)
      .maybeSingle();
    if (!data) return;
    setOrgId((data as any).id);
    setName((data as any).name ?? '');
    setContactName((data as any).contact_name ?? '');
    setContactPhone((data as any).contact_phone ?? '');
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg(null);
    if (!name.trim()) return setMsg({ ok: false, text: 'Nom majburiy' });
    setSaving(true);
    const { error } = await supabase.rpc('update_org_profile', {
      p_org_id: orgId,
      p_name: name.trim(),
      p_contact_name: contactName.trim() || null,
      p_contact_phone: contactPhone.trim() || null,
    });
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saqlandi ✓' });
    if (!error) load();
  }

  if (!orgId) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="font-bold text-gray-900">🏢 Biznes ma'lumotlari</h2>
      <p className="mt-1 text-xs text-gray-500">
        Bu nom fakturalarda va hisobotlarda chiqadi
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">BIZNES NOMI *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={rowInputCls + ' w-full'} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-500">KONTAKT ISM</label>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={rowInputCls + ' w-full'} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">KONTAKT TELEFON</label>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={rowInputCls + ' w-full'} placeholder="+998 90 123 45 67" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
        {msg && (
          <span className={`text-sm font-semibold ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

function CategoriesPanel() {
  const [rows, setRows] = useState<Category[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('categories').select('id, name, sort_order').order('sort_order');
    setRows((data ?? []) as Category[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error: e } = await supabase.from('categories').insert({ name: newName.trim(), sort_order: maxOrder + 1 });
    if (e) return setError(e.message);
    setNewName('');
    load();
  }
  async function rename(id: string, name: string) {
    const { error: e } = await supabase.from('categories').update({ name }).eq('id', id);
    if (e) xabarKorsat('Xatolik: ' + e.message);
    load();
  }
  async function remove(id: string, name: string) {
    if (!await tasdiqlaSoz(`"${name}" kategoriyasi o'chirilsinmi? Bu kategoriyadagi mahsulotlar "kategoriyasiz" bo'lib qoladi.`)) return;
    const { error: e } = await supabase.from('categories').delete().eq('id', id);
    if (e) xabarKorsat('Xatolik: ' + e.message);
    load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">📁 Kategoriyalar</h3>
      <div className="mt-4 space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) rename(c.id, v);
              }}
              className={rowInputCls}
            />
            <button onClick={() => remove(c.id, c.name)} className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-red-50">
              🗑
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-500">Kategoriya yo'q</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Yangi kategoriya nomi"
          className={rowInputCls}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          + Qo'shish
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
    </div>
  );
}

function PriceGroupsPanel() {
  const [rows, setRows] = useState<Group[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('price_groups').select('id, name').order('name');
    setRows((data ?? []) as Group[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!newName.trim()) return;
    setError(null);
    const { error: e } = await supabase.from('price_groups').insert({ name: newName.trim() });
    if (e) return setError(e.message);
    setNewName('');
    load();
  }
  async function rename(id: string, name: string) {
    const { error: e } = await supabase.from('price_groups').update({ name }).eq('id', id);
    if (e) xabarKorsat('Xatolik: ' + e.message);
    load();
  }
  async function remove(id: string, name: string) {
    if (!await tasdiqlaSoz(`"${name}" narx tarifi o'chirilsinmi?`)) return;
    const { error: e } = await supabase.from('price_groups').delete().eq('id', id);
    if (e) {
      xabarKorsat("O'chirib bo'lmadi — bu tarifda mijoz yoki narxlar bor. Avval ularni boshqa tarifga o'tkazing.");
      return;
    }
    load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">🏷 Narx tariflari</h3>
      <div className="mt-4 space-y-2">
        {rows.map((g) => (
          <div key={g.id} className="flex items-center gap-2">
            <input
              defaultValue={g.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== g.name) rename(g.id, v);
              }}
              className={rowInputCls}
            />
            <button onClick={() => remove(g.id, g.name)} className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-red-50">
              🗑
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-500">Narx tarifi yo'q</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Yangi tarif nomi (masalan, Optom)"
          className={rowInputCls}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          + Qo'shish
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>}
    </div>
  );
}

// Mijoz ilovasining bosh sahifasidagi banner.
//
// Rasm alohida bucket ochmasdan `product-images` ichida turadi (u
// allaqachon ochiq va mijozga ko'rinadi), yo'l: bannerlar/<org_id>/...
// Mos storage siyosatlari migratsiyada — mavjud "product images"
// siyosatlari yo'lning birinchi bo'lagini MAHSULOT id'si deb bilardi,
// shuning uchun admin o'z bannerini o'chira olmasdi.
type Banner = {
  id: string;
  sarlavha: string;
  matn: string | null;
  tugma_matni: string | null;
  rasm_path: string | null;
  tartib: number;
  faol: boolean;
};

function BannerlarPanel() {
  const [rows, setRows] = useState<Banner[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [sarlavha, setSarlavha] = useState('');
  const [matn, setMatn] = useState('');
  const [tugma, setTugma] = useState('');
  const [fayl, setFayl] = useState<File | null>(null);
  const [band, setBand] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, { data: org }] = await Promise.all([
      supabase
        .from('bannerlar')
        .select('id, sarlavha, matn, tugma_matni, rasm_path, tartib, faol')
        .order('tartib'),
      supabase.from('organizations').select('id').limit(1).maybeSingle(),
    ]);
    setRows((data ?? []) as Banner[]);
    setOrgId(((org as any)?.id as string) ?? null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function qosh() {
    if (!sarlavha.trim()) return xabarKorsat('Sarlavha majburiy');
    setBand(true);
    try {
      let rasmPath: string | null = null;
      if (fayl && orgId) {
        // Yo'lning birinchi bo'lagi 'bannerlar', ikkinchisi org_id —
        // storage siyosati aynan shunga qarab ruxsat beradi
        rasmPath = `bannerlar/${orgId}/${Date.now()}.jpg`;
        const blob = await resizeImage(fayl, 1200);
        const { error: upErr } = await supabase.storage
          .from('product-images')
          .upload(rasmPath, blob, { upsert: true, contentType: 'image/jpeg' });
        if (upErr) throw upErr;
      }
      const tartib = rows.reduce((m, r) => Math.max(m, r.tartib), 0) + 1;
      const { error } = await supabase
        .from('bannerlar')
        .insert({
          sarlavha: sarlavha.trim(),
          matn: matn.trim() || null,
          tugma_matni: tugma.trim() || null,
          rasm_path: rasmPath,
          tartib,
        });
      if (error) throw error;
      setSarlavha('');
      setMatn('');
      setTugma('');
      setFayl(null);
      load();
    } catch (e: any) {
      xabarKorsat('Saqlanmadi: ' + (e?.message ?? 'xatolik'));
    } finally {
      setBand(false);
    }
  }

  async function faollikAlmashtir(b: Banner) {
    const { error } = await supabase.from('bannerlar').update({ faol: !b.faol }).eq('id', b.id);
    if (error) return xabarKorsat('Xatolik: ' + error.message);
    load();
  }

  async function ochir(b: Banner) {
    if (!(await tasdiqlaSoz(`"${b.sarlavha}" banneri o'chirilsinmi?`))) return;
    // Avval rasm, keyin qator: teskarisi bo'lsa bazada yo'q rasm
    // bucket'da abadiy qolib ketardi
    if (b.rasm_path) await supabase.storage.from('product-images').remove([b.rasm_path]);
    const { error } = await supabase.from('bannerlar').delete().eq('id', b.id);
    if (error) return xabarKorsat('Xatolik: ' + error.message);
    load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">🖼 Bosh sahifa bannerlari</h3>
      <p className="mt-1 text-xs text-gray-500">
        Mijoz ilovasining bosh sahifasida ko'rinadi. Rasm ixtiyoriy — faqat matn ham bo'ladi.
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
            {b.rasm_path ? (
              <img
                src={imageUrl(b.rasm_path)}
                alt=""
                className="h-12 w-20 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="h-12 w-20 shrink-0 rounded-lg bg-gray-100" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-gray-900">{b.sarlavha}</div>
              {b.matn && <div className="truncate text-xs text-gray-500">{b.matn}</div>}
            </div>
            <button
              onClick={() => faollikAlmashtir(b)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                b.faol ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {b.faol ? 'Faol' : "O'chiq"}
            </button>
            <button
              onClick={() => ochir(b)}
              className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-red-50"
            >
              🗑
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-500">Banner yo'q</p>}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4">
        <input
          value={sarlavha}
          onChange={(e) => setSarlavha(e.target.value)}
          placeholder="Sarlavha (masalan, Yangi qadoqlar keldi)"
          className={rowInputCls + ' w-full'}
        />
        <input
          value={matn}
          onChange={(e) => setMatn(e.target.value)}
          placeholder="Izoh (ixtiyoriy)"
          className={rowInputCls + ' w-full'}
        />
        <input
          value={tugma}
          onChange={(e) => setTugma(e.target.value)}
          placeholder="Tugma matni (ixtiyoriy) — bosilsa katalog ochiladi"
          className={rowInputCls + ' w-full'}
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFayl(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-600"
          />
          <button
            onClick={qosh}
            disabled={band}
            className="ml-auto rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {band ? 'Saqlanmoqda...' : '+ Banner qo`shish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Narxi qo'yilmagan mahsulot mijoz katalogida ko'rinsinmi.
//
// Standart holat — ko'rinmasin: narxsiz tovarni sotib bo'lmaydi.
// Lekin yangi tashkilot mahsulotni yuklab, narxni keyin qo'yishi
// oddiy hol — o'shanda do'kon butunlay bo'sh ko'rinib, "ilova
// ishlamayapti" degan xulosa chiqadi. Endi buni admin o'zi hal
// qiladi.
//
// Ko'rinish BUYURTMA degani emas: narxsiz variant savatga tushmaydi
// va `create_order` uni NARX_TOPILMADI bilan rad etadi.
function NarxsizKorinishPanel() {
  const [qiymat, setQiymat] = useState<boolean | null>(null);
  const [band, setBand] = useState(false);
  const [narxsizSoni, setNarxsizSoni] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('organizations')
      .select('narxsiz_korinsin')
      .limit(1)
      .maybeSingle();
    setQiymat(((data as any)?.narxsiz_korinsin ?? false) as boolean);
  }, []);

  useEffect(() => {
    load();
    // Nechta mahsulot narxsiz turgani — admin holatni ko'rib tursin
    supabase
      .from('product_variants')
      .select('id, prices(price_group_id), products!inner(is_active)', { count: 'exact' })
      .eq('is_active', true)
      .eq('products.is_active', true)
      .then(({ data }) => {
        if (!data) return;
        setNarxsizSoni(data.filter((v: any) => (v.prices ?? []).length === 0).length);
      });
  }, [load]);

  async function almashtir(yangi: boolean) {
    setBand(true);
    const { error } = await supabase.rpc('narxsiz_korinishni_saqla', { p_qiymat: yangi });
    setBand(false);
    if (error) return xabarKorsat('Saqlanmadi: ' + error.message);
    setQiymat(yangi);
  }

  if (qiymat === null) return null;

  const tugmaCls = (faol: boolean) =>
    `flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition ${
      faol
        ? 'border-brand bg-brand/5 text-brand'
        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
    }`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">🏷 Narxsiz mahsulotlar</h3>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        Narxi qo'yilmagan mahsulot mijoz katalogida ko'rinsinmi?
        {narxsizSoni != null && narxsizSoni > 0 && (
          <>
            {' '}
            Hozir <b>{narxsizSoni} ta</b> variantda narx yo'q.
          </>
        )}
      </p>

      <div className="mt-4 flex gap-2">
        <button disabled={band} onClick={() => almashtir(true)} className={tugmaCls(qiymat === true)}>
          👁 Ko'rinsin
        </button>
        <button disabled={band} onClick={() => almashtir(false)} className={tugmaCls(qiymat === false)}>
          🚫 Ko'rinmasin
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-gray-500">
        {qiymat
          ? "Mijoz assortimentni ko'radi, narx o'rnida «Narx kelishiladi» yozuvi chiqadi. Bunday mahsulotni savatga qo'shib bo'lmaydi — narxsiz buyurtma hisobni buzadi."
          : "Narxsiz mahsulot katalogda umuman chiqmaydi. Narx qo'yilishi bilan o'zi paydo bo'ladi."}
      </p>
    </div>
  );
}

function StaffPanel() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!email.trim()) return setError('Email majburiy');
    setSaving(true);
    try {
      const { data, error: e } = await supabase.functions.invoke('admin-create-staff', {
        body: { email: email.trim(), password, full_name: fullName.trim() },
      });
      if (e) throw new Error(await fnXato(e));
      if (data?.error) throw new Error(data.error);
      setDone(`${email.trim()} / ${password}`);
      setEmail('');
      setFullName('');
      setPassword(genPassword());
    } catch (e: any) {
      setError(e.message ?? 'Xatolik');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <h3 className="font-bold text-gray-900">👤 Xodim (admin) qo'shish</h3>
      <p className="mt-1 text-sm text-gray-500">
        Yangi administrator hisobi — email + parol bilan admin panelga kiradi.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ism familiya"
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@misol.com"
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        <div className="flex gap-2 sm:col-span-2">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-brand"
          />
          <button
            onClick={() => setPassword(genPassword())}
            className="rounded-lg border border-gray-200 px-3 text-sm hover:border-brand"
          >
            🎲
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
      {done && <p className="mt-3 text-sm font-semibold text-emerald-600">✅ Yaratildi: {done}</p>}
      <button
        onClick={create}
        disabled={saving}
        className="mt-4 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Yaratilmoqda...' : 'Xodim yaratish'}
      </button>
    </div>
  );
}

function DangerZonePanel() {
  const [rows, setRows] = useState<CancelledDesignOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('design_orders')
      .select('id, qty, unit_price, created_at, customers ( name, phone )')
      .eq('status', 'cancelled')
      .order('created_at', { ascending: false });
    setRows(
      (data ?? []).map((d: any) => ({
        id: d.id,
        customer: d.customers?.name ?? '—',
        phone: d.customers?.phone ?? '',
        qty: d.qty,
        total: Number(d.qty) * Number(d.unit_price),
        createdAt: d.created_at,
      }))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function permanentlyDelete(row: CancelledDesignOrder) {
    if (
      !await tasdiqlaSoz(
        `DIQQAT: "${row.customer}" ning bekor qilingan dizayn buyurtmasi BUTUNLAY o'chiriladi — bu amalni qaytarib bo'lmaydi. Davom etilsinmi?`
      )
    )
      return;
    setBusy(row.id);
    const { error } = await supabase.from('design_orders').delete().eq('id', row.id);
    if (error) xabarKorsat('Xatolik: ' + error.message);
    setBusy(null);
    load();
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
      <h3 className="font-bold text-red-600">⚠️ Xavfli zona</h3>
      <p className="mt-1 text-sm text-gray-500">
        Bekor qilingan dizayn buyurtmalari — asosiy ro'yxatda ko'rinmaydi. Bu yerdan butunlay,
        qaytarib bo'lmaydigan tarzda o'chirish mumkin.
      </p>
      <div className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-500">Bekor qilingan buyurtma yo'q</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-sm">
            <div>
              <div className="font-semibold text-gray-800">
                {r.customer} <span className="font-normal text-gray-500">· {r.phone}</span>
              </div>
              <div className="text-xs text-gray-500">
                {r.qty.toLocaleString()} dona · {formatSum(r.total)} · {formatDate(r.createdAt)}
              </div>
            </div>
            <button
              onClick={() => permanentlyDelete(r)}
              disabled={busy === r.id}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              🗑 Butunlay o'chirish
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ChangePasswordPanel />
      <StaffTelegramPanel />
      <OrgProfilePanel />
      <CategoriesPanel />
      <PriceGroupsPanel />
      <NarxsizKorinishPanel />
      <BannerlarPanel />
      <HujjatSozlamaPanel />
      <DirektorlarPanel />
      <XodimlarPanel />
      <StaffPanel />
      <DangerZonePanel />
    </div>
  );
}
