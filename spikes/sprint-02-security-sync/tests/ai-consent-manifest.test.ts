import { describe, expect, it } from 'vitest'
import { consentManifestSha256, verifyConsentManifest, type AiConsentManifest } from '../src/ai-consent-manifest.js'

const manifest: AiConsentManifest = {
  manifestVersion: 1,
  filmId: 'film-1',
  userId: 'user-1',
  providerConfigId: 'config-1',
  provider: 'provider-a',
  model: 'approved-model',
  taskType: 'scene_coverage',
  scenes: [
    { sceneId: 'scene-1', acceptedVersion: 12, contentSha256: 'a'.repeat(64) },
  ],
  maximumCostMinor: 250,
  currency: 'INR',
  noticeVersion: 'privacy-notice-v1',
  approvedAt: '2026-11-13T10:00:00.000Z',
}

describe('AI consent manifest integrity', () => {
  it('is deterministic for the same approved manifest', () => {
    expect(consentManifestSha256(manifest)).toBe(consentManifestSha256(structuredClone(manifest)))
  })

  it('rejects execution after scene content or version changes', () => {
    const approvedHash = consentManifestSha256(manifest)
    const changed = structuredClone(manifest)
    changed.scenes[0]!.acceptedVersion += 1

    expect(verifyConsentManifest({ approvedManifest: manifest, approvedHash, executionManifest: changed })).toBe(false)
  })

  it('rejects execution when provider/model/cost scope changes', () => {
    const approvedHash = consentManifestSha256(manifest)
    const changed = { ...manifest, model: 'different-model', maximumCostMinor: 500 }

    expect(verifyConsentManifest({ approvedManifest: manifest, approvedHash, executionManifest: changed })).toBe(false)
  })
})
