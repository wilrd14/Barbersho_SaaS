import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function getAll(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('locales').select('*').order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function getById(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('locales').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Local no encontrado' });
  res.json(data);
}

export async function create(req: AuthRequest, res: Response) {
  const { name, address, phone, whatsapp, website } = req.body;
  const { data, error } = await supabase.from('locales').insert({
    name,
    address,
    phone,
    whatsapp,
    website,
    created_by: req.user!.id,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function update(req: AuthRequest, res: Response) {
  const { name, address, phone, whatsapp, website, is_active } = req.body;
  const { data, error } = await supabase.from('locales').update({
    name, address, phone, whatsapp, website, is_active,
  }).eq('id', req.params.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function remove(req: AuthRequest, res: Response) {
  const { error } = await supabase.from('locales').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}
