import { useCallback, useEffect, useRef, useState } from 'react';
import { C, RADIUS, sh } from '../lib/sa-tema';
import { supabase } from '../lib/supabase';
import { xabarKorsat } from './Xabar';

// ============================================================================
// FAKTURA KO'RINISHI — mijozga boradigan hujjat
//
// Ikki ko'rinish: «1C» buxgalteriya blanki va «Oracle» korporativ hisobot.
// Tanlov dori_settings.faktura_uslubi da turadi va chekka funksiya
// (dori-faktura) hujjatni shunga qarab chizadi.
//
// Rekvizitlar shu yerda: hisob-fakturada bank, STIR va imzo bo'lmasa u
// rasmiy hujjat emas — buxgalteriya qabul qilmaydi. Ularni kodga
// qotirib bo'lmaydi: bank yoki hisob raqami o'zgarganda deploy kutish
// kerak bo'lardi.
//
// NAMUNA tugmasi ataylab: avval ko'rinishni tanlashning yagona yo'li
// haqiqiy sotuv qilib, fakturasini ochish edi.
// ============================================================================

type Sozlama = {
  faktura_uslubi: '1c' | 'oracle';
  manzil: string;
  telefon: string;
  stir: string;
  bank_nomi: string;
  hisob_raqam: string;
  mfo: string;
  rahbar: string;
  hisobchi: string;
  qqs_foiz: string;
};

const BOSH: Sozlama = {
  faktura_uslubi: '1c',
  manzil: '',
  telefon: '',
  stir: '',
  bank_nomi: '',
  hisob_raqam: '',
  mfo: '',
  rahbar: '',
  hisobchi: '',
  qqs_foiz: '0',
};

const USLUBLAR: { kalit: '1c' | 'oracle'; nom: string; izoh: string }[] = [
  { kalit: '1c', nom: '1C', izoh: 'buxgalteriya blanki — bank rekvizitlari, summa yozuvda, imzo va M.O‘.' },
  { kalit: 'oracle', nom: 'ORACLE', izoh: 'korporativ hisobot — to‘q sarlavha lentasi, zebra qatorlar, jami bloki' },
];

const MAYDONLAR: { kalit: keyof Sozlama; yorliq: string; en: string; joy?: string }[] = [
  { kalit: 'manzil', yorliq: 'MANZIL', en: 'w-full sm:w-96', joy: 'Toshkent sh., ...' },
  { kalit: 'telefon', yorliq: 'TELEFON', en: 'w-44', joy: '+998 71 200 00 20' },
  { kalit: 'stir', yorliq: 'STIR (INN)', en: 'w-36', joy: '302 456 789' },
  { kalit: 'bank_nomi', yorliq: 'BANK', en: 'w-full sm:w-80', joy: 'AT «Ipoteka-bank» ...' },
  { kalit: 'hisob_raqam', yorliq: 'HISOB RAQAM', en: 'w-56', joy: '2020 8000 ...' },
  { kalit: 'mfo', yorliq: 'MFO', en: 'w-24', joy: '00443' },
  { kalit: 'rahbar', yorliq: 'RAHBAR (imzo ostida)', en: 'w-52', joy: 'A. Abdullayev' },
  { kalit: 'hisobchi', yorliq: 'BOSH HISOBCHI', en: 'w-52', joy: 'N. Karimova' },
];

