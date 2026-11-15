'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { FilmResource } from '@film-studio/contracts';
import { useLocale, useOffline, useSession } from './providers';
import { Modal } from './components/Modal';

export default function DashboardPage() {
  const { t } = useLocale();
  const { isOffline } = useOffline();
  const { loading: sessionLoading } = useSession();

  const [films, setFilms] = useState<readonly FilmResource[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchFilms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/films', {
        headers: { accept: 'application/json' },
      });
      if (response.ok) {
        const data = (await response.json()) as FilmResource[];
        setFilms(data);
      } else if (response.status === 401) {
        // Unauthenticated in preview mode: show empty state with sign-in guidance
        setFilms([]);
      } else {
        setError(t.common.error);
      }
    } catch {
      // In offline or local preview without API server: provide graceful fallback
      setError(isOffline ? t.app.offlineNotice : t.common.error);
    } finally {
      setLoading(false);
    }
  }, [isOffline, t]);

  useEffect(() => {
    void fetchFilms();
  }, [fetchFilms]);

  const handleCreateFilm = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;

    setCreating(true);
    try {
      // If user has films, use the first film's organizationId, else create organization
      let organizationId = films[0]?.organizationId;
      if (!organizationId) {
        const orgRes = await fetch('/organizations', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ name: 'Studio Organization' }),
        });
        if (orgRes.ok) {
          const org = (await orgRes.json()) as { id: string };
          organizationId = org.id;
        }
      }

      if (organizationId) {
        const res = await fetch(`/organizations/${organizationId}/films`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        if (res.ok) {
          const created = (await res.json()) as FilmResource;
          setFilms((prev) => [created, ...prev]);
          setNewTitle('');
          setIsModalOpen(false);
        } else {
          setError(t.common.error);
        }
      }
    } catch {
      setError(t.common.error);
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (filmId: string) => {
    try {
      const res = await fetch(`/films/${filmId}/archive`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        setFilms((prev) =>
          prev.map((f) => (f.id === filmId ? { ...f, status: 'archived' } : f)),
        );
      } else {
        setError(t.common.error);
      }
    } catch {
      setError(t.common.error);
    }
  };

  const handleRestore = async (filmId: string) => {
    try {
      const res = await fetch(`/films/${filmId}/restore`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        setFilms((prev) =>
          prev.map((f) => (f.id === filmId ? { ...f, status: 'active' } : f)),
        );
      } else {
        setError(t.common.error);
      }
    } catch {
      setError(t.common.error);
    }
  };

  const visibleFilms = films.filter((f) => f.status === activeTab);

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{t.projects.title}</h1>
          <p className="dashboard-subtitle">{t.app.tagline}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/support" className="btn btn-secondary">
            🩺 {t.support.title}
          </Link>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary"
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">+</span> {t.projects.newProject}
          </button>
        </div>
      </div>

      <div className="tabs-container">
        <div role="tablist" aria-label={t.projects.title} className="tabs-nav">
          <button
            role="tab"
            aria-selected={activeTab === 'active'}
            id="tab-active"
            aria-controls="panel-active"
            onClick={() => setActiveTab('active')}
            className={`tab-btn ${activeTab === 'active' ? 'tab-btn-active' : ''}`}
          >
            {t.projects.activeTab}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'archived'}
            id="tab-archived"
            aria-controls="panel-archived"
            onClick={() => setActiveTab('archived')}
            className={`tab-btn ${activeTab === 'archived' ? 'tab-btn-active' : ''}`}
          >
            {t.projects.archivedTab}
          </button>
        </div>
      </div>

      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="projects-panel"
      >
        {loading || sessionLoading ? (
          <div className="loading-state" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
            <p>{t.common.loading}</p>
          </div>
        ) : error && !films.length ? (
          <div role="alert" className="error-state">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void fetchFilms()}
              className="btn btn-secondary btn-sm"
            >
              {t.common.retry}
            </button>
          </div>
        ) : visibleFilms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true">🎬</div>
            <h2>
              {activeTab === 'active'
                ? t.projects.emptyActive
                : t.projects.emptyArchived}
            </h2>
            <p className="empty-desc">
              {activeTab === 'active'
                ? t.projects.emptyDescription
                : ''}
            </p>
            {activeTab === 'active' && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="btn btn-primary"
              >
                {t.projects.createProject}
              </button>
            )}
          </div>
        ) : (
          <ul className="projects-grid" aria-label={activeTab === 'active' ? t.projects.activeTab : t.projects.archivedTab}>
            {visibleFilms.map((film) => (
              <li key={film.id} className="project-card">
                <div className="project-card-header">
                  <span className={`status-badge status-${film.status}`}>
                    {film.status === 'active'
                      ? t.projects.statusActive
                      : t.projects.statusArchived}
                  </span>
                </div>
                <h3 className="project-card-title">{film.title}</h3>
                <div className="project-card-actions">
                  <Link
                    href={`/films/${film.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    {t.projects.openWorkspace}
                  </Link>
                  {film.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => void handleArchive(film.id)}
                      className="btn btn-ghost btn-sm"
                      aria-label={`${t.projects.archive} ${film.title}`}
                    >
                      {t.projects.archive}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleRestore(film.id)}
                      className="btn btn-ghost btn-sm"
                      aria-label={`${t.projects.restore} ${film.title}`}
                    >
                      {t.projects.restore}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        title={t.projects.createProject}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <form onSubmit={handleCreateFilm} className="project-form">
          <div className="form-group">
            <label htmlFor="film-title" className="form-label">
              {t.projects.projectTitle}
            </label>
            <input
              id="film-title"
              type="text"
              required
              maxLength={240}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t.projects.projectTitlePlaceholder}
              className="form-input"
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn btn-ghost"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={creating || !newTitle.trim()}
              className="btn btn-primary"
            >
              {creating ? t.common.loading : t.projects.createProject}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
