import { useState, useEffect, FormEvent } from 'react';
import { Product } from '@barbershop/shared';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../config/api';

export default function AdminInventory() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', price: '', stock: '0', category: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    if (!user?.locale_id) return;
    const data = await apiFetch<Product[]>(`/inventory/locale/${user.locale_id}`);
    setProducts(data);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, price: parseFloat(form.price), stock: parseInt(form.stock), locale_id: user?.locale_id };
    if (editingId) {
      await apiFetch(`/inventory/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiFetch('/inventory', { method: 'POST', body: JSON.stringify(body) });
    }
    setShowForm(false); setEditingId(null);
    setForm({ name: '', description: '', price: '', stock: '0', category: '' });
    loadProducts();
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este producto?')) return;
    await apiFetch(`/inventory/${id}`, { method: 'DELETE' });
    loadProducts();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <button onClick={() => { setShowForm(!showForm); setEditingId(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg">{showForm ? 'Cancelar' : 'Agregar Producto'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Nombre del producto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded" required />
            <input placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-3 py-2 border rounded" />
            <input placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="px-3 py-2 border rounded col-span-2" />
            <input type="number" step="0.01" placeholder="Precio" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="px-3 py-2 border rounded" required />
            <input type="number" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="px-3 py-2 border rounded" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">{editingId ? 'Actualizar' : 'Agregar'}</button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Producto</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Categoría</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Precio</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Stock</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">{p.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{p.category}</td>
                <td className="px-4 py-3">${Number(p.price).toFixed(2)}</td>
                <td className="px-4 py-3">{p.stock}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline text-sm">Eliminar</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No hay productos en inventario</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
