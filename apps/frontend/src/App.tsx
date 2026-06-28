import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import SuperuserDashboard from './pages/superuser/Dashboard';
import SuperuserLocales from './pages/superuser/Locales';
import AdminDashboard from './pages/admin/Dashboard';
import AdminBarbers from './pages/admin/Barbers';
import AdminServices from './pages/admin/Services';
import AdminInventory from './pages/admin/Inventory';
import ClientDashboard from './pages/client/Dashboard';
import ClientAppointments from './pages/client/Appointments';
import ClientBook from './pages/client/BookAppointment';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <RedirectByRole /> : <Login />} />
      <Route path="/register" element={user ? <RedirectByRole /> : <Register />} />

      <Route element={<ProtectedRoute role="superuser" />}>
        <Route element={<Layout />}>
          <Route path="/superuser" element={<SuperuserDashboard />} />
          <Route path="/superuser/locales" element={<SuperuserLocales />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<Layout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/barbers" element={<AdminBarbers />} />
          <Route path="/admin/services" element={<AdminServices />} />
          <Route path="/admin/inventory" element={<AdminInventory />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="client" />}>
        <Route element={<Layout />}>
          <Route path="/client" element={<ClientDashboard />} />
          <Route path="/client/appointments" element={<ClientAppointments />} />
          <Route path="/client/book" element={<ClientBook />} />
        </Route>
      </Route>

      <Route path="/" element={<RedirectByRole />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RedirectByRole() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'superuser') return <Navigate to="/superuser" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/client" replace />;
}
