// =============================================================
//  UMUMIY HOLAT — mahalliy ombor + sinxronizatsiya
//
//  Ekranlar ma'lumotni SHU YERDAN oladi va u qurilmadagi ombordan
//  o'qiladi — serverdan emas. Shuning uchun ilova internetsiz ham
//  to'liq ishlaydi, yozuv esa darhol ko'rinadi.
//
//  Sinxronizatsiya fonda ishlaydi:
//   · ilova ochilganda
//   · har yozuvdan keyin (turtki bilan, kechiktirilgan)
//   · har 60 soniyada
//   · ilova fonga o'tib qaytganda
//
//  Bir vaqtda IKKI sinx ishlamaydi (`ishlayapti` bayrog'i): ikkalasi
//  bir navbatni yuborib, dubl so'rov qilardi.
// =============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Hisob, Klient, Turkum, Yozuv } from '@ilova/kassa-yadro';
import {
  hisoblarOl,
  klientlarOl,
  omborniQoy,
  turkumlarOl,
  yozuvlarOl,
  type Men,
} from './baza';
import { supabaseServer } from './server';
import { sinxronla, uuid, type SinxNatija } from './sinx';
import { xatoMatn } from './supabase';
import { xatoYoz } from './xatolar';
import { omborOch } from '../ombor/tanla';
import type { Ombor, SinxHolat, Ziddiyat } from '../ombor/turi';

const QURILMA_KALIT = 'kassa.qurilma';
const SINX_ORALIG = 60_000;

type Holat = {
  men: Men;
  hisoblar: Hisob[];
  turkumlar: Turkum[];
  klientlar: Klient[];
  yozuvlar: Yozuv[];
  yuklanmoqda: boolean;
  xato: string | null;

  /** Sinxronizatsiya holati — ekranda belgi bo'lib turadi */
  sinxHolat: SinxHolat;
  sinxlanmoqda: boolean;
  navbatda: number;
  ziddiyatlar: Ziddiyat[];
  /** Saqlash ishlayaptimi (shaxsiy oynada yo'q bo'lishi mumkin) */
  doimiy: boolean;

  /** Mahalliy ombordan qayta o'qish */
  yangila: () => Promise<void>;
  /** Serverga yuborish va olish, keyin qayta o'qish */
  sinxlash: () => Promise<void>;
  ziddiyatniYop: (id: string) => Promise<void>;
  nomniQoy: (nom: string) => void;
};

const Kontekst = createContext<Holat | null>(null);

export function useHolat(): Holat {
  const h = useContext(Kontekst);
  if (!h) throw new Error('HolatProvider ichida ishlatilishi kerak');
  return h;
}

async function qurilmaId(): Promise<string> {
  try {
    const bor = await AsyncStorage.getItem(QURILMA_KALIT);
    if (bor) return bor;
    const yangi = uuid();
    await AsyncStorage.setItem(QURILMA_KALIT, yangi);
    return yangi;
  } catch {
    // Saqlanmasa ham ishlayveradi — faqat server har safar yangi
    // qurilma ko'radi.
    return uuid();
  }
}

