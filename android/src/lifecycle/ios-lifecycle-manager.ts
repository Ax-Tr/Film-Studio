/**
 * iOS Application Lifecycle and Background Draft Protection
 *
 * Coordinates iOS application state changes (active, background, inactive).
 * Ensures that whenever the app moves to background or transitions to inactive:
 * 1. Any pending in-memory screenplay edits are flushed to local SQLite storage.
 * 2. Uncommitted mutations are scheduled for background synchronization.
 * 3. Sensitive data buffers are wiped from volatile state.
 */

export type IosAppState = 'active' | 'background' | 'inactive';

export type IosLifecycleListener = (nextState: IosAppState, previousState: IosAppState) => Promise<void> | void;

export class IosLifecycleManager {
  private currentState: IosAppState = 'active';
  private listeners: Set<IosLifecycleListener> = new Set();
  private backgroundFlushHandlers: Set<() => Promise<void>> = new Set();

  getCurrentState(): IosAppState {
    return this.currentState;
  }

  registerListener(listener: IosLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  registerBackgroundFlushHandler(handler: () => Promise<void>): () => void {
    this.backgroundFlushHandlers.add(handler);
    return () => {
      this.backgroundFlushHandlers.delete(handler);
    };
  }

  /**
   * Invoked when iOS transitions application state (e.g. via AppState.addEventListener)
   */
  async handleStateChange(nextState: IosAppState): Promise<{ flushed: number; durationMs: number }> {
    const previousState = this.currentState;
    this.currentState = nextState;

    const start = performance.now();
    let flushedCount = 0;

    // When transitioning into background or inactive, immediately execute critical flush handlers
    if (nextState === 'background' || nextState === 'inactive') {
      for (const handler of this.backgroundFlushHandlers) {
        try {
          await handler();
          flushedCount++;
        } catch {
          // Never throw in background handlers to prevent iOS watchdog SIGKILL
        }
      }
    }

    for (const listener of this.listeners) {
      try {
        await listener(nextState, previousState);
      } catch {
        // Suppress listener error in background lifecycle dispatch
      }
    }

    return {
      flushed: flushedCount,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }
}

export const iosLifecycleManager = new IosLifecycleManager();

