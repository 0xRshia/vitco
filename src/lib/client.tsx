'use client';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Bootstrap, CartLine } from './types';

export async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch('/api/' + path, {
    method,
    headers: body && !form ? { 'Content-Type': 'application/json' } : undefined,
    body: form ? body : body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal,
  }).catch(() => {
    throw new Error('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.');
  });
  const data = await response.json().catch(() => {
    throw new Error('پاسخ سرور قابل دریافت نبود. دوباره وضعیت درخواست را بررسی کنید.');
  });
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'ارتباط با سرور برقرار نشد.'), {
      status: response.status,
    });
  return data;
}
type Directory = NonNullable<Bootstrap['directory']>;
type ClientDirectory = Directory & { checkAt: number };
type ClientBootstrap = Omit<Bootstrap, 'directory'> & { directory?: ClientDirectory };
type DirectoryUpdate = { directory: Directory; cafes?: Bootstrap['cafes'] };
function receivedDirectory(directory: Directory): ClientDirectory {
  return { ...directory, checkAt: Date.now() + directory.refresh_after_ms };
}
type Context = {
  data: ClientBootstrap | null;
  updateDirectory: (previous: ClientDirectory, update: DirectoryUpdate) => void;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  cart: CartLine[];
  setCart: (lines: CartLine[]) => void;
  addCart: (line: CartLine) => boolean;
  toast: (message: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  revision: number;
};
const AppContext = createContext<Context | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ClientBootstrap | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [cart, setCartState] = useState<CartLine[]>([]),
    [message, setMessage] = useState(''),
    [theme, setThemeState] = useState('light'),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Bootstrap>('bootstrap');
      const directory = next.directory && receivedDirectory(next.directory);
      setData((current) => {
        // A slower bootstrap must not replace a directory that finished syncing meanwhile.
        if (
          current?.directory?.synced_at &&
          current.directory.synced_at > (directory?.synced_at ?? '')
        )
          return { ...next, directory: current.directory, cafes: current.cafes };
        return { ...next, directory };
      });
      setError('');
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت اطلاعات انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, []);
  const updateDirectory = useCallback((previous: ClientDirectory, update: DirectoryUpdate) => {
    const directory = receivedDirectory(update.directory);
    setData((current) =>
      current?.directory === previous
        ? { ...current, directory, cafes: update.cafes ?? current.cafes }
        : current,
    );
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
      localStorage.removeItem('vitrin-mode');
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
        updateDirectory,
        loading,
        error,
        refresh,
        cart,
        setCart,
        addCart,
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
export function useCafeDirectory() {
  const { data, updateDirectory } = useApp();
  const directory = data?.directory;
  useEffect(() => {
    if (!directory?.configured) return;
    const controller = new AbortController();
    let timer: number;
    let pending = false;
    async function check(previous: ClientDirectory) {
      pending = true;
      const query = new URLSearchParams({ since: previous.synced_at ?? '' });
      try {
        const update = await api<DirectoryUpdate>(
          'cafe-directory?' + query,
          'GET',
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) updateDirectory(previous, update);
      } catch {
        if (!controller.signal.aborted)
          updateDirectory(previous, {
            directory: {
              ...previous,
              status: previous.synced_at ? 'stale' : 'unavailable',
              refresh_after_ms: 60_000,
            },
          });
      }
    }
    function schedule() {
      window.clearTimeout(timer);
      if (!document.hidden && !pending && directory)
        timer = window.setTimeout(
          () => void check(directory),
          Math.max(0, directory.checkAt - Date.now()),
        );
    }
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [directory, updateDirectory]);
  return data;
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

export function useLiveResource<T>(path: string | null, interval = 5000) {
  const { revision } = useApp();
  const [result, setResult] = useState<{ path: string; data: T | null; error: string } | null>(
    null,
  );
  const [nonce, refresh] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true,
      pending = false;
    async function load() {
      if (!path || pending) return;
      pending = true;
      try {
        const data = await api<T>(path);
        if (active) setResult({ path, data, error: '' });
      } catch (error) {
        if (active) setResult({ path, data: null, error: (error as Error).message });
      } finally {
        pending = false;
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, interval);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [path, interval, nonce, revision]);
  const current = result?.path === path ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? '',
    loading: Boolean(path && !current),
    reload: () => refresh((n) => n + 1),
  };
}
