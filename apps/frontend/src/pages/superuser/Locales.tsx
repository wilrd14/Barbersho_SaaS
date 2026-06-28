import { useState, useEffect, FormEvent } from 'react';
import { Locale } from '@barbershop/shared';
import { apiFetch } from '../../config/api';

export default function SuperuserLocales() {
  const [locales, setLocales] = useState<Locale[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '', whatsapp: '', website: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadLocales(); }, []);

  async function loadLocales() {
    const data = await apiFetch<Locale[]>('/locales');
    setLocales(data);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (editingId) {
      await apiFetch(`/locales/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiFetch('/locales', { method: 'POST', body: JSON.stringify(form) });
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', address: '', phone: '', whatsapp: '', website: '' });
    loadLocales();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este local?')) return;
    await apiFetch(`/locales/${id}`, { method: 'DELETE' });
    loadLocales();
  }

  function startEdit(locale: Locale) {
    setForm({ name: locale.name, address: locale.address, phone: locale.phone || '', whatsapp: locale.whatsapp || '', website: locale.website || '' });
    setEditingId(locale.id);
    setShowForm(true);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestión de Locales</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', address: '', phone: '', whatsapp: '', website: '' }); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancelar' : 'Nuevo Local'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Nombre del local" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded" required />
            <input placeholder="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="px-3 py-2 border rounded" required />
            <input placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border rounded" />
            <input placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="px-3 py-2 border rounded" />
            <input placeholder="Sitio web" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="px-3 py-2 border rounded" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            {editingId ? 'Actualizar' : 'Crear Local'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Nombre</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Dirección</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Teléfono</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">WhatsApp</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {locales.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{l.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{l.address}</td>
                <td className="px-4 py-3 text-sm">{l.phone}</td>
                <td className="px-4 py-3 text-sm">{l.whatsapp}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => startEdit(l)} className="text-blue-600 hover:underline text-sm">Editar</button>
                  <button onClick={() => handleDelete(l.id)} className="text-red-600 hover:underline text-sm">Eliminar</button>
                </td>
              </tr>
            ))}
            {locales.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No hay locales registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
