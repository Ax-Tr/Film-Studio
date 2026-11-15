'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { GlobalSearchResponseDto, SearchResultItemDto } from '@film-studio/contracts';
import { useLocale } from '../../../providers';

interface SearchPageProps {
  readonly params: Promise<{ readonly filmId: string }>;
}

export default function SearchPage(props: SearchPageProps) {
  const { filmId } = use(props.params);
  const { t } = useLocale();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'character' | 'scene' | 'dialogue'>('all');
  const [results, setResults] = useState<readonly SearchResultItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      const res = await fetch(`/v1/films/${filmId}/search?${params.toString()}`, {
        headers: {
          accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as GlobalSearchResponseDto;
        setResults(data.results);
        setSearched(true);
      }
    } catch {
      setError(t.common.error);
    } finally {
      setLoading(false);
    }
  }, [filmId, t.common.error]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void executeSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, executeSearch]);

  const filteredResults = results.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'character') return r.type === 'character';
    if (filter === 'scene') return r.type === 'scene';
    if (filter === 'dialogue') return r.type === 'dialogue';
    return true;
  });

  return (
    <div className="search-layout">
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
          <h1 className="page-title">{t.search.title}</h1>
          <p className="page-subtitle">{t.app.tagline}</p>
        </div>
      </div>

      <div className="search-input-wrapper">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search.placeholder}
          className="search-input"
          autoFocus
        />
      </div>

      <div className="search-filters-row">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`filter-chip ${filter === 'all' ? 'filter-active' : ''}`}
        >
          {t.search.allFilter}
        </button>
        <button
          type="button"
          onClick={() => setFilter('character')}
          className={`filter-chip ${filter === 'character' ? 'filter-active' : ''}`}
        >
          {t.search.characterFilter}
        </button>
        <button
          type="button"
          onClick={() => setFilter('scene')}
          className={`filter-chip ${filter === 'scene' ? 'filter-active' : ''}`}
        >
          {t.search.sceneFilter}
        </button>
        <button
          type="button"
          onClick={() => setFilter('dialogue')}
          className={`filter-chip ${filter === 'dialogue' ? 'filter-active' : ''}`}
        >
          {t.search.dialogueFilter}
        </button>
      </div>

      {error && <div className="alert-banner alert-error">{error}</div>}

      {loading && <div className="loading-state">{t.common.loading}</div>}

      {!loading && searched && filteredResults.length === 0 && (
        <div className="empty-state">
          <p className="empty-desc">{t.search.noResults}</p>
        </div>
      )}

      {!loading && filteredResults.length > 0 && (
        <div className="search-results-list">
          <p className="results-count">
            {filteredResults.length} {t.search.resultsCount}
          </p>

          {filteredResults.map((item) => (
            <div key={`${item.type}-${item.id}`} className="search-result-card">
              <div className="search-result-header">
                <span className={`result-badge badge-${item.type}`}>
                  {item.type.toUpperCase()}
                </span>
                <h3 className="result-title">{item.title}</h3>
              </div>

              <p className="result-snippet">{item.snippet}</p>

              {item.documentId && (
                <div className="result-footer">
                  <Link
                    href={`/films/${filmId}/documents/${item.documentId}`}
                    className="btn btn-secondary btn-xs"
                  >
                    Open Document →
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
