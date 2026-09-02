import { useCallback, useEffect, useState } from 'react';
import { tasdiqlaSoz } from '../components/Xabar';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { fnXato, supabase } from '../lib/supabase';
import PraysYuklash from '../components/PraysYuklash';

// ============================================================================
// SKLADLAR
//
// Bir xil dori bir necha skladda boshqa narx va boshqa qoldiq bilan turadi.
// Bu yerda sklad ochiladi, ustama/chegirmasi belgilanadi va o'sha skladga
// yuklangan prays ro'yxat shaklida ko'rinadi.
//
// USTAMA IKKI XIL: foizda ham, summada ham. Ba'zi skladlar bilan "har
// quticha ustiga 2000 so'm" deb kelishiladi, foiz bilan emas. Bir darajada
// ikkalasi ham to'ldirilsa — ikkalasi ham qo'llanadi (avval foiz, keyin
// summa qo'shiladi).
//
// TANNARX shu yerda ko'rinadi (bu super admin ekrani), mijozga esa faqat
// ustama qo'yilgan sotuv narxi chiqadi.
// ============================================================================

type Sklad = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  contact_name: string | null;
  note: string | null;
  markup_pct: number | null;
  markup_sum: number | null;
  discount_pct: number | null;
  discount_sum: number | null;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  pozitsiya: number;
  qoldiqli: number;
  qiymat: number;
  oxirgi_yuklash: string | null;
};

type Qator = {
  id: string;
  name: string;
  manufacturer: string | null;
  grp: string | null;
  unit: string | null;
  base_price: number | null;
  price: number | null;
  stock: number | null;
  eng_yaqin_muddat: string | null;
  seriyalar: string | null;
};

type Ulangan = {
  chat_id: string;
  warehouse_id: string;
  sklad: string;
  phone: string;
  name: string | null;
  username: string | null;
  linked_at: string;
};

type SkladUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  kirgan: boolean;
  last_seen: string | null;
};

type Yuklash = {
  id: string;
  sklad: string | null;
  file_name: string | null;
  rows_total: number;
  status: string;
  created_at: string;
  natija: { yangi?: number; sotuvdan_olindi?: number; sklad_jami?: number } | null;
};

