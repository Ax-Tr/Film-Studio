import { describe, expect, it } from 'vitest'
import { SyncReferenceModel, type PatchOperation } from '../src/sync-reference.js'

function operation(overrides: Partial<PatchOperation> = {}): PatchOperation {
  return {
    opId: 'op-1',
    filmId: 'film-1',
    actorUserId: 'user-1',
    deviceId: 'device-1',
    clientSequence: 1,
    entityId: 'scene-1',
    kind: 'entity.patch',
    baseVersion: 1,
    payload: { timeOfDay: 'NIGHT' },
    ...overrides,
  }
}

function model(): SyncReferenceModel {
  const result = new SyncReferenceModel()
  result.setMembership('film-1', 'user-1', true)
  result.seedEntity('film-1', 'scene-1', { timeOfDay: 'DAY', purpose: 'Opening' })
  return result
}

describe('authoritative structured sync reference model', () => {
  it('makes an idempotent retry already_applied without another revision', () => {
    const sync = model()
    const first = sync.push(operation())
    const retry = sync.push(operation())

    expect(first.status).toBe('applied')
    expect(retry).toMatchObject({ status: 'already_applied', serverRevision: first.serverRevision })
    expect(sync.pull('film-1', 0)).toMatchObject({ kind: 'operations', hasMore: false })
  })

  it('merges non-overlapping stale fields but conflicts on the same changed field', () => {
    const sync = model()
    expect(sync.push(operation())).toMatchObject({ status: 'applied', entityVersion: 2 })

    expect(sync.push(operation({
      opId: 'op-2',
      deviceId: 'device-2',
      clientSequence: 1,
      payload: { purpose: 'Inciting event' },
    }))).toMatchObject({ status: 'applied', entityVersion: 3 })

    expect(sync.push(operation({
      opId: 'op-3',
      deviceId: 'device-3',
      clientSequence: 1,
      payload: { timeOfDay: 'DAWN' },
    }))).toMatchObject({ status: 'conflict', errorCode: 'SAME_FIELD_CHANGED' })
  })

  it('preserves delete-versus-offline-edit as an explicit conflict', () => {
    const sync = model()
    expect(sync.push(operation({ kind: 'entity.delete', payload: {} }))).toMatchObject({ status: 'applied' })

    expect(sync.push(operation({
      opId: 'offline-edit',
      deviceId: 'device-2',
      clientSequence: 1,
      payload: { purpose: 'Offline rewrite' },
    }))).toMatchObject({ status: 'conflict', errorCode: 'DELETE_VS_EDIT' })
  })

  it('rejects revoked membership and device sequence reuse', () => {
    const sync = model()
    sync.setMembership('film-1', 'user-1', false)
    expect(sync.push(operation())).toMatchObject({ status: 'rejected', errorCode: 'MEMBERSHIP_REVOKED' })

    sync.setMembership('film-1', 'user-1', true)
    expect(sync.push(operation({ opId: 'different-op' }))).toMatchObject({ status: 'rejected', errorCode: 'DEVICE_SEQUENCE_REUSE' })
  })

  it('does not compact beyond the slowest active device acknowledgement', () => {
    const sync = model()
    sync.push(operation())
    sync.ack('film-1', 'device-1', 1)
    sync.ack('film-1', 'device-2', 0)

    expect(() => sync.compact('film-1', 1, ['device-1', 'device-2'])).toThrow('strand an active device')
    sync.ack('film-1', 'device-2', 1)
    sync.compact('film-1', 1, ['device-1', 'device-2'])
    expect(sync.pull('film-1', 0)).toEqual({ kind: 'snapshot_required', floorRevision: 1, latestRevision: 1 })
  })

  it('pages ordered operations from a durable cursor', () => {
    const sync = model()
    sync.push(operation())
    sync.push(operation({
      opId: 'op-2',
      clientSequence: 2,
      baseVersion: 2,
      payload: { purpose: 'New purpose' },
    }))

    const firstPage = sync.pull('film-1', 0, 1)
    expect(firstPage).toMatchObject({ kind: 'operations', nextCursor: 1, hasMore: true })
    if (firstPage.kind !== 'operations') throw new Error('Expected operations')
    expect(sync.pull('film-1', firstPage.nextCursor, 1)).toMatchObject({ kind: 'operations', nextCursor: 2, hasMore: false })
  })
})
