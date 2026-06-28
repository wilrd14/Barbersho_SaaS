import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export async function register(req: AuthRequest, res: Response) {
  const { email, password, name, role, locale_id } = req.body;

  const { data: authUser, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) return res.status(400).json({ error: authError.message });

  if (!authUser.user) return res.status(500).json({ error: 'Error al crear usuario' });

  const { error: dbError } = await supabase.from('users').insert({
    id: authUser.user.id,
    email,
    name,
    role: role || 'client',
    locale_id: locale_id || null,
  });

  if (dbError) return res.status(400).json({ error: dbError.message });

  const token = jwt.sign(
    { id: authUser.user.id, email, role: role || 'client', locale_id: locale_id || null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({ token, user: { id: authUser.user.id, email, name, role: role || 'client', locale_id } });
}

export async function login(req: AuthRequest, res: Response) {
  const { email, password } = req.body;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) return res.status(401).json({ error: 'Credenciales inválidas' });

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (!userData) return res.status(404).json({ error: 'Usuario no encontrado' });

  const token = jwt.sign(
    { id: userData.id, email: userData.email, role: userData.role, locale_id: userData.locale_id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: userData });
}

export async function me(req: AuthRequest, res: Response) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user!.id)
    .single();

  if (error) return res.status(404).json({ error: 'Usuario no encontrado' });

  res.json(user);
}
