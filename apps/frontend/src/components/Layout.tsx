import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const roleLinks = {
    superuser: [
      { to: '/superuser', label: 'Dashboard' },
      { to: '/superuser/locales', label: 'Locales' },
    ],
    admin: [
      { to: '/admin', label: 'Dashboard' },
      { to: '/admin/barbers', label: 'Barberos' },
      { to: '/admin/services', label: 'Servicios' },
      { to: '/admin/inventory', label: 'Inventario' },
    ],
    client: [
      { to: '/client', label: 'Inicio' },
      { to: '/client/book', label: 'Agendar Cita' },
      { to: '/client/appointments', label: 'Mis Citas' },
    ],
  };

  const links = roleLinks[user?.role as keyof typeof roleLinks] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <span className="text-xl font-bold text-blue-600">BarberPro</span>
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">{user?.name}</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                {user?.role === 'superuser' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Cliente'}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
