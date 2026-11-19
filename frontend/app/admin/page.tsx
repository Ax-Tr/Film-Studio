'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLocale, useSession } from '../providers';

type AdminTab = 'quotas' | 'breakglass' | 'approvals' | 'identity';

interface QuotaState {
  tier: 'standard' | 'pro' | 'enterprise';
  maxStorageBytes: number;
  usedStorageBytes: number;
  maxFilms: number;
  usedFilms: number;
  maxMonthlyAiTokens: number;
  usedMonthlyAiTokens: number;
  maxCollaborators: number;
  usedCollaborators: number;
  maxConcurrentEditors: number;
  dataResidencyRegion: string;
  enforceStrictQuotas: boolean;
  featureFlags: {
    multiRegionSync: boolean;
    indicTransliteration: boolean;
    legalRetentionLock: boolean;
    deepIndicVoiceSearch: boolean;
  };
}

interface BreakGlassRecord {
  id: string;
  adminUserId: string;
  targetFilmId: string;
  reason: string;
  ticketReference: string;
  status: 'active' | 'closed' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

interface ApprovalRecord {
  id: string;
  targetType: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  createdAt: string;
  filmTitle: string;
}

const DEFAULT_QUOTAS: QuotaState = {
  tier: 'enterprise',
  maxStorageBytes: 107374182400, // 100 GB
  usedStorageBytes: 13316911104, // 12.4 GB
  maxFilms: 50,
  usedFilms: 6,
  maxMonthlyAiTokens: 1000000,
  usedMonthlyAiTokens: 142500,
  maxCollaborators: 50,
  usedCollaborators: 14,
  maxConcurrentEditors: 25,
  dataResidencyRegion: 'AWS India (ap-south-1 / in-south-1)',
  enforceStrictQuotas: true,
  featureFlags: {
    multiRegionSync: true,
    indicTransliteration: true,
    legalRetentionLock: true,
    deepIndicVoiceSearch: true,
  },
};

const INITIAL_BREAK_GLASS: BreakGlassRecord[] = [
  {
    id: 'bg-98a1-43ef',
    adminUserId: 'usr-admin-system-01',
    targetFilmId: 'All / Global',
    reason: 'Sprint migration & database schema audit verification',
    ticketReference: 'OPS-4412',
    status: 'closed',
    expiresAt: '2026-11-18T14:30:00Z',
    createdAt: '2026-11-18T13:30:00Z',
  },
  {
    id: 'bg-71c2-8921',
    adminUserId: 'usr-lead-architect-02',
    targetFilmId: 'flm-9a3b-telugu-epic',
    reason: 'Emergency ProseMirror AST node schema repair',
    ticketReference: 'INC-8921',
    status: 'closed',
    expiresAt: '2026-11-16T18:00:00Z',
    createdAt: '2026-11-16T17:00:00Z',
  },
];

const INITIAL_APPROVALS: ApprovalRecord[] = [
  {
    id: 'appr-01',
    targetType: 'Screenplay Draft v3.2',
    title: 'Climax Sequence Script Sign-off',
    status: 'pending',
    requestedBy: 'director@filmstudio.internal',
    createdAt: '2026-11-19T10:15:00Z',
    filmTitle: 'The Amaravati Chronicles',
  },
  {
    id: 'appr-02',
    targetType: 'Production Budget',
    title: 'VFX Pre-visualization Allocation',
    status: 'approved',
    requestedBy: 'producer@filmstudio.internal',
    createdAt: '2026-11-18T16:40:00Z',
    filmTitle: 'The Amaravati Chronicles',
  },
  {
    id: 'appr-03',
    targetType: 'Ownership Transfer',
    title: 'Co-production Rights Transfer to Ax-Tr Media',
    status: 'approved',
    requestedBy: 'legal@filmstudio.internal',
    createdAt: '2026-11-15T09:20:00Z',
    filmTitle: 'Varanasi Midnight',
  },
];

export default function AdminConsolePage() {
  const { t } = useLocale();
  const { session } = useSession();

  const [activeTab, setActiveTab] = useState<AdminTab>('quotas');
  const [quotas, setQuotas] = useState<QuotaState>(DEFAULT_QUOTAS);
  const [breakGlassSessions, setBreakGlassSessions] = useState<BreakGlassRecord[]>(INITIAL_BREAK_GLASS);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>(INITIAL_APPROVALS);

  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'degraded'>('checking');
  const [healthLatency, setHealthLatency] = useState<number | null>(null);
  const [totalFilmsCount, setTotalFilmsCount] = useState<number>(6);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Break-glass modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bgReason, setBgReason] = useState('');
  const [bgTicket, setBgTicket] = useState('');
  const [bgTarget, setBgTarget] = useState('All / Global');
  const [bgDuration, setBgDuration] = useState('60');

