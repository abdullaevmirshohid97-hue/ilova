import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fnXato, formatSum, supabase } from '../lib/supabase';
import {
  altbilgi,
  blank,
  chekBoshi,
  chekOxiri,
  chekQator,
  chekUslubi,
  hujjatniYoz,
  imzo,
  logoniOl,
  oynaOch,
  sozlamaniOl,
  uslub,
} from '../lib/hujjat';

// ============================================================================
// POS SOTUV — kassa ekrani
//
// Ombordagi tovarni mijozga sotadi. Narx MIJOZNING TARIFIDAN olinadi:
// mijoz tanlanmaguncha narxlar ko'rinmaydi, chunki bir tovarning narxi
// tarifga qarab har xil.
//
// Sotuv bazada bitta amalda bajariladi (pos_sotuv_yarat): qoldiq
// tekshiriladi, kamaytiriladi va ombor jurnaliga yozuv tushadi. Panelda
// qilinsa, ikki kassir bir vaqtda oxirgi dona tovarni sotib yuborishi
// mumkin edi.
// ============================================================================

type Tovar = {
  variant_id: string;
  product_id: string;
  nom: string;
  sku: string;
  razmer: string | null;
  rang: string | null;
  narx: number | null;
  qoldiq: number;
};

type Savat = Tovar & { miqdor: number };
type Mijoz = { id: string; name: string; phone: string | null; price_group_id: string | null };
type Xodim = { id: string; ism: string; lavozim: string | null };

const TOLOVLAR = [
  { k: 'naqd', n: 'Naqd' },
  { k: 'karta', n: 'Karta' },
  { k: 'otkazma', n: "O'tkazma" },
  { k: 'qarz', n: 'Qarz' },
];

