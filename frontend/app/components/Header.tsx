'use client';

import Link from 'next/link';
import { supportedLocales, type SupportedLocale } from '@film-studio/localization';
import { useLocale, useSession } from '../providers';

const localeLabels: Record<SupportedLocale, string> = {
  te: 'తెలుగు (Telugu)',
  en: 'English',
  hi: 'हिन्दी (Hindi)',
  ta: 'தமிழ் (Tamil)',
  kn: 'ಕನ್ನಡ (Kannada)',
  ml: 'മലയാളം (Malayalam)',
  bn: 'বাংলা (Bengali)',
  mr: 'मराठी (Marathi)',
};

export function Header() {
  const { locale, setLocale, t } = useLocale();
  const { session, loading } = useSession();

  return (
    <header role="banner" className="app-header">
      <div className="header-inner">
        <div className="header-left">
          <Link href="/" className="logo-link" aria-label={t.app.title}>
            <span className="logo-symbol" aria-hidden="true">🎬</span>
            <span className="logo-text">{t.app.title}</span>
          </Link>
          <nav className="header-nav" aria-label="Main Navigation">
            <Link href="/" className="header-nav-link">
              {t.projects.title}
            </Link>
            <Link href="/admin" className="header-nav-link">
              Admin
            </Link>
            <Link href="/support" className="header-nav-link">
              Diagnostics
            </Link>
          </nav>
        </div>

        <div className="header-actions">
          <div className="locale-selector">
            <label htmlFor="locale-select" className="sr-only">
              {t.documents.language}
            </label>
            <select
              id="locale-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as SupportedLocale)}
              className="locale-select"
            >
              {supportedLocales.map((loc) => (
                <option key={loc} value={loc}>
                  {localeLabels[loc]}
                </option>
              ))}
            </select>
          </div>

          <div className="auth-status">
            {loading ? (
              <span className="session-loading" aria-busy="true">...</span>
            ) : session ? (
              <div className="session-info">
                <span className="session-user">
                  {session.email ?? session.userId.slice(0, 8)}
                </span>
                <a href="/v1/auth/web/logout" className="btn btn-secondary btn-sm">
                  {t.auth.signOut}
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <a href="/v1/auth/demo" className="btn btn-primary btn-sm">
                  ⚡ {t.auth.signIn}
                </a>
                <a href="/v1/auth/web/start" className="btn btn-secondary btn-sm">
                  Google
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

