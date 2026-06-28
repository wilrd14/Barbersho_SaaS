import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function getByLocale(req: AuthRequest, res: Response) {
  const localeId = req.params.localeId;
  const { data, error } = await supabase.from('barbers').select('*').eq('locale_id', localeId).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function create(req: AuthRequest, res: Response) {
  const { locale_id, name, phone, specialties } = req.body;
  const { data, error } = await supabase.from('barbers').insert({
    locale_id, name, phone, specialties,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function update(req: AuthRequest, res: Response) {
  const { name, phone, specialties, is_active } = req.body;
  const { data, error } = await supabase.from('barbers').update({
    name, phone, specialties, is_active,
  }).eq('id', req.params.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function remove(req: AuthRequest, res: Response) {
  const { error } = await supabase.from('barbers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}
