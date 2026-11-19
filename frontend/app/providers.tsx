'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  getTranslations,
  isSupportedLocale,
  type SupportedLocale,
  type TranslationStrings,
} from '@film-studio/localization';

interface LocaleContextValue {
  readonly locale: SupportedLocale;
  readonly setLocale: (locale: SupportedLocale) => void;
  readonly t: TranslationStrings;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  t: getTranslations(defaultLocale),
});

export interface UserSession {
  readonly userId: string;
  readonly sessionId: string;
  readonly email?: string;
  readonly deviceId?: string;
}

interface SessionContextValue {
  readonly session: UserSession | null;
  readonly loading: boolean;
  readonly refreshSession: () => Promise<void>;
  readonly setSession: (session: UserSession | null) => void;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  refreshSession: async () => {},
  setSession: () => {},
});

interface OfflineContextValue {
  readonly isOffline: boolean;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOffline: false,
});

export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(defaultLocale);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('film-studio.locale') : null;
    if (saved && isSupportedLocale(saved)) {
      setLocaleState(saved);
      document.documentElement.lang = saved;
    } else {
      document.documentElement.lang = defaultLocale;
    }
  }, []);

  const setLocale = (nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('film-studio.locale', nextLocale);
      document.documentElement.lang = nextLocale;
    }
  };

  const refreshSession = async () => {
    setLoadingSession(true);
    try {
      const response = await fetch('/v1/me/session', {
        headers: { accept: 'application/json' },
      });
      if (response.ok) {
        const data = (await response.json()) as UserSession;
        setSession(data);
      } else {
        setSession(null);
      }
    } catch {
      // Server unreachable or network error
      setSession(null);
    } finally {
      setLoadingSession(false);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!navigator.onLine);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, t: getTranslations(locale) }}
    >
      <SessionContext.Provider
        value={{
          session,
          loading: loadingSession,
          refreshSession,
          setSession,
        }}
      >
        <OfflineContext.Provider value={{ isOffline }}>
          {children}
        </OfflineContext.Provider>
      </SessionContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useSession() {
  return useContext(SessionContext);
}

export function useOffline() {
  return useContext(OfflineContext);
}

