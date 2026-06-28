import { useState, useEffect } from 'react';
import { Appointment } from '@barbershop/shared';
import { apiFetch } from '../../config/api';

export default function ClientAppointments() {
  const [appointments, setAppointments] = useState<(Appointment & { locale?: { name: string; address: string }; barber?: { name: string }; service?: { name: string; price: number } })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAppointments(); }, []);

  async function loadAppointments() {
    try {
      const data = await apiFetch<(Appointment & { locale?: { name: string; address: string }; barber?: { name: string }; service?: { name: string; price: number } })[]>('/appointments/mine');
      setAppointments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('¿Cancelar esta cita?')) return;
    try {
      await apiFetch(`/appointments/${id}/cancel`, { method: 'PUT' });
      loadAppointments();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const statusColors: Record<string, string> = {
    scheduled: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    completed: 'bg-gray-100 text-gray-800',
  };

  const statusLabels: Record<string, string> = {
    scheduled: 'Pendiente',
    confirmed: 'Confirmada',
    cancelled: 'Cancelada',
    completed: 'Completada',
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Cargando...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Mis Citas</h1>

      <div className="space-y-4">
        {appointments.map((apt) => (
          <div key={apt.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{apt.service?.name || 'Servicio'}</h3>
                <p className="text-sm text-gray-500">Con {apt.barber?.name || '--'}</p>
                <p className="text-sm text-gray-500">{apt.locale?.name} - {apt.locale?.address}</p>
                <p className="text-sm text-gray-600 mt-2">
                  📅 {apt.date} a las {apt.time}
                </p>
                {apt.notes && <p className="text-sm text-gray-400 mt-1">Notas: {apt.notes}</p>}
              </div>
              <div className="text-right">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColors[apt.status] || ''}`}>
                  {statusLabels[apt.status] || apt.status}
                </span>
                {apt.service?.price && (
                  <p className="text-sm font-semibold mt-2">${Number(apt.service.price).toFixed(2)}</p>
                )}
                {apt.status === 'scheduled' && (
                  <button onClick={() => handleCancel(apt.id)}
                    className="mt-2 text-sm text-red-600 hover:underline">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {appointments.length === 0 && (
          <div className="text-center py-12 text-gray-400">No tienes citas agendadas</div>
        )}
      </div>
    </div>
  );
}
