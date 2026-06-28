import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@barbershop/shared';

interface Props {
  role: UserRole;
}

export default function ProtectedRoute({ role }: Props) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    const redirect = user.role === 'superuser' ? '/superuser' : user.role === 'admin' ? '/admin' : '/client';
    return <Navigate to={redirect} replace />;
  }

  return <Outlet />;
}
