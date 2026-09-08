import { useCallback, useEffect, useState } from 'react';
import { tasdiqlaSoz } from '../components/Xabar';
import { C, MONO, RADIUS, sh } from '../lib/sa-tema';
import { supabase, fnXato } from '../lib/supabase';
import { eskiQoralamaniKochir, useVaraqlar, VARAQ_SONI } from '../lib/varaqlar';
import SotuvTahrir from '../components/SotuvTahrir';

// ============================================================================
// SOTUV
//
// Bot buyurtmasidan farqli: bu yerda operator o'zi sklad tanlaydi, dorini
// qidiradi, donada miqdor yozadi, mijozni tanlaydi va sotadi. Faktura shu
// zahoti shakllanadi — chop etish yoki PDF saqlash.
//
// NARX OPERATORDAN OLINMAYDI: u faqat miqdorni beradi. Narx tanlangan
// skladning taklifidan olinadi va sotuvda muzlatiladi — aks holda ekranda
// bir narx, hujjatda boshqasi chiqib qolardi.
//
// FOYDA darhol ko'rinadi: mijoz to'laydigan summa, skladga tegishlisi va
// farqi. Sotuvchi nima bilan savdo qilayotganini bilib tursin.
//
// ---------------------------------------------------------------------------
// BESHTA VARAQ
//
// Dorixonada navbat kutmaydi: birinchi mijoz qog'ozini qidirayotganda
// ikkinchisiniki terilaveradi. Shuning uchun bitta savat emas, beshta
// mustaqil varaq — har birining o'z skladi, savati, mijozi va izohi.
//
// Hech qaysi harakat ma'lumotni yo'qotmaydi: varaq almashtirish, boshqa
// modulga o'tish, sahifani yangilash, hatto ilovani yopish ham. Varaq
// faqat IKKI holatda bo'shaydi — sotuv yakunlansa yoki operator o'zi
// tozalasa. lib/varaqlar.ts ga qarang.
//
// Sklad almashtirilganda savat SAQLANADI, lekin narxlar yangi skladdan
// qayta olinadi: aks holda ekranda bir narx, hujjatda boshqasi chiqardi.
// Yangi skladda yo'q dori o'chirilmaydi — qizil bo'lib turadi, chunki
// jimgina yo'qolgan pozitsiyani operator sezmay qoladi.
// ============================================================================

type Topilgan = {
  id: string;
  name: string;
  manufacturer: string | null;
  unit: string | null;
  price: number;
  base_price: number | null;
  stock: number | null;
  expiry: string | null;
  series: string | null;
  /** Bitta pachkadagi dona soni. Doim >= 1 (baza shunday qaytaradi). */
  pachka: number;
};

// Qidiruv natijasi endi BITTA sklad bilan cheklanmaydi. Mijoz «aspirin
// bormi?» deb so'raganda operator faqat tanlangan skladni ko'rardi;
// qo'shni skladda turgani ko'rinmasdi va sotuv qo'ldan ketardi.
//
// Har taklif — bitta sklad, bitta narx. Joriy skladniki birinchi turadi.
type Taklif = Topilgan & { warehouse_id: string; sklad: string };

/** Bir xil nomdagi dorining hamma skladdagi takliflari */
type Guruh = { nom: string; nom_norm: string; joriyda: boolean; takliflar: Taklif[] };

/**
 * Taklifdan savat uchun dori. Sklad maydonlari OLIB TASHLANADI: savat
 * varaqning skladiga tegishli, taklifnikiga emas. Ular saqlanib qolsa,
 * sklad almashtirilgandan keyin savatda eski sklad nomi turib qolardi.
 */
function taklifdanDori(t: Taklif): Topilgan {
  return {
    id: t.id,
    name: t.name,
    manufacturer: t.manufacturer,
    unit: t.unit,
    price: Number(t.price),
    base_price: t.base_price == null ? null : Number(t.base_price),
    stock: t.stock == null ? null : Number(t.stock),
    expiry: t.expiry ?? null,
    series: t.series ?? null,
    pachka: Math.max(Number(t.pachka) || 1, 1),
  };
}

export type Birlik = 'pachka' | 'dona';

// `yoq` — sklad almashtirilgandan keyin bu dori yangi skladda topilmadi.
// O'chirib yubormaymiz: operator nima tushib qolganini ko'rsin.
//
// `price` DOIM pachka narxi bo'lib qoladi, donaga sotilganda ham.
// Bo'lingan narxni saqlasak, birlik ikki marta almashtirilganda u
// yana bo'linib ketardi. Dona narxi kerak bo'lganda hisoblanadi.
type Savat = Topilgan & { qty: number; birlik: Birlik; yoq?: boolean };

/** Tanlangan birlikdagi bitta dona/pachka narxi */
function birlikNarx(x: { price: number; pachka: number; birlik: Birlik }): number {
  // Yuqoriga yaxlitlash bazadagi dori_qator_hisob bilan bir xil:
  // ekranda va fakturada har xil summa chiqmasin.
  return x.birlik === 'dona' ? Math.ceil(x.price / Math.max(x.pachka || 1, 1)) : x.price;
}

type Mijoz = { id: string; name: string | null; phone: string | null; pharmacy: string | null };

/** Bitta varaqning to'liq holati */
type Qoralama = {
  sklad: string;
  savat: Savat[];
  mijoz: Mijoz | null;
  izoh: string;
};

