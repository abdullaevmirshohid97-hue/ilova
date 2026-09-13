// =============================================================
//  UMUMIY HOLAT — ma'lumot bitta joyda turadi
//
//  Har ekran o'zi so'rov qilsa, bir xil ma'lumot besh joyda besh xil
//  bo'lib qoladi: bosh ekranda balans yangi, kalendarda eski. Shuning
//  uchun hisoblar/turkumlar/klientlar/yozuvlar SHU YERDA turadi va
//  har o'zgarishdan keyin bir marta qayta o'qiladi.
//
//  2-bosqichda (offline) aynan shu fayl mahalliy bazaga ulanadi —
//  ekranlar o'zgarmaydi.
// =============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Hisob, Klient, Turkum, Yozuv } from '@ilova/kassa-yadro';
import {
  hisoblarOl,
  klientlarOl,
  turkumlarOl,
  yozuvlarOl,
  type Men,
} from './baza';
import { xatoMatn } from './supabase';

type Holat = {
  men: Men;
  hisoblar: Hisob[];
  turkumlar: Turkum[];
  klientlar: Klient[];
  yozuvlar: Yozuv[];
  yuklanmoqda: boolean;
  xato: string | null;
  yangila: () => Promise<void>;
  /** Faqat biznes nomini almashtirish — butun ro'yxatni qayta o'qimasdan */
  nomniQoy: (nom: string) => void;
};

const Kontekst = createContext<Holat | null>(null);

export function useHolat(): Holat {
  const h = useContext(Kontekst);
  if (!h) throw new Error('HolatProvider ichida ishlatilishi kerak');
  return h;
}

export function HolatProvider({ men, children }: { men: Men; children: ReactNode }) {
  const [biznes, setBiznes] = useState(men.biznes);
  const [hisoblar, setHisoblar] = useState<Hisob[]>([]);
  const [turkumlar, setTurkumlar] = useState<Turkum[]>([]);
  const [klientlar, setKlientlar] = useState<Klient[]>([]);
  const [yozuvlar, setYozuvlar] = useState<Yozuv[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [xato, setXato] = useState<string | null>(null);

  const yangila = useCallback(async () => {
    try {
      setXato(null);
      // Parallel: ketma-ket so'ralsa sekin internetda ilova sezilarli
      // kechikib ochiladi.
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
    } catch (e) {
      setXato(xatoMatn(e));
    } finally {
      setYuklanmoqda(false);
    }
  }, []);

  useEffect(() => {
    yangila();
  }, [yangila]);

  const qiymat = useMemo<Holat>(
    () => ({
      men: { ...men, biznes },
      hisoblar,
      turkumlar,
      klientlar,
      yozuvlar,
      yuklanmoqda,
      xato,
      yangila,
      nomniQoy: setBiznes,
    }),
    [men, biznes, hisoblar, turkumlar, klientlar, yozuvlar, yuklanmoqda, xato, yangila],
  );

  return <Kontekst.Provider value={qiymat}>{children}</Kontekst.Provider>;
}
