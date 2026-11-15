type DomListener = (event: unknown) => void;

interface DomTarget {
  addEventListener(type: string, listener: DomListener): void;
  removeEventListener(type: string, listener: DomListener): void;
}

export class CompositionTracker {
  private _isComposing = false;
  private cleanupFn?: () => void;

  get isComposing(): boolean {
    return this._isComposing;
  }

  attach(element: DomTarget): () => void {
    const onStart: DomListener = () => {
      this._isComposing = true;
    };
    const onEnd: DomListener = () => {
      this._isComposing = false;
    };

    element.addEventListener('compositionstart', onStart);
    element.addEventListener('compositionend', onEnd);

    this.cleanupFn = () => {
      element.removeEventListener('compositionstart', onStart);
      element.removeEventListener('compositionend', onEnd);
      this._isComposing = false;
    };

    return this.cleanupFn;
  }

  destroy(): void {
    this.cleanupFn?.();
  }
}

export function normalizeTeluguText(text: string): string {
  // Normalize to Canonical Decomposition followed by Canonical Composition (NFC)
  return text.normalize('NFC');
}

export function verifyTeluguRoundtrip(original: string, processed: string): boolean {
  const normOriginal = normalizeTeluguText(original);
  const normProcessed = normalizeTeluguText(processed);

  if (normOriginal !== normProcessed) {
    return false;
  }

  // Ensure virama (U+0C4D) and vowel sign counts match
  const viramaRegex = /\u0C4D/g;
  const origViramas = (normOriginal.match(viramaRegex) || []).length;
  const procViramas = (normProcessed.match(viramaRegex) || []).length;

  return origViramas === procViramas;
}
