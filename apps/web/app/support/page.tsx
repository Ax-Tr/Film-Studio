'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useOffline } from '../providers';

interface SystemHealthReport {
  readonly status: 'healthy' | 'degraded';
  readonly apiLatencyMs: number | null;
  readonly storageQuotaMb: number | null;
  readonly storageUsageMb: number | null;
  readonly localDraftsCount: number;
  readonly online: boolean;
  readonly userAgent: string;
  readonly screenSize: string;
}

export default function SupportDiagnosticsPage() {
  const { t } = useLocale();
  const { isOffline } = useOffline();

  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [emergencySalvaging, setEmergencySalvaging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function inspectSystem() {
      try {
        setLoading(true);
        const startTime = performance.now();
        let apiOk = false;
        let latency: number | null = null;

        try {
          const res = await fetch('/health', { method: 'GET', headers: { accept: 'application/json' } });
          latency = Math.round(performance.now() - startTime);
          apiOk = res.ok;
        } catch {
          apiOk = false;
        }

        let quotaMb: number | null = null;
        let usageMb: number | null = null;
        if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
          try {
            const estimate = await navigator.storage.estimate();
            if (estimate.quota) quotaMb = Math.round(estimate.quota / (1024 * 1024));
            if (estimate.usage) usageMb = Math.round(estimate.usage / (1024 * 1024));
          } catch {
            // Storage quota estimate not permitted
          }
        }

        let draftCount = 0;
        if (typeof window !== 'undefined' && window.localStorage) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('film-studio-draft-') || key?.startsWith('film-studio-sync-')) {
              draftCount += 1;
            }
          }
        }

        if (active) {
          setHealth({
            status: apiOk && !isOffline ? 'healthy' : 'degraded',
            apiLatencyMs: latency,
            storageQuotaMb: quotaMb,
            storageUsageMb: usageMb,
            localDraftsCount: draftCount,
            online: !isOffline,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
            screenSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight} (${window.devicePixelRatio}x)` : 'Unknown',
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void inspectSystem();
    return () => {
      active = false;
    };
  }, [isOffline]);

  const handleDownloadDiagnostics = () => {
    setDownloading(true);
    try {
      const redactedDiagnostics = {
        generatedAt: new Date().toISOString(),
        releaseLine: '1.0.0-rc.1',
        gate: 'G2 (Professional Web Core)',
        privacyClassification: 'REDACTED_SYSTEM_METRICS_ONLY',
        system: {
          status: health?.status ?? 'unknown',
          apiLatencyMs: health?.apiLatencyMs,
          online: health?.online,
          storageQuotaMb: health?.storageQuotaMb,
          storageUsageMb: health?.storageUsageMb,
          localDraftsCount: health?.localDraftsCount,
          userAgent: health?.userAgent,
          screenSize: health?.screenSize,
        },
        redactionPolicy: {
          dialoguesRedacted: true,
          screenplayTextRedacted: true,
          tokensRedacted: true,
          passwordsRedacted: true,
        },
      };

      const blob = new Blob([JSON.stringify(redactedDiagnostics, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `film-studio-diagnostics-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage(t.support.redactedNotice);
    } finally {
      setDownloading(false);
    }
  };

  const handleEmergencyBackup = () => {
    setEmergencySalvaging(true);
    try {
      const dump: Record<string, unknown> = {};
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('film-studio-') || key.startsWith('offline-outbox-'))) {
            try {
              dump[key] = JSON.parse(localStorage.getItem(key) ?? 'null');
            } catch {
              dump[key] = localStorage.getItem(key);
            }
          }
        }
      }

      const backupPayload = {
        exportType: 'EMERGENCY_LOCAL_STORAGE_BACKUP',
        exportedAt: new Date().toISOString(),
        itemsCount: Object.keys(dump).length,
        data: dump,
      };

      const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `film-studio-emergency-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage('Emergency local backup downloaded successfully.');
    } finally {
      setEmergencySalvaging(false);
    }
  };

  return (
    <main className="container support-page" style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/"
          className="topbar-back-link"
          style={{ display: 'inline-block', marginBottom: '0.5rem' }}
        >
          ← {t.common.backToProjects}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
            {t.support.title}
          </h1>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: health?.status === 'healthy' ? '#22543d' : '#742a2a',
              color: health?.status === 'healthy' ? '#c6f6d5' : '#fed7d7',
            }}
          >
            {health?.status === 'healthy' ? `● ${t.support.statusHealthy}` : `▲ ${t.support.statusDegraded}`}
          </span>
        </div>
      </header>

      {message && (
        <aside
          role="status"
          style={{
            padding: '1rem',
            backgroundColor: '#1c4532',
            color: '#9ae6b4',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            fontWeight: 500,
          }}
        >
          ✓ {message}
        </aside>
      )}

      {loading ? (
        <p>{t.common.loading}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* System Health Card */}
          <section
            aria-label={t.support.systemHealth}
            style={{
              backgroundColor: '#151a23',
              border: '1px solid #2c3547',
              borderRadius: '10px',
              padding: '1.5rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem', color: '#f3b74f' }}>
              {t.support.systemHealth}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#aab3c2' }}>{t.support.releaseLine}</span>
                <p style={{ fontWeight: 600, margin: '0.2rem 0 0 0' }}>v1.0.0-rc.1 (Gate G2)</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#aab3c2' }}>API Ping Latency</span>
                <p style={{ fontWeight: 600, margin: '0.2rem 0 0 0' }}>
                  {health?.apiLatencyMs !== null ? `${health?.apiLatencyMs}ms` : 'Unreachable'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#aab3c2' }}>{t.support.storageQuota}</span>
                <p style={{ fontWeight: 600, margin: '0.2rem 0 0 0' }}>
                  {health && health.storageUsageMb !== null && health.storageQuotaMb !== null
                    ? `${health.storageUsageMb} MB / ${health.storageQuotaMb} MB`
                    : 'Unmetered'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#aab3c2' }}>Local Unsynced Drafts</span>
                <p style={{ fontWeight: 600, margin: '0.2rem 0 0 0' }}>
                  {health?.localDraftsCount ?? 0} saved
                </p>
              </div>
            </div>
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #2c3547', fontSize: '0.8rem', color: '#aab3c2' }}>
              <span>{t.support.browserInfo}: {health?.userAgent} ({health?.screenSize})</span>
            </div>
          </section>

          {/* Privacy & Diagnostics Download Card */}
          <section
            aria-label={t.support.diagnosticsDownload}
            style={{
              backgroundColor: '#151a23',
              border: '1px solid #2c3547',
              borderRadius: '10px',
              padding: '1.5rem',
            }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginTop: 0, marginBottom: '0.5rem' }}>
              {t.support.diagnosticsDownload}
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#aab3c2', marginBottom: '1.25rem' }}>
              {t.support.privacyNotice}
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleDownloadDiagnostics}
                disabled={downloading}
                className="btn btn-primary"
              >
                {downloading ? '...' : `📊 ${t.support.diagnosticsDownload} (.json)`}
              </button>
              <button
                type="button"
                onClick={handleEmergencyBackup}
                disabled={emergencySalvaging}
                className="btn btn-secondary"
              >
                {emergencySalvaging ? '...' : `🛡️ ${t.support.emergencyBackup} (.json)`}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
