'use client';

import { use, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import type { ImportScriptResponse } from '@film-studio/contracts';
import { useLocale } from '../../../providers';

interface ImportPageProps {
  readonly params: Promise<{
    readonly filmId: string;
  }>;
}

export default function ImportScriptPage(props: ImportPageProps) {
  const { filmId } = use(props.params);
  const { t } = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<'fountain' | 'text'>('fountain');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('te-IN');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportScriptResponse | null>(null);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setTitle(nameWithoutExt);
    }

    if (file.name.endsWith('.fountain')) {
      setFormat('fountain');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setContent(text);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    try {
      setImporting(true);
      setError(null);
      const res = await fetch(`/v1/films/${filmId}/documents/import`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          operationId: randomUUID(),
          title: title.trim(),
          format,
          content: content.trim(),
          language,
        }),
      });
      if (!res.ok) throw new Error('Failed to import script');
      const data = (await res.json()) as ImportScriptResponse;
      setImportResult(data);
      setTimeout(() => {
        router.push(`/films/${filmId}/documents/${data.documentId}`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="container import-page" style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="page-header" style={{ marginBottom: '1.5rem' }}>
        <Link
          href={`/films/${filmId}`}
          className="topbar-back-link"
          style={{ display: 'inline-block', marginBottom: '0.5rem' }}
        >
          ← {t.common.backToProjects}
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
          {t.importExport.importTitle}
        </h1>
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

      {importResult && (
        <div
          role="status"
          style={{
            padding: '1.25rem',
            backgroundColor: '#c6f6d5',
            color: '#22543d',
            borderRadius: '6px',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 700 }}>
            ✓ {t.importExport.importSuccess}
          </h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            {t.sceneBoard.title}: {importResult.sceneCount} | {t.characters.title}: {importResult.characterCount} | Lines: {importResult.totalLinesParsed}
          </p>
          {importResult.errors.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <strong>{t.importExport.parsingErrors} ({importResult.errors.length}):</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.85rem' }}>
                {importResult.errors.map((err, i) => (
                  <li key={i}>
                    Line {err.line}: {err.message} ({err.code})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label htmlFor="script-title" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
            {t.documents.documentTitle} *
          </label>
          <input
            id="script-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.documents.documentTitlePlaceholder}
            className="form-input"
            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e0' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label htmlFor="script-format" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
              {t.importExport.format}
            </label>
            <select
              id="script-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'fountain' | 'text')}
              className="form-select"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e0' }}
            >
              <option value="fountain">Fountain (.fountain)</option>
              <option value="text">Plain Text (.txt)</option>
            </select>
          </div>

          <div>
            <label htmlFor="script-language" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
              {t.documents.language}
            </label>
            <select
              id="script-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="form-select"
              style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e0' }}
            >
              <option value="te-IN">Telugu (తెలుగు)</option>
              <option value="en-US">English</option>
              <option value="hi-IN">Hindi (हिन्दी)</option>
              <option value="ta-IN">Tamil (தமிழ்)</option>
              <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
              <option value="ml-IN">Malayalam (മലയാളം)</option>
              <option value="bn-IN">Bengali (বাংলা)</option>
              <option value="mr-IN">Marathi (मराठी)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="file-upload" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
            {t.importExport.uploadFile}
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".fountain,.txt,.text"
            onChange={handleFileUpload}
            style={{ marginBottom: '0.5rem' }}
          />
        </div>

        <div>
          <label htmlFor="script-content" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
            {t.importExport.pasteScript} *
          </label>
          <textarea
            id="script-content"
            required
            rows={14}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="INT. PALACE - NIGHT&#10;&#10;BAAHUBALI&#10;నేను మాట ఇస్తున్నాను.&#10;&#10;KATAPPA&#10;మీ ఆజ్ఞ ప్రభు."
            style={{
              width: '100%',
              padding: '0.75rem',
              fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Link href={`/films/${filmId}`} className="btn btn-secondary">
            {t.common.cancel}
          </Link>
          <button
            type="submit"
            disabled={importing || !title.trim() || !content.trim()}
            className="btn btn-primary"
          >
            {importing ? '...' : t.importExport.importButton}
          </button>
        </div>
      </form>
    </main>
  );
}