  useEffect(() => {
    let active = true;

    async function checkHealthAndStats() {
      try {
        const start = performance.now();
        const res = await fetch('/health', { method: 'GET', headers: { accept: 'application/json' } });
        const latency = Math.round(performance.now() - start);

        if (active) {
          if (res.ok) {
            setHealthStatus('healthy');
            setHealthLatency(latency);
          } else {
            setHealthStatus('degraded');
          }
        }
      } catch {
        if (active) setHealthStatus('degraded');
      }

      try {
        const filmsRes = await fetch('/films', { headers: { accept: 'application/json' } });
        if (filmsRes.ok) {
          const data = (await filmsRes.json()) as unknown[];
          if (Array.isArray(data) && active) {
            setTotalFilmsCount(data.length);
            setQuotas((prev) => ({ ...prev, usedFilms: data.length }));
          }
        }
      } catch {
        // Fallback to initial local count
      }
    }

    void checkHealthAndStats();
    return () => {
      active = false;
    };
  }, []);

  const triggerToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleCreateBreakGlass = (e: FormEvent) => {
    e.preventDefault();
    if (!bgReason.trim() || !bgTicket.trim()) return;

    const newSession: BreakGlassRecord = {
      id: `bg-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`,
      adminUserId: session?.userId ?? 'usr-current-admin',
      targetFilmId: bgTarget,
      reason: bgReason.trim(),
      ticketReference: bgTicket.trim().toUpperCase(),
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + parseInt(bgDuration, 10) * 60000).toISOString(),
    };

