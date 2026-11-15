'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { DocumentResource, FilmResource } from '@film-studio/contracts';
import { supportedLocales, type SupportedLocale } from '@film-studio/localization';
import { useLocale, useOffline } from '../../providers';
import { Modal } from '../../components/Modal';

interface FilmWorkspacePageProps {
  readonly params: Promise<{ readonly filmId: string }>;
}

export default function FilmWorkspacePage(props: FilmWorkspacePageProps) {
  const { filmId } = use(props.params);
  const { t } = useLocale();
  const { isOffline } = useOffline();

  const [film, setFilm] = useState<FilmResource | null>(null);
  const [documents, setDocuments] = useState<readonly DocumentResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docKind, setDocKind] = useState<'screenplay' | 'treatment' | 'bible' | 'notes'>('screenplay');
  const [docLanguage, setDocLanguage] = useState<SupportedLocale>('te');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [filmRes, docsRes] = await Promise.all([
        fetch(`/films/${filmId}`, { headers: { accept: 'application/json' } }),
        fetch(`/v1/films/${filmId}/documents`, { headers: { accept: 'application/json' } }),
      ]);

      if (filmRes.ok) {
        setFilm((await filmRes.json()) as FilmResource);
      }
      if (docsRes.ok) {
        setDocuments((await docsRes.json()) as DocumentResource[]);
      }
    } catch {
      setError(isOffline ? t.app.offlineNotice : t.common.error);
    } finally {
      setLoading(false);
    }
  }, [filmId, isOffline, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateDocument = async (e: FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || creating) return;

    setCreating(true);
    try {
      const operationId = crypto.randomUUID();
      const documentId = crypto.randomUUID();

      const res = await fetch(`/v1/films/${filmId}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          operationId,
          id: documentId,
          title: docTitle.trim(),
          kind: docKind,
          language: docLanguage,
        }),
      });

      if (res.ok) {
        const created = (await res.json()) as DocumentResource;
        setDocuments((prev) => [created, ...prev]);
        setDocTitle('');
        setIsModalOpen(false);
      } else {
        setError(t.common.error);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="workspace-layout">
      <nav aria-label="Breadcrumb" className="breadcrumb-nav">
        <ol className="breadcrumb-list">
          <li>
            <Link href="/" className="breadcrumb-link">
              ← {t.common.backToProjects}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="workspace-header">
        <div>
          <div className="workspace-title-row">
            <h1 className="workspace-title">{film?.title ?? t.app.title}</h1>
            {film && (
              <span className={`status-badge status-${film.status}`}>
                {film.status === 'active'
                  ? t.projects.statusActive
                  : t.projects.statusArchived}
              </span>
            )}
          </div>
          <p className="workspace-subtitle">{t.documents.title}</p>
        </div>

        <div className="workspace-header-actions">
          <Link
            href={`/films/${filmId}/search`}
            className="btn btn-secondary"
          >
            🔍 {t.search.title}
          </Link>
          <Link
            href={`/films/${filmId}/characters`}
            className="btn btn-secondary"
          >
            👥 {t.characters.title}
          </Link>
          <Link
            href={`/films/${filmId}/import`}
            className="btn btn-secondary"
          >
            📥 {t.importExport.importTitle}
          </Link>
          <Link
            href={`/films/${filmId}/sync`}
            className="btn btn-secondary"
          >
            ⚡ {t.syncCenter.title}
          </Link>
          {film?.status === 'active' && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="btn btn-primary"
              aria-haspopup="dialog"
            >
              <span aria-hidden="true">+</span> {t.documents.newDocument}
            </button>
          )}
        </div>
      </div>

      <div className="workspace-content">
        {loading ? (
          <div className="loading-state" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
            <p>{t.common.loading}</p>
          </div>
        ) : error && !documents.length ? (
          <div role="alert" className="error-state">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="btn btn-secondary btn-sm"
            >
              {t.common.retry}
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true">📄</div>
            <h2>{t.documents.emptyDocuments}</h2>
            <p className="empty-desc">{t.documents.emptyDescription}</p>
            {film?.status === 'active' && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="btn btn-primary"
              >
                {t.documents.createDocument}
              </button>
            )}
          </div>
        ) : (
          <ul className="documents-grid" aria-label={t.documents.title}>
            {documents.map((doc) => (
              <li key={doc.id} className="document-card">
                <div className="document-card-header">
                  <span className="document-kind-badge">{doc.kind}</span>
                  <span className="document-lang-badge">{doc.language}</span>
                </div>
                <h3 className="document-card-title">
                  <Link
                    href={`/films/${filmId}/documents/${doc.id}`}
                    className="document-card-link"
                  >
                    {doc.title}
                  </Link>
                </h3>
                <div className="document-card-footer">
                  <span className="document-version">
                    {t.documents.version} {doc.version}
                  </span>
                  <Link
                    href={`/films/${filmId}/documents/${doc.id}/board`}
                    className="btn btn-secondary btn-xs"
                    title={t.sceneBoard.title}
                  >
                    📋 {t.sceneBoard.title}
                  </Link>
                  <span className="document-status">
                    {doc.archivedAt ? t.projects.statusArchived : t.projects.statusActive}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        title={t.documents.createDocument}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <form onSubmit={handleCreateDocument} className="document-form">
          <div className="form-group">
            <label htmlFor="doc-title" className="form-label">
              {t.documents.documentTitle}
            </label>
            <input
              id="doc-title"
              type="text"
              required
              maxLength={240}
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder={t.documents.documentTitlePlaceholder}
              className="form-input"
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="doc-kind" className="form-label">
                {t.documents.kind}
              </label>
              <select
                id="doc-kind"
                value={docKind}
                onChange={(e) =>
                  setDocKind(e.target.value as 'screenplay' | 'treatment' | 'bible' | 'notes')
                }
                className="form-select"
              >
                <option value="screenplay">{t.documents.screenplay}</option>
                <option value="treatment">{t.documents.treatment}</option>
                <option value="bible">{t.documents.bible}</option>
                <option value="notes">{t.documents.notes}</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="doc-lang" className="form-label">
                {t.documents.language}
              </label>
              <select
                id="doc-lang"
                value={docLanguage}
                onChange={(e) => setDocLanguage(e.target.value as SupportedLocale)}
                className="form-select"
              >
                {supportedLocales.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
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
              disabled={creating || !docTitle.trim()}
              className="btn btn-primary"
            >
              {creating ? t.common.loading : t.documents.createDocument}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
