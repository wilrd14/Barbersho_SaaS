import { useState, useEffect, FormEvent } from 'react';
import { Barber } from '@barbershop/shared';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../config/api';

export default function AdminBarbers() {
  const { user } = useAuth();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', specialties: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadBarbers(); }, []);

  async function loadBarbers() {
    if (!user?.locale_id) return;
    const data = await apiFetch<Barber[]>(`/barbers/locale/${user.locale_id}`);
    setBarbers(data);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, locale_id: user?.locale_id };
    if (editingId) {
      await apiFetch(`/barbers/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiFetch('/barbers', { method: 'POST', body: JSON.stringify(body) });
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', phone: '', specialties: '' });
    loadBarbers();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este barbero?')) return;
    await apiFetch(`/barbers/${id}`, { method: 'DELETE' });
    loadBarbers();
  }

  function startEdit(barber: Barber) {
    setForm({ name: barber.name, phone: barber.phone || '', specialties: barber.specialties || '' });
    setEditingId(barber.id);
    setShowForm(true);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Barberos</h1>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', phone: '', specialties: '' }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg">{showForm ? 'Cancelar' : 'Agregar Barbero'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Nombre del barbero" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded" required />
            <input placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border rounded" />
            <input placeholder="Especialidades" value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} className="px-3 py-2 border rounded col-span-2" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Actualizar' : 'Agregar'}</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Nombre</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Teléfono</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Especialidades</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {barbers.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{b.name}</td>
                <td className="px-4 py-3 text-sm">{b.phone}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{b.specialties}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => startEdit(b)} className="text-blue-600 hover:underline text-sm">Editar</button>
                  <button onClick={() => handleDelete(b.id)} className="text-red-600 hover:underline text-sm">Eliminar</button>
                </td>
              </tr>
            ))}
            {barbers.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">No hay barberos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
