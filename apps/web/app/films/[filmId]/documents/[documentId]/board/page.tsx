'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SceneCardResourceDto } from '@film-studio/contracts';
import { useLocale } from '../../../../../providers';

interface SceneBoardPageProps {
  readonly params: Promise<{ readonly filmId: string; readonly documentId: string }>;
}

export default function SceneBoardPage(props: SceneBoardPageProps) {
  const { filmId, documentId } = use(props.params);
  const { t } = useLocale();

  const [scenes, setScenes] = useState<readonly SceneCardResourceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchSceneCards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/v1/films/${filmId}/documents/${documentId}/scene-cards`, {
        headers: {
          accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as SceneCardResourceDto[];
        setScenes(data);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setLoading(false);
    }
  }, [filmId, documentId, t.common.error]);

  useEffect(() => {
    void fetchSceneCards();
  }, [fetchSceneCards]);

  const handleToggleLock = async (sceneId: string, currentLock: boolean) => {
    setUpdatingId(sceneId);
    try {
      const res = await fetch(
        `/v1/films/${filmId}/documents/${documentId}/scenes/${sceneId}/lock`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ lock: !currentLock }),
        },
      );
      if (res.ok) {
        await fetchSceneCards();
      }
    } catch {
      setError(t.common.error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMoveScene = async (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= scenes.length) return;

    const reordered = [...scenes];
    const [moved] = reordered.splice(currentIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);

    const sceneIdsInOrder = reordered.map((s) => s.id);
    try {
      const res = await fetch(
        `/v1/films/${filmId}/documents/${documentId}/scenes/reorder`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ documentId, sceneIdsInOrder }),
        },
      );
      if (res.ok) {
        await fetchSceneCards();
      }
    } catch {
      setError(t.common.error);
    }
  };

  return (
    <div className="sceneboard-layout">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="breadcrumb-nav">
        <ol className="breadcrumb-list">
          <li>
            <Link href={`/films/${filmId}`} className="breadcrumb-link">
              ← {t.common.backToProjects}
            </Link>
          </li>
          <li aria-hidden="true" className="breadcrumb-sep">/</li>
          <li>
            <Link href={`/films/${filmId}/documents/${documentId}`} className="breadcrumb-link">
              {t.documents.screenplay}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="section-header">
        <div>
          <h1 className="page-title">{t.sceneBoard.title}</h1>
          <p className="page-subtitle">{t.app.tagline}</p>
        </div>

        <Link
          href={`/films/${filmId}/documents/${documentId}`}
          className="btn btn-primary"
        >
          {t.projects.openWorkspace}
        </Link>
      </div>

      {error && <div className="alert-banner alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">{t.common.loading}</div>
      ) : scenes.length === 0 ? (
        <div className="empty-state">
          <p className="empty-desc">{t.sceneBoard.emptyScenes}</p>
        </div>
      ) : (
        <div className="scene-cards-grid">
          {scenes.map((scene, idx) => (
            <div
              key={scene.id}
              className={`scene-card ${scene.isLocked ? 'scene-locked' : ''}`}
            >
              <div className="scene-card-header">
                <span className="scene-number-pill">#{scene.position + 1}</span>
                <div className="scene-actions-row">
                  <button
                    type="button"
                    onClick={() => void handleMoveScene(idx, 'up')}
                    disabled={idx === 0 || scene.isLocked}
                    className="btn btn-secondary btn-xs"
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMoveScene(idx, 'down')}
                    disabled={idx === scenes.length - 1 || scene.isLocked}
                    className="btn btn-secondary btn-xs"
                    title="Move Down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleLock(scene.id, scene.isLocked)}
                    disabled={updatingId === scene.id}
                    className={`btn btn-xs ${scene.isLocked ? 'btn-danger' : 'btn-secondary'}`}
                  >
                    {scene.isLocked ? t.sceneBoard.unlock : t.sceneBoard.lock}
                  </button>
                </div>
              </div>

              <h3 className="scene-slugline">
                {scene.slugline || 'UNTITLED SCENE'}
              </h3>

              {scene.summary && (
                <p className="scene-summary">{scene.summary}</p>
              )}

              {scene.characters.length > 0 && (
                <div className="scene-characters-list">
                  {scene.characters.map((c) => (
                    <span key={c.characterId} className="char-badge">
                      {c.displayName} ({c.dialogueBlockCount})
                    </span>
                  ))}
                </div>
              )}

              <div className="scene-footer">
                <span className="scene-words-stat">
                  {scene.wordCount} {t.editor.totalWords}
                </span>
                {scene.isLocked && (
                  <span className="locked-indicator">
                    🔒 {t.sceneBoard.lockedBadge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
