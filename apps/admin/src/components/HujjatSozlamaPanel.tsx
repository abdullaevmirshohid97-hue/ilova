import { useCallback, useEffect, useRef, useState } from 'react';
import { fnXato, resizeImage, supabase } from '../lib/supabase';
import {
  SHRIFTLAR,
  blank,
  hujjatniYoz,
  imzo,
  logoniOl,
  oynaOch,
  sozlamaKeshiniTashla,
  sozlamaniOl,
  uslub,
  type HujjatSozlama,
} from '../lib/hujjat';

// ============================================================================
// HUJJAT VA CHOP ETISH SOZLAMASI
//
// Chap tomonda sozlamalar, o'ngda jonli A4 ko'rinishi. Ko'rinish
// haqiqiy hujjat kodidan quriladi (lib/hujjat.ts dagi uslub va blank),
// ya'ni bu yerdagi rasm printerdan chiqadigan narsaning o'zi — alohida
// "taxminiy ko'rinish" emas.
//
// Logo yopiq bucket'da va yo'li TENANT ID bilan boshlanadi
// ('<org_id>/logo.png'). Shu qoida tufayli siyosat tenantni yo'lning
// o'zidan biladi va boshqa biznesning logosini ochib bo'lmaydi.
// ============================================================================

const QOGOZLAR = [
  { k: 'A4', n: 'A4 — 210×297 mm' },
  { k: 'A5', n: 'A5 — 148×210 mm' },
];

