import { useCallback, useEffect, useState, useRef } from 'react';
import { tasdiqlaSoz } from '../components/Xabar';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';

// ============================================================================
// NARX QO'YISH — ustama foiz va chegirma.
//
// Fayldan kelgan narx TANNARX bo'lib qoladi va mijozga ko'rinmaydi.
// Bu yerda ustiga qoida qo'yiladi, sotuv narxi shundan hisoblanadi.
//
// Har o'zgarishdan OLDIN oldindan ko'rish: nechta dori narxi o'zgaradi va
// misollari. Bazaga faqat tasdiqlagach yoziladi — 6900 dorining narxini
// tasodifan buzib qo'yish juda oson bo'lardi.
// ============================================================================


type Umumiy = {
  jami: number;
  yaxlitlash: number;
  umumiy_ustama: number | null;
  umumiy_chegirma: number | null;
  umumiy_ustama_sum: number | null;
  umumiy_chegirma_sum: number | null;
  ortacha_ustama: number | null;
  // Foizni summaga almashtirishning butun ma'nosi shu ikki raqamda:
  // bitta dorida o'rtacha necha so'm foyda va nechtasida foyda YO'Q
  ortacha_foyda: number | null;
  foydasiz: number | null;
  guruhlar: { grp: string; n: number }[];
};

type Qoida = {
  id: string;
  scope: 'global' | 'group' | 'product';
  target_key: string | null;
  nishon: string | null;
  markup_pct: number | null;
  discount_pct: number | null;
  note: string | null;
};

type Korish = {
  dorilar: number;
  ozgaradi: number;
  namuna: { name: string; tannarx: number; hozirgi: number; yangi: number }[];
  // Kuch tartibi: dori > guruh > SKLAD > umumiy. O'z ustamasi bor sklad
  // umumiy foizni QABUL QILMAYDI — buni aytmasak, foydalanuvchi
  // "foiz qo'shilmadi" deb o'ylaydi va sababini topolmaydi.
  chetda_qolgan_skladlar?: { sklad: string; ustama_pct: number | null; ustama_sum: number | null }[];
};

