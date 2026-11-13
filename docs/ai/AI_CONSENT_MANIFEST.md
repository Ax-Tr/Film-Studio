# STORYFORGE STUDIO — AI Consent and Execution Manifest

**Status:** S2 contract baseline  
**Date:** 13 November 2026

## 1. Rule

No provider call occurs unless the execution manifest exactly matches the manifest the user approved. Scene IDs alone are insufficient because content can change between preview and worker execution.

## 2. Manifest fields

```json
{
  "manifestVersion": 1,
  "filmId": "uuid",
  "userId": "uuid",
  "providerConfigId": "uuid",
  "provider": "provider-name",
  "model": "model-name/version",
  "taskType": "scene_coverage",
  "scenes": [
    {
      "sceneId": "uuid",
      "acceptedVersion": 12,
      "contentSha256": "64 lowercase hex characters"
    }
  ],
  "knowledgeAssets": [],
  "instructionsSha256": "hash of displayed task instructions",
  "maximumCostMinor": 250,
  "currency": "INR",
  "providerRetentionNotice": "displayed policy identifier",
  "noticeVersion": "privacy-notice-v1",
  "approvedAt": "ISO-8601"
}
```

The canonical JSON serialization is deterministic and hashed with SHA-256. Store the approved manifest and hash with consent evidence; do not store credentials in it.

## 3. Flow

1. Authorized user selects exact scenes/assets and task.
2. Server resolves current accepted versions and content hashes and estimates cost.
3. Client displays provider, model, exact selected scope, instructions summary, third-party/retention notice and maximum cost.
4. User explicitly approves the exact manifest hash.
5. Worker reauthorizes user/film/provider configuration and rebuilds execution manifest immediately before transmission.
6. Any version, content, provider, model, instruction, notice or cost change produces `AI_MANIFEST_CHANGED`; no provider call occurs.
7. Provider request/response metadata, actual usage and manifest hash are recorded with redaction.
8. Result is a proposal. Accept/reject/edit is explicit; accept creates a normal authenticated/versioned document operation.

## 4. Security and privacy

- Provider key is decrypted only in the server-side adapter process and never appears in manifest/log/client response.
- Context extractor cannot read outside authorized manifest resources.
- Tool use is deny-by-default; no autonomous network/file/document mutation.
- Prompt/knowledge content is untrusted data and cannot override platform policy.
- Cancellation/timeout prevents further processing where provider supports it; late results remain unapplied.
- Retention/deletion includes provider-side obligations and derived proposal/history records.

## 5. Tests

- Any field/content/version mutation invalidates approval.
- Wrong user/film/config/model/provider rejects.
- Cost above approved maximum rejects before provider call.
- Revoked membership/provider configuration rejects queued work.
- Retry with same idempotency key never charges twice.
- Response never mutates canonical document automatically.
- Logs/telemetry contain manifest ID/hash and outcome, not full prompt/key.

