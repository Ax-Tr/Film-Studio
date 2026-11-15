'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ClientOperationDto, SyncConflictDto } from '@film-studio/contracts';
import { useLocale, useOffline, useSession } from '../../../providers';
import { WebSyncManager, type SyncStatus } from '../../../lib/sync-manager';

interface SyncPageProps {
  readonly params: Promise<{ readonly filmId: string }>;
}

export default function SyncCenterPage(props: SyncPageProps) {
  const { filmId } = use(props.params);
  const { t } = useLocale();
  const { isOffline } = useOffline();
  const { session } = useSession();

  const deviceId = session?.deviceId ?? '018f4ce4-f25b-7be7-834f-3705035f58c1';

  const syncManager = useMemo(
    () => new WebSyncManager(filmId, deviceId),
    [filmId, deviceId],
  );

  const [status, setStatus] = useState<SyncStatus>(() => syncManager.getStatus(isOffline));
  const [pendingOps, setPendingOps] = useState<readonly ClientOperationDto[]>([]);
  const [conflicts, setConflicts] = useState<readonly SyncConflictDto[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshState = useCallback(() => {
    setStatus(syncManager.getStatus(isOffline));
    setPendingOps(syncManager.getPending());
    setConflicts(syncManager.getConflicts());
  }, [syncManager, isOffline]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const handleSyncNow = async () => {
    if (isSyncing || isOffline) return;
    setIsSyncing(true);
    setNotice(null);
    try {
      const result = await syncManager.sync();
      refreshState();
      setNotice(
        `Sync complete: ${result.pushed} pushed, ${result.pulled} pulled, ${result.conflicts} conflicts.`,
      );
    } catch {
      setNotice(t.common.error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolve = async (
    conflictId: string,
    choice: 'keep_local' | 'keep_remote',
  ) => {
    setResolvingId(conflictId);
    try {
      await syncManager.resolveConflict(conflictId, choice);
      refreshState();
      setNotice('Conflict resolved successfully.');
    } catch {
      setNotice(t.common.error);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="sync-center-layout">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="breadcrumb-nav">
        <ol className="breadcrumb-list">
          <li>
            <Link href={`/films/${filmId}`} className="breadcrumb-link">
              ← {t.common.backToProjects}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="sync-header">
        <div>
          <h1 className="sync-title">{t.syncCenter.title}</h1>
          <p className="sync-subtitle">{t.app.tagline}</p>
        </div>

        <button
          type="button"
          onClick={() => void handleSyncNow()}
          disabled={isSyncing || isOffline}
          className="btn btn-primary"
        >
          {isSyncing ? t.syncCenter.syncing : t.syncCenter.syncNow}
        </button>
      </div>

      {notice && (
        <div role="status" aria-live="polite" className="sync-notice">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="btn btn-ghost btn-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Status Cards Grid */}
      <section className="sync-status-grid" aria-label={t.syncCenter.status}>
        <div className="status-card">
          <span className="card-label">{t.syncCenter.status}</span>
          <div className="card-value-row">
            <span className={`status-badge status-${status.state}`}>
              {status.state.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="status-card">
          <span className="card-label">{t.syncCenter.serverRevision}</span>
          <span className="card-value">{status.lastAckRevision}</span>
        </div>

        <div className="status-card">
          <span className="card-label">{t.syncCenter.pendingOps}</span>
          <span className="card-value">{status.pendingCount}</span>
        </div>

        <div className="status-card">
          <span className="card-label">{t.syncCenter.conflicts}</span>
          <span className="card-value text-accent">{status.conflictCount}</span>
        </div>
      </section>

      {/* Conflicts Resolution Section */}
      <section className="sync-section" aria-labelledby="conflicts-title">
        <h2 id="conflicts-title" className="section-title">
          {t.syncCenter.conflicts} ({conflicts.length})
        </h2>

        {conflicts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true">✓</div>
            <p className="empty-desc">{t.syncCenter.noConflicts}</p>
          </div>
        ) : (
          <ul className="conflicts-list">
            {conflicts.map((conflict) => (
              <li key={conflict.id} className="conflict-card">
                <div className="conflict-card-header">
                  <span className="conflict-badge">
                    {conflict.entityType.toUpperCase()} #{conflict.entityId.slice(0, 8)}
                  </span>
                  <span className="conflict-field-badge">
                    {conflict.conflictType}
                  </span>
                </div>

                <div className="conflict-diff-grid">
                  <div className="diff-column">
                    <span className="diff-header">{t.syncCenter.serverValue} (v{conflict.serverVersion})</span>
                    <pre className="diff-content">
                      {JSON.stringify(conflict.serverPayload, null, 2)}
                    </pre>
                  </div>
                  <div className="diff-column">
                    <span className="diff-header">{t.syncCenter.localValue} (base: v{conflict.baseVersion ?? 0})</span>
                    <pre className="diff-content">
                      {JSON.stringify(conflict.clientPayload, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="conflict-actions">
                  <button
                    type="button"
                    onClick={() => void handleResolve(conflict.id, 'keep_local')}
                    disabled={resolvingId === conflict.id}
                    className="btn btn-primary btn-sm"
                  >
                    {t.syncCenter.keepClient}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleResolve(conflict.id, 'keep_remote')}
                    disabled={resolvingId === conflict.id}
                    className="btn btn-secondary btn-sm"
                  >
                    {t.syncCenter.keepServer}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending Operations Section */}
      <section className="sync-section" aria-labelledby="pending-title">
        <h2 id="pending-title" className="section-title">
          {t.syncCenter.pendingOps} ({pendingOps.length})
        </h2>

        {pendingOps.length === 0 ? (
          <div className="empty-state">
            <p className="empty-desc">{t.syncCenter.noPending}</p>
          </div>
        ) : (
          <ul className="pending-ops-list">
            {pendingOps.map((op) => (
              <li key={op.opId} className="pending-op-item">
                <span className="op-seq">#{op.clientSequence}</span>
                <span className="op-action">{op.kind}</span>
                <span className="op-target">
                  {op.entityType} ({op.entityId.slice(0, 8)})
                </span>
                <span className="op-time">
                  {new Date(op.createdAtClient).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