type Dori = {
  id: string;
  name: string;
  grp: string | null;
  tannarx: number;
  sotuv: number;
  oz_ustamasi: number | null;
  oz_chegirmasi: number | null;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const SCOPE_NOM: Record<string, string> = {
  global: 'Hamma doriga',
  group: 'Guruh',
  product: 'Alohida dori',
};

export default function NarxlarPaneli() {
  const [umumiy, setUmumiy] = useState<Umumiy | null>(null);
  const [qoidalar, setQoidalar] = useState<Qoida[]>([]);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  // umumiy ustama
  const [ustama, setUstama] = useState('');
  const [chegirma, setChegirma] = useState('');
  // Foiz kichik summalarda yo'qoladi (900 so'mning 5% i yaxlitlashdan
  // keyin 0), shuning uchun summada qo'yish ham kerak
  const [ustamaSum, setUstamaSum] = useState('');
  const [chegirmaSum, setChegirmaSum] = useState('');
  const [korish, setKorish] = useState<Korish | null>(null);

  // tanlangan dorilar
  const [q, setQ] = useState('');
  const [topilgan, setTopilgan] = useState<Dori[]>([]);
  const [tanlangan, setTanlangan] = useState<Record<string, Dori>>({});
  const [tanlUstama, setTanlUstama] = useState('');
  const [tanlChegirma, setTanlChegirma] = useState('');
  const [tanlUstamaSum, setTanlUstamaSum] = useState('');
  const [tanlChegirmaSum, setTanlChegirmaSum] = useState('');

  const yukla = useCallback(async () => {
    const [o, r] = await Promise.all([
      supabase.rpc('dori_price_overview'),
      supabase.rpc('dori_price_rules_list'),
    ]);
    setUmumiy((o.data ?? null) as Umumiy | null);
    setQoidalar((r.data ?? []) as Qoida[]);
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const foiz = (s: string): number | null => {
    const t = s.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  async function oldindanKor() {
    setXato(null);
    setXabar(null);
    setIsh('Hisoblanmoqda...');
    const { data, error } = await supabase.rpc('dori_price_preview', {
      p_scope: 'global',
      p_target_key: null,
      p_markup_pct: foiz(ustama),
      p_discount_pct: foiz(chegirma),
      p_markup_sum: foiz(ustamaSum),
      p_discount_sum: foiz(chegirmaSum),
    });
    setIsh(null);
    if (error) return setXato(error.message);
    setKorish(data as Korish);
  }

  async function umumiyQolla() {
    setIsh('Narxlar yangilanmoqda...');
    const { data, error } = await supabase.rpc('dori_price_rule_set', {
      p_scope: 'global',
      p_target_key: null,
      p_markup_pct: foiz(ustama),
      p_discount_pct: foiz(chegirma),
      p_note: null,
    });
    setIsh(null);
    if (error) return setXato(error.message);
    setKorish(null);
    setXabar(`Qo‘llandi: ${(data as any)?.ozgargan_narx ?? 0} ta dori narxi yangilandi.`);
    yukla();
  }

  async function qidir(matn: string) {
    setQ(matn);
    if (matn.trim().length < 2) return setTopilgan([]);
    const { data } = await supabase.rpc('dori_admin_search', { p_q: matn, p_limit: 30 });
    setTopilgan((data ?? []) as Dori[]);
  }

  function tanla(d: Dori) {
    setTanlangan((t) => {
      const yangi = { ...t };
      if (yangi[d.id]) delete yangi[d.id];
      else yangi[d.id] = d;
      return yangi;
    });
  }

  async function tanlanganlargaQolla() {
    const ids = Object.keys(tanlangan);
    if (!ids.length) return setXato('Avval dori tanlang');
    setIsh('Tanlanganlarga qo‘llanmoqda...');
    const { data, error } = await supabase.rpc('dori_price_rule_bulk', {
      p_ids: ids,
      p_markup_pct: foiz(tanlUstama),
      p_discount_pct: foiz(tanlChegirma),
      p_markup_sum: foiz(tanlUstamaSum),
      p_discount_sum: foiz(tanlChegirmaSum),
      p_note: null,
    });
    setIsh(null);
    if (error) return setXato(error.message);
    setXabar(
      `${(data as any)?.dorilar ?? 0} ta doriga qo‘llandi, ${(data as any)?.ozgargan_narx ?? 0} ta narx yangilandi.`
    );
    setTanlangan({});
    setTanlUstama('');
    setTanlChegirma('');
    setTanlUstamaSum('');
    setTanlChegirmaSum('');
    if (q) qidir(q);
    yukla();
  }

  async function qoidaniOchir(r: Qoida) {
    if (!await tasdiqlaSoz(`${SCOPE_NOM[r.scope]}${r.nishon ? ' · ' + r.nishon : ''} qoidasi o‘chirilsinmi?`)) return;
    setIsh('O‘chirilmoqda...');
    // Qoidani o'chirish = foizlarni bo'sh qilib yuborish. RPC shuni
    // "o'chirish" deb tushunadi va narxlarni qayta hisoblaydi.
    const { error } =
      r.scope === 'product'
        ? await supabase.rpc('dori_price_rule_bulk', {
            p_ids: [r.target_key],
            p_markup_pct: null,
            p_discount_pct: null,
          })
        : await supabase.rpc('dori_price_rule_set', {
            p_scope: r.scope,
            p_target_key: r.target_key,
            p_markup_pct: null,
            p_discount_pct: null,
          });
    setIsh(null);
    if (error) return setXato(error.message);
    yukla();
  }

  // ---------- prays brendi ----------
  // Firma nomi va logo mijozga yuboriladigan Excel praysida chiqadi.
  const [firma, setFirma] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const brendYukla = useCallback(async () => {
    const { data } = await supabase
      .from('dori_settings')
      .select('firma_nomi, logo_path')
      .maybeSingle();
    setFirma((data as any)?.firma_nomi ?? '');
    const yol = (data as any)?.logo_path;
    if (!yol) return setLogoUrl(null);
    // Bucket yopiq — ko'rsatish uchun imzolangan havola
    const { data: h } = await supabase.storage.from('dori-logo').createSignedUrl(yol, 3600);
    setLogoUrl(h?.signedUrl ?? null);
  }, []);

  useEffect(() => {
    brendYukla();
  }, [brendYukla]);

  async function firmaSaqla() {
    await supabase.from('dori_settings').update({ firma_nomi: firma.trim() || 'IDAA FARM' }).eq('id', true);
  }

  async function logoOchir() {
    // Tasdiq so'raymiz: fayl bucket'dan butunlay o'chadi, qaytarib
    // bo'lmaydi — logoni qaytadan yuklash kerak bo'ladi.
    if (!(await tasdiqlaSoz('Logo o‘chirilsinmi? Praysda faqat firma nomi qoladi.'))) return;
    setXato(null);
    try {
      const { data } = await supabase.from('dori_settings').select('logo_path').maybeSingle();
      const yol = (data as any)?.logo_path;

      // Avval sozlamani tozalaymiz, keyin faylni. Teskarisi bo'lsa va
      // ikkinchi qadam yiqilsa, sozlamada yo'q faylga ishora qolib,
      // eksport har safar uni yuklamoqchi bo'lib urinardi.
      await supabase.from('dori_settings').update({ logo_path: null }).eq('id', true);
      if (yol) await supabase.storage.from('dori-logo').remove([yol]);

      await brendYukla();
    } catch (e: any) {
      setXato('Logo o‘chirilmadi: ' + (e?.message ?? ''));
    }
  }

  async function logoYukla(fayl: File) {
    setXato(null);
    try {
      const kengaytma = fayl.type === 'image/png' ? 'png' : 'jpg';
      // Nomda vaqt bor: brauzer eski rasmni keshdan ko'rsatib qolmasin
      const yol = `logo-${Date.now()}.${kengaytma}`;
      const { error } = await supabase.storage.from('dori-logo').upload(yol, fayl, {
        contentType: fayl.type,
        upsert: true,
      });
      if (error) throw error;

      // Eskisini o'chiramiz — bucket'da yig'ilib qolmasin
      const { data: eski } = await supabase
        .from('dori_settings')
        .select('logo_path')
        .maybeSingle();
      const eskiYol = (eski as any)?.logo_path;

      await supabase.from('dori_settings').update({ logo_path: yol }).eq('id', true);
      if (eskiYol && eskiYol !== yol) {
        await supabase.storage.from('dori-logo').remove([eskiYol]);
      }
      await brendYukla();
    } catch (e: any) {
      setXato('Logo yuklanmadi: ' + (e?.message ?? ''));
    }
  }

  async function yaxlitlashniOzgartir(v: number) {
    await supabase.from('dori_settings').update({ rounding: v }).eq('id', true);
    await supabase.rpc('dori_narx_hisobla', { p_ids: null });
    yukla();
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';
  const inp = 'w-24 px-2 py-1.5 text-[13px] outline-none';
  const inpStyle = {
    background: C.field,
    border: `1px solid ${C.line}`,
    color: C.textBright,
    fontFamily: MONO,
  };

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon}>{xabar}</Xabar>}
      {ish && <Xabar rang={C.neon2}>{ish}</Xabar>}

      {/* ---------- holat ---------- */}
      {umumiy && (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <Quti sarlavha="KATALOGDA">
            <span className="text-2xl font-extrabold" style={{ color: C.neon }}>
              {son(umumiy.jami)}
            </span>
          </Quti>
          <Quti sarlavha="UMUMIY USTAMA">
            <span className="text-2xl font-extrabold" style={{ color: C.textBright }}>
              {umumiy.umumiy_ustama != null ? `${umumiy.umumiy_ustama}%` : '—'}
            </span>
          </Quti>
          <Quti sarlavha="O‘RTACHA USTAMA">
            <span className="text-2xl font-extrabold" style={{ color: C.neon2 }}>
              {umumiy.ortacha_ustama != null ? `${umumiy.ortacha_ustama}%` : '—'}
            </span>
            <span className="mt-0.5 block text-[11px]" style={{ color: C.text }}>
              bitta dorida <b style={{ color: C.textBright }}>{son(umumiy.ortacha_foyda)}</b> so‘m foyda
            </span>
          </Quti>
          <Quti sarlavha="FOYDASIZ">
            <span
              className="text-2xl font-extrabold"
              style={{ color: Number(umumiy.foydasiz) > 0 ? C.warn : C.neon }}
            >
              {son(umumiy.foydasiz)}
            </span>
            <span className="mt-0.5 block text-[11px]" style={{ color: C.text }}>
              foiz kichik summada yo‘qolgan — summada qo‘ying
            </span>
          </Quti>
          <Quti sarlavha="YAXLITLASH">
            <select
              value={umumiy.yaxlitlash}
              onChange={(e) => yaxlitlashniOzgartir(Number(e.target.value))}
              className="w-full px-2 py-1 text-[12px] outline-none"
              style={inpStyle}
            >
              <option value={0}>yaxlitlamaslik</option>
              <option value={10}>10 so‘m</option>
              <option value={100}>100 so‘m</option>
              <option value={1000}>1000 so‘m</option>
            </select>
          </Quti>
        </div>
      )}

      {/* ---------- prays ko'rinishi ----------
          Bu yerdagi nom va logo mijozga yuboriladigan Excel praysining
          sarlavhasida chiqadi. Ular kodda emas, sozlamada: nom yoki
          logo o'zgarsa deploy kutish kerak emas. */}
      <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${sh(C.text, 80)}` }}>
          PRAYS KO‘RINISHI — MIJOZGA YUBORILADIGAN FAYL
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="shrink-0">
            <div className="mb-1 text-[10px]" style={{ color: C.text }}>LOGO</div>
            <div
              className="grid h-20 w-20 place-items-center overflow-hidden"
              style={{ background: C.field, border: `1px dashed ${C.line}`, borderRadius: RADIUS }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[10px]" style={{ color: `${sh(C.text, 60)}` }}>yo‘q</span>
              )}
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) logoYukla(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => logoRef.current?.click()}
              className="mt-1 w-20 py-1 text-[10px] font-bold"
              style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
            >
              {logoUrl ? 'ALMASHTIRISH' : 'YUKLASH'}
            </button>
            {/* Logo bo'lsa o'chirish ham kerak: avval faqat yuklash va
                almashtirish bor edi, ya'ni bir marta qo'yilgan logodan
                voz kechib bo'lmasdi. */}
            {logoUrl && (
              <button
                onClick={logoOchir}
                className="mt-1 w-20 py-1 text-[10px] font-bold"
                style={{ color: C.danger, border: `1px solid ${C.danger}`, borderRadius: RADIUS }}
              >
                O‘CHIRISH
              </button>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>FIRMA NOMI</span>
            <input
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              onBlur={firmaSaqla}
              placeholder="IDAA FARM"
              className="w-56 px-2 py-1.5 text-[13px] outline-none"
              style={inpStyle}
            />
          </label>

          <span className="text-[11px]" style={{ color: `${sh(C.text, 70)}` }}>
            PNG yoki JPEG. Logo hujjat ichiga joylanadi — mijoz faylni
            ochganda ko‘rinadi.
          </span>
        </div>
      </div>

      {/* ---------- umumiy ustama ---------- */}
      <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${sh(C.text, 80)}` }}>
          HAMMA DORIGA — USTAMA VA CHEGIRMA
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>USTAMA %</span>
            <input value={ustama} onChange={(e) => setUstama(e.target.value)} placeholder="5"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>CHEGIRMA %</span>
            <input value={chegirma} onChange={(e) => setChegirma(e.target.value)} placeholder="0"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.neon2 }}>USTAMA SO‘M</span>
            <input value={ustamaSum} onChange={(e) => setUstamaSum(e.target.value)} placeholder="2000"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>CHEGIRMA SO‘M</span>
            <input value={chegirmaSum} onChange={(e) => setChegirmaSum(e.target.value)} placeholder="0"
                   className={inp} style={inpStyle} />
          </label>
          <button onClick={oldindanKor} className={btn}
                  style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}>
            OLDINDAN KO‘RISH
          </button>
          {korish && (
            <button onClick={umumiyQolla} className={btn}
                    style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
              TASDIQLAB QO‘LLASH
            </button>
          )}
        </div>

        {korish && (
          <div className="mt-3" style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 12 }}>
            <div className="text-[12px]" style={{ color: C.textBright }}>
              {son(korish.dorilar)} dori · <b style={{ color: C.warn }}>{son(korish.ozgaradi)}</b> tasining narxi o‘zgaradi
            </div>

            {(korish.chetda_qolgan_skladlar?.length ?? 0) > 0 && (
              <div className="mt-2 p-2 text-[11px]"
                   style={{ color: C.warn, border: `1px solid ${C.warn}`, background: sh(C.warn, 8) }}>
                <b>Diqqat:</b> quyidagi skladlarda O‘Z ustamasi bor, shuning uchun umumiy foiz
                ularga tegmaydi:{' '}
                {korish.chetda_qolgan_skladlar!.map((w, i) => (
                  <span key={w.sklad}>
                    {i > 0 && ', '}
                    <b>{w.sklad}</b>
                    {w.ustama_pct != null ? ` (${w.ustama_pct}%)` : ''}
                    {w.ustama_sum != null ? ` (+${son(w.ustama_sum)} so‘m)` : ''}
                  </span>
                ))}
                . Ularning foizini <b>SKLADLAR</b> bo‘limidan o‘zgartiring yoki bo‘sh qoldiring —
                shunda umumiy foiz ishlaydi.
              </div>
            )}
            <div className="mt-2 grid gap-1">
              {korish.namuna.map((n, i) => (
                <div key={i} className="text-[11px]" style={{ color: C.text }}>
                  {n.name.slice(0, 46)} · tannarx {son(n.tannarx)} ·{' '}
                  <span style={{ color: C.text }}>{son(n.hozirgi)}</span> →{' '}
                  <b style={{ color: C.neon }}>{son(n.yangi)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- tanlanganlarga ---------- */}
      <div className="mb-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${sh(C.text, 80)}` }}>
          TANLANGAN DORILARGA — CHEGIRMA YOKI ALOHIDA USTAMA
        </div>

        <input
          value={q}
          onChange={(e) => qidir(e.target.value)}
          placeholder="dori nomini yozing (kirill yoki lotin)..."
          className="mb-3 w-full max-w-md px-3 py-2 text-[13px] outline-none"
          style={inpStyle}
        />

        {topilgan.length > 0 && (
          <div className="mb-3 max-h-72 overflow-y-auto" style={{ border: `1px solid ${C.line}` }}>
            {topilgan.map((d, i) => {
              const belgilangan = !!tanlangan[d.id];
              return (
                <div
                  key={d.id}
                  onClick={() => tanla(d)}
                  className="grid cursor-pointer gap-3 px-3 py-2 text-[11px]"
                  style={{
                    gridTemplateColumns: '18px 1fr 90px 90px 70px',
                    background: belgilangan ? `${sh(C.neon, 9)}` : i % 2 ? C.zebra : 'transparent',
                    borderTop: i ? `1px solid ${sh(C.line, 27)}` : 'none',
                  }}
                >
                  <span style={{ color: belgilangan ? C.neon : C.text }}>{belgilangan ? '☑' : '☐'}</span>
                  <span className="truncate" style={{ color: C.textBright }}>{d.name}</span>
                  <span className="text-right" style={{ color: `${sh(C.text, 67)}` }}>{son(d.tannarx)}</span>
                  <span className="text-right" style={{ color: C.textBright }}>{son(d.sotuv)}</span>
                  <span className="text-right" style={{ color: C.warn }}>
                    {d.oz_chegirmasi ? `−${d.oz_chegirmasi}%` : d.oz_ustamasi ? `+${d.oz_ustamasi}%` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[12px]" style={{ color: C.textBright }}>
            Tanlandi: <b style={{ color: C.neon }}>{Object.keys(tanlangan).length}</b>
          </span>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>USTAMA %</span>
            <input value={tanlUstama} onChange={(e) => setTanlUstama(e.target.value)} placeholder="—"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>CHEGIRMA %</span>
            <input value={tanlChegirma} onChange={(e) => setTanlChegirma(e.target.value)} placeholder="5"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.neon2 }}>USTAMA SO‘M</span>
            <input value={tanlUstamaSum} onChange={(e) => setTanlUstamaSum(e.target.value)} placeholder="2000"
                   className={inp} style={inpStyle} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>CHEGIRMA SO‘M</span>
            <input value={tanlChegirmaSum} onChange={(e) => setTanlChegirmaSum(e.target.value)} placeholder="—"
                   className={inp} style={inpStyle} />
          </label>
          <button
            onClick={tanlanganlargaQolla}
            disabled={!Object.keys(tanlangan).length}
            className={btn}
            style={{
              color: C.onAccent,
              background: C.warn,
              border: `1px solid ${C.warn}`,
              opacity: Object.keys(tanlangan).length ? 1 : 0.4,
            }}
          >
            SKIDKA / USTAMA QO‘YISH
          </button>
        </div>
      </div>

      {/* ---------- amaldagi qoidalar ---------- */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="px-4 py-2 text-[10px] font-bold tracking-[0.16em]"
             style={{ color: `${sh(C.text, 80)}`, borderBottom: `1px solid ${C.line}` }}>
          AMALDAGI QOIDALAR — {qoidalar.length}
        </div>
        {qoidalar.length === 0 && (
          <div className="p-8 text-center text-[11px]" style={{ color: C.text }}>
            Qoida yo‘q — narx tannarxga teng
          </div>
        )}
        {qoidalar.map((r, i) => (
          <div key={r.id} className="grid gap-3 px-4 py-2 text-[11px]"
               style={{ gridTemplateColumns: '110px 1fr 80px 80px 30px', borderTop: i ? `1px solid ${sh(C.line, 27)}` : 'none' }}>
            <span style={{ color: `${sh(C.text, 80)}` }}>{SCOPE_NOM[r.scope]}</span>
            <span className="truncate" style={{ color: C.textBright }}>{r.nishon ?? '—'}</span>
            <span className="text-right" style={{ color: C.neon }}>
              {r.markup_pct != null ? `+${r.markup_pct}%` : ''}
            </span>
            <span className="text-right" style={{ color: C.warn }}>
              {r.discount_pct != null ? `−${r.discount_pct}%` : ''}
            </span>
            <button onClick={() => qoidaniOchir(r)} style={{ color: `${sh(C.text, 53)}` }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Quti({ sarlavha, children }: { sarlavha: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }} className="p-3">
      <div className="mb-1 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${sh(C.text, 80)}` }}>
        {sarlavha}
      </div>
      {children}
    </div>
  );
}

function Xabar({ rang, children }: { rang: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 px-3 py-2 text-[11px]"
         style={{ color: rang, background: `${sh(rang, 7)}`, border: `1px solid ${sh(rang, 33)}` }}>
      {children}
    </div>
  );
}
