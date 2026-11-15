import { describe, expect, it } from 'vitest';
import {
  calculateSafeCompactionFloor,
  decodeSyncCursor,
  encodeSyncCursor,
  evaluateFieldConflict,
  nextSyncState,
} from '../src/index.js';

describe('sync-core state machine & algorithms', () => {
  it('transitions sync states according to protocol events', () => {
    expect(nextSyncState('local-only', 'send')).toBe('sending');
    expect(nextSyncState('sending', 'ack')).toBe('synced');
    expect(nextSyncState('sending', 'conflict')).toBe('conflicted');
    expect(nextSyncState('sending', 'deny')).toBe('blocked');
    expect(nextSyncState('synced', 'edit')).toBe('queued');
    expect(nextSyncState('conflicted', 'retry')).toBe('queued');
  });

  it('evaluates field-level conflicts properly', () => {
    // Stale base, disjoint field edited -> no conflict
    const disjoint = evaluateFieldConflict({
      baseVersion: 1,
      currentVersion: 2,
      fieldVersions: { title: 2, summary: 1 },
      currentFields: { title: 'New Title', summary: 'Original Summary' },
      patchPayload: { summary: 'Updated Summary' },
    });
    expect(disjoint.hasConflict).toBe(false);
    expect(disjoint.conflictingFields).toHaveLength(0);

    // Stale base, same field edited to different value -> conflict
    const conflicting = evaluateFieldConflict({
      baseVersion: 1,
      currentVersion: 2,
      fieldVersions: { title: 2, summary: 1 },
      currentFields: { title: 'Server Title', summary: 'Original Summary' },
      patchPayload: { title: 'Client Title' },
    });
    expect(conflicting.hasConflict).toBe(true);
    expect(conflicting.conflictingFields).toEqual(['title']);

    // Stale base, same field edited to identical value -> no conflict
    const identical = evaluateFieldConflict({
      baseVersion: 1,
      currentVersion: 2,
      fieldVersions: { title: 2 },
      currentFields: { title: 'Identical Title' },
      patchPayload: { title: 'Identical Title' },
    });
    expect(identical.hasConflict).toBe(false);
  });

  it('encodes and decodes opaque sync cursors', () => {
    const original = {
      filmId: '018f4ce4-b3df-75c9-8d26-424bb512c0cf',
      revision: 42,
      issuedAt: '2026-11-13T18:00:00.000Z',
    };
    const token = encodeSyncCursor(original);
    expect(typeof token).toBe('string');
    const decoded = decodeSyncCursor(token);
    expect(decoded).toEqual(original);

    expect(decodeSyncCursor('not-a-valid-cursor')).toBeNull();
  });

  it('calculates safe compaction floor preventing active device stranding', () => {
    // Current rev is 100, active devices at [80, 90]
    expect(calculateSafeCompactionFloor([80, 90], 100, 75)).toBe(75);
    expect(calculateSafeCompactionFloor([80, 90], 100, 80)).toBe(80);

    // Floor above min active device ack throws error
    expect(() => calculateSafeCompactionFloor([80, 90], 100, 85)).toThrow(
      'Compaction would strand an active device',
    );
  });
});

