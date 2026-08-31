import { useCallback, useEffect, useRef, useState } from 'react';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';
import {
  MAYDON_NOMI,
  excelgaYoz,
  faylniOqi,
  qatorlarniYig,
  satrlarniOl,
  varaqlar,
  type Maydon,
  type Moslash,
  type Natija,
} from '../lib/faktura-robot';

// ============================================================================
// DORI MODULI — faktura roboti ekrani.
//
// Oqim: fayl tashlanadi -> robot ustunlarni o'zi topadi -> foydalanuvchi
// kerak bo'lsa tuzatadi -> tuzatish shablon sifatida eslab qolinadi ->
// qatorlar tekshiriladi va saqlanadi.
//
// Uslub super-admin panelining HUD ko'rinishida — bu o'sha panelning bo'limi.
// ============================================================================


const MAYDONLAR: Maydon[] = [
  'name', 'manufacturer', 'barcode', 'series', 'made_at', 'expiry', 'qty', 'unit', 'price', 'sum', 'stock', 'group', 'nds_rate', 'nds_sum',
];

type Farq = {
  jami: number;
  yangi: number;
  narx_ozgardi: number;
  ozgarmagan: number;
  royxatdan_chiqdi: number;
  narx_namuna: { name: string; eski_narx: number | null; yangi_narx: number | null }[];
  yangi_namuna: { name: string; price: number | null }[];
};

type Saqlangan = {
  id: string;
  created_at: string;
  file_name: string;
  supplier: string | null;
  invoice_no: string | null;
  rows_count: number;
  total_computed: number | null;
  total_declared: number | null;
  jami_mos_emas: boolean;
};

