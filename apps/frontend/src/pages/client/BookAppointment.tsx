import { useState, useEffect, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Barber, Service } from '@barbershop/shared';
import { apiFetch } from '../../config/api';

export default function BookAppointment() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialLocaleId = (location.state as any)?.localeId || '';

  const [locales, setLocales] = useState<any[]>([]);
  const [localeId, setLocaleId] = useState(initialLocaleId);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiFetch<any[]>('/locales').then(setLocales).catch(() => {});
  }, []);

  useEffect(() => {
    if (localeId) {
      apiFetch<Barber[]>(`/barbers/locale/${localeId}`).then(d => setBarbers(d.filter(b => b.is_active !== false))).catch(() => {});
      apiFetch<Service[]>(`/services/locale/${localeId}`).then(d => setServices(d.filter(s => s.is_active !== false))).catch(() => {});
    }
  }, [localeId]);

  useEffect(() => {
    if (selectedBarber && selectedDate) {
      apiFetch<string[]>(`/appointments/slots/${selectedBarber}/${selectedDate}`)
        .then(setSlots).catch(() => setSlots([]));
    }
  }, [selectedBarber, selectedDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      await apiFetch('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          locale_id: localeId,
          barber_id: selectedBarber,
          service_id: selectedService,
          date: selectedDate,
          time: selectedTime,
          notes,
        }),
      });
      setMessage('Cita agendada exitosamente');
      setTimeout(() => navigate('/client/appointments'), 1500);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Agendar Cita</h1>

      {message && (
        <div className={`p-3 rounded mb-4 text-sm ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
          <select value={localeId} onChange={(e) => { setLocaleId(e.target.value); setSelectedBarber(''); setSelectedService(''); }}
            className="w-full px-3 py-2 border rounded" required>
            <option value="">Seleccionar local</option>
            {locales.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Barbero</label>
          <select value={selectedBarber} onChange={(e) => setSelectedBarber(e.target.value)}
            className="w-full px-3 py-2 border rounded" required>
            <option value="">Seleccionar barbero</option>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name} {b.specialties ? `- ${b.specialties}` : ''}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Servicio</label>
          <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}
            className="w-full px-3 py-2 border rounded" required>
            <option value="">Seleccionar servicio</option>
            {services.filter(s => s.barber_id === selectedBarber || !selectedBarber).map((s) => (
              <option key={s.id} value={s.id}>{s.name} - ${Number(s.price).toFixed(2)} ({s.duration_minutes} min)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 border rounded" required
            min={new Date().toISOString().split('T')[0]} />
        </div>

        {slots.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horario Disponible</label>
            <div className="grid grid-cols-4 gap-2">
              {slots.map((slot) => (
                <button key={slot} type="button"
                  onClick={() => setSelectedTime(slot)}
                  className={`px-3 py-2 border rounded text-sm ${selectedTime === slot ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border rounded" rows={2} />
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
          Confirmar Cita
        </button>
      </form>
    </div>
  );
}