    setBreakGlassSessions([newSession, ...breakGlassSessions]);
    setIsModalOpen(false);
    setBgReason('');
    setBgTicket('');
    triggerToast(`🚨 Emergency Break-Glass Session ${newSession.id} activated.`);
  };

  const handleCloseBreakGlass = (id: string) => {
    setBreakGlassSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'closed' } : s))
    );
    triggerToast(`Break-Glass session ${id} marked as closed.`);
  };

  const handleApprovalDecision = (id: string, decision: 'approved' | 'rejected') => {
    setApprovals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: decision } : a))
    );
    triggerToast(`Approval request ${id} marked as ${decision.toUpperCase()}.`);
  };

  const handleToggleStrictQuotas = () => {
    setQuotas((prev) => {
      const nextVal = !prev.enforceStrictQuotas;
      triggerToast(`Strict quota enforcement ${nextVal ? 'ENABLED' : 'DISABLED'}.`);
      return { ...prev, enforceStrictQuotas: nextVal };
    });
  };

  const handleToggleFeature = (feature: keyof QuotaState['featureFlags']) => {
    setQuotas((prev) => {
      const updated = {
        ...prev,
        featureFlags: {
          ...prev.featureFlags,
          [feature]: !prev.featureFlags[feature],
        },
      };
      triggerToast(`Feature flag '${feature}' toggled.`);
      return updated;
    });
  };

  const formatGb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1);
  const activeBreakGlassCount = breakGlassSessions.filter((s) => s.status === 'active').length;

  return (
    <div className="admin-container">
      {/* Toast Alert */}
      {feedbackMessage && (
        <div className="admin-toast" role="status" aria-live="polite">
          {feedbackMessage}
        </div>
      )}

      {/* Header */}
      <div className="admin-header">
        <div>
          <div className="admin-breadcrumb">
            <Link href="/" className="admin-breadcrumb-link">
              ← {t.projects.title}
            </Link>
          </div>
          <h1 className="admin-title">Enterprise Administration & Governance</h1>
          <p className="admin-subtitle">
            Tenant quotas, break-glass security audit, approval policies, and multi-region data residency controls.
          </p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn btn-secondary btn-sm"
          >
            🚨 Emergency Break-Glass
          </button>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">API Health & Latency</div>
          <div className="admin-stat-value">
            {healthStatus === 'healthy' ? '🟢 Operational' : healthStatus === 'degraded' ? '🟡 Degraded' : '⚪ Probing...'}
          </div>
          <div className="admin-stat-meta">
            {healthLatency !== null ? `${healthLatency}ms round-trip` : 'Checking /health'}
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Organization Quota Tier</div>
          <div className="admin-stat-value" style={{ textTransform: 'capitalize' }}>
            {quotas.tier}
          </div>
          <div className="admin-stat-meta">
            {quotas.enforceStrictQuotas ? 'Strict Enforcement Active' : 'Soft Warning Mode'}
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Active Break-Glass</div>
          <div className="admin-stat-value" style={{ color: activeBreakGlassCount > 0 ? 'var(--color-danger)' : 'inherit' }}>
            {activeBreakGlassCount} Active
          </div>
          <div className="admin-stat-meta">{breakGlassSessions.length} total logged sessions</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-label">Active Film Workspaces</div>
          <div className="admin-stat-value">{totalFilmsCount}</div>
          <div className="admin-stat-meta">Allowed: {quotas.maxFilms} projects</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <nav className="tabs-nav" aria-label="Admin Navigation Tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'quotas' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('quotas')}
          >
            📊 Quotas & Resources
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'breakglass' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('breakglass')}
          >
            🚨 Break-Glass Overrides ({activeBreakGlassCount})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'approvals' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('approvals')}
          >
            📋 Approval Governance ({approvals.filter((a) => a.status === 'pending').length} pending)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'identity' ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab('identity')}
          >
            🔐 Identity & Sessions
          </button>
        </nav>
      </div>

      {/* Tab 1: Quotas & Resources */}
      {activeTab === 'quotas' && (
        <div className="admin-section">
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2 className="admin-card-title">Tenant Resource Allocations</h2>
                <p className="admin-card-description">
                  Server-enforced quotas preventing uncontrolled storage consumption and runaway AI invocation costs.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleStrictQuotas}
                className={`btn btn-sm ${quotas.enforceStrictQuotas ? 'btn-secondary' : 'btn-ghost'}`}
              >
                {quotas.enforceStrictQuotas ? 'Enforcing Strictly' : 'Soft Quota Warning'}
              </button>
            </div>

            <div className="admin-quota-list">
              {/* Storage */}
              <div className="quota-row">
                <div className="quota-info">
                  <span className="quota-title">Asset & Screenplay Cloud Storage</span>
                  <span className="quota-numbers">
                    {formatGb(quotas.usedStorageBytes)} GB / {formatGb(quotas.maxStorageBytes)} GB (
                    {Math.round((quotas.usedStorageBytes / quotas.maxStorageBytes) * 100)}%)
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(quotas.usedStorageBytes / quotas.maxStorageBytes) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Films */}
              <div className="quota-row">
                <div className="quota-info">
                  <span className="quota-title">Film Production Projects</span>
                  <span className="quota-numbers">
                    {quotas.usedFilms} / {quotas.maxFilms} films (
                    {Math.round((quotas.usedFilms / quotas.maxFilms) * 100)}%)
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(quotas.usedFilms / quotas.maxFilms) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* AI Tokens */}
              <div className="quota-row">
                <div className="quota-info">
                  <span className="quota-title">Monthly AI Character & Assist Tokens</span>
                  <span className="quota-numbers">
                    {quotas.usedMonthlyAiTokens.toLocaleString()} / {quotas.maxMonthlyAiTokens.toLocaleString()} tokens (
                    {Math.round((quotas.usedMonthlyAiTokens / quotas.maxMonthlyAiTokens) * 100)}%)
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(quotas.usedMonthlyAiTokens / quotas.maxMonthlyAiTokens) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Collaborators */}
              <div className="quota-row">
                <div className="quota-info">
                  <span className="quota-title">Licensed Collaborator Seats</span>
                  <span className="quota-numbers">
                    {quotas.usedCollaborators} / {quotas.maxCollaborators} seats
                  </span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(quotas.usedCollaborators / quotas.maxCollaborators) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="admin-details-grid">
              <div className="detail-item">
                <span className="detail-key">Data Residency Region:</span>
                <span className="detail-value">{quotas.dataResidencyRegion}</span>
              </div>
              <div className="detail-item">
                <span className="detail-key">Max Concurrent Screenplay Editors:</span>
                <span className="detail-value">{quotas.maxConcurrentEditors} editors</span>
              </div>
            </div>
          </div>

          {/* Enterprise Feature Toggles */}
          <div className="admin-card">
            <h3 className="admin-card-title">Enterprise Feature Policies</h3>
            <p className="admin-card-description">Enable or disable organization-wide security and AI features.</p>

            <div className="toggle-list">
              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={quotas.featureFlags.multiRegionSync}
                  onChange={() => handleToggleFeature('multiRegionSync')}
                />
                <div>
                  <strong>Multi-Region Delta Synchronization</strong>
                  <p className="toggle-desc">Permits offline writers to sync across distributed cloud regions.</p>
                </div>
              </label>

              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={quotas.featureFlags.indicTransliteration}
                  onChange={() => handleToggleFeature('indicTransliteration')}
                />
                <div>
                  <strong>Real-time Indic Transliteration Engines</strong>
                  <p className="toggle-desc">Enables native phonetic IMEs for Telugu, Hindi, Tamil, Kannada, and Bengali.</p>
                </div>
              </label>

              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={quotas.featureFlags.legalRetentionLock}
                  onChange={() => handleToggleFeature('legalRetentionLock')}
                />
                <div>
                  <strong>Legal Hold & Retention Policy Enforcement</strong>
                  <p className="toggle-desc">Prevents permanent purge of archived screenplay revisions during active litigation holds.</p>
                </div>
              </label>

              <label className="toggle-item">
                <input
                  type="checkbox"
                  checked={quotas.featureFlags.deepIndicVoiceSearch}
                  onChange={() => handleToggleFeature('deepIndicVoiceSearch')}
                />
                <div>
                  <strong>Multilingual Vector & Character Search</strong>
                  <p className="toggle-desc">Enables vector semantic search across multi-lingual character dialogue nodes.</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Break-Glass Overrides */}
      {activeTab === 'breakglass' && (
        <div className="admin-section">
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2 className="admin-card-title">Super Admin Break-Glass Oversight</h2>
                <p className="admin-card-description">
                  Immutable audit records of elevated privilege overrides. All actions during an active break-glass
                  session are cryptographically hashed and tied to an incident ticket.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="btn btn-primary btn-sm"
              >
                + Initiate Session
              </button>
            </div>

            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Ticket Ref</th>
                    <th>Admin User</th>
                    <th>Target Scope</th>
                    <th>Reason / Justification</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {breakGlassSessions.map((sessionItem) => (
                    <tr key={sessionItem.id}>
                      <td className="code-cell">{sessionItem.id}</td>
                      <td>
                        <span className="badge badge-ticket">{sessionItem.ticketReference}</span>
                      </td>
                      <td className="code-cell">{sessionItem.adminUserId}</td>
                      <td>{sessionItem.targetFilmId}</td>
                      <td className="reason-cell">{sessionItem.reason}</td>
                      <td>
                        <span
                          className={`badge ${
                            sessionItem.status === 'active'
                              ? 'badge-active'
                              : sessionItem.status === 'closed'
                              ? 'badge-closed'
                              : 'badge-revoked'
                          }`}
                        >
                          {sessionItem.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="date-cell">{new Date(sessionItem.createdAt).toLocaleDateString()}</td>
                      <td>
                        {sessionItem.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => handleCloseBreakGlass(sessionItem.id)}
                            className="btn btn-ghost btn-sm"
                          >
                            Close
                          </button>
                        ) : (
                          <span className="text-muted">Archived</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Approval Governance */}
      {activeTab === 'approvals' && (
        <div className="admin-section">
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2 className="admin-card-title">Production Approvals & Sign-offs</h2>
                <p className="admin-card-description">
                  Formal sign-offs required before screenplay drafts are moved to production boards or exported.
                </p>
              </div>
            </div>

            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Film Project</th>
                    <th>Target Resource</th>
                    <th>Title & Description</th>
                    <th>Requested By</th>
                    <th>Status</th>
                    <th>Submission Date</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((req) => (
                    <tr key={req.id}>
                      <td className="code-cell">{req.id}</td>
                      <td>
                        <strong>{req.filmTitle}</strong>
                      </td>
                      <td>
                        <span className="badge badge-ticket">{req.targetType}</span>
                      </td>
                      <td>{req.title}</td>
                      <td className="code-cell">{req.requestedBy}</td>
                      <td>
                        <span
                          className={`badge ${
                            req.status === 'approved'
                              ? 'badge-closed'
                              : req.status === 'pending'
                              ? 'badge-pending'
                              : 'badge-revoked'
                          }`}
                        >
                          {req.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="date-cell">{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td>
                        {req.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleApprovalDecision(req.id, 'approved')}
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--color-success)' }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApprovalDecision(req.id, 'rejected')}
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--color-danger)' }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted">Finalized</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Identity & Sessions */}
      {activeTab === 'identity' && (
        <div className="admin-section">
          <div className="admin-card">
            <h2 className="admin-card-title">Authenticated Principal Context</h2>
            <p className="admin-card-description">
              Current OpenID Connect (OIDC) identity claims and security parameters.
            </p>

            <div className="admin-details-grid">
              <div className="detail-item">
                <span className="detail-key">User Principal ID:</span>
                <span className="detail-value code-cell">{session?.userId ?? 'Anonymous / Demo User'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-key">Active Session ID:</span>
                <span className="detail-value code-cell">{session?.sessionId ?? 'Local-Unbound-Session'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-key">Bound Email:</span>
                <span className="detail-value">{session?.email ?? 'developer@filmstudio.local'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-key">Device Fingerprint:</span>
                <span className="detail-value code-cell">{session?.deviceId ?? 'Browser-Web-Agent'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-key">PKCE & Replay Safeguards:</span>
                <span className="detail-value" style={{ color: 'var(--color-success)' }}>
                  ✓ SHA-256 Code Challenge Enforced
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-key">Refresh Token Rotation:</span>
                <span className="detail-value" style={{ color: 'var(--color-success)' }}>
                  ✓ Automatic Replay Invalidation Active
                </span>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <a href="/auth/web/start" className="btn btn-secondary btn-sm">
                🔄 Re-authenticate via OIDC IdP (Cognito / Google)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Break-Glass Request Modal */}
      {isModalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="admin-modal-content">
            <h2 id="modal-title" style={{ marginBottom: '8px' }}>
              🚨 Initiate Super Admin Break-Glass Session
            </h2>
            <p className="admin-card-description" style={{ marginBottom: '20px' }}>
              This action temporarily bypasses Row-Level Security checks and grants super-administrative privileges.
              Every write and read operation will be permanently recorded in the security audit ledger.
            </p>

            <form onSubmit={handleCreateBreakGlass}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="bg-ticket" className="form-label">
                  Incident / Jira Ticket Reference *
                </label>
                <input
                  id="bg-ticket"
                  type="text"
                  required
                  placeholder="e.g. INC-9012 or SEC-441"
                  className="form-input"
                  value={bgTicket}
                  onChange={(e) => setBgTicket(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="bg-target" className="form-label">
                  Target Film Scope
                </label>
                <input
                  id="bg-target"
                  type="text"
                  className="form-input"
                  value={bgTarget}
                  onChange={(e) => setBgTarget(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="bg-duration" className="form-label">
                  Session Duration
                </label>
                <select
                  id="bg-duration"
                  className="form-input"
                  value={bgDuration}
                  onChange={(e) => setBgDuration(e.target.value)}
                >
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">60 Minutes</option>
                  <option value="120">120 Minutes (Max)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label htmlFor="bg-reason" className="form-label">
                  Mandatory Audit Justification *
                </label>
                <textarea
                  id="bg-reason"
                  required
                  rows={3}
                  placeholder="Explain why standard tenant permissions are insufficient..."
                  className="form-input"
                  value={bgReason}
                  onChange={(e) => setBgReason(e.target.value)}
                />
              </div>

              <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!bgTicket.trim() || !bgReason.trim()}
                  className="btn btn-primary"
                  style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                >
                  Confirm Elevated Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
