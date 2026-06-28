export type UserRole = 'superuser' | 'admin' | 'client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  locale_id?: string;
  created_at: string;
}

export interface Locale {
  id: string;
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  website: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface Barber {
  id: string;
  locale_id: string;
  name: string;
  phone: string;
  specialties: string;
  is_active: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  barber_id: string;
  locale_id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  locale_id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  locale_id: string;
  client_id: string;
  barber_id: string;
  service_id: string;
  date: string;
  time: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  notes: string;
  created_at: string;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  locale_id: string;
  phone: string;
  total_visits: number;
  last_visit: string;
  created_at: string;
}
