import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Menejer bir necha korxonada ishlashi mumkin (erkin sotuvchi). Bitta
// telefon-parol bilan kiradi, keyin qaysi tashkilotda ishlashini
// tanlaydi.
//
// MUHIM: tanlov SERVERDA saqlanadi (profiles.org_id) — brauzerda emas.
// Sababi: RLS va butun baza current_org_id() ga tayanadi, u esa
// profiles dan o'qiydi. Ya'ni tanlov brauzerda tursa, baza baribir
// eski tashkilotni ko'rsataverardi.
//
// Shundan kelib chiqadigan ikki narsa:
//   1. Tanlagandan keyin sahifa TO'LIQ qayta yuklanadi — ochiq
//      ekranlarda eski tashkilot ma'lumoti qolib ketmasin
//   2. Ikkinchi qurilmada ochiq sessiya ham yangi tashkilotga o'tadi
export type Uzvlik = {
  org_id: string;
  org_nom: string;
  rol: string;
  manager_id: string | null;
  joriymi: boolean;
};

// Kirgandan keyin bir marta tanlanadi. Sessiya kalitiga user id
// yoziladi: boshqa hisob bilan kirilganda tanlov qaytadan so'ralsin.
const TANLOV_KEY = 'ilova.tashkilot.tanlandi';

export function tanlovBelgilandi(userId: string) {
  try {
    sessionStorage.setItem(TANLOV_KEY, userId);
  } catch {
    // Maxfiy oyna yoki bloklangan saqlash — tanlash ekrani har safar
    // chiqadi, xolos. Ishlashga xalaqit bermaydi.
  }
}

export function tanlovBorMi(userId: string) {
  try {
    return sessionStorage.getItem(TANLOV_KEY) === userId;
  } catch {
    return false;
  }
}

export async function uzvliklarniOl(): Promise<Uzvlik[]> {
  const { data } = await supabase.rpc('uzvliklarim');
  return ((data as Uzvlik[] | null) ?? []).filter((u) => u.rol === 'manager');
}

export async function tashkilotniTanla(orgId: string) {
  const { error } = await supabase.rpc('tashkilotni_tanla', { p_org_id: orgId });
  if (error) throw new Error(error.message);
}

// ---------------- To'liq ekran: kirgandan keyin tanlash ----------------

export default function TashkilotTanlash({
  uzvliklar,
  userId,
  onTanlandi,
}: {
  uzvliklar: Uzvlik[];
  userId: string;
  onTanlandi: () => void;
}) {
  const [yuklanmoqda, setYuklanmoqda] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  async function tanla(u: Uzvlik) {
    setXato(null);
    setYuklanmoqda(u.org_id);
    try {
      // Joriy tashkilotning o'zi tanlansa ham chaqiramiz: profiles
      // dagi manager_id eskirgan bo'lishi mumkin (masalan admin
      // kartochkani qayta yaratgan).
      await tashkilotniTanla(u.org_id);
      tanlovBelgilandi(userId);
      onTanlandi();
    } catch (e: any) {
      setYuklanmoqda(null);
      setXato(e?.message ?? 'Tashkilotni tanlab bo‘lmadi');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="text-3xl">🏢</div>
          <h1 className="mt-3 text-xl font-extrabold text-gray-900">Tashkilotni tanlang</h1>
          <p className="mt-2 text-sm text-gray-500">
            Siz {uzvliklar.length} ta tashkilotda menejersiz. Qaysi birida ishlaysiz?
          </p>
        </div>

        {xato && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {xato}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {uzvliklar.map((u) => (
            <button
              key={u.org_id}
              onClick={() => tanla(u)}
              disabled={yuklanmoqda !== null}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-brand hover:shadow disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-gray-900">{u.org_nom}</span>
                <span className="mt-0.5 block text-xs text-gray-400">
                  {u.joriymi ? 'oxirgi marta shu yerda ishlagansiz' : 'menejer'}
                </span>
              </span>
              <span className="shrink-0 text-sm text-gray-300">
                {yuklanmoqda === u.org_id ? '…' : '→'}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-6 w-full rounded-xl py-3 text-sm font-medium text-gray-400 hover:text-gray-600"
        >
          Chiqish
        </button>
      </div>
    </div>
  );
}

// ---------------- Sarlavhadagi almashtirgich ----------------

export function TashkilotAlmashtirgich({ uzvliklar }: { uzvliklar: Uzvlik[] }) {
  const [ochiq, setOchiq] = useState(false);
  const [band, setBand] = useState(false);
  const joriy = uzvliklar.find((u) => u.joriymi);

  // Bitta tashkilot — almashtiradigan narsa yo'q, ekranni band qilmaymiz
  if (uzvliklar.length < 2) return null;

  async function tanla(u: Uzvlik) {
    if (u.joriymi) return setOchiq(false);
    setBand(true);
    try {
      await tashkilotniTanla(u.org_id);
      // Qayta yuklash SHART: ochiq ekranlar eski tashkilotning
      // mijozlari va narxlarini keshda ushlab turadi
      window.location.reload();
    } catch {
      setBand(false);
      setOchiq(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOchiq((v) => !v)}
        disabled={band}
        className="flex max-w-[9rem] items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 md:max-w-[14rem]"
      >
        <span className="truncate">🏢 {joriy?.org_nom ?? 'Tashkilot'}</span>
        <span className="text-gray-300">▾</span>
      </button>
      {ochiq && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOchiq(false)} />
          <div className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
            {uzvliklar.map((u) => (
              <button
                key={u.org_id}
                onClick={() => tanla(u)}
                className={`block w-full truncate px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                  u.joriymi ? 'font-bold text-gray-900' : 'text-gray-600'
                }`}
              >
                {u.joriymi ? '✓ ' : ''}
                {u.org_nom}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