export default function HujjatSozlamaPanel() {
  const [f, setF] = useState<HujjatSozlama | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const faylRef = useRef<HTMLInputElement>(null);

  const yukla = useCallback(async () => {
    const s = await sozlamaniOl(true);
    setF(s);
    setOrgId(s.org_id ?? null);
    setLogo(await logoniOl(s));
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  function qoy<K extends keyof HujjatSozlama>(k: K, v: HujjatSozlama[K]) {
    setF((s) => (s ? { ...s, [k]: v } : s));
    setXabar(null);
  }

  async function logoYukla(fayl: File) {
    if (!orgId) return;
    setXabar(null);
    try {
      // Kichraytiramiz: 2 MB chegara bor va logo hujjatga data-URI
      // bo'lib kiradi — katta fayl har fakturani og'irlashtiradi.
      const kichik = await resizeImage(fayl, 600, 0.9);
      const yol = `${orgId}/logo-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('org-logos').upload(yol, kichik, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;

      // Eskisini o'chiramiz: bucket'da yig'ilib qolmasin
      if (f?.logo_path) {
        await supabase.storage.from('org-logos').remove([f.logo_path]);
      }
      qoy('logo_path', yol);
      setLogo(await logoniOl({ ...(f as HujjatSozlama), logo_path: yol }));
      setXabar({ ok: true, matn: 'Logo yuklandi — saqlashni unutmang' });
    } catch (e: any) {
      setXabar({ ok: false, matn: await fnXato(e, 'Logo yuklanmadi') });
    }
  }

  async function saqla() {
    if (!f) return;
    setSaqlanmoqda(true);
    setXabar(null);
    try {
      const { error } = await supabase.rpc('hujjat_sozlama_saqla', {
        p: {
          logo_path: f.logo_path,
          manzil: f.manzil,
          telefon: f.telefon,
          stir: f.stir,
          bank: f.bank,
          hisob_raqam: f.hisob_raqam,
          qogoz: f.qogoz,
          chekka_tepa: f.chekka_tepa,
          chekka_past: f.chekka_past,
          chekka_chap: f.chekka_chap,
          chekka_ong: f.chekka_ong,
          shrift: f.shrift,
          olcham_matn: f.olcham_matn,
          olcham_sarlavha: f.olcham_sarlavha,
          olcham_jadval: f.olcham_jadval,
          rang: f.rang,
          ustun_rasm: f.ustun_rasm,
          ustun_sku: f.ustun_sku,
          ustun_razmer: f.ustun_razmer,
          imzo_topshirdi: f.imzo_topshirdi,
          imzo_qabul: f.imzo_qabul,
          altbilgi: f.altbilgi,
        },
      });
      if (error) throw error;
      sozlamaKeshiniTashla(); // keyingi hujjat yangi sozlama bilan chiqsin
      setXabar({ ok: true, matn: 'Saqlandi ✓' });
    } catch (e: any) {
      setXabar({ ok: false, matn: e.message ?? 'Xatolik' });
    } finally {
      setSaqlanmoqda(false);
    }
  }

  /** Sinov hujjati — haqiqiy sozlama bilan, lekin o'ylab topilgan tovarlar */
  async function sinovChop() {
    if (!f) return;
    const w = oynaOch();
    if (!w) return;
    const tana = `
      ${blank(f, null, logo, { turi: 'Sinov hujjati', raqam: 1, sana: new Date().toLocaleDateString() })}
      <div class="meta">
        <div><span class="yorliq">Mijoz</span><br><b>Sinov mijozi</b></div>
        <div><span class="yorliq">Telefon</span><br><b>+998 90 000 00 00</b></div>
      </div>
      <table>
        <thead><tr>
          <th style="width:26px">№</th><th>Mahsulot</th>
          ${f.ustun_sku !== false ? '<th>SKU</th>' : ''}
          ${f.ustun_razmer !== false ? '<th>Razmer / Rang</th>' : ''}
          <th class="num">Miqdor</th><th class="num">Narx</th><th class="num">Summa</th>
        </tr></thead>
        <tbody>
          ${[
            ['Adyol Kashmir', 'ADY-AK1', '200×230 / Jigarrang', 2, 320000],
            ['Choyshab to‘plami', 'CHY-T2', '180×200 / Oq', 5, 145000],
            ['Yostiq jildi', 'YOS-J1', '50×70 / Ko‘k', 12, 38000],
          ]
            .map(
              (r, i) => `<tr>
              <td>${i + 1}</td><td><b>${r[0]}</b></td>
              ${f.ustun_sku !== false ? `<td>${r[1]}</td>` : ''}
              ${f.ustun_razmer !== false ? `<td>${r[2]}</td>` : ''}
              <td class="num">${r[3]}</td>
              <td class="num">${Number(r[4]).toLocaleString()}</td>
              <td class="num">${(Number(r[3]) * Number(r[4])).toLocaleString()}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="${4 + (f.ustun_sku !== false ? 1 : 0) + (f.ustun_razmer !== false ? 1 : 0)}" class="num">JAMI</td>
          <td class="num">1 821 000</td>
        </tr></tfoot>
      </table>
      ${imzo(f)}
    `;
    hujjatniYoz(w, { nom: 'Sinov hujjati', uslub: uslub(f), tana });
  }

  if (!f) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-500">
        Yuklanmoqda…
      </div>
    );
  }

  const inp = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand';
  const yorliq = 'text-xs font-semibold text-gray-600';
  const son = (k: keyof HujjatSozlama, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      className={inp}
      value={String(f[k] ?? '')}
      onChange={(e) => qoy(k, Number(e.target.value) as any)}
    />
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">🖨 Hujjat va chop etish</h3>
          <p className="text-sm text-gray-500">
            Faktura, yig‘ish varaqasi, katalog va hisobot — to‘rtalasi shu sozlamadan quriladi.
          </p>
        </div>
        <button
          onClick={sinovChop}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Sinov hujjatini ochish
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Sozlamalar */}
        <div className="space-y-6">
          {/* Blank */}
          <section>
            <h4 className="text-sm font-bold text-gray-900">Blank</h4>
            <div className="mt-3 flex items-start gap-4">
              <div className="shrink-0">
                <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
                  {logo ? (
                    <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-gray-500">logo yo‘q</span>
                  )}
                </div>
                <input
                  ref={faylRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const fl = e.target.files?.[0];
                    if (fl) logoYukla(fl);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => faylRef.current?.click()}
                  className="mt-2 w-24 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold text-gray-700"
                >
                  {logo ? 'Almashtirish' : 'Yuklash'}
                </button>
              </div>

              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={yorliq}>Manzil</span>
                  <input
                    className={inp}
                    value={f.manzil ?? ''}
                    onChange={(e) => qoy('manzil', e.target.value)}
                    placeholder="Andijon sh., Bobur ko‘chasi 12"
                  />
                </label>
                <label className="block">
                  <span className={yorliq}>Telefon</span>
                  <input
                    className={inp}
                    value={f.telefon ?? ''}
                    onChange={(e) => qoy('telefon', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className={yorliq}>STIR</span>
                  <input className={inp} value={f.stir ?? ''} onChange={(e) => qoy('stir', e.target.value)} />
                </label>
                <label className="block">
                  <span className={yorliq}>Bank</span>
                  <input className={inp} value={f.bank ?? ''} onChange={(e) => qoy('bank', e.target.value)} />
                </label>
                <label className="block">
                  <span className={yorliq}>Hisob raqam</span>
                  <input
                    className={inp}
                    value={f.hisob_raqam ?? ''}
                    onChange={(e) => qoy('hisob_raqam', e.target.value)}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Qog'oz */}
          <section>
            <h4 className="text-sm font-bold text-gray-900">Qog‘oz va chekka</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-5">
              <label className="block sm:col-span-1">
                <span className={yorliq}>Qog‘oz</span>
                <select className={inp} value={f.qogoz} onChange={(e) => qoy('qogoz', e.target.value as any)}>
                  {QOGOZLAR.map((q) => (
                    <option key={q.k} value={q.k}>
                      {q.n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={yorliq}>Tepa (mm)</span>
                {son('chekka_tepa', 0, 50)}
              </label>
              <label className="block">
                <span className={yorliq}>Past (mm)</span>
                {son('chekka_past', 0, 50)}
              </label>
              <label className="block">
                <span className={yorliq}>Chap (mm)</span>
                {son('chekka_chap', 0, 50)}
              </label>
              <label className="block">
                <span className={yorliq}>O‘ng (mm)</span>
                {son('chekka_ong', 0, 50)}
              </label>
            </div>
          </section>

          {/* Shrift */}
          <section>
            <h4 className="text-sm font-bold text-gray-900">Shrift va o‘lcham</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="block sm:col-span-1">
                <span className={yorliq}>Shrift</span>
                <select className={inp} value={f.shrift} onChange={(e) => qoy('shrift', e.target.value)}>
                  {SHRIFTLAR.map((s) => (
                    <option key={s.qiymat} value={s.qiymat}>
                      {s.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={yorliq}>Sarlavha (pt)</span>
                {son('olcham_sarlavha', 10, 40)}
              </label>
              <label className="block">
                <span className={yorliq}>Matn (pt)</span>
                {son('olcham_matn', 6, 20)}
              </label>
              <label className="block">
                <span className={yorliq}>Jadval (pt)</span>
                {son('olcham_jadval', 6, 18)}
              </label>
            </div>
            <label className="mt-3 flex items-center gap-3">
              <span className={yorliq}>Rang</span>
              <input
                type="color"
                value={f.rang ?? '#7000FF'}
                onChange={(e) => qoy('rang', e.target.value.toUpperCase())}
                className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200"
              />
              <span className="text-xs text-gray-500">{f.rang}</span>
            </label>
          </section>

          {/* Ustunlar */}
          <section>
            <h4 className="text-sm font-bold text-gray-900">Jadval ustunlari</h4>
            <p className="text-xs text-gray-500">
              Keraksizini o‘chiring — rasmsiz hujjat tezroq chiqadi va siyoh kam ketadi.
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              {(
                [
                  ['ustun_rasm', 'Rasm'],
                  ['ustun_sku', 'SKU'],
                  ['ustun_razmer', 'Razmer / Rang'],
                ] as const
              ).map(([k, n]) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f[k] !== false}
                    onChange={(e) => qoy(k, e.target.checked as any)}
                  />
                  <span className="text-sm text-gray-700">{n}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Pastki qism */}
          <section>
            <h4 className="text-sm font-bold text-gray-900">Imzo va altbilgi</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={yorliq}>Chap imzo</span>
                <input
                  className={inp}
                  value={f.imzo_topshirdi ?? ''}
                  onChange={(e) => qoy('imzo_topshirdi', e.target.value)}
                />
              </label>
              <label className="block">
                <span className={yorliq}>O‘ng imzo</span>
                <input
                  className={inp}
                  value={f.imzo_qabul ?? ''}
                  onChange={(e) => qoy('imzo_qabul', e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={yorliq}>Altbilgi matni</span>
                <input
                  className={inp}
                  value={f.altbilgi ?? ''}
                  onChange={(e) => qoy('altbilgi', e.target.value)}
                  placeholder="Xaridingiz uchun rahmat!"
                />
              </label>
            </div>
          </section>

          {xabar && (
            <p
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                xabar.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              }`}
            >
              {xabar.matn}
            </p>
          )}

          <button
            onClick={saqla}
            disabled={saqlanmoqda}
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {saqlanmoqda ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>

        {/* Jonli ko'rinish */}
        <div>
          <div className={yorliq}>Ko‘rinishi</div>
          <Korinish sozlama={f} logo={logo} />
          <p className="mt-2 text-xs text-gray-500">
            Bu haqiqiy hujjat kodidan quriladi — printerdan shu chiqadi.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Jonli ko'rinish.
 *
 * Hujjat iframe ichida chiziladi: uning uslubi @page va o'z shriftini
 * qo'yadi, panel sahifasiga aralashib ketmasligi kerak. iframe alohida
 * hujjat, ya'ni uslublar bir-biriga tegmaydi.
 */
function Korinish({ sozlama, logo }: { sozlama: HujjatSozlama; logo: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const d = ref.current?.contentDocument;
    if (!d) return;
    const kengOran = sozlama.qogoz === 'A5' ? 148 : 210;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><style>
      ${uslub(sozlama)}
      body { padding: ${sozlama.chekka_tepa ?? 14}mm ${sozlama.chekka_ong ?? 14}mm
                      ${sozlama.chekka_past ?? 14}mm ${sozlama.chekka_chap ?? 14}mm;
             width: ${kengOran}mm; transform-origin: top left; }
    </style></head><body>
      ${blank(sozlama, null, logo, { turi: 'Faktura', raqam: 1, sana: '02.09.2026' })}
      <table>
        <thead><tr><th>Mahsulot</th><th class="num">Miqdor</th><th class="num">Summa</th></tr></thead>
        <tbody>
          <tr><td>Adyol Kashmir</td><td class="num">2</td><td class="num">640 000</td></tr>
          <tr><td>Choyshab to‘plami</td><td class="num">5</td><td class="num">725 000</td></tr>
        </tbody>
        <tfoot><tr><td colspan="2" class="num">JAMI</td><td class="num">1 365 000</td></tr></tfoot>
      </table>
      ${imzo(sozlama)}
    </body></html>`);
    d.close();

    // Kenglikka sig'dirish uchun kichraytiramiz
    const oyna = ref.current!;
    const kerak = oyna.clientWidth;
    const mmPx = 3.7795;
    const olcham = Math.min(1, kerak / (kengOran * mmPx));
    if (d.body) {
      d.body.style.transform = `scale(${olcham})`;
      oyna.style.height = `${kengOran * 1.414 * mmPx * olcham}px`;
    }
  }, [sozlama, logo]);

  return (
    <iframe
      ref={ref}
      title="Hujjat ko'rinishi"
      className="mt-1 w-full rounded-xl border border-gray-200 bg-white"
      style={{ minHeight: 320 }}
    />
  );
}
