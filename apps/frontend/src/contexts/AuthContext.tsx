import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@barbershop/shared';
import { apiFetch } from '../config/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: string;
  locale_id?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      apiFetch<User>('/auth/me')
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function register(data: RegisterData) {
    const res = await apiFetch<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
