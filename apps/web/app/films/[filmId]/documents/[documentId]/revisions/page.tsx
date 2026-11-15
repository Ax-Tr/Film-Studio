'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import type {
  DocumentResource,
  DocumentVersionDetailResource,
  DocumentVersionSummaryResource,
} from '@film-studio/contracts';
import { useLocale } from '../../../../../providers';

interface RevisionsPageProps {
  readonly params: Promise<{
    readonly filmId: string;
    readonly documentId: string;
  }>;
}

export default function DocumentRevisionsPage(props: RevisionsPageProps) {
  const { filmId, documentId } = use(props.params);
  const { t } = useLocale();
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentResource | null>(null);
  const [versions, setVersions] = useState<readonly DocumentVersionSummaryResource[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DocumentVersionDetailResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const [docRes, verRes] = await Promise.all([
          fetch(`/v1/films/${filmId}/documents/${documentId}`, {
            headers: { accept: 'application/json' },
          }),
          fetch(`/v1/films/${filmId}/documents/${documentId}/versions`, {
            headers: { accept: 'application/json' },
          }),
        ]);
        if (!active) return;
        if (docRes.ok && verRes.ok) {
          const d = (await docRes.json()) as DocumentResource;
          const v = (await verRes.json()) as DocumentVersionSummaryResource[];
          setDoc(d);
          setVersions(v);
          if (v.length > 0 && v[0]) {
            setSelectedVersionId(v[0].id);
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t.common.error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [filmId, documentId, t.common.error]);

  useEffect(() => {
    if (!selectedVersionId) return;
    let active = true;
    async function loadDetail() {
      try {
        setDetailLoading(true);
        const res = await fetch(
          `/v1/films/${filmId}/documents/${documentId}/versions/${selectedVersionId}`,
          { headers: { accept: 'application/json' } },
        );
        if (!active) return;
        if (res.ok) {
          const detail = (await res.json()) as DocumentVersionDetailResource;
          setSelectedDetail(detail);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : t.common.error);
      } finally {
        if (active) setDetailLoading(false);
      }
    }
    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedVersionId, filmId, documentId, t.common.error]);

  const handleRestore = async (versionId: string) => {
    if (!doc) return;
    try {
      setRestoring(true);
      setError(null);
      const res = await fetch(
        `/v1/films/${filmId}/documents/${documentId}/versions/${versionId}/restore`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            operationId: randomUUID(),
            expectedDocumentVersion: doc.version,
          }),
        },
      );
      if (!res.ok) throw new Error('Failed to restore version');
      const newVersion = (await res.json()) as DocumentVersionDetailResource;
      setSuccessMessage(`${t.revisions.restoreSuccess} (v${newVersion.documentVersion})`);

      const [updatedDocRes, updatedVerRes] = await Promise.all([
        fetch(`/v1/films/${filmId}/documents/${documentId}`, {
          headers: { accept: 'application/json' },
        }),
        fetch(`/v1/films/${filmId}/documents/${documentId}/versions`, {
          headers: { accept: 'application/json' },
        }),
      ]);
      if (updatedDocRes.ok && updatedVerRes.ok) {
        const updatedDoc = (await updatedDocRes.json()) as DocumentResource;
        const updatedVersions = (await updatedVerRes.json()) as DocumentVersionSummaryResource[];
        setDoc(updatedDoc);
        setVersions(updatedVersions);
        setSelectedVersionId(newVersion.id);
      }
      setTimeout(() => {
        router.push(`/films/${filmId}/documents/${documentId}`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <main className="container revisions-page" style={{ padding: '2rem 1rem' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Link
              href={`/films/${filmId}/documents/${documentId}`}
              className="topbar-back-link"
              style={{ display: 'inline-block', marginBottom: '0.5rem' }}
            >
              ← {doc?.title ?? t.app.title}
            </Link>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
              {t.revisions.title}: {doc?.title}
            </h1>
          </div>
          <Link
            href={`/films/${filmId}/documents/${documentId}`}
            className="btn btn-secondary btn-sm"
          >
            {t.common.close}
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: '#fed7d7',
            color: '#c53030',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          style={{
            padding: '1rem',
            backgroundColor: '#c6f6d5',
            color: '#22543d',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {successMessage}
        </div>
      )}

      {loading ? (
        <p>{t.common.loading}</p>
      ) : versions.length === 0 ? (
        <p>{t.revisions.noRevisions}</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          {/* Version List Sidebar */}
          <section
            aria-label={t.revisions.history}
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid #e2e8f0',
                fontWeight: 600,
                backgroundColor: '#f7fafc',
              }}
            >
              {t.revisions.history} ({versions.length})
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {versions.map((ver, idx) => {
                const isSelected = ver.id === selectedVersionId;
                const isLatest = idx === 0;
                return (
                  <li
                    key={ver.id}
                    onClick={() => setSelectedVersionId(ver.id)}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid #edf2f7',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#edf2f7' : 'transparent',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>
                        {t.revisions.version} {ver.documentVersion}
                      </span>
                      {isLatest && (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            backgroundColor: '#ebf8ff',
                            color: '#2b6cb0',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 600,
                          }}
                        >
                          {t.revisions.currentVersion}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.25rem' }}>
                      {new Date(ver.createdAt).toLocaleString()}
                    </div>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: '#a0aec0',
                        fontFamily: 'monospace',
                        marginTop: '0.25rem',
                        wordBreak: 'break-all',
                      }}
                    >
                      sha256: {ver.snapshotSha256.slice(0, 16)}...
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Selected Version Preview & Actions */}
          <section
            aria-label="Version Preview"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1.5rem',
            }}
          >
            {detailLoading ? (
              <p>{t.common.loading}</p>
            ) : selectedDetail ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem 0' }}>
                      {t.revisions.version} {selectedDetail.documentVersion}
                    </h2>
                    <span style={{ fontSize: '0.85rem', color: '#718096' }}>
                      {new Date(selectedDetail.createdAt).toLocaleString()} • {selectedDetail.snapshot.scenes.length} {t.sceneBoard.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(selectedDetail.id)}
                    disabled={restoring}
                    className="btn btn-primary btn-sm"
                  >
                    {restoring ? '...' : t.revisions.restoreVersion}
                  </button>
                </div>

                <div
                  style={{
                    fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
                    fontSize: '0.95rem',
                    lineHeight: 1.5,
                    maxHeight: '520px',
                    overflowY: 'auto',
                    backgroundColor: '#f8fafc',
                    padding: '1.25rem',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {selectedDetail.snapshot.scenes.map((scene) => (
                    <div key={scene.id} style={{ marginBottom: '1.25rem' }}>
                      {scene.blocks.map((block) => (
                        <div
                          key={block.id}
                          style={{
                            marginBottom: '0.4rem',
                            fontWeight:
                              block.type === 'scene-heading' || block.type === 'character'
                                ? 700
                                : 400,
                            textAlign:
                              block.type === 'character' || block.type === 'parenthetical'
                                ? 'center'
                                : block.type === 'transition'
                                  ? 'right'
                                  : 'left',
                            color: block.type === 'scene-heading' ? '#1a202c' : '#2d3748',
                          }}
                        >
                          {block.text}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p>{t.common.loading}</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
