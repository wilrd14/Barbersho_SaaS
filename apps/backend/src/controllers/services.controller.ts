import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function getByBarber(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('services').select('*').eq('barber_id', req.params.barberId).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function getByLocale(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('services').select(`
    *,
    barbers (name)
  `).eq('locale_id', req.params.localeId).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function create(req: AuthRequest, res: Response) {
  const { barber_id, locale_id, name, description, price, duration_minutes } = req.body;
  const { data, error } = await supabase.from('services').insert({
    barber_id, locale_id, name, description, price, duration_minutes,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function update(req: AuthRequest, res: Response) {
  const { name, description, price, duration_minutes, is_active } = req.body;
  const { data, error } = await supabase.from('services').update({
    name, description, price, duration_minutes, is_active,
  }).eq('id', req.params.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function remove(req: AuthRequest, res: Response) {
  const { error } = await supabase.from('services').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}
