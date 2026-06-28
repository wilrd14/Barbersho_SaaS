import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

export async function getByLocale(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('client_profiles')
    .select(`*, user:user_id (name, email)`)
    .eq('locale_id', req.params.localeId)
    .order('last_visit', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function getProfile(req: AuthRequest, res: Response) {
  const { data, error } = await supabase.from('client_profiles')
    .select(`*`)
    .eq('user_id', req.user!.id)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}

export async function createProfile(req: AuthRequest, res: Response) {
  const { locale_id, phone } = req.body;
  const { data, error } = await supabase.from('client_profiles').insert({
    user_id: req.user!.id, locale_id, phone,
  }).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
}

export async function updateLastVisit(req: AuthRequest, res: Response) {
  const { data: profile } = await supabase.from('client_profiles')
    .select('*').eq('user_id', req.user!.id).eq('locale_id', req.params.localeId).single();

  if (!profile) return res.status(404).json({ error: 'Perfil no encontrado' });

  const { data, error } = await supabase.from('client_profiles').update({
    total_visits: (profile.total_visits || 0) + 1,
    last_visit: new Date().toISOString(),
  }).eq('id', profile.id).select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
}
