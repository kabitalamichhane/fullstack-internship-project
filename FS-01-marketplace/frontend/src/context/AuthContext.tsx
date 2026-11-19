import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Cart, User } from '../types';

type AuthState = {
  user: User | null;
  loading: boolean;
  cartCount: number;
  login: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, string>) => Promise<User>;
  logout: () => Promise<void>;
  refreshCart: () => Promise<void>;
};

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async () => {
    if (!localStorage.getItem('token')) return setCartCount(0);
    try {
      const cart = await api<Cart>('/cart');
      setCartCount(cart.itemCount);
    } catch {
      setCartCount(0);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('token')) return setLoading(false);
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === 'CUSTOMER') refreshCart();
  }, [user, refreshCart]);

  const handleAuth = (r: { token: string; user: User }) => {
    localStorage.setItem('token', r.token);
    setUser(r.user);
    return r.user;
  };

  const value: AuthState = {
    user,
    loading,
    cartCount,
    refreshCart,
    login: async (email, password) => handleAuth(await api('/auth/login', { method: 'POST', json: { email, password } })),
    register: async (data) => handleAuth(await api('/auth/register', { method: 'POST', json: data })),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      localStorage.removeItem('token');
      setUser(null);
      setCartCount(0);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