export default function FakturaSozlama() {
  const [s, setS] = useState<Sozlama>(BOSH);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  // Namuna ochilgan oynani eslab qolamiz: ketma-ket bosilganda har
  // safar yangi ilova ochilib ketmasin
  const oynaRef = useRef<Window | null>(null);

  const yukla = useCallback(async () => {
    const { data, error } = await supabase
      .from('dori_settings')
      .select('faktura_uslubi, manzil, telefon, stir, bank_nomi, hisob_raqam, mfo, rahbar, hisobchi, qqs_foiz')
      .maybeSingle();
    if (error) return setXato('Sozlama o‘qilmadi: ' + error.message);
    const d = (data ?? {}) as any;
    setS({
      faktura_uslubi: d.faktura_uslubi === 'oracle' ? 'oracle' : '1c',
      manzil: d.manzil ?? '',
      telefon: d.telefon ?? '',
      stir: d.stir ?? '',
      bank_nomi: d.bank_nomi ?? '',
      hisob_raqam: d.hisob_raqam ?? '',
      mfo: d.mfo ?? '',
      rahbar: d.rahbar ?? '',
      hisobchi: d.hisobchi ?? '',
      qqs_foiz: String(d.qqs_foiz ?? 0),
    });
  }, []);

  useEffect(() => {
    yukla();
  }, [yukla]);

  /**
   * Bitta maydonni saqlaydi.
   *
   * Bo'sh qator NULL bo'lib yozilishi kerak: bo'sh satr saqlansa
   * hujjatda "STIR: " degan yorliq qiymatsiz turib qolardi.
   */
  async function saqla(qism: Partial<Record<keyof Sozlama, string | number | null>>) {
    setXato(null);
    const { error } = await supabase.from('dori_settings').update(qism as any).eq('id', true);
    if (error) setXato('Saqlanmadi: ' + error.message);
  }

  function matnSaqla(kalit: keyof Sozlama) {
    return () => saqla({ [kalit]: (s[kalit] as string).trim() || null });
  }

  async function uslubTanla(kalit: '1c' | 'oracle') {
    setS((x) => ({ ...x, faktura_uslubi: kalit }));
    await saqla({ faktura_uslubi: kalit });
    xabarKorsat(`Faktura ko‘rinishi: ${kalit === 'oracle' ? 'Oracle' : '1C'}`);
  }

  async function qqsSaqla() {
    const v = Number(String(s.qqs_foiz).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      setXato('QQS foizi 0 va 100 orasida bo‘lishi kerak');
      return yukla();
    }
    await saqla({ qqs_foiz: v });
  }

  /**
   * Namuna faktura — soxta ma'lumot bilan, sotuv qilmasdan.
   *
   * Oyna await'dan OLDIN ochiladi: brauzer pop-up'ga faqat foydalanuvchi
   * harakati paytida ruxsat beradi, hujjat kelguncha kutilsa bloklanadi.
   */
  async function namuna(uslub: '1c' | 'oracle') {
    const w = window.open('', '_blank');
    if (w) {
      oynaRef.current = w;
      w.document.write(
        '<!doctype html><meta charset="utf-8"><title>Namuna…</title>' +
          '<body style="font-family:sans-serif;color:#777;padding:40px">Namuna faktura tayyorlanmoqda…</body>',
      );
    }
    setIsh(uslub);
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('dori-faktura', {
        body: { rejim: 'namuna', uslub },
      });
      if (error) {
        // Chekka funksiya xatosi javob TANASIDA keladi — error.message
        // faqat "non-2xx status" deb qoladi va sabab ko'rinmaydi
        let sabab = error.message ?? '';
        try {
          const j = await (error as any)?.context?.json?.();
          if (j?.error) sabab = j.error;
        } catch {
          /* javob o'qilmadi */
        }
        throw new Error(sabab);
      }
      const r = data as { pdf: string };
      const xom = atob(r.pdf);
      const bayt = new Uint8Array(xom.length);
      for (let i = 0; i < xom.length; i++) bayt[i] = xom.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bayt], { type: 'application/pdf' }));
      if (w) w.location.href = url;
      else setXato('Brauzer yangi oynani blokladi — ruxsat bering va qaytadan bosing');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e: any) {
      w?.close();
      setXato('Namuna ochilmadi: ' + (e?.message ?? ''));
    } finally {
      setIsh(null);
    }
  }

  const inpStyle = {
    background: C.field,
    border: `1px solid ${C.line}`,
    borderRadius: RADIUS,
    color: C.textBright,
  };

  return (
    <div
      className="mb-4 p-4"
      style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
    >
      <div className="mb-3 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
        FAKTURA KO‘RINISHI — SOTUVDAN KEYIN MIJOZGA BORADIGAN HUJJAT
      </div>

      {xato && (
        <div
          className="mb-3 px-3 py-2 text-[12px]"
          style={{ color: C.danger, border: `1px solid ${C.danger}`, borderRadius: RADIUS }}
        >
          {xato}
        </div>
      )}

      {/* ---------- ko'rinish tanlovi ---------- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {USLUBLAR.map((u) => {
          const tanlangan = s.faktura_uslubi === u.kalit;
          return (
            <div
              key={u.kalit}
              className="p-3"
              style={{
                background: tanlangan ? sh(C.neon2, 8) : C.field,
                border: `1px solid ${tanlangan ? C.neon2 : C.line}`,
                borderRadius: RADIUS,
              }}
            >
              <div className="flex items-start gap-3">
                <Eskiz uslub={u.kalit} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold" style={{ color: C.textBright }}>
                      {u.nom}
                    </span>
                    {tanlangan && (
                      <span className="text-[9px] font-bold tracking-[0.14em]" style={{ color: C.neon2 }}>
                        TANLANGAN
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: sh(C.text, 75) }}>
                    {u.izoh}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => uslubTanla(u.kalit)}
                      disabled={tanlangan}
                      className="px-2.5 py-1 text-[10px] font-bold tracking-[0.12em]"
                      style={{
                        color: tanlangan ? sh(C.text, 45) : C.onAccent,
                        background: tanlangan ? 'transparent' : C.neon2,
                        border: `1px solid ${tanlangan ? C.line : C.neon2}`,
                        borderRadius: RADIUS,
                      }}
                    >
                      {tanlangan ? 'ISHLATILMOQDA' : 'TANLASH'}
                    </button>
                    <button
                      onClick={() => namuna(u.kalit)}
                      disabled={ish === u.kalit}
                      className="px-2.5 py-1 text-[10px] font-bold tracking-[0.12em]"
                      style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
                    >
                      {ish === u.kalit ? 'TAYYORLANMOQDA…' : 'NAMUNA PDF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- rekvizitlar ---------- */}
      <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 60) }}>
        REKVIZITLAR — HUJJATGA CHIQADI
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {MAYDONLAR.map((m) => (
          <label key={m.kalit} className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>
              {m.yorliq}
            </span>
            <input
              value={s[m.kalit] as string}
              onChange={(e) => setS((x) => ({ ...x, [m.kalit]: e.target.value }))}
              onBlur={matnSaqla(m.kalit)}
              placeholder={m.joy}
              className={`${m.en} px-2 py-1.5 text-[13px] outline-none`}
              style={inpStyle}
            />
          </label>
        ))}

        <label className="block">
          <span className="mb-1 block text-[10px]" style={{ color: C.text }}>
            QQS %
          </span>
          <input
            value={s.qqs_foiz}
            onChange={(e) => setS((x) => ({ ...x, qqs_foiz: e.target.value }))}
            onBlur={qqsSaqla}
            className="w-20 px-2 py-1.5 text-[13px] outline-none"
            style={inpStyle}
          />
        </label>
      </div>

      <div className="mt-2 text-[11px] leading-snug" style={{ color: sh(C.text, 70) }}>
        QQS narxga <b>kirgan</b> deb hisoblanadi — jami summaga ustiga qo‘shilmaydi,
        ichidan ajratib ko‘rsatiladi. 0 bo‘lsa fakturada «QQS solinmaydi» deb turadi.
        Logo va firma nomi yuqoridagi «prays ko‘rinishi» bo‘limidan olinadi.
      </div>
    </div>
  );
}

