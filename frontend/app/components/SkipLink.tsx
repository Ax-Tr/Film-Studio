'use client';

import { useLocale } from '../providers';

export function SkipLink() {
  const { t } = useLocale();
  return (
    <a href="#main-content" className="skip-link">
      {t.app.skipToContent}
    </a>
  );
}