function son(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

export default function DoriModuli() {
  const [natija, setNatija] = useState<Natija | null>(null);
  const [bayt, setBayt] = useState<ArrayBuffer | null>(null);
  const [varaqRoyxat, setVaraqRoyxat] = useState<string[]>([]);
  const [varaq, setVaraq] = useState(0);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [saqlanganlar, setSaqlanganlar] = useState<Saqlangan[]>([]);
  const [supplier, setSupplier] = useState('');
  const [shablonTopildi, setShablonTopildi] = useState(false);
  const [farq, setFarq] = useState<Farq | null>(null);
  const [natijaXabar, setNatijaXabar] = useState<string | null>(null);
  // Prays QAYSI skladga yozilishi majburiy tanlov: skladsiz yuklash
  // "hammasi bitta omborda" degan eski xatoni qaytarardi
  const [skladlar, setSkladlar] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [sklad, setSklad] = useState<string>('');
  // Robot fayl turini xato tanishi mumkin (kirill sarlavhalar, notanish
  // ustunlar). Foydalanuvchi tiqilib qolmasin: turni QO'LDA almashtira
  // olsin. Jonli bazada aynan shu bo'ldi — 3132 qatorli prays "faktura"
  // deb saqlanib, katalogga umuman yetib bormadi.
  const [rejimQol, setRejimQol] = useState<'faktura' | 'narxlar' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const royxatYukla = useCallback(async () => {
    const { data } = await supabase.rpc('dori_invoice_list', { p_limit: 20 });
    setSaqlanganlar((data ?? []) as Saqlangan[]);
  }, []);

  useEffect(() => {
    royxatYukla();
  }, [royxatYukla]);

  async function faylniOl(file: File, sheetIndex = 0) {
    setXato(null);
    setIsh('Fayl o‘qilmoqda...');
    try {
      const buf = await file.arrayBuffer();
      const n = faylniOqi(buf, file.name, sheetIndex);

      if (n.sarlavhaQatori < 0) {
        setXato(
          'Sarlavha qatori topilmadi. Boshqa varaqni tanlab ko‘ring yoki ustun nomlari bor faylni tashlang.'
        );
        setBayt(buf);
        setVaraqRoyxat(varaqlar(buf));
        setNatija(n);
        return;
      }

      // Bu ko'rinishdagi fayl avval uchraganmi? Uchragan bo'lsa —
      // o'sha safargi moslashtirish qo'llanadi (robot o'rganadi)
      const { data: shablon } = await supabase
        .from('dori_templates')
        .select('mapping, supplier')
        .eq('signature', n.imzo)
        .maybeSingle();

      let yakuniy = n;
      if (shablon?.mapping) {
        const { satrlar } = satrlarniOl(buf, sheetIndex);
        const m = shablon.mapping as Moslash;
        const q = qatorlarniYig(satrlar, n.sarlavhaQatori, n.ustunlar, m);
        yakuniy = { ...n, moslash: m, ...q };
        setShablonTopildi(true);
      } else {
        setShablonTopildi(false);
      }

      setBayt(buf);
      setVaraqRoyxat(varaqlar(buf));
      setVaraq(sheetIndex);
      setNatija(yakuniy);
      setSupplier(shablon?.supplier ?? yakuniy.faktura.supplier ?? '');
    } catch (e: any) {
      setXato('Fayl o‘qilmadi: ' + (e?.message ?? ''));
    } finally {
      setIsh(null);
    }
  }

  // Foydalanuvchi ustunni qo'lda tanlaganda — qatorlar qayta yig'iladi
  function moslashniOzgartir(maydon: Maydon, indeks: number | null) {
    if (!natija || !bayt) return;
    const yangi: Moslash = { ...natija.moslash };
    if (indeks === null) delete yangi[maydon];
    else yangi[maydon] = indeks;

    const { satrlar } = satrlarniOl(bayt, varaq);
    const q = qatorlarniYig(satrlar, natija.sarlavhaQatori, natija.ustunlar, yangi);
    setNatija({ ...natija, moslash: yangi, ...q });
  }

  async function shablonniEslab() {
    if (!natija) return;
    const { error } = await supabase.rpc('dori_template_save', {
      p_signature: natija.imzo,
      p_mapping: natija.moslash,
      p_supplier: supplier || null,
    });
    if (error) setXato(error.message);
    else setShablonTopildi(true);
  }

  async function saqla() {
    if (!natija) return;
    setIsh('Saqlanmoqda...');
    try {
      const { error } = await supabase.rpc('dori_invoice_save', {
        p_invoice: {
          file_name: natija.fileName,
          supplier,
          invoice_no: natija.faktura.invoice_no ?? '',
          invoice_date: natija.faktura.invoice_date ?? '',
          total_declared: natija.jamiFayldan ?? '',
          total_computed: natija.jamiHisoblangan,
          meta: { sheet: natija.sheetName, imzo: natija.imzo },
        },
        p_items: natija.qatorlar,
      });
      if (error) throw error;
      await shablonniEslab();
      await royxatYukla();
      setNatija(null);
      setBayt(null);
    } catch (e: any) {
      setXato('Saqlanmadi: ' + (e?.message ?? ''));
    } finally {
      setIsh(null);
    }
  }

  // ---------- katalog (narxlar ro'yxati uchun) ----------
  // Avval FARQ ko'rsatiladi (bazaga hech narsa yozilmaydi), foydalanuvchi
  // ko'rib tasdiqlagach yoziladi. 9000+ qatorni bitta so'rovda yuborib
  // bo'lmaydi — vaqt chegarasiga uriladi, shuning uchun bo'laklab ketadi.
  const KATALOG_BOLAK = 500;

  function katalogQatorlari() {
    return (natija?.qatorlar ?? []).map((q) => ({
      barcode: q.barcode ?? '',
      name: q.name ?? '',
      manufacturer: q.manufacturer ?? '',
      group: q.group ?? '',
      unit: q.unit ?? '',
      price: q.price ?? '',
      stock: q.stock ?? '',
      series: q.series ?? '',
      expiry: q.expiry ?? '',
      made_at: q.made_at ?? '',
    }));
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('dori_skladlar');
      const r = (data ?? []) as { id: string; name: string; is_default: boolean }[];
      setSkladlar(r);
      setSklad((oldingi) => oldingi || r.find((x) => x.is_default)?.id || r[0]?.id || '');
    })();
  }, []);

  async function farqniKorsat() {
    setXato(null);
    setIsh('Farq hisoblanmoqda...');
    try {
      const { data, error } = await supabase.rpc('dori_catalog_diff', {
        p_items: katalogQatorlari(),
      });
      if (error) throw error;
      setFarq(data as Farq);
    } catch (e: any) {
      setXato('Farqni hisoblab bo‘lmadi: ' + (e?.message ?? ''));
    } finally {
      setIsh(null);
    }
  }

  async function kataloggaYukla() {
    if (!natija) return;
    const qatorlar = katalogQatorlari();
    const importId = `imp-${Date.now()}`;
    const bolaklar = Math.ceil(qatorlar.length / KATALOG_BOLAK);
    let yigma = { yangi: 0, narx_yangilandi: 0, partiya: 0, sotuvdan_olindi: 0, katalog_jami: 0 };

    setXato(null);
    try {
      for (let i = 0; i < bolaklar; i++) {
        setIsh(`Katalogga yozilmoqda... ${i + 1}/${bolaklar} bo‘lak`);
        const { data, error } = await supabase.rpc('dori_import_apply', {
          p_warehouse_id: sklad || null,
          p_items: qatorlar.slice(i * KATALOG_BOLAK, (i + 1) * KATALOG_BOLAK),
          p_source: natija.fileName,
          p_import_id: importId,
          p_finalize: i === bolaklar - 1,
          p_file_name: natija.fileName,
        });
        if (error) throw error;
        const d = data as any;
        yigma = {
          yangi: yigma.yangi + Number(d.yangi ?? 0),
          narx_yangilandi: yigma.narx_yangilandi + Number(d.narx_yangilandi ?? 0),
          partiya: yigma.partiya + Number(d.partiya ?? 0),
          sotuvdan_olindi: Number(d.sotuvdan_olindi ?? yigma.sotuvdan_olindi),
          katalog_jami: Number(d.katalog_jami ?? 0),
        };
      }
      const skladNomi = skladlar.find((x) => x.id === sklad)?.name ?? 'sklad';
      setNatijaXabar(
        `${skladNomi}: ${yigma.yangi} yangi dori, ${yigma.narx_yangilandi} narx o‘zgardi, ` +
          `${yigma.sotuvdan_olindi} eski pozitsiya o‘chirildi. Katalogda jami ${yigma.katalog_jami} dori.`
      );
      await shablonniEslab();
      setFarq(null);
      setNatija(null);
      setBayt(null);
    } catch (e: any) {
      setXato('Katalogga yozilmadi: ' + (e?.message ?? ''));
    } finally {
      setIsh(null);
    }
  }

  function yuklab() {
    if (!natija) return;
    const url = URL.createObjectURL(excelgaYoz(natija));
    const a = document.createElement('a');
    a.href = url;
    a.download = natija.fileName.replace(/\.[^.]+$/, '') + '-qatorlar.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  const ogohlantirishli = natija?.qatorlar.filter((q) => q.ogohlar.length > 0).length ?? 0;
  const jamiFarq =
    natija?.jamiFayldan != null ? Math.abs(natija.jamiFayldan - natija.jamiHisoblangan) : 0;

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';

  // Qo'lda tanlangani ustun, aks holda robot aytgani
  const rejim = rejimQol ?? natija?.rejim;

  return (
    <div style={{ fontFamily: MONO }}>
      {/* ---------- fayl tashlash ---------- */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) faylniOl(f);
        }}
        onClick={() => fileRef.current?.click()}
        className="mb-4 cursor-pointer p-8 text-center"
        style={{ background: C.panel, border: `1px dashed ${C.line}` }}
      >
        <div className="text-2xl" style={{ color: C.neon }}>⇩</div>
        <div className="mt-2 text-[13px] font-bold" style={{ color: C.textBright }}>
          Excel fakturani shu yerga tashlang
        </div>
        <div className="mt-1 text-[11px]" style={{ color: C.text }}>
          .xlsx · .xls · .csv — robot ustunlarni o‘zi topadi, tanimaganini yo‘qotmaydi
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) faylniOl(f);
            e.target.value = '';
          }}
        />
      </div>

      {ish && <Xabar rang={C.neon2}>{ish}</Xabar>}
      {xato && <Xabar rang={C.danger}>{xato}</Xabar>}

      {natija && natija.sarlavhaQatori >= 0 && (
        <>
          {/* ---------- xulosa ---------- */}
          <div className="mb-3 grid gap-3 md:grid-cols-4">
            <Quti sarlavha="QATORLAR">
              <span className="text-2xl font-extrabold" style={{ color: C.neon }}>
                {natija.qatorlar.length}
              </span>
            </Quti>
            <Quti sarlavha="ROBOT HISOBLAGAN JAMI">
              <span className="text-xl font-extrabold" style={{ color: C.textBright }}>
                {son(natija.jamiHisoblangan)}
              </span>
            </Quti>
            <Quti sarlavha="FAYL TURI">
              <div className="flex gap-1">
                {(['narxlar', 'faktura'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => { setRejimQol(k); setFarq(null); }}
                    className="px-2 py-1 text-[10px] font-bold tracking-[0.12em]"
                    style={{
                      color: rejim === k ? C.onAccent : C.text,
                      background: rejim === k ? C.neon2 : 'transparent',
                      border: `1px solid ${rejim === k ? C.neon2 : C.line}`,
                    }}
                  >
                    {k === 'narxlar' ? 'PRAYS' : 'FAKTURA'}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10px]" style={{ color: sh(C.text, 67) }}>
                {rejimQol ? 'qo‘lda tanlandi' : 'robot aniqladi'} · noto‘g‘ri bo‘lsa almashtiring
              </div>
            </Quti>
            <Quti sarlavha={rejim === 'narxlar' ? 'USTUNLAR' : 'FAYLDAGI JAMI'}>
              {rejim === 'narxlar' ? (
                <span className="text-[13px] font-extrabold" style={{ color: C.neon2 }}>
                  NARXLAR RO‘YXATI
                  <span className="ml-1 block text-[10px] font-normal" style={{ color: `${sh(C.text, 67)}` }}>
                    miqdor/summa ustuni yo‘q
                  </span>
                </span>
              ) : (
                <span
                  className="text-xl font-extrabold"
                  style={{ color: natija.jamiFayldan == null ? C.text : jamiFarq > 1 ? C.danger : C.neon }}
                >
                  {son(natija.jamiFayldan)}
                </span>
              )}
            </Quti>
            <Quti sarlavha="OGOHLANTIRISH">
              <span
                className="text-2xl font-extrabold"
                style={{ color: ogohlantirishli ? C.warn : C.neon }}
              >
                {ogohlantirishli}
              </span>
            </Quti>
          </div>

          {natija.jamiFayldan != null && jamiFarq > 1 && (
            <Xabar rang={C.danger}>
              Fayldagi jami bilan robot hisobi mos emas ({son(jamiFarq)} farq) — ustunlar
              to‘g‘ri tanlanganini tekshiring.
            </Xabar>
          )}
          {shablonTopildi && (
            <Xabar rang={C.neon}>
              Bu ko‘rinishdagi fayl avval uchragan — o‘sha safargi moslashtirish qo‘llandi.
            </Xabar>
          )}

          {/* ---------- moslashtirish ---------- */}
          <div className="mb-3 p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: `${sh(C.text, 80)}` }}>
                USTUNLAR MOSLASHTIRILISHI
              </span>
              {varaqRoyxat.length > 1 && (
                <select
                  value={varaq}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    const f = fileRef.current?.files?.[0];
                    if (bayt) {
                      const n = faylniOqi(bayt, natija.fileName, i);
                      setVaraq(i);
                      setNatija(n);
                    } else if (f) faylniOl(f, i);
                  }}
                  className="px-2 py-1 text-[11px] font-bold outline-none"
                  style={{ color: C.textBright, background: 'transparent', border: `1px solid ${C.line}` }}
                >
                  {varaqRoyxat.map((v, i) => (
                    <option key={v} value={i}>{v}</option>
                  ))}
                </select>
              )}
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="postavshchik nomi"
                className="px-2 py-1 text-[11px] outline-none"
                style={{ color: C.textBright, background: 'transparent', border: `1px solid ${C.line}` }}
              />
              <button
                onClick={shablonniEslab}
                className={btn}
                style={{ color: C.neon, border: `1px solid ${C.neon}`, background: 'transparent' }}
              >
                SHABLONNI ESLAB QOL
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {MAYDONLAR.map((m) => (
                <div key={m} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-[11px]" style={{ color: C.text }}>
                    {MAYDON_NOMI[m]}
                  </span>
                  <select
                    value={natija.moslash[m] ?? ''}
                    onChange={(e) =>
                      moslashniOzgartir(m, e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="min-w-0 flex-1 px-2 py-1 text-[11px] outline-none"
                    style={{
                      color: natija.moslash[m] === undefined ? `${sh(C.text, 53)}` : C.textBright,
                      background: 'transparent',
                      border: `1px solid ${sh(natija.moslash[m] === undefined ? C.line : C.neon, 33)}`,
                    }}
                  >
                    <option value="">— yo‘q —</option>
                    {natija.ustunlar.map((u) => (
                      <option key={u.indeks} value={u.indeks}>
                        {u.sarlavha}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* ---------- qatorlar ---------- */}
          <div className="mb-3 overflow-x-auto" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
            <table className="w-full text-[11px]" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ color: `${sh(C.text, 80)}`, borderBottom: `1px solid ${C.line}` }}>
                  {['№', 'Nomi', 'Seriya', 'Muddat', 'Miqdor', 'Narx', 'Summa', 'Qo‘shimcha', 'Holat'].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-bold tracking-[0.1em]">
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {natija.qatorlar.slice(0, 300).map((q, i) => (
                  <tr
                    key={q.line_no}
                    style={{
                      background: i % 2 ? C.zebra : 'transparent',
                      borderTop: `1px solid ${sh(C.line, 27)}`,
                    }}
                  >
                    <td className="px-2 py-1.5" style={{ color: `${sh(C.text, 60)}` }}>{q.line_no}</td>
                    <td className="px-2 py-1.5" style={{ color: C.textBright }}>{q.name ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{q.series ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: C.text }}>{q.expiry ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: C.text }}>{son(q.qty)}</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: C.text }}>{son(q.price)}</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: C.textBright }}>{son(q.sum)}</td>
                    <td className="px-2 py-1.5" style={{ color: `${sh(C.text, 53)}` }}>
                      {Object.keys(q.qoshimcha).length
                        ? `${Object.keys(q.qoshimcha).length} ta ustun`
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: q.ogohlar.length ? C.warn : C.neon }}>
                      {q.ogohlar.length ? q.ogohlar.join('; ') : 'ok'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {natija.qatorlar.length > 300 && (
              <div className="px-3 py-2 text-[11px]" style={{ color: C.text }}>
                {natija.qatorlar.length} qatordan birinchi 300 tasi ko‘rsatildi — saqlashda hammasi ketadi
              </div>
            )}
          </div>

          {/* ---------- katalog farqi ---------- */}
          {farq && (
            <div className="mb-3 p-4" style={{ background: C.panel, border: `1px solid ${sh(C.neon, 33)}` }}>
              <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: C.neon }}>
                KATALOG FARQI — HALI HECH NARSA YOZILMADI
              </div>
              <div className="grid gap-3 text-[12px] md:grid-cols-4">
                <Qator chap="Fayldagi dori" ong={String(farq.jami)} />
                <Qator chap="Yangi qo‘shiladi" ong={String(farq.yangi)} rang={C.neon} />
                <Qator chap="Narxi o‘zgaradi" ong={String(farq.narx_ozgardi)} rang={C.warn} />
                <Qator chap="Sotuvdan olinadi" ong={String(farq.royxatdan_chiqdi)} rang={C.danger} />
              </div>

              {farq.narx_namuna?.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[10px]" style={{ color: `${sh(C.text, 67)}` }}>
                    NARX O‘ZGARISHIGA MISOL
                  </div>
                  {farq.narx_namuna.slice(0, 5).map((n, i) => (
                    <div key={i} className="text-[11px]" style={{ color: C.text }}>
                      {n.name}: <span style={{ color: C.textBright }}>{son(n.eski_narx)}</span> →{' '}
                      <span style={{ color: C.warn }}>{son(n.yangi_narx)}</span>
                    </div>
                  ))}
                </div>
              )}

              {farq.royxatdan_chiqdi > 0 && (
                <div className="mt-3 text-[11px]" style={{ color: C.text }}>
                  Ro‘yxatdan chiqqan dori <b style={{ color: C.textBright }}>o‘chirilmaydi</b> —
                  «sotuvda yo‘q» bo‘ladi, eski buyurtmalari tarixda qoladi.
                </div>
              )}
            </div>
          )}

          {natijaXabar && <Xabar rang={C.neon}>{natijaXabar}</Xabar>}

          {rejim === 'narxlar' && (
            <div
              className="mb-3 flex flex-wrap items-center gap-3 p-3"
              style={{ background: C.panel, border: `1px solid ${sklad ? C.line : C.warn}` }}
            >
              <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
                QAYSI SKLADGA
              </span>
              <select
                value={sklad}
                onChange={(e) => setSklad(e.target.value)}
                className="px-2 py-1.5 text-[12px] outline-none"
                style={{ background: C.field, border: `1px solid ${C.line}`, color: C.textBright, fontFamily: MONO }}
              >
                {skladlar.length === 0 && <option value="">— sklad yo‘q —</option>}
                {skladlar.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <span className="text-[11px]" style={{ color: C.text }}>
                Shu skladning eski praysi <b style={{ color: C.warn }}>o‘chiriladi</b> va o‘rniga
                shu fayl yoziladi. Boshqa skladlarga tegilmaydi.
              </span>
            </div>
          )}

          <div className="mb-6 flex flex-wrap gap-2">
            {rejim === 'narxlar' ? (
              farq ? (
                <button
                  onClick={kataloggaYukla}
                  disabled={!!ish}
                  className={btn}
                  style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}
                >
                  TASDIQLAB KATALOGGA YOZISH
                </button>
              ) : (
                <button
                  onClick={farqniKorsat}
                  disabled={!!ish}
                  className={btn}
                  style={{ color: C.neon, background: 'transparent', border: `1px solid ${C.neon}` }}
                >
                  KATALOG FARQINI KO‘RSATISH
                </button>
              )
            ) : null}
            <button
              onClick={saqla}
              disabled={!!ish}
              className={btn}
              style={
                rejim === 'narxlar'
                  ? { color: C.text, background: 'transparent', border: `1px solid ${C.line}` }
                  : { color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }
              }
            >
              {rejim === 'narxlar' ? 'FAKTURA SIFATIDA SAQLASH' : 'BAZAGA SAQLASH'}
            </button>
            <button
              onClick={yuklab}
              className={btn}
              style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}
            >
              EXCEL QILIB YUKLAB OLISH
            </button>
            <button
              onClick={() => {
                setNatija(null);
                setBayt(null);
                setRejimQol(null);
              }}
              className={btn}
              style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}
            >
              BEKOR QILISH
            </button>
          </div>
        </>
      )}

      {/* ---------- saqlangan fakturalar ---------- */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="px-4 py-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: `${sh(C.text, 80)}`, borderBottom: `1px solid ${C.line}` }}>
          SAQLANGAN FAKTURALAR — {saqlanganlar.length}
        </div>
        {saqlanganlar.length === 0 && (
          <div className="p-8 text-center text-[11px]" style={{ color: C.text }}>
            hali saqlangan faktura yo‘q
          </div>
        )}
        {saqlanganlar.map((s, i) => (
          <div
            key={s.id}
            className="grid gap-3 px-4 py-2 text-[11px]"
            style={{
              gridTemplateColumns: '110px 1fr 100px 110px 90px',
              borderTop: i ? `1px solid ${sh(C.line, 27)}` : 'none',
            }}
          >
            <span style={{ color: `${sh(C.text, 80)}` }}>
              {new Date(s.created_at).toLocaleDateString('ru-RU')}
            </span>
            <span className="truncate" style={{ color: C.textBright }}>
              {s.file_name}
              {s.supplier ? <span style={{ color: `${sh(C.text, 60)}` }}> · {s.supplier}</span> : null}
            </span>
            <span style={{ color: C.text }}>{s.rows_count} qator</span>
            <span className="text-right" style={{ color: C.textBright }}>{son(s.total_computed)}</span>
            <span style={{ color: s.jami_mos_emas ? C.danger : C.neon }}>
              {s.jami_mos_emas ? 'jami ≠' : 'ok'}
            </span>
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

function Qator({ chap, ong, rang }: { chap: string; ong: string; rang?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span style={{ color: C.text }}>{chap}</span>
      <span className="text-base font-extrabold" style={{ color: rang ?? C.textBright }}>{ong}</span>
    </div>
  );
}

function Xabar({ rang, children }: { rang: string; children: React.ReactNode }) {
  return (
    <div
      className="mb-3 px-3 py-2 text-[11px]"
      style={{ color: rang, background: `${sh(rang, 7)}`, border: `1px solid ${sh(rang, 33)}` }}
    >
      {children}
    </div>
  );
}
