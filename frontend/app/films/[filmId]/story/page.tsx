'use client';

import { use, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type {
  StoryDevelopmentOverviewDto,
  StoryThreadDto,
  StoryBeatDto,
  NarrativeStructureType,
} from '@film-studio/contracts';

interface StoryStudioPageProps {
  readonly params: Promise<{
    readonly filmId: string;
  }>;
}

const NARRATIVE_STRUCTURES: { readonly key: NarrativeStructureType; readonly label: string }[] = [
  { key: 'three_act', label: 'Three-Act Structure (Classical)' },
  { key: 'hero_journey', label: "The Hero's Journey (Monomyth)" },
  { key: 'save_the_cat', label: 'Save the Cat (Blake Snyder)' },
  { key: 'dan_harmon_circle', label: 'Story Circle (Dan Harmon)' },
  { key: 'seven_point', label: 'Seven-Point Story Structure' },
  { key: 'freytag_pyramid', label: "Freytag's Dramatic Pyramid" },
  { key: 'custom', label: 'Custom Framework' },
];

export default function StoryStudioPage({ params }: StoryStudioPageProps) {
  const { filmId } = use(params);

  const [activeTab, setActiveTab] = useState<'bible' | 'beats' | 'threads' | 'timeline'>('bible');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<StoryDevelopmentOverviewDto>({
    bible: {
      filmId,
      premise: '',
      theme: '',
      dramaticQuestion: '',
      narrativeStructure: 'three_act',
      logline: '',
      shortSynopsis: '',
      longSynopsis: '',
      treatment: '',
      worldBuildingRules: {},
    },
    threads: [],
    beats: [],
  });

  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadColor, setNewThreadColor] = useState('#f3b74f');
  const [newThreadType, setNewThreadType] = useState<StoryThreadDto['threadType']>('plot');

  const [newBeatTitle, setNewBeatTitle] = useState('');
  const [newBeatAct, setNewBeatAct] = useState<number>(1);
  const [newBeatMinute, setNewBeatMinute] = useState<number>(10);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');

  useEffect(() => {
    // Initial client simulation & fetch
    setLoading(false);
  }, [filmId]);

  const handleSaveBible = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
    }, 400);
  };

  const handleAddThread = (e: FormEvent) => {
    e.preventDefault();
    if (!newThreadTitle.trim()) return;

    const newThread: StoryThreadDto = {
      id: `th_${Date.now()}`,
      filmId,
      title: newThreadTitle.trim(),
      colorHex: newThreadColor,
      threadType: newThreadType,
      sortOrder: overview.threads.length + 1,
    };

    setOverview((prev) => ({
      ...prev,
      threads: [...prev.threads, newThread],
    }));
    setNewThreadTitle('');
  };

  const handleAddBeat = (e: FormEvent) => {
    e.preventDefault();
    if (!newBeatTitle.trim()) return;

    const newBeat: StoryBeatDto = {
      id: `bt_${Date.now()}`,
      filmId,
      threadId: selectedThreadId || null,
      act: newBeatAct,
      title: newBeatTitle.trim(),
      beatType: 'beat',
      timingMinute: newBeatMinute,
      sortOrder: overview.beats.length + 1,
    };

    setOverview((prev) => ({
      ...prev,
      beats: [...prev.beats, newBeat],
    }));
    setNewBeatTitle('');
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', color: '#94a3b8' }}>
        Loading Story Development Studio...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <Link href={`/films/${filmId}`} style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to Film Overview
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f5f7fb', marginTop: '0.5rem' }}>
            Story Development Studio
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Story Bible, Structural Beats, Narrative Threads & Chronological Timelines
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveBible}
          disabled={saving}
          style={{
            backgroundColor: '#f3b74f',
            color: '#0b0e14',
            border: 'none',
            borderRadius: '6px',
            padding: '0.625rem 1.25rem',
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Story Bible'}
        </button>
      </header>

      {/* Tabs */}
      <nav style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid #1f2937', marginBottom: '2rem' }}>
        {(['bible', 'beats', 'threads', 'timeline'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #f3b74f' : '2px solid transparent',
              color: activeTab === tab ? '#f5f7fb' : '#94a3b8',
              fontWeight: activeTab === tab ? 600 : 400,
              padding: '0.75rem 1.25rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'bible' ? 'Story Bible & Premise' : tab === 'beats' ? 'Beat Board (Structure)' : tab === 'threads' ? 'Plot Threads' : 'Timeline Projection'}
          </button>
        ))}
      </nav>

      {/* Bible Tab */}
      {activeTab === 'bible' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label htmlFor="logline" style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                Logline (The Core Hook)
              </label>
              <textarea
                id="logline"
                value={overview.bible?.logline ?? ''}
                onChange={(e) => setOverview((prev) => ({
                  ...prev,
                  bible: prev.bible ? { ...prev.bible, logline: e.target.value } : null,
                }))}
                rows={2}
                placeholder="A compelling one-sentence hook defining protagonist, goal, obstacle, and stakes..."
                style={{
                  width: '100%',
                  backgroundColor: '#151a23',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f5f7fb',
                  padding: '0.75rem',
                  fontSize: '0.925rem',
                }}
              />
            </div>

            <div>
              <label htmlFor="dramaticQuestion" style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                Central Dramatic Question
              </label>
              <input
                id="dramaticQuestion"
                type="text"
                value={overview.bible?.dramaticQuestion ?? ''}
                onChange={(e) => setOverview((prev) => ({
                  ...prev,
                  bible: prev.bible ? { ...prev.bible, dramaticQuestion: e.target.value } : null,
                }))}
                placeholder="e.g. Can the disgraced commander reclaim his honor before the empire falls?"
                style={{
                  width: '100%',
                  backgroundColor: '#151a23',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f5f7fb',
                  padding: '0.75rem',
                  fontSize: '0.925rem',
                }}
              />
            </div>

            <div>
              <label htmlFor="premise" style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                Premise & Core Conflict
              </label>
              <textarea
                id="premise"
                value={overview.bible?.premise ?? ''}
                onChange={(e) => setOverview((prev) => ({
                  ...prev,
                  bible: prev.bible ? { ...prev.bible, premise: e.target.value } : null,
                }))}
                rows={4}
                placeholder="Explore the dramatic foundation and inciting crisis..."
                style={{
                  width: '100%',
                  backgroundColor: '#151a23',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f5f7fb',
                  padding: '0.75rem',
                  fontSize: '0.925rem',
                }}
              />
            </div>

            <div>
              <label htmlFor="shortSynopsis" style={{ display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                Short Synopsis (One-Pager)
              </label>
              <textarea
                id="shortSynopsis"
                value={overview.bible?.shortSynopsis ?? ''}
                onChange={(e) => setOverview((prev) => ({
                  ...prev,
                  bible: prev.bible ? { ...prev.bible, shortSynopsis: e.target.value } : null,
                }))}
                rows={6}
                placeholder="Detailed progression of Act 1, Act 2 midpoint turnaround, and Act 3 climax..."
                style={{
                  width: '100%',
                  backgroundColor: '#151a23',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f5f7fb',
                  padding: '0.75rem',
                  fontSize: '0.925rem',
                }}
              />
            </div>
          </section>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ backgroundColor: '#151a23', padding: '1.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <label htmlFor="narrativeStructure" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f5f7fb', marginBottom: '0.75rem' }}>
                Narrative Architecture
              </label>
              <select
                id="narrativeStructure"
                value={overview.bible?.narrativeStructure ?? 'three_act'}
                onChange={(e) => setOverview((prev) => ({
                  ...prev,
                  bible: prev.bible ? { ...prev.bible, narrativeStructure: e.target.value as NarrativeStructureType } : null,
                }))}
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  color: '#f5f7fb',
                  padding: '0.625rem',
                  fontSize: '0.875rem',
                }}
              >
                {NARRATIVE_STRUCTURES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem', lineHeight: 1.4 }}>
                Selected narrative model dictates default act divisions and pacing beat suggestions on the timeline.
              </p>
            </div>

            <div style={{ backgroundColor: '#151a23', padding: '1.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <label htmlFor="theme" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#f5f7fb', marginBottom: '0.5rem' }}>
                Thematic Core
              </label>
              <input
                id="theme"
                type="text"
                value={overview.bible?.theme ?? ''}
                onChange={(e) => setOverview((prev) => ({
                  ...prev,
                  bible: prev.bible ? { ...prev.bible, theme: e.target.value } : null,
                }))}
                placeholder="e.g. Duty vs Ambition; Sacrifice"
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Beats Tab */}
      {activeTab === 'beats' && (
        <div>
          <form onSubmit={handleAddBeat} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-end', backgroundColor: '#151a23', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ flex: 2 }}>
              <label htmlFor="newBeatTitle" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Beat Title
              </label>
              <input
                id="newBeatTitle"
                type="text"
                value={newBeatTitle}
                onChange={(e) => setNewBeatTitle(e.target.value)}
                placeholder="e.g. Inciting Incident, Midpoint Turnaround..."
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label htmlFor="newBeatAct" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Act
              </label>
              <select
                id="newBeatAct"
                value={newBeatAct}
                onChange={(e) => setNewBeatAct(Number(e.target.value))}
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                }}
              >
                <option value={1}>Act 1 (Setup)</option>
                <option value={2}>Act 2 (Confrontation)</option>
                <option value={3}>Act 3 (Resolution)</option>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label htmlFor="newBeatMinute" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Target Minute
              </label>
              <input
                id="newBeatMinute"
                type="number"
                min={0}
                value={newBeatMinute}
                onChange={(e) => setNewBeatMinute(Number(e.target.value))}
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                }}
              />
            </div>

            <div style={{ flex: 1.5 }}>
              <label htmlFor="selectedThreadId" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Associated Plot Thread
              </label>
              <select
                id="selectedThreadId"
                value={selectedThreadId}
                onChange={(e) => setSelectedThreadId(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                }}
              >
                <option value="">(None / General)</option>
                {overview.threads.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              style={{
                backgroundColor: '#38bdf8',
                color: '#0b0e14',
                border: 'none',
                borderRadius: '4px',
                padding: '0.5rem 1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add Beat
            </button>
          </form>

          {/* Beat Cards grouped by Act */}
          {[1, 2, 3].map((actNumber) => {
            const actBeats = overview.beats.filter((b) => b.act === actNumber);
            return (
              <div key={actNumber} style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f5f7fb', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                  Act {actNumber} {actNumber === 1 ? '— Setup & Inciting Incident' : actNumber === 2 ? '— Confrontation & Midpoint' : '— Climax & Resolution'}
                </h2>
                {actBeats.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No beats defined for Act {actNumber} yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {actBeats.map((beat) => {
                      const thread = overview.threads.find((t) => t.id === beat.threadId);
                      return (
                        <div
                          key={beat.id}
                          style={{
                            backgroundColor: '#151a23',
                            border: '1px solid #334155',
                            borderLeft: `4px solid ${thread?.colorHex ?? '#f3b74f'}`,
                            borderRadius: '6px',
                            padding: '1rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                              Min ~{beat.timingMinute ?? 0}
                            </span>
                            {thread && (
                              <span style={{ fontSize: '0.75rem', color: thread.colorHex, fontWeight: 500 }}>
                                {thread.title}
                              </span>
                            )}
                          </div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f5f7fb', margin: '0.5rem 0' }}>
                            {beat.title}
                          </h3>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Threads Tab */}
      {activeTab === 'threads' && (
        <div>
          <form onSubmit={handleAddThread} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-end', backgroundColor: '#151a23', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
            <div style={{ flex: 2 }}>
              <label htmlFor="newThreadTitle" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Thread / Plotline Title
              </label>
              <input
                id="newThreadTitle"
                type="text"
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                placeholder="e.g. Main Quest, Romantic Subplot, Mentorship..."
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label htmlFor="newThreadType" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Category
              </label>
              <select
                id="newThreadType"
                value={newThreadType}
                onChange={(e) => setNewThreadType(e.target.value as StoryThreadDto['threadType'])}
                style={{
                  width: '100%',
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f5f7fb',
                  padding: '0.5rem',
                }}
              >
                <option value="plot">Main Plot (A-Story)</option>
                <option value="character_arc">Character Arc</option>
                <option value="relationship">Relationship (B-Story)</option>
                <option value="theme">Thematic Subplot</option>
                <option value="mystery">Mystery / Reveal</option>
              </select>
            </div>

            <div>
              <label htmlFor="newThreadColor" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Color
              </label>
              <input
                id="newThreadColor"
                type="color"
                value={newThreadColor}
                onChange={(e) => setNewThreadColor(e.target.value)}
                style={{
                  backgroundColor: '#0b0e14',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  width: '40px',
                  height: '36px',
                  cursor: 'pointer',
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                backgroundColor: '#38bdf8',
                color: '#0b0e14',
                border: 'none',
                borderRadius: '4px',
                padding: '0.5rem 1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Add Thread
            </button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {overview.threads.length === 0 ? (
              <p style={{ color: '#64748b' }}>No plot threads created yet.</p>
            ) : (
              overview.threads.map((t) => (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: '#151a23',
                    border: '1px solid #334155',
                    borderTop: `4px solid ${t.colorHex}`,
                    borderRadius: '6px',
                    padding: '1rem',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: t.colorHex, fontWeight: 600, textTransform: 'uppercase' }}>
                    {t.threadType.replace('_', ' ')}
                  </span>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f5f7fb', margin: '0.5rem 0' }}>
                    {t.title}
                  </h3>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div style={{ backgroundColor: '#151a23', padding: '1.5rem', borderRadius: '8px', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f5f7fb', marginBottom: '1.5rem' }}>
            Story Timeline & Thread Weave
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {overview.beats.length === 0 ? (
              <p style={{ color: '#64748b' }}>Add structure beats to view timeline progression.</p>
            ) : (
              overview.beats
                .slice()
                .sort((a, b) => (a.timingMinute ?? 0) - (b.timingMinute ?? 0))
                .map((beat) => {
                  const thread = overview.threads.find((t) => t.id === beat.threadId);
                  return (
                    <div
                      key={beat.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.75rem 1rem',
                        backgroundColor: '#0b0e14',
                        borderRadius: '6px',
                        borderLeft: `4px solid ${thread?.colorHex ?? '#f3b74f'}`,
                      }}
                    >
                      <span style={{ minWidth: '80px', fontSize: '0.875rem', fontWeight: 700, color: '#94a3b8' }}>
                        ~{beat.timingMinute ?? 0}m
                      </span>
                      <span style={{ minWidth: '60px', fontSize: '0.75rem', color: '#cbd5e1', backgroundColor: '#1e293b', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        Act {beat.act}
                      </span>
                      <span style={{ fontWeight: 600, color: '#f5f7fb', flex: 1 }}>
                        {beat.title}
                      </span>
                      {thread && (
                        <span style={{ fontSize: '0.75rem', color: thread.colorHex, fontWeight: 500 }}>
                          {thread.title}
                        </span>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