export default function PosSotuv() {
  const [mijozlar, setMijozlar] = useState<Mijoz[]>([]);
  const [xodimlar, setXodimlar] = useState<Xodim[]>([]);
  const [mijoz, setMijoz] = useState<Mijoz | null>(null);
  const [xodim, setXodim] = useState<string>('');
  const [tolov, setTolov] = useState('naqd');
  const [chegirma, setChegirma] = useState('');
  const [izoh, setIzoh] = useState('');

  const [qidiruv, setQidiruv] = useState('');
  const [tovarlar, setTovarlar] = useState<Tovar[]>([]);
  const [qidirmoqda, setQidirmoqda] = useState(false);
  const [savat, setSavat] = useState<Savat[]>([]);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [oxirgi, setOxirgi] = useState<string | null>(null);

  const qidiruvRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    supabase
      .from('customers_masked')
      .select('id, name, phone, price_group_id')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setMijozlar((data as Mijoz[]) ?? []));
    supabase.rpc('xodimlar_royxat', { p_faol: true }).then(({ data }) => {
      setXodimlar(((data as any[]) ?? []).map((x) => ({ id: x.id, ism: x.ism, lavozim: x.lavozim })));
    });
  }, []);

  // Tovar qidiruvi. Har bosilgan harfda so'rov yubormaymiz — 300ms kutamiz.
  const qidir = useCallback(
    (q: string, guruh: string | null) => {
      window.clearTimeout(qidiruvRef.current);
      qidiruvRef.current = window.setTimeout(async () => {
        setQidirmoqda(true);
        const { data } = await supabase.rpc('pos_tovarlar', {
          p_q: q || null,
          p_price_group: guruh,
          p_limit: 40,
        });
        setTovarlar((data as Tovar[]) ?? []);
        setQidirmoqda(false);
      }, 300);
    },
    [],
  );

  useEffect(() => {
    if (!mijoz) {
      setTovarlar([]);
      return;
    }
    qidir(qidiruv, mijoz.price_group_id);
  }, [qidiruv, mijoz, qidir]);

  const jami = useMemo(() => savat.reduce((s, x) => s + (x.narx ?? 0) * x.miqdor, 0), [savat]);
  const cheg = Math.max(0, Number(chegirma) || 0);
  const tolanadi = Math.max(0, jami - cheg);

  function qoshish(t: Tovar) {
    setXato(null);
    setSavat((s) => {
      const bor = s.find((x) => x.variant_id === t.variant_id);
      if (bor) {
        if (bor.miqdor >= t.qoldiq) return s; // qoldiqdan ortiq qo'shilmasin
        return s.map((x) => (x.variant_id === t.variant_id ? { ...x, miqdor: x.miqdor + 1 } : x));
      }
      if (t.qoldiq < 1) return s;
      return [...s, { ...t, miqdor: 1 }];
    });
  }

  function miqdorQoy(id: string, n: number) {
    setSavat((s) =>
      s.map((x) => (x.variant_id === id ? { ...x, miqdor: Math.max(1, Math.min(n, x.qoldiq)) } : x)),
    );
  }

  async function sotish() {
    setXato(null);
    if (!savat.length) return setXato('Savat bo‘sh');
    if (savat.some((x) => x.narx == null)) {
      return setXato('Ba’zi tovarlarda bu tarif uchun narx yo‘q — tarifni to‘ldiring');
    }
    setSaqlanmoqda(true);
    try {
      const { data, error } = await supabase.rpc('pos_sotuv_yarat', {
        p_customer: mijoz?.id ?? null,
        p_xodim: xodim || null,
        p_qatorlar: savat.map((x) => ({
          variant_id: x.variant_id,
          miqdor: x.miqdor,
          narx: x.narx,
        })),
        p_tolov: tolov,
        p_chegirma: cheg,
        p_izoh: izoh.trim() || null,
      });
      if (error) throw new Error(error.message);
      setOxirgi(data as string);
      setSavat([]);
      setChegirma('');
      setIzoh('');
      // Qoldiq o'zgardi — ro'yxatni yangilaymiz
      qidir(qidiruv, mijoz?.price_group_id ?? null);
    } catch (e: any) {
      setXato(tushunarli(e.message ?? 'Xatolik'));
    } finally {
      setSaqlanmoqda(false);
    }
  }

  // Bazadan kelgan texnik kodlarni odam tiliga o'giramiz
  function tushunarli(m: string): string {
    if (m.includes('QOLDIQ_YETARLI_EMAS')) {
      const n = m.match(/(\d+) dona bor/)?.[1];
      return `Omborda yetarli emas${n ? ` — ${n} dona qolgan` : ''}. Miqdorni kamaytiring.`;
    }
    if (m.includes('MIJOZ_TOPILMADI')) return 'Mijoz topilmadi';
    if (m.includes('XODIM_TOPILMADI')) return 'Xodim topilmadi';
    if (m.includes('BOSH_SOTUV')) return 'Savat bo‘sh';
    if (m.includes('RUXSAT_YOQ')) return 'Ruxsat yo‘q';
    return m;
  }

  // ---------------- Chop etish ----------------
  async function chopEt(sotuvId: string, chek: boolean) {
    const w = oynaOch();
    if (!w) return;
    const { data } = await supabase.rpc('pos_sotuv', { p_id: sotuvId });
    const d = data as any;
    if (!d) return;
    const s = await sozlamaniOl();
    const q: any[] = d.qatorlar ?? [];

    if (chek) {
      const tana = `
        <div class="noprint"><button onclick="window.print()">Chop etish</button></div>
        ${chekBoshi(s, 'Sotuv cheki', d.sotuv.raqam)}
        ${d.mijoz ? chekQator('Mijoz', d.mijoz) : ''}
        ${d.xodim ? chekQator('Sotuvchi', d.xodim) : ''}
        <div class="chiziq"></div>
        ${q
          .map(
            (r) =>
              `<div>${r.nom}</div>` +
              chekQator(`  ${r.miqdor} x ${formatSum(r.narx)}`, formatSum(r.summa)),
          )
          .join('')}
        <div class="chiziq"></div>
        ${Number(d.sotuv.chegirma) > 0 ? chekQator('Chegirma', '-' + formatSum(d.sotuv.chegirma)) : ''}
        ${chekQator('JAMI', formatSum(d.sotuv.jami), true)}
        ${chekQator('To‘lov', TOLOVLAR.find((t) => t.k === d.sotuv.tolov)?.n ?? d.sotuv.tolov)}
        ${chekOxiri(s)}
      `;
      hujjatniYoz(w, { nom: `Chek №${d.sotuv.raqam}`, uslub: chekUslubi(s), tana });
      return;
    }

    const logo = await logoniOl(s);
    const tana = `
      ${blank(s, null, logo, {
        turi: 'Sotuv',
        raqam: d.sotuv.raqam,
        sana: new Date(d.sotuv.created_at).toLocaleDateString(),
      })}
      <div class="meta">
        ${d.mijoz ? `<div><span class="yorliq">Mijoz</span><br><b>${d.mijoz}</b></div>` : ''}
        ${d.telefon ? `<div><span class="yorliq">Telefon</span><br><b>${d.telefon}</b></div>` : ''}
        ${d.xodim ? `<div><span class="yorliq">Sotuvchi</span><br><b>${d.xodim}</b></div>` : ''}
        <div><span class="yorliq">To‘lov</span><br><b>${TOLOVLAR.find((t) => t.k === d.sotuv.tolov)?.n ?? d.sotuv.tolov}</b></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:26px">№</th><th>Mahsulot</th>
          ${s.ustun_sku !== false ? '<th>SKU</th>' : ''}
          ${s.ustun_razmer !== false ? '<th>Razmer / Rang</th>' : ''}
          <th class="num">Miqdor</th><th class="num">Narx</th><th class="num">Summa</th>
        </tr></thead>
        <tbody>
          ${q
            .map(
              (r, i) => `<tr>
                <td>${i + 1}</td><td><b>${r.nom}</b></td>
                ${s.ustun_sku !== false ? `<td>${r.sku ?? ''}</td>` : ''}
                ${s.ustun_razmer !== false ? `<td>${[r.razmer, r.rang].filter(Boolean).join(' / ')}</td>` : ''}
                <td class="num">${r.miqdor}</td>
                <td class="num">${formatSum(r.narx)}</td>
                <td class="num">${formatSum(r.summa)}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="${4 + (s.ustun_sku !== false ? 1 : 0) + (s.ustun_razmer !== false ? 1 : 0)}" class="num">JAMI</td>
          <td class="num">${formatSum(d.sotuv.jami)}</td>
        </tr></tfoot>
      </table>
      ${imzo(s)}
      ${altbilgi(s)}
    `;
    hujjatniYoz(w, { nom: `Sotuv №${d.sotuv.raqam}`, uslub: uslub(s), tana });
  }

  // ---------------- Ko'rinish ----------------
  const inp = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand';

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      {/* Chap: tovar tanlash */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Mijoz *</span>
              <select
                className={inp + ' mt-1'}
                value={mijoz?.id ?? ''}
                onChange={(e) => setMijoz(mijozlar.find((m) => m.id === e.target.value) ?? null)}
              >
                <option value="">— mijozni tanlang —</option>
                {mijozlar.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.phone ? `· ${m.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Sotuvchi (KPI shunga yoziladi)</span>
              <select className={inp + ' mt-1'} value={xodim} onChange={(e) => setXodim(e.target.value)}>
                <option value="">— tanlanmagan —</option>
                {xodimlar.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.ism} {x.lavozim ? `· ${x.lavozim}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!mijoz && (
            <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-xs text-brand">
              Narxlar mijozning tarifiga bog‘liq — avval mijozni tanlang.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <input
            className={inp}
            placeholder="Mahsulot nomi, SKU yoki shtrix-kod"
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            disabled={!mijoz}
          />

          <div className="mt-3 max-h-[420px] overflow-y-auto">
            {qidirmoqda && <div className="py-6 text-center text-sm text-gray-500">Qidirilmoqda…</div>}
            {!qidirmoqda && mijoz && tovarlar.length === 0 && (
              <div className="py-6 text-center text-sm text-gray-500">Tovar topilmadi</div>
            )}
            <div className="divide-y divide-gray-100">
              {tovarlar.map((t) => {
                const yoq = t.qoldiq < 1;
                const narxsiz = t.narx == null;
                return (
                  <button
                    key={t.variant_id}
                    onClick={() => qoshish(t)}
                    disabled={yoq || narxsiz}
                    className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-45"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-gray-900">{t.nom}</div>
                      <div className="text-xs text-gray-500">
                        {t.sku}
                        {[t.razmer, t.rang].filter(Boolean).length
                          ? ' · ' + [t.razmer, t.rang].filter(Boolean).join(' / ')
                          : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">
                        {narxsiz ? <span className="text-red-500">narx yo‘q</span> : formatSum(t.narx!)}
                      </div>
                      <div className={`text-xs ${yoq ? 'text-red-500' : 'text-gray-500'}`}>
                        {yoq ? 'qolmadi' : `${t.qoldiq} dona`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* O'ng: savat */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-bold text-gray-900">Savat</h2>

          {savat.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Tovar tanlang</p>
          ) : (
            <div className="mt-3 space-y-3">
              {savat.map((x) => (
                <div key={x.variant_id} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-900">{x.nom}</div>
                    <div className="text-xs text-gray-500">
                      {formatSum(x.narx ?? 0)} × {x.miqdor} = <b>{formatSum((x.narx ?? 0) * x.miqdor)}</b>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={x.qoldiq}
                    value={x.miqdor}
                    onChange={(e) => miqdorQoy(x.variant_id, Number(e.target.value))}
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-center text-sm"
                  />
                  <button
                    onClick={() => setSavat((s) => s.filter((y) => y.variant_id !== x.variant_id))}
                    className="rounded-lg px-2 py-1.5 text-sm text-red-500 hover:bg-red-50"
                    title="O‘chirish"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Chegirma</span>
              <input
                className={inp + ' mt-1'}
                inputMode="numeric"
                value={chegirma}
                onChange={(e) => setChegirma(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">To‘lov turi</span>
              <select className={inp + ' mt-1'} value={tolov} onChange={(e) => setTolov(e.target.value)}>
                {TOLOVLAR.map((t) => (
                  <option key={t.k} value={t.k}>
                    {t.n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Izoh</span>
              <input className={inp + ' mt-1'} value={izoh} onChange={(e) => setIzoh(e.target.value)} />
            </label>
          </div>

          <div className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tovarlar</span>
              <span>{formatSum(jami)}</span>
            </div>
            {cheg > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Chegirma</span>
                <span>−{formatSum(cheg)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-extrabold text-gray-900">
              <span>Jami</span>
              <span>{formatSum(tolanadi)}</span>
            </div>
          </div>

          {xato && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{xato}</p>
          )}

          <button
            onClick={sotish}
            disabled={saqlanmoqda || savat.length === 0}
            className="mt-4 w-full rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {saqlanmoqda ? 'Saqlanmoqda…' : 'SOTUV'}
          </button>
        </div>

        {oxirgi && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
            <div className="font-bold text-green-800">Sotuv bajarildi</div>
            <p className="mt-1 text-sm text-green-700">Ombordan tovar kamaytirildi.</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => chopEt(oxirgi, true)}
                className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-gray-900 ring-1 ring-gray-200"
              >
                🧾 Chek 58mm
              </button>
              <button
                onClick={() => chopEt(oxirgi, false)}
                className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-gray-900 ring-1 ring-gray-200"
              >
                📄 A4
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
