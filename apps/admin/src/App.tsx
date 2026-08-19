import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';

// Sahifalar KERAK BO'LGANDA yuklanadi (lazy). Avval hammasi statik import
// qilinardi — natijada login ekranini ko'rish uchun ham butun ilova (~1 MB,
// xlsx kutubxonasi bilan birga) yuklanishi kerak edi va kirish sekin edi.
// Login sahifasi ataylab statik qoldi — u eng birinchi kerak bo'ladi.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      localStorage.removeItem(ROLE_KEY);
      return;
    }

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
  }, [session]);

  if (!ready) return null;

  if (!session) return <Login />;
  if (role == null) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Tekshirilmoqda...
      </div>
    );
  }

  if (role === 'super_admin') {
    return (
      <Suspense fallback={<Yuklanmoqda />}>
        <SuperAdminPanel />
      </Suspense>
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

  return (
    <Layout role={role}>
      <Suspense fallback={<Yuklanmoqda />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
