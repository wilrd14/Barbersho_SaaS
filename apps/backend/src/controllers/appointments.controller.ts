import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function getByLocale(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('appointments')
    .select(`*, client:client_id (name, email), barber:barber_id (name), service:service_id (name, price)`)
    .eq('locale_id', req.params.localeId)
    .order('date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function getMyAppointments(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('appointments')
    .select(`*, locale:locale_id (name, address), barber:barber_id (name), service:service_id (name, price)`)
    .eq('client_id', req.user!.id)
    .order('date', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function create(req: AuthRequest, res: Response) {
  const { locale_id, barber_id, service_id, date, time, notes } = req.body;
  const { data, error } = await supabase.from('appointments').insert({
    locale_id,
    client_id: req.user!.id,
    barber_id,
    service_id,
    date,
    time,
    notes,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function cancel(req: AuthRequest, res: Response) {
  const { data: appointment } = await supabase.from('appointments')
    .select('*').eq('id', req.params.id).single();

  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada' });
  if (appointment.client_id !== req.user!.id && req.user!.role === 'client') {
    return res.status(403).json({ error: 'No puedes cancelar esta cita' });
  }

  const { data, error } = await supabase.from('appointments')
    .update({ status: 'cancelled' }).eq('id', req.params.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function updateStatus(req: AuthRequest, res: Response) {
  const { status } = req.body;
  const { data, error } = await supabase.from('appointments')
    .update({ status }).eq('id', req.params.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function getAvailableSlots(req: AuthRequest, res: Response) {
  const { barberId, date } = req.params;
  const { data: appointments } = await supabase.from('appointments')
    .select('time')
    .eq('barber_id', barberId)
    .eq('date', date)
    .neq('status', 'cancelled');

  const { data: services } = await supabase.from('services')
    .select('duration_minutes')
    .eq('barber_id', barberId);

  const busyTimes = (appointments || []).map(a => a.time);
  const avgDuration = services && services.length > 0
    ? Math.min(...services.map(s => s.duration_minutes))
    : 30;

  const slots: string[] = [];
  const startHour = 8;
  const endHour = 18;
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += avgDuration) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (!busyTimes.includes(time)) {
        slots.push(time);
      }
    }
  }

  res.json(slots);
}
