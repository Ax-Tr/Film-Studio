'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useEditor, EditorContent } from '@tiptap/react';
import type { DocumentResource } from '@film-studio/contracts';
import {
  CompositionTracker,
  createBlockId,
  createScreenplayExtensions,
  extractSceneNavigation,
  History,
  LocalTransactionalSaveAdapter,
  nodeNameByType,
  screenplayBlockTypes,
  ScreenplayKeyboardTransitions,
  typeByNodeName,
  type SceneNavigationItem,
  type ScreenplayBlockJson,
  type ScreenplayBlockType,
} from '@film-studio/editor-bridge';
import { useLocale, useOffline } from '../../../../providers';

interface EditorPageProps {
  readonly params: Promise<{
    readonly filmId: string;
    readonly documentId: string;
  }>;
}

export default function ScreenplayEditorPage(props: EditorPageProps) {
  const { filmId, documentId } = use(props.params);
  const { t } = useLocale();
  const { isOffline } = useOffline();

  const [doc, setDoc] = useState<DocumentResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [scenes, setScenes] = useState<readonly SceneNavigationItem[]>([]);
  const [totalWords, setTotalWords] = useState(0);
  const [isImeComposing, setIsImeComposing] = useState(false);
  const [crashRecovered, setCrashRecovered] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportWatermark, setExportWatermark] = useState('CONFIDENTIAL');
  const [exporting, setExporting] = useState(false);

  const saveAdapter = useMemo(
    () => new LocalTransactionalSaveAdapter(documentId),
    [documentId],
  );

  const compositionTracker = useMemo(() => new CompositionTracker(), []);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  // Initial Content: check local draft first for crash recovery, else default Telugu/English screenplay block
  const initialContent = useMemo((): { type: 'doc'; content: ScreenplayBlockJson[] } => {
    const draft = saveAdapter.getDraft();
    if (draft && draft.content.length > 0) {
      setCrashRecovered(true);
      return {
        type: 'doc',
        content: draft.content as ScreenplayBlockJson[],
      };
    }

    const firstBlockId = createBlockId();
    const secondBlockId = createBlockId();
    return {
      type: 'doc',
      content: [
        {
          type: 'sceneHeading',
          attrs: {
            blockId: firstBlockId,
            blockType: 'scene_heading',
            sceneId: firstBlockId,
            sceneNumber: 1,
          },
          content: [{ type: 'text', text: 'INT. ప్రధాన వేదిక — పగలు' }],
        },
        {
          type: 'action',
          attrs: {
            blockId: secondBlockId,
            blockType: 'action',
          },
          content: [{ type: 'text', text: 'కెమెరా ప్రారంభమవుతుంది.' }],
        },
      ],
    };
  }, [saveAdapter]);

  const editor = useEditor({
    extensions: [
      ...createScreenplayExtensions(),
      History.configure({ depth: 100 }),
      ScreenplayKeyboardTransitions.configure({
        isComposing: () => compositionTracker.isComposing,
      }),
    ],
    content: initialContent as unknown as ScreenplayBlockJson[],
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      setSaveStatus('dirty');
      const json = ed.getJSON();
      const blocks = (json.content ?? []) as unknown as ScreenplayBlockJson[];

      // Extract scenes and word counts
      const nav = extractSceneNavigation(blocks);
      setScenes(nav);

      let words = 0;
      for (const b of blocks) {
        const text = b.content?.map((c) => c.text).join('') ?? '';
        if (text.trim()) words += text.trim().split(/\s+/).length;
      }
      setTotalWords(words);

      // Auto-save draft locally
      saveAdapter.saveDraft(blocks, 1);
    },
  });

  // Attach IME Composition Tracker
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStart = () => setIsImeComposing(true);
    const onEnd = () => setIsImeComposing(false);

    window.addEventListener('compositionstart', onStart);
    window.addEventListener('compositionend', onEnd);
    compositionTracker.attach(window);

    return () => {
      window.removeEventListener('compositionstart', onStart);
      window.removeEventListener('compositionend', onEnd);
      compositionTracker.destroy();
    };
  }, [compositionTracker]);

  // Load document metadata from server
  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`/v1/films/${filmId}/documents/${documentId}`, {
          headers: { accept: 'application/json' },
        });
        if (res.ok) {
          const data = (await res.json()) as DocumentResource;
          setDoc(data);
        }
      } catch {
        // Ignored in offline preview
      } finally {
        setLoading(false);
      }
    }
    void fetchDoc();
  }, [filmId, documentId]);

  // Extract initial scene navigation once editor is mounted
  useEffect(() => {
    if (!editor) return;
    const json = editor.getJSON();
    const blocks = (json.content ?? []) as unknown as ScreenplayBlockJson[];
    setScenes(extractSceneNavigation(blocks));

    let words = 0;
    for (const b of blocks) {
      const text = b.content?.map((c) => c.text).join('') ?? '';
      if (text.trim()) words += text.trim().split(/\s+/).length;
    }
    setTotalWords(words);
  }, [editor]);

  // Handle Save
  const handleSave = async () => {
    if (!editor || saveStatus === 'saving') return;
    setSaveStatus('saving');

    try {
      if (doc) {
        const updateRes = await fetch(`/v1/films/${filmId}/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            operationId: createBlockId(),
            expectedVersion: doc.version,
            title: doc.title,
          }),
        });

        if (updateRes.ok) {
          const updated = (await updateRes.json()) as DocumentResource;
          setDoc(updated);
          saveAdapter.markCommitted(updated.version);
          setSaveStatus('saved');
        } else {
          setSaveStatus('dirty');
        }
      } else {
        saveAdapter.markCommitted(1);
        setSaveStatus('saved');
      }
    } catch {
      setSaveStatus('dirty');
    }
  };

  // Jump to scene
  const handleScrollToScene = (firstBlockId: string) => {
    const el = document.querySelector(`[data-block-id="${firstBlockId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Get active block type from current cursor selection
  const currentBlockType: ScreenplayBlockType = useMemo(() => {
    if (!editor) return 'action';
    const { selection } = editor.state;
    const parentNodeName = selection.$from.parent.type.name;
    return typeByNodeName[parentNodeName] ?? 'action';
  }, [editor, editor?.state.selection]);

  const handleChangeBlockType = (newType: ScreenplayBlockType) => {
    if (!editor) return;
    const nodeName = nodeNameByType[newType];
    const nodeType = editor.schema.nodes[nodeName];
    if (nodeType) {
      const { $from } = editor.state.selection;
      const tr = editor.state.tr;
      tr.setNodeMarkup($from.before(), nodeType, {
        ...$from.parent.attrs,
        blockType: newType,
      });
      editor.view.dispatch(tr);
    }
  };

  const handleExport = async (format: 'pdf' | 'fountain') => {
    try {
      setExporting(true);
      const res = await fetch(
        `/v1/films/${filmId}/documents/${documentId}/export?format=${format}&watermark=${encodeURIComponent(exportWatermark)}`,
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.title ?? 'screenplay'}.${format === 'pdf' ? 'pdf' : 'fountain'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="editor-shell" ref={editorWrapperRef}>
      {/* Top Bar */}
      <header className="editor-topbar" role="toolbar" aria-label="Editor Toolbar">
        <div className="topbar-left">
          <Link href={`/films/${filmId}`} className="topbar-back-link">
            ← {t.common.backToProjects}
          </Link>
          <span className="topbar-divider" aria-hidden="true">|</span>
          <h1 className="editor-doc-title">{doc?.title ?? t.app.title}</h1>
          <span className="document-lang-badge">{doc?.language ?? 'te'}</span>
        </div>

        <div className="topbar-center">
          <button
            type="button"
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor?.can().undo()}
            className="btn btn-ghost btn-sm"
            aria-label={t.editor.undo}
            title={t.editor.undo}
          >
            ↺ {t.editor.undo}
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor?.can().redo()}
            className="btn btn-ghost btn-sm"
            aria-label={t.editor.redo}
            title={t.editor.redo}
          >
            ↻ {t.editor.redo}
          </button>

          <span className="topbar-divider" aria-hidden="true">|</span>

          <label htmlFor="block-type-select" className="sr-only">
            {t.editor.blockType}
          </label>
          <select
            id="block-type-select"
            value={currentBlockType}
            onChange={(e) => handleChangeBlockType(e.target.value as ScreenplayBlockType)}
            className="form-select topbar-block-select"
          >
            {screenplayBlockTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="topbar-right">
          <Link
            href={`/films/${filmId}/documents/${documentId}/board`}
            className="btn btn-secondary btn-sm"
          >
            {t.sceneBoard.title}
          </Link>
          <Link
            href={`/films/${filmId}/documents/${documentId}/revisions`}
            className="btn btn-secondary btn-sm"
          >
            {t.revisions.title}
          </Link>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn btn-secondary btn-sm"
          >
            {t.importExport.exportButton}
          </button>
          <span
            className={`save-indicator status-${saveStatus === 'saved' ? 'active' : 'archived'}`}
          >
            {saveStatus === 'saved'
              ? `✓ ${t.editor.saved}`
              : saveStatus === 'saving'
                ? `⏳ ${t.editor.saving}`
                : `● ${t.editor.unsavedChanges}`}
          </span>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveStatus === 'saving'}
            className="btn btn-primary btn-sm"
          >
            {t.common.save}
          </button>
        </div>
      </header>

      {showExportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '1.75rem',
              borderRadius: '8px',
              maxWidth: '450px',
              width: '90%',
            }}
          >
            <h2 id="export-modal-title" style={{ marginTop: 0, fontSize: '1.25rem' }}>
              {t.importExport.exportTitle}
            </h2>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="export-watermark"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  marginBottom: '0.5rem',
                  fontSize: '0.9rem',
                }}
              >
                {t.importExport.watermarkPlaceholder}
              </label>
              <input
                id="export-watermark"
                type="text"
                value={exportWatermark}
                onChange={(e) => setExportWatermark(e.target.value)}
                placeholder="CONFIDENTIAL"
                className="form-input"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e0',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => void handleExport('pdf')}
                disabled={exporting}
                className="btn btn-primary"
                style={{ width: '100%', padding: '0.65rem' }}
              >
                {exporting ? '...' : `📄 ${t.importExport.exportPdf}`}
              </button>
              <button
                type="button"
                onClick={() => void handleExport('fountain')}
                disabled={exporting}
                className="btn btn-secondary"
                style={{ width: '100%', padding: '0.65rem' }}
              >
                {exporting ? '...' : `🖋️ ${t.importExport.exportFountain}`}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="btn btn-ghost btn-sm"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {crashRecovered && (
        <aside role="status" aria-live="polite" className="crash-recover-banner">
          <span>🛡️ {t.editor.crashRecovered}</span>
          <button
            type="button"
            onClick={() => setCrashRecovered(false)}
            className="btn btn-ghost btn-sm"
            aria-label={t.common.close}
          >
            ✕
          </button>
        </aside>
      )}

      {/* Main Workspace Area: Sidebar + Canvas */}
      <div className="editor-main-area">
        {/* Scene Navigator Sidebar */}
        <nav
          className="scene-navigator-panel"
          aria-label={t.editor.sceneNavigator}
        >
          <div className="navigator-header">
            <h2>{t.editor.sceneNavigator}</h2>
            <span className="badge">{scenes.length}</span>
          </div>

          <ul className="scene-list">
            {scenes.map((scene) => (
              <li key={scene.sceneId} className="scene-item">
                <button
                  type="button"
                  onClick={() => handleScrollToScene(scene.firstBlockId)}
                  className="scene-btn"
                >
                  <span className="scene-number">{scene.sceneNumber}.</span>
                  <span className="scene-heading-text">{scene.heading}</span>
                  <span className="scene-meta">{scene.wordCount}w</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Screenplay Document Canvas */}
        <main
          id="editor-canvas-container"
          role="region"
          aria-label="Screenplay Document"
          className="editor-canvas-container"
        >
          <div className="screenplay-page">
            {loading ? (
              <div className="loading-state" aria-busy="true">
                <span className="spinner" aria-hidden="true" />
                <p>{t.common.loading}</p>
              </div>
            ) : (
              <EditorContent editor={editor} className="screenplay-content" />
            )}
          </div>
        </main>
      </div>

      {/* Bottom Status Bar */}
      <footer className="editor-statusbar" role="status">
        <div className="statusbar-left">
          <span>{scenes.length} {t.editor.totalScenes}</span>
          <span className="statusbar-divider" aria-hidden="true">•</span>
          <span>{totalWords} {t.editor.totalWords}</span>
        </div>
        <div className="statusbar-right">
          {isImeComposing && (
            <span className="ime-badge">⌨️ Telugu IME Active</span>
          )}
          {isOffline && (
            <span className="offline-badge">⚡ Offline Mode</span>
          )}
        </div>
      </footer>
    </div>
  );
}
