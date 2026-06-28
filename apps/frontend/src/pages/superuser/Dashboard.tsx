import { useAuth } from '../../contexts/AuthContext';

export default function SuperuserDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Panel Super Admin</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-700">
          Bienvenido, <strong>{user?.name}</strong>. Tienes acceso total al sistema.
        </p>
        <p className="text-gray-500 text-sm mt-2">
          Desde aquí puedes gestionar todos los locales, usuarios y configuración global del SaaS.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg">Locales Activos</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">--</p>
          <p className="text-sm text-gray-500">Gestiona desde Locales</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg">Usuarios Registrados</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">--</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg">Citas Totales</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">--</p>
        </div>
      </div>
    </div>
  );
}
