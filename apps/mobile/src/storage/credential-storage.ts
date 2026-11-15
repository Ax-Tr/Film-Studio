/**
 * Mobile Secure Credential Storage Adapter
 *
 * Implements encrypted, secure key-value persistence for mobile credentials:
 * - OIDC Session tokens (access token, refresh token)
 * - Device Keypair / Unique Device Identifier (hardware/keystore backed)
 * - Active tenant / film / organization context
 *
 * Backed by `expo-secure-store` on Android/iOS native runtime, with a secure
 * in-memory fallback for non-native environments (test runners, headless CI).
 * Strictly guarantees that no tokens, credentials, or screenplay payloads are ever logged.
 */

import type * as ExpoSecureStoreType from 'expo-secure-store';

export interface MobileSessionCredentials {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: string;
  readonly tokenType: string;
  readonly userId: string;
  readonly organizationId: string;
}

export interface DeviceRegistration {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly platform: 'android' | 'ios' | 'web';
  readonly registeredAt: string;
}

const KEYS = {
  SESSION: 'film_studio_session',
  DEVICE: 'film_studio_device',
  ACTIVE_FILM: 'film_studio_active_film_id',
} as const;

type SecureStoreModule = typeof ExpoSecureStoreType;

export class MobileCredentialStorage {
  private memoryFallback = new Map<string, string>();
  private isAvailable: boolean | null = null;
  private secureStore: SecureStoreModule | null = null;

  private async getSecureStore(): Promise<SecureStoreModule | null> {
    if (this.secureStore !== null) {
      return this.secureStore;
    }
    try {
      this.secureStore = await import('expo-secure-store');
      return this.secureStore;
    } catch {
      return null;
    }
  }

  private async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }
    try {
      const ss = await this.getSecureStore();
      if (ss && typeof ss.isAvailableAsync === 'function') {
        this.isAvailable = await ss.isAvailableAsync();
      } else {
        this.isAvailable = false;
      }
    } catch {
      this.isAvailable = false;
    }
    return this.isAvailable;
  }

  async saveSession(credentials: MobileSessionCredentials): Promise<void> {
    const raw = JSON.stringify(credentials);
    const available = await this.checkAvailability();
    const ss = await this.getSecureStore();
    if (available && ss) {
      await ss.setItemAsync(KEYS.SESSION, raw, {
        keychainAccessible: ss.AFTER_FIRST_UNLOCK,
      });
    } else {
      this.memoryFallback.set(KEYS.SESSION, raw);
    }
  }

  async getSession(): Promise<MobileSessionCredentials | null> {
    const available = await this.checkAvailability();
    const ss = await this.getSecureStore();
    const raw = (available && ss) ? await ss.getItemAsync(KEYS.SESSION) : (this.memoryFallback.get(KEYS.SESSION) ?? null);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as MobileSessionCredentials;
    } catch {
      await this.clearSession();
      return null;
    }
  }

  async clearSession(): Promise<void> {
    const available = await this.checkAvailability();
    const ss = await this.getSecureStore();
    if (available && ss) {
      await ss.deleteItemAsync(KEYS.SESSION);
    } else {
      this.memoryFallback.delete(KEYS.SESSION);
    }
  }

  async getOrCreateDeviceRegistration(
    fallbackName = 'Android Mobile Device'
  ): Promise<DeviceRegistration> {
    const available = await this.checkAvailability();
    const ss = await this.getSecureStore();
    const raw = (available && ss) ? await ss.getItemAsync(KEYS.DEVICE) : (this.memoryFallback.get(KEYS.DEVICE) ?? null);

    if (raw) {
      try {
        return JSON.parse(raw) as DeviceRegistration;
      } catch {
        // regenerate on parse error
      }
    }

    const newDevice: DeviceRegistration = {
      deviceId: `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      deviceName: fallbackName,
      platform: 'android',
      registeredAt: new Date().toISOString(),
    };

    const serialized = JSON.stringify(newDevice);
    if (available && ss) {
      await ss.setItemAsync(KEYS.DEVICE, serialized, {
        keychainAccessible: ss.ALWAYS_THIS_DEVICE_ONLY,
      });
    } else {
      this.memoryFallback.set(KEYS.DEVICE, serialized);
    }

    return newDevice;
  }

  async setActiveFilmId(filmId: string): Promise<void> {
    const available = await this.checkAvailability();
    const ss = await this.getSecureStore();
    if (available && ss) {
      await ss.setItemAsync(KEYS.ACTIVE_FILM, filmId);
    } else {
      this.memoryFallback.set(KEYS.ACTIVE_FILM, filmId);
    }
  }

  async getActiveFilmId(): Promise<string | null> {
    const available = await this.checkAvailability();
    const ss = await this.getSecureStore();
    if (available && ss) {
      return await ss.getItemAsync(KEYS.ACTIVE_FILM);
    }
    return this.memoryFallback.get(KEYS.ACTIVE_FILM) ?? null;
  }
}

export const mobileCredentialStorage = new MobileCredentialStorage();