/**
 * Ko'rinishning kichik eskizi.
 *
 * Rasm emas, CSS: rasm bo'lsa dizayn o'zgarganda eskiz eskirib qolardi
 * va foydalanuvchi haqiqatda boshqa hujjat oladi. Bu yerda faqat
 * TARTIB ko'rsatiladi — aniq ko'rinish uchun NAMUNA PDF bor.
 */
function Eskiz({ uslub }: { uslub: '1c' | 'oracle' }) {
  const oq = { background: '#fff', border: '1px solid #cbd0d4' };
  if (uslub === '1c') {
    return (
      <div className="h-[62px] w-[46px] shrink-0 p-1" style={{ ...oq, borderRadius: 2 }}>
        <div style={{ height: 9, border: '1px solid #333' }} />
        <div style={{ height: 3, marginTop: 3, background: '#111', width: '70%' }} />
        <div style={{ height: 2, marginTop: 2, background: '#111' }} />
        <div className="mt-1.5 grid gap-[2px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 3, border: '1px solid #999' }} />
          ))}
        </div>
        <div style={{ height: 2, marginTop: 3, background: '#111' }} />
      </div>
    );
  }
  return (
    <div className="h-[62px] w-[46px] shrink-0 p-1" style={{ ...oq, borderRadius: 2 }}>
      <div style={{ height: 2, background: '#c74634' }} />
      <div style={{ height: 4, marginTop: 3, background: '#2f3b42', width: '55%' }} />
      <div className="mt-1.5 flex gap-[2px]">
        {[0, 1].map((i) => (
          <div key={i} style={{ height: 9, flex: 1, background: '#eef1f3' }} />
        ))}
      </div>
      <div style={{ height: 5, marginTop: 3, background: '#2f3b42' }} />
      <div className="grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 4, background: i % 2 ? '#f4f6f7' : '#fff' }} />
        ))}
      </div>
      <div className="mt-1 flex justify-end">
        <div style={{ height: 5, width: '55%', background: '#2f3b42' }} />
      </div>
    </div>
  );
}