export function HolatProvider({ men, children }: { men: Men; children: ReactNode }) {
  const [biznes, setBiznes] = useState(men.biznes);
  const [hisoblar, setHisoblar] = useState<Hisob[]>([]);
  const [turkumlar, setTurkumlar] = useState<Turkum[]>([]);
  const [klientlar, setKlientlar] = useState<Klient[]>([]);
  const [yozuvlar, setYozuvlar] = useState<Yozuv[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [xato, setXato] = useState<string | null>(null);

  const [natija, setNatija] = useState<SinxNatija | null>(null);
  const [sinxlanmoqda, setSinxlanmoqda] = useState(false);
  const [ziddiyatlar, setZiddiyatlar] = useState<Ziddiyat[]>([]);
  const [doimiy, setDoimiy] = useState(true);

  const omborRef = useRef<Ombor | null>(null);
  const serverRef = useRef<ReturnType<typeof supabaseServer> | null>(null);
  const ishlayapti = useRef(false);
  const turtkiTaymer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Mahalliy ombordan o'qish ----------
  const yangila = useCallback(async () => {
    if (!omborRef.current) return;
    try {
      const [h, t, k, y] = await Promise.all([
        hisoblarOl(),
        turkumlarOl(),
        klientlarOl(),
        yozuvlarOl(),
      ]);
      setHisoblar(h);
      setTurkumlar(t);
      setKlientlar(k);
      setYozuvlar(y);
      setZiddiyatlar(await omborRef.current.ziddiyatlar());
    } catch (e) {
      // Mahalliy ombordan o‘qib bo‘lmadi — ilova bo‘sh ko‘rinadi
      // va odam «yozuvlarim yo‘qoldi» deb o‘ylaydi.
      void xatoYoz('holat.yangila', e);
      setXato(xatoMatn(e));
    }
  }, []);

  // ---------- Sinxronizatsiya ----------
  const sinxlash = useCallback(async () => {
    const ombor = omborRef.current;
    const server = serverRef.current;
    if (!ombor || !server || ishlayapti.current) return;
    ishlayapti.current = true;
    setSinxlanmoqda(true);
    try {
      const n = await sinxronla(ombor, server);
      setNatija(n);
      // Xatoni EKRANGA chiqarmaymiz: internet yo'qligi normal holat,
      // uni belgi ko'rsatadi. Faqat mahalliy o'qish xatosi ko'rinadi.
      await yangila();
    } finally {
      ishlayapti.current = false;
      setSinxlanmoqda(false);
    }
  }, [yangila]);

  // Yozuvdan keyingi turtki — ketma-ket yozuvlarda bitta sinx bo'lsin
  const turtki = useCallback(() => {
    if (turtkiTaymer.current) clearTimeout(turtkiTaymer.current);
    turtkiTaymer.current = setTimeout(() => {
      sinxlash();
    }, 400);
  }, [sinxlash]);

  // ---------- Ochilish ----------
  useEffect(() => {
    let tirik = true;
    (async () => {
      const natija = await omborOch();
      if (!tirik) return;
      omborRef.current = natija.ombor;
      setDoimiy(natija.doimiy);
      omborniQoy(natija.ombor, turtki);
      serverRef.current = supabaseServer(await qurilmaId(), Platform.OS);

      // Avval MAHALLIY ma'lumot ko'rsatiladi — ilova darhol ochiladi
      await yangila();
      setYuklanmoqda(false);
      // Keyin server bilan tenglashtiriladi
      await sinxlash();
    })();
    return () => {
      tirik = false;
      if (turtkiTaymer.current) clearTimeout(turtkiTaymer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Davriy va fonga qaytgandagi sinx ----------
  useEffect(() => {
    const taymer = setInterval(() => sinxlash(), SINX_ORALIG);
    const obuna = AppState.addEventListener('change', (holat) => {
      if (holat === 'active') sinxlash();
    });
    return () => {
      clearInterval(taymer);
      obuna.remove();
    };
  }, [sinxlash]);

  const ziddiyatniYop = useCallback(async (id: string) => {
    await omborRef.current?.ziddiyatOchir(id);
    setZiddiyatlar((eski) => eski.filter((z) => z.id !== id));
  }, []);

  const qiymat = useMemo<Holat>(
    () => ({
      men: { ...men, biznes },
      hisoblar,
      turkumlar,
      klientlar,
      yozuvlar,
      yuklanmoqda,
      xato,
      sinxHolat: natija?.holat ?? (sinxlanmoqda ? 'navbatda' : 'sinxron'),
      sinxlanmoqda,
      navbatda: natija?.navbatda ?? 0,
      ziddiyatlar,
      doimiy,
      yangila,
      sinxlash,
      ziddiyatniYop,
      nomniQoy: setBiznes,
    }),
    [
      men, biznes, hisoblar, turkumlar, klientlar, yozuvlar, yuklanmoqda, xato,
      natija, sinxlanmoqda, ziddiyatlar, doimiy, yangila, sinxlash, ziddiyatniYop,
    ],
  );

  return <Kontekst.Provider value={qiymat}>{children}</Kontekst.Provider>;
}
