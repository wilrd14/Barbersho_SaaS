const API_URL = '/api';

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error de conexión' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
