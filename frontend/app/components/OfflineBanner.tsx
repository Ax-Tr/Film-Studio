'use client';

import { useOffline, useLocale } from '../providers';

export function OfflineBanner() {
  const { isOffline } = useOffline();
  const { t } = useLocale();

  if (!isOffline) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="offline-banner"
    >
      <span className="offline-icon" aria-hidden="true">⚡</span>
      <span>{t.app.offlineNotice}</span>
    </aside>
  );
}

