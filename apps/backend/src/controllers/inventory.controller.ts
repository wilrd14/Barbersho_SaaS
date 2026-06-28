import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function getByLocale(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('products').select('*').eq('locale_id', req.params.localeId).order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function create(req: AuthRequest, res: Response) {
  const { locale_id, name, description, price, stock, category } = req.body;
  const { data, error } = await supabase.from('products').insert({
    locale_id, name, description, price, stock, category,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function update(req: AuthRequest, res: Response) {
  const { name, description, price, stock, category } = req.body;
  const { data, error } = await supabase.from('products').update({
    name, description, price, stock, category,
  }).eq('id', req.params.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function remove(req: AuthRequest, res: Response) {
  const { error } = await supabase.from('products').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}
