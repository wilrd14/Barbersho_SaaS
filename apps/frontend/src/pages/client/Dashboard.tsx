import { useState, useEffect } from 'react';
import { Locale } from '@barbershop/shared';
import { apiFetch } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

export default function ClientDashboard() {
  const { user } = useAuth();
  const [locales, setLocales] = useState<Locale[]>([]);

  useEffect(() => {
    apiFetch<Locale[]>('/locales').then(setLocales).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Bienvenido, {user?.name}</h1>
      <p className="text-gray-500 mb-6">Agenda tu cita en la barbería de tu preferencia</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {locales.filter(l => l.is_active !== false).map((locale) => (
          <div key={locale.id} className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-lg">{locale.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{locale.address}</p>
            {locale.phone && <p className="text-sm text-gray-500">📞 {locale.phone}</p>}
            <div className="mt-4 space-x-2">
              <Link
                to="/client/book"
                state={{ localeId: locale.id }}
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
              >
                Agendar Cita
              </Link>
              {locale.whatsapp && (
                <a
                  href={`https://wa.me/${locale.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        ))}
        {locales.length === 0 && (
          <p className="text-gray-400 col-span-full text-center py-12">No hay locales disponibles</p>
        )}
      </div>
    </div>
  );
}
