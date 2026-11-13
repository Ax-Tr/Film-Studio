import { createHash } from 'node:crypto'

export interface ConsentScene {
  sceneId: string
  acceptedVersion: number
  contentSha256: string
}

export interface AiConsentManifest {
  manifestVersion: 1
  filmId: string
  userId: string
  providerConfigId: string
  provider: string
  model: string
  taskType: string
  scenes: ConsentScene[]
  maximumCostMinor: number
  currency: string
  noticeVersion: string
  approvedAt: string
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    )
  }
  return value
}

export function consentManifestSha256(manifest: AiConsentManifest): string {
  const canonical = JSON.stringify(canonicalize(manifest))
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function verifyConsentManifest(input: {
  approvedManifest: AiConsentManifest
  approvedHash: string
  executionManifest: AiConsentManifest
}): boolean {
  return consentManifestSha256(input.approvedManifest) === input.approvedHash
    && consentManifestSha256(input.executionManifest) === input.approvedHash
}
