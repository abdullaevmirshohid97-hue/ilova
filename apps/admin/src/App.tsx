import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import DesignOrders from './pages/DesignOrders';
import Products from './pages/Products';
import ProductImport from './pages/ProductImport';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import CustomerNew from './pages/CustomerNew';
import CustomerDetail from './pages/CustomerDetail';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SuperAdminPanel from './pages/SuperAdminPanel';
import Managers from './pages/Managers';
import ManagerApp from './components/ManagerApp';

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
      return;
    }
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        const r = (data as any)?.role ?? null;
        setRole(r);
        // Mijoz admin panelga kira olmaydi
        if (r !== 'admin' && r !== 'super_admin' && r !== 'manager') supabase.auth.signOut();
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
    return <SuperAdminPanel />;
  }

  // Menejer — to'liq admin panelga emas, faqat o'z narxlarini
  // ko'radigan/qo'yadigan cheklangan sahifaga kiradi
  if (role === 'manager') {
    return <ManagerApp />;
  }

  return (
    <Layout role={role}>
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
    </Layout>
  );
}
