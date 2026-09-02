import { useCallback, useEffect, useState } from 'react';
import { formatSum, supabase } from '../lib/supabase';
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
// MAOSH MODULI
//
// Ikki ekran: xodimlar ro'yxati va bitta xodimning davriy hisoboti.
//
// PUL HISOBI QOIDASI (bazadagi bilan bir xil, lib/hujjat emas —
// maosh_amallari jadvalining izohiga qarang):
//   bonus, kpi   -> xodimga qo'shiladi  (qarz ortadi)
//   maosh, avans -> xodimga to'lanadi   (qarz kamayadi)
//   jarima       -> ushlab qolinadi     (qarz kamayadi)
//
// Qoldiq musbat bo'lsa - xodimga qarzdormiz, manfiy bo'lsa - u oldindan
// ko'proq olgan.
// ============================================================================

type Xodim = {
  id: string;
  ism: string;
  lavozim: string | null;
  telefon: string | null;
  oylik_stavka: number;
  kpi_reja: number;
  faol: boolean;
  ishga_kirgan: string | null;
  hisoblangan: number;
  tolangan: number;
  jarima: number;
  qoldiq: number;
  oxirgi_amal: string | null;
};

const TURLAR = [
  { k: 'maosh', n: 'Maosh', ishora: -1, rang: 'text-blue-600' },
  { k: 'avans', n: 'Avans', ishora: -1, rang: 'text-amber-600' },
  { k: 'bonus', n: 'Bonus', ishora: +1, rang: 'text-green-600' },
  { k: 'jarima', n: 'Jarima', ishora: -1, rang: 'text-red-600' },
  { k: 'kpi', n: 'KPI', ishora: +1, rang: 'text-green-700' },
];

const turNomi = (k: string) => TURLAR.find((t) => t.k === k)?.n ?? k;

/** Oyning birinchi va oxirgi kuni — hisobot standart davri */
function shuOy(): { bosh: string; oxir: string } {
  const d = new Date();
  const bosh = new Date(d.getFullYear(), d.getMonth(), 1);
  const oxir = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const f = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { bosh: f(bosh), oxir: f(oxir) };
}

