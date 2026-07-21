import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Customers from './pages/Customers';
import CustomerNew from './pages/CustomerNew';
import CustomerDetail from './pages/CustomerDetail';
import Finance from './pages/Finance';

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
        if (r !== 'admin' && r !== 'super_admin') supabase.auth.signOut();
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

  return (
    <Layout role={role}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/products" element={<Products />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<CustomerNew />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
