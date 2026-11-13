# ADR-006 — Deterministic Telugu shaping, pagination, and PDF

**Status:** Proposed; canonical PDF renderer not yet selected  
**Date:** 13 November 2026

## Context

Professional screenplay output requires deterministic line and page breaks, Telugu Indic shaping, mixed-script fallback, embedded licensed fonts, stable presets, selectable/searchable/copyable Unicode, and equivalent results across web, Android, iOS, and server exports.

The spike proved:

- HarfBuzz and Noto Sans Telugu apply the `tel2` OpenType shaping model.
- Mixed Telugu/English needs explicit font fallback segmentation.
- Identical pinned shaping inputs produce identical glyph manifests.
- A deterministic page-manifest model can enforce a cue/dialogue keep-together rule.
- Chromium print-to-PDF is visually correct in the baseline but fails exact Unicode extraction for some Telugu combining sequences.

## Proposed decision

Adopt a pinned shaping/font layer that produces a versioned glyph/line/layout manifest. Use that manifest as the input boundary for server and offline-capable renderers. Treat shaping, line breaking, pagination, drawing, and PDF Unicode mapping as separate tested stages.

Reject browser print-to-PDF as the canonical export engine. It may remain a visual comparison or emergency preview only.

The final PDF writer remains undecided until one candidate passes both:

1. Pixel/geometry goldens using the canonical manifest.
2. Exact Unicode extraction, search, and copy/paste roundtrips with embedded/subset fonts.

## Required acceptance evidence

- Approved page sizes, margins, presets, font set, and licenses.
- Unicode line breaking and mixed-script run segmentation.
- Dialogue/character keep-together, continuations, explicit breaks, and scene-number behavior.
- Identical corpus results across server, web, Android, and iOS within the approved tolerance.
- No missing glyph, clipping, overlap, or unexpected font substitution.
- Exact extraction of the Telugu golden corpus and mixed English text.
- Deterministic output hash or documented metadata-normalized comparison strategy.

## Consequences

- Layout manifests include renderer, font, schema, and preset versions.
- Export jobs retain enough provenance to reproduce a document.
- Renderer/font upgrades require a migration and golden-baseline review.
