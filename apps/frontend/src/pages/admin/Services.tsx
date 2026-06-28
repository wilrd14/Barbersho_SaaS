import { useState, useEffect, FormEvent } from 'react';
import { Service, Barber } from '@barbershop/shared';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../config/api';

export default function AdminServices() {
  const { user } = useAuth();
  const [services, setServices] = useState<(Service & { barbers?: { name: string } })[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ barber_id: '', name: '', description: '', price: '', duration_minutes: '30' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    if (!user?.locale_id) return;
    const [s, b] = await Promise.all([
      apiFetch<(Service & { barbers?: { name: string } })[]>(`/services/locale/${user.locale_id}`),
      apiFetch<Barber[]>(`/barbers/locale/${user.locale_id}`),
    ]);
    setServices(s);
    setBarbers(b);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, price: parseFloat(form.price), duration_minutes: parseInt(form.duration_minutes), locale_id: user?.locale_id };
    if (editingId) {
      await apiFetch(`/services/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiFetch('/services', { method: 'POST', body: JSON.stringify(body) });
    }
    setShowForm(false); setEditingId(null);
    setForm({ barber_id: '', name: '', description: '', price: '', duration_minutes: '30' });
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este servicio?')) return;
    await apiFetch(`/services/${id}`, { method: 'DELETE' });
    loadData();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Servicios</h1>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg">{showForm ? 'Cancelar' : 'Nuevo Servicio'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <select value={form.barber_id} onChange={(e) => setForm({ ...form, barber_id: e.target.value })}
              className="px-3 py-2 border rounded" required>
              <option value="">Seleccionar barbero</option>
              {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input placeholder="Nombre del servicio" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded" required />
            <input placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="px-3 py-2 border rounded col-span-2" />
            <input type="number" placeholder="Precio" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="px-3 py-2 border rounded" required />
            <input type="number" placeholder="Duración (min)" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="px-3 py-2 border rounded" required />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Actualizar' : 'Crear'}</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Barbero</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Servicio</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Precio</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Duración</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {services.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{s.barbers?.name || '--'}</td>
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3">${Number(s.price).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm">{s.duration_minutes} min</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:underline text-sm">Eliminar</button>
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No hay servicios registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
