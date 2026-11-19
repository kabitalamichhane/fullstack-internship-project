import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, string>) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('token')) return setLoading(false);
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const handle = (r: { token: string; user: User }) => {
    localStorage.setItem('token', r.token);
    setUser(r.user);
    return r.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: async (email, password) => handle(await api('/auth/login', { method: 'POST', json: { email, password } })),
        register: async (data) => handle(await api('/auth/register', { method: 'POST', json: data })),
        logout: async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          localStorage.removeItem('token');
          setUser(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
