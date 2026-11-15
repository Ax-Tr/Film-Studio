'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { CharacterResourceDto } from '@film-studio/contracts';
import { useLocale } from '../../../providers';

interface CharactersPageProps {
  readonly params: Promise<{ readonly filmId: string }>;
}

export default function CharactersPage(props: CharactersPageProps) {
  const { filmId } = use(props.params);
  const { t } = useLocale();

  const [characters, setCharacters] = useState<readonly CharacterResourceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [aliases, setAliases] = useState('');
  const [arcSummary, setArcSummary] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCharacters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/v1/films/${filmId}/characters`, {
        headers: {
          accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as CharacterResourceDto[];
        setCharacters(data);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setLoading(false);
    }
  }, [filmId, t.common.error]);

  useEffect(() => {
    void fetchCharacters();
  }, [fetchCharacters]);

  const handleCreateCharacter = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || creating) return;
    setCreating(true);
    setError(null);

    const aliasList = aliases
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    try {
      const res = await fetch(`/v1/films/${filmId}/characters`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          aliases: aliasList,
          arcSummary: arcSummary.trim() || undefined,
        }),
      });

      if (res.ok) {
        setDisplayName('');
        setAliases('');
        setArcSummary('');
        setModalOpen(false);
        await fetchCharacters();
      } else {
        setError(t.common.error);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!confirm(t.characters.deleteConfirm)) return;
    try {
      const res = await fetch(`/v1/films/${filmId}/characters/${characterId}`, {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
        },
      });
      if (res.ok) {
        await fetchCharacters();
      }
    } catch {
      setError(t.common.error);
    }
  };

  return (
    <div className="characters-layout">
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

      <div className="section-header">
        <div>
          <h1 className="page-title">{t.characters.title}</h1>
          <p className="page-subtitle">{t.app.tagline}</p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn btn-primary"
        >
          + {t.characters.newCharacter}
        </button>
      </div>

      {error && <div className="alert-banner alert-error">{error}</div>}

      {loading ? (
        <div className="loading-state">{t.common.loading}</div>
      ) : characters.length === 0 ? (
        <div className="empty-state">
          <p className="empty-desc">{t.characters.noCharacters}</p>
        </div>
      ) : (
        <div className="characters-grid">
          {characters.map((char) => (
            <div key={char.id} className="character-card">
              <div className="character-card-header">
                <h3 className="character-name">{char.displayName}</h3>
                <button
                  type="button"
                  onClick={() => void handleDeleteCharacter(char.id)}
                  className="btn btn-secondary btn-sm"
                  aria-label={`Delete ${char.displayName}`}
                >
                  ✕
                </button>
              </div>

              {char.aliases.length > 0 && (
                <div className="character-aliases">
                  <span className="aliases-label">{t.characters.aliases}:</span>{' '}
                  <span className="aliases-tags">{char.aliases.join(', ')}</span>
                </div>
              )}

              {char.arcSummary && (
                <p className="character-arc">{char.arcSummary}</p>
              )}

              <div className="character-stats-row">
                <span className="stat-pill">
                  {char.totalScenes ?? 0} {t.characters.scenesCount}
                </span>
                <span className="stat-pill">
                  {char.totalDialogueBlocks ?? 0} {t.characters.dialogueBlocks}
                </span>
                <span className="stat-pill">
                  {char.totalDialogueWords ?? 0} {t.characters.wordsCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Creating Character */}
      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container">
            <h2 className="modal-title">{t.characters.createCharacter}</h2>
            <form onSubmit={(e) => void handleCreateCharacter(e)}>
              <div className="form-group">
                <label htmlFor="char-name" className="form-label">
                  {t.characters.name} *
                </label>
                <input
                  id="char-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t.characters.namePlaceholder}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="char-aliases" className="form-label">
                  {t.characters.aliases}
                </label>
                <input
                  id="char-aliases"
                  type="text"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder={t.characters.aliasesPlaceholder}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="char-arc" className="form-label">
                  {t.characters.arcSummary}
                </label>
                <textarea
                  id="char-arc"
                  rows={3}
                  value={arcSummary}
                  onChange={(e) => setArcSummary(e.target.value)}
                  placeholder={t.characters.arcSummaryPlaceholder}
                  className="form-input"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary"
                  disabled={creating}
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating || !displayName.trim()}
                >
                  {creating ? t.common.loading : t.characters.createCharacter}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
