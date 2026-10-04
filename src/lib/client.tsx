'use client';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Bootstrap, CartLine } from './types';

export async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch('/api/' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'ارتباط با سرور برقرار نشد.');
  return data;
}
type Context = {
  data: Bootstrap | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  addCart: (line: CartLine) => boolean;
  mode: 'delivery' | 'pickup';
  setMode: (mode: 'delivery' | 'pickup') => void;
  toast: (message: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  revision: number;
};
const AppContext = createContext<Context | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [cart, setCartState] = useState<CartLine[]>([]),
    [mode, setModeState] = useState<'delivery' | 'pickup'>('pickup'),
    [message, setMessage] = useState(''),
    [theme, setThemeState] = useState('light'),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Bootstrap>('bootstrap');
      setData(next);
      setError('');
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت اطلاعات انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    try {
      const saved = JSON.parse(localStorage.getItem('vitrin-cart') || '[]');
      if (Array.isArray(saved))
        setCartState(
          saved.filter(
            (i) =>
              i &&
              typeof i.key === 'string' &&
              typeof i.product_id === 'string' &&
              typeof i.cafe_id === 'string' &&
              typeof i.name === 'string' &&
              typeof i.size_id === 'string' &&
              typeof i.note === 'string' &&
              Array.isArray(i.addon_ids) &&
              i.addon_ids.every((value: unknown) => typeof value === 'string') &&
              Array.isArray(i.option_names) &&
              i.option_names.every((value: unknown) => typeof value === 'string') &&
              Number.isSafeInteger(i.price) &&
              i.price >= 0 &&
              Number.isInteger(i.quantity) &&
              i.quantity > 0 &&
              i.quantity <= 20,
          ),
        );
      const t = localStorage.getItem('vitrin-theme') === 'dark' ? 'dark' : 'light';
      setThemeState(t);
      document.documentElement.dataset.theme = t;
      setModeState(localStorage.getItem('vitrin-mode') === 'delivery' ? 'delivery' : 'pickup');
    } catch {
      /* Corrupt browser storage never affects server-side data. */
    }
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  const setCart = useCallback((lines: CartLine[]) => {
    setCartState(lines);
    try {
      localStorage.setItem('vitrin-cart', JSON.stringify(lines));
    } catch {
      setMessage('ذخیره سبد در این مرورگر ممکن نیست.');
    }
  }, []);
  const addCart = (line: CartLine) => {
    if (cart.length && cart[0].cafe_id !== line.cafe_id) return false;
    const existing = cart.find(
      (i) =>
        i.product_id === line.product_id &&
        i.size_id === line.size_id &&
        JSON.stringify([...i.addon_ids].sort()) === JSON.stringify([...line.addon_ids].sort()) &&
        i.note === line.note,
    );
    if (existing) {
      if (existing.quantity + line.quantity > 20) {
        setMessage('حداکثر تعداد هر محصول بیست عدد است.');
        return false;
      }
      setCart(
        cart.map((i) =>
          i.key === existing.key ? { ...i, quantity: i.quantity + line.quantity } : i,
        ),
      );
    } else setCart([...cart, line]);
    setMessage('به سبد خرید اضافه شد.');
    return true;
  };
  const setMode = (value: 'delivery' | 'pickup') => {
    setModeState(value);
    try {
      localStorage.setItem('vitrin-mode', value);
    } catch {}
  };
  const setTheme = (value: string) => {
    setThemeState(value);
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem('vitrin-theme', value);
    } catch {}
  };
  return (
    <AppContext.Provider
      value={{
        data,
        loading,
        error,
        refresh,
        cart,
        setCart,
        addCart,
        mode,
        setMode,
        toast: setMessage,
        theme,
        setTheme,
        revision,
      }}
    >
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </AppContext.Provider>
  );
}
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('Provider required');
  return value;
}
export function useResource<T>(path: string | null) {
  const { revision } = useApp();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(Boolean(path)),
    [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    api<T>(path)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision, nonce]);
  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}