const BOSH_SHAKL = {
  id: null as string | null,
  name: '',
  code: '',
  phone: '',
  address: '',
  contact_name: '',
  note: '',
  markup_pct: '',
  markup_sum: '',
  discount_pct: '',
  discount_sum: '',
  priority: '100',
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const sana = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');

const raqam = (s: string) => {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const SAHIFA = 50;

export default function DoriSkladlar() {
  const [skladlar, setSkladlar] = useState<Sklad[]>([]);
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [shakl, setShakl] = useState<typeof BOSH_SHAKL | null>(null);
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [jami, setJami] = useState(0);
  const [q, setQ] = useState('');
  const [ofset, setOfset] = useState(0);
  const [tarix, setTarix] = useState<Yuklash[]>([]);
  const [ulanganlar, setUlanganlar] = useState<Ulangan[]>([]);
  const [kodTel, setKodTel] = useState('');
  const [kod, setKod] = useState<{ code: string; phone: string } | null>(null);
  // Prays AYNAN shu skladga yuklanadi: sklad tanlangan bo'lgani uchun
  // "qaysi skladga" degan savol tug'ilmaydi va xato ham bo'lmaydi
  const [praysOchiq, setPraysOchiq] = useState(false);
  const [userlar, setUserlar] = useState<SkladUser[]>([]);
  const [uEmail, setUEmail] = useState('');
  const [uNom, setUNom] = useState('');
  const [uParol, setUParol] = useState('');
  const [tanlangan_dori, setTanlanganDori] = useState<Set<string>>(new Set());
  const [cheklov, setCheklov] = useState<boolean | null>(null);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase.rpc('dori_skladlar');
    if (error) { setXato('Skladlarni o‘qib bo‘lmadi: ' + error.message); return; }
    setSkladlar((data ?? []) as Sklad[]);
  }, []);

  useEffect(() => { yukla(); }, [yukla]);

  useEffect(() => {
    supabase.rpc('dori_sozlama').then(({ data }) => {
      setCheklov(Boolean((data as { qoldiq_cheklovi?: boolean } | null)?.qoldiq_cheklovi));
    });
  }, []);

  const narxlarniYukla = useCallback(
    async (wh: string, qidiruv: string, off: number) => {
      setIsh('Prays o‘qilmoqda...');
      const { data, error } = await supabase.rpc('dori_sklad_narxlar', {
        p_warehouse_id: wh,
        p_q: qidiruv || null,
        p_offset: off,
        p_limit: SAHIFA,
      });
      setIsh(null);
      if (error) { setXato('Praysni o‘qib bo‘lmadi: ' + error.message); return; }
      const d = data as { jami: number; items: Qator[] };
      setJami(Number(d?.jami ?? 0));
      setQatorlar(off === 0 ? (d?.items ?? []) : (p) => [...p, ...(d?.items ?? [])]);
    },
    []
  );

  async function skladniOch(id: string) {
    setTanlangan(id);
    setQ('');
    setOfset(0);
    setQatorlar([]);
    setTanlanganDori(new Set());
    await narxlarniYukla(id, '', 0);
    const { data } = await supabase.rpc('dori_import_tarix', { p_warehouse_id: id, p_limit: 10 });
    setTarix((data ?? []) as Yuklash[]);
    setKod(null);
    setKodTel('');
    setPraysOchiq(false);
    const { data: u } = await supabase.rpc('dori_sklad_telegram_royxat', { p_warehouse_id: id });
    setUlanganlar((u ?? []) as Ulangan[]);
    setUEmail(''); setUNom(''); setUParol('');
    const { data: uu } = await supabase.rpc('dori_sklad_user_royxat', { p_warehouse_id: id });
    setUserlar((uu ?? []) as SkladUser[]);
  }

  async function saqla() {
    if (!shakl) return;
    if (!shakl.name.trim()) { setXato('Sklad nomi kerak'); return; }
    setIsh('Saqlanmoqda...');
    setXato(null);
    const { error } = await supabase.rpc('dori_sklad_saqla', {
      p_id: shakl.id,
      p_name: shakl.name,
      p_code: shakl.code,
      p_phone: shakl.phone,
      p_address: shakl.address,
      p_contact_name: shakl.contact_name,
      p_note: shakl.note,
      p_markup_pct: raqam(shakl.markup_pct),
      p_markup_sum: raqam(shakl.markup_sum),
      p_discount_pct: raqam(shakl.discount_pct),
      p_discount_sum: raqam(shakl.discount_sum),
      p_priority: raqam(shakl.priority) ?? 100,
    });
    setIsh(null);
    if (error) { setXato('Saqlanmadi: ' + error.message); return; }
    setXabar(shakl.id ? 'Sklad yangilandi, narxlar qayta hisoblandi' : 'Sklad qo‘shildi');
    setShakl(null);
    await yukla();
  }

  async function ochir(s: Sklad) {
    const ogoh = s.is_default
      ? '\n\nBu ASOSIY sklad. O‘chirilsa, asosiylik keyingi skladga o‘tadi.'
      : '';
    if (!await tasdiqlaSoz(`"${s.name}" o‘chirilsinmi? Undagi ${son(s.pozitsiya)} pozitsiya ham o‘chadi.${ogoh}`)) return;
    const { error } = await supabase.rpc('dori_sklad_ochir', { p_id: s.id });
    if (error) { setXato('O‘chirilmadi: ' + error.message); return; }
    if (tanlangan === s.id) setTanlangan(null);
    setXabar('Sklad o‘chirildi');
    await yukla();
  }

  async function kodYarat(wh: string) {
    if (!kodTel.trim()) { setXato('Telefon raqamni yozing — kod aynan shu raqamga beriladi'); return; }
    setXato(null);
    const { data, error } = await supabase.rpc('dori_sklad_kod', {
      p_warehouse_id: wh,
      p_phone: kodTel,
    });
    if (error) { setXato('Kod yaratilmadi: ' + error.message); return; }
    setKod(data as { code: string; phone: string });
  }

  async function uz(chatId: string) {
    if (!await tasdiqlaSoz('Bu Telegram akkaunt skladdan uzilsinmi?')) return;
    const { error } = await supabase.rpc('dori_sklad_uzish', { p_chat_id: Number(chatId) });
    if (error) { setXato('Uzilmadi: ' + error.message); return; }
    setUlanganlar((p) => p.filter((x) => x.chat_id !== chatId));
  }

  // Parolsiz qo'shish: xodim Google bilan kiradi. Emaili ro'yxatda
  // bo'lmasa Google tugmasi unga hech narsa ochmaydi.
  async function userQosh(wh: string) {
    if (!uEmail.includes('@')) { setXato('Email noto‘g‘ri'); return; }
    setXato(null);
    setIsh('Qo‘shilmoqda...');

    if (uParol.trim()) {
      if (uParol.trim().length < 8) { setIsh(null); setXato('Parol kamida 8 belgi bo‘lsin'); return; }
      const { data, error } = await supabase.functions.invoke('dori-sklad-user', {
        body: { warehouse_id: wh, email: uEmail.trim(), parol: uParol.trim(), full_name: uNom.trim() || null },
      });
      setIsh(null);
      if (error) {
        const sabab = await fnXato(error);
        setXato('Yaratilmadi: ' + sabab);
        return;
      }
      void data;
      setXabar('Login yaratildi — xodim email va parol bilan kira oladi');
    } else {
      const { error } = await supabase.rpc('dori_sklad_user_qosh', {
        p_warehouse_id: wh, p_email: uEmail.trim(), p_full_name: uNom.trim() || null,
      });
      setIsh(null);
      if (error) { setXato('Qo‘shilmadi: ' + error.message); return; }
      setXabar('Email ro‘yxatga olindi — xodim Google bilan kira oladi');
    }

    setUEmail(''); setUNom(''); setUParol('');
    const { data: uu } = await supabase.rpc('dori_sklad_user_royxat', { p_warehouse_id: wh });
    setUserlar((uu ?? []) as SkladUser[]);
  }

  async function userOchir(id: string) {
    if (!await tasdiqlaSoz('Bu hisob o‘chirilsinmi? Xodim kabinetga kira olmaydi.')) return;
    const { error } = await supabase.rpc('dori_sklad_user_ochir', { p_id: id });
    if (error) { setXato('O‘chirilmadi: ' + error.message); return; }
    setUserlar((p) => p.filter((x) => x.id !== id));
  }

  async function cheklovniOzgartir(yangi: boolean) {
    setXato(null);
    const { error } = await supabase.rpc('dori_sozlama_qoy', { p_qoldiq_cheklovi: yangi });
    if (error) { setXato('Saqlanmadi: ' + error.message); return; }
    setCheklov(yangi);
    setXabar(
      yangi
        ? 'Qoldiq cheklovi YOQILDI — qoldiqdan ortiq buyurtma berib bo‘lmaydi'
        : 'Qoldiq cheklovi O‘CHIRILDI — qoldiq endi faqat ma’lumot, hech narsani to‘xtatmaydi'
    );
  }

  async function asosiyQil(w: Sklad) {
    const { error } = await supabase.rpc('dori_sklad_asosiy_qil', { p_id: w.id });
    if (error) { setXato('O‘zgartirilmadi: ' + error.message); return; }
    setXabar(`«${w.name}» endi asosiy sklad`);
    await yukla();
  }

  // Dorining O'ZI o'chmaydi - faqat shu skladdagi taklifi. Dori boshqa
  // skladda bo'lishi va eski buyurtmalarga bog'langan bo'lishi mumkin.
  async function tanlanganlarniOchir(wh: string) {
    const ids = [...tanlangan_dori];
    if (ids.length === 0) return;
    if (!await tasdiqlaSoz(`${ids.length} ta pozitsiya shu skladdan o‘chirilsinmi?\n\nDorining o‘zi katalogda qoladi.`)) return;
    setIsh('O‘chirilmoqda...');
    const { error } = await supabase.rpc('dori_taklif_ochir', {
      p_warehouse_id: wh, p_product_ids: ids,
    });
    setIsh(null);
    if (error) { setXato('O‘chirilmadi: ' + error.message); return; }
    setQatorlar((p) => p.filter((x) => !tanlangan_dori.has(x.id)));
    setJami((n) => Math.max(0, n - ids.length));
    setTanlanganDori(new Set());
    setXabar(`${ids.length} ta pozitsiya o‘chirildi`);
    await yukla();
  }

  async function praysniTozala(w: Sklad) {
    if (!await tasdiqlaSoz(`«${w.name}» skladining BUTUN praysi o‘chirilsinmi?\n\n${son(w.pozitsiya)} pozitsiya. Dorilar katalogda qoladi.`)) return;
    setIsh('Tozalanmoqda...');
    const { error } = await supabase.rpc('dori_sklad_prays_tozala', { p_warehouse_id: w.id });
    setIsh(null);
    if (error) { setXato('Tozalanmadi: ' + error.message); return; }
    setQatorlar([]); setJami(0); setTanlanganDori(new Set());
    setXabar('Prays tozalandi');
    await yukla();
  }

  function tahrirla(s: Sklad) {
    setShakl({
      id: s.id,
      name: s.name,
      code: s.code ?? '',
      phone: s.phone ?? '',
      address: s.address ?? '',
      contact_name: s.contact_name ?? '',
      note: s.note ?? '',
      markup_pct: s.markup_pct == null ? '' : String(s.markup_pct),
      markup_sum: s.markup_sum == null ? '' : String(s.markup_sum),
      discount_pct: s.discount_pct == null ? '' : String(s.discount_pct),
      discount_sum: s.discount_sum == null ? '' : String(s.discount_sum),
      priority: String(s.priority),
    });
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';
  const inp = 'w-full px-2 py-1.5 text-[13px] outline-none';
  const inpStyle = {
    background: C.field,
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
  };
  const joriy = skladlar.find((s) => s.id === tanlangan) ?? null;

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger} yop={() => setXato(null)}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon} yop={() => setXabar(null)}>{xabar}</Xabar>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
            SKLADLAR
          </div>
          <div className="text-[11px]" style={{ color: C.text }}>
            har sklad o‘z narxi va o‘z qoldig‘i bilan · ustama shu yerda belgilanadi
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cheklov !== null && (
            <button
              onClick={() => cheklovniOzgartir(!cheklov)}
              className={btn}
              title="O‘chirilganda qoldiq faqat ma’lumot bo‘lib qoladi va buyurtmani to‘xtatmaydi"
              style={{
                color: cheklov ? C.onAccent : C.text,
                background: cheklov ? C.neon2 : 'transparent',
                border: `1px solid ${cheklov ? C.neon2 : C.line}`,
                borderRadius: RADIUS,
              }}
            >
              QOLDIQ CHEKLOVI: {cheklov ? 'YOQILGAN' : 'O‘CHIQ'}
            </button>
          )}
          <button
            onClick={() => setShakl({ ...BOSH_SHAKL })}
            className={btn}
            style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}`, borderRadius: RADIUS }}
          >
            + SKLAD QO‘SHISH
          </button>
        </div>
      </div>

      {/* ---------- shakl ---------- */}
      {shakl && (
        <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}>
          <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
            {shakl.id ? 'SKLADNI TAHRIRLASH' : 'YANGI SKLAD'}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Maydon nom="NOMI *">
              <input value={shakl.name} onChange={(e) => setShakl({ ...shakl, name: e.target.value })}
                     placeholder="Chilonzor ombori" className={inp} style={inpStyle} />
            </Maydon>
            <Maydon nom="BELGI">
              <input value={shakl.code} onChange={(e) => setShakl({ ...shakl, code: e.target.value })}
                     placeholder="CHL" className={inp} style={inpStyle} />
            </Maydon>
            <Maydon nom="TELEFON">
              <input value={shakl.phone} onChange={(e) => setShakl({ ...shakl, phone: e.target.value })}
                     placeholder="+998 90 000 00 00" className={inp} style={inpStyle} />
            </Maydon>
            <Maydon nom="MAS'UL SHAXS">
              <input value={shakl.contact_name} onChange={(e) => setShakl({ ...shakl, contact_name: e.target.value })}
                     className={inp} style={inpStyle} />
            </Maydon>
            <Maydon nom="MANZIL">
              <input value={shakl.address} onChange={(e) => setShakl({ ...shakl, address: e.target.value })}
                     className={inp} style={inpStyle} />
            </Maydon>
            <Maydon nom="USTUVORLIK (kichik = avval)">
              <input value={shakl.priority} onChange={(e) => setShakl({ ...shakl, priority: e.target.value })}
                     className={inp} style={inpStyle} />
            </Maydon>
          </div>

          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
            <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
              NARX QO‘YISH — FOIZDA YOKI SUMMADA
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Maydon nom="USTAMA %">
                <input value={shakl.markup_pct} onChange={(e) => setShakl({ ...shakl, markup_pct: e.target.value })}
                       placeholder="5" className={inp} style={inpStyle} />
              </Maydon>
              <Maydon nom="USTAMA SO‘M">
                <input value={shakl.markup_sum} onChange={(e) => setShakl({ ...shakl, markup_sum: e.target.value })}
                       placeholder="2000" className={inp} style={inpStyle} />
              </Maydon>
              <Maydon nom="CHEGIRMA %">
                <input value={shakl.discount_pct} onChange={(e) => setShakl({ ...shakl, discount_pct: e.target.value })}
                       className={inp} style={inpStyle} />
              </Maydon>
              <Maydon nom="CHEGIRMA SO‘M">
                <input value={shakl.discount_sum} onChange={(e) => setShakl({ ...shakl, discount_sum: e.target.value })}
                       className={inp} style={inpStyle} />
              </Maydon>
            </div>
            <div className="mt-2 text-[11px]" style={{ color: C.text }}>
              Bo‘sh qoldirilsa — bu sklad uchun qoida yo‘q, umumiy ustama ishlaydi.
              Alohida dori yoki guruh qoidasi esa skladnikidan kuchli.
            </div>
          </div>

          <Maydon nom="IZOH">
            <input value={shakl.note} onChange={(e) => setShakl({ ...shakl, note: e.target.value })}
                   className={inp} style={inpStyle} />
          </Maydon>

          <div className="mt-3 flex gap-2">
            <button onClick={saqla} className={btn}
                    style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
              SAQLASH
            </button>
            <button onClick={() => setShakl(null)} className={btn}
                    style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
              BEKOR
            </button>
          </div>
        </div>
      )}

      {/* ---------- ro'yxat ---------- */}
      <div className="mb-4 grid gap-2">
        {skladlar.length === 0 && (
          <div className="p-6 text-center text-[12px]" style={{ color: C.text, border: `1px dashed ${C.line}` }}>
            Hali sklad yo‘q. «+ SKLAD QO‘SHISH» bilan boshlang.
          </div>
        )}

        {skladlar.map((s) => {
          const faol = tanlangan === s.id;
          return (
            <div
              key={s.id}
              className="p-3"
              style={{
                background: faol ? C.panel2 : C.panel,
                border: `1px solid ${faol ? C.neon : C.line}`,
                borderRadius: RADIUS,
                opacity: s.is_active ? 1 : 0.55,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={() => (faol ? setTanlangan(null) : skladniOch(s.id))} className="text-left">
                  <div className="text-[13px] font-bold" style={{ color: C.textBright }}>
                    {s.name}
                    {s.code && <span style={{ color: C.text }}> · {s.code}</span>}
                    {s.is_default && (
                      <span className="ml-2 px-1.5 py-0.5 text-[9px]"
                            style={{ color: C.onAccent, background: C.neon2 }}>ASOSIY</span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: C.text }}>
                    {son(s.pozitsiya)} pozitsiya · qoldiqli {son(s.qoldiqli)} · ombor {son(s.qiymat)} so‘m ·
                    oxirgi yuklash {sana(s.oxirgi_yuklash)}
                  </div>
                </button>

                <div className="flex items-center gap-3">
                  <div className="text-right text-[11px]" style={{ color: C.text }}>
                    <div>
                      ustama{' '}
                      <b style={{ color: C.neon }}>
                        {s.markup_pct != null ? `${s.markup_pct}%` : ''}
                        {s.markup_pct != null && s.markup_sum != null ? ' + ' : ''}
                        {s.markup_sum != null ? `${son(s.markup_sum)} so‘m` : ''}
                        {s.markup_pct == null && s.markup_sum == null ? 'umumiy' : ''}
                      </b>
                    </div>
                    {(s.discount_pct != null || s.discount_sum != null) && (
                      <div>
                        chegirma{' '}
                        <b style={{ color: C.warn }}>
                          {s.discount_pct != null ? `${s.discount_pct}%` : ''}
                          {s.discount_pct != null && s.discount_sum != null ? ' + ' : ''}
                          {s.discount_sum != null ? `${son(s.discount_sum)} so‘m` : ''}
                        </b>
                      </div>
                    )}
                  </div>
                  <button onClick={() => tahrirla(s)} className="px-2 py-1 text-[10px] font-bold"
                          style={{ color: C.neon2, border: `1px solid ${C.line}` }}>
                    TAHRIR
                  </button>
                  {!s.is_default && (
                    <button onClick={() => asosiyQil(s)} className="px-2 py-1 text-[10px] font-bold"
                            style={{ color: C.text, border: `1px solid ${C.line}` }}>
                      ASOSIY QIL
                    </button>
                  )}
                  <button onClick={() => praysniTozala(s)} className="px-2 py-1 text-[10px] font-bold"
                          style={{ color: C.warn, border: `1px solid ${C.line}` }}>
                    PRAYSNI TOZALA
                  </button>
                  <button onClick={() => ochir(s)} className="px-2 py-1 text-[10px] font-bold"
                          style={{ color: C.danger, border: `1px solid ${C.line}` }}>
                    O‘CHIR
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- skladning praysi ---------- */}
      {joriy && (
        <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
              {joriy.name.toUpperCase()} — PRAYS ({son(jami)})
            </div>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOfset(0);
                narxlarniYukla(joriy.id, e.target.value, 0);
              }}
              placeholder="dori nomi yoki ishlab chiqaruvchi"
              className="px-2 py-1.5 text-[12px] outline-none"
              style={{ ...inpStyle, width: 280 }}
            />
          </div>

          {/* ---------- Prays yuklash ---------- */}
          <div className="mb-4">
            <button
              onClick={() => setPraysOchiq((v) => !v)}
              className={btn}
              style={{
                color: praysOchiq ? C.onAccent : C.neon,
                background: praysOchiq ? C.neon : 'transparent',
                border: `1px solid ${C.neon}`,
                borderRadius: RADIUS,
              }}
            >
              {praysOchiq ? '▾ PRAYS YUKLASH' : '▸ PRAYS YUKLASH'}
            </button>

            {praysOchiq && (
              <div className="mt-3 p-3" style={{ border: `1px solid ${C.neon}`, background: C.panel2 }}>
                <PraysYuklash
                  warehouseId={joriy.id}
                  skladNomi={joriy.name}
                  onYakun={async () => {
                    await yukla();
                    await narxlarniYukla(joriy.id, q, 0);
                    setXabar(`${joriy.name}: prays yangilandi`);
                  }}
                />
              </div>
            )}
          </div>

          {/* ---------- Kabinet hisoblari ---------- */}
          <div className="mb-4 p-3" style={{ background: C.panel2, border: `1px solid ${C.line}` }}>
            <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
              KABINET — SKLAD XODIMI BRAUZERDAN KIRADI
            </div>

            {userlar.length > 0 ? (
              <div className="mb-3 grid gap-1">
                {userlar.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 text-[11px]">
                    <span style={{ color: C.textBright }}>
                      {u.email}
                      <span style={{ color: C.text }}>
                        {u.full_name ? ` · ${u.full_name}` : ''}
                        {u.kirgan ? ' · kirgan' : ' · hali kirmagan'}
                      </span>
                    </span>
                    <button onClick={() => userOchir(u.id)} className="px-2 py-0.5 text-[10px]"
                            style={{ color: C.danger, border: `1px solid ${C.line}` }}>
                      O‘CHIR
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-3 text-[11px]" style={{ color: C.text }}>
                Hali hisob yo‘q — sklad kabinetga kira olmaydi.
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px]" style={{ color: C.text }}>EMAIL</span>
                <input value={uEmail} onChange={(e) => setUEmail(e.target.value)}
                       placeholder="xodim@sklad.uz"
                       className="px-2 py-1.5 text-[13px] outline-none"
                       style={{ ...inpStyle, width: 210 }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px]" style={{ color: C.text }}>ISM</span>
                <input value={uNom} onChange={(e) => setUNom(e.target.value)}
                       className="px-2 py-1.5 text-[13px] outline-none"
                       style={{ ...inpStyle, width: 150 }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px]" style={{ color: C.text }}>
                  PAROL (bo‘sh = faqat Google)
                </span>
                <input value={uParol} onChange={(e) => setUParol(e.target.value)}
                       type="text" placeholder="kamida 8 belgi"
                       className="px-2 py-1.5 text-[13px] outline-none"
                       style={{ ...inpStyle, width: 170 }} />
              </label>
              <button onClick={() => userQosh(joriy.id)} disabled={!!ish} className={btn}
                      style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
                QO‘SHISH
              </button>
            </div>

            <div className="mt-2 text-[11px]" style={{ color: C.text }}>
              Parol yozsangiz — xodim email va parol bilan kiradi. Bo‘sh qoldirsangiz —
              faqat <b>Google bilan kirish</b> ishlaydi (emaili shu ro‘yxatda bo‘lgani uchun).
              Kabinetda u o‘z so‘rovlarini, praysini va qoldig‘ini ko‘radi; mijoz narxini emas.
            </div>
          </div>

          {/* ---------- Telegram ---------- */}
          <div className="mb-4 p-3" style={{ background: C.panel2, border: `1px solid ${C.line}` }}>
            <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
              TELEGRAM — SO‘ROVLAR SHU YERGA KELADI
            </div>

            {ulanganlar.length > 0 ? (
              <div className="mb-3 grid gap-1">
                {ulanganlar.map((u) => (
                  <div key={u.chat_id} className="flex items-center justify-between gap-3 text-[11px]">
                    <span style={{ color: C.textBright }}>
                      {u.name || 'noma’lum'}{' '}
                      <span style={{ color: C.text }}>
                        · {u.phone}
                        {u.username ? ` · @${u.username}` : ''}
                      </span>
                    </span>
                    <button onClick={() => uz(u.chat_id)} className="px-2 py-0.5 text-[10px]"
                            style={{ color: C.danger, border: `1px solid ${C.line}` }}>
                      UZISH
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-3 text-[11px]" style={{ color: C.warn }}>
                Hali hech kim ulanmagan — so‘rov Telegramga bormaydi, faqat panelda turadi.
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px]" style={{ color: C.text }}>SKLAD XODIMI RAQAMI</span>
                <input value={kodTel} onChange={(e) => setKodTel(e.target.value)}
                       placeholder="+998 90 000 00 00"
                       className="px-2 py-1.5 text-[13px] outline-none"
                       style={{ ...inpStyle, width: 200 }} />
              </label>
              <button onClick={() => kodYarat(joriy.id)} className={btn}
                      style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}>
                KOD YARATISH
              </button>
            </div>

            {kod && (
              <div className="mt-3 p-3 text-[12px]"
                   style={{ color: C.textBright, border: `1px dashed ${C.neon}`, background: sh(C.neon, 6) }}>
                <div>
                  Kod: <b style={{ color: C.neon, fontSize: 16, letterSpacing: '0.1em' }}>{kod.code}</b>
                </div>
                <div className="mt-1" style={{ color: C.text }}>
                  Shu kodni <b>{kod.phone}</b> raqamli xodimga bering. U{' '}
                  <a href="https://t.me/Idaa_dori_bot" target="_blank" rel="noreferrer"
                     style={{ color: C.neon2 }}>@Idaa_dori_bot</a>{' '}
                  ga kodni yozadi va o‘z raqamini yuboradi. Kod <b>24 soat</b> amal qiladi va
                  faqat shu raqam bilan ishlaydi.
                </div>
              </div>
            )}
          </div>

          {tarix.length > 0 && (
            <div className="mb-3 text-[11px]" style={{ color: C.text }}>
              Oxirgi yuklashlar:{' '}
              {tarix.slice(0, 3).map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ' · '}
                  {sana(t.created_at)} {t.file_name ? `(${t.file_name.slice(0, 22)})` : ''}
                  {t.natija?.sotuvdan_olindi ? ` · ${t.natija.sotuvdan_olindi} ta o‘chdi` : ''}
                </span>
              ))}
            </div>
          )}

          {tanlangan_dori.size > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-3 p-2"
                 style={{ border: `1px solid ${C.warn}`, background: sh(C.warn, 8) }}>
              <span className="text-[11px]" style={{ color: C.textBright }}>
                {son(tanlangan_dori.size)} ta pozitsiya belgilandi
              </span>
              <button onClick={() => tanlanganlarniOchir(joriy.id)} className="px-2 py-1 text-[10px] font-bold"
                      style={{ color: C.danger, border: `1px solid ${C.danger}` }}>
                SHU SKLADDAN O‘CHIRISH
              </button>
              <button onClick={() => setTanlanganDori(new Set())} className="px-2 py-1 text-[10px]"
                      style={{ color: C.text, border: `1px solid ${C.line}` }}>
                BEKOR
              </button>
              <span className="text-[11px]" style={{ color: C.text }}>
                Dorining o‘zi katalogda qoladi — faqat shu skladdagi taklifi o‘chadi.
              </span>
            </div>
          )}

          {ish && <div className="mb-2 text-[11px]" style={{ color: C.neon2 }}>{ish}</div>}

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: sh(C.text, 80) }}>
                  <th className="px-2 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                    <input
                      type="checkbox"
                      checked={qatorlar.length > 0 && tanlangan_dori.size === qatorlar.length}
                      onChange={(e) =>
                        setTanlanganDori(e.target.checked ? new Set(qatorlar.map((r) => r.id)) : new Set())
                      }
                    />
                  </th>
                  {['DORI', 'ISHLAB CHIQARUVCHI', 'QOLDIQ', 'TANNARX', 'SOTUV', 'SERIYA', 'MUDDAT'].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left text-[9px] font-bold tracking-[0.14em]"
                        style={{ borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qatorlar.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? C.zebra : 'transparent' }}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={tanlangan_dori.has(r.id)}
                        onChange={(e) => {
                          const y = new Set(tanlangan_dori);
                          if (e.target.checked) y.add(r.id); else y.delete(r.id);
                          setTanlanganDori(y);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5" style={{ color: C.textBright, minWidth: 220 }}>{r.name}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{r.manufacturer ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: Number(r.stock) > 0 ? C.text : C.danger }}>
                      {son(r.stock)}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{son(r.base_price)}</td>
                    <td className="px-2 py-1.5 font-bold" style={{ color: C.neon }}>{son(r.price)}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{r.seriyalar ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text, whiteSpace: 'nowrap' }}>
                      {sana(r.eng_yaqin_muddat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {qatorlar.length < jami && (
            <button
              onClick={() => {
                const y = ofset + SAHIFA;
                setOfset(y);
                narxlarniYukla(joriy.id, q, y);
              }}
              className="mt-3 w-full py-2 text-[11px] font-bold"
              style={{ color: C.text, border: `1px solid ${C.line}` }}
            >
              YANA {son(Math.min(SAHIFA, jami - qatorlar.length))} TA
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Maydon({ nom, children }: { nom: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block md:mt-0">
      <span className="mb-1 block text-[10px]" style={{ color: C.text }}>{nom}</span>
      {children}
    </label>
  );
}

function Xabar({ rang, yop, children }: { rang: string; yop: () => void; children: React.ReactNode }) {
  return (
    <div
      className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
      style={{ color: rang, border: `1px solid ${rang}`, background: sh(rang, 8) }}
    >
      <span>{children}</span>
      <button onClick={yop} style={{ color: rang }}>✕</button>
    </div>
  );
}