export default function Maosh() {
  const [xodimlar, setXodimlar] = useState<Xodim[]>([]);
  const [tanlangan, setTanlangan] = useState<Xodim | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    const { data } = await supabase.rpc('xodimlar_royxat', { p_faol: null });
    setXodimlar((data as Xodim[]) ?? []);
    setYuklanmoqda(false);
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  if (tanlangan) {
    return (
      <XodimHisoboti
        xodim={tanlangan}
        onOrqaga={() => {
          setTanlangan(null);
          yukla();
        }}
      />
    );
  }

  const jamiQarz = xodimlar.reduce((s, x) => s + Number(x.qoldiq), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kartochka yorliq="Xodimlar" qiymat={String(xodimlar.filter((x) => x.faol).length)} />
        <Kartochka
          yorliq="Jami qoldiq"
          qiymat={formatSum(jamiQarz)}
          izoh={jamiQarz > 0 ? 'xodimlarga qarzdormiz' : 'oldindan berilgan'}
        />
        <Kartochka
          yorliq="Oylik stavkalar"
          qiymat={formatSum(xodimlar.filter((x) => x.faol).reduce((s, x) => s + Number(x.oylik_stavka), 0))}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-bold text-gray-900">Xodimlar</h2>
          <p className="text-sm text-gray-500">
            Xodim ustiga bosing — davriy hisobot va to‘lov amallari ochiladi.
          </p>
        </div>

        {yuklanmoqda ? (
          <div className="p-10 text-center text-gray-500">Yuklanmoqda…</div>
        ) : xodimlar.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-3xl">👥</div>
            <div className="mt-2 font-bold text-gray-900">Xodim qo‘shilmagan</div>
            <div className="mt-1 text-sm text-gray-500">
              Sozlamalar → Xodimlar bo‘limidan qo‘shing.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Xodim</th>
                  <th className="px-5 py-3">Lavozim</th>
                  <th className="px-5 py-3 text-right">Stavka</th>
                  <th className="px-5 py-3 text-right">Hisoblangan</th>
                  <th className="px-5 py-3 text-right">To‘langan</th>
                  <th className="px-5 py-3 text-right">Jarima</th>
                  <th className="px-5 py-3 text-right">Qoldiq</th>
                </tr>
              </thead>
              <tbody>
                {xodimlar.map((x) => (
                  <tr
                    key={x.id}
                    onClick={() => setTanlangan(x)}
                    className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                  >
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-900">{x.ism}</div>
                      {!x.faol && <span className="text-xs text-gray-500">ishdan bo‘shagan</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{x.lavozim ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                      {formatSum(x.oylik_stavka)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700">
                      {formatSum(x.hisoblangan)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-blue-600">
                      {formatSum(x.tolangan)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-600">
                      {Number(x.jarima) ? formatSum(x.jarima) : '—'}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-bold tabular-nums ${
                        Number(x.qoldiq) > 0 ? 'text-gray-900' : 'text-gray-500'
                      }`}
                    >
                      {formatSum(x.qoldiq)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kartochka({ yorliq, qiymat, izoh }: { yorliq: string; qiymat: string; izoh?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{yorliq}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums text-gray-900">{qiymat}</div>
      {izoh && <div className="mt-0.5 text-xs text-gray-500">{izoh}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- hisobot

function XodimHisoboti({ xodim, onOrqaga }: { xodim: Xodim; onOrqaga: () => void }) {
  const oy = shuOy();
  const [bosh, setBosh] = useState(oy.bosh);
  const [oxir, setOxir] = useState(oy.oxir);
  const [hisobot, setHisobot] = useState<any>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [amal, setAmal] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    const { data } = await supabase.rpc('xodim_hisobot', {
      p_xodim: xodim.id,
      p_bosh: bosh,
      p_oxir: oxir,
    });
    setHisobot(data);
    setYuklanmoqda(false);
  }, [xodim.id, bosh, oxir]);

  useEffect(() => {
    yukla();
  }, [yukla]);

  const jami = hisobot?.jami ?? {};
  const kpi = hisobot?.kpi ?? {};
  const amallar: any[] = hisobot?.amallar ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onOrqaga}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
        >
          ← Xodimlar
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{xodim.ism}</h1>
          <div className="text-sm text-gray-500">
            {xodim.lavozim ?? '—'}
            {xodim.telefon ? ` · ${xodim.telefon}` : ''}
          </div>
        </div>
      </div>

      {/* Davr */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-5">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Davr boshi</span>
          <input
            type="date"
            value={bosh}
            onChange={(e) => setBosh(e.target.value)}
            className="mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Davr oxiri</span>
          <input
            type="date"
            value={oxir}
            onChange={(e) => setOxir(e.target.value)}
            className="mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => {
            const o = shuOy();
            setBosh(o.bosh);
            setOxir(o.oxir);
          }}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Shu oy
        </button>
      </div>

      {/* KPI */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-bold text-gray-900">KPI — oylik reja bo‘yicha</h2>
        {yuklanmoqda ? (
          <div className="py-6 text-center text-gray-500">Hisoblanmoqda…</div>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <Kichik yorliq="Davrdagi sotuv" qiymat={formatSum(kpi.sotuv_summa ?? 0)} />
            <Kichik yorliq="Reja" qiymat={kpi.reja ? formatSum(kpi.reja) : 'qo‘yilmagan'} />
            <Kichik
              yorliq="Bajarilish"
              qiymat={kpi.bajarilish != null ? `${kpi.bajarilish}%` : '—'}
              izoh={`stavka ${kpi.stavka ?? 0}%`}
            />
            <Kichik yorliq="KPI" qiymat={formatSum(kpi.kpi ?? 0)} kuchli />
          </div>
        )}
        {!yuklanmoqda && Number(kpi.kpi) > 0 && (
          <button
            onClick={() => setAmal('kpi:' + Math.round(Number(kpi.kpi)))}
            className="mt-4 rounded-xl bg-brand-soft px-4 py-2 text-sm font-bold text-brand"
          >
            KPI ni hisobga qo‘shish ({formatSum(kpi.kpi)})
          </button>
        )}
      </div>

      {/* Amallar */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-bold text-gray-900">To‘lov va ushlash</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TURLAR.filter((t) => t.k !== 'kpi').map((t) => (
            <button
              key={t.k}
              onClick={() => setAmal(t.k)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-800 hover:border-brand hover:text-brand"
            >
              {t.n}
            </button>
          ))}
        </div>
      </div>

      {/* Davriy jamlanma */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {TURLAR.map((t) => (
          <Kichik key={t.k} yorliq={t.n} qiymat={formatSum(jami[t.k] ?? 0)} />
        ))}
        <Kichik
          yorliq="Umumiy qoldiq"
          qiymat={formatSum(hisobot?.umumiy_qoldiq ?? 0)}
          izoh="boshidan beri"
          kuchli
        />
      </div>

      {/* Harakatlar tarixi */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-bold text-gray-900">Davr harakatlari</h2>
          <button
            onClick={() => hisobotChop(xodim, hisobot, bosh, oxir)}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
            disabled={!hisobot}
          >
            📄 Hisobotni chop etish
          </button>
        </div>
        {amallar.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Bu davrda harakat yo‘q</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Sana</th>
                  <th className="px-5 py-3">Turi</th>
                  <th className="px-5 py-3">Izoh</th>
                  <th className="px-5 py-3 text-right">Summa</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {amallar.map((a) => {
                  const t = TURLAR.find((x) => x.k === a.tur);
                  return (
                    <tr key={a.id} className="border-b border-gray-50">
                      <td className="px-5 py-3 text-gray-600">
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                      <td className={`px-5 py-3 font-semibold ${t?.rang ?? ''}`}>{turNomi(a.tur)}</td>
                      <td className="px-5 py-3 text-gray-600">{a.izoh ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums">
                        {(t?.ishora ?? 1) > 0 ? '+' : '−'}
                        {formatSum(a.summa)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => amalChop(xodim, a, true)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                        >
                          Chek
                        </button>
                        <button
                          onClick={() => amalChop(xodim, a, false)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                        >
                          A4
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {amal && (
        <AmalOynasi
          xodim={xodim}
          tur={amal.split(':')[0]}
          boshSumma={amal.includes(':') ? amal.split(':')[1] : ''}
          onYopish={() => setAmal(null)}
          onBajarildi={() => {
            setAmal(null);
            yukla();
          }}
        />
      )}
    </div>
  );
}

function Kichik({
  yorliq,
  qiymat,
  izoh,
  kuchli,
}: {
  yorliq: string;
  qiymat: string;
  izoh?: string;
  kuchli?: boolean;
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{yorliq}</div>
      <div
        className={`mt-0.5 tabular-nums ${kuchli ? 'text-lg font-extrabold text-gray-900' : 'font-bold text-gray-800'}`}
      >
        {qiymat}
      </div>
      {izoh && <div className="text-xs text-gray-500">{izoh}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- amal oynasi

function AmalOynasi({
  xodim,
  tur,
  boshSumma,
  onYopish,
  onBajarildi,
}: {
  xodim: Xodim;
  tur: string;
  boshSumma: string;
  onYopish: () => void;
  onBajarildi: () => void;
}) {
  const [summa, setSumma] = useState(boshSumma);
  const [izoh, setIzoh] = useState('');
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [tayyor, setTayyor] = useState<any>(null);

  async function saqla() {
    setXato(null);
    const n = Number(summa);
    if (!n || n <= 0) return setXato('Summani kiriting');
    setSaqlanmoqda(true);
    try {
      const { data, error } = await supabase.rpc('maosh_amal', {
        p_xodim: xodim.id,
        p_tur: tur,
        p_summa: n,
        p_izoh: izoh.trim() || null,
      });
      if (error) throw new Error(error.message);
      setTayyor({ id: data, tur, summa: n, izoh: izoh.trim() || null, created_at: new Date().toISOString() });
    } catch (e: any) {
      setXato(e.message ?? 'Xatolik');
    } finally {
      setSaqlanmoqda(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        {tayyor ? (
          <>
            <div className="text-center">
              <div className="text-3xl">✓</div>
              <div className="mt-2 font-bold text-gray-900">
                {turNomi(tur)} yozildi — {formatSum(tayyor.summa)}
              </div>
              <div className="text-sm text-gray-500">{xodim.ism}</div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => amalChop(xodim, tayyor, true)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-800"
              >
                🧾 Chek 58mm
              </button>
              <button
                onClick={() => amalChop(xodim, tayyor, false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-800"
              >
                📄 A4
              </button>
            </div>
            <button
              onClick={onBajarildi}
              className="mt-3 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white"
            >
              Yopish
            </button>
          </>
        ) : (
          <>
            <h3 className="font-bold text-gray-900">
              {turNomi(tur)} — {xodim.ism}
            </h3>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-gray-600">Summa *</span>
              <input
                autoFocus
                inputMode="numeric"
                value={summa}
                onChange={(e) => setSumma(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-lg font-bold outline-none focus:border-brand"
                placeholder="0"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-semibold text-gray-600">Izoh</span>
              <input
                value={izoh}
                onChange={(e) => setIzoh(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
            </label>
            {xato && <p className="mt-3 text-sm font-semibold text-red-600">{xato}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={onYopish}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700"
              >
                Bekor
              </button>
              <button
                onClick={saqla}
                disabled={saqlanmoqda}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {saqlanmoqda ? '…' : 'Saqlash'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- chop etish

async function amalChop(xodim: Xodim, a: any, chek: boolean) {
  const w = oynaOch();
  if (!w) return;
  const s = await sozlamaniOl();
  const sana = new Date(a.created_at).toLocaleDateString();

  if (chek) {
    const tana = `
      <div class="noprint"><button onclick="window.print()">Chop etish</button></div>
      ${chekBoshi(s, turNomi(a.tur))}
      ${chekQator('Xodim', xodim.ism)}
      ${xodim.lavozim ? chekQator('Lavozim', xodim.lavozim) : ''}
      ${chekQator('Sana', sana)}
      <div class="chiziq"></div>
      ${chekQator('SUMMA', formatSum(a.summa), true)}
      ${a.izoh ? `<div class="kichik">${a.izoh}</div>` : ''}
      <div class="imzo">Berdi: ____________<br><br>Oldi: ____________</div>
      ${chekOxiri(s)}
    `;
    hujjatniYoz(w, { nom: turNomi(a.tur), uslub: chekUslubi(s), tana });
    return;
  }

  const logo = await logoniOl(s);
  const tana = `
    ${blank(s, null, logo, { turi: turNomi(a.tur), sana })}
    <div class="meta">
      <div><span class="yorliq">Xodim</span><br><b>${xodim.ism}</b></div>
      ${xodim.lavozim ? `<div><span class="yorliq">Lavozim</span><br><b>${xodim.lavozim}</b></div>` : ''}
      <div><span class="yorliq">Turi</span><br><b>${turNomi(a.tur)}</b></div>
    </div>
    <table>
      <thead><tr><th>Tavsif</th><th class="num">Summa</th></tr></thead>
      <tbody>
        <tr><td>${a.izoh ?? turNomi(a.tur)}</td><td class="num">${formatSum(a.summa)}</td></tr>
      </tbody>
      <tfoot><tr><td class="num">JAMI</td><td class="num">${formatSum(a.summa)}</td></tr></tfoot>
    </table>
    ${imzo(s)}
    ${altbilgi(s)}
  `;
  hujjatniYoz(w, { nom: turNomi(a.tur), uslub: uslub(s), tana });
}

async function hisobotChop(xodim: Xodim, hisobot: any, bosh: string, oxir: string) {
  const w = oynaOch();
  if (!w) return;
  const s = await sozlamaniOl();
  const logo = await logoniOl(s);
  const amallar: any[] = hisobot?.amallar ?? [];
  const kpi = hisobot?.kpi ?? {};

  const tana = `
    ${blank(s, null, logo, { turi: 'Maosh hisoboti', sana: `${bosh} — ${oxir}` })}
    <div class="meta">
      <div><span class="yorliq">Xodim</span><br><b>${xodim.ism}</b></div>
      ${xodim.lavozim ? `<div><span class="yorliq">Lavozim</span><br><b>${xodim.lavozim}</b></div>` : ''}
      <div><span class="yorliq">Oylik stavka</span><br><b>${formatSum(xodim.oylik_stavka)}</b></div>
    </div>

    <table>
      <thead><tr><th>Ko‘rsatkich</th><th class="num">Qiymat</th></tr></thead>
      <tbody>
        <tr><td>Davrdagi sotuv</td><td class="num">${formatSum(kpi.sotuv_summa ?? 0)}</td></tr>
        <tr><td>Reja</td><td class="num">${kpi.reja ? formatSum(kpi.reja) : '—'}</td></tr>
        <tr><td>Bajarilish</td><td class="num">${kpi.bajarilish != null ? kpi.bajarilish + '%' : '—'}</td></tr>
        <tr><td>KPI stavkasi</td><td class="num">${kpi.stavka ?? 0}%</td></tr>
        <tr><td><b>Hisoblangan KPI</b></td><td class="num"><b>${formatSum(kpi.kpi ?? 0)}</b></td></tr>
      </tbody>
    </table>

    <table>
      <thead><tr><th>Sana</th><th>Turi</th><th>Izoh</th><th class="num">Summa</th></tr></thead>
      <tbody>
        ${
          amallar.length
            ? amallar
                .map(
                  (a) =>
                    `<tr><td>${new Date(a.created_at).toLocaleDateString()}</td><td>${turNomi(a.tur)}</td><td>${a.izoh ?? ''}</td><td class="num">${formatSum(a.summa)}</td></tr>`,
                )
                .join('')
            : '<tr><td colspan="4">Bu davrda harakat yo‘q</td></tr>'
        }
      </tbody>
      <tfoot><tr>
        <td colspan="3" class="num">UMUMIY QOLDIQ</td>
        <td class="num">${formatSum(hisobot?.umumiy_qoldiq ?? 0)}</td>
      </tr></tfoot>
    </table>

    ${imzo(s)}
    ${altbilgi(s)}
  `;

  hujjatniYoz(w, { nom: `Maosh hisoboti — ${xodim.ism}`, uslub: uslub(s), tana });
}