const BOSH_VARAQ: Qoralama = { sklad: '', savat: [], mijoz: null, izoh: '' };

// Eski bitta savatli qoralamani birinchi varaqqa ko'chirish. Deploy
// aynan operator savat terib turganda tushishi mumkin — o'sha savat
// yo'qolmasin. Modul darajasida bir marta: `useVaraqlar` xotirani
// birinchi renderda o'qiydi, ko'chirish undan oldin bo'lishi kerak.
let kochirildi = false;
function birMartaKochir() {
  if (kochirildi) return;
  kochirildi = true;
  eskiQoralamaniKochir<Qoralama>(
    'dori.sotuv.varaq',
    { sklad: 'dori.sotuv.sklad', savat: 'dori.sotuv.savat', mijoz: 'dori.sotuv.mijoz', izoh: 'dori.sotuv.izoh' },
    BOSH_VARAQ,
  );
}

type Sotuv = {
  id: string;
  sale_no: number;
  created_at: string;
  status: string;
  total: number;
  base_total: number;
  foyda: number;
  customer_name: string | null;
  pharmacy: string | null;
  sklad: string | null;
  pozitsiya: number;
};

const son = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const sana = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—');
const vaqt = (s: string) =>
  new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function DoriSotuv() {
  birMartaKochir();

  const [skladlar, setSkladlar] = useState<{ id: string; name: string; is_default: boolean }[]>([]);

  // Modul almashganda komponent yo'q qilinadi va holat o'ladi. Beshta
  // varaq ham xotirada turadi — lib/varaqlar.ts.
  const V = useVaraqlar<Qoralama>('dori.sotuv.varaq', BOSH_VARAQ);
  const { savat, mijoz, izoh } = V.joriy;

  // Sklad tanlanmagan varaqda standarti ko'rinadi, LEKIN varaqqa
  // yozilmaydi: yozilsa bo'sh varaq "boshlangan" bo'lib qolardi va
  // beshala tugma to'lgandek ko'rinardi.
  const [standartSklad, setStandartSklad] = useState('');
  const sklad = V.joriy.sklad || standartSklad;

  // Eski `useState` shakli saqlanadi: chaqiruv joylari o'zgarmaydi va
  // `setSavat((p) => ...)` avvalgidek ishlaydi.
  function maydon<K extends keyof Qoralama>(k: K) {
    return (v: Qoralama[K] | ((eski: Qoralama[K]) => Qoralama[K])) =>
      V.yoz((s) => ({ ...s, [k]: typeof v === 'function' ? (v as (e: Qoralama[K]) => Qoralama[K])(s[k]) : v }));
  }
  const setSklad = maydon('sklad');
  const setSavat = maydon('savat');
  const setMijoz = maydon('mijoz');
  const setIzoh = maydon('izoh');

  const [q, setQ] = useState('');
  const [guruhlar, setGuruhlar] = useState<Guruh[]>([]);
  const [mijozQ, setMijozQ] = useState('');
  const [mijozlar, setMijozlar] = useState<Mijoz[]>([]);
  const [oxirgi, setOxirgi] = useState<{ sale_id: string; sale_no: number; total: number; foyda: number } | null>(null);
  const [tarix, setTarix] = useState<Sotuv[]>([]);
  // Tahrir oynasi qaysi sotuv uchun ochiq
  const [tahrir, setTahrir] = useState<string | null>(null);
  const [ish, setIsh] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  const tarixYukla = useCallback(async () => {
    const { data } = await supabase.rpc('dori_sotuvlar', { p_limit: 15 });
    setTarix((data ?? []) as Sotuv[]);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('dori_skladlar');
      const r = (data ?? []) as { id: string; name: string; is_default: boolean }[];
      setSkladlar(r);
      setStandartSklad(r.find((x) => x.is_default)?.id || r[0]?.id || '');
    })();
    tarixYukla();
  }, [tarixYukla]);

  // Ism yoki raqamdan 2 ta belgi yozilishi bilan mos keladiganlar
  // chiqadi. Bo'sh bo'lsa - oxirgi mijozlar ro'yxati.
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = mijozQ.trim();
      if (q.length === 1) return;   // bitta belgidan foyda yo'q
      const { data } = await supabase.rpc('dori_sotuv_mijozlar', {
        p_q: q || null,
        p_limit: 20,
      });
      setMijozlar((data ?? []) as Mijoz[]);
    }, 200);
    return () => clearTimeout(t);
  }, [mijozQ]);

  async function qidir(s: string) {
    setQ(s);
    if (!sklad || s.trim().length < 2) { setGuruhlar([]); return; }
    const { data, error } = await supabase.rpc('dori_sotuv_qidir_skladlar', {
      p_warehouse_id: sklad, p_q: s, p_limit: 20,
    });
    if (error) { setXato('Qidiruv xatosi: ' + error.message); return; }
    setGuruhlar((data ?? []) as Guruh[]);
  }

  /**
   * Ro'yxatdan taklif tanlandi.
   *
   * Boshqa skladniki bo'lsa jimgina savatga qo'shib bo'lmaydi: sotuv
   * VARAQNING skladidan yaratiladi, ya'ni dori boshqa skladdan olingani
   * bilan hujjatda joriy sklad turardi va narx ham o'shanikiga
   * almashardi. Shuning uchun avval sklad almashtiriladi — so'rab.
   */
  async function taklifniQosh(t: Taklif) {
    if (t.warehouse_id === sklad) { savatga(taklifdanDori(t)); return; }

    const nom = t.sklad;
    const ok = await tasdiqlaSoz(
      `«${t.name}» ${nom} skladida — joriy skladda yo‘q yoki boshqa narxda.\n\n` +
      `Varaq skladi ${nom} ga almashtirilsinmi?\n` +
      `Savat saqlanadi, narxlar yangi skladdan qayta olinadi.`,
    );
    if (!ok) return;

    // Sklad almashmasa (narx olinmadi) dorini QO'SHMAYMIZ: u eski
    // skladda boshqa narxda sotilib ketardi
    if (!(await skladAlmash(t.warehouse_id))) return;
    savatga(taklifdanDori(t));
  }

  function savatga(d: Topilgan) {
    setSavat((p) => {
      const bor = p.find((x) => x.id === d.id);
      if (bor) return p.map((x) => (x.id === d.id ? { ...x, qty: x.qty + 1 } : x));
      return [...p, { ...d, qty: 1, birlik: 'pachka' as Birlik }];
    });
    setQ('');
    setGuruhlar([]);
  }

  /**
   * Pachka <-> dona.
   *
   * Miqdor QAYTA HISOBLANMAYDI: "2" yozilgan bo'lsa, dona ga o'tganda
   * ham 2 bo'lib qoladi. Avtomatik 180 ga aylantirish operator
   * kutmagan summa berardi — u odatda boshqa miqdor yozmoqchi.
   */
  function birlikQoy(id: string, birlik: Birlik) {
    setSavat((p) => p.map((x) => (x.id === id ? { ...x, birlik } : x)));
  }

  function miqdorQoy(id: string, v: string) {
    const n = Number(v.replace(',', '.'));
    setSavat((p) => p.map((x) => (x.id === id ? { ...x, qty: Number.isFinite(n) ? n : 0 } : x)));
  }

  /**
   * Skladni almashtirish — savat SAQLANADI.
   *
   * Avval savat tozalanardi: bir necha o'nlab pozitsiya terib qo'yib,
   * noto'g'ri sklad tanlanganini payqash hammasini yo'qotardi.
   *
   * Lekin savatni shundoq qoldirib ham bo'lmaydi: narx eski skladniki
   * bo'lib qolardi, sotuv esa yangi skladdan yaratiladi — ekranda bir
   * narx, hujjatda boshqasi. Shuning uchun narxlar qayta so'raladi.
   *
   * ALMASHDIMI degan javob qaytadi: qidiruvdan boshqa sklad taklifi
   * tanlanganda dori faqat almashish MUVAFFAQIYATLI bo'lsa qo'shiladi.
   */
  async function skladAlmash(yangi: string): Promise<boolean> {
    if (!yangi) return false;
    if (yangi === sklad) return true;
    setQ('');
    setGuruhlar([]);

    if (savat.length === 0) {
      setSklad(yangi);
      return true;
    }

    setIsh('Narxlar yangi skladdan olinmoqda...');
    setXato(null);
    const { data, error } = await supabase.rpc('dori_sotuv_narxlar', {
      p_warehouse_id: yangi,
      p_ids: savat.map((x) => x.id),
    });
    setIsh(null);
    if (error) {
      // Sklad ALMASHTIRILMAYDI: narxsiz o'tkazsak savat eski narx bilan
      // yangi skladda sotilib ketardi
      setXato('Narxlar olinmadi, sklad almashtirilmadi: ' + error.message);
      return false;
    }

    const kelgan = new Map(
      ((data as any[]) ?? []).map((r) => [String(r.id), r]),
    );
    let yoqolgan = 0;
    let ozgargan = 0;
    const yangiSavat: Savat[] = savat.map((x) => {
      const r = kelgan.get(x.id);
      if (!r || r.bor !== true) {
        yoqolgan++;
        return { ...x, yoq: true };
      }
      if (Number(r.price) !== Number(x.price)) ozgargan++;
      return {
        ...x,
        yoq: false,
        // Birlik SAQLANADI: operator donaga qo'ygan bo'lsa, sklad
        // almashgani uni pachkaga qaytarib qo'ymasin
        pachka: Math.max(Number(r.pachka) || 1, 1),
        price: Number(r.price),
        base_price: r.base_price == null ? null : Number(r.base_price),
        stock: r.stock == null ? null : Number(r.stock),
        expiry: r.expiry ?? null,
        series: r.series ?? null,
      };
    });

    V.yoz((s) => ({ ...s, sklad: yangi, savat: yangiSavat }));

    const nom = skladlar.find((w) => w.id === yangi)?.name ?? 'yangi sklad';
    const qism = [
      ozgargan ? `${ozgargan} ta narx yangilandi` : null,
      yoqolgan ? `${yoqolgan} ta dori bu skladda YO‘Q — qizil bilan belgilandi` : null,
    ].filter(Boolean);
    setXabar(`Sklad: ${nom}` + (qism.length ? ' · ' + qism.join(' · ') : ' · savat o‘zgarmadi'));
    return true;
  }

  async function varaqniTozala() {
    if (savat.length === 0 && !mijoz && !izoh) return V.tozala();
    const n = savat.filter((x) => x.qty > 0).length;
    if (!(await tasdiqlaSoz(`${V.faol + 1}-varaq tozalansinmi? ${n} pozitsiya o‘chadi.`))) return;
    V.tozala();
    setQ('');
    setGuruhlar([]);
    setMijozQ('');
  }

  const sotiladi = savat.filter((x) => !x.yoq && x.qty > 0);
  const yoqPozitsiya = savat.filter((x) => x.yoq).length;

  // Sotuvga nima yetishmayapti — ekranda ochiq turadi
  const kamlik = !sklad
    ? 'Sklad tanlang'
    : sotiladi.length === 0
      ? 'Dori qo‘shing va miqdorini yozing'
      : yoqPozitsiya > 0
        ? `${yoqPozitsiya} ta dori bu skladda yo‘q — ularni o‘chiring yoki skladni qaytaring`
        : !mijoz
          ? 'Mijoz tanlang — o‘ng tomonda ismi yoki raqamini yozing'
          : '';
  const tayyor = kamlik === '';

  // Skladda yo'q pozitsiya summaga kirmaydi: u sotilmaydi, ya'ni
  // hisobda turishi yolg'on raqam berardi
  const jami = sotiladi.reduce((s, x) => s + birlikNarx(x) * (x.qty || 0), 0);
  const tannarx = sotiladi.reduce(
    (s, x) =>
      s +
      (x.birlik === 'dona'
        ? Math.ceil(Number(x.base_price ?? 0) / Math.max(x.pachka || 1, 1))
        : Number(x.base_price ?? 0)) *
        (x.qty || 0),
    0,
  );

  async function sot() {
    if (!sklad) return setXato('Sklad tanlang');
    if (!mijoz) return setXato('Mijoz tanlang');
    if (yoqPozitsiya > 0) {
      return setXato(
        `${yoqPozitsiya} ta dori tanlangan skladda yo‘q. Ularni o‘chiring yoki skladni qaytaring — ` +
          'aks holda faktura savatdan farq qilardi.',
      );
    }
    const items = sotiladi.map((x) => ({ product_id: x.id, qty: x.qty, birlik: x.birlik }));
    if (!items.length) return setXato('Dori qo‘shing va miqdorini yozing');

    setIsh('Sotuv rasmiylashtirilmoqda...');
    setXato(null);
    const { data, error } = await supabase.rpc('dori_sotuv_yarat', {
      p_warehouse_id: sklad,
      p_customer_id: mijoz.id,
      p_items: items,
      p_comment: izoh || null,
    });
    setIsh(null);
    if (error) return setXato('Sotilmadi: ' + error.message);

    const r = data as any;
    if (!r?.ok) {
      if (r?.error === 'QOLDIQ_YETMAYDI') {
        const kam = (r.kam ?? []) as { name: string; soralgan: number; bor: number }[];
        setXato(
          'Qoldiq yetmaydi: ' + kam.map((k) => `${k.name} — so‘ralgan ${son(k.soralgan)}, bor ${son(k.bor)}`).join('; ')
        );
      } else setXato('Sotilmadi: ' + (r?.error ?? 'nomalum'));
      return;
    }

    setOxirgi({ sale_id: r.sale_id, sale_no: r.sale_no, total: r.total, foyda: r.foyda });

    // Omborchiga TERISH uchun faktura Telegramga ketadi. Javobini
    // kutamiz: sklad botga ulanmagan bo'lsa buni darhol aytish kerak,
    // aks holda tovar terilmay qolib ketardi.
    let skladXabar = '';
    try {
      const { data: yub } = await supabase.functions.invoke('dori-sklad-yubor', {
        body: { sale_id: r.sale_id },
      });
      const y = yub as { yuborildi: number; ulanmagan_sklad: number };
      skladXabar = y?.yuborildi
        ? ' · skladga terish uchun yuborildi'
        : ' · ⚠️ sklad Telegramga ulanmagan, terish so‘rovi bormadi';
    } catch {
      skladXabar = ' · ⚠️ skladga yuborilmadi';
    }

    setXabar(`Sotuv №${r.sale_no} rasmiylashtirildi · ${son(r.total)} so‘m · foyda ${son(r.foyda)} so‘m${skladXabar}`);
    // Varaq YAKUNLANDI — faqat shu payt bo'shaydi. Boshqa varaqlarga
    // tegilmaydi: ular boshqa mijozlarniki.
    V.tozala();
    setQ('');
    setGuruhlar([]);
    setMijozQ('');
    tarixYukla();
  }

  // Faktura chekka funksiyada yasaladi va base64 bo'lib qaytadi
  async function faktura(saleId: string, amal: 'print' | 'pdf' | 'excel') {
    setIsh('Faktura tayyorlanmoqda...');
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('dori-faktura', {
        body: { rejim: 'sotuv', sale_id: saleId },
      });
      if (error) throw new Error(await fnXato(error));
      const r = data as { nom: string; pdf: string; xlsx: string };
      const b64 = amal === 'excel' ? r.xlsx : r.pdf;
      const tur = amal === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';

      const xom = atob(b64);
      const bayt = new Uint8Array(xom.length);
      for (let i = 0; i < xom.length; i++) bayt[i] = xom.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bayt], { type: tur }));

      if (amal === 'print') {
        // Yangi oynada ochamiz va chop etish oynasini chaqiramiz.
        // Brauzer bloklasa — foydalanuvchi o'zi ochadi, shuning uchun
        // oyna baribir ochiq qoladi.
        const w = window.open(url, '_blank');
        if (w) w.addEventListener('load', () => w.print());
        else setXato('Brauzer yangi oynani blokladi — PDF SAQLASH tugmasidan foydalaning');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${r.nom}.${amal === 'excel' ? 'xlsx' : 'pdf'}`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 20000);
    } catch (e: any) {
      let sabab = e?.message ?? '';
      try { const j = await e?.context?.json?.(); if (j?.error) sabab = j.error; } catch { /* javob o'qilmadi */ }
      setXato('Faktura tayyorlanmadi: ' + sabab);
    } finally {
      setIsh(null);
    }
  }

  // Sklad keyinroq ulangan bo'lsa yoki xabar yo'qolgan bo'lsa - qayta
  async function skladgaQaytaYubor(s: Sotuv) {
    setIsh('Skladga yuborilmoqda...');
    setXato(null);
    try {
      const { data, error } = await supabase.functions.invoke('dori-sklad-yubor', {
        body: { sale_id: s.id },
      });
      if (error) throw new Error(await fnXato(error));
      const y = data as { yuborildi: number };
      setXabar(y?.yuborildi
        ? `№${s.sale_no} skladga yuborildi`
        : `№${s.sale_no}: sklad Telegramga ulanmagan`);
    } catch (e: any) {
      setXato('Yuborilmadi: ' + (e?.message ?? ''));
    } finally {
      setIsh(null);
    }
  }

  async function bekorQil(s: Sotuv) {
    if (!await tasdiqlaSoz(`Sotuv №${s.sale_no} bekor qilinsinmi? Qoldiq skladga qaytariladi.`)) return;
    const { error } = await supabase.rpc('dori_sotuv_bekor', { p_sale_id: s.id });
    if (error) { setXato('Bekor qilinmadi: ' + error.message); return; }
    setXabar(`Sotuv №${s.sale_no} bekor qilindi`);
    tarixYukla();
  }

  const btn = 'px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]';
  const inpStyle = { background: C.field, border: `1px solid ${C.line}`, color: C.textBright, fontFamily: MONO };

  return (
    <div style={{ fontFamily: MONO }}>
      {xato && <Xabar rang={C.danger} yop={() => setXato(null)}>{xato}</Xabar>}
      {xabar && <Xabar rang={C.neon} yop={() => setXabar(null)}>{xabar}</Xabar>}

      <div className="mb-3">
        <div className="text-[15px] font-bold tracking-[0.14em]" style={{ color: C.textBright }}>
          SOTUV
        </div>
        <div className="text-[11px]" style={{ color: C.text }}>
          sklad tanlanadi · dori qidiriladi · miqdor donada · mijoz tanlanadi · faktura
        </div>
      </div>

      {/* ---------- beshta varaq ----------
          Har biri mustaqil sotuv. Almashtirish hech narsani yo'qotmaydi,
          varaq faqat sotuv yakunlangach yoki qo'lda tozalangach bo'shaydi. */}
      <div className="mb-4 flex flex-wrap items-stretch gap-1.5">
        {Array.from({ length: VARAQ_SONI }, (_, i) => {
          const v = V.varaqlar[i];
          const faol = i === V.faol;
          const n = v ? v.savat.filter((x) => x.qty > 0).length : 0;
          const summa = v ? v.savat.reduce((s, x) => s + (x.yoq ? 0 : x.price * (x.qty || 0)), 0) : 0;
          const kim = v?.mijoz?.pharmacy || v?.mijoz?.name || null;
          return (
            <button
              key={i}
              onClick={() => V.tanla(i)}
              className="px-3 py-1.5 text-left"
              style={{
                minWidth: 132,
                background: faol ? sh(C.neon, 12) : C.panel,
                border: `1px solid ${faol ? C.neon : C.line}`,
                borderRadius: RADIUS,
              }}
            >
              <span className="flex items-center gap-1.5">
                <b className="text-[12px]" style={{ color: faol ? C.neon : C.text }}>{i + 1}</b>
                <span className="text-[10px] font-bold tracking-[0.1em]" style={{ color: v ? C.textBright : sh(C.text, 55) }}>
                  {v ? (kim ?? 'MIJOZSIZ') : 'YANGI SOTUV'}
                </span>
              </span>
              <span className="mt-0.5 block text-[10px]" style={{ color: sh(C.text, 75) }}>
                {v ? `${n} pozitsiya · ${son(summa)}` : 'bo‘sh'}
              </span>
            </button>
          );
        })}

        {V.boshlangan(V.faol) && (
          <button
            onClick={varaqniTozala}
            className="px-3 text-[10px] font-bold tracking-[0.12em]"
            style={{ color: C.danger, border: `1px solid ${C.line}`, borderRadius: RADIUS }}
          >
            VARAQNI TOZALASH
          </button>
        )}
      </div>

      {/* Xotiradan tiklanganini bir marta aytamiz: varaqlar o'zi to'lib
          turgani odamni chalkashtirmasin — "men buni qo'shganmidim?" */}
      {V.tiklandi && (
        <div
          className="mb-3 flex items-center justify-between gap-2 px-3 py-2 text-[11px]"
          style={{ background: sh(C.neon2, 12), border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
        >
          <span style={{ color: C.textBright }}>
            Tugallanmagan sotuv tiklandi — {V.varaqlar.filter((x) => x != null).length} ta varaq
          </span>
          <button
            onClick={V.bekorQil}
            className="px-2 py-1 text-[10px] font-bold tracking-[0.1em]"
            style={{ color: C.neon2, border: `1px solid ${C.neon2}`, borderRadius: RADIUS }}
          >
            TUSHUNARLI
          </button>
        </div>
      )}

      {ish && <div className="mb-3 text-[11px]" style={{ color: C.neon2 }}>{ish}</div>}

      {/* ---------- oxirgi sotuv: faktura tugmalari ---------- */}
      {oxirgi && (
        <div className="mb-4 p-3" style={{ border: `1px solid ${C.neon}`, background: sh(C.neon, 8) }}>
          <div className="text-[13px] font-bold" style={{ color: C.textBright }}>
            Sotuv №{oxirgi.sale_no} tayyor · {son(oxirgi.total)} so‘m ·{' '}
            <span style={{ color: C.neon }}>foyda {son(oxirgi.foyda)} so‘m</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => faktura(oxirgi.sale_id, 'print')} className={btn}
                    style={{ color: C.onAccent, background: C.neon, border: `1px solid ${C.neon}` }}>
              CHOP ETISH
            </button>
            <button onClick={() => faktura(oxirgi.sale_id, 'pdf')} className={btn}
                    style={{ color: C.neon2, background: 'transparent', border: `1px solid ${C.neon2}` }}>
              PDF SAQLASH
            </button>
            <button onClick={() => faktura(oxirgi.sale_id, 'excel')} className={btn}
                    style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
              EXCEL
            </button>
            <button onClick={() => setOxirgi(null)} className={btn}
                    style={{ color: C.text, background: 'transparent', border: `1px solid ${C.line}` }}>
              YOPISH
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* ---------- chap: qidiruv va savat ---------- */}
        <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px]" style={{ color: C.text }}>SKLAD</span>
              {/* Savat TOZALANMAYDI — narxlari yangi skladdan qayta olinadi */}
              <select value={sklad} onChange={(e) => skladAlmash(e.target.value)}
                      className="px-2 py-1.5 text-[12px] outline-none" style={{ ...inpStyle, minWidth: 170 }}>
                {skladlar.length === 0 && <option value="">— sklad yo‘q —</option>}
                {skladlar.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-[10px]" style={{ color: C.text }}>DORI QIDIRISH</span>
              <input value={q} onChange={(e) => qidir(e.target.value)}
                     placeholder="nomi — kirill yoki lotin"
                     className="w-full px-2 py-1.5 text-[13px] outline-none" style={inpStyle} />
            </label>
          </div>

          {/* ---------- qidiruv natijasi: HAMMA SKLAD ----------
              Mijoz «aspirin bormi?» deb so'raydi — operator uch skladdagi
              narxni bir qarashda aytib beradi. Joriy sklad birinchi,
              eng arzoni belgilangan. */}
          {guruhlar.length > 0 && (
            <div className="mb-3 grid gap-2" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {guruhlar.map((g) => {
                const arzon = Math.min(...g.takliflar.map((t) => Number(t.price)));
                return (
                  <div key={g.nom_norm}
                       style={{ border: `1px solid ${C.line}`, background: C.panel2 }}>
                    <div className="px-2 py-1 text-[12px] font-bold"
                         style={{ color: C.textBright, borderBottom: `1px solid ${sh(C.line, 60)}` }}>
                      {g.nom}
                      {g.takliflar.length > 1 && (
                        <span className="ml-1 text-[10px] font-normal" style={{ color: C.neon2 }}>
                          · {g.takliflar.length} skladda
                        </span>
                      )}
                      {!g.joriyda && (
                        <span className="ml-1 text-[10px] font-normal" style={{ color: C.warn }}>
                          · joriy skladda YO‘Q
                        </span>
                      )}
                    </div>

                    {g.takliflar.map((t) => {
                      const joriy = t.warehouse_id === sklad;
                      return (
                        <button
                          key={t.warehouse_id + t.id}
                          onClick={() => taklifniQosh(t)}
                          className="flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left"
                          style={{ borderTop: `1px solid ${sh(C.line, 40)}` }}
                          title={joriy ? 'Savatga qo‘shish' : `Sklad ${t.sklad} ga almashtirilib qo‘shiladi`}
                        >
                          <span className="min-w-0">
                            <span className="text-[11px] font-bold tracking-[0.08em]"
                                  style={{ color: joriy ? C.neon : C.neon2 }}>
                              {t.sklad}{joriy ? ' ·' : ' ⇄'}
                            </span>
                            <span className="ml-1 text-[11px]" style={{ color: C.text }}>
                              {t.manufacturer ?? '—'}
                              {t.stock != null && <> · qoldiq {son(t.stock)}</>}
                              {t.expiry && <> · muddat {sana(t.expiry)}</>}
                            </span>
                            {/* Pachkada nechta dona borligi — donaga sotish
                                tugmasi nima qilishini shu ko'rsatadi */}
                            {t.pachka > 1 && (
                              <span className="block text-[10px]" style={{ color: C.neon2 }}>
                                1 pachka = {t.pachka} dona · dona {son(Math.ceil(Number(t.price) / t.pachka))} so‘m
                              </span>
                            )}
                          </span>
                          <b className="shrink-0 text-[13px]"
                             style={{ color: Number(t.price) === arzon ? C.neon : C.textBright }}>
                            {son(t.price)}
                          </b>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {yoqPozitsiya > 0 && (
            <div
              className="mb-2 flex items-center justify-between gap-2 px-3 py-2 text-[11px]"
              style={{ background: sh(C.danger, 10), border: `1px solid ${C.danger}`, borderRadius: RADIUS }}
            >
              <span style={{ color: C.textBright }}>
                {yoqPozitsiya} ta dori bu skladda yo‘q. O‘chiring yoki avvalgi skladga qayting.
              </span>
              <button
                onClick={() => setSavat((p) => p.filter((x) => !x.yoq))}
                className="px-2 py-1 text-[10px] font-bold tracking-[0.1em]"
                style={{ color: C.danger, border: `1px solid ${C.danger}`, borderRadius: RADIUS }}
              >
                HAMMASINI O‘CHIRISH
              </button>
            </div>
          )}

          {savat.length === 0 ? (
            <div className="p-6 text-center text-[12px]" style={{ color: C.text, border: `1px dashed ${C.line}` }}>
              Dori qidiring va ro‘yxatdan tanlang.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: sh(C.text, 80) }}>
                    {['DORI', 'BIRLIK', 'NARX', 'MIQDOR', 'SUMMA', ''].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left text-[9px] font-bold tracking-[0.14em]"
                          style={{ borderBottom: `1px solid ${C.line}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {savat.map((x, i) => (
                    <tr key={x.id}
                        style={{ background: x.yoq ? sh(C.danger, 10) : i % 2 ? C.zebra : 'transparent' }}>
                      <td className="px-2 py-1.5" style={{ color: C.textBright, minWidth: 200 }}>
                        {x.name}
                        {x.yoq && (
                          <span className="font-bold" style={{ color: C.danger }}> · BU SKLADDA YO‘Q</span>
                        )}
                        {/* Qoldiq PACHKADA yuritiladi: donada sotilganda
                            taqqoslash ham ulushga o'tkaziladi */}
                        {!x.yoq && x.stock != null &&
                          (x.birlik === 'dona' ? x.qty / Math.max(x.pachka || 1, 1) : x.qty) > x.stock && (
                          <span style={{ color: C.danger }}> · qoldiq {son(x.stock)} pachka</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {/* Pachka bo'linmaydigan bo'lsa tanlov ham
                            ko'rsatilmaydi: bosib bo'lmaydigan tugma
                            "nega ishlamayapti?" degan savol beradi */}
                        {x.pachka > 1 ? (
                          <span className="inline-flex" style={{ border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
                            {(['pachka', 'dona'] as Birlik[]).map((b) => (
                              <button
                                key={b}
                                onClick={() => birlikQoy(x.id, b)}
                                className="px-2 py-0.5 text-[10px] font-bold tracking-[0.08em]"
                                style={{
                                  color: x.birlik === b ? C.onAccent : C.text,
                                  background: x.birlik === b ? C.neon2 : 'transparent',
                                }}
                              >
                                {b === 'pachka' ? 'PACHKA' : 'DONA'}
                              </button>
                            ))}
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: sh(C.text, 60) }}>dona</span>
                        )}
                        {x.pachka > 1 && (
                          <span className="mt-0.5 block text-[9px]" style={{ color: sh(C.text, 60) }}>
                            1 × {x.pachka}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: x.yoq ? C.danger : C.text }}>
                        {x.yoq ? '—' : son(birlikNarx(x))}
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={x.qty} onChange={(e) => miqdorQoy(x.id, e.target.value)}
                               className="w-20 px-2 py-1 text-right text-[12px] outline-none" style={inpStyle} />
                      </td>
                      <td className="px-2 py-1.5 font-bold" style={{ color: x.yoq ? C.danger : C.neon }}>
                        {x.yoq ? '—' : son(birlikNarx(x) * (x.qty || 0))}
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setSavat((p) => p.filter((y) => y.id !== x.id))}
                                style={{ color: C.danger }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- o'ng: mijoz va yakun ---------- */}
        <div className="p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
          <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
            MIJOZ
          </div>

          {mijoz ? (
            <div className="mb-3 p-2" style={{ border: `1px solid ${C.neon}`, background: sh(C.neon, 6) }}>
              <div className="text-[12px] font-bold" style={{ color: C.textBright }}>
                {mijoz.pharmacy || mijoz.name || '—'}
              </div>
              <div className="text-[11px]" style={{ color: C.text }}>{mijoz.phone ?? '—'}</div>
              <button onClick={() => setMijoz(null)} className="mt-1 text-[10px]" style={{ color: C.neon2 }}>
                boshqasini tanlash
              </button>
            </div>
          ) : (
            <>
              <input value={mijozQ} onChange={(e) => setMijozQ(e.target.value)}
                     placeholder="ismi yoki telefon raqami — 2 ta belgidan"
                     autoComplete="off"
                     className="mb-2 w-full px-2 py-1.5 text-[12px] outline-none"
                     style={{ ...inpStyle, borderColor: mijoz ? C.line : C.warn }} />
              <div className="mb-3 grid gap-1" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {mijozlar.map((m) => (
                  <button key={m.id} onClick={() => setMijoz(m)} className="p-2 text-left"
                          style={{ border: `1px solid ${C.line}` }}>
                    <span className="text-[12px]" style={{ color: C.textBright }}>
                      {m.pharmacy || m.name || '—'}
                    </span>
                    <span className="block text-[10px]" style={{ color: C.text }}>{m.phone ?? '—'}</span>
                  </button>
                ))}
                {mijozlar.length === 0 && (
                  <span className="text-[11px]" style={{ color: C.warn }}>
                    {mijozQ.trim()
                      ? 'Bunday mijoz topilmadi — MIJOZLAR bo‘limida qo‘shing'
                      : 'Mijoz yo‘q — MIJOZLAR bo‘limida qo‘shing'}
                  </span>
                )}
              </div>
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px]" style={{ color: C.text }}>IZOH</span>
            <input value={izoh} onChange={(e) => setIzoh(e.target.value)}
                   className="w-full px-2 py-1.5 text-[12px] outline-none" style={inpStyle} />
          </label>

          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
            <Qator nom="Mijoz to‘laydi" qiymat={son(jami)} rang={C.neon} katta />
            <Qator nom="Skladga tegishli" qiymat={son(tannarx)} rang={C.text} />
            <Qator nom="Foyda" qiymat={son(jami - tannarx)} rang={jami - tannarx > 0 ? C.neon2 : C.warn} katta />
          </div>

          <button onClick={sot} disabled={!!ish}
                  className="mt-3 w-full py-2.5 text-[12px] font-bold tracking-[0.14em]"
                  style={{
                    color: C.onAccent,
                    background: tayyor ? C.neon : sh(C.neon, 30),
                    border: `1px solid ${C.neon}`,
                  }}>
            SOTUV
          </button>

          {/* Nega bosib bo'lmasligini AYTAMIZ: tugma jim turmasin */}
          {!tayyor && (
            <div className="mt-1 text-[11px]" style={{ color: C.warn }}>
              {kamlik}
            </div>
          )}
        </div>
      </div>

      {/* ---------- tarix ---------- */}
      <div className="mt-4 p-4" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: RADIUS }}>
        <div className="mb-2 text-[10px] font-bold tracking-[0.16em]" style={{ color: sh(C.text, 80) }}>
          OXIRGI SOTUVLAR
        </div>
        {tarix.length === 0 && (
          <div className="text-[11px]" style={{ color: C.text }}>Hali sotuv yo‘q.</div>
        )}
        <div className="grid gap-1">
          {tarix.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-2"
                 style={{ border: `1px solid ${C.line}`, opacity: s.status === 'cancelled' ? 0.5 : 1 }}>
              <span className="text-[11px]" style={{ color: C.textBright }}>
                №{s.sale_no} · {vaqt(s.created_at)} · {s.pharmacy || s.customer_name || '—'}
                <span style={{ color: C.text }}> · {s.sklad ?? '—'} · {s.pozitsiya} pozitsiya</span>
                {s.status === 'cancelled' && <span style={{ color: C.danger }}> · BEKOR</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: C.text }}>
                  <b style={{ color: C.neon }}>{son(s.total)}</b> · foyda {son(s.foyda)}
                </span>
                <button onClick={() => skladgaQaytaYubor(s)} className="px-2 py-1 text-[10px] font-bold"
                        style={{ color: C.neon, border: `1px solid ${C.line}` }}>SKLADGA</button>
                <button onClick={() => faktura(s.id, 'print')} className="px-2 py-1 text-[10px] font-bold"
                        style={{ color: C.neon2, border: `1px solid ${C.line}` }}>CHOP</button>
                <button onClick={() => faktura(s.id, 'pdf')} className="px-2 py-1 text-[10px] font-bold"
                        style={{ color: C.text, border: `1px solid ${C.line}` }}>PDF</button>
                {/* Tahrir faqat YOPILGAN sotuvga: bekor qilinganning
                    qoldig'i allaqachon qaytarilgan, tahrir uni ikki
                    marta qaytarardi */}
                {s.status === 'done' && (
                  <button onClick={() => setTahrir(s.id)} className="px-2 py-1 text-[10px] font-bold"
                          style={{ color: C.warn, border: `1px solid ${C.line}` }}>TAHRIR</button>
                )}
                {s.status === 'done' && (
                  <button onClick={() => bekorQil(s)} className="px-2 py-1 text-[10px] font-bold"
                          style={{ color: C.danger, border: `1px solid ${C.line}` }}>BEKOR</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {tahrir && (
        <SotuvTahrir
          saleId={tahrir}
          yop={() => setTahrir(null)}
          tayyor={() => {
            setXabar('Faktura tahrirlandi — qaytadan chop eting');
            tarixYukla();
          }}
        />
      )}
    </div>
  );
}

function Qator({ nom, qiymat, rang, katta }: { nom: string; qiymat: string; rang: string; katta?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px]" style={{ color: C.text }}>{nom}</span>
      <b className={katta ? 'text-[15px]' : 'text-[12px]'} style={{ color: rang }}>{qiymat}</b>
    </div>
  );
}

function Xabar({ rang, yop, children }: { rang: string; yop: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 px-3 py-2 text-[12px]"
         style={{ color: rang, border: `1px solid ${rang}`, background: sh(rang, 8) }}>
      <span>{children}</span>
      <button onClick={yop} style={{ color: rang }}>✕</button>
    </div>
  );
}
