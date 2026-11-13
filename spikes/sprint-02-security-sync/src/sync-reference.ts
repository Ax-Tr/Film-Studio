export type SyncStatus = 'applied' | 'already_applied' | 'conflict' | 'rejected'

export interface PatchOperation {
  opId: string
  filmId: string
  actorUserId: string
  deviceId: string
  clientSequence: number
  entityId: string
  kind: 'entity.patch' | 'entity.delete' | 'scene.crdt.update'
  baseVersion: number | null
  payload: Record<string, unknown>
}

export interface SyncResult {
  opId: string
  status: SyncStatus
  serverRevision?: number
  entityVersion?: number
  conflictId?: string
  errorCode?: string
}

interface StoredEntity {
  version: number
  fields: Record<string, unknown>
  fieldVersions: Record<string, number>
  deleted: boolean
}

interface AcceptedOperation extends PatchOperation {
  serverRevision: number
}

interface FilmState {
  revision: number
  compactionFloor: number
  operations: AcceptedOperation[]
}

export class SyncReferenceModel {
  readonly #members = new Map<string, boolean>()
  readonly #entities = new Map<string, StoredEntity>()
  readonly #films = new Map<string, FilmState>()
  readonly #results = new Map<string, SyncResult>()
  readonly #deviceSequences = new Map<string, string>()
  readonly #acks = new Map<string, number>()

  setMembership(filmId: string, userId: string, active: boolean): void {
    this.#members.set(`${filmId}:${userId}`, active)
  }

  seedEntity(filmId: string, entityId: string, fields: Record<string, unknown>): void {
    this.#entities.set(`${filmId}:${entityId}`, {
      version: 1,
      fields: structuredClone(fields),
      fieldVersions: Object.fromEntries(Object.keys(fields).map((key) => [key, 1])),
      deleted: false,
    })
    this.#film(filmId)
  }

  entity(filmId: string, entityId: string): Readonly<StoredEntity> | undefined {
    const value = this.#entities.get(`${filmId}:${entityId}`)
    return value ? structuredClone(value) : undefined
  }

  push(operation: PatchOperation): SyncResult {
    const prior = this.#results.get(operation.opId)
    if (prior) return { ...prior, status: prior.status === 'applied' ? 'already_applied' : prior.status }

    const sequenceKey = `${operation.deviceId}:${operation.clientSequence}`
    const priorSequenceOp = this.#deviceSequences.get(sequenceKey)
    if (priorSequenceOp && priorSequenceOp !== operation.opId) {
      return this.#remember(operation.opId, { opId: operation.opId, status: 'rejected', errorCode: 'DEVICE_SEQUENCE_REUSE' })
    }
    this.#deviceSequences.set(sequenceKey, operation.opId)

    if (!this.#members.get(`${operation.filmId}:${operation.actorUserId}`)) {
      return this.#remember(operation.opId, { opId: operation.opId, status: 'rejected', errorCode: 'MEMBERSHIP_REVOKED' })
    }

    const entityKey = `${operation.filmId}:${operation.entityId}`
    const entity = this.#entities.get(entityKey)
    if (!entity) {
      return this.#remember(operation.opId, { opId: operation.opId, status: 'rejected', errorCode: 'ENTITY_NOT_FOUND' })
    }

    if (operation.baseVersion !== null && operation.baseVersion > entity.version) {
      return this.#remember(operation.opId, { opId: operation.opId, status: 'rejected', errorCode: 'FUTURE_BASE_VERSION' })
    }

    if (entity.deleted && operation.kind !== 'entity.delete') {
      return this.#conflict(operation, 'DELETE_VS_EDIT')
    }

    if (operation.kind === 'entity.patch') {
      const baseVersion = operation.baseVersion ?? 0
      const conflictingFields = Object.keys(operation.payload).filter(
        (field) => (entity.fieldVersions[field] ?? 0) > baseVersion
          && entity.fields[field] !== operation.payload[field],
      )
      if (conflictingFields.length > 0) return this.#conflict(operation, 'SAME_FIELD_CHANGED')
    }

    entity.version += 1
    if (operation.kind === 'entity.delete') entity.deleted = true
    if (operation.kind === 'entity.patch') {
      for (const [field, value] of Object.entries(operation.payload)) {
        entity.fields[field] = structuredClone(value)
        entity.fieldVersions[field] = entity.version
      }
    }

    const film = this.#film(operation.filmId)
    film.revision += 1
    film.operations.push({ ...structuredClone(operation), serverRevision: film.revision })
    return this.#remember(operation.opId, {
      opId: operation.opId,
      status: 'applied',
      serverRevision: film.revision,
      entityVersion: entity.version,
    })
  }

  pull(filmId: string, cursor: number, limit = 100):
    | { kind: 'operations'; operations: AcceptedOperation[]; nextCursor: number; hasMore: boolean }
    | { kind: 'snapshot_required'; floorRevision: number; latestRevision: number } {
    const film = this.#film(filmId)
    if (cursor < film.compactionFloor) {
      return { kind: 'snapshot_required', floorRevision: film.compactionFloor, latestRevision: film.revision }
    }
    const available = film.operations.filter((operation) => operation.serverRevision > cursor)
    const operations = available.slice(0, limit)
    return {
      kind: 'operations',
      operations: structuredClone(operations),
      nextCursor: operations.at(-1)?.serverRevision ?? cursor,
      hasMore: available.length > operations.length,
    }
  }

  ack(filmId: string, deviceId: string, serverRevision: number): void {
    const film = this.#film(filmId)
    if (serverRevision > film.revision) throw new Error('Cannot acknowledge a future revision')
    const key = `${filmId}:${deviceId}`
    this.#acks.set(key, Math.max(this.#acks.get(key) ?? 0, serverRevision))
  }

  compact(filmId: string, floorRevision: number, activeDeviceIds: string[]): void {
    const film = this.#film(filmId)
    const safeFloor = activeDeviceIds.length === 0
      ? film.revision
      : Math.min(...activeDeviceIds.map((deviceId) => this.#acks.get(`${filmId}:${deviceId}`) ?? 0))
    if (floorRevision > safeFloor) throw new Error('Compaction would strand an active device')
    film.compactionFloor = Math.max(film.compactionFloor, floorRevision)
    film.operations = film.operations.filter((operation) => operation.serverRevision > film.compactionFloor)
  }

  #film(filmId: string): FilmState {
    let state = this.#films.get(filmId)
    if (!state) {
      state = { revision: 0, compactionFloor: 0, operations: [] }
      this.#films.set(filmId, state)
    }
    return state
  }

  #remember(opId: string, result: SyncResult): SyncResult {
    this.#results.set(opId, result)
    return structuredClone(result)
  }

  #conflict(operation: PatchOperation, reason: string): SyncResult {
    return this.#remember(operation.opId, {
      opId: operation.opId,
      status: 'conflict',
      conflictId: `conflict:${operation.opId}`,
      errorCode: reason,
    })
  }
}
