import { useCallback, useEffect, useState } from 'react';
import { formatSum, supabase } from '../lib/supabase';

// ============================================================================
// XODIM ANKETASI — Sozlamalar ichida
//
// Bu yerda maosh va KPI shartlari to'ldiriladi. Maosh moduli aynan shu
// ma'lumotga tayanadi: stavka, oylik reja va bosqichli KPI foizlari.
//
// KPI bosqichlari: reja bajarilishiga qarab uch xil foiz. Chegaralar
// (80% va 100%) o'zgarmaydi — ular standart va har tenant uchun bir xil,
// shuning uchun sozlamada emas.
// ============================================================================

type Xodim = {
  id: string;
  ism: string;
  lavozim: string | null;
  telefon: string | null;
  oylik_stavka: number;
  kpi_reja: number;
  kpi_past: number;
  kpi_orta: number;
  kpi_yuqori: number;
  ishga_kirgan: string | null;
  faol: boolean;
  izoh: string | null;
};

const BOSH: Partial<Xodim> = {
  ism: '',
  lavozim: '',
  telefon: '',
  oylik_stavka: 0,
  kpi_reja: 0,
  kpi_past: 0,
  kpi_orta: 0,
  kpi_yuqori: 0,
  faol: true,
};

export default function XodimlarPanel() {
  const [xodimlar, setXodimlar] = useState<Xodim[]>([]);
  const [tahrir, setTahrir] = useState<Partial<Xodim> | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    const { data } = await supabase
      .from('xodimlar')
      .select('*')
      .order('faol', { ascending: false })
      .order('ism');
    setXodimlar((data as Xodim[]) ?? []);
    setYuklanmoqda(false);
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">👥 Xodimlar</h3>
          <p className="text-sm text-gray-500">
            Maosh va KPI shartlari shu yerda to‘ldiriladi. Maosh moduli shunga tayanadi.
          </p>
        </div>
        <button
          onClick={() => setTahrir({ ...BOSH })}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white"
        >
          + Xodim
        </button>
      </div>

      {yuklanmoqda ? (
        <div className="py-8 text-center text-gray-500">Yuklanmoqda…</div>
      ) : xodimlar.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          Xodim qo‘shilmagan. Omborchi, haydovchi, sotuvchi — tizimga kirmaydiganlar ham
          shu yerda turadi.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-gray-100">
          {xodimlar.map((x) => (
            <button
              key={x.id}
              onClick={() => setTahrir(x)}
              className="flex w-full items-center gap-3 py-3 text-left hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">
                  {x.ism}
                  {!x.faol && <span className="ml-2 text-xs text-gray-500">(ishdan bo‘shagan)</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {x.lavozim ?? '—'}
                  {x.telefon ? ` · ${x.telefon}` : ''}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-bold tabular-nums text-gray-900">{formatSum(x.oylik_stavka)}</div>
                <div className="text-xs text-gray-500">
                  {Number(x.kpi_reja) > 0
                    ? `reja ${formatSum(x.kpi_reja)} · ${x.kpi_past}/${x.kpi_orta}/${x.kpi_yuqori}%`
                    : 'KPI yo‘q'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {tahrir && (
        <XodimOynasi
          xodim={tahrir}
          onYopish={() => setTahrir(null)}
          onSaqlandi={() => {
            setTahrir(null);
            yukla();
          }}
        />
      )}
    </div>
  );
}

function XodimOynasi({
  xodim,
  onYopish,
  onSaqlandi,
}: {
  xodim: Partial<Xodim>;
  onYopish: () => void;
  onSaqlandi: () => void;
}) {
  const [f, setF] = useState<Partial<Xodim>>(xodim);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  function qoy<K extends keyof Xodim>(k: K, v: Xodim[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function saqla() {
    setXato(null);
    if (!f.ism?.trim()) return setXato('Ism majburiy');
    setSaqlanmoqda(true);
    try {
      const qator = {
        ism: f.ism.trim(),
        lavozim: f.lavozim?.trim() || null,
        telefon: f.telefon?.trim() || null,
        oylik_stavka: Number(f.oylik_stavka) || 0,
        kpi_reja: Number(f.kpi_reja) || 0,
        kpi_past: Number(f.kpi_past) || 0,
        kpi_orta: Number(f.kpi_orta) || 0,
        kpi_yuqori: Number(f.kpi_yuqori) || 0,
        ishga_kirgan: f.ishga_kirgan || null,
        faol: f.faol !== false,
        izoh: f.izoh?.trim() || null,
      };

      // org_id ATAYLAB yuborilmaydi: u bazada standart qiymat sifatida
      // qo'yilmagan, shuning uchun yangi xodimda uni beramiz. Lekin
      // qiymatni PANEL emas, current_org_id() aniqlaydi - shuning uchun
      // insert'da ham RLS tekshiradi.
      if (f.id) {
        const { error } = await supabase.from('xodimlar').update(qator).eq('id', f.id);
        if (error) throw error;
      } else {
        const { data: org } = await supabase.from('organizations').select('id').limit(1).maybeSingle();
        const { error } = await supabase.from('xodimlar').insert({ ...qator, org_id: (org as any)?.id });
        if (error) throw error;
      }
      onSaqlandi();
    } catch (e: any) {
      setXato(e.message ?? 'Xatolik');
    } finally {
      setSaqlanmoqda(false);
    }
  }

  const inp = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand';
  const yorliq = 'text-xs font-semibold text-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6">
        <h3 className="font-bold text-gray-900">{f.id ? 'Xodimni tahrirlash' : 'Yangi xodim'}</h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={yorliq}>Ism familiya *</span>
            <input className={inp} value={f.ism ?? ''} onChange={(e) => qoy('ism', e.target.value)} />
          </label>
          <label className="block">
            <span className={yorliq}>Lavozim</span>
            <input
              className={inp}
              value={f.lavozim ?? ''}
              onChange={(e) => qoy('lavozim', e.target.value)}
              placeholder="Sotuvchi, omborchi…"
            />
          </label>
          <label className="block">
            <span className={yorliq}>Telefon</span>
            <input className={inp} value={f.telefon ?? ''} onChange={(e) => qoy('telefon', e.target.value)} />
          </label>
          <label className="block">
            <span className={yorliq}>Oylik stavka</span>
            <input
              className={inp}
              inputMode="numeric"
              value={String(f.oylik_stavka ?? '')}
              onChange={(e) => qoy('oylik_stavka', Number(e.target.value.replace(/\D/g, '')) as any)}
            />
          </label>
          <label className="block">
            <span className={yorliq}>Ishga kirgan sana</span>
            <input
              type="date"
              className={inp}
              value={f.ishga_kirgan ?? ''}
              onChange={(e) => qoy('ishga_kirgan', e.target.value)}
            />
          </label>
        </div>

        <div className="mt-5 rounded-xl bg-gray-50 p-4">
          <div className="text-sm font-bold text-gray-900">KPI — oylik reja bo‘yicha</div>
          <p className="mt-1 text-xs text-gray-500">
            Sotuv rejasi va bajarilishga qarab foiz. Reja 0 bo‘lsa KPI hisoblanmaydi.
          </p>

          <label className="mt-3 block">
            <span className={yorliq}>Oylik sotuv rejasi</span>
            <input
              className={inp}
              inputMode="numeric"
              value={String(f.kpi_reja ?? '')}
              onChange={(e) => qoy('kpi_reja', Number(e.target.value.replace(/\D/g, '')) as any)}
              placeholder="100000000"
            />
          </label>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="block">
              <span className={yorliq}>&lt; 80% da</span>
              <input
                className={inp}
                inputMode="decimal"
                value={String(f.kpi_past ?? '')}
                onChange={(e) => qoy('kpi_past', Number(e.target.value.replace(/[^\d.]/g, '')) as any)}
                placeholder="1"
              />
            </label>
            <label className="block">
              <span className={yorliq}>80–100%</span>
              <input
                className={inp}
                inputMode="decimal"
                value={String(f.kpi_orta ?? '')}
                onChange={(e) => qoy('kpi_orta', Number(e.target.value.replace(/[^\d.]/g, '')) as any)}
                placeholder="2"
              />
            </label>
            <label className="block">
              <span className={yorliq}>&gt; 100%</span>
              <input
                className={inp}
                inputMode="decimal"
                value={String(f.kpi_yuqori ?? '')}
                onChange={(e) => qoy('kpi_yuqori', Number(e.target.value.replace(/[^\d.]/g, '')) as any)}
                placeholder="4"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Foizlar sotuv summasidan olinadi. Masalan reja 100 mln, sotuv 120 mln,
            &gt;100% stavkasi 4% → KPI 4 800 000.
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.faol !== false}
            onChange={(e) => qoy('faol', e.target.checked)}
          />
          <span className="text-sm text-gray-700">Ishlayapti</span>
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
            {saqlanmoqda ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
