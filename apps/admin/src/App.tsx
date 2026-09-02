import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import { NotogriManzil, YonalishEkrani } from './components/YonalishEkrani';
import { tenantYonalishlari } from './lib/yonalishlar';

// Sahifalar KERAK BO'LGANDA yuklanadi (lazy). Avval hammasi statik import
// qilinardi — natijada login ekranini ko'rish uchun ham butun ilova (~1 MB,
// xlsx kutubxonasi bilan birga) yuklanishi kerak edi va kirish sekin edi.
// Login sahifasi ataylab statik qoldi — u eng birinchi kerak bo'ladi.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const PosSotuv = lazy(() => import('./pages/PosSotuv'));
const Maosh = lazy(() => import('./pages/Maosh'));
const DesignOrders = lazy(() => import('./pages/DesignOrders'));
const Products = lazy(() => import('./pages/Products'));
const ProductImport = lazy(() => import('./pages/ProductImport'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerNew = lazy(() => import('./pages/CustomerNew'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const Finance = lazy(() => import('./pages/Finance'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const SuperAdminPanel = lazy(() => import('./pages/SuperAdminPanel'));
const Managers = lazy(() => import('./pages/Managers'));
const ManagerApp = lazy(() => import('./components/ManagerApp'));
const SkladKabinet = lazy(() => import('./pages/SkladKabinet'));

function Yuklanmoqda() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center text-gray-400">
      Yuklanmoqda...
    </div>
  );
}

// Rolni brauzerda saqlab turamiz — qayta kirganda "Tekshirilmoqda..." ekranida
// so'rov tugashini kutib o'tirmaslik uchun. Bu FAQAT ko'rinish tezligi uchun:
// haqiqiy ruxsat baribir serverda RLS bilan tekshiriladi, shuning uchun bu
// qiymatni o'zgartirib qo'yish hech kimga ortiqcha huquq bermaydi.
const ROLE_KEY = 'ilova.role';
const YONALISH_KEY = 'ilova.yonalish';

// ---------------------------------------------------------------------------
// MANZILLAR
//
// Ikkala domen bitta fayldan yuklanadi (Caddy'da bitta blok), lekin ular
// ikki xil ish uchun:
//   4020.yukchibolla.com  — super admin konsoli (faqat super admin)
//   admin.yukchibolla.com — tenantlar paneli
//
// Boshqa manzillar (localhost, IP, sinov domeni) cheklanmaydi: aks holda
// dasturchi kompyuterida panel umuman ochilmasdi.
//
// Bu AJRATISH, himoya emas. Himoya bazada: tenant admin super admin
// funksiyalarini chaqira olmaydi, super admin ma'lumotlari RLS bilan yopiq.
// ---------------------------------------------------------------------------
const SUPER_HOST = '4020.yukchibolla.com';
const TENANT_HOST = 'admin.yukchibolla.com';

const host = typeof location !== 'undefined' ? location.hostname : '';
const superManzil = host === SUPER_HOST;
const tenantManzil = host === TENANT_HOST;

function keshdanRol(userId: string): string | null {
  try {
    const xom = localStorage.getItem(ROLE_KEY);
    if (!xom) return null;
    const { id, role } = JSON.parse(xom);
    return id === userId ? role : null;
  } catch {
    return null;
  }
}

type Sklad = { warehouse_id: string; sklad: string; full_name?: string | null };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  // Sklad xodimi: undefined = hali tekshirilmadi, null = sklad emas
  const [sklad, setSklad] = useState<Sklad | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  // Tenantga berilgan tizimlar: undefined = hali so'ralmadi
  const [yonalishlar, setYonalishlar] = useState<string[] | undefined>(undefined);
  // Hozir ochilgan tizim. Sessiya xotirasida: F5 bosilganda joyida qoladi,
  // qayta kirganda esa tanlash ekrani chiqadi.
  const [yonalish, setYonalishXom] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(YONALISH_KEY);
    } catch {
      return null;
    }
  });
  const navigate = useNavigate();

  function setYonalish(k: string | null) {
    setYonalishXom(k);
    try {
      if (k) sessionStorage.setItem(YONALISH_KEY, k);
      else sessionStorage.removeItem(YONALISH_KEY);
    } catch {
      /* shaxsiy oyna — eslab qolmasa ham panel ishlayveradi */
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Sklad xodimi TENANT EMAS: uning profiles yozuvi yo'q, shuning uchun
  // rolni tekshirishdan OLDIN aniqlanadi. Aks holda pastdagi tekshiruv
  // uni "roli yo'q" deb tizimdan chiqarib yuborardi.
  useEffect(() => {
    if (!session) {
      setSklad(null);
      return;
    }
    setSklad(undefined);
    supabase.rpc('dori_sklad_men').then(({ data }) => {
      setSklad((data as Sklad) ?? null);
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      setRole(null);
      localStorage.removeItem(ROLE_KEY);
      return;
    }
    // Sklad xodimi ekani aniqlangan bo'lsa - profil so'ralmaydi
    if (sklad) return;
    if (sklad === undefined) return;

    // Kesh bo'lsa panelni darhol ko'rsatamiz, so'rov fonda ketaveradi
    const kesh = keshdanRol(session.user.id);
    if (kesh) setRole(kesh);

    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        const r = (data as any)?.role ?? null;
        setRole(r);
        // Mijoz admin panelga kira olmaydi
        if (r !== 'admin' && r !== 'super_admin' && r !== 'manager') {
          localStorage.removeItem(ROLE_KEY);
          supabase.auth.signOut();
        } else {
          localStorage.setItem(ROLE_KEY, JSON.stringify({ id: session.user.id, role: r }));
        }
      });
  }, [session, sklad]);

  // Tenantga berilgan tizimlar. Super admin va sklad xodimiga kerak emas —
  // ular boshqa ekranlarda ishlaydi.
  useEffect(() => {
    if (!session || sklad || role === 'super_admin' || role === 'manager') {
      setYonalishlar([]);
      return;
    }
    if (!role) return;
    supabase.rpc('org_yonalishlarim').then(({ data }) => {
      // So'rov muvaffaqiyatsiz bo'lsa panel butunlay yopilib qolmasin:
      // eng kam huquq bilan ochamiz, ro'yxat bo'sh ko'rinadi va odam
      // administratorga murojaat qiladi.
      setYonalishlar((data as string[] | null) ?? []);
    });
  }, [session, sklad, role]);

  if (!ready) return null;

  if (!session) return <Login />;

  if (sklad === undefined) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Tekshirilmoqda...
      </div>
    );
  }

  // Sklad xodimi o'z kabinetini ko'radi — admin panelga umuman kirmaydi
  if (sklad) {
    return (
      <Suspense fallback={<Yuklanmoqda />}>
        <SkladKabinet sklad={sklad} />
      </Suspense>
    );
  }

  if (role == null) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Tekshirilmoqda...
      </div>
    );
  }

  if (role === 'super_admin') {
    // Super admin konsoli tenantlar manzilida ochilmaydi — u yer tenantlar
    // uchun. Boshqa manzillarda (localhost) cheklov yo'q.
    if (tenantManzil) {
      return (
        <NotogriManzil
          kerakli={SUPER_HOST}
          nima="Super admin konsoli boshqa manzilda. Bu manzil tenantlar paneli uchun."
        />
      );
    }
    return (
      <Suspense fallback={<Yuklanmoqda />}>
        <SuperAdminPanel />
      </Suspense>
    );
  }

  // Super admin bo'lmagan hech kim 4020 da ishlamaydi
  if (superManzil) {
    return (
      <NotogriManzil
        kerakli={TENANT_HOST}
        nima="Bu manzil faqat super admin uchun. Sizning panelingiz boshqa manzilda."
      />
    );
  }

  // Menejer — to'liq admin panelga emas, faqat o'z narxlarini
  // ko'radigan/qo'yadigan cheklangan sahifaga kiradi
  if (role === 'manager') {
    return (
      <Suspense fallback={<Yuklanmoqda />}>
        <ManagerApp />
      </Suspense>
    );
  }

  // ---- Tenant: qaysi tizim(lar) berilgan ----
  if (yonalishlar === undefined) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Tekshirilmoqda...
      </div>
    );
  }

  const berilgan = tenantYonalishlari(yonalishlar);
  const joriy = berilgan.find((y) => y.key === yonalish) ?? null;

  // Ishlaydigan yo'nalish bitta bo'lsa tanlash ekrani ortiqcha —
  // to'g'ridan-to'g'ri o'sha tizim ochiladi.
  const ishlaydigan = berilgan.filter((y) => y.modullar.length > 0);
  const yagona = ishlaydigan.length === 1 && berilgan.length === 1 ? ishlaydigan[0] : null;
  const ochiq = joriy ?? yagona;

  if (!ochiq) {
    return (
      <YonalishEkrani
        yonalishlar={berilgan}
        onTanla={(y) => {
          setYonalish(y.key);
          // Tanlangan tizimning birinchi sahifasiga o'tamiz: aks holda
          // manzil oldingi tizimning sahifasida qolib ketardi.
          if (y.modullar[0]) navigate(y.modullar[0].to);
        }}
      />
    );
  }

  return (
    <Layout
      role={role}
      yonalish={ochiq}
      koproqYonalish={berilgan.length > 1}
      onYonalishlar={() => setYonalish(null)}
    >
      <Suspense fallback={<Yuklanmoqda />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<PosSotuv />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/design-orders" element={<DesignOrders />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/import" element={<ProductImport />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<CustomerNew />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/managers" element={<Managers />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/maosh" element={<Maosh />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
