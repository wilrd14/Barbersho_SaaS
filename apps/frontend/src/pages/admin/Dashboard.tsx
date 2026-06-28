import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Panel de Administración</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-700">
          Bienvenido, <strong>{user?.name}</strong>. Gestiona tu barbería.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg">Barberos</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">--</p>
          <p className="text-sm text-gray-500">Gestiona desde Barberos</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg">Citas Hoy</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">--</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-lg">Clientes Registrados</h3>
          <p className="text-3xl font-bold text-purple-600 mt-2">--</p>
        </div>
      </div>
    </div>
  );
}
